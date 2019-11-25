/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

import "../../common/interfaces/IFundRA.sol";
import "../../common/FundMultiSig.sol";


interface IAbstractFundStorage {
  function setConfigValue(bytes32 _key, bytes32 _value) external;

  function setDefaultProposalConfig(
    uint256 _support,
    uint256 _quorum,
    uint256 _timeout
  )
    external;

  function setProposalConfig(
    bytes32 _marker,
    uint256 _support,
    uint256 _quorum,
    uint256 _timeout
  )
    external;

  function addWhiteListedContract(
    address _contract,
    bytes32 _type,
    bytes32 _abiIpfsHash,
    string calldata _dataLink
  )
    external;
  function removeWhiteListedContract(address _contract) external;

  function addProposalMarker(
    bytes4 _methodSignature,
    address _destination,
    address _proposalManager,
    bytes32 _name,
    string calldata _dataLink
  )
    external;
  function removeProposalMarker(bytes32 _marker) external;
  function replaceProposalMarker(bytes32 _oldMarker, bytes32 _newMethodSignature, address _newDestination) external;

  function addFundRule(
    bytes32 _ipfsHash,
    string calldata _dataLink
  )
    external
    returns (uint256);

  function addFeeContract(address _feeContract) external;

  function removeFeeContract(address _feeContract) external;

  function setMemberIdentification(address _member, bytes32 _identificationHash) external;

  function getMemberIdentification(address _member) external view returns(bytes32);

  function disableFundRule(uint256 _id) external;

  function setNameAndDataLink(
    string calldata _name,
    string calldata _dataLink
  )
    external;

  function setMultiSigManager(
    bool _active,
    address _manager,
    string calldata _name,
    string calldata _dataLink
  )
    external;

  function setPeriodLimit(bool _active, address _erc20Contract, uint256 _amount) external;

  function handleMultiSigTransaction(
    address _erc20Contract,
    uint256 _amount
  )
    external;

  // GETTERS
  function getProposalVotingConfig(bytes32 _key) external view returns (uint256 support, uint256 quorum, uint256 timeout);

  function getThresholdMarker(address _destination, bytes calldata _data) external pure returns (bytes32 marker);

  function getConfigValue(bytes32 _key) external view returns (bytes32);

  function getWhitelistedContracts() external view returns (address[] memory);

  function getActiveFundRules() external view returns (uint256[] memory);

  function getActiveFundRulesCount() external view returns (uint256);

  function getWhiteListedContract(
    address _contract
  )
    external
    view
    returns (
      bytes32 _contractType,
      bytes32 _abiIpfsHash,
      string memory _dataLink
    );

  function proposalMarkers(
    bytes32 _marker
  )
    external
    view
    returns (
      address _proposalManager,
      address _destination,
      bytes32 _name,
      string memory _dataLink
    );

  function areMembersValid(address[] calldata _members) external view returns (bool);

 function getActiveMultisigManagers() external view returns (address[] memory);

  function getActiveMultisigManagersCount() external view returns (uint256);

  function getActivePeriodLimits() external view returns (address[] memory);

  function getActivePeriodLimitsCount() external view returns (uint256);

  function getFeeContracts() external view returns (address[] memory);

  function getFeeContractCount() external view returns (uint256);

  function multiSigManagers(address _manager)
    external
    view
    returns (
      bool active,
      string memory managerName,
      string memory dataLink
    );

  function periodLimits(address _erc20Contract) external view returns (bool active, uint256 amount);
  function getCurrentPeriod() external view returns (uint256);
}
