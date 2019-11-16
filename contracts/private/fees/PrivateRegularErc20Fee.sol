/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "../../abstract/fees/AbstractRegularFee.sol";
import "./AbstractPrivateRegularFee.sol";
import "../PrivateFundStorage.sol";


contract PrivateRegularErc20Fee is AbstractPrivateRegularFee {
  IERC20 public erc20Token;

  constructor (
    IERC20 _token,
    PrivateFundStorage _fundStorage,
    uint256 _initialTimestamp,
    uint256 _periodLength,
    uint256 _rate
  )
    public
    AbstractPrivateRegularFee(_fundStorage)
    AbstractRegularFee(_initialTimestamp, _periodLength, _rate)
  {
    erc20Token = _token;
  }

  // Each paidUntil point shifts by the current `rate`
  function pay(address _registry, uint256 _tokenId, uint256 _amount) public {
    require(_amount > 0, "Expect ETH payment");
    require(erc20Token.allowance(msg.sender, address(this)) >= _amount, "Insufficient allowance");

    _pay(_registry, _tokenId, _amount);

    require(
      erc20Token.transferFrom(msg.sender, address(fundStorage.getMultiSig()), _amount) == true,
      "Failed to transfer ERC20 tokens"
    );
  }

  function payArray(address[] calldata _registries, uint256[] calldata _tokenIds, uint256[] calldata _amounts) external {
    for (uint i = 0; i < _tokenIds.length; i++) {
      pay(_registries[i], _tokenIds[i], _amounts[i]);
    }
  }
}
