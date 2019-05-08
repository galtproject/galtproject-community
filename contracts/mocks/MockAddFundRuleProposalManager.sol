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

pragma solidity ^0.5.7;

import "../FundStorage.sol";
import "../proposals/AddFundRuleProposalManager.sol";

contract MockAddFundRuleProposalManager is AddFundRuleProposalManager {
  constructor(FundStorage _fundStorage) public AddFundRuleProposalManager(_fundStorage) { }

  function proposeHack(Action _action, bytes32 _ipfsHash, string calldata _description) external {
    idCounter.increment();
    uint256 id = idCounter.current();

    _proposals[id] = Proposal({
      action: _action,
      ipfsHash: _ipfsHash,
      description: _description
    });

    emit NewProposal(id, msg.sender);
    _onNewProposal(id);

    ProposalVoting storage proposalVoting = _proposalVotings[id];

    proposalVoting.status = ProposalStatus.ACTIVE;
  }

  function ayeHack(uint256 _votingId, address _voter) external {
    _aye(_votingId, _voter);
  }

  function ayeAllHack(uint256 _votingId, address[] calldata _voters) external {
    for (uint256 i = 0; i < _voters.length; i++) {
      _aye(_votingId, _voters[i]);
    }
  }
}
