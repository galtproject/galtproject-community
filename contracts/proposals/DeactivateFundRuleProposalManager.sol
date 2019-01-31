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
import "./AbstractProposalManager.sol";


contract DeactivateFundRuleProposalManager is AbstractProposalManager {
  struct Proposal {
    uint256 frpId;
    string description;
  }

  mapping(uint256 => Proposal) private _proposals;

  constructor(IRSRA _rsra, FundStorage _fundStorage) public AbstractProposalManager(_rsra, _fundStorage) {
  }

  function propose(uint256 _frpId, string calldata _description) external onlyMember {
    (bool active,,,) = fundStorage.getFundRule(_frpId);
    require(active == true, "Proposal is not active");

    uint256 id = idCounter.next();

    _proposals[id] = Proposal({
      frpId: _frpId,
      description: _description
    });

    emit NewProposal(id, msg.sender);
    _onNewProposal(id);

    ProposalVoting storage proposalVoting = _proposalVotings[id];

    proposalVoting.status = ProposalStatus.ACTIVE;
  }

  function _execute(uint256 _proposalId) internal {
    Proposal storage p = _proposals[_proposalId];

    fundStorage.disableFundRule(p.frpId);
  }

  function getProposal(
    uint256 _proposalId
  )
    external
    view
    returns (
      uint256 frpId,
      string memory description
    )
  {
    Proposal storage p = _proposals[_proposalId];

    return (p.frpId, p.description);
  }

  function getThreshold() public view returns (uint256) {
    return uint256(fundStorage.getConfigValue(fundStorage.DEACTIVATE_FUND_RULE_THRESHOLD()));
  }
}
