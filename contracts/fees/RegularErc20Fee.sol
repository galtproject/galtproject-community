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

pragma solidity 0.5.7;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "../FundStorage.sol";
import "./AbstractRegularFee.sol";
import "./traits/DetailableFee.sol";

contract RegularErc20Fee is AbstractRegularFee, DetailableFee {
  IERC20 public erc20Token;

  constructor (
    IERC20 _token,
    FundStorage _fundStorage,
    uint256 _initialTimestamp,
    uint256 _periodLength,
    uint256 _rate
  )
  public
  AbstractRegularFee(_fundStorage, _initialTimestamp, _periodLength, _rate)
  {
    erc20Token = _token;
  }

  // Each paidUntil point shifts by the current `rate`
  function pay(uint256 _spaceTokenId, uint256 _amount) public payable {
    require(_amount > 0, "Expect ETH payment");
    require(erc20Token.allowance(msg.sender, address(this)) >= _amount, "Insufficient allowance");

    _pay(_spaceTokenId, _amount);

    erc20Token.transferFrom(msg.sender, address(fundStorage.getMultiSig()), _amount);
  }

  function payArray(uint256[] calldata _spaceTokensIds, uint256[] calldata _amounts) external payable {
    for (uint i = 0; i < _spaceTokensIds.length; i++) {
      pay(_spaceTokensIds[i], _amounts[i]);
    }
  }
}
