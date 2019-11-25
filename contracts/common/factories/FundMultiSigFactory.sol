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
import "../interfaces/IFundRegistry.sol";

// This contract will be included into the current one
import "../FundMultiSig.sol";


contract FundMultiSigFactory is Ownable {
  function build(
    address[] calldata _initialOwners,
    uint256 _required,
    IFundRegistry _fundRegistry
  )
    external
    returns (FundMultiSig fundMultiSig)
  {
    return new FundMultiSig(
      _initialOwners,
      _required,
      _fundRegistry
    );
  }
}
