/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "@galtproject/core/contracts/reputation/components/LiquidRA.sol";
import "@galtproject/core/contracts/reputation/interfaces/IRA.sol";
import "./PrivateFundStorage.sol";
import "../common/interfaces/IFundRA.sol";

import "@galtproject/private-property-registry/contracts/interfaces/IPPLocker.sol";
import "./traits/PPTokenInputRA.sol";


contract PrivateFundRA is IRA, IFundRA, LiquidRA, PPTokenInputRA {

  using SafeMath for uint256;
  using ArraySet for ArraySet.AddressSet;

  event LockerMint(address lockerAddress, address indexed registry, uint256 indexed tokenId);
  event LockerBurn(address lockerAddress, address indexed registry, uint256 indexed tokenId);

  struct Checkpoint {
    uint128 fromBlock;
    uint128 value;
  }

  PrivateFundStorage public fundStorage;

  mapping(address => Checkpoint[]) _cachedBalances;
  mapping(uint256 => bool) internal _tokensToExpel;
  Checkpoint[] _cachedTotalSupply;

  function initialize(PrivateFundStorage _fundStorage) external isInitializer {
    super.initializeInternal(_fundStorage.globalRegistry());
    fundStorage = _fundStorage;
  }

  function mint(
    IPPLocker _tokenLocker
  )
    public
  {
    // TODO: Check validity
    address registry = address(_tokenLocker.tokenContract());
    uint256 tokenId = _tokenLocker.tokenId();

    require(fundStorage.isMintApproved(registry, tokenId), "No mint permissions");
    super.mint(_tokenLocker);

    emit LockerMint(address(_tokenLocker), registry, tokenId);
  }

  function approveBurn(
    IPPLocker _tokenLocker
  )
    public
  {
    // TODO: Check validity
    address registry = address(_tokenLocker.tokenContract());
    uint256 tokenId = _tokenLocker.tokenId();

    require(fundStorage.getTotalFineAmount(registry, tokenId) == 0, "There are pending fines");
    require(fundStorage.isTokenLocked(registry, tokenId) == false, "Token is locked by a fee contract");

    super.approveBurn(_tokenLocker);

    emit LockerBurn(address(_tokenLocker), registry, tokenId);
  }

  function burnExpelled(address _registry, uint256 _tokenId, address _delegate, address _owner, uint256 _amount) external {
    bool completelyBurned = fundStorage.decrementExpelledTokenReputation(_registry, _tokenId, _amount);

    _debitAccount(_delegate, _owner, _amount);

    if (completelyBurned) {
      reputationMinted[_registry][_tokenId] = false;
    }
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

  function _burn(address _benefactor, uint256 _amount) internal {
    LiquidRA._burn(_benefactor, _amount);

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
