/*
 * Copyright ©️ 2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "./FundRuleRegistryCore.sol";


contract FundRuleRegistryV1 is FundRuleRegistryCore {
  uint256 public constant VERSION = 1;

  bytes32 public constant ROLE_ADD_FUND_RULE_MANAGER = bytes32("ADD_FUND_RULE_MANAGER");
  bytes32 public constant ROLE_DEACTIVATE_FUND_RULE_MANAGER = bytes32("DEACTIVATE_FUND_RULE_MANAGER");

  constructor() public {
  }

  // EXTERNAL INTERFACE

  function addRuleType1(bytes32 _ipfsHash, string calldata _dataLink) external onlyRole(ROLE_ADD_FUND_RULE_MANAGER) {
    _addRule(_ipfsHash, 1, _dataLink);
  }

  function addRuleType2(bytes32 _ipfsHash, string calldata _dataLink) external onlyRole(ROLE_ADD_FUND_RULE_MANAGER) {
    _addRule(_ipfsHash, 2, _dataLink);
  }

  function addRuleType3(bytes32 _ipfsHash, string calldata _dataLink) external onlyRole(ROLE_ADD_FUND_RULE_MANAGER) {
    _addRule(_ipfsHash, 3, _dataLink);
  }

  function addRuleType4(bytes32 _ipfsHash, string calldata _dataLink) external onlyRole(ROLE_ADD_FUND_RULE_MANAGER) {
    _addRule(_ipfsHash, 4, _dataLink);
  }

  function disableRuleType1(uint256 _id) external onlyRole(ROLE_DEACTIVATE_FUND_RULE_MANAGER) {
    _disableFundRule(_id, 1);
  }

  function disableRuleType2(uint256 _id) external onlyRole(ROLE_DEACTIVATE_FUND_RULE_MANAGER) {
    _disableFundRule(_id, 2);
  }

  function disableRuleType3(uint256 _id) external onlyRole(ROLE_DEACTIVATE_FUND_RULE_MANAGER) {
    _disableFundRule(_id, 3);
  }

  function disableRuleType4(uint256 _id) external onlyRole(ROLE_DEACTIVATE_FUND_RULE_MANAGER) {
    _disableFundRule(_id, 4);
  }

  // INTERNAL HELPERS

  function _addRule(
    bytes32 _ipfsHash,
    uint256 _typeId,
    string memory _dataLink
  )
    internal
  {
    fundRuleCounter.increment();
    uint256 _id = fundRuleCounter.current();

    FundRule storage fundRule = fundRules[_id];

    fundRule.active = true;
    fundRule.id = _id;
    fundRule.typeId = _typeId;
    fundRule.ipfsHash = _ipfsHash;
    fundRule.dataLink = _dataLink;
    fundRule.manager = msg.sender;
    fundRule.createdAt = block.timestamp;

    _activeFundRules.add(_id);

    emit AddFundRule(_id);
  }

  function _disableFundRule(
    uint256 _id,
    uint256 typeId
  )
    internal
  {
    FundRule storage fundRule = fundRules[_id];

    require(fundRule.active == true, "Can disable an active rule only");

    fundRules[_id].active = false;
    fundRules[_id].disabledAt = block.timestamp;

    _activeFundRules.remove(_id);

    emit DisableFundRule(_id);
  }
}
