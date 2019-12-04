/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "../common/FundACL.sol";
import "../common/FundUpgrader.sol";
import "../common/FundRegistry.sol";
import "../abstract/AbstractFundStorage.sol";


contract MockFundProposalManagerV2 is FundProposalManager {
  bool initializedV2;
  string myValue;

  function initialize3(string calldata _input) external {
    require(initializedV2 == false, "Already initialized");

    myValue = _input;

    initializedV2 = true;
  }

  function foo() external view returns (string memory newValue, address oldValue) {
    return (myValue, address(fundRegistry));
  }
}
