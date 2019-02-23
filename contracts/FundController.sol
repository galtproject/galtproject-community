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

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "@galtproject/libs/contracts/traits/Permissionable.sol";
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "./FundMultiSig.sol";
import "./FundStorage.sol";


contract FundController is Permissionable {
  using ArraySet for ArraySet.AddressSet;

  enum Currency {
    ETH,
    ERC20
  }

  address public ETH_CONTRACT = 0x0000000000000000000000000000000000000001;

  IERC20 galtToken;
  FundMultiSig multiSig;
  FundStorage fundStorage;

  constructor (
    IERC20 _galtToken,
    FundStorage _fundStorage,
    FundMultiSig _multiSig
  ) public {
    galtToken = _galtToken;
    fundStorage = _fundStorage;
    multiSig = _multiSig;
  }

  function payFine(uint256 _spaceTokenId, Currency _currency, uint256 _amount, address _erc20Contract) external payable {
    address erc20Contract = _erc20Contract;
    uint256 amount = _amount;

    // ERC20
    if (_amount > 0) {
      require(msg.value == 0, "Could not accept both ETH and GALT");
      require(_currency == Currency.ERC20, "Could not accept both ETH and GALT");
    // ETH
    } else {
      require(msg.value > 0, "Could not accept both ETH and GALT");
      require(_currency == Currency.ETH, "Could not accept both ETH and GALT");
      amount = msg.value;
      erc20Contract = ETH_CONTRACT;
    }

    uint256 expectedPayment = fundStorage.getFineAmount(_spaceTokenId, erc20Contract);

    require(expectedPayment > 0, "Fine amount is 0");
    require(expectedPayment >= amount, "Amount for transfer exceeds fine value");

    if (_currency == Currency.ERC20) {
      IERC20(erc20Contract).transferFrom(msg.sender, address(multiSig), amount);
    } else {
      address(multiSig).transfer(amount);
    }

    fundStorage.decrementFine(_spaceTokenId, erc20Contract, amount);
  }
}
