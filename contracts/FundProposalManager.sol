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
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "./FundStorage.sol";
import "./interfaces/IFundRA.sol";


contract FundProposalManager {
  using SafeMath for uint256;
  using Counters for Counters.Counter;
  using ArraySet for ArraySet.AddressSet;
  using ArraySet for ArraySet.Uint256Set;

  // 100% == 10**6
  uint256 public constant DECIMALS = 10**6;

  event NewProposal(uint256 proposalId, address proposee, bytes32 marker);
  event Approved(uint256 ayeShare, uint256 threshold);
  event Rejected(uint256 nayShare, uint256 threshold);

  struct ProposalVoting {
    uint256 creationBlock;
    uint256 creationTotalSupply;
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
    string description;
    bytes response;
  }

  FundStorage fundStorage;
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
    // TODO: define
    //    require(rsra.balanceOf(msg.sender) > 0, "Not valid member");

    _;
  }

  constructor(FundStorage _fundStorage) public {
    fundStorage = _fundStorage;
  }

  function propose(
    address _destination,
    uint256 _value,
    bytes calldata _data,
    string calldata _description
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
    p.description = _description;
    p.marker = fundStorage.getThresholdMarker(_destination, _data);

    p.status = ProposalStatus.ACTIVE;
    _onNewProposal(id);

    emit NewProposal(id, msg.sender, p.marker);
  }

  function aye(uint256 _proposalId) external onlyMember {
    require(proposals[_proposalId].status == ProposalStatus.ACTIVE, "Proposal isn't active");

    _aye(_proposalId, msg.sender);
  }

  function nay(uint256 _proposalId) external onlyMember {
    require(proposals[_proposalId].status == ProposalStatus.ACTIVE, "Proposal isn't active");

    _nay(_proposalId, msg.sender);
  }

  // permissionLESS
  function triggerApprove(uint256 _proposalId) external {
    Proposal storage p = proposals[_proposalId];

    require(p.status == ProposalStatus.ACTIVE, "Proposal isn't active");

    uint256 threshold = fundStorage.thresholds(p.marker);
    uint256 ayeShare = getAyeShare(_proposalId);

    require(ayeShare >= threshold, "Threshold doesn't reached yet");
    assert(ayeShare <= DECIMALS);

    if (threshold > 0) {
      require(ayeShare >= threshold, "Threshold doesn't reached yet");
    } else {
      require(ayeShare >= fundStorage.defaultProposalThreshold(), "Threshold doesn't reached yet");
    }

    _activeProposals[p.marker].remove(_proposalId);
    _activeProposalsBySender[_proposalToSender[_proposalId]][p.marker].remove(_proposalId);
    _approvedProposals[p.marker].push(_proposalId);

    p.status = ProposalStatus.APPROVED;
    emit Approved(ayeShare, threshold);

    execute(_proposalId);
  }

  // permissionLESS
  function triggerReject(uint256 _proposalId) external {
    Proposal storage p = proposals[_proposalId];

    require(p.status == ProposalStatus.ACTIVE, "Proposal isn't active");

    uint256 threshold = fundStorage.thresholds(p.marker);
    uint256 nayShare = getNayShare(_proposalId);
    assert(nayShare <= DECIMALS);

    if (threshold > 0) {
      require(nayShare >= threshold, "Threshold doesn't reached yet");
    } else {
      require(nayShare >= fundStorage.defaultProposalThreshold(), "Threshold doesn't reached yet");
    }

    _activeProposals[p.marker].remove(_proposalId);
    _activeProposalsBySender[_proposalToSender[_proposalId]][p.marker].remove(_proposalId);
    _rejectedProposals[p.marker].push(_proposalId);

    p.status = ProposalStatus.REJECTED;
    emit Rejected(nayShare, threshold);
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
  }

  function _onNewProposal(uint256 _proposalId) internal {
    
    _activeProposals[proposals[_proposalId].marker].add(_proposalId);
    _activeProposalsBySender[msg.sender][proposals[_proposalId].marker].add(_proposalId);
    _proposalToSender[_proposalId] = msg.sender;

    uint256 blockNumber = block.number.sub(1);
    uint256 totalSupply = fundStorage.getRA().totalSupplyAt(blockNumber);
    require(totalSupply > 0, "Total reputation is 0");

    _proposalVotings[_proposalId].creationBlock = blockNumber;
    _proposalVotings[_proposalId].creationTotalSupply = totalSupply;
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

  function getThreshold(uint256 _proposalId) external view returns (uint256) {
    uint256 custom = fundStorage.thresholds(proposals[_proposalId].marker);

    if (custom > 0) {
      return custom;
    } else {
      return fundStorage.defaultProposalThreshold();
    }
  }

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

  function getParticipantProposalChoice(uint256 _proposalId, address _participant) external view returns (Choice) {
    return _proposalVotings[_proposalId].participants[_participant];
  }

  function reputationOf(address _address, uint256 _blockNumber) public view returns (uint256) {
    return fundStorage.getRA().balanceOfAt(_address, _blockNumber);
  }

  function getAyeShare(uint256 _proposalId) public view returns (uint256) {
    ProposalVoting storage p = _proposalVotings[_proposalId];

    return p.totalAyes * DECIMALS / p.creationTotalSupply;
  }

  function getNayShare(uint256 _proposalId) public view returns (uint256) {
    ProposalVoting storage p = _proposalVotings[_proposalId];

    return p.totalNays * DECIMALS / p.creationTotalSupply;
  }
}

