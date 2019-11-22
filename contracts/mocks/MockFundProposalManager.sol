/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.10;

import "../common/FundProposalManager.sol";
import "../decentralized/FundStorage.sol";


contract MockFundProposalManager is FundProposalManager {

  constructor(FundStorage _fundStorage) public FundProposalManager(_fundStorage) { }

  function proposeHack(
    address _destination,
    uint256 _value,
    bytes calldata _data,
    string calldata _description
  )
    external
  {
    idCounter.increment();
    uint256 id = idCounter.current();

    Proposal storage p = proposals[id];
    p.creator = msg.sender;
    p.destination = _destination;
    p.value = _value;
    p.data = _data;
    p.description = _description;
    p.marker = fundStorage.getThresholdMarker(_destination, _data);

    p.status = ProposalStatus.ACTIVE;
    _onNewProposal(id);

    _proposalVotings[id].timeoutAt = block.timestamp;

    emit NewProposal(id, msg.sender, p.marker);
  }

  function ayeHack(uint256 _proposalId, address _voter) external {
    _aye(_proposalId, _voter);

    emit AyeProposal(_proposalId, _voter);
  }

  function ayeAllHack(uint256 _proposalId, address[] calldata _voters) external {
    for (uint256 i = 0; i < _voters.length; i++) {
      _aye(_proposalId, _voters[i]);

      emit AyeProposal(_proposalId, _voters[i]);
    }
  }
}
