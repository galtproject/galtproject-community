/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "../private/factories/PrivateFundFactory.sol";


contract MockPrivateFundFactory is PrivateFundFactory {
  address public proposalManagerToInject;

  constructor (
    IPPGlobalRegistry _globalRegistry,
    FundBareFactory _fundRAFactory,
    FundBareFactory _fundMultiSigFactory,
    PrivateFundStorageFactory _fundStorageFactory,
    FundBareFactory _fundControllerFactory,
    FundBareFactory _fundProposalManagerFactory,
    FundBareFactory _fundRegistryFactory,
    FundBareFactory _fundACLFactory,
    FundBareFactory _fundUpgraderFactory,
    FundBareFactory _fundRuleRegistryFactory,
    uint256 _ethFee,
    uint256 _galtFee
  )
    public
    PrivateFundFactory(
      _globalRegistry,
      _fundRAFactory,
      _fundMultiSigFactory,
      _fundStorageFactory,
      _fundControllerFactory,
      _fundProposalManagerFactory,
      _fundRegistryFactory,
      _fundACLFactory,
      _fundUpgraderFactory,
      _fundRuleRegistryFactory,
      _ethFee,
      _galtFee
    )
  {
  }

  function setProposalManagerToInject(address _addr) external {
    proposalManagerToInject = _addr;
  }

  function _setFundProposalManagerRoles(
    IACL _fundACL,
    PrivateFundStorage _fundStorage,
    address _fundProposalManager,
    address _fundUpgrader,
    FundRuleRegistryV1 _fundRuleRegistry,
    address payable _fundMultiSig
  )
    internal
  {
    PrivateFundFactoryLib.setFundRoles(
      _fundACL,
      _fundStorage,
      _fundProposalManager,
      _fundUpgrader,
      FundRuleRegistryV1(_fundRuleRegistry),
      _fundMultiSig
    );

    if (proposalManagerToInject != address(0)) {
      PrivateFundFactoryLib.setFundRoles(
        _fundACL,
        _fundStorage,
        proposalManagerToInject,
        _fundUpgrader,
        FundRuleRegistryV1(_fundRuleRegistry),
        _fundMultiSig
      );
    }
  }
}
