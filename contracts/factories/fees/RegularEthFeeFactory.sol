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

pragma solidity 0.5.7;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "../../FundStorage.sol";
import "../../fees/interfaces/IRegularFee.sol";

// This contract will be included into the current one
import "../../fees/RegularEthFee.sol";


contract RegularEthFeeFactory is Ownable {
  event NewContract(address addr);

  function build(
    FundStorage _fundStorage,
    uint256 _initialTimestamp,
    uint256 _period,
    uint256 _amount
  )
    external
    returns (IRegularFee regularFee)
  {
    regularFee = new RegularEthFee(
      _fundStorage,
      _initialTimestamp,
      _period,
      _amount
    );

    emit NewContract(address(regularFee));

//    regularFee.addRoleTo(msg.sender, "role_manager");
//    regularFee.removeRoleFrom(address(this), "role_manager");
  }
}
