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
import "@galtproject/private-property-registry/contracts/interfaces/IPPGlobalRegistry.sol";

// This contract will be included into the current one
import "../PrivateFundStorage.sol";


contract PrivateFundStorageFactory is Ownable {
  function build(
    IPPGlobalRegistry _globalRegistry,
    bool _isPrivate,
    uint256 _defaultProposalSupport,
    uint256 _defaultProposalQuorum,
    uint256 _defaultProposalTimeout,
    uint256 _periodLength
  )
    external
    returns (PrivateFundStorage)
  {
    PrivateFundStorage fundStorage = new PrivateFundStorage(
      _globalRegistry,
      _isPrivate,
      _defaultProposalSupport,
      _defaultProposalQuorum,
      _defaultProposalTimeout,
      _periodLength
    );

    fundStorage.addRoleTo(msg.sender, "role_manager");
    fundStorage.removeRoleFrom(address(this), "role_manager");

    return fundStorage;
  }
}
