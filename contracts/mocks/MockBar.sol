/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;


contract MockBar {
  uint256 public number;

  function setNumber(uint256 _newNumber) external {
    number = _newNumber;
  }

  function getString(uint256 _newNumber) external returns (string memory) {
    return "buzz";
  }

  function revert() external {
    revert();
  }

  function revertWithMessage() external {
    revert("foo bar buzz");
  }

  function burnAvailableGas() external {
    _burnGas();
  }

  function _burnGas() internal pure {
    uint256[26950] memory _local;
    for (uint256 i = 0; i < _local.length; i++) {
      _local[i] = i;
    }
  }
}
