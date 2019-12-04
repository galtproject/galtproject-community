/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@galtproject/libs/contracts/traits/OwnableAndInitializable.sol";
import "@galtproject/core/contracts/interfaces/IACL.sol";
import "./interfaces/IFundRegistry.sol";


contract FundRegistry is IFundRegistry, OwnableAndInitializable {
  // solium-disable-next-line mixedcase
  address internal constant ZERO_ADDRESS = address(0);

  bytes32 public constant GGR = bytes32("GGR");
  bytes32 public constant PPGR = bytes32("PPGR");

  bytes32 public constant ACL = bytes32("ACL");
  bytes32 public constant STORAGE = bytes32("storage");
  bytes32 public constant MULTISIG = bytes32("multisig");
  bytes32 public constant RA = bytes32("reputation_accounting");
  bytes32 public constant CONTROLLER = bytes32("controller");
  bytes32 public constant PROPOSAL_MANAGER = bytes32("proposal_manager");
  bytes32 public constant UPGRADER = bytes32("UPGRADER");

  event SetContract(bytes32 indexed key, address addr);

  mapping(bytes32 => address) internal contracts;

  function initialize(address owner) public initializeWithOwner(owner) {
  }

  function setContract(bytes32 _key, address _value) external {
    contracts[_key] = _value;

    emit SetContract(_key, _value);
  }

  // GETTERS
  function getContract(bytes32 _key) external view returns (address) {
    return contracts[_key];
  }

  function getGGRAddress() external view returns (address) {
    require(contracts[GGR] != ZERO_ADDRESS, "FundRegistry: GGR not set");
    return contracts[GGR];
  }

  function getPPGRAddress() external view returns (address) {
    require(contracts[PPGR] != ZERO_ADDRESS, "FundRegistry: PPGR not set");
    return contracts[PPGR];
  }

  function getACL() external view returns (IACL) {
    require(contracts[ACL] != ZERO_ADDRESS, "FundRegistry: ACL not set");
    return IACL(contracts[ACL]);
  }

  function getStorageAddress() external view returns (address) {
    require(contracts[STORAGE] != ZERO_ADDRESS, "FundRegistry: STORAGE not set");
    return contracts[STORAGE];
  }

  function getMultiSigAddress() external view returns (address payable) {
    require(contracts[MULTISIG] != ZERO_ADDRESS, "FundRegistry: MULTISIG not set");
    address payable multiSig = address(uint160(contracts[MULTISIG]));
    return multiSig;
  }

  function getRAAddress() external view returns (address) {
    require(contracts[RA] != ZERO_ADDRESS, "FundRegistry: RA not set");
    return contracts[RA];
  }

  function getControllerAddress() external view returns (address) {
    require(contracts[CONTROLLER] != ZERO_ADDRESS, "FundRegistry: CONTROLLER not set");
    return contracts[CONTROLLER];
  }

  function getProposalManagerAddress() external view returns (address) {
    require(contracts[PROPOSAL_MANAGER] != ZERO_ADDRESS, "FundRegistry: PROPOSAL_MANAGER not set");
    return contracts[PROPOSAL_MANAGER];
  }

  function getUpgraderAddress() external view returns (address) {
    require(contracts[UPGRADER] != ZERO_ADDRESS, "FundRegistry: UPGRADER not set");
    return contracts[UPGRADER];
  }
}
