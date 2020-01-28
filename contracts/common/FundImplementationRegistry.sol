/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@openzeppelin/contracts/ownership/Ownable.sol";
import "@galtproject/libs/contracts/proxy/unstructured-storage/interfaces/IOwnedUpgradeabilityProxy.sol";
import "@galtproject/libs/contracts/traits/Initializable.sol";
import "./interfaces/IFundRegistry.sol";


contract FundImplementationRegistry is Initializable, Ownable {
  event NewImplementation(bytes32 code, address implementation, uint256 version);

  // code => version list
  mapping(bytes32 => address[]) public versions;

  function addVersion(bytes32 _code, address _implementation) external onlyOwner {
    if (versions[_code].length == 0) {
      versions[_code].push(address(0));
    }
    uint256 len = versions[_code].push(_implementation);

    emit NewImplementation(_code, _implementation, len - 1);
  }

  // GETTERS

  // @dev filter the first address(0) externally
  function getVersions(bytes32 _code) external view returns(address[] memory) {
    return versions[_code];
  }

  function getLatestVersionNumber(bytes32 _code) external view returns(uint256) {
    if (versions[_code].length == 0) {
      return 0;
    }
    return versions[_code].length - 1;
  }

  function getLatestVersionAddress(bytes32 _code) external view returns(address) {
    if (versions[_code].length == 0) {
      return address(0);
    }
    return versions[_code][versions[_code].length - 1];
  }
}
