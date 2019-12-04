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
import "@galtproject/libs/contracts/proxy/unstructured-storage/OwnedUpgradeabilityProxy.sol";
import "@galtproject/libs/contracts/proxy/unstructured-storage/interfaces/IOwnedUpgradeabilityProxyFactory.sol";
import "@galtproject/libs/contracts/proxy/unstructured-storage/interfaces/IOwnedUpgradeabilityProxy.sol";
import "../../common/interfaces/IFundRegistry.sol";

// This contract will be included into the current one
import "../PrivateFundStorage.sol";


contract PrivateFundStorageFactory is Ownable {
  IOwnedUpgradeabilityProxyFactory internal ownedUpgradeabilityProxyFactory;

  constructor(IOwnedUpgradeabilityProxyFactory _factory) public {
    ownedUpgradeabilityProxyFactory = _factory;
  }

  function build(
    IFundRegistry _globalRegistry,
    bool _isPrivate,
    uint256 _defaultProposalSupport,
    uint256 _defaultProposalQuorum,
    uint256 _defaultProposalTimeout,
    uint256 _periodLength
  )
    external
    returns (PrivateFundStorage)
  {
    IOwnedUpgradeabilityProxy proxy = ownedUpgradeabilityProxyFactory.build();

    PrivateFundStorage fundStorage = new PrivateFundStorage();

    proxy.upgradeToAndCall(
      address(fundStorage),
      abi.encodeWithSignature(
        "initialize(address,bool,uint256,uint256,uint256,uint256)",
        _globalRegistry,
        _isPrivate,
        _defaultProposalSupport,
        _defaultProposalQuorum,
        _defaultProposalTimeout,
        _periodLength
      )
    );

    proxy.transferProxyOwnership(msg.sender);

    return PrivateFundStorage(address(proxy));
  }
}
