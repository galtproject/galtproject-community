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
import "./FundStorage.sol";


contract FundController {
  enum Currency {
    ETH,
    ERC20
  }

  address public constant ETH_CONTRACT = address(1);

  FundStorage public fundStorage;

  constructor (
    FundStorage _fundStorage
  ) public {
    fundStorage = _fundStorage;
  }

  function payFine(uint256 _spaceTokenId, Currency _currency, uint256 _erc20Amount, address _erc20Contract) external payable {
    address erc20Contract = _erc20Contract;
    uint256 amount = _erc20Amount;

    // ERC20
    if (_currency == Currency.ERC20) {
      require(msg.value == 0, "Could not accept both ETH and GALT");
      require(_erc20Amount > 0, "Missing fine amount");
    // ETH
    } else {
      require(_erc20Amount == 0, "Amount should be explicitly set to 0");
      require(msg.value > 0, "Expect ETH payment");
      amount = msg.value;
      erc20Contract = ETH_CONTRACT;
    }

    uint256 expectedPayment = fundStorage.getFineAmount(_spaceTokenId, erc20Contract);

    require(expectedPayment > 0, "Fine amount is 0");
    require(expectedPayment >= amount, "Amount for transfer exceeds fine value");

    if (_currency == Currency.ERC20) {
      require(
        IERC20(erc20Contract).transferFrom(msg.sender, address(fundStorage.getMultiSig()), amount) == true,
        "Failed to transfer ERC20 tokens"
      );
    } else {
      address(fundStorage.getMultiSig()).transfer(amount);
    }

    fundStorage.decrementFine(_spaceTokenId, erc20Contract, amount);
  }
}
