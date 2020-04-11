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
import "@galtproject/libs/contracts/proxy/unstructured-storage/interfaces/IOwnedUpgradeabilityProxyFactory.sol";
import "@galtproject/libs/contracts/proxy/unstructured-storage/interfaces/IOwnedUpgradeabilityProxy.sol";
import "@galtproject/libs/contracts/proxy/unstructured-storage/OwnedUpgradeabilityProxy.sol";
import "@galtproject/core/contracts/traits/ChargesEthFee.sol";


contract FundBareFactory {
  address public implementation;
  IOwnedUpgradeabilityProxyFactory internal ownedUpgradeabilityProxyFactory;

  constructor(IOwnedUpgradeabilityProxyFactory _factory, address _impl) public {
    ownedUpgradeabilityProxyFactory = _factory;
    implementation = _impl;
  }

  function build()
    external
    returns (address)
  {
    return _build("initialize(address)", address(this), 2 | 1);
  }

  function build(address _addressArgument, uint256 _additionalOperations)
    external
    returns (address)
  {
    if (_additionalOperations & 4 == 4) {
      return _build("initialize(address,address)", _addressArgument, _additionalOperations);
    } else {
      return _build("initialize(address)", _addressArgument, _additionalOperations);
    }
  }

  function build(string calldata _signature, address _addressArgument, uint256 _additionalOperations)
    external
    returns (address)
  {
    return _build(_signature, _addressArgument, _additionalOperations);
  }

  function build(bytes calldata _payload, uint256 _additionalOperations)
    external
    returns (address)
  {
    return _build(_payload, _additionalOperations);
  }

  // INTERNAL

  function _build(string memory _signature, address _addressArgument, uint256 _additionalOperations)
    internal
    returns (address)
  {
    if (_additionalOperations & 4 == 4) {
      return _build(
        abi.encodeWithSignature(_signature, _addressArgument, address(this)),
        _additionalOperations
      );
    } else {
      return _build(
        abi.encodeWithSignature(_signature, _addressArgument),
        _additionalOperations
      );
    }
  }

  function _build(bytes memory _payload, uint256 _additionalOperations)
    internal
    returns (address)
  {
    IOwnedUpgradeabilityProxy proxy = ownedUpgradeabilityProxyFactory.build();

    proxy.upgradeToAndCall(implementation, _payload);

    // Transfer ownership
    if (_additionalOperations & 1 == 1) {
      Ownable(address(proxy)).transferOwnership(msg.sender);
    }

    // Transfer proxy ownership
    if (_additionalOperations & 2 == 2) {
      proxy.transferProxyOwnership(msg.sender);
    }

    // Transfer fee manager
    if (_additionalOperations & 4 == 4) {
      ChargesEthFee(address(proxy)).setFeeManager(msg.sender);
    }

    return address(proxy);
  }
}
