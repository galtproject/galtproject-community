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
    return _build("initialize(address)", address(this), true, true);
  }

  function build(address _addressArgument, bool _transferOwnership, bool _transferProxyOwnership)
    external
    returns (address)
  {
    return _build("initialize(address)", _addressArgument, _transferOwnership, _transferProxyOwnership);
  }

  function build(string calldata _signature, address _addressArgument, bool _transferOwnership, bool _transferProxyOwnership)
    external
    returns (address)
  {
    return _build(_signature, _addressArgument, _transferOwnership, _transferProxyOwnership);
  }

  function build(bytes calldata _payload, bool _transferOwnership, bool _transferProxyOwnership)
    external
    returns (address)
  {
    return _build(_payload, _transferOwnership, _transferProxyOwnership);
  }

  // INTERNAL

  function _build(string memory _signature, address _addressArgument, bool _transferOwnership, bool _transferProxyOwnership)
    internal
    returns (address)
  {
    return _build(
      abi.encodeWithSignature(_signature, _addressArgument),
      _transferOwnership,
      _transferProxyOwnership
    );
  }

  function _build(bytes memory _payload, bool _transferOwnership, bool _transferProxyOwnership)
    internal
    returns (address)
  {
    IOwnedUpgradeabilityProxy proxy = ownedUpgradeabilityProxyFactory.build();

    proxy.upgradeToAndCall(implementation, _payload);

    if (_transferOwnership == true) {
      Ownable(address(proxy)).transferOwnership(msg.sender);
    }

    if (_transferProxyOwnership == true) {
      proxy.transferProxyOwnership(msg.sender);
    }

    return address(proxy);
  }
}
