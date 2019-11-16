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
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "../../abstract/fees/AbstractRegularFee.sol";
import "../FundStorage.sol";


// TODO: extract payment specific functions in order to make this contract abstract from a payment method
contract AbstractDecentralizedRegularFee is AbstractRegularFee  {
  FundStorage public fundStorage;

  // tokenId => timestamp
  mapping(uint256 => uint256) public paidUntil;
  // tokenId => amount
  mapping(uint256 => uint256) public totalPaid;

  constructor(FundStorage _fundStorage) public {
    fundStorage = _fundStorage;
  }

  function lockSpaceToken(uint256 _spaceTokenId) public {
    require(paidUntil[_spaceTokenId] < getNextPeriodTimestamp(), "paidUntil too small");
    fundStorage.lockSpaceToken(_spaceTokenId);
  }

  function lockSpaceTokenArray(uint256[] calldata _spaceTokenIds) external {
    for (uint i = 0; i < _spaceTokenIds.length; i++) {
      lockSpaceToken(_spaceTokenIds[i]);
    }
  }

  function unlockSpaceToken(uint256 _spaceTokenId) public {
    require(paidUntil[_spaceTokenId] >= getNextPeriodTimestamp(), "paidUntil too big");
    fundStorage.unlockSpaceToken(_spaceTokenId);
  }

  function unlockSpaceTokenArray(uint256[] calldata _spaceTokenIds) external {
    for (uint i = 0; i < _spaceTokenIds.length; i++) {
      unlockSpaceToken(_spaceTokenIds[i]);
    }
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
    totalPaid[_spaceTokenId] += _amount;
  }
}
