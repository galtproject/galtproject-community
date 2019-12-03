/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.10;

import "../common/FundUpgrader.sol";
import "@galtproject/libs/contracts/proxy/unstructured-storage/interfaces/IOwnedUpgradeabilityProxy.sol";


contract MockUpgradeScript2 is FundUpgrader {
  bytes public argsWithSignature;

  constructor(address _address1, string memory _input) public {
    argsWithSignature = abi.encodeWithSignature("run(address,string)", _address1, _input);
  }

  function run(address _newProposalManagerImplementation, string calldata _input) external {
    IOwnedUpgradeabilityProxy proxy = IOwnedUpgradeabilityProxy(fundRegistry.getProposalManagerAddress());

    proxy.upgradeToAndCall(
      _newProposalManagerImplementation,
      abi.encodeWithSignature("initialize3(string)", _input)
    );
  }
}
