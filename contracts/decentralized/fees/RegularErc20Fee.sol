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
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "../../abstract/fees/AbstractRegularFee.sol";
import "./AbstractDecentralizedRegularFee.sol";
import "../FundStorage.sol";


contract RegularErc20Fee is AbstractDecentralizedRegularFee {
  using SafeMath for uint256;

  IERC20 public erc20Token;

  constructor (
    IERC20 _token,
    FundStorage _fundStorage,
    uint256 _initialTimestamp,
    uint256 _periodLength,
    uint256 _rate
  )
    public
    AbstractDecentralizedRegularFee(_fundStorage)
    AbstractRegularFee(_initialTimestamp, _periodLength, _rate)
  {
    erc20Token = _token;
  }

  // Each paidUntil point shifts by the current `rate`
  function pay(uint256 _spaceTokenId, uint256 _amount) external {
    require(_amount > 0, "Expect ERC20 payment");
    require(erc20Token.allowance(msg.sender, address(this)) >= _amount, "Insufficient allowance");

    _pay(_spaceTokenId, _amount);

    require(
      erc20Token.transferFrom(msg.sender, address(fundStorage.getMultiSig()), _amount) == true,
      "Failed to transfer ERC20 tokens"
    );
  }

  function payArray(uint256[] calldata _spaceTokensIds, uint256[] calldata _amounts) external {
    uint256 totalAmount = 0;

    for (uint i = 0; i < _spaceTokensIds.length; i++) {
      // totalAmount += _amounts[_i];
      totalAmount = totalAmount.add(_amounts[i]);
      _pay(_spaceTokensIds[i], _amounts[i]);
    }

    require(
      erc20Token.transferFrom(msg.sender, address(fundStorage.getMultiSig()), totalAmount) == true,
      "Failed to transfer ERC20 tokens"
    );
  }
}
