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
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "@galtproject/core/contracts/registries/GaltGlobalRegistry.sol";
import "@galtproject/core/contracts/interfaces/ISpaceLocker.sol";
import "../abstract/AbstractFundStorage.sol";


contract FundStorage is AbstractFundStorage {
  // TODO: use SafeMath
  GaltGlobalRegistry public ggr;

  ArraySet.Uint256Set private _finesSpaceTokens;

  mapping(uint256 => ArraySet.AddressSet) private _finesContractsBySpaceToken;
  // spaceTokenId => details
  mapping(uint256 => MemberFines) private _fines;
  // spaceTokenId => isMintApproved
  mapping(uint256 => bool) private _mintApprovals;
  // spaceTokenId => isExpelled
  mapping(uint256 => bool) private _expelledTokens;
  // spaceTokenId => availableAmountToBurn
  mapping(uint256 => uint256) private _expelledTokenReputation;
  // spaceTokenId => isLocked
  mapping(uint256 => bool) private _lockedSpaceTokens;

  constructor (
    GaltGlobalRegistry _ggr,
    bool _isPrivate,
    uint256 _defaultProposalSupport,
    uint256 _defaultProposalQuorum,
    uint256 _defaultProposalTimeout,
    uint256 _periodLength
  )
    public
    AbstractFundStorage(
      _isPrivate,
      _defaultProposalSupport,
      _defaultProposalQuorum,
      _defaultProposalTimeout,
      _periodLength
    )
  {
    ggr = _ggr;
  }

  function approveMint(uint256 _spaceTokenId) external onlyRole(ROLE_NEW_MEMBER_MANAGER) {
    _mintApprovals[_spaceTokenId] = true;
  }

  function expel(uint256 _spaceTokenId) external onlyRole(ROLE_EXPEL_MEMBER_MANAGER) {
    require(_expelledTokens[_spaceTokenId] == false, "Already Expelled");

    address owner = ggr.getSpaceToken().ownerOf(_spaceTokenId);
    uint256 amount = ISpaceLocker(owner).reputation();

    assert(amount > 0);

    _expelledTokens[_spaceTokenId] = true;
    _expelledTokenReputation[_spaceTokenId] = amount;
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

    _expelledTokenReputation[_spaceTokenId] = _expelledTokenReputation[_spaceTokenId] - _amount;

    completelyBurned = (_expelledTokenReputation[_spaceTokenId] == 0);
  }

  function incrementFine(uint256 _spaceTokenId, address _contract, uint256 _amount) external onlyRole(ROLE_FINE_MEMBER_INCREMENT_MANAGER) {
    // TODO: track relation to proposal id
    _fines[_spaceTokenId].tokenFines[_contract].amount += _amount;
    _fines[_spaceTokenId].total += _amount;

    _finesSpaceTokens.addSilent(_spaceTokenId);
    _finesContractsBySpaceToken[_spaceTokenId].addSilent(_contract);
  }

  function decrementFine(uint256 _spaceTokenId, address _contract, uint256 _amount) external onlyRole(ROLE_FINE_MEMBER_DECREMENT_MANAGER) {
    _fines[_spaceTokenId].tokenFines[_contract].amount -= _amount;
    _fines[_spaceTokenId].total -= _amount;

    if (_fines[_spaceTokenId].tokenFines[_contract].amount == 0) {
      _finesContractsBySpaceToken[_spaceTokenId].remove(_contract);
    }

    if (_fines[_spaceTokenId].total == 0) {
      _finesSpaceTokens.remove(_spaceTokenId);
    }
  }

  function lockSpaceToken(uint256 _spaceTokenId) external onlyFeeContract {
    _lockedSpaceTokens[_spaceTokenId] = true;
  }

  // TODO: possibility to unlock from removed contracts
  function unlockSpaceToken(uint256 _spaceTokenId) external onlyFeeContract {
    _lockedSpaceTokens[_spaceTokenId] = false;
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

  function getFineSpaceTokens() external view returns (uint256[] memory) {
    return _finesSpaceTokens.elements();
  }

  function getFineSpaceTokensCount() external view returns (uint256) {
    return _finesSpaceTokens.size();
  }

  function getFineContractsBySpaceToken(uint256 _spaceTokenId) external view returns (address[] memory) {
    return _finesContractsBySpaceToken[_spaceTokenId].elements();
  }

  function getFineContractsBySpaceTokenCount(uint256 _spaceTokenId) external view returns (uint256) {
    return _finesContractsBySpaceToken[_spaceTokenId].size();
  }

  function isMintApproved(uint256 _spaceTokenId) external view returns (bool) {
    if (_expelledTokens[_spaceTokenId] == true) {
      return false;
    }

    if (uint256(_config[IS_PRIVATE]) == uint256(1)) {
      return _mintApprovals[_spaceTokenId];
    } else {
      return true;
    }
  }

  function isSpaceTokenLocked(uint256 _spaceTokenId) external view returns (bool) {
    return _lockedSpaceTokens[_spaceTokenId];
  }
}
