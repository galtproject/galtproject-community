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
import "openzeppelin-solidity/contracts/token/ERC721/IERC721.sol";
import "@galtproject/private-property-registry/contracts/interfaces/IPPGlobalRegistry.sol";
import "@galtproject/private-property-registry/contracts/interfaces/IPPTokenRegistry.sol";
import "@galtproject/private-property-registry/contracts/interfaces/IPPLocker.sol";
import "../abstract/AbstractFundStorage.sol";


contract PrivateFundStorage is AbstractFundStorage {
  // TODO: use SafeMath
  IPPGlobalRegistry public globalRegistry;

  mapping(address => ArraySet.Uint256Set) private _tokenFines;
  // registry => (tokenId => fineContracts[]))
  mapping(address => mapping(uint256 => ArraySet.AddressSet)) private _fineContractsByToken;
  // registry => (tokenId => details)
  mapping(address => mapping(uint256 => MemberFines)) private _fines;
  // registry => (tokenId => isMintApproved)
  mapping(address => mapping(uint256 => bool)) private _mintApprovals;
  // registry => (tokenId => isExpelled)
  mapping(address => mapping(uint256 => bool)) private _expelledTokens;
  // registry => (tokenId => availableAmountToBurn)
  mapping(address => mapping(uint256 => uint256)) private _expelledTokenReputation;
  // registry => (tokenId => isLocked)
  mapping(address => mapping(uint256 => bool)) private _lockedTokens;

  constructor (
    IPPGlobalRegistry _globalRegistry,
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
    globalRegistry = _globalRegistry;
  }

  function _onlyValidToken(address _token) internal view {
    IPPTokenRegistry(globalRegistry.getPPTokenRegistryAddress()).requireValidToken(_token);
  }

  function approveMint(address _registry, uint256 _tokenId)
    external
    onlyRole(ROLE_NEW_MEMBER_MANAGER)
  {
    _onlyValidToken(_registry);
    _mintApprovals[_registry][_tokenId] = true;
  }

  function expel(address _registry, uint256 _tokenId)
    external
    onlyRole(ROLE_EXPEL_MEMBER_MANAGER)
  {
    _onlyValidToken(_registry);
    require(_expelledTokens[_registry][_tokenId] == false, "Already Expelled");

    address owner = IERC721(_registry).ownerOf(_tokenId);
    uint256 amount = IPPLocker(owner).reputation();

    assert(amount > 0);

    _expelledTokens[_registry][_tokenId] = true;
    _expelledTokenReputation[_registry][_tokenId] = amount;
  }

  function decrementExpelledTokenReputation(
    address _registry,
    uint256 _tokenId,
    uint256 _amount
  )
    external
    onlyRole(ROLE_DECREMENT_TOKEN_REPUTATION)
    returns (bool completelyBurned)
  {
    _onlyValidToken(_registry);
    require(_amount > 0 && _amount <= _expelledTokenReputation[_registry][_tokenId], "Invalid reputation amount");

    _expelledTokenReputation[_registry][_tokenId] = _expelledTokenReputation[_registry][_tokenId] - _amount;

    completelyBurned = (_expelledTokenReputation[_registry][_tokenId] == 0);
  }

  function incrementFine(
    address _registry,
    uint256 _tokenId,
    address _contract,
    uint256 _amount
  )
    external
    onlyRole(ROLE_FINE_MEMBER_INCREMENT_MANAGER)
  {
    _onlyValidToken(_registry);
    // TODO: track relation to proposal id
    // _fines[_registry][_tokenId].tokenFines[_contract].amount += _amount;
    _fines[_registry][_tokenId].tokenFines[_contract].amount = _fines[_registry][_tokenId].tokenFines[_contract].amount.add(_amount);
    // _fines[_registry][_tokenId].total += _amount;
    _fines[_registry][_tokenId].total = _fines[_registry][_tokenId].total.add(_amount);

    _tokenFines[_registry].addSilent(_tokenId);
    _fineContractsByToken[_registry][_tokenId].addSilent(_contract);
  }

  function decrementFine(
    address _registry,
    uint256 _tokenId,
    address _contract,
    uint256 _amount
  )
    external
    onlyRole(ROLE_FINE_MEMBER_DECREMENT_MANAGER)
  {
    _onlyValidToken(_registry);

    // _fines[_registry][_tokenId].tokenFines[_contract].amount -= _amount;
    _fines[_registry][_tokenId].tokenFines[_contract].amount = _fines[_registry][_tokenId].tokenFines[_contract].amount.sub(_amount);
    // _fines[_registry][_tokenId].total -= _amount;
    _fines[_registry][_tokenId].total -= _fines[_registry][_tokenId].total.sub(_amount);

    if (_fines[_registry][_tokenId].tokenFines[_contract].amount == 0) {
      _fineContractsByToken[_registry][_tokenId].remove(_contract);
    }

    if (_fines[_registry][_tokenId].total == 0) {
      _tokenFines[_registry].remove(_tokenId);
    }
  }

  function lockSpaceToken(
    address _registry,
    uint256 _tokenId
  )
    external
    onlyFeeContract
  {
    _onlyValidToken(_registry);
    _lockedTokens[_registry][_tokenId] = true;
  }

  // TODO: possibility to unlock from removed contracts
  function unlockSpaceToken(
    address _registry,
    uint256 _tokenId
  )
    external
    onlyFeeContract
  {
    _onlyValidToken(_registry);
    _lockedTokens[_registry][_tokenId] = false;
  }

  // GETTERS
  function getFineAmount(
    address _registry,
    uint256 _tokenId,
    address _erc20Contract
  )
    external
    view
    returns (uint256)
  {
    return _fines[_registry][_tokenId].tokenFines[_erc20Contract].amount;
  }

  function getTotalFineAmount(
    address _registry,
    uint256 _tokenId
  )
    external
    view
    returns (uint256)
  {
    return _fines[_registry][_tokenId].total;
  }

  function getExpelledToken(
    address _registry,
    uint256 _tokenId
  )
    external
    view
    returns (bool isExpelled, uint256 amount)
  {
    return (
      _expelledTokens[_registry][_tokenId],
      _expelledTokenReputation[_registry][_tokenId]
    );
  }

  function getFineTokens(address _registry) external view returns (uint256[] memory) {
    return _tokenFines[_registry].elements();
  }

  function getFineSpaceTokensCount(address _registry) external view returns (uint256) {
    return _tokenFines[_registry].size();
  }

  function getFineContractsByToken(
    address _registry,
    uint256 _tokenId
  )
    external
    view
    returns (address[] memory)
  {
    return _fineContractsByToken[_registry][_tokenId].elements();
  }

  function getFineContractsByTokenCount(
    address _registry,
    uint256 _tokenId
  )
    external
    view
    returns (uint256)
  {
    return _fineContractsByToken[_registry][_tokenId].size();
  }

  function isMintApproved(
    address _registry,
    uint256 _tokenId
  )
    external
    view
    returns (bool)
  {
    if (_expelledTokens[_registry][_tokenId] == true) {
      return false;
    }

    if (uint256(_config[IS_PRIVATE]) == uint256(1)) {
      return _mintApprovals[_registry][_tokenId];
    } else {
      return true;
    }
  }

  function isTokenLocked(
    address _registry,
    uint256 _tokenId
  )
    external
    view
    returns (bool)
  {
    return _lockedTokens[_registry][_tokenId];
  }
}
