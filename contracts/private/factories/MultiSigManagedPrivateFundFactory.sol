/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "./PrivateFundFactory.sol";


contract MultiSigManagedPrivateFundFactory is PrivateFundFactory {

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

  function _setFundProposalManagerRoles(
    FundContracts storage _c,
    address _fundUpgrader,
    FundRuleRegistryV1 _fundRuleRegistry,
    address _fundMultiSig
  )
    internal
  {
    PrivateFundFactoryLib.setMultiSigManagedFundRoles(
      _c.fundACL,
      _c.fundStorage,
      address(_c.fundProposalManager),
      _fundUpgrader,
      FundRuleRegistryV1(_fundRuleRegistry),
      _fundMultiSig
    );
  }

}
