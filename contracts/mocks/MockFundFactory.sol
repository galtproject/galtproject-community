/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "../decentralized/factories/FundFactory.sol";


contract MockFundFactory is FundFactory {

  constructor (
    GaltGlobalRegistry _ggr,
    FundRAFactory _fundRAFactory,
    FundMultiSigFactory _fundMultiSigFactory,
    FundStorageFactory _fundStorageFactory,
    FundControllerFactory _fundControllerFactory,
    FundProposalManagerFactory _fundProposalManagerFactory,
    FundBareFactory _fundRegistryFactory,
    FundBareFactory _fundACLFactory,
    FundUpgraderFactory _fundUpgraderFactory
  )
    public
    FundFactory(
      _ggr,
      _fundRAFactory,
      _fundMultiSigFactory,
      _fundStorageFactory,
      _fundControllerFactory,
      _fundProposalManagerFactory,
      _fundRegistryFactory,
      _fundACLFactory,
      _fundUpgraderFactory
    )
  {
  }
}
