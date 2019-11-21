/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

import "./interfaces/IRegularFee.sol";
import "./traits/DetailableFee.sol";


// TODO: extract payment specific functions in order to make this contract abstract from a payment method
contract AbstractRegularFee is DetailableFee, IRegularFee {
  uint256 public initialTimestamp;
  // Period in seconds
  uint256 public periodLength;
  // Period in seconds after the current period end  for pre-payments using the current `rate`
  uint256 public prePaidPeriodGap;
  // Amount of funds to pay in a single period
  uint256 public rate;

  constructor (
    uint256 _initialTimestamp,
    uint256 _period,
    uint256 _rate
  ) public {
    require(_initialTimestamp > 0, "Initial timestamp length is 0");
    require(_period > 0, "Period length is 0");
    require(_rate > 0, "Rate is 0");

    initialTimestamp = _initialTimestamp;
    periodLength = _period;
    rate = _rate;
    // 1 month (30 days)
    prePaidPeriodGap = 2592000;
  }

  // GETTERS

  function getCurrentPeriod() public view returns (uint256) {
    require(block.timestamp > initialTimestamp, "Contract not initiated yet");

    return (block.timestamp - initialTimestamp) / periodLength;
  }

  function getNextPeriodTimestamp() public view returns (uint256) {
    if (block.timestamp <= initialTimestamp) {
      return initialTimestamp;
    }

    return ((getCurrentPeriod() + 1) * periodLength) + initialTimestamp;
  }

  function getCurrentPeriodTimestamp() public view returns (uint256) {
    if (block.timestamp <= initialTimestamp) {
      return initialTimestamp;
    }

    return (getCurrentPeriod() * periodLength) + initialTimestamp;
  }
}
