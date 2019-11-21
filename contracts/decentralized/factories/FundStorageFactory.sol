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
import "@galtproject/core/contracts/registries/GaltGlobalRegistry.sol";

// This contract will be included into the current one
import "../FundStorage.sol";


contract FundStorageFactory is Ownable {
  function build(
    GaltGlobalRegistry _ggr,
    bool _isPrivate,
    uint256 _defaultProposalSupport,
    uint256 _defaultProposalQuorum,
    uint256 _defaultProposalTimeout,
    uint256 _periodLength
  )
    external
    returns (FundStorage)
  {
    FundStorage fundStorage = new FundStorage(
      _ggr,
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
