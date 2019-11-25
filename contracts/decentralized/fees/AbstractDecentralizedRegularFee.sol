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
import "../FundStorage.sol";
import "../../common/interfaces/IFundRegistry.sol";


// TODO: extract payment specific functions in order to make this contract abstract from a payment method
contract AbstractDecentralizedRegularFee is AbstractRegularFee {
  using SafeMath for uint256;

  IFundRegistry public fundRegistry;

  // tokenId => timestamp
  mapping(uint256 => uint256) public paidUntil;
  // tokenId => amount
  mapping(uint256 => uint256) public totalPaid;

  constructor(IFundRegistry _fundRegistry) public {
    fundRegistry = _fundRegistry;
  }

  function lockSpaceToken(uint256 _spaceTokenId) public {
    require(paidUntil[_spaceTokenId] < getNextPeriodTimestamp(), "paidUntil too small");
    _fundStorage().lockSpaceToken(_spaceTokenId);
  }

  function lockSpaceTokenArray(uint256[] calldata _spaceTokenIds) external {
    for (uint i = 0; i < _spaceTokenIds.length; i++) {
      lockSpaceToken(_spaceTokenIds[i]);
    }
  }

  function unlockSpaceToken(uint256 _spaceTokenId) public {
    require(paidUntil[_spaceTokenId] >= getNextPeriodTimestamp(), "paidUntil too big");
    _fundStorage().unlockSpaceToken(_spaceTokenId);
  }

  function unlockSpaceTokenArray(uint256[] calldata _spaceTokenIds) external {
    for (uint i = 0; i < _spaceTokenIds.length; i++) {
      unlockSpaceToken(_spaceTokenIds[i]);
    }
  }

  function _fundStorage() internal view returns (FundStorage) {
    return FundStorage(fundRegistry.getStorageAddress());
  }

  function _pay(uint256 _spaceTokenId, uint256 _amount) internal {
    uint256 currentPaidUntil = paidUntil[_spaceTokenId];
    if (currentPaidUntil == 0) {
      currentPaidUntil = getCurrentPeriodTimestamp();
    }

    // uint256 newPaidUntil = currentPaidUntil + (_amount * periodLength / rate);
    uint256 newPaidUntil = currentPaidUntil.add(_amount.mul(periodLength) / rate);
    // uint256 permittedPaidUntil = getNextPeriodTimestamp() + prePaidPeriodGap;
    uint256 permittedPaidUntil = getNextPeriodTimestamp().add(prePaidPeriodGap);

    require(newPaidUntil <= permittedPaidUntil, "Payment exceeds permitted pre-payment timestamp");

    paidUntil[_spaceTokenId] = newPaidUntil;
    // totalPaid[_spaceTokenId] += _amount;
    totalPaid[_spaceTokenId] = totalPaid[_spaceTokenId].add(_amount);
  }
}
