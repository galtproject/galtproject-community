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

pragma solidity 0.5.7;

import "../FundStorage.sol";
import "./AbstractFundProposalManager.sol";


contract ChangeMultiSigWithdrawalLimitsProposalManager is AbstractFundProposalManager {
  struct Proposal {
    bool active;
    address erc20Contract;
    uint256 amount;
    string description;
  }

  mapping(uint256 => Proposal) private _proposals;

  constructor(FundStorage _fundStorage) public AbstractFundProposalManager(_fundStorage) {
  }

  function propose(bool _active, address _erc20Contract, uint256 _amount, string calldata _description) external onlyMember {
    idCounter.increment();
    uint256 id = idCounter.current();

    _proposals[id] = Proposal({
      active: _active,
      erc20Contract: _erc20Contract,
      amount: _amount,
      description: _description
    });

    emit NewProposal(id, msg.sender);
    _onNewProposal(id);

    ProposalVoting storage proposalVoting = _proposalVotings[id];

    proposalVoting.status = ProposalStatus.ACTIVE;
  }

  function _execute(uint256 _proposalId) internal {
    Proposal storage p = _proposals[_proposalId];

    fundStorage.setPeriodLimit(p.active, p.erc20Contract, p.amount);
  }

  function getProposal(
    uint256 _proposalId
  )
    external
    view
    returns (
      bool active,
      address erc20Contract,
      uint256 amount,
      string memory description
    )
  {
    Proposal storage p = _proposals[_proposalId];

    return (p.active, p.erc20Contract, p.amount, p.description);
  }

  function getThreshold() public view returns (uint256) {
    return uint256(fundStorage.getConfigValue(fundStorage.CHANGE_WITHDRAWAL_LIMITS_THRESHOLD()));
  }
}
