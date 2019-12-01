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
import "@galtproject/libs/contracts/traits/Permissionable.sol";
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "@galtproject/libs/contracts/traits/Initializable.sol";
import "../common/FundMultiSig.sol";
import "../common/FundProposalManager.sol";
import "../common/interfaces/IFundRA.sol";
import "./interfaces/IAbstractFundStorage.sol";


contract AbstractFundStorage is IAbstractFundStorage, Permissionable, Initializable {
  using SafeMath for uint256;

  using ArraySet for ArraySet.AddressSet;
  using ArraySet for ArraySet.Uint256Set;
  using ArraySet for ArraySet.Bytes32Set;
  using Counters for Counters.Counter;

  // 100% == 100 ether
  uint256 public constant ONE_HUNDRED_PCT = 100 ether;

  string public constant ROLE_CONFIG_MANAGER = "config_manager";
  string public constant ROLE_WHITELIST_CONTRACTS_MANAGER = "wl_manager";
  string public constant ROLE_PROPOSAL_MARKERS_MANAGER = "marker_manager";
  string public constant ROLE_NEW_MEMBER_MANAGER = "new_member_manager";
  string public constant ROLE_EXPEL_MEMBER_MANAGER = "expel_member_manager";
  string public constant ROLE_FINE_MEMBER_INCREMENT_MANAGER = "fine_member_increment_manager";
  string public constant ROLE_FINE_MEMBER_DECREMENT_MANAGER = "fine_member_decrement_manager";
  string public constant ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER = "change_name_and_data_link_manager";
  string public constant ROLE_ADD_FUND_RULE_MANAGER = "add_fund_rule_manager";
  string public constant ROLE_DEACTIVATE_FUND_RULE_MANAGER = "deactivate_fund_rule_manager";
  string public constant ROLE_FEE_MANAGER = "contract_fee_manager";
  string public constant ROLE_MEMBER_DETAILS_MANAGER = "contract_member_details_manager";
  string public constant ROLE_MULTI_SIG_WITHDRAWAL_LIMITS_MANAGER = "contract_multi_sig_withdrawal_limits_manager";
  string public constant ROLE_MEMBER_IDENTIFICATION_MANAGER = "contract_member_identification_manager";
  string public constant ROLE_PROPOSAL_THRESHOLD_MANAGER = "contract_threshold_manager";
  string public constant ROLE_DEFAULT_PROPOSAL_THRESHOLD_MANAGER = "contract_default_threshold_manager";
  string public constant ROLE_DECREMENT_TOKEN_REPUTATION = "decrement_token_reputation_role";

  bytes32 public constant CONTRACT_CORE_RA = "contract_core_ra";
  bytes32 public constant CONTRACT_CORE_MULTISIG = "contract_core_multisig";
  bytes32 public constant CONTRACT_CORE_CONTROLLER = "contract_core_controller";
  bytes32 public constant CONTRACT_CORE_PROPOSAL_MANAGER = "contract_core_proposal_manager";

  bytes32 public constant IS_PRIVATE = bytes32("is_private");

  event AddProposalMarker(bytes32 indexed marker, address indexed proposalManager);
  event RemoveProposalMarker(bytes32 indexed marker, address indexed proposalManager);
  event ReplaceProposalMarker(bytes32 indexed oldMarker, bytes32 indexed newMarker, address indexed proposalManager);

  event SetProposalVotingConfig(bytes32 indexed key, uint256 support, uint256 minAcceptQuorum, uint256 timeout);
  event SetDefaultProposalVotingConfig(uint256 support, uint256 minAcceptQuorum, uint256 timeout);

  event AddCommunityApp(address indexed contractAddress);
  event RemoveCommunityApp(address indexed contractAddress);

  event AddFundRule(uint256 indexed id);
  event DisableFundRule(uint256 indexed id);

  event AddFeeContract(address indexed contractAddress);
  event RemoveFeeContract(address indexed contractAddress);

  event SetMemberIdentification(address indexed member, bytes32 identificationHash);
  event SetNameAndDataLink(string name, string dataLink);
  event SetMultiSigManager(address indexed manager);
  event SetPeriodLimit(address indexed erc20Contract, uint256 amount, bool active);
  event HandleMultiSigTransaction(address indexed erc20Contract, uint256 amount);

  event SetConfig(bytes32 indexed key, bytes32 value);

  struct FundRule {
    bool active;
    uint256 id;
    address manager;
    bytes32 ipfsHash;
    string dataLink;
    uint256 createdAt;
  }

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
    bytes32[] documents;
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

  string public name;
  string public dataLink;
  uint256 public initialTimestamp;
  uint256 public periodLength;

  ArraySet.AddressSet internal _communityApps;
  ArraySet.Uint256Set internal _activeFundRules;
  ArraySet.AddressSet internal _feeContracts;

  Counters.Counter internal fundRuleCounter;

  ArraySet.AddressSet internal _activeMultisigManagers;
  ArraySet.AddressSet internal _activePeriodLimitsContracts;

  mapping(bytes32 => bytes32) internal _config;
  // contractAddress => details
  mapping(address => CommunityApp) internal _communityAppsInfo;
  // marker => details
  mapping(bytes32 => ProposalMarker) internal _proposalMarkers;
  // role => address
  mapping(bytes32 => address) internal _coreContracts;
  // manager => details
  mapping(address => MultiSigManager) internal _multiSigManagers;
  // erc20Contract => details
  mapping(address => PeriodLimit) internal _periodLimits;
  // periodId => (erc20Contract => runningTotal)
  mapping(uint256 => mapping(address => uint256)) internal _periodRunningTotals;
  // member => identification hash
  mapping(address => bytes32) internal _membersIdentification;

  // FRP => fundRuleDetails
  mapping(uint256 => FundRule) public fundRules;

  struct VotingConfig {
    uint256 support;
    uint256 minAcceptQuorum;
    uint256 timeout;
  }

  // marker => customVotingConfigs
  mapping(bytes32 => VotingConfig) public customVotingConfigs;
  VotingConfig public defaultVotingConfig;

  modifier onlyFeeContract() {
    require(_feeContracts.has(msg.sender), "Not a fee contract");

    _;
  }

  modifier onlyMultiSig() {
    require(msg.sender == _coreContracts[CONTRACT_CORE_MULTISIG], "Not a fee contract");

    _;
  }

  constructor (
    bool _isPrivate,
    uint256 _defaultProposalSupport,
    uint256 _defaultProposalMinAcceptQuorum,
    uint256 _defaultProposalTimeout,
    uint256 _periodLength
  ) public {
    _config[IS_PRIVATE] = _isPrivate ? bytes32(uint256(1)) : bytes32(uint256(0));

    periodLength = _periodLength;
    initialTimestamp = block.timestamp;

    _validateVotingConfig(_defaultProposalSupport, _defaultProposalMinAcceptQuorum, _defaultProposalTimeout);

    defaultVotingConfig.support = _defaultProposalSupport;
    defaultVotingConfig.minAcceptQuorum = _defaultProposalMinAcceptQuorum;
    defaultVotingConfig.timeout = _defaultProposalTimeout;

    _addRoleTo(msg.sender, ROLE_PROPOSAL_THRESHOLD_MANAGER);
  }

  function initialize(
    address _fundMultiSig,
    address _fundController,
    address _fundRA,
    address _fundProposalManager
  )
    external
    isInitializer
  {
    _coreContracts[CONTRACT_CORE_MULTISIG] = _fundMultiSig;
    _coreContracts[CONTRACT_CORE_CONTROLLER] = _fundController;
    _coreContracts[CONTRACT_CORE_RA] = _fundRA;
    _coreContracts[CONTRACT_CORE_PROPOSAL_MANAGER] = _fundProposalManager;
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
    _config[_key] = _value;

    emit SetConfig(_key, _value);
  }

  function addCommunityApp(
    address _contract,
    bytes32 _type,
    bytes32 _abiIpfsHash,
    string calldata _dataLink
  )
    external
    onlyRole(ROLE_WHITELIST_CONTRACTS_MANAGER)
  {
    CommunityApp storage c = _communityAppsInfo[_contract];

    _communityApps.addSilent(_contract);

    c.appType = _type;
    c.abiIpfsHash = _abiIpfsHash;
    c.dataLink = _dataLink;

    emit AddCommunityApp(_contract);
  }

  function removeCommunityApp(address _contract) external onlyRole(ROLE_WHITELIST_CONTRACTS_MANAGER) {
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

    ProposalMarker storage m = _proposalMarkers[_marker];

    m.active = true;
    m.proposalManager = _proposalManager;
    m.destination = _destination;
    m.name = _name;
    m.dataLink = _dataLink;

    emit AddProposalMarker(_marker, _proposalManager);
  }

  function removeProposalMarker(bytes32 _marker) external onlyRole(ROLE_PROPOSAL_MARKERS_MANAGER) {
    _proposalMarkers[_marker].active = false;

    emit RemoveProposalMarker(_marker, _proposalMarkers[_marker].proposalManager);
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

    _proposalMarkers[_newMarker] = _proposalMarkers[_oldMarker];
    _proposalMarkers[_newMarker].destination = _newDestination;
    _proposalMarkers[_oldMarker].active = false;

    emit ReplaceProposalMarker(_oldMarker, _newMarker, _proposalMarkers[_newMarker].proposalManager);
  }

  function addFundRule(
    bytes32 _ipfsHash,
    string calldata _dataLink
  )
    external
    onlyRole(ROLE_ADD_FUND_RULE_MANAGER)
    returns (uint256)
  {
    uint256 _id = fundRuleCounter.current();
    fundRuleCounter.increment();

    FundRule storage fundRule = fundRules[_id];

    fundRule.active = true;
    fundRule.id = _id;
    fundRule.ipfsHash = _ipfsHash;
    fundRule.dataLink = _dataLink;
    fundRule.manager = msg.sender;
    fundRule.createdAt = block.timestamp;

    _activeFundRules.add(_id);

    emit AddFundRule(_id);

    return _id;
  }

  function disableFundRule(uint256 _id) external onlyRole(ROLE_DEACTIVATE_FUND_RULE_MANAGER) {
    fundRules[_id].active = false;

    _activeFundRules.remove(_id);

    emit DisableFundRule(_id);
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
    _membersIdentification[_member] = _identificationHash;

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
    bytes32[] calldata _documents
  )
    external
    onlyRole(ROLE_MEMBER_DETAILS_MANAGER)
  {
    MultiSigManager storage m = _multiSigManagers[_manager];

    m.active = _active;
    m.name = _name;
    m.documents = _documents;

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
    _periodLimits[_erc20Contract].active = _active;
    _periodLimits[_erc20Contract].amount = _amount;

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
    PeriodLimit storage limit = _periodLimits[_erc20Contract];
    if (limit.active == false) {
      return;
    }

    uint256 currentPeriod = getCurrentPeriod();
    // uint256 runningTotalAfter = _periodRunningTotals[currentPeriod][_erc20Contract] + _amount;
    uint256 runningTotalAfter = _periodRunningTotals[currentPeriod][_erc20Contract].add(_amount);

    require(runningTotalAfter <= _periodLimits[_erc20Contract].amount, "Running total for the current period exceeds the limit");
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
  {
    require(_minAcceptQuorum > 0 && _minAcceptQuorum <= _support, "Invalid min accept quorum value");
    require(_support > 0 && _support <= ONE_HUNDRED_PCT, "Invalid support value");
    require(_timeout > 0, "Invalid duration value");
  }

  // GETTERS

  function getMemberIdentification(address _member) external view returns(bytes32) {
    return _membersIdentification[_member];
  }

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

  function getConfigValue(bytes32 _key) external view returns (bytes32) {
    return _config[_key];
  }

  function getCommunityApps() external view returns (address[] memory) {
    return _communityApps.elements();
  }

  function getActiveFundRules() external view returns (uint256[] memory) {
    return _activeFundRules.elements();
  }

  function getActiveFundRulesCount() external view returns (uint256) {
    return _activeFundRules.size();
  }

  function getMultiSig() public view returns (FundMultiSig) {
    address payable ms = address(uint160(_coreContracts[CONTRACT_CORE_MULTISIG]));
    return FundMultiSig(ms);
  }

  function getRA() public view returns (IFundRA) {
    return IFundRA(_coreContracts[CONTRACT_CORE_RA]);
  }

  function getProposalManager() public view returns (FundProposalManager) {
    return FundProposalManager(_coreContracts[CONTRACT_CORE_PROPOSAL_MANAGER]);
  }

  function getCommunityAppInfo(
    address _contract
  )
    external
    view
    returns (
      bytes32 _appType,
      bytes32 _abiIpfsHash,
      string memory _dataLink
    )
  {
    CommunityApp storage c = _communityAppsInfo[_contract];

    _appType = c.appType;
    _abiIpfsHash = c.abiIpfsHash;
    _dataLink = c.dataLink;
  }

  function getProposalMarker(
    bytes32 _marker
  )
    external
    view
    returns (
      address _proposalManager,
      address _destination,
      bytes32 _name,
      string memory _dataLink
    )
  {
    ProposalMarker storage m = _proposalMarkers[_marker];

    _proposalManager = m.proposalManager;
    _destination = m.destination;
    _name = m.name;
    _dataLink = m.dataLink;
  }

  function areMembersValid(address[] calldata _members) external view returns (bool) {
    uint256 len = _members.length;

    for (uint256 i = 0; i < len; i++) {
      if (_multiSigManagers[_members[i]].active == false) {
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

  function getMultisigManager(address _manager) external view returns (
    bool active,
    string memory managerName,
    bytes32[] memory documents
  )
  {
    return (
      _multiSigManagers[_manager].active,
      _multiSigManagers[_manager].name,
      _multiSigManagers[_manager].documents
    );
  }

  function getPeriodLimit(address _erc20Contract) external view returns (bool active, uint256 amount) {
    PeriodLimit storage p = _periodLimits[_erc20Contract];
    return (p.active, p.amount);
  }

  function getCurrentPeriod() public view returns (uint256) {
    // return (block.timestamp - initialTimestamp) / periodLength;
    return (block.timestamp.sub(initialTimestamp)) / periodLength;
  }
}
