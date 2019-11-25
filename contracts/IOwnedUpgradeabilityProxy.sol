/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;


interface IOwnedUpgradeabilityProxy {
  function proxyOwner() external view returns (address owner);
  function transferProxyOwnership(address newOwner) external;
  function upgradeTo(address implementation) external;
  function upgradeToAndCall(address implementation, bytes calldata data) payable external;
}
