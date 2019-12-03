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
import "../../../abstract/fees/interfaces/IRegularFee.sol";
import "../../../common/interfaces/IFundRegistry.sol";

// This contract will be included into the current one
import "../../fees/RegularErc20Fee.sol";


contract RegularErc20FeeFactory is Ownable {
  event NewContract(address addr, address erc20Token);

  function build(
    IERC20 _erc20Token,
    IFundRegistry _fundRegistry,
    uint256 _initialTimestamp,
    uint256 _period,
    uint256 _amount
  )
    external
    returns (IRegularFee regularFee)
  {
    regularFee = new RegularErc20Fee(
      _erc20Token,
      _fundRegistry,
      _initialTimestamp,
      _period,
      _amount
    );

    emit NewContract(address(regularFee), address(_erc20Token));
  }
}
