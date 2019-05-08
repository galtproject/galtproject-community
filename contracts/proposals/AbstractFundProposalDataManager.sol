/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

pragma solidity 0.5.3;

import "../FundStorage.sol";
import "./AbstractFundProposalManager.sol";


// Contract has FEE_MANAGER role in FunStorage, so it is granted performing all
// fee-related permissions.
// A proposal should contain already encoded data to call (method + arguments).
contract AbstractFundProposalDataManager is AbstractFundProposalManager {
  struct Proposal {
    bytes data;
    bytes response;
    string description;
  }

  mapping(uint256 => Proposal) private _proposals;

  constructor(FundStorage _fundStorage) public AbstractFundProposalManager(_fundStorage) {
  }

  function propose(
    bytes calldata _data,
    string calldata _description
  )
    external
    onlyMember
  {
    idCounter.increment();
    uint256 id = idCounter.current();

    Proposal storage p = _proposals[id];
    p.data = _data;
    p.description = _description;

    emit NewProposal(id, msg.sender);
    _onNewProposal(id);

    ProposalVoting storage proposalVoting = _proposalVotings[id];

    proposalVoting.status = ProposalStatus.ACTIVE;
  }

  function _execute(uint256 _proposalId) internal {
    Proposal storage p = _proposals[_proposalId];

    (bool x, bytes memory response) = address(fundStorage).call.gas(gasleft() - 50000)(p.data);

    assert(x == true);

    p.response = response;
  }

  function getProposal(
    uint256 _proposalId
  )
    external
    view
    returns (
      bytes memory data,
      bytes memory response,
      string memory description
    )
  {
    Proposal storage p = _proposals[_proposalId];

    return (p.data, p.response, p.description);
  }
}
