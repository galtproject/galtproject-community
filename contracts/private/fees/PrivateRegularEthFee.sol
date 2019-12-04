/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../abstract/fees/AbstractRegularFee.sol";
import "./AbstractPrivateRegularFee.sol";
import "../../common/interfaces/IFundRegistry.sol";


contract PrivateRegularEthFee is AbstractPrivateRegularFee {
  using SafeMath for uint256;

  constructor (
    IFundRegistry _fundRegistry,
    uint256 _initialTimestamp,
    uint256 _periodLength,
    uint256 _rate
  )
    public
    AbstractPrivateRegularFee(_fundRegistry)
    AbstractRegularFee(_initialTimestamp, _periodLength, _rate)
  {
  }

  function pay(address _registry, uint256 _tokenId) external payable {
    uint256 value = msg.value;

    require(value > 0, "Expect ETH payment");

    _pay(_registry, _tokenId, value);

    address(fundRegistry.getMultiSigAddress()).transfer(value);
  }

  function payArray(
    address[] calldata _registries,
    uint256[] calldata _spaceTokensIds,
    uint256[] calldata _amounts
  )
    external
    payable
  {
    uint256 value = msg.value;
    require(value > 0, "Expect ETH payment");

    uint256 totalAmount = 0;

    for (uint i = 0; i < _spaceTokensIds.length; i++) {
      // totalAmount += _amounts[_i];
      totalAmount = totalAmount.add(_amounts[i]);
      _pay(_registries[i], _spaceTokensIds[i], _amounts[i]);
    }

    require(value == totalAmount, "Amounts sum doesn't match msg.value");

    address(fundRegistry.getMultiSigAddress()).transfer(value);
  }
}
