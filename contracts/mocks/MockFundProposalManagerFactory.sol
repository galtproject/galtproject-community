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

// This contract will be included into the current one
import "./MockFundProposalManager.sol";


contract MockFundProposalManagerFactory is Ownable {
  function build(
    IFundRegistry _fundRegistry
  )
    external
    returns (FundProposalManager)
  {
    MockFundProposalManager fundProposalManager = new MockFundProposalManager();
    fundProposalManager.initialize(_fundRegistry);

    return fundProposalManager;
  }
}
