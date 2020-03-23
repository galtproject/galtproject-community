/*
 * Copyright ©️ 2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@galtproject/libs/contracts/traits/Initializable.sol";
import "../interfaces/IFundRegistry.sol";
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "@openzeppelin/contracts/drafts/Counters.sol";
import "./interfaces/IFundRuleRegistry.sol";


contract FundRuleRegistryCore is IFundRuleRegistry, Initializable {
  using Counters for Counters.Counter;
  using ArraySet for ArraySet.Uint256Set;

  uint256 public constant VERSION = 1;

  bytes32 public constant ROLE_ADD_FUND_RULE_MANAGER = bytes32("ADD_FUND_RULE_MANAGER");
  bytes32 public constant ROLE_DEACTIVATE_FUND_RULE_MANAGER = bytes32("DEACTIVATE_FUND_RULE_MANAGER");

  IFundRegistry public fundRegistry;
  ArraySet.Uint256Set internal _activeFundRules;

  Counters.Counter internal fundRuleCounter;

  // FRP => fundRuleDetails
  mapping(uint256 => FundRule) public fundRules;

  modifier onlyRole(bytes32 _role) {
    require(fundRegistry.getACL().hasRole(msg.sender, _role), "Invalid role");

    _;
  }

  constructor() public {
  }

  function initialize(address _fundRegistry) external isInitializer {
    fundRegistry = IFundRegistry(_fundRegistry);
  }

  // GETTERS

  function getActiveFundRules() external view returns (uint256[] memory) {
    return _activeFundRules.elements();
  }

  function getActiveFundRulesCount() external view returns (uint256) {
    return _activeFundRules.size();
  }
}
