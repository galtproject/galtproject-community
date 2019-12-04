/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@openzeppelin/contracts/ownership/Ownable.sol";
import "@galtproject/libs/contracts/proxy/unstructured-storage/OwnedUpgradeabilityProxy.sol";
import "../interfaces/IFundRegistry.sol";
import "../../common/interfaces/IFundRegistry.sol";

// This contract will be included into the current one
import "../FundUpgrader.sol";


contract FundUpgraderFactory is Ownable {
  function build(IFundRegistry _fundRegistry)
    external
    returns (FundUpgrader)
  {
    OwnedUpgradeabilityProxy proxy = new OwnedUpgradeabilityProxy();

    FundUpgrader fundUpgrader = new FundUpgrader();

    proxy.upgradeToAndCall(address(fundUpgrader), abi.encodeWithSignature("initialize(address)", _fundRegistry));

    proxy.transferProxyOwnership(msg.sender);

    return FundUpgrader(address(proxy));
  }
}
