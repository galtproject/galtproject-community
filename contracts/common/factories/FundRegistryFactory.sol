/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "@galtproject/libs/contracts/proxy/unstructured-storage/OwnedUpgradeabilityProxy.sol";
import "../interfaces/IFundRegistry.sol";

// This contract will be included into the current one
import "../FundRegistry.sol";


contract FundRegistryFactory is Ownable {
  bytes32 public lastValue;

  function build()
    external
    returns (FundRegistry)
  {
    OwnedUpgradeabilityProxy proxy = new OwnedUpgradeabilityProxy();

    FundRegistry fundRegistry = new FundRegistry();

    proxy.upgradeToAndCall(address(fundRegistry), abi.encodeWithSignature("initialize(address)", address(this)));

    Ownable(address(proxy)).transferOwnership(msg.sender);
    proxy.transferProxyOwnership(msg.sender);

    lastValue = FundRegistry(address(proxy)).STORAGE();

    return FundRegistry(address(proxy));
  }
}
