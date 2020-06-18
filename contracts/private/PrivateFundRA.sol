/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@galtproject/core/contracts/reputation/components/LiquidRA.sol";
import "@galtproject/core/contracts/reputation/interfaces/IRA.sol";
import "@galtproject/private-property-registry/contracts/abstract/interfaces/IAbstractRA.sol";
import "@galtproject/core/contracts/traits/ChargesEthFee.sol";
import "./PrivateFundStorage.sol";
import "../common/interfaces/IFundRA.sol";
import "./traits/PPTokenInputRA.sol";
import "@galtproject/private-property-registry/contracts/interfaces/IPPGlobalRegistry.sol";


contract PrivateFundRA is IAbstractRA, IFundRA, LiquidRA, PPTokenInputRA, ChargesEthFee {

  uint256 public constant VERSION = 3;

  bytes32 public constant DELEGATE_REPUTATION_FEE_KEY = bytes32("DELEGATE_REPUTATION");
  bytes32 public constant REVOKE_REPUTATION_FEE_KEY = bytes32("REVOKE_REPUTATION");

  using SafeMath for uint256;
  using ArraySet for ArraySet.AddressSet;

  event TokenMint(address indexed registry, uint256 indexed tokenId);
  event TokenBurn(address indexed registry, uint256 indexed tokenId);
  event BurnExpelled(address indexed registry, uint256 indexed tokenId, address delegate, address indexed owner, uint256 amount);

  struct Checkpoint {
    uint128 fromBlock;
    uint128 value;
  }

  IFundRegistry public fundRegistry;

  mapping(address => Checkpoint[]) internal _cachedBalances;
  Checkpoint[] internal _cachedTotalSupply;

  function onlyValidToken(address _token) internal view {
    IPPGlobalRegistry ppgr = IPPGlobalRegistry(fundRegistry.getPPGRAddress());

    IPPTokenRegistry(ppgr.getPPTokenRegistryAddress())
      .requireValidToken(_token);
  }

  function initialize(IFundRegistry _fundRegistry) external isInitializer {
    super.initializeInternal(IPPGlobalRegistry(_fundRegistry.getPPGRAddress()));
    fundRegistry = _fundRegistry;
  }

  function feeRegistry() public view returns(address) {
    return IPPGlobalRegistry(fundRegistry.getPPGRAddress()).getPPFeeRegistryAddress();
  }

  function mint(IAbstractLocker _tokenLocker) public {
    (address[] memory owners, , , , , , ,) = _tokenLocker.getLockerInfo();
    mintForOwners(_tokenLocker, owners);
  }

  function mintForOwners(
    IAbstractLocker _tokenLocker,
    address[] memory _owners
  )
    public
  {
    address registry = address(_tokenLocker.tokenContract());
    uint256 tokenId = _tokenLocker.tokenId();

    onlyValidToken(registry);

    require(_fundStorage().isMintApproved(registry, tokenId), "No mint permissions");
    super.mintForOwners(_tokenLocker, _owners);

    emit TokenMint(registry, tokenId);
  }

  function approveBurn(IAbstractLocker _tokenLocker) public {
    (address[] memory owners, , , , , , ,) = _tokenLocker.getLockerInfo();
    approveBurnForOwners(_tokenLocker, owners);
  }

  function approveBurnForOwners(IAbstractLocker _tokenLocker, address[] memory _owners) public {
    address registry = address(_tokenLocker.tokenContract());
    uint256 tokenId = _tokenLocker.tokenId();

    require(_fundStorage().isBurnApproved(registry, tokenId), "No burn permissions");
    onlyValidToken(registry);

    require(_fundStorage().getTotalFineAmount(registry, tokenId) == 0, "There are pending fines");
    require(_fundStorage().isTokenLocked(registry, tokenId) == false, "Token is locked by a fee contract");

    super.approveBurnForOwners(_tokenLocker, _owners);

    emit TokenBurn(registry, tokenId);
  }

  function burnExpelled(address _registry, uint256 _tokenId, address _delegate, address _owner, uint256 _amount) external {
    bool isExpelled = _fundStorage().getExpelledToken(_registry, _tokenId);

    require(_ownedBalances[_owner] >= _amount, "Not enough funds to burn");
    require(isExpelled, "Token not expelled");

    _burn(_delegate, _owner, _amount);
    ownerReputationMinted[_owner][_registry][_tokenId] = ownerReputationMinted[_owner][_registry][_tokenId].sub(_amount);

    if (ownerReputationMinted[_owner][_registry][_tokenId] == 0) {
      _cacheTokenDecrement(_owner);
    }

    address[] storage owners = tokenOwnersMinted[_registry][_tokenId];

    uint256 notBurnedAmount = 0;
    uint256 len = owners.length;
    for (uint256 i = 0; i < len; i++) {
      notBurnedAmount = notBurnedAmount.add(ownerReputationMinted[owners[i]][_registry][_tokenId]);
    }

    updateValueAtNow(_cachedBalances[_owner], balanceOf(_owner));

    if (notBurnedAmount == 0) {
      tokenOwnersMinted[_registry][_tokenId] = new address[](0);
      tokenReputationMinted[_registry][_tokenId] = 0;
      emit TokenBurn(_registry, _tokenId);
    }
    emit BurnExpelled(_registry, _tokenId, _delegate, _owner, _amount);
  }

  // @dev Transfer owned reputation
  // PermissionED
  function delegate(address _to, address _owner, uint256 _amount) public payable {
    _acceptPayment(DELEGATE_REPUTATION_FEE_KEY);

    require(!_fundStorage().transferLocked(), "Transfer locked");

    require(
      _tokenOwners.has(_to) || _fundStorage().isTransferToNotOwnedAllowed(_owner),
      "Beneficiary isn't a token owner"
    );

    _transfer(msg.sender, _to, _owner, _amount);
  }

  function revoke(address _from, uint256 _amount) public payable {
    _acceptPayment(REVOKE_REPUTATION_FEE_KEY);
    _revokeDelegated(_from, _amount);
  }

  function _creditAccount(address _account, address _owner, uint256 _amount) internal {
    LiquidRA._creditAccount(_account, _owner, _amount);

    updateValueAtNow(_cachedBalances[_account], balanceOf(_account));
  }

  function _debitAccount(address _account, address _owner, uint256 _amount) internal {
    LiquidRA._debitAccount(_account, _owner, _amount);

    updateValueAtNow(_cachedBalances[_account], balanceOf(_account));
  }

  function _mint(address _beneficiary, uint256 _amount) internal {
    LiquidRA._mint(_beneficiary, _amount);

    updateValueAtNow(_cachedTotalSupply, totalSupply());
  }

  function _burn(address _delegate, address _benefactor, uint256 _amount) internal {
    LiquidRA._burn(_delegate, _benefactor, _amount);

    updateValueAtNow(_cachedTotalSupply, totalSupply());
  }

  function updateValueAtNow(Checkpoint[] storage checkpoints, uint256 _value) internal {
    if ((checkpoints.length == 0) || (checkpoints[checkpoints.length - 1].fromBlock < block.number)) {
      Checkpoint storage newCheckPoint = checkpoints[checkpoints.length++];
      newCheckPoint.fromBlock = uint128(block.number);
      newCheckPoint.value = uint128(_value);
    } else {
      Checkpoint storage oldCheckPoint = checkpoints[checkpoints.length - 1];
      oldCheckPoint.value = uint128(_value);
    }
  }

  function getValueAt(Checkpoint[] storage checkpoints, uint _block) internal view returns (uint256) {
    if (checkpoints.length == 0) {
      return 0;
    }

    // Shortcut for the actual value
    if (_block >= checkpoints[checkpoints.length - 1].fromBlock) {
      return checkpoints[checkpoints.length - 1].value;
    }

    if (_block < checkpoints[0].fromBlock) {
      return 0;
    }

    // Binary search of the value in the array
    uint min = 0;
    uint max = checkpoints.length - 1;
    while (max > min) {
      uint mid = (max + min + 1) / 2;
      if (checkpoints[mid].fromBlock<=_block) {
        min = mid;
      } else {
        max = mid - 1;
      }
    }
    return checkpoints[min].value;
  }

  function _fundStorage() internal view returns (PrivateFundStorage) {
    return PrivateFundStorage(fundRegistry.getStorageAddress());
  }

  // GETTERS

  function balanceOfAt(address _address, uint256 _blockNumber) public view returns (uint256) {
    // These next few lines are used when the balance of the token is
    //  requested before a check point was ever created for this token, it
    //  requires that the `parentToken.balanceOfAt` be queried at the
    //  genesis block for that token as this contains initial balance of
    //  this token
    if ((_cachedBalances[_address].length == 0) || (_cachedBalances[_address][0].fromBlock > _blockNumber)) {
      // Has no parent
      return 0;
      // This will return the expected balance during normal situations
    } else {
      return getValueAt(_cachedBalances[_address], _blockNumber);
    }
  }

  function totalSupplyAt(uint256 _blockNumber) public view returns(uint256) {
    // These next few lines are used when the totalSupply of the token is
    //  requested before a check point was ever created for this token, it
    //  requires that the `parentToken.totalSupplyAt` be queried at the
    //  genesis block for this token as that contains totalSupply of this
    //  token at this block number.
    if ((_cachedTotalSupply.length == 0) || (_cachedTotalSupply[0].fromBlock > _blockNumber)) {
      return 0;
    // This will return the expected totalSupply during normal situations
    } else {
      return getValueAt(_cachedTotalSupply, _blockNumber);
    }
  }
}
