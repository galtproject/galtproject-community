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


contract WLProposalManager is AbstractProposalManager {
  enum Action {
    ADD,
    REMOVE
  }

  struct Proposal {
    address contractAddress;
    Action action;
    string description;
  }

  mapping(uint256 => Proposal) private _proposals;

  constructor(IRSRA _rsra, FundStorage _fundStorage) public AbstractProposalManager(_rsra, _fundStorage) {
  }

  function propose(address _contractAddress, Action _action, string calldata _description) external onlyMember {
    uint256 id = idCounter.next();

    _proposals[id] = Proposal({
      contractAddress: _contractAddress,
      action: _action,
      description: _description
    });

    emit NewProposal(id, msg.sender);

    ProposalVoting storage proposalVoting = _proposalVotings[id];

    proposalVoting.status = ProposalStatus.ACTIVE;
  }

  function _execute(uint256 _proposalId) internal {
    Proposal storage p = _proposals[_proposalId];

    if (p.action == Action.ADD) {
      fundStorage.addWhiteListedContract(p.contractAddress);
    } else {
      fundStorage.removeWhiteListedContract(p.contractAddress);
    }
  }

  function getProposal(uint256 _proposalId) external view returns (address contractAddress, Action action, string memory description) {
    Proposal storage p = _proposals[_proposalId];

    return (p.contractAddress, p.action, p.description);
  }

  function getThreshold() public view returns (uint256) {
    return uint256(fundStorage.getConfigValue(fundStorage.MANAGE_WL_THRESHOLD()));
  }
}
