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


contract FundStorage is Permissionable {
  using ArraySet for ArraySet.AddressSet;
  using ArraySet for ArraySet.Uint256Set;

  string public constant CONTRACT_WHITELIST_MANAGER = "wl_manager";
  string public constant CONTRACT_CONFIG_MANAGER = "config_manager";
  string public constant CONTRACT_NEW_MEMBER_MANAGER = "new_member_manager";
  string public constant CONTRACT_EXPEL_MEMBER_MANAGER = "expel_member_manager";
  string public constant CONTRACT_FINE_MEMBER_INCREMENT_MANAGER = "fine_member_increment_manager";
  string public constant CONTRACT_FINE_MEMBER_DECREMENT_MANAGER = "fine_member_decrement_manager";
  string public constant CONTRACT_CHANGE_NAME_AND_DESCRIPTION_MANAGER = "change_name_and_description_manager";
  string public constant CONTRACT_ADD_FUND_RULE_MANAGER = "add_fund_rule_manager";
  string public constant CONTRACT_DEACTIVATE_FUND_RULE_MANAGER = "deactivate_fund_rule_manager";
  string public constant CONTRACT_RSRA = "rsra";

  bytes32 public constant MANAGE_WL_THRESHOLD = bytes32("manage_wl_threshold");
  bytes32 public constant MODIFY_CONFIG_THRESHOLD = bytes32("modify_config_threshold");
  bytes32 public constant NEW_MEMBER_THRESHOLD = bytes32("new_member_threshold");
  bytes32 public constant EXPEL_MEMBER_THRESHOLD = bytes32("expel_member_threshold");
  bytes32 public constant FINE_MEMBER_THRESHOLD = bytes32("fine_member_threshold");
  bytes32 public constant NAME_AND_DESCRIPTION_THRESHOLD = bytes32("name_and_description_threshold");
  bytes32 public constant ADD_FUND_RULE_THRESHOLD = bytes32("add_fund_rule_threshold");
  bytes32 public constant DEACTIVATE_FUND_RULE_THRESHOLD = bytes32("deactivate_fund_rule_threshold");
  bytes32 public constant IS_PRIVATE = bytes32("is_private");

  struct FundRule {
    bool active;
    uint256 id;
    bytes32 ipfsHash;
    string description;
  }

  struct ProposalContract {
    bytes32 abiIpfsHash;
    string description;
  }

  string public name;
  string public description;

  ArraySet.AddressSet private _whiteListedContracts;
  ArraySet.Uint256Set private _activeFundRules;

  mapping(bytes32 => bytes32) private _config;
  // spaceTokenId => isMintApproved
  mapping(uint256 => bool) private _mintApprovals;
  // spaceTokenId => amount
  mapping(uint256 => uint256) private _fines;
  // spaceTokenId => isExpelled
  mapping(uint256 => bool) private _expelledTokens;
  // spaceTokenId => availableAmountToBurn
  mapping(uint256 => uint256) private _expelledTokenReputation;
  // FRP => fundRuleDetails
  mapping(uint256 => FundRule) private _fundRules;
  // contractAddress => details
  mapping(address => ProposalContract) private _proposalContracts;

  constructor (
    bool _isPrivate,
    uint256 _manageWhiteListThreshold,
    uint256 _modifyConfigThreshold,
    uint256 _newMemberThreshold,
    uint256 _expelMemberThreshold,
    uint256 _fineMemberThreshold,
    uint256 _changeNameAndDescriptionThreshold,
    uint256 _addFundRuleThreshold,
    uint256 _deactivateFundRuleThreshold
  ) public {
    _config[IS_PRIVATE] = _isPrivate ? bytes32(uint256(1)) : bytes32(uint256(0));
    _config[MANAGE_WL_THRESHOLD] = bytes32(_manageWhiteListThreshold);
    _config[MODIFY_CONFIG_THRESHOLD] = bytes32(_modifyConfigThreshold);
    _config[NEW_MEMBER_THRESHOLD] = bytes32(_newMemberThreshold);
    _config[EXPEL_MEMBER_THRESHOLD] = bytes32(_expelMemberThreshold);
    _config[FINE_MEMBER_THRESHOLD] = bytes32(_fineMemberThreshold);
    _config[NAME_AND_DESCRIPTION_THRESHOLD] = bytes32(_changeNameAndDescriptionThreshold);
    _config[ADD_FUND_RULE_THRESHOLD] = bytes32(_addFundRuleThreshold);
    _config[DEACTIVATE_FUND_RULE_THRESHOLD] = bytes32(_deactivateFundRuleThreshold);
  }

  function setConfigValue(bytes32 _key, bytes32 _value) external onlyRole(CONTRACT_CONFIG_MANAGER) {
    _config[_key] = _value;
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
    onlyRole(CONTRACT_RSRA)
    returns (bool completelyBurned)
  {
    require(_amount > 0 && _amount <= _expelledTokenReputation[_spaceTokenId], "Invalid reputation amount");

    _expelledTokenReputation[_spaceTokenId] = _expelledTokenReputation[_spaceTokenId] - _amount;

    completelyBurned = (_expelledTokenReputation[_spaceTokenId] == 0);
  }

  function incrementFine(uint256 _spaceTokenId, uint256 _amount) external onlyRole(CONTRACT_FINE_MEMBER_INCREMENT_MANAGER) {
    _fines[_spaceTokenId] += _amount;
  }

  function decrementFine(uint256 _spaceTokenId, uint256 _amount) external onlyRole(CONTRACT_FINE_MEMBER_DECREMENT_MANAGER) {
    _fines[_spaceTokenId] -= _amount;
  }

  function addWhiteListedContract(
    address _contract,
    bytes32 _abiIpfsHash,
    string calldata _description
  )
    external
    onlyRole(CONTRACT_WHITELIST_MANAGER)
  {
    _whiteListedContracts.addSilent(_contract);

    ProposalContract storage c = _proposalContracts[_contract];

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

    _activeFundRules.add(_id);
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

  // GETTERS
  function getConfigValue(bytes32 _key) external view returns(bytes32) {
    return _config[_key];
  }

  function getFineAmount(uint256 _spaceTokenId) external view returns (uint256) {
    return _fines[_spaceTokenId];
  }

  function getExpelledToken(uint256 _spaceTokenId) external view returns (bool isExpelled, uint256 amount) {
    return (_expelledTokens[_spaceTokenId], _expelledTokenReputation[_spaceTokenId]);
  }

  function getWhiteListedContracts() external view returns(address[] memory) {
    return _whiteListedContracts.elements();
  }

  function getActiveFundRules() external view returns(uint256[] memory) {
    return _activeFundRules.elements();
  }

  function getActiveFundRulesCount() external view returns(uint256) {
    return _activeFundRules.size();
  }

  function getProposalContract(
    address _contract
  )
    external
    view
    returns(
      bytes32 abiIpfsHash,
      string memory description
    )
  {
    ProposalContract storage c = _proposalContracts[_contract];

    abiIpfsHash = c.abiIpfsHash;
    description = c.description;
  }

  function getFundRule(uint256 _frpId) external view returns(
    bool active,
    uint256 id,
    bytes32 ipfsHash,
    string memory description
  )
  {
    FundRule storage r = _fundRules[_frpId];

    active = r.active;
    id = r.id;
    ipfsHash = r.ipfsHash;
    description = r.description;
  }

  function isMintApproved(uint256 _spaceTokenId) external view returns(bool) {
    if (_expelledTokens[_spaceTokenId] == true) {
      return false;
    }

    if (uint256(_config[IS_PRIVATE]) == uint256(1)) {
      return _mintApprovals[_spaceTokenId];
    } else {
      return true;
    }
  }
}
