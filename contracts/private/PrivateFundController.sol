/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./PrivateFundStorage.sol";
import "../common/interfaces/IFundRegistry.sol";


contract PrivateFundController is Initializable {
  using SafeERC20 for IERC20;

  enum Currency {
    ETH,
    ERC20
  }

  address public constant ETH_CONTRACT = address(1);

  IFundRegistry public fundRegistry;

  constructor() public {
  }

  function initialize(IFundRegistry _fundRegistry) external isInitializer {
    fundRegistry = _fundRegistry;
  }

  function payFine(address _registry, uint256 _tokenId, Currency _currency, uint256 _erc20Amount, address _erc20Contract) external payable {
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

    uint256 expectedPayment = _fundStorage().getFineAmount(_registry, _tokenId, erc20Contract);

    require(expectedPayment > 0, "Fine amount is 0");
    require(expectedPayment >= amount, "Amount for transfer exceeds fine value");

    if (_currency == Currency.ERC20) {
      IERC20(erc20Contract).transferFrom(msg.sender, address(fundRegistry.getMultiSigAddress()), amount);
    } else {
      address(fundRegistry.getMultiSigAddress()).transfer(amount);
    }

    _fundStorage().decrementFine(_registry, _tokenId, erc20Contract, amount);
  }

  function _fundStorage() internal view returns (PrivateFundStorage) {
    return PrivateFundStorage(fundRegistry.getStorageAddress());
  }
}
