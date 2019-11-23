/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "../../../abstract/fees/interfaces/IRegularFee.sol";
import "../../PrivateFundStorage.sol";

// This contract will be included into the current one
import "../../fees/PrivateRegularEthFee.sol";


contract PrivateRegularEthFeeFactory is Ownable {
  event NewContract(address addr);

  function build(
    PrivateFundStorage _fundStorage,
    uint256 _initialTimestamp,
    uint256 _period,
    uint256 _amount
  )
    external
    returns (IRegularFee regularFee)
  {
    regularFee = new PrivateRegularEthFee(
      _fundStorage,
      _initialTimestamp,
      _period,
      _amount
    );

    emit NewContract(address(regularFee));
  }
}
