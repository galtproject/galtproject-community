/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.10;

import "../common/FundACL.sol";
import "../common/FundUpgrader.sol";
import "../common/FundRegistry.sol";
import "../abstract/AbstractFundStorage.sol";


contract MockUpgradeScript1 is FundUpgrader {
  bytes public argsWithSignature;

  constructor(address _address1, address _address2) public {
    argsWithSignature = abi.encodeWithSignature("run(address,address)", _address1, _address2);
  }

  function run(address _address1, address _address2) external {
    fundRegistry.getACL().setRole(bytes32("CONFIG_MANAGER"), _address1, true);
    fundRegistry.setContract(FundRegistry(address(fundRegistry)).CONTROLLER(), _address2);
  }
}
