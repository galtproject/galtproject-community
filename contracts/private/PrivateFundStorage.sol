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
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@galtproject/private-property-registry/contracts/interfaces/IPPGlobalRegistry.sol";
import "@galtproject/private-property-registry/contracts/interfaces/IPPTokenRegistry.sol";
import "../abstract/AbstractFundStorage.sol";
import "./traits/PPTokenInputRA.sol";
import "../common/interfaces/IFundMultiSig.sol";


contract PrivateFundStorage is AbstractFundStorage {

  uint256 public constant VERSION = 3;

  event ApproveMint(address indexed registry, uint256 indexed tokenId);

  event SetBurnApproval(address indexed registry, uint256 indexed tokenId, bool value);
  event BurnLockedChange(bool indexed burnLocked);

  event SetTransferNonTokenOwnersAllowed(bool indexed allowed);
  event SetTransferNonTokenOwnersItemApproval(address tokenOwner, bool indexed burnLocked);
  event SetTransferLocked(bool indexed disabled);

  event Expel(address indexed registry, uint256 indexed tokenId);
  event DecrementExpel(address indexed registry, uint256 indexed tokenId);

  event ChangeFine(bool indexed isIncrement, address indexed registry, uint256 indexed tokenId, address contractAddress);

  event LockChange(bool indexed isLock, address indexed registry, uint256 indexed tokenId);

  bool public burnLocked;
  bool public transferNonTokenOwnersAllowed;
  bool public transferLocked;

  // registry => (tokenId => details)
  mapping(address => mapping(uint256 => MemberFines)) private _fines;
  // registry => (tokenId => isMintApproved)
  mapping(address => mapping(uint256 => bool)) private _mintApprovals;
  // registry => (tokenId => isBurnApproved)
  mapping(address => mapping(uint256 => bool)) private _burnApprovals;
  // address => isTransferApproved
  mapping(address => bool) private _transferNonTokenOwnersApprovals;
  // registry => (tokenId => isExpelled)
  mapping(address => mapping(uint256 => bool)) private _expelledTokens;
  // registry => (tokenId => isLocked)
  mapping(address => mapping(uint256 => bool)) private _lockedTokens;

  constructor() public {
  }

  function _onlyValidToken(address _token) internal view {
    IPPGlobalRegistry ppgr = IPPGlobalRegistry(fundRegistry.getPPGRAddress());

    IPPTokenRegistry(ppgr.getPPTokenRegistryAddress())
      .requireValidToken(_token);
  }

  function approveMintAll(address[] calldata _registries, uint256[] calldata _tokenIds)
    external
    onlyRole(ROLE_NEW_MEMBER_MANAGER)
  {
    require(_registries.length == _tokenIds.length, "Array lengths mismatch");

    uint256 len = _registries.length;

    for (uint256 i = 0; i < len; i++) {
      _onlyValidToken(_registries[i]);
      _mintApprovals[_registries[i]][_tokenIds[i]] = true;
      _expelledTokens[_registries[i]][_tokenIds[i]] = false;

      emit ApproveMint(_registries[i], _tokenIds[i]);
    }
  }

  function setBurnApprovalAll(address[] calldata _registries, uint256[] calldata _tokenIds, bool _value)
    external
    onlyRole(ROLE_BURN_LOCK_MANAGER)
  {
    require(_registries.length == _tokenIds.length, "Array lengths mismatch");

    uint256 len = _registries.length;

    for (uint256 i = 0; i < len; i++) {
      _onlyValidToken(_registries[i]);
      _burnApprovals[_registries[i]][_tokenIds[i]] = _value;

      emit SetBurnApproval(_registries[i], _tokenIds[i], _value);
    }
  }

  function setBurnLocked(bool _value)
    external
    onlyRole(ROLE_BURN_LOCK_MANAGER)
  {
    burnLocked = _value;
    emit BurnLockedChange(_value);
  }

  function setTransferNonTokenOwnersListAllowed(
    address[] calldata _addresses,
    bool _value
  )
    external
    onlyRole(ROLE_TRANSFER_REPUTATION_MANAGER)
  {
    uint256 len = _addresses.length;

    for (uint256 i = 0; i < len; i++) {
      _transferNonTokenOwnersApprovals[_addresses[i]] = _value;
      emit SetTransferNonTokenOwnersItemApproval(_addresses[i], burnLocked);
    }
  }

  function setTransferNonTokenOwnersAllowed(bool _value)
    external
    onlyRole(ROLE_TRANSFER_REPUTATION_MANAGER)
  {
    transferNonTokenOwnersAllowed = _value;
    emit SetTransferNonTokenOwnersAllowed(_value);
  }

  function setTransferLocked(bool _value)
    external
    onlyRole(ROLE_TRANSFER_REPUTATION_MANAGER)
  {
    transferLocked = _value;
    emit SetTransferLocked(_value);
  }

  function expel(address _registry, uint256 _tokenId)
    external
    onlyRole(ROLE_EXPEL_MEMBER_MANAGER)
  {
    _onlyValidToken(_registry);
    require(_expelledTokens[_registry][_tokenId] == false, "Already Expelled");

    _expelledTokens[_registry][_tokenId] = true;

    emit Expel(_registry, _tokenId);
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

    emit ChangeFine(true, _registry, _tokenId, _contract);
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
    _fines[_registry][_tokenId].total = _fines[_registry][_tokenId].total.sub(_amount);

    emit ChangeFine(false, _registry, _tokenId, _contract);
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

    emit LockChange(true, _registry, _tokenId);
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

    emit LockChange(false, _registry, _tokenId);
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
    returns (bool)
  {
    return _expelledTokens[_registry][_tokenId];
  }

  function isFundMemberOrMultiSigOwner(address _addr) external view returns (bool) {
    bool isRaMember = PPTokenInputRA(fundRegistry.getRAAddress()).isMember(_addr);
    if (isRaMember) {
      return true;
    }
    return IFundMultiSig(fundRegistry.getMultiSigAddress()).isOwner(_addr);
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

    if (uint256(config[IS_PRIVATE]) == uint256(1)) {
      return _mintApprovals[_registry][_tokenId];
    } else {
      return true;
    }
  }

  function isBurnApproved(
    address _registry,
    uint256 _tokenId
  )
    external
    view
    returns (bool)
  {
    return !burnLocked || _burnApprovals[_registry][_tokenId];
  }

  function isTransferToNotOwnedAllowed(
    address _tokenOwner
  )
    external
    view
    returns (bool)
  {
    return transferNonTokenOwnersAllowed || _transferNonTokenOwnersApprovals[_tokenOwner];
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
