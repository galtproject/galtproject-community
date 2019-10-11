/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.10;

import "openzeppelin-solidity/contracts/token/ERC721/IERC721.sol";
import "@galtproject/core/contracts/registries/interfaces/ILockerRegistry.sol";
import "../factories/FundFactory.sol";


contract MockFundFactory is FundFactory {

  constructor (
    GaltGlobalRegistry _ggr,
    FundRAFactory _fundRAFactory,
    FundMultiSigFactory _fundMultiSigFactory,
    FundStorageFactory _fundStorageFactory,
    FundControllerFactory _fundControllerFactory,
    FundProposalManagerFactory _fundProposalManagerFactory
  )
    public
    FundFactory(_ggr, _fundRAFactory, _fundMultiSigFactory, _fundStorageFactory, _fundControllerFactory, _fundProposalManagerFactory)
  {
  }

  function hackAddRoleManagerRole(bytes32 _fundId, address _addRoleTo) external {
    FundContracts storage c = fundContracts[_fundId];

    c.fundStorage.addRoleTo(_addRoleTo, c.fundStorage.ROLE_ROLE_MANAGER());
  }
}
