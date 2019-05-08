/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

pragma solidity ^0.5.7;

import "openzeppelin-solidity/contracts/token/ERC721/IERC721.sol";
import "@galtproject/core/contracts/registries/interfaces/ILockerRegistry.sol";
import "../factories/FundFactory.sol";


contract MockFundFactory is FundFactory {

  constructor (
    GaltGlobalRegistry _ggr,
    FundRAFactory _fundRAFactory,
    FundMultiSigFactory _fundMultiSigFactory,
    FundStorageFactory _fundStorageFactory,
    FundControllerFactory _fundControllerFactory
  ) public FundFactory(_ggr, _fundRAFactory, _fundMultiSigFactory, _fundStorageFactory, _fundControllerFactory) {
    
  }
  
  function hackAddRoleManagerRole(bytes32 _fundId, address _addRoleTo) external {
    FundContracts storage c = fundContracts[_fundId];

    c.fundStorage.addRoleTo(_addRoleTo, c.fundStorage.ROLE_ROLE_MANAGER());
  }
}
