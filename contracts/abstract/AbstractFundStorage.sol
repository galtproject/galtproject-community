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
import "@galtproject/libs/contracts/traits/Initializable.sol";
import "../common/FundMultiSig.sol";
import "../common/FundProposalManager.sol";
import "../common/interfaces/IFundRA.sol";
import "./interfaces/IAbstractFundStorage.sol";
import "../common/interfaces/IFundRegistry.sol";


contract AbstractFundStorage is IAbstractFundStorage, Initializable {
  using SafeMath for uint256;

  using ArraySet for ArraySet.AddressSet;
  using ArraySet for ArraySet.Uint256Set;
  using ArraySet for ArraySet.Bytes32Set;
  using Counters for Counters.Counter;

  event AddProposalMarker(bytes32 indexed marker, address indexed proposalManager);
  event RemoveProposalMarker(bytes32 indexed marker, address indexed proposalManager);
  event ReplaceProposalMarker(bytes32 indexed oldMarker, bytes32 indexed newMarker, address indexed proposalManager);

  event SetProposalVotingConfig(bytes32 indexed key, uint256 support, uint256 minAcceptQuorum, uint256 timeout);
  event SetDefaultProposalVotingConfig(uint256 support, uint256 minAcceptQuorum, uint256 timeout);

  event AddCommunityApp(address indexed contractAddress);
  event RemoveCommunityApp(address indexed contractAddress);

  event AddFeeContract(address indexed contractAddress);
  event RemoveFeeContract(address indexed contractAddress);

  event SetMemberIdentification(address indexed member, bytes32 identificationHash);
  event SetNameAndDataLink(string name, string dataLink);
  event SetMultiSigManager(address indexed manager);
  event SetPeriodLimit(address indexed erc20Contract, uint256 amount, bool active);
  event HandleMultiSigTransaction(address indexed erc20Contract, uint256 amount);

  event SetConfig(bytes32 indexed key, bytes32 value);

  // 100% == 100 ether
  uint256 public constant ONE_HUNDRED_PCT = 100 ether;

  bytes32 public constant ROLE_CONFIG_MANAGER = bytes32("CONFIG_MANAGER");
  bytes32 public constant ROLE_COMMUNITY_APPS_MANAGER = bytes32("CA_MANAGER");
  bytes32 public constant ROLE_PROPOSAL_MARKERS_MANAGER = bytes32("MARKER_MANAGER");
  bytes32 public constant ROLE_NEW_MEMBER_MANAGER = bytes32("NEW_MEMBER_MANAGER");
  bytes32 public constant ROLE_EXPEL_MEMBER_MANAGER = bytes32("EXPEL_MEMBER_MANAGER");
  bytes32 public constant ROLE_FINE_MEMBER_INCREMENT_MANAGER = bytes32("FINE_MEMBER_INCREMENT_MANAGER");
  bytes32 public constant ROLE_FINE_MEMBER_DECREMENT_MANAGER = bytes32("FINE_MEMBER_DECREMENT_MANAGER");
  bytes32 public constant ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER = bytes32("CHANGE_NAME_DATA_LINK_MANAGER");
  bytes32 public constant ROLE_FEE_MANAGER = bytes32("FEE_MANAGER");
  bytes32 public constant ROLE_MEMBER_DETAILS_MANAGER = bytes32("MEMBER_DETAILS_MANAGER");
  bytes32 public constant ROLE_MULTI_SIG_WITHDRAWAL_LIMITS_MANAGER = bytes32("MULTISIG_WITHDRAWAL_MANAGER");
  bytes32 public constant ROLE_MEMBER_IDENTIFICATION_MANAGER = bytes32("MEMBER_IDENTIFICATION_MANAGER");
  bytes32 public constant ROLE_PROPOSAL_THRESHOLD_MANAGER = bytes32("THRESHOLD_MANAGER");
  bytes32 public constant ROLE_DEFAULT_PROPOSAL_THRESHOLD_MANAGER = bytes32("DEFAULT_THRESHOLD_MANAGER");
  bytes32 public constant ROLE_DECREMENT_TOKEN_REPUTATION = bytes32("DECREMENT_TOKEN_REPUTATION_ROLE");
  bytes32 public constant ROLE_MULTISIG = bytes32("MULTISIG");

  bytes32 public constant IS_PRIVATE = bytes32("is_private");

  struct CommunityApp {
    bytes32 abiIpfsHash;
    bytes32 appType;
    string dataLink;
  }

  struct ProposalMarker {
    bool active;
    bytes32 name;
    string dataLink;
    address destination;
    address proposalManager;
  }

  struct MultiSigManager {
    bool active;
    address manager;
    string name;
    string dataLink;
  }

  // TODO: separate caching data with config to another contract
  struct MemberFines {
    uint256 total;
    // Assume ETH is address(0x1)
    mapping(address => MemberFineItem) tokenFines;
  }

  struct MemberFineItem {
    uint256 amount;
  }

  struct PeriodLimit {
    bool active;
    uint256 amount;
  }

  struct VotingConfig {
    uint256 support;
    uint256 minAcceptQuorum;
    uint256 timeout;
  }

  IFundRegistry public fundRegistry;
  VotingConfig public defaultVotingConfig;

  string public name;
  string public dataLink;
  uint256 public initialTimestamp;
  uint256 public periodLength;

  ArraySet.AddressSet internal _communityApps;
  ArraySet.AddressSet internal _feeContracts;

  ArraySet.AddressSet internal _activeMultisigManagers;
  ArraySet.AddressSet internal _activePeriodLimitsContracts;

  mapping(bytes32 => bytes32) public config;
  // contractAddress => details
  mapping(address => CommunityApp) public communityAppsInfo;
  // marker => details
  mapping(bytes32 => ProposalMarker) public proposalMarkers;
  // role => address
  mapping(bytes32 => address) public coreContracts;
  // manager => details
  mapping(address => MultiSigManager) public multiSigManagers;
  // erc20Contract => details
  mapping(address => PeriodLimit) public periodLimits;
  // periodId => (erc20Contract => runningTotal)
  mapping(uint256 => mapping(address => uint256)) internal _periodRunningTotals;
  // member => identification hash
  mapping(address => bytes32) public membersIdentification;

  // marker => customVotingConfigs
  mapping(bytes32 => VotingConfig) public customVotingConfigs;

  modifier onlyFeeContract() {
    require(_feeContracts.has(msg.sender), "Not a fee contract");

    _;
  }

  modifier onlyMultiSig() {
    require(fundRegistry.getACL().hasRole(msg.sender, ROLE_MULTISIG), "Invalid role");

    _;
  }

  modifier onlyRole(bytes32 _role) {
    require(fundRegistry.getACL().hasRole(msg.sender, _role), "Invalid role");

    _;
  }

  constructor() public {
  }

  function initialize(
    IFundRegistry _fundRegistry,
    bool _isPrivate,
    uint256 _defaultProposalSupport,
    uint256 _defaultProposalMinAcceptQuorum,
    uint256 _defaultProposalTimeout,
    uint256 _periodLength
  )
    external
    isInitializer
  {
    config[IS_PRIVATE] = _isPrivate ? bytes32(uint256(1)) : bytes32(uint256(0));

    periodLength = _periodLength;
    initialTimestamp = block.timestamp;

    _validateVotingConfig(_defaultProposalSupport, _defaultProposalMinAcceptQuorum, _defaultProposalTimeout);

    defaultVotingConfig.support = _defaultProposalSupport;
    defaultVotingConfig.minAcceptQuorum = _defaultProposalMinAcceptQuorum;
    defaultVotingConfig.timeout = _defaultProposalTimeout;

    fundRegistry = _fundRegistry;
  }

  function setDefaultProposalConfig(
    uint256 _support,
    uint256 _minAcceptQuorum,
    uint256 _timeout
  )
    external
    onlyRole(ROLE_DEFAULT_PROPOSAL_THRESHOLD_MANAGER)
  {
    _validateVotingConfig(_support, _minAcceptQuorum, _timeout);

    defaultVotingConfig.support = _support;
    defaultVotingConfig.minAcceptQuorum = _minAcceptQuorum;
    defaultVotingConfig.timeout = _timeout;

    emit SetDefaultProposalVotingConfig(_support, _minAcceptQuorum, _timeout);
  }

  function setProposalConfig(
    bytes32 _marker,
    uint256 _support,
    uint256 _minAcceptQuorum,
    uint256 _timeout
  )
    external
    onlyRole(ROLE_PROPOSAL_THRESHOLD_MANAGER)
  {
    _validateVotingConfig(_support, _minAcceptQuorum, _timeout);

    customVotingConfigs[_marker] = VotingConfig({
      support: _support,
      minAcceptQuorum: _minAcceptQuorum,
      timeout: _timeout
    });

    emit SetProposalVotingConfig(_marker, _support, _minAcceptQuorum, _timeout);
  }

  function setConfigValue(bytes32 _key, bytes32 _value) external onlyRole(ROLE_CONFIG_MANAGER) {
    config[_key] = _value;

    emit SetConfig(_key, _value);
  }

  function addCommunityApp(
    address _contract,
    bytes32 _type,
    bytes32 _abiIpfsHash,
    string calldata _dataLink
  )
    external
    onlyRole(ROLE_COMMUNITY_APPS_MANAGER)
  {
    CommunityApp storage c = communityAppsInfo[_contract];

    _communityApps.addSilent(_contract);

    c.appType = _type;
    c.abiIpfsHash = _abiIpfsHash;
    c.dataLink = _dataLink;

    emit AddCommunityApp(_contract);
  }

  function removeCommunityApp(address _contract) external onlyRole(ROLE_COMMUNITY_APPS_MANAGER) {
    _communityApps.remove(_contract);

    emit RemoveCommunityApp(_contract);
  }

  function addProposalMarker(
    bytes4 _methodSignature,
    address _destination,
    address _proposalManager,
    bytes32 _name,
    string calldata _dataLink
  )
    external
    onlyRole(ROLE_PROPOSAL_MARKERS_MANAGER)
  {
    bytes32 _marker = keccak256(abi.encode(_destination, _methodSignature));

    ProposalMarker storage m = proposalMarkers[_marker];

    m.active = true;
    m.proposalManager = _proposalManager;
    m.destination = _destination;
    m.name = _name;
    m.dataLink = _dataLink;

    emit AddProposalMarker(_marker, _proposalManager);
  }

  function removeProposalMarker(bytes32 _marker) external onlyRole(ROLE_PROPOSAL_MARKERS_MANAGER) {
    proposalMarkers[_marker].active = false;

    emit RemoveProposalMarker(_marker, proposalMarkers[_marker].proposalManager);
  }

  function replaceProposalMarker(
    bytes32 _oldMarker,
    bytes32 _newMethodSignature,
    address _newDestination
  )
    external
    onlyRole(ROLE_PROPOSAL_MARKERS_MANAGER)
  {
    bytes32 _newMarker = keccak256(abi.encode(_newDestination, _newMethodSignature));

    proposalMarkers[_newMarker] = proposalMarkers[_oldMarker];
    proposalMarkers[_newMarker].destination = _newDestination;
    proposalMarkers[_oldMarker].active = false;

    emit ReplaceProposalMarker(_oldMarker, _newMarker, proposalMarkers[_newMarker].proposalManager);
  }

  function addFeeContract(address _feeContract) external onlyRole(ROLE_FEE_MANAGER) {
    _feeContracts.add(_feeContract);

    emit AddFeeContract(_feeContract);
  }

  function removeFeeContract(address _feeContract) external onlyRole(ROLE_FEE_MANAGER) {
    _feeContracts.remove(_feeContract);

    emit RemoveFeeContract(_feeContract);
  }

  function setMemberIdentification(address _member, bytes32 _identificationHash) external onlyRole(ROLE_MEMBER_IDENTIFICATION_MANAGER) {
    membersIdentification[_member] = _identificationHash;

    emit SetMemberIdentification(_member, _identificationHash);
  }

  function setNameAndDataLink(
    string calldata _name,
    string calldata _dataLink
  )
    external
    onlyRole(ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER)
  {
    name = _name;
    dataLink = _dataLink;

    emit SetNameAndDataLink(_name, _dataLink);
  }

  function setMultiSigManager(
    bool _active,
    address _manager,
    string calldata _name,
    string calldata _dataLink
  )
    external
    onlyRole(ROLE_MEMBER_DETAILS_MANAGER)
  {
    MultiSigManager storage m = multiSigManagers[_manager];

    m.active = _active;
    m.name = _name;
    m.manager = _manager;
    m.dataLink = _dataLink;

    if (_active) {
      _activeMultisigManagers.addSilent(_manager);
    } else {
      _activeMultisigManagers.removeSilent(_manager);
    }

    emit SetMultiSigManager(_manager);
  }

  function setPeriodLimit(
    bool _active,
    address _erc20Contract,
    uint256 _amount
  )
    external
    onlyRole(ROLE_MULTI_SIG_WITHDRAWAL_LIMITS_MANAGER)
  {
    periodLimits[_erc20Contract].active = _active;
    periodLimits[_erc20Contract].amount = _amount;

    if (_active) {
      _activePeriodLimitsContracts.addSilent(_erc20Contract);
    } else {
      _activePeriodLimitsContracts.removeSilent(_erc20Contract);
    }

    emit SetPeriodLimit(_erc20Contract, _amount, _active);
  }

  function handleMultiSigTransaction(
    address _erc20Contract,
    uint256 _amount
  )
    external
    onlyMultiSig
  {
    PeriodLimit storage limit = periodLimits[_erc20Contract];
    if (limit.active == false) {
      return;
    }

    uint256 currentPeriod = getCurrentPeriod();
    // uint256 runningTotalAfter = _periodRunningTotals[currentPeriod][_erc20Contract] + _amount;
    uint256 runningTotalAfter = _periodRunningTotals[currentPeriod][_erc20Contract].add(_amount);

    require(runningTotalAfter <= periodLimits[_erc20Contract].amount, "Running total for the current period exceeds the limit");
    _periodRunningTotals[currentPeriod][_erc20Contract] = runningTotalAfter;

    emit HandleMultiSigTransaction(_erc20Contract, _amount);
  }

  // INTERNAL

  function _validateVotingConfig(
    uint256 _support,
    uint256 _minAcceptQuorum,
    uint256 _timeout
  )
    internal
    pure
  {
    require(_minAcceptQuorum > 0, "Invalid min accept quorum value");
    require(_support > 0 && _support <= ONE_HUNDRED_PCT, "Invalid support value");
    require(_timeout > 0, "Invalid duration value");
  }

  // GETTERS

  function getThresholdMarker(address _destination, bytes memory _data) public pure returns(bytes32 marker) {
    bytes32 methodName;

    assembly {
      methodName := and(mload(add(_data, 0x20)), 0xffffffff00000000000000000000000000000000000000000000000000000000)
    }

    return keccak256(abi.encode(_destination, methodName));
  }

  function getProposalVotingConfig(
    bytes32 _key
  )
    external
    view
    returns (uint256 support, uint256 minAcceptQuorum, uint256 timeout)
  {
    uint256 to = customVotingConfigs[_key].timeout;

    if (to > 0) {
      return (
        customVotingConfigs[_key].support,
        customVotingConfigs[_key].minAcceptQuorum,
        customVotingConfigs[_key].timeout
      );
    } else {
      return (
        defaultVotingConfig.support,
        defaultVotingConfig.minAcceptQuorum,
        defaultVotingConfig.timeout
      );
    }
  }

  function getCommunityApps() external view returns (address[] memory) {
    return _communityApps.elements();
  }

  function areMembersValid(address[] calldata _members) external view returns (bool) {
    uint256 len = _members.length;

    for (uint256 i = 0; i < len; i++) {
      if (multiSigManagers[_members[i]].active == false) {
        return false;
      }
    }

    return true;
  }

  function getActiveMultisigManagers() external view returns (address[] memory) {
    return _activeMultisigManagers.elements();
  }

  function getActiveMultisigManagersCount() external view returns (uint256) {
    return _activeMultisigManagers.size();
  }

  function getActivePeriodLimits() external view returns (address[] memory) {
    return _activePeriodLimitsContracts.elements();
  }

  function getActivePeriodLimitsCount() external view returns (uint256) {
    return _activePeriodLimitsContracts.size();
  }

  function getFeeContracts() external view returns (address[] memory) {
    return _feeContracts.elements();
  }

  function getFeeContractCount() external view returns (uint256) {
    return _feeContracts.size();
  }

  function getCurrentPeriod() public view returns (uint256) {
    // return (block.timestamp - initialTimestamp) / periodLength;
    return (block.timestamp.sub(initialTimestamp)) / periodLength;
  }
}
