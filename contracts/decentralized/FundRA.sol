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
import "@galtproject/core/contracts/reputation/components/SpaceInputRA.sol";
import "@galtproject/core/contracts/interfaces/ISpaceLocker.sol";
import "@galtproject/core/contracts/reputation/interfaces/IRA.sol";
import "./FundStorage.sol";
import "../common/interfaces/IFundRA.sol";


contract FundRA is IRA, IFundRA, LiquidRA, SpaceInputRA {
  using SafeMath for uint256;
  using ArraySet for ArraySet.AddressSet;

  event TokenMint(uint256 indexed tokenId);
  event TokenBurn(uint256 indexed tokenId);

  struct Checkpoint {
    uint128 fromBlock;
    uint128 value;
  }

  IFundRegistry public fundRegistry;

  mapping(address => Checkpoint[]) internal _cachedBalances;
  Checkpoint[] internal _cachedTotalSupply;

  // alternative initializer to Decentralized.initialize(GaltGlobalRegistry _ggr)
  function initialize2(
    IFundRegistry _fundRegistry
  )
    public
    isInitializer
  {
    // NOTICE: can't update GGR address within this contract later
    ggr = GaltGlobalRegistry(_fundRegistry.getGGRAddress());
    fundRegistry = _fundRegistry;
  }

  function mint(
    ISpaceLocker _spaceLocker
  )
    public
  {
    uint256 spaceTokenId = _spaceLocker.spaceTokenId();
    require(_fundStorage().isMintApproved(spaceTokenId), "No mint permissions");
    super.mint(_spaceLocker);

    emit TokenMint(spaceTokenId);
  }

  function approveBurn(
    ISpaceLocker _spaceLocker
  )
    public
  {
    uint256 spaceTokenId = _spaceLocker.spaceTokenId();
    require(_fundStorage().getTotalFineAmount(spaceTokenId) == 0, "There are pending fines");
    require(_fundStorage().isSpaceTokenLocked(spaceTokenId) == false, "Token is locked by a fee contract");

    super.approveBurn(_spaceLocker);

    emit TokenBurn(spaceTokenId);
  }

  function burnExpelled(uint256 _spaceTokenId, address _delegate, address _owner, uint256 _amount) external {
    bool completelyBurned = _fundStorage().decrementExpelledTokenReputation(_spaceTokenId, _amount);

    _debitAccount(_delegate, _owner, _amount);

    require(_ownedBalances[_owner] >= _amount, "Not enough funds to burn");

    _ownedBalances[_owner] = _ownedBalances[_owner].sub(_amount);
    totalStakedSpace = totalStakedSpace.sub(_amount);

    if (completelyBurned) {
      _spaceTokensByOwner[_owner].remove(_spaceTokenId);
      if (_spaceTokensByOwner[_owner].size() == 0) {
        _spaceTokenOwners.remove(_owner);
      }
      reputationMinted[_spaceTokenId] = false;
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

  function _fundStorage() internal view returns (FundStorage) {
    return FundStorage(fundRegistry.getStorageAddress());
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
