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

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/drafts/Counters.sol";
import "@galtproject/libs/contracts/traits/Permissionable.sol";
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "@galtproject/core/contracts/multisig/proposals/AbstractProposalManager.sol";
import "../FundStorage.sol";
import "../interfaces/IFundRA.sol";


contract AbstractFundProposalManager {
  using SafeMath for uint256;
  using Counters for Counters.Counter;
  using ArraySet for ArraySet.AddressSet;
  using ArraySet for ArraySet.Uint256Set;

  event NewProposal(uint256 proposalId, address proposee);
  event Approved(uint256 ayeShare, uint256 threshold);
  event Rejected(uint256 nayShare, uint256 threshold);

  struct ProposalVoting {
    uint256 creationBlock;
    uint256 creationTotalSupply;
    uint256 totalAyes;
    uint256 totalNays;
    ProposalStatus status;
    mapping(address => Choice) participants;
    ArraySet.AddressSet ayes;
    ArraySet.AddressSet nays;
  }

  FundStorage fundStorage;
  Counters.Counter internal idCounter;

  ArraySet.Uint256Set private _activeProposals;
  mapping(address => ArraySet.Uint256Set) private _activeProposalsBySender;

  mapping(uint256 => address) private _proposalToSender;

  uint256[] private _approvedProposals;
  uint256[] private _rejectedProposals;

  mapping(uint256 => ProposalVoting) internal _proposalVotings;

  enum ProposalStatus {
    NULL,
    ACTIVE,
    APPROVED,
    REJECTED
  }

  enum Choice {
    PENDING,
    AYE,
    NAY
  }

  modifier onlyMember() {
    // TODO: define
    //    require(rsra.balanceOf(msg.sender) > 0, "Not valid member");

    _;
  }

  constructor(FundStorage _fundStorage) public {
    fundStorage = _fundStorage;
  }

  // GETTERS
  // Should be implemented inside descendant
  function _execute(uint256 _proposalId) internal;

  function getThreshold() public view returns (uint256);

  // Nothing to do in case when non-overridden
  function _reject(uint256 _proposalId) internal {
  }

  function aye(uint256 _proposalId) external onlyMember {
    require(_proposalVotings[_proposalId].status == ProposalStatus.ACTIVE, "Proposal isn't active");

    _aye(_proposalId, msg.sender);
  }

  function nay(uint256 _proposalId) external onlyMember {
    require(_proposalVotings[_proposalId].status == ProposalStatus.ACTIVE, "Proposal isn't active");

    _nay(_proposalId, msg.sender);
  }

  // permissionLESS
  function triggerApprove(uint256 _proposalId) external {
    ProposalVoting storage proposalVoting = _proposalVotings[_proposalId];
    require(proposalVoting.status == ProposalStatus.ACTIVE, "Proposal isn't active");

    uint256 threshold = getThreshold();
    uint256 ayeShare = getAyeShare(_proposalId);

    require(ayeShare >= threshold, "Threshold doesn't reached yet");

    proposalVoting.status = ProposalStatus.APPROVED;

    _activeProposals.remove(_proposalId);
    _activeProposalsBySender[_proposalToSender[_proposalId]].remove(_proposalId);
    _approvedProposals.push(_proposalId);

    _execute(_proposalId);

    emit Approved(ayeShare, threshold);
  }

  // permissionLESS
  function triggerReject(uint256 _proposalId) external {
    ProposalVoting storage proposalVoting = _proposalVotings[_proposalId];
    require(proposalVoting.status == ProposalStatus.ACTIVE, "Proposal isn't active");

    uint256 threshold = getThreshold();
    uint256 nayShare = getNayShare(_proposalId);

    require(nayShare >= threshold, "Threshold doesn't reached yet");

    proposalVoting.status = ProposalStatus.REJECTED;
    _activeProposals.remove(_proposalId);
    _activeProposalsBySender[_proposalToSender[_proposalId]].remove(_proposalId);
    _rejectedProposals.push(_proposalId);

    _reject(_proposalId);

    emit Rejected(nayShare, threshold);
  }

  // INTERNAL
  function _aye(uint256 _proposalId, address _voter) internal {
    ProposalVoting storage p = _proposalVotings[_proposalId];
    uint256 reputation = reputationOf(_voter, p.creationBlock);

    if (p.participants[_voter] == Choice.NAY) {
      p.nays.remove(_voter);
      p.totalNays = p.totalNays.sub(reputation);
    }

    p.participants[_voter] = Choice.AYE;
    p.ayes.add(_voter);
    p.totalAyes = p.totalAyes.add(reputation);
  }

  function _nay(uint256 _proposalId, address _voter) internal {
    ProposalVoting storage p = _proposalVotings[_proposalId];
    uint256 reputation = reputationOf(_voter, p.creationBlock);

    if (p.participants[_voter] == Choice.AYE) {
      p.ayes.remove(_voter);
      p.totalAyes = p.totalAyes.sub(reputation);
    }

    p.participants[msg.sender] = Choice.NAY;
    p.nays.add(msg.sender);
    p.totalNays = p.totalNays.add(reputation);
  }

  function _onNewProposal(uint256 _proposalId) internal {
    _activeProposals.add(_proposalId);
    _activeProposalsBySender[msg.sender].add(_proposalId);
    _proposalToSender[_proposalId] = msg.sender;

    uint256 blockNumber = block.number.sub(1);
    uint256 totalSupply = fundStorage.getRA().totalSupplyAt(blockNumber);
    require(totalSupply > 0, "Total reputation is 0");

    _proposalVotings[_proposalId].creationBlock = blockNumber;
    _proposalVotings[_proposalId].creationTotalSupply = totalSupply;
  }

  // GETTERS

  function getActiveProposals() public view returns (uint256[] memory) {
    return _activeProposals.elements();
  }

  function getActiveProposalsCount() public view returns (uint256) {
    return _activeProposals.size();
  }

  function getActiveProposalsBySender(address _sender) external view returns (uint256[] memory) {
    return _activeProposalsBySender[_sender].elements();
  }

  function getActiveProposalsBySenderCount(address _sender) external view returns (uint256) {
    return _activeProposalsBySender[_sender].size();
  }

  function getApprovedProposals() public view returns (uint256[] memory) {
    return _approvedProposals;
  }

  function getApprovedProposalsCount() public view returns (uint256) {
    return _approvedProposals.length;
  }

  function getRejectedProposals() public view returns (uint256[] memory) {
    return _rejectedProposals;
  }

  function getRejectedProposalsCount() public view returns (uint256) {
    return _rejectedProposals.length;
  }

  function getProposalVoting(
    uint256 _proposalId
  )
    external
    view
    returns (
      uint256 creationBlock,
      uint256 creationTotalSupply,
      uint256 totalAyes,
      uint256 totalNays,
      ProposalStatus status,
      address[] memory ayes,
      address[] memory nays
    )
  {
    ProposalVoting storage p = _proposalVotings[_proposalId];

    return (
      p.creationBlock,
      p.creationTotalSupply,
      p.totalAyes,
      p.totalNays,
      p.status,
      p.ayes.elements(),
      p.nays.elements()
    );
  }

  function getProposalStatus(
    uint256 _proposalId
  )
    external
    view
    returns (
      ProposalStatus status,
      uint256 ayesCount,
      uint256 naysCount
    )
  {
    ProposalVoting storage p = _proposalVotings[_proposalId];

    return (p.status, p.ayes.size(), p.nays.size());
  }

  function getParticipantProposalChoice(uint256 _proposalId, address _participant) external view returns (Choice) {
    return _proposalVotings[_proposalId].participants[_participant];
  }

  function reputationOf(address _address, uint256 _blockNumber) public view returns (uint256) {
    return fundStorage.getRA().balanceOfAt(_address, _blockNumber);
  }

  function getAyeShare(uint256 _proposalId) public view returns (uint256) {
    ProposalVoting storage p = _proposalVotings[_proposalId];

    return p.totalAyes * 100 / p.creationTotalSupply;
  }

  function getNayShare(uint256 _proposalId) public view returns (uint256) {
    ProposalVoting storage p = _proposalVotings[_proposalId];

    return p.totalNays * 100 / p.creationTotalSupply;
  }
}

