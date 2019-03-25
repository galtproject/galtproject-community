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

pragma solidity 0.5.3;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "@galtproject/libs/contracts/traits/Permissionable.sol";
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "@galtproject/libs/contracts/traits/Initializable.sol";
import "@galtproject/core/contracts/registries/GaltGlobalRegistry.sol";
import "./FundMultiSig.sol";
import "./interfaces/IRSRA.sol";
import "./FundController.sol";


contract FundStorage is Permissionable, Initializable {
  using ArraySet for ArraySet.AddressSet;
  using ArraySet for ArraySet.Uint256Set;
  using ArraySet for ArraySet.Bytes32Set;

  string public constant DECREMENT_TOKEN_REPUTATION_ROLE = "decrement_token_reputation_role";

  string public constant CONTRACT_WHITELIST_MANAGER = "wl_manager";
  string public constant CONTRACT_CONFIG_MANAGER = "config_manager";
  string public constant CONTRACT_NEW_MEMBER_MANAGER = "new_member_manager";
  string public constant CONTRACT_EXPEL_MEMBER_MANAGER = "expel_member_manager";
  string public constant CONTRACT_FINE_MEMBER_INCREMENT_MANAGER = "fine_member_increment_manager";
  string public constant CONTRACT_FINE_MEMBER_DECREMENT_MANAGER = "fine_member_decrement_manager";
  string public constant CONTRACT_CHANGE_NAME_AND_DESCRIPTION_MANAGER = "change_name_and_description_manager";
  string public constant CONTRACT_ADD_FUND_RULE_MANAGER = "add_fund_rule_manager";
  string public constant CONTRACT_DEACTIVATE_FUND_RULE_MANAGER = "deactivate_fund_rule_manager";
  string public constant CONTRACT_FEE_MANAGER = "contract_fee_manager";
  string public constant CONTRACT_MEMBER_DETAILS_MANAGER = "contract_member_details_manager";
  string public constant CONTRACT_MULTI_SIG_WITHDRAWAL_LIMITS_MANAGER = "contract_multi_sig_withdrawal_limits_manager";

  bytes32 public constant CONTRACT_CORE_RSRA = "contract_core_rsra";
  bytes32 public constant CONTRACT_CORE_MULTISIG = "contract_core_multisig";
  bytes32 public constant CONTRACT_CORE_CONTROLLER = "contract_core_controller";

  bytes32 public constant MANAGE_WL_THRESHOLD = bytes32("manage_wl_threshold");
  bytes32 public constant MODIFY_CONFIG_THRESHOLD = bytes32("modify_config_threshold");
  bytes32 public constant NEW_MEMBER_THRESHOLD = bytes32("new_member_threshold");
  bytes32 public constant EXPEL_MEMBER_THRESHOLD = bytes32("expel_member_threshold");
  bytes32 public constant FINE_MEMBER_THRESHOLD = bytes32("fine_member_threshold");
  bytes32 public constant NAME_AND_DESCRIPTION_THRESHOLD = bytes32("name_and_description_threshold");
  bytes32 public constant ADD_FUND_RULE_THRESHOLD = bytes32("add_fund_rule_threshold");
  bytes32 public constant DEACTIVATE_FUND_RULE_THRESHOLD = bytes32("deactivate_fund_rule_threshold");
  bytes32 public constant CHANGE_MS_OWNERS_THRESHOLD = bytes32("change_ms_owners_threshold");
  bytes32 public constant MODIFY_FEE_THRESHOLD = bytes32("modify_fee_threshold");
  bytes32 public constant MODIFY_MANAGER_DETAILS_THRESHOLD = bytes32("modify_manager_details_threshold");
  bytes32 public constant CHANGE_WITHDRAWAL_LIMITS_THRESHOLD = bytes32("withdrawal_limits_threshold");
  bytes32 public constant IS_PRIVATE = bytes32("is_private");

  struct FundRule {
    bool active;
    uint256 id;
    address manager;
    bytes32 ipfsHash;
    string description;
    uint256 createdAt;
  }

  struct ProposalContract {
    bytes32 abiIpfsHash;
    bytes32 contractType;
    string description;
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
    uint256[] proposals;
    address[] proposalsManagers;
  }

  struct PeriodLimit {
    bool active;
    uint256 amount;
  }

  string public name;
  string public description;
  uint256 public initialTimestamp;
  uint256 public periodLength;

  GaltGlobalRegistry public ggr;

  ArraySet.AddressSet private _whiteListedContracts;
  ArraySet.Uint256Set private _activeFundRules;
  ArraySet.Bytes32Set private _configKeys;
  ArraySet.Uint256Set private _finesSpaceTokens;
  ArraySet.AddressSet private feeContracts;

  mapping(uint256 => ArraySet.AddressSet) private _finesContractsBySpaceToken;

  mapping(bytes32 => bytes32) private _config;
  // spaceTokenId => isMintApproved
  mapping(uint256 => bool) private _mintApprovals;
  // spaceTokenId => isExpelled
  mapping(uint256 => bool) private _expelledTokens;
  // spaceTokenId => availableAmountToBurn
  mapping(uint256 => uint256) private _expelledTokenReputation;
  // spaceTokenId => isLocked
  mapping(uint256 => bool) private _lockedSpaceTokens;
  // FRP => fundRuleDetails
  mapping(uint256 => FundRule) private _fundRules;
  // contractAddress => details
  mapping(address => ProposalContract) private _proposalContracts;
  // role => address
  mapping(bytes32 => address) private _coreContracts;
  // spaceTokenId => details
  mapping(uint256 => MemberFines) private _fines;
  // manager => details
  mapping(address => MultiSigManager) private _multiSigManagers;
  // erc20Contract => details
  mapping(address => PeriodLimit) private _periodLimits;
  // periodId => (erc20Contract => runningTotal)
  mapping(uint256 => mapping(address => uint256)) private _periodRunningTotals;

  modifier onlyFeeContract() {
    require(feeContracts.has(msg.sender), "Not a fee contract");

    _;
  }

  modifier onlyMultiSig() {
    require(msg.sender == _coreContracts[CONTRACT_CORE_MULTISIG], "Not a fee contract");

    _;
  }

  constructor (
    GaltGlobalRegistry _ggr,
    bool _isPrivate,
    uint256[] memory _thresholds,
    uint256 _periodLength
  ) public {
    ggr = _ggr;

    _config[IS_PRIVATE] = _isPrivate ? bytes32(uint256(1)) : bytes32(uint256(0));
    _configKeys.add(IS_PRIVATE);
    _config[MANAGE_WL_THRESHOLD] = bytes32(_thresholds[0]);
    _configKeys.add(MANAGE_WL_THRESHOLD);
    _config[MODIFY_CONFIG_THRESHOLD] = bytes32(_thresholds[1]);
    _configKeys.add(MODIFY_CONFIG_THRESHOLD);
    _config[NEW_MEMBER_THRESHOLD] = bytes32(_thresholds[2]);
    _configKeys.add(NEW_MEMBER_THRESHOLD);
    _config[EXPEL_MEMBER_THRESHOLD] = bytes32(_thresholds[3]);
    _configKeys.add(EXPEL_MEMBER_THRESHOLD);
    _config[FINE_MEMBER_THRESHOLD] = bytes32(_thresholds[4]);
    _configKeys.add(FINE_MEMBER_THRESHOLD);
    _config[NAME_AND_DESCRIPTION_THRESHOLD] = bytes32(_thresholds[5]);
    _configKeys.add(NAME_AND_DESCRIPTION_THRESHOLD);
    _config[ADD_FUND_RULE_THRESHOLD] = bytes32(_thresholds[6]);
    _configKeys.add(ADD_FUND_RULE_THRESHOLD);
    _config[DEACTIVATE_FUND_RULE_THRESHOLD] = bytes32(_thresholds[7]);
    _configKeys.add(DEACTIVATE_FUND_RULE_THRESHOLD);
    _config[CHANGE_MS_OWNERS_THRESHOLD] = bytes32(_thresholds[8]);
    _configKeys.add(CHANGE_MS_OWNERS_THRESHOLD);
    _config[MODIFY_FEE_THRESHOLD] = bytes32(_thresholds[9]);
    _configKeys.add(MODIFY_FEE_THRESHOLD);
    _config[MODIFY_MANAGER_DETAILS_THRESHOLD] = bytes32(_thresholds[10]);
    _configKeys.add(MODIFY_MANAGER_DETAILS_THRESHOLD);
    _config[CHANGE_WITHDRAWAL_LIMITS_THRESHOLD] = bytes32(_thresholds[11]);
    _configKeys.add(CHANGE_WITHDRAWAL_LIMITS_THRESHOLD);

    periodLength = _periodLength;
    initialTimestamp = block.timestamp;
  }

  function initialize(
    FundMultiSig _fundMultiSig,
    FundController _fundController,
    IRSRA _rsra
  )
    external
    isInitializer
  {
    _coreContracts[CONTRACT_CORE_MULTISIG] = address(_fundMultiSig);
    _coreContracts[CONTRACT_CORE_CONTROLLER] = address(_fundController);
    _coreContracts[CONTRACT_CORE_RSRA] = address(_rsra);
  }

  function setConfigValue(bytes32 _key, bytes32 _value) external onlyRole(CONTRACT_CONFIG_MANAGER) {
    _config[_key] = _value;
    _configKeys.addSilent(_key);
  }

  function approveMint(uint256 _spaceTokenId) external onlyRole(CONTRACT_NEW_MEMBER_MANAGER) {
    _mintApprovals[_spaceTokenId] = true;
  }

  function expel(uint256 _spaceTokenId, uint256 _amount) external onlyRole(CONTRACT_EXPEL_MEMBER_MANAGER) {
    require(_expelledTokens[_spaceTokenId] == false, "Already Expelled");

    _expelledTokens[_spaceTokenId] = true;
    _expelledTokenReputation[_spaceTokenId] = _amount;
  }

  function decrementExpelledTokenReputation(
    uint256 _spaceTokenId,
    uint256 _amount
  )
    external
    onlyRole(DECREMENT_TOKEN_REPUTATION_ROLE)
    returns (bool completelyBurned)
  {
    require(_amount > 0 && _amount <= _expelledTokenReputation[_spaceTokenId], "Invalid reputation amount");

    _expelledTokenReputation[_spaceTokenId] = _expelledTokenReputation[_spaceTokenId] - _amount;

    completelyBurned = (_expelledTokenReputation[_spaceTokenId] == 0);
  }

  function incrementFine(uint256 _spaceTokenId, address _contract, uint256 _amount, uint256 _proposalId) external onlyRole(CONTRACT_FINE_MEMBER_INCREMENT_MANAGER) {
    _fines[_spaceTokenId].tokenFines[_contract].proposals.push(_proposalId);
    _fines[_spaceTokenId].tokenFines[_contract].proposalsManagers.push(msg.sender);

    _fines[_spaceTokenId].tokenFines[_contract].amount += _amount;
    _fines[_spaceTokenId].total += _amount;

    _finesSpaceTokens.addSilent(_spaceTokenId);
    _finesContractsBySpaceToken[_spaceTokenId].addSilent(_contract);
  }

  function decrementFine(uint256 _spaceTokenId, address _contract, uint256 _amount) external onlyRole(CONTRACT_FINE_MEMBER_DECREMENT_MANAGER) {
    _fines[_spaceTokenId].tokenFines[_contract].amount -= _amount;
    _fines[_spaceTokenId].total -= _amount;

    if (_fines[_spaceTokenId].tokenFines[_contract].amount == 0) {
      _finesContractsBySpaceToken[_spaceTokenId].remove(_contract);
    }

    if (_fines[_spaceTokenId].total == 0) {
      _finesSpaceTokens.remove(_spaceTokenId);
    }
  }

  function addWhiteListedContract(
    address _contract,
    bytes32 _type,
    bytes32 _abiIpfsHash,
    string calldata _description
  )
    external
    onlyRole(CONTRACT_WHITELIST_MANAGER)
  {
    _whiteListedContracts.addSilent(_contract);

    ProposalContract storage c = _proposalContracts[_contract];

    c.contractType = _type;
    c.abiIpfsHash = _abiIpfsHash;
    c.description = _description;
  }

  function removeWhiteListedContract(address _contract) external onlyRole(CONTRACT_WHITELIST_MANAGER) {
    _whiteListedContracts.remove(_contract);
  }

  function addFundRule(
    uint256 _id,
    bytes32 _ipfsHash,
    string calldata _description
  )
    external
    onlyRole(CONTRACT_ADD_FUND_RULE_MANAGER)
  {
    FundRule storage fundRule = _fundRules[_id];

    fundRule.active = true;
    fundRule.id = _id;
    fundRule.ipfsHash = _ipfsHash;
    fundRule.description = _description;
    fundRule.manager = msg.sender;
    fundRule.createdAt = block.timestamp;

    _activeFundRules.add(_id);
  }

  function addFeeContract(address _feeContract) external onlyRole(CONTRACT_FEE_MANAGER) {
    feeContracts.add(_feeContract);
  }

  function lockSpaceToken(uint256 _spaceTokenId) external onlyFeeContract {
    _lockedSpaceTokens[_spaceTokenId] = true;
  }

  function unlockSpaceToken(uint256 _spaceTokenId) external onlyFeeContract {
    _lockedSpaceTokens[_spaceTokenId] = false;
  }

  function disableFundRule(uint256 _id) external onlyRole(CONTRACT_DEACTIVATE_FUND_RULE_MANAGER) {
    _fundRules[_id].active = false;

    _activeFundRules.remove(_id);
  }

  function setNameAndDescription(
    string calldata _name,
    string calldata _description
  )
    external
    onlyRole(CONTRACT_CHANGE_NAME_AND_DESCRIPTION_MANAGER)
  {
    name = _name;
    description = _description;
  }

  function setMultiSigManager(
    bool _active,
    address _manager,
    string calldata _name,
    bytes32[] calldata _documents
  )
    external
    onlyRole(CONTRACT_MEMBER_DETAILS_MANAGER)
  {
    MultiSigManager storage m = _multiSigManagers[_manager];

    m.active = _active;
    m.name = _name;
    m.documents = _documents;
  }

  function setPeriodLimit(
    bool _active,
    address _erc20Contract,
    uint256 _amount
  )
    external
    onlyRole(CONTRACT_MULTI_SIG_WITHDRAWAL_LIMITS_MANAGER)
  {
    _periodLimits[_erc20Contract].active = _active;
    _periodLimits[_erc20Contract].amount = _amount;
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
    uint256 runningTotalAfter = _periodRunningTotals[currentPeriod][_erc20Contract] + _amount;

    require(runningTotalAfter <= _periodLimits[_erc20Contract].amount, "Running total for the current period exceeds the limit");
    _periodRunningTotals[currentPeriod][_erc20Contract] = runningTotalAfter;
  }

  // GETTERS
  function getConfigValue(bytes32 _key) external view returns (bytes32) {
    return _config[_key];
  }

  function getFineAmount(uint256 _spaceTokenId, address _erc20Contract) external view returns (uint256) {
    return _fines[_spaceTokenId].tokenFines[_erc20Contract].amount;
  }

  function getFineProposals(uint256 _spaceTokenId, address _erc20Contract) external view returns (uint256[] memory) {
    return _fines[_spaceTokenId].tokenFines[_erc20Contract].proposals;
  }

  function getFineProposalsManagers(uint256 _spaceTokenId, address _erc20Contract) external view returns (address[] memory) {
    return _fines[_spaceTokenId].tokenFines[_erc20Contract].proposalsManagers;
  }

  function getTotalFineAmount(uint256 _spaceTokenId) external view returns (uint256) {
    return _fines[_spaceTokenId].total;
  }

  function getExpelledToken(uint256 _spaceTokenId) external view returns (bool isExpelled, uint256 amount) {
    return (_expelledTokens[_spaceTokenId], _expelledTokenReputation[_spaceTokenId]);
  }

  function getWhiteListedContracts() external view returns (address[] memory) {
    return _whiteListedContracts.elements();
  }

  function getConfigKeys() external view returns (bytes32[] memory) {
    return _configKeys.elements();
  }

  function getActiveFundRules() external view returns (uint256[] memory) {
    return _activeFundRules.elements();
  }

  function getActiveFundRulesCount() external view returns (uint256) {
    return _activeFundRules.size();
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

  function getMultiSig() public view returns (FundMultiSig) {
    address payable ms = address(uint160(_coreContracts[CONTRACT_CORE_MULTISIG]));
    return FundMultiSig(ms);
  }

  function getRsra() public view returns (IRSRA) {
    return IRSRA(_coreContracts[CONTRACT_CORE_RSRA]);
  }

  function getController() public view returns (FundController) {
    return FundController(_coreContracts[CONTRACT_CORE_CONTROLLER]);
  }

  function getProposalContract(
    address _contract
  )
    external
    view
    returns (
      bytes32 contractType,
      bytes32 abiIpfsHash,
      string memory description
    )
  {
    ProposalContract storage c = _proposalContracts[_contract];

    contractType = c.contractType;
    abiIpfsHash = c.abiIpfsHash;
    description = c.description;
  }

  function getFundRule(uint256 _frpId) external view returns (
    bool active,
    uint256 id,
    address manager,
    bytes32 ipfsHash,
    string memory description,
    uint256 createdAt
  )
  {
    FundRule storage r = _fundRules[_frpId];

    active = r.active;
    id = r.id;
    manager = r.manager;
    ipfsHash = r.ipfsHash;
    description = r.description;
    createdAt = r.createdAt;
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

  function areMembersValid(address[] calldata _members) external view returns (bool) {
    uint256 len = _members.length;

    for (uint256 i = 0; i < len; i++) {
      if (_multiSigManagers[_members[i]].active == false) {
        return false;
      }
    }

    return true;
  }

  function getFeeContracts() external view returns (address[] memory) {
    return feeContracts.elements();
  }

  function getFeeContractCount() external view returns (uint256) {
    return feeContracts.size();
  }

  function isSpaceTokenLocked(uint256 _spaceTokenId) external view returns (bool) {
    return _lockedSpaceTokens[_spaceTokenId];
  }

  function getPeriodLimit(address _erc20Contract) external view returns (bool active, uint256 amount) {
    PeriodLimit storage p = _periodLimits[_erc20Contract];
    return (p.active, p.amount);
  }

  function getCurrentPeriod() public view returns (uint256) {
    return (block.timestamp - initialTimestamp) / periodLength;
  }
}
