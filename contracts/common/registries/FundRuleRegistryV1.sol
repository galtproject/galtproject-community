/*
 * Copyright ©️ 2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "./FundRuleRegistryCore.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";


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

  function setMeetingSettings(uint256 _meetingNoticePeriod, uint256 _meetingMinDuration) external onlyRole(ROLE_MEETING_SETTINGS_MANAGER) {
    meetingNoticePeriod = _meetingNoticePeriod;
    meetingMinDuration = _meetingMinDuration;
  }

  function addMeeting(string calldata _dataLink, uint256 _startOn, uint256 _endOn)
    external
    payable
    onlyMemberOrMultiSigOwner
  {
    require(_startOn > block.timestamp, "startOn must be greater then current timestamp");
    require(_endOn > _startOn && _endOn.sub(_startOn) >= meetingMinDuration, "duration must be grater or equal meetingMinDuration");

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

    _meetings.push(_id);

    emit AddMeeting(_id, _dataLink, _startOn, _endOn);
  }

  function editMeeting(
    uint256 _id,
    string calldata _dataLink,
    uint256 _startOn,
    uint256 _endOn,
    bool _active
  )
    external
    payable
    onlyMemberOrMultiSigOwner
  {
    _acceptPayment(EDIT_MEETING_FEE_KEY);
    Meeting storage meeting = meetings[_id];

    require(meeting.startOn - meetingNoticePeriod > block.timestamp, "endOn should be greater then startOn");
    require(_endOn > _startOn && _endOn.sub(_startOn) >= meetingMinDuration, "duration must be grater or equal meetingMinDuration");
    require(meetings[_id].creator == msg.sender, "Not meeting creator");

    meeting.active = _active;
    meeting.dataLink = _dataLink;
    meeting.startOn = _startOn;
    meeting.endOn = _endOn;

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

      require(block.timestamp > meetings[_meetingId].endOn, "Must be executed after meeting end");
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
