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

pragma solidity 0.5.3;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "../FundStorage.sol";
import "../FundMultiSig.sol";

// This contract will be included into the current one
import "../FundController.sol";


contract FundControllerFactory is Ownable {
  function build(
    IERC20 _galtToken,
    FundStorage _fundStorage,
    FundMultiSig _multiSig
  )
    external
    returns (FundController)
  {
    FundController fundController = new FundController(
      _galtToken,
      _fundStorage,
      _multiSig
    );

    fundController.addRoleTo(msg.sender, "role_manager");
    fundController.removeRoleFrom(address(this), "role_manager");

    return fundController;
  }
}
