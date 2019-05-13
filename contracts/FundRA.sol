/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

pragma solidity 0.5.7;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC721/IERC721.sol";
import "@galtproject/core/contracts/reputation/components/LiquidRA.sol";
import "@galtproject/core/contracts/reputation/components/SpaceInputRA.sol";
import "@galtproject/core/contracts/registries/interfaces/ILockerRegistry.sol";
import "@galtproject/core/contracts/interfaces/ISpaceLocker.sol";
import "@galtproject/core/contracts/reputation/interfaces/IRA.sol";
import "./FundStorage.sol";
import "./interfaces/IFundRA.sol";


contract FundRA is IRA, IFundRA, LiquidRA, SpaceInputRA {

  using SafeMath for uint256;
  using ArraySet for ArraySet.AddressSet;

  struct Checkpoint {
    uint128 fromBlock;
    uint128 value;
  }

  FundStorage public fundStorage;

  mapping(address => Checkpoint[]) _cachedBalances;
  mapping(uint256 => bool) internal _tokensToExpel;
  Checkpoint[] _cachedTotalSupply;

  constructor(
    FundStorage _fundStorage
  )
    public
    LiquidRA(_fundStorage.ggr())
  {
    fundStorage = _fundStorage;
  }

  function mint(
    ISpaceLocker _spaceLocker
  )
    public
  {
    uint256 spaceTokenId = _spaceLocker.spaceTokenId();
    require(fundStorage.isMintApproved(spaceTokenId), "No mint permissions");
    super.mint(_spaceLocker);
  }

  function approveBurn(
    ISpaceLocker _spaceLocker
  )
    public
  {
    require(fundStorage.getTotalFineAmount(_spaceLocker.spaceTokenId()) == 0, "There are pending fines");
    require(fundStorage.isSpaceTokenLocked(_spaceLocker.spaceTokenId()) == false, "Token is locked by a fee contract");

    super.approveBurn(_spaceLocker);
  }

  function burnExpelled(uint256 _spaceTokenId, address _delegate, address _owner, uint256 _amount) external {
    bool completelyBurned = fundStorage.decrementExpelledTokenReputation(_spaceTokenId, _amount);

    _debitAccount(_delegate, _owner, _amount);

    if (completelyBurned) {
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

  function updateValueAtNow(Checkpoint[] storage checkpoints, uint _value) internal  {
    if ((checkpoints.length == 0) || (checkpoints[checkpoints.length -1].fromBlock < block.number)) {
       Checkpoint storage newCheckPoint = checkpoints[checkpoints.length++];
       newCheckPoint.fromBlock =  uint128(block.number);
       newCheckPoint.value = uint128(_value);
     } else {
       Checkpoint storage oldCheckPoint = checkpoints[checkpoints.length-1];
       oldCheckPoint.value = uint128(_value);
     }
  }

  function getValueAt(Checkpoint[] storage checkpoints, uint _block) internal view returns (uint256) {
    if (checkpoints.length == 0) return 0;

    // Shortcut for the actual value
    if (_block >= checkpoints[checkpoints.length-1].fromBlock) {
      return checkpoints[checkpoints.length-1].value;
    }

    if (_block < checkpoints[0].fromBlock) {
      return 0;
    }

    // Binary search of the value in the array
    uint min = 0;
    uint max = checkpoints.length-1;
    while (max > min) {
      uint mid = (max + min + 1)/ 2;
      if (checkpoints[mid].fromBlock<=_block) {
        min = mid;
      } else {
        max = mid-1;
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
