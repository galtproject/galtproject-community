/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.10;

import "@galtproject/libs/contracts/traits/Initializable.sol";
import "./interfaces/IFundRegistry.sol";


contract FundUpgrader is Initializable {

  IFundRegistry public fundRegistry;

  address public nextUpgradeScript;

  modifier onlyUpgradeScriptManager() {

    _;
  }

  modifier onlyAllowedUpgradeScript(address _upgradeScript) {

    _;
  }

  constructor() public {
  }

  function initialize(IFundRegistry _fundRegistry) external isInitializer {
    fundRegistry = _fundRegistry;
  }

  function setNextUpgradeScript(address _nextUpgadeScript) external onlyUpgradeScriptManager {
    nextUpgradeScript = _nextUpgadeScript;
  }

  function upgrade() external {
    require(nextUpgradeScript != address(0), "Upgrade script not set");

    nextUpgradeScript.delegatecall(abi.encodeWithSignature("run()"));

    nextUpgradeScript = address(0);
  }
}
