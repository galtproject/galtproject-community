/*
 * Copyright ©️ 2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;
//pragma experimental ABIEncoderV2;

import "./FundRuleRegistryCore.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IFundProposalManager.sol";


contract FundRuleRegistryV1 is FundRuleRegistryCore {
  using SafeMath for uint256;

  uint256 public constant VERSION = 2;

  bytes32 public constant ROLE_MEETING_SETTINGS_MANAGER = bytes32("MEETING_SETTINGS_MANAGER");
  bytes32 public constant ROLE_ADD_FUND_RULE_MANAGER = bytes32("ADD_FUND_RULE_MANAGER");
  bytes32 public constant ROLE_DEACTIVATE_FUND_RULE_MANAGER = bytes32("DEACTIVATE_FUND_RULE_MANAGER");
  bytes32 public constant ADD_MEETING_FEE_KEY = bytes32("ADD_MEETING");
  bytes32 public constant EDIT_MEETING_FEE_KEY = bytes32("EDIT_MEETING");

  constructor() public FundRuleRegistryCore() {
  }

  // EXTERNAL INTERFACE

  function setMeetingSettings(
    uint256 _meetingNoticePeriod
  )
    external
    onlyRole(ROLE_MEETING_SETTINGS_MANAGER)
  {
    meetingNoticePeriod = _meetingNoticePeriod;
  }

  function addMeeting(
    string calldata _dataLink,
    uint256 _startOn,
    uint256 _endOn,
    bool _isCommitReveal,
    address _erc20RewardsContract
  )
    external
    payable
    onlyMemberOrMultiSigOwner
  {
    require(_startOn > block.timestamp + meetingNoticePeriod, "startOn can't be sooner then meetingNoticePeriod");

    _acceptPayment(ADD_MEETING_FEE_KEY);
    uint256 _id = _meetings.length + 1;

    Meeting storage meeting = meetings[_id];

    meeting.id = _id;
    meeting.active = true;
    meeting.dataLink = _dataLink;
    meeting.creator = msg.sender;
    meeting.createdAt = block.timestamp;
    meeting.startOn = _startOn;
    meeting.endOn = _endOn;
    meeting.isCommitReveal = _isCommitReveal;
    meeting.erc20RewardsContract = _erc20RewardsContract;

    _meetings.push(_id);

    emit AddMeeting(_id, _dataLink, _startOn, _endOn);
  }

  function addProposalsData(
    uint256 _meetingId,
    uint256 _index,
    bytes memory _proposalData1,
    bytes memory _proposalData2,
    bytes memory _proposalData3,
    bytes memory _proposalData4,
    bytes memory _proposalData5,
    bytes memory _proposalData6
  )
    public
    onlyMemberOrMultiSigOwner
  {
    require(_proposalData1.length > 1, "Proposal data 1 can't be null");
    require(meetings[_meetingId].creator == msg.sender, "Not meeting creator");
    require(meetings[_meetingId].active, "Meeting not active");
    require(block.timestamp < meetings[_meetingId].startOn, "Meeting already started");

    _pushMeetingProposalData(_index, _meetingId, _proposalData1);

    if (_proposalData2.length > 1) {
      _pushMeetingProposalData(_index + 1, _meetingId, _proposalData2);
    }
    if (_proposalData3.length > 1) {
      _pushMeetingProposalData(_index + 2, _meetingId, _proposalData3);
    }
    if (_proposalData4.length > 1) {
      _pushMeetingProposalData(_index + 3, _meetingId, _proposalData4);
    }
    if (_proposalData5.length > 1) {
      _pushMeetingProposalData(_index + 4, _meetingId, _proposalData5);
    }
    if (_proposalData6.length > 1) {
      _pushMeetingProposalData(_index + 5, _meetingId, _proposalData6);
    }
  }

  function _pushMeetingProposalData(uint256 _index, uint256 _meetingId, bytes memory _data) internal {
    require(meetingsProposalsData[_meetingId].length >= _index, "Index too big");
    meetingsProposalsData[_meetingId].push(_data);
    meetingsProposalsDataLink[_meetingId].push(_getDataLink(_data));
  }

  function _getDataLink(bytes memory _data) internal view returns(string memory) {
    bytes memory _slicedData = new bytes(_data.length - 4);
    uint256 len = _data.length;
    for (uint i = 0; i < len - 4; i++) {
      _slicedData[i] = _data[i + 4];
    }
    (, , string memory dataLink) = abi.decode(_slicedData, (uint256, bytes32, string));
    return dataLink;
  }

  function createProposals(uint256 _meetingId, uint256 _countToCreate) external onlyMemberOrMultiSigOwner {
    require(meetings[_meetingId].active, "Meeting not active");
    require(block.timestamp >= meetings[_meetingId].startOn, "Proposals creation currently not available");

    IFundProposalManager proposalManager = IFundProposalManager(fundRegistry.getProposalManagerAddress());

    require(_countToCreate > 0, "countToCreate can't be 0");
    require(meetingsProposalsData[_meetingId].length - meetings[_meetingId].createdProposalsCount >= _countToCreate, "Proposals overflow");
    for (uint256 i = meetings[_meetingId].createdProposalsCount; i < meetings[_meetingId].createdProposalsCount + _countToCreate; i++) {
      proposalManager.propose(
        address(this),
        0,
        false,
        false,
        meetings[_meetingId].isCommitReveal,
        meetings[_meetingId].erc20RewardsContract,
        meetingsProposalsData[_meetingId][i],
        meetingsProposalsDataLink[_meetingId][i]
      );
    }
    meetings[_meetingId].createdProposalsCount = meetings[_meetingId].createdProposalsCount.add(_countToCreate);
  }

  function editMeeting(
    uint256 _id,
    string calldata _dataLink,
    uint256 _startOn,
    uint256 _endOn,
    bool _isCommitReveal,
    address _erc20RewardsContract,
    bool _active
  )
    external
    payable
    onlyMemberOrMultiSigOwner
  {
    _acceptPayment(EDIT_MEETING_FEE_KEY);
    Meeting storage meeting = meetings[_id];

    require(meeting.startOn - meetingNoticePeriod > block.timestamp, "edit not available for reached notice period meetings");
    require(_startOn > block.timestamp + meetingNoticePeriod, "startOn can't be sooner then meetingNoticePeriod");

    require(meetings[_id].creator == msg.sender, "Not meeting creator");

    meeting.active = _active;
    meeting.dataLink = _dataLink;
    meeting.startOn = _startOn;
    meeting.endOn = _endOn;
    meeting.isCommitReveal = _isCommitReveal;
    meeting.erc20RewardsContract = _erc20RewardsContract;

    emit EditMeeting(_id, _dataLink, _startOn, _endOn, _active);
  }

  function addRuleType1(uint256 _meetingId, bytes32 _ipfsHash, string calldata _dataLink) external onlyRole(ROLE_ADD_FUND_RULE_MANAGER) {
    _addRule(_meetingId, _ipfsHash, 1, _dataLink);
  }

  function addRuleType2(uint256 _meetingId, bytes32 _ipfsHash, string calldata _dataLink) external onlyRole(ROLE_ADD_FUND_RULE_MANAGER) {
    _addRule(_meetingId, _ipfsHash, 2, _dataLink);
  }

  function addRuleType3(uint256 _meetingId, bytes32 _ipfsHash, string calldata _dataLink) external onlyRole(ROLE_ADD_FUND_RULE_MANAGER) {
    _addRule(_meetingId, _ipfsHash, 3, _dataLink);
  }

  function addRuleType4(uint256 _meetingId, bytes32 _ipfsHash, string calldata _dataLink) external onlyRole(ROLE_ADD_FUND_RULE_MANAGER) {
    _addRule(_meetingId, _ipfsHash, 4, _dataLink);
  }

  function disableRuleType1(uint256 _id) external onlyRole(ROLE_DEACTIVATE_FUND_RULE_MANAGER) {
    _disableFundRule(_id, 1);
  }

  function disableRuleType2(uint256 _id) external onlyRole(ROLE_DEACTIVATE_FUND_RULE_MANAGER) {
    _disableFundRule(_id, 2);
  }

  function disableRuleType3(uint256 _id) external onlyRole(ROLE_DEACTIVATE_FUND_RULE_MANAGER) {
    _disableFundRule(_id, 3);
  }

  function disableRuleType4(uint256 _id) external onlyRole(ROLE_DEACTIVATE_FUND_RULE_MANAGER) {
    _disableFundRule(_id, 4);
  }

  // INTERNAL HELPERS
  function _addRule(uint256 _meetingId, bytes32 _ipfsHash, uint256 _typeId, string memory _dataLink) internal {
    if (_meetingId > 0) {
      require(meetings[_meetingId].active, "Meeting not active");

      //TODO: is it needed?
      require(block.timestamp > meetings[_meetingId].startOn, "Must be executed after meeting start");
    }
    fundRuleCounter.increment();
    uint256 _id = fundRuleCounter.current();

    FundRule storage fundRule = fundRules[_id];

    fundRule.active = true;
    fundRule.id = _id;
    fundRule.typeId = _typeId;
    fundRule.meetingId = _meetingId;
    fundRule.ipfsHash = _ipfsHash;
    fundRule.dataLink = _dataLink;
    fundRule.manager = msg.sender;
    fundRule.createdAt = block.timestamp;

    _activeFundRules.add(_id);

    emit AddFundRule(_id);
  }

  function _disableFundRule(uint256 _id, uint256 _typeId) internal {
    FundRule storage fundRule = fundRules[_id];

    require(fundRule.active == true, "Can disable an active rule only");
    require(fundRule.typeId == _typeId, "Type ID doesn't match");

    fundRules[_id].active = false;
    fundRules[_id].disabledAt = block.timestamp;

    _activeFundRules.remove(_id);

    emit DisableFundRule(_id);
  }
}
