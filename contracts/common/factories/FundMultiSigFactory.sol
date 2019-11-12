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

// This contract will be included into the current one
import "../FundMultiSig.sol";
import "../../abstract/interfaces/IAbstractFundStorage.sol";


contract FundMultiSigFactory is Ownable {
  function build(
    address[] calldata _initialOwners,
    uint256 _required,
    IAbstractFundStorage _fundStorage
  )
    external
    returns (FundMultiSig fundMultiSig)
  {
    fundMultiSig = new FundMultiSig(
      _initialOwners,
      _required,
      _fundStorage
    );

    fundMultiSig.addRoleTo(msg.sender, "role_manager");
    fundMultiSig.removeRoleFrom(address(this), "role_manager");

  }
}
