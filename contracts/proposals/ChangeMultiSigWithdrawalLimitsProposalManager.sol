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


contract ChangeMultiSigWithdrawalLimitsProposalManager is AbstractFundProposalManager {
  struct Proposal {
    address erc20Contract;
    uint256 limit;
    string description;
  }

  mapping(uint256 => Proposal) private _proposals;

  constructor(IRSRA _rsra, FundStorage _fundStorage) public AbstractFundProposalManager(_rsra, _fundStorage) {
  }

  function propose(address _erc20Contract, uint256 _limit, string calldata _description) external onlyMember {
    uint256 id = idCounter.next();

    _proposals[id] = Proposal({
      erc20Contract: _erc20Contract,
      limit: _limit,
      description: _description
    });

    emit NewProposal(id, msg.sender);
    _onNewProposal(id);

    ProposalVoting storage proposalVoting = _proposalVotings[id];

    proposalVoting.status = ProposalStatus.ACTIVE;
  }

  function _execute(uint256 _proposalId) internal {
    Proposal storage p = _proposals[_proposalId];

    fundStorage.setPeriodLimit(p.erc20Contract, p.limit);
  }

  function getProposal(
    uint256 _proposalId
  )
    external
    view
    returns (
      address erc20Contract,
      uint256 limit,
      string memory description
    )
  {
    Proposal storage p = _proposals[_proposalId];

    return (p.erc20Contract, p.limit, p.description);
  }

  function getThreshold() public view returns (uint256) {
    return uint256(fundStorage.getConfigValue(fundStorage.CHANGE_WITHDRAWAL_LIMITS_THRESHOLD()));
  }
}
