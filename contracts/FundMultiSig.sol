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

import "@galtproject/core/contracts/vendor/MultiSigWallet/MultiSigWallet.sol";
import "@galtproject/libs/contracts/traits/Permissionable.sol";

contract FundMultiSig is MultiSigWallet, Permissionable {
  string public constant OWNER_MANAGER = "wl_manager";

  event NewOwnerSet(uint256 count);

  constructor(
    address[] memory _initialOwners,
    uint256 _required
  )
    public
    MultiSigWallet(_initialOwners, _required)
  {
  }

  modifier forbidden() {
    assert(false);
    _;
  }

  function addOwner(address owner) public forbidden {}
  function removeOwner(address owner) public forbidden {}
  function replaceOwner(address owner, address newOwner) public forbidden {}
  function changeRequirement(uint _required) public forbidden {}

  function setOwners(address[] calldata _newOwners) external onlyRole(OWNER_MANAGER) {
    owners = _newOwners;

    emit NewOwnerSet(_newOwners.length);
  }
}
