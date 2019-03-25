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


contract ModifyMultiSigManagerDetailsProposalManager is AbstractFundProposalManager {
  struct Proposal {
    bool active;
    address manager;
    string name;
    bytes32[] documents;
    string description;
  }

  mapping(uint256 => Proposal) private _proposals;

  constructor(FundStorage _fundStorage) public AbstractFundProposalManager(_fundStorage) {
  }

  function propose(
    address _manager,
    bool _active,
    string calldata _name,
    bytes32[] calldata _documents,
    string calldata _description
  )
    external
  {
    uint256 id = idCounter.next();

    _proposals[id] = Proposal({
      active: _active,
      manager: _manager,
      name: _name,
      documents: _documents,
      description: _description
    });

    emit NewProposal(id, msg.sender);
    _onNewProposal(id);

    ProposalVoting storage proposalVoting = _proposalVotings[id];

    proposalVoting.status = ProposalStatus.ACTIVE;
  }

  function _execute(uint256 _proposalId) internal {
    Proposal storage p = _proposals[_proposalId];

    fundStorage.setMultiSigManager(p.active, p.manager, p.name, p.documents);
  }

  function getThreshold() public view returns (uint256) {
    return uint256(fundStorage.getConfigValue(fundStorage.FINE_MEMBER_THRESHOLD()));
  }

  function getProposal(
    uint256 _proposalId
  )
    external
    view
    returns (
      bool active,
      address manager,
      string memory name,
      bytes32[] memory documents,
      string memory description
    )
  {
    Proposal storage p = _proposals[_proposalId];

    return (p.active, p.manager, p.name, p.documents, p.description);
  }
}
