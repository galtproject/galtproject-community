/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "../../common/interfaces/IFundRA.sol";
import "../../common/FundMultiSig.sol";


interface IAbstractFundStorage {
  function setConfigValue(bytes32 _key, bytes32 _value) external;

  function addCommunityApp(
    address _contract,
    bytes32 _type,
    bytes32 _abiIpfsHash,
    string calldata _dataLink
  )
    external;
  function removeCommunityApp(address _contract) external;

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

  function addFeeContract(address _feeContract) external;

  function removeFeeContract(address _feeContract) external;

  function setMemberIdentification(address _member, bytes32 _identificationHash) external;

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
  function membersIdentification(address _member) external view returns(bytes32);

  function config(bytes32 _key) external view returns (bytes32);

  function getCommunityApps() external view returns (address[] memory);

  function communityAppsInfo(
    address _contract
  )
    external
    view
    returns (
      bytes32 appType,
      bytes32 abiIpfsHash,
      string memory dataLink
    );

  function proposalMarkers(
    bytes32 _marker
  )
    external
    view
    returns (
      address proposalManager,
      address destination,
      bytes32 name,
      string memory dataLink
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
