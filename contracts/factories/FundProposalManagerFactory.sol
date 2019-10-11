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
import "../FundProposalManager.sol";


contract FundProposalManagerFactory is Ownable {
  function build(
    FundStorage _fundStorage
  )
    external
    returns (FundProposalManager)
  {
    FundProposalManager fundProposalManager = new FundProposalManager(_fundStorage);

    return fundProposalManager;
  }
}
