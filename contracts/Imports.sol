/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@galtproject/core/contracts/SpaceToken.sol";
import "@galtproject/core/contracts/GaltToken.sol";
import "@galtproject/core/contracts/ACL.sol";
import "@galtproject/core/contracts/factories/SpaceLockerFactory.sol";
import "@galtproject/core/contracts/registries/LockerRegistry.sol";
import "@galtproject/core/contracts/registries/FeeRegistry.sol";

import "@galtproject/private-property-registry/contracts/PPGlobalRegistry.sol";
import "@galtproject/private-property-registry/contracts/PPACL.sol";
import "@galtproject/private-property-registry/contracts/PPMarket.sol";
import "@galtproject/private-property-registry/contracts/PPToken.sol";
import "@galtproject/private-property-registry/contracts/PPLocker.sol";
import "@galtproject/private-property-registry/contracts/PPTokenRegistry.sol";
import "@galtproject/private-property-registry/contracts/PPLockerRegistry.sol";
import "@galtproject/private-property-registry/contracts/PPTokenFactory.sol";
import "@galtproject/private-property-registry/contracts/PPLockerFactory.sol";

import "@galtproject/libs/contracts/proxy/unstructured-storage/factories/OwnedUpgradeabilityProxyFactory.sol";


// solium-disable-next-line no-empty-blocks
contract Imports {

}

