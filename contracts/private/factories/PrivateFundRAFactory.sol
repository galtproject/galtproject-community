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
import "../../common/interfaces/IFundRegistry.sol";

// This contract will be included into the current one
import "../PrivateFundRA.sol";


contract PrivateFundRAFactory is Ownable {
  function build(
    IFundRegistry _fundRegistry
  )
    external
    returns (PrivateFundRA)
  {
    OwnedUpgradeabilityProxy proxy = new OwnedUpgradeabilityProxy();

    PrivateFundRA fundRA = new PrivateFundRA();

    proxy.upgradeToAndCall(
      address(fundRA),
      abi.encodeWithSignature("initialize(address)", _fundRegistry)
    );

    proxy.transferProxyOwnership(msg.sender);

    return PrivateFundRA(address(proxy));
  }
}
