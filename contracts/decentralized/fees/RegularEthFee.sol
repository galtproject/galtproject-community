/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "../../abstract/fees/AbstractRegularFee.sol";
import "./AbstractDecentralizedRegularFee.sol";
import "../../common/interfaces/IFundRegistry.sol";


contract RegularEthFee is AbstractDecentralizedRegularFee {
  using SafeMath for uint256;

  constructor (
    IFundRegistry _fundRegistry,
    uint256 _initialTimestamp,
    uint256 _periodLength,
    uint256 _rate
  )
    public
    AbstractDecentralizedRegularFee(_fundRegistry)
    AbstractRegularFee(_initialTimestamp, _periodLength, _rate)
  {
  }

  // Each paidUntil point shifts by the current `rate`
  function pay(uint256 _spaceTokenId) external payable {
    uint256 value = msg.value;
    require(value > 0, "Expect ETH payment");

    _pay(_spaceTokenId, value);

    address(fundRegistry.getMultiSigAddress()).transfer(value);
  }

  function payArray(uint256[] calldata _spaceTokensIds, uint256[] calldata _amounts) external payable {
    uint256 value = msg.value;
    require(value > 0, "Expect ETH payment");

    uint256 totalAmount = 0;

    for (uint i = 0; i < _spaceTokensIds.length; i++) {
      // totalAmount += _amounts[_i];
      totalAmount = totalAmount.add(_amounts[i]);
      _pay(_spaceTokensIds[i], _amounts[i]);
    }

    require(value == totalAmount, "Amounts sum doesn't match msg.value");

    address(fundRegistry.getMultiSigAddress()).transfer(value);
  }
}
