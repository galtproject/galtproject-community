/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

import "../../abstract/fees/AbstractRegularFee.sol";
import "./AbstractPrivateRegularFee.sol";
import "../PrivateFundStorage.sol";


contract PrivateRegularEthFee is AbstractPrivateRegularFee {
  constructor (
    PrivateFundStorage _fundStorage,
    uint256 _initialTimestamp,
    uint256 _periodLength,
    uint256 _rate
  )
    public
    AbstractPrivateRegularFee(_fundStorage)
    AbstractRegularFee(_initialTimestamp, _periodLength, _rate)
  {
  }

  function pay(address _registry, uint256 _tokenId) public payable {
    uint256 value = msg.value;

    require(value > 0, "Expect ETH payment");

    _pay(_registry, _tokenId, value);

    address(fundStorage.getMultiSig()).transfer(value);
  }
}
