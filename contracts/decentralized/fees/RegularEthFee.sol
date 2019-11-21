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
import "./AbstractDecentralizedRegularFee.sol";
import "../FundStorage.sol";


contract RegularEthFee is AbstractDecentralizedRegularFee {
  constructor (
    FundStorage _fundStorage,
    uint256 _initialTimestamp,
    uint256 _periodLength,
    uint256 _rate
  )
    public
    AbstractDecentralizedRegularFee(_fundStorage)
    AbstractRegularFee(_initialTimestamp, _periodLength, _rate)
  {
  }

  // Each paidUntil point shifts by the current `rate`
  function pay(uint256 _spaceTokenId) public payable {
    pay(_spaceTokenId, msg.value);
  }

  function pay(uint256 _spaceTokenId, uint256 _amount) public payable {
    require(_amount > 0, "Expect ETH payment");

    _pay(_spaceTokenId, _amount);

    address(fundStorage.getMultiSig()).transfer(_amount);
  }

  function payArray(uint256[] calldata _spaceTokensIds, uint256[] calldata _amounts) external payable {
    for (uint i = 0; i < _spaceTokensIds.length; i++) {
      pay(_spaceTokensIds[i], _amounts[i]);
    }
  }
}
