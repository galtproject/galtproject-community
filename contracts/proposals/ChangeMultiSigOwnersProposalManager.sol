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

import "@galtproject/core/contracts/interfaces/ISpaceLocker.sol";
import "./AbstractFundProposalManager.sol";
import "../FundStorage.sol";
import "../FundMultiSig.sol";


contract ChangeMultiSigOwnersProposalManager is AbstractFundProposalManager {
  struct Proposal {
    string description;
    uint256 required;
    address[] newOwners;
  }

  mapping(uint256 => Proposal) private _proposals;

  constructor(
    FundStorage _fundStorage
  )
    public
    AbstractFundProposalManager(_fundStorage)
  {
  }

  function propose(address[] calldata _newOwners, uint256 _required, string calldata _description) external {
    require(_required <= _newOwners.length, "Required too big");
    require(_required > 0, "Required too low");

    uint256 id = idCounter.next();

    _proposals[id] = Proposal({
      newOwners: _newOwners,
      required: _required,
      description: _description
    });

    emit NewProposal(id, msg.sender);
    _onNewProposal(id);

    ProposalVoting storage proposalVoting = _proposalVotings[id];

    proposalVoting.status = ProposalStatus.ACTIVE;
  }

  function _execute(uint256 _proposalId) internal {
    Proposal storage p = _proposals[_proposalId];

    require(fundStorage.areMembersValid(p.newOwners), "Not all members are valid");

    fundStorage.getMultiSig().setOwners(p.newOwners, p.required);
  }

  function getThreshold() public view returns (uint256) {
    return uint256(fundStorage.getConfigValue(fundStorage.CHANGE_MS_OWNERS_THRESHOLD()));
  }

  function getProposal(uint256 _proposalId) external view returns (address[] memory newOwners, uint256 required, string memory description) {
    Proposal storage p = _proposals[_proposalId];

    return (p.newOwners, p.required, p.description);
  }
}
