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


contract FineMemberProposalManager is AbstractFundProposalManager {
  enum Currency {
    ETH,
    ERC20
  }

  struct Proposal {
    uint256 spaceTokenId;
    uint256 amount;
    string description;
    Currency currency;
    address erc20Contract;
  }

  mapping(uint256 => Proposal) private _proposals;

  constructor(FundStorage _fundStorage) public AbstractFundProposalManager(_fundStorage) {
  }

  function propose(
    uint256 _spaceTokenId,
    Currency _currency,
    uint256 _amount,
    address _erc20Contract,
    string calldata _description
  )
    external
  {
    uint256 id = idCounter.next();

    _proposals[id] = Proposal({
      spaceTokenId: _spaceTokenId,
      currency: _currency,
      amount: _amount,
      erc20Contract: _erc20Contract,
      description: _description
    });

    emit NewProposal(id, msg.sender);
    _onNewProposal(id);

    ProposalVoting storage proposalVoting = _proposalVotings[id];

    proposalVoting.status = ProposalStatus.ACTIVE;
  }

  function _execute(uint256 _proposalId) internal {
    Proposal storage p = _proposals[_proposalId];
    address erc20Contract = p.erc20Contract;

    // Assume ETH contract is address(0x1)
    if (p.currency == Currency.ETH) {
      erc20Contract = address(0x1);
    }

    fundStorage.incrementFine(p.spaceTokenId, erc20Contract, p.amount, _proposalId);
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
      uint256 spaceTokenId,
      Currency currency,
      uint256 amount,
      address erc20Contract,
      string memory description)
  {
    Proposal storage p = _proposals[_proposalId];

    return (p.spaceTokenId, p.currency, p.amount, p.erc20Contract, p.description);
  }
}
