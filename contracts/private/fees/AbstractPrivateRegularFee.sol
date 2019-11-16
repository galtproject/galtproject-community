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
import "../PrivateFundStorage.sol";


// TODO: extract payment specific functions in order to make this contract abstract from a payment method
contract AbstractPrivateRegularFee is AbstractRegularFee  {
  PrivateFundStorage public fundStorage;

  // registry => (tokenId => timestamp)
  mapping(address => mapping(uint256 => uint256)) public paidUntil;
  // registry => (tokenId => amount)
  mapping(address => mapping(uint256 => uint256)) public totalPaid;

  constructor(PrivateFundStorage _fundStorage) public {
    fundStorage = _fundStorage;
  }

  function lockToken(address _registry, uint256 _tokenId) public {
    require(paidUntil[_registry][_tokenId] < getNextPeriodTimestamp(), "paidUntil too small");
    fundStorage.lockSpaceToken(_registry, _tokenId);
  }

  function lockTokenArray(address _registry, uint256[] calldata _tokenIds) external {
    for (uint i = 0; i < _tokenIds.length; i++) {
      lockToken(_registry, _tokenIds[i]);
    }
  }

  function unlockToken(address _registry, uint256 _tokenId) public {
    require(paidUntil[_registry][_tokenId] >= getNextPeriodTimestamp(), "paidUntil too big");
    fundStorage.unlockSpaceToken(_registry, _tokenId);
  }

  function unlockTokenArray(address _registry, uint256[] calldata _tokenIds) external {
    for (uint i = 0; i < _tokenIds.length; i++) {
      unlockToken(_registry, _tokenIds[i]);
    }
  }

  function _pay(address _registry, uint256 _tokenIds, uint256 _amount) internal {
    uint256 currentPaidUntil = paidUntil[_registry][_tokenIds];
    if (currentPaidUntil == 0) {
      currentPaidUntil = getCurrentPeriodTimestamp();
    }

    uint256 newPaidUntil = currentPaidUntil + (_amount * periodLength / rate);
    uint256 permittedPaidUntil = getNextPeriodTimestamp() + prePaidPeriodGap;

    require(newPaidUntil <= permittedPaidUntil, "Payment exceeds permitted pre-payment timestamp");

    paidUntil[_registry][_tokenIds] = newPaidUntil;
    totalPaid[_registry][_tokenIds] += _amount;
  }
}
