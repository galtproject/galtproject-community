/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@galtproject/core/contracts/interfaces/IACL.sol";


interface IFundRegistry {
  function setContract(bytes32 _key, address _value) external;

  // GETTERS
  function getContract(bytes32 _key) external view returns (address);
  function getGGRAddress() external view returns (address);
  function getPPGRAddress() external view returns (address);
  function getACL() external view returns (IACL);
  function getStorageAddress() external view returns (address);
  function getMultiSigAddress() external view returns (address payable);
  function getRAAddress() external view returns (address);
  function getControllerAddress() external view returns (address);
  function getProposalManagerAddress() external view returns (address);
  function getUpgraderAddress() external view returns (address);
  function getRuleRegistryAddress() external view returns (address);
}
