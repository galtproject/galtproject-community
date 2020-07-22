/*
 * Copyright ©️ 2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;


interface IFundRuleRegistry {
  event AddMeeting(uint256 indexed id, string dataLink, uint256 startOn, uint256 endOn);
  event EditMeeting(uint256 indexed id, string dataLink, uint256 startOn, uint256 endOn, bool active);

  event AddFundRule(uint256 indexed id);
  event DisableFundRule(uint256 indexed id);

  struct Meeting {
    bool active;
    address creator;
    uint256 id;
    string dataLink;
    uint256 createdAt;
    uint256 startOn;
    uint256 endOn;
  }

  struct FundRule {
    bool active;
    address manager;
    uint256 id;
    uint256 typeId;
    uint256 meetingId;
    bytes32 ipfsHash;
    string dataLink;
    uint256 createdAt;
    uint256 disabledAt;
  }

  function getActiveFundRules() external view returns (uint256[] memory);
  function getActiveFundRulesCount() external view returns (uint256);

  function getMeetings() external view returns (uint256[] memory);
  function getMeetingsCount() external view returns (uint256);

  function isMeetingActive(uint256 _meetingId) external view returns (bool);

  function isMeetingStarted(uint256 _meetingId) external view returns (bool);

  function isMeetingEnded(uint256 _meetingId) external view returns (bool);

  function isMeetingAvailableToCreateProposal(uint256 _meetingId) external view returns (bool);
}
