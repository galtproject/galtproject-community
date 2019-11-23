/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/drafts/Counters.sol";
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "../abstract/interfaces/IAbstractFundStorage.sol";


contract FundProposalManager {
  using SafeMath for uint256;
  using Counters for Counters.Counter;
  using ArraySet for ArraySet.AddressSet;
  using ArraySet for ArraySet.Uint256Set;

  // 100% == 100 ether
  uint256 public constant ONE_HUNDRED_PCT = 100 ether;

  event NewProposal(uint256 indexed proposalId, address indexed proposer, bytes32 indexed marker);
  event AyeProposal(uint256 indexed proposalId, address indexed voter);
  event NayProposal(uint256 indexed proposalId, address indexed voter);

  event Approved(uint256 ayeShare, uint256 support, uint256 indexed proposalId, bytes32 indexed marker);

  struct ProposalVoting {
    uint256 creationBlock;
    uint256 creationTotalSupply;
    uint256 createdAt;
    uint256 timeoutAt;
    uint256 requiredSupport;
    uint256 minAcceptQuorum;
    uint256 totalAyes;
    uint256 totalNays;
    mapping(address => Choice) participants;
    ArraySet.AddressSet ayes;
    ArraySet.AddressSet nays;
  }

  struct Proposal {
    ProposalStatus status;
    address creator;
    address destination;
    uint256 value;
    bytes32 marker;
    bytes data;
    string dataLink;
    bytes response;
  }

  IAbstractFundStorage public fundStorage;
  Counters.Counter internal idCounter;

  mapping(uint256 => Proposal) public proposals;
  mapping(uint256 => address) private _proposalToSender;

  mapping(bytes32 => ArraySet.Uint256Set) private _activeProposals;
  mapping(address => mapping(bytes32 => ArraySet.Uint256Set)) private _activeProposalsBySender;

  mapping(bytes32 => uint256[]) private _approvedProposals;
  mapping(bytes32 => uint256[]) private _rejectedProposals;

  mapping(uint256 => ProposalVoting) internal _proposalVotings;

  enum ProposalStatus {
    NULL,
    ACTIVE,
    APPROVED,
    EXECUTED,
    REJECTED
  }

  enum Choice {
    PENDING,
    AYE,
    NAY
  }

  modifier onlyMember() {
    require(fundStorage.getRA().balanceOf(msg.sender) > 0, "Not valid member");

    _;
  }

  constructor(IAbstractFundStorage _fundStorage) public {
    fundStorage = _fundStorage;
  }

  function propose(
    address _destination,
    uint256 _value,
    bytes calldata _data,
    string calldata _dataLink
  )
    external
    onlyMember
  {
    idCounter.increment();
    uint256 id = idCounter.current();

    Proposal storage p = proposals[id];
    p.creator = msg.sender;
    p.destination = _destination;
    p.value = _value;
    p.data = _data;
    p.dataLink = _dataLink;
    p.marker = fundStorage.getThresholdMarker(_destination, _data);

    p.status = ProposalStatus.ACTIVE;
    _onNewProposal(id);

    emit NewProposal(id, msg.sender, p.marker);
  }

  function aye(uint256 _proposalId) external {
    require(proposals[_proposalId].status == ProposalStatus.ACTIVE, "Proposal isn't active");

    _aye(_proposalId, msg.sender);
  }

  function nay(uint256 _proposalId) external {
    require(proposals[_proposalId].status == ProposalStatus.ACTIVE, "Proposal isn't active");

    _nay(_proposalId, msg.sender);
  }

  // permissionLESS
  function triggerApprove(uint256 _proposalId) external {
    Proposal storage p = proposals[_proposalId];
    ProposalVoting storage pv = _proposalVotings[_proposalId];

    // Voting is not executed yet
    require(p.status == ProposalStatus.ACTIVE, "Proposal isn't active");

    // Voting timeout has passed
    require(pv.timeoutAt < block.timestamp, "Timeout hasn't been passed");

    uint256 support = getCurrentSupport(_proposalId);

    // Has enough support?
    require(support >= pv.requiredSupport, "Support hasn't been reached");

    uint256 ayeShare = getAyeShare(_proposalId);

    // Has min quorum?
    require(ayeShare >= pv.minAcceptQuorum, "MIN aye quorum hasn't been reached");

    _activeProposals[p.marker].remove(_proposalId);
    _activeProposalsBySender[_proposalToSender[_proposalId]][p.marker].remove(_proposalId);
    _approvedProposals[p.marker].push(_proposalId);

    p.status = ProposalStatus.APPROVED;
    emit Approved(ayeShare, support, _proposalId, p.marker);

    execute(_proposalId);
  }

  // INTERNAL
  function _aye(uint256 _proposalId, address _voter) internal {
    ProposalVoting storage pV = _proposalVotings[_proposalId];
    uint256 reputation = reputationOf(_voter, pV.creationBlock);

    if (pV.participants[_voter] == Choice.NAY) {
      pV.nays.remove(_voter);
      pV.totalNays = pV.totalNays.sub(reputation);
    }

    pV.participants[_voter] = Choice.AYE;
    pV.ayes.add(_voter);
    pV.totalAyes = pV.totalAyes.add(reputation);

    emit AyeProposal(_proposalId, _voter);
  }

  function _nay(uint256 _proposalId, address _voter) internal {
    ProposalVoting storage pV = _proposalVotings[_proposalId];
    uint256 reputation = reputationOf(_voter, pV.creationBlock);

    if (pV.participants[_voter] == Choice.AYE) {
      pV.ayes.remove(_voter);
      pV.totalAyes = pV.totalAyes.sub(reputation);
    }

    pV.participants[msg.sender] = Choice.NAY;
    pV.nays.add(msg.sender);
    pV.totalNays = pV.totalNays.add(reputation);

    emit NayProposal(_proposalId, _voter);
  }

  function _onNewProposal(uint256 _proposalId) internal {
    bytes32 marker = proposals[_proposalId].marker;

    _activeProposals[marker].add(_proposalId);
    _activeProposalsBySender[msg.sender][marker].add(_proposalId);
    _proposalToSender[_proposalId] = msg.sender;

    uint256 blockNumber = block.number.sub(1);
    uint256 totalSupply = fundStorage.getRA().totalSupplyAt(blockNumber);
    require(totalSupply > 0, "Total reputation is 0");

    ProposalVoting storage pv = _proposalVotings[_proposalId];

    pv.creationBlock = blockNumber;
    pv.creationTotalSupply = totalSupply;

    (uint256 support, uint256 quorum, uint256 timeout) = fundStorage.getProposalVotingConfig(marker);
    pv.createdAt = block.timestamp;
    pv.timeoutAt = block.timestamp + timeout;

    pv.requiredSupport = support;
    pv.minAcceptQuorum = quorum;
  }

  function execute(uint256 _proposalId) public {
    Proposal storage p = proposals[_proposalId];

    require(p.status == ProposalStatus.APPROVED, "Proposal isn't APPROVED");

    p.status = ProposalStatus.EXECUTED;

    (bool ok, bytes memory response) = address(p.destination)
      .call
      .value(p.value)
      .gas(gasleft() - 50000)(p.data);

    if (ok == false) {
      p.status = ProposalStatus.APPROVED;
    }

    p.response = response;
  }

  // GETTERS

  function getProposalResponseAsErrorString(uint256 _proposalId) public view returns (string memory) {
    return string(proposals[_proposalId].response);
  }

  function getActiveProposals(bytes32 _marker) public view returns (uint256[] memory) {
    return _activeProposals[_marker].elements();
  }

  function getActiveProposalsCount(bytes32 _marker) public view returns (uint256) {
    return _activeProposals[_marker].size();
  }

  function getActiveProposalsBySender(address _sender, bytes32 _marker) external view returns (uint256[] memory) {
    return _activeProposalsBySender[_sender][_marker].elements();
  }

  function getActiveProposalsBySenderCount(address _sender, bytes32 _marker) external view returns (uint256) {
    return _activeProposalsBySender[_sender][_marker].size();
  }

  function getApprovedProposals(bytes32 _marker) public view returns (uint256[] memory) {
    return _approvedProposals[_marker];
  }

  function getApprovedProposalsCount(bytes32 _marker) public view returns (uint256) {
    return _approvedProposals[_marker].length;
  }

  function getRejectedProposals(bytes32 _marker) public view returns (uint256[] memory) {
    return _rejectedProposals[_marker];
  }

  function getRejectedProposalsCount(bytes32 _marker) public view returns (uint256) {
    return _rejectedProposals[_marker].length;
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
      address[] memory ayes,
      address[] memory nays
    )
  {
    ProposalVoting storage pV = _proposalVotings[_proposalId];

    return (
      pV.creationBlock,
      pV.creationTotalSupply,
      pV.totalAyes,
      pV.totalNays,
      pV.ayes.elements(),
      pV.nays.elements()
    );
  }

  function getProposalVotingProgress(
    uint256 _proposalId
  )
    external
    view
    returns (
      uint256 ayesShare,
      uint256 naysShare,
      uint256 totalAyes,
      uint256 totalNays,
      uint256 currentSupport,
      uint256 requiredSupport,
      uint256 minAcceptQuorum,
      uint256 timeoutAt
    )
  {
    ProposalVoting storage pV = _proposalVotings[_proposalId];

    return (
      getAyeShare(_proposalId),
      getNayShare(_proposalId),
      pV.totalAyes,
      pV.totalNays,
      getCurrentSupport(_proposalId),
      pV.requiredSupport,
      pV.minAcceptQuorum,
      pV.timeoutAt
    );
  }

  function getParticipantProposalChoice(uint256 _proposalId, address _participant) external view returns (Choice) {
    return _proposalVotings[_proposalId].participants[_participant];
  }

  function reputationOf(address _address, uint256 _blockNumber) public view returns (uint256) {
    return fundStorage.getRA().balanceOfAt(_address, _blockNumber);
  }

  function getCurrentSupport(uint256 _proposalId) public view returns (uint256) {
    ProposalVoting storage pv = _proposalVotings[_proposalId];

    uint256 totalVotes = pv.totalAyes.add(pv.totalNays);

    if (totalVotes == 0) {
      return 0;
    }

    return pv.totalAyes.mul(ONE_HUNDRED_PCT) / totalVotes;
  }

  function getAyeShare(uint256 _proposalId) public view returns (uint256) {
    ProposalVoting storage p = _proposalVotings[_proposalId];

    return p.totalAyes.mul(ONE_HUNDRED_PCT) / p.creationTotalSupply;
  }

  function getNayShare(uint256 _proposalId) public view returns (uint256) {
    ProposalVoting storage p = _proposalVotings[_proposalId];

    return p.totalNays.mul(ONE_HUNDRED_PCT) / p.creationTotalSupply;
  }
}
