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
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "@galtproject/core/contracts/registries/GaltGlobalRegistry.sol";
import "@galtproject/core/contracts/interfaces/ISpaceLocker.sol";
import "../abstract/AbstractFundStorage.sol";
import "../common/interfaces/IFundRegistry.sol";


contract FundStorage is AbstractFundStorage {
  using SafeMath for uint256;

  event ApproveMint(uint256 indexed tokenId);

  event Expel(uint256 indexed tokenId);
  event DecrementExpel(uint256 indexed tokenId);

  event ChangeFine(bool indexed isIncrement, uint256 indexed tokenId, address indexed contractAddress);

  event LockChange(bool indexed isLock, uint256 indexed tokenId);

  // spaceTokenId => details
  mapping(uint256 => MemberFines) private _fines;
  // spaceTokenId => isMintApproved
  mapping(uint256 => bool) internal _mintApprovals;
  // spaceTokenId => isExpelled
  mapping(uint256 => bool) private _expelledTokens;
  // spaceTokenId => availableAmountToBurn
  mapping(uint256 => uint256) private _expelledTokenReputation;
  // spaceTokenId => isLocked
  mapping(uint256 => bool) private _lockedSpaceTokens;

  constructor() public {
  }

  function approveMint(uint256 _spaceTokenId) external onlyRole(ROLE_NEW_MEMBER_MANAGER) {
    _mintApprovals[_spaceTokenId] = true;

    emit ApproveMint(_spaceTokenId);
  }

  function expel(uint256 _spaceTokenId) external onlyRole(ROLE_EXPEL_MEMBER_MANAGER) {
    require(_expelledTokens[_spaceTokenId] == false, "Already Expelled");

    address owner = GaltGlobalRegistry(fundRegistry.getGGRAddress()).getSpaceToken().ownerOf(_spaceTokenId);
    uint256 amount = ISpaceLocker(owner).reputation();

    assert(amount > 0);

    _expelledTokens[_spaceTokenId] = true;
    _expelledTokenReputation[_spaceTokenId] = amount;

    emit Expel(_spaceTokenId);
  }

  function decrementExpelledTokenReputation(
    uint256 _spaceTokenId,
    uint256 _amount
  )
    external
    onlyRole(ROLE_DECREMENT_TOKEN_REPUTATION)
    returns (bool completelyBurned)
  {
    require(_amount > 0 && _amount <= _expelledTokenReputation[_spaceTokenId], "Invalid reputation amount");

    // _expelledTokenReputation[_spaceTokenId] = _expelledTokenReputation[_spaceTokenId] - _amount;
    _expelledTokenReputation[_spaceTokenId] = _expelledTokenReputation[_spaceTokenId].sub(_amount);

    completelyBurned = (_expelledTokenReputation[_spaceTokenId] == 0);

    emit DecrementExpel(_spaceTokenId);
  }

  function incrementFine(uint256 _spaceTokenId, address _contract, uint256 _amount) external onlyRole(ROLE_FINE_MEMBER_INCREMENT_MANAGER) {
    // TODO: track relation to proposal id
    // _fines[_spaceTokenId].tokenFines[_contract].amount += _amount;
    _fines[_spaceTokenId].tokenFines[_contract].amount = _fines[_spaceTokenId].tokenFines[_contract].amount.add(_amount);
    // _fines[_spaceTokenId].total += _amount;
    _fines[_spaceTokenId].total = _fines[_spaceTokenId].total.add(_amount);

    emit ChangeFine(true, _spaceTokenId, _contract);
  }

  function decrementFine(uint256 _spaceTokenId, address _contract, uint256 _amount) external onlyRole(ROLE_FINE_MEMBER_DECREMENT_MANAGER) {
    // _fines[_spaceTokenId].tokenFines[_contract].amount -= _amount;
    _fines[_spaceTokenId].tokenFines[_contract].amount = _fines[_spaceTokenId].tokenFines[_contract].amount.sub(_amount);
    // _fines[_spaceTokenId].total -= _amount;
    _fines[_spaceTokenId].total = _fines[_spaceTokenId].total.sub(_amount);

    emit ChangeFine(false, _spaceTokenId, _contract);
  }

  function lockSpaceToken(uint256 _spaceTokenId) external onlyFeeContract {
    _lockedSpaceTokens[_spaceTokenId] = true;

    emit LockChange(true, _spaceTokenId);
  }

  // TODO: possibility to unlock from removed contracts
  function unlockSpaceToken(uint256 _spaceTokenId) external onlyFeeContract {
    _lockedSpaceTokens[_spaceTokenId] = false;

    emit LockChange(false, _spaceTokenId);
  }

  // GETTERS
  function getFineAmount(uint256 _spaceTokenId, address _erc20Contract) external view returns (uint256) {
    return _fines[_spaceTokenId].tokenFines[_erc20Contract].amount;
  }

  function getTotalFineAmount(uint256 _spaceTokenId) external view returns (uint256) {
    return _fines[_spaceTokenId].total;
  }

  function getExpelledToken(uint256 _spaceTokenId) external view returns (bool isExpelled, uint256 amount) {
    return (_expelledTokens[_spaceTokenId], _expelledTokenReputation[_spaceTokenId]);
  }

  function isMintApproved(uint256 _spaceTokenId) external view returns (bool) {
    if (_expelledTokens[_spaceTokenId] == true) {
      return false;
    }

    if (uint256(config[IS_PRIVATE]) == uint256(1)) {
      return _mintApprovals[_spaceTokenId];
    } else {
      return true;
    }
  }

  function isSpaceTokenLocked(uint256 _spaceTokenId) external view returns (bool) {
    return _lockedSpaceTokens[_spaceTokenId];
  }
}
