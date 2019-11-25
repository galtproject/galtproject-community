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
import "@galtproject/libs/contracts/proxy/unstructured-storage/OwnedUpgradeabilityProxy.sol";
import "../../common/interfaces/IFundRegistry.sol";

// This contract will be included into the current one
import "../FundStorage.sol";


contract FundStorageFactory is Ownable {
  function build(
    IFundRegistry _fundRegistry,
    bool _isPrivate,
    uint256 _defaultProposalSupport,
    uint256 _defaultProposalQuorum,
    uint256 _defaultProposalTimeout,
    uint256 _periodLength
  )
    external
    returns (FundStorage)
  {
    OwnedUpgradeabilityProxy proxy = new OwnedUpgradeabilityProxy();

    FundStorage fundStorage = new FundStorage();

    proxy.upgradeToAndCall(
      address(fundStorage),
      abi.encodeWithSignature(
          "initialize(address,bool,uint256,uint256,uint256,uint256)",
          _fundRegistry,
          _isPrivate,
          _defaultProposalSupport,
          _defaultProposalQuorum,
          _defaultProposalTimeout,
          _periodLength
      )
    );

    proxy.transferProxyOwnership(msg.sender);

    return FundStorage(address(proxy));
  }
}
