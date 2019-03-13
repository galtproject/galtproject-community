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
import "./interfaces/IRegularFee.sol";


// TODO: extract payment specific functions in order to make this contract abstract from a payment method
contract AbstractRegularFee is IRegularFee {
  FundStorage public fundStorage;

  uint256 public initialTimestamp;
  // Period in seconds
  uint256 public periodLength;
  // Period in seconds after the current period end  for pre-payments using the current `rate`
  uint256 public prePaidPeriodGap;
  // Amount of funds to pay in a single period
  uint256 public rate;

  // tokenId => timestamp
  mapping(uint256 => uint256) public paidUntil;

  constructor (
    FundStorage _fundStorage,
    uint256 _initialTimestamp,
    uint256 _period,
    uint256 _rate
  ) public {
    require(_initialTimestamp > 0, "Initial timestamp length is 0");
    require(_period > 0, "Period length is 0");
    require(_rate > 0, "Rate is 0");

    initialTimestamp = _initialTimestamp;
    fundStorage = _fundStorage;
    periodLength = _period;
    rate = _rate;
    // 1 month (30 days)
    prePaidPeriodGap = 2592000;
  }

  function lockSpaceToken(uint256 _spaceTokenId) external {
    require(paidUntil[_spaceTokenId] < getNextPeriodTimestamp(), "paidUntil too small");
    fundStorage.lockSpaceToken(_spaceTokenId);
  }

  function unlockSpaceToken(uint256 _spaceTokenId) external {
    require(paidUntil[_spaceTokenId] >= getNextPeriodTimestamp(), "paidUntil too big");
    fundStorage.unlockSpaceToken(_spaceTokenId);
  }

  function _pay(uint256 _spaceTokenId, uint256 _amount) internal {
    uint256 currentPaidUntil = paidUntil[_spaceTokenId];
    if (currentPaidUntil == 0) {
      currentPaidUntil = getCurrentPeriodTimestamp();
    }

    uint256 newPaidUntil = currentPaidUntil + (_amount * periodLength / rate);
    uint256 permittedPaidUntil = getNextPeriodTimestamp() + prePaidPeriodGap;

    require(newPaidUntil <= permittedPaidUntil, "Payment exceeds permitted pre-payment timestamp");

    paidUntil[_spaceTokenId] = newPaidUntil;
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
