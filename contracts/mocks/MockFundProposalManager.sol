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

import "../FundProposalManager.sol";

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

    emit NewProposal(id, msg.sender, p.marker);
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
