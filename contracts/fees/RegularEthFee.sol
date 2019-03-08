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

import "../FundStorage.sol";
import "./AbstractRegularFee.sol";


contract RegularEthFee  is AbstractRegularFee {
  constructor (
    FundStorage _fundStorage,
    uint256 _initialTimestamp,
    uint256 _periodLength,
    uint256 _rate
  )
    public
    AbstractRegularFee(_fundStorage, _initialTimestamp, _periodLength, _rate)
  {
  }

  // Each paidUntil point shifts by the current `rate`
  function pay(uint256 _spaceTokenId) external payable {
    require(msg.value > 0, "Expect ETH payment");

    uint256 currentPaidUntil = paidUntil[_spaceTokenId];
    if (currentPaidUntil == 0) {
      currentPaidUntil = getCurrentPeriodTimestamp();
    }

    uint256 newPaidUntil = currentPaidUntil + (msg.value * periodLength / rate);
    uint256 permittedPaidUntil = getNextPeriodTimestamp() + prePaidPeriodGap;

    require(newPaidUntil <= permittedPaidUntil, "Payment exceeds permitted pre-payment timestamp");

    paidUntil[_spaceTokenId] = newPaidUntil;

    address(fundStorage.multiSig()).transfer(msg.value);
  }
}
