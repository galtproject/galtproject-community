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

contract WLProposalManager is AbstractFundProposalManager {
  enum Action {
    ADD,
    REMOVE
  }

  struct Proposal {
    Action action;
    address contractAddress;
    bytes32 contractType;
    bytes32 abiIpfsHash;
    string description;
  }

  mapping(uint256 => Proposal) private _proposals;

  constructor(IRSRA _rsra, FundStorage _fundStorage) public AbstractFundProposalManager(_rsra, _fundStorage) {
  }

  function propose(
    Action _action,
    address _contractAddress,
    bytes32 _contractType,
    bytes32 _abiIpfsHash,
    string calldata _description
  )
    external
    onlyMember
  {
    uint256 id = idCounter.next();

    _proposals[id] = Proposal({
      action: _action,
      contractAddress: _contractAddress,
      contractType: _contractType,
      abiIpfsHash: _abiIpfsHash,
      description: _description
    });

    emit NewProposal(id, msg.sender);
    _onNewProposal(id);

    ProposalVoting storage proposalVoting = _proposalVotings[id];

    proposalVoting.status = ProposalStatus.ACTIVE;
  }

  function _execute(uint256 _proposalId) internal {
    Proposal storage p = _proposals[_proposalId];

    if (p.action == Action.ADD) {
      fundStorage.addWhiteListedContract(
        p.contractAddress,
        p.contractType,
        p.abiIpfsHash,
        p.description
      );
    } else {
      fundStorage.removeWhiteListedContract(p.contractAddress);
    }
  }

  function getProposal(uint256 _proposalId) external view returns (address contractAddress, bytes32 contractType, Action action, string memory description) {
    Proposal storage p = _proposals[_proposalId];

    return (p.contractAddress, p.contractType, p.action, p.description);
  }

  function getThreshold() public view returns (uint256) {
    return uint256(fundStorage.getConfigValue(fundStorage.MANAGE_WL_THRESHOLD()));
  }
}
