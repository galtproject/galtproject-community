/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@openzeppelin/contracts/ownership/Ownable.sol";
import "@galtproject/private-property-registry/contracts/traits/ChargesFee.sol";

import "../PrivateFundStorage.sol";
import "../../common/FundProposalManager.sol";
import "../../common/FundRegistry.sol";
import "../../common/FundUpgrader.sol";
import "../../abstract/interfaces/IAbstractFundStorage.sol";
import "../../common/interfaces/IFundMultiSig.sol";

import "./PrivateFundStorageFactory.sol";
import "../../common/factories/FundBareFactory.sol";
import "../../common/registries/FundRuleRegistryV1.sol";
import "@galtproject/core/contracts/traits/ChargesEthFee.sol";

import "./PrivateFundFactoryLib.sol";


contract PrivateFundFactory is ChargesFee {
  bytes32 public constant PROPOSAL_MANAGER_FEE = "PROPOSAL_MANAGER_FEE";
  bytes32 public constant RULE_MEETING_ADD_FEE = "RULE_MEETING_ADD_FEE";
  bytes32 public constant RULE_MEETING_EDIT_FEE = "RULE_MEETING_EDIT_FEE";

  event CreateFundFirstStep(
    bytes32 fundId,
    address fundRegistry,
    address fundACL,
    address fundStorage,
    address fundRA,
    address fundProposalManager,
    address fundMultiSig,
    address fundController,
    address fundUpgrader,
    address fundRuleRegistry
  );

  event CreateFundSecondStep(
    bytes32 fundId,
    uint256 initialTokenCount
  );

  event CreateFundThirdStep(
    bytes32 fundId,
    uint256 markerCount
  );

  event CreateFundDone(
    bytes32 fundId
  );

  event EthFeeWithdrawal(address indexed collector, uint256 amount);
  event GaltFeeWithdrawal(address indexed collector, uint256 amount);

  event SetDefaultConfigValues(uint256 len);

  event SetSubFactoryAddresses(
    FundBareFactory fundRAFactory,
    FundBareFactory fundMultiSigFactory,
    PrivateFundStorageFactory fundStorageFactory,
    FundBareFactory fundControllerFactory,
    FundBareFactory fundProposalManagerFactory,
    FundBareFactory fundRegistryFactory,
    FundBareFactory fundACLFactory,
    FundBareFactory fundUpgraderFactory,
    FundBareFactory fundRuleRegistryFactory
  );

  enum Step {
    FIRST,
    SECOND,
    THIRD,
    DONE
  }

  struct FundContracts {
    address creator;
    address operator;
    Step currentStep;
    FundRegistry fundRegistry;
    IACL fundACL;
    PrivateFundStorage fundStorage;
    FundProposalManager fundProposalManager;
  }

  bool internal initialized;

  IPPGlobalRegistry internal globalRegistry;

  FundBareFactory public fundRAFactory;
  PrivateFundStorageFactory public fundStorageFactory;
  FundBareFactory public fundMultiSigFactory;
  FundBareFactory public fundControllerFactory;
  FundBareFactory public fundProposalManagerFactory;
  FundBareFactory public fundACLFactory;
  FundBareFactory public fundRegistryFactory;
  FundBareFactory public fundUpgraderFactory;
  FundBareFactory public fundRuleRegistryFactory;

  mapping(bytes32 => address) internal managerFactories;
  mapping(bytes32 => FundContracts) public fundContracts;

  address[] internal defaultMarkerContracts;
  bytes32[] internal defaultMarkerSignatures;
  uint256[] internal defaultSupportValues;
  uint256[] internal defaultQuorumValues;
  uint256[] internal defaultTimeoutValues;
  uint256[] internal defaultCommittingTimeoutValues;

  bytes4[] internal proposalMarkersSignatures;
  bytes32[] internal proposalMarkersNames;

  constructor (
    IPPGlobalRegistry _globalRegistry,
    FundBareFactory _fundRAFactory,
    FundBareFactory _fundMultiSigFactory,
    PrivateFundStorageFactory _fundStorageFactory,
    FundBareFactory _fundControllerFactory,
    FundBareFactory _fundProposalManagerFactory,
    FundBareFactory _fundRegistryFactory,
    FundBareFactory _fundACLFactory,
    FundBareFactory _fundUpgraderFactory,
    FundBareFactory _fundRuleRegistryFactory,
    uint256 _ethFee,
    uint256 _galtFee
  )
    public
    Ownable()
    ChargesFee(_ethFee, _galtFee)
  {
    fundRuleRegistryFactory = _fundRuleRegistryFactory;
    fundControllerFactory = _fundControllerFactory;
    fundStorageFactory = _fundStorageFactory;
    fundMultiSigFactory = _fundMultiSigFactory;
    fundRAFactory = _fundRAFactory;
    fundProposalManagerFactory = _fundProposalManagerFactory;
    fundRegistryFactory = _fundRegistryFactory;
    fundACLFactory = _fundACLFactory;
    fundUpgraderFactory = _fundUpgraderFactory;
    globalRegistry = _globalRegistry;
  }

  // OWNER INTERFACE

  // All the arguments don't fit into a stack limit of constructor,
  // so there is one more method for initialization
  function initialize(bytes4[] calldata _proposalMarkersSignatures, bytes32[] calldata _proposalMarkersNames)
    external
    onlyOwner
  {
    require(initialized == false, "Already initialized");

    initialized = true;

    proposalMarkersSignatures = _proposalMarkersSignatures;
    proposalMarkersNames = _proposalMarkersNames;
  }

  function setSubFactoryAddresses (
    FundBareFactory _fundRAFactory,
    FundBareFactory _fundMultiSigFactory,
    PrivateFundStorageFactory _fundStorageFactory,
    FundBareFactory _fundControllerFactory,
    FundBareFactory _fundProposalManagerFactory,
    FundBareFactory _fundRegistryFactory,
    FundBareFactory _fundACLFactory,
    FundBareFactory _fundUpgraderFactory,
    FundBareFactory _fundRuleRegistryFactory
  )
    external
    onlyOwner
  {
    fundRuleRegistryFactory = _fundRuleRegistryFactory;
    fundControllerFactory = _fundControllerFactory;
    fundStorageFactory = _fundStorageFactory;
    fundMultiSigFactory = _fundMultiSigFactory;
    fundRAFactory = _fundRAFactory;
    fundProposalManagerFactory = _fundProposalManagerFactory;
    fundRegistryFactory = _fundRegistryFactory;
    fundACLFactory = _fundACLFactory;
    fundUpgraderFactory = _fundUpgraderFactory;

    emit SetSubFactoryAddresses(
      _fundRAFactory,
      _fundMultiSigFactory,
      _fundStorageFactory,
      _fundControllerFactory,
      _fundProposalManagerFactory,
      _fundRegistryFactory,
      _fundACLFactory,
      _fundUpgraderFactory,
      _fundRuleRegistryFactory
    );
  }

  function setDefaultConfigValues(
    address[] calldata _markersContracts,
    bytes32[] calldata _markersSignatures,
    uint256[] calldata _supportValues,
    uint256[] calldata _quorumValues,
    uint256[] calldata _timeoutValues,
    uint256[] calldata _committingTimeoutValues
  )
    external
    onlyOwner
  {
    uint256 len = _markersContracts.length;
    require(
      len == _markersSignatures.length &&
      len == _supportValues.length &&
      len == _quorumValues.length &&
      len == _timeoutValues.length &&
      len == _committingTimeoutValues.length,
      "Thresholds key and value array lengths mismatch"
    );

    defaultMarkerContracts = _markersContracts;
    defaultMarkerSignatures = _markersSignatures;
    defaultSupportValues = _supportValues;
    defaultQuorumValues = _quorumValues;
    defaultTimeoutValues = _timeoutValues;
    defaultCommittingTimeoutValues = _committingTimeoutValues;

    emit SetDefaultConfigValues(len);
  }

  // USER INTERFACE

  function buildFirstStep(
    address operator,
    bool _isPrivate,
    //  0 - uint256 _defaultProposalSupport,
    //  1 -uint256 _defaultProposalQuorum,
    //  2 - uint256 _defaultProposalTimeout,
    //  3 - uint256 _defaultProposalCommitmentTimeout,
    //  4 - uint256 _periodLength,
    //  5 - uint256 _initialMultiSigRequired
    uint256[6] calldata _uintArgs,
    address[] calldata _initialMultiSigOwners
  )
    external
    payable
    returns (bytes32 fundId)
  {
    fundId = keccak256(abi.encode(blockhash(block.number - 1), msg.sender));

    FundContracts storage c = fundContracts[fundId];
    require(c.currentStep == Step.FIRST, "Requires first step");

    _acceptPayment();

    c.fundACL = IACL(fundACLFactory.build());
    c.fundRegistry = FundRegistry(fundRegistryFactory.build());

    c.fundStorage = fundStorageFactory.build(
      c.fundRegistry,
      _isPrivate,
      // _periodLength
      _uintArgs[4]
    );

    c.creator = msg.sender;
    c.operator = operator;

    c.fundRegistry.setContract(c.fundRegistry.PPGR(), address(globalRegistry));
    c.fundRegistry.setContract(c.fundRegistry.ACL(), address(c.fundACL));
    c.fundRegistry.setContract(c.fundRegistry.STORAGE(), address(c.fundStorage));

    address _fundMultiSig = address(
      uint160(
        fundMultiSigFactory.build(
          abi.encodeWithSignature(
            "initialize(address[],uint256,address)",
            _initialMultiSigOwners,
            // _initialMultiSigRequired,
            _uintArgs[5],
            address(c.fundRegistry)
          ),
          2
        )
      )
    );

    c.fundACL.setRole(c.fundStorage.ROLE_MEMBER_DETAILS_MANAGER(), address(this), true);
    for (uint256 i = 0; i < _initialMultiSigOwners.length; i++) {
      c.fundStorage.setMultiSigManager(true, _initialMultiSigOwners[i], "", "");
    }
    c.fundACL.setRole(c.fundStorage.ROLE_MEMBER_DETAILS_MANAGER(), address(this), false);

    address _fundUpgrader = fundUpgraderFactory.build(address(c.fundRegistry), 2);
    address _fundController = fundControllerFactory.build(address(c.fundRegistry), 2);
    address _fundRA = fundRAFactory.build(address(c.fundRegistry), 2);
    c.fundProposalManager = FundProposalManager(
      fundProposalManagerFactory.build(address(c.fundRegistry), 2)
    );
    address _fundRuleRegistry = fundRuleRegistryFactory.build(address(c.fundRegistry), 2);

    c.fundACL.setRole(c.fundProposalManager.ROLE_DEFAULT_PROPOSAL_THRESHOLD_MANAGER(), address(this), true);
    c.fundProposalManager.setDefaultProposalConfig(
      _uintArgs[0],
      _uintArgs[1],
      _uintArgs[2],
      _uintArgs[3]
    );
    c.fundACL.setRole(c.fundProposalManager.ROLE_DEFAULT_PROPOSAL_THRESHOLD_MANAGER(), address(this), false);

    c.fundRegistry.setContract(c.fundRegistry.MULTISIG(), _fundMultiSig);
    c.fundRegistry.setContract(c.fundRegistry.CONTROLLER(), _fundController);
    c.fundRegistry.setContract(c.fundRegistry.UPGRADER(), _fundUpgrader);
    c.fundRegistry.setContract(c.fundRegistry.RA(), _fundRA);
    c.fundRegistry.setContract(c.fundRegistry.PROPOSAL_MANAGER(), address(c.fundProposalManager));
    c.fundRegistry.setContract(c.fundRegistry.RULE_REGISTRY(), _fundRuleRegistry);

    _setFundProposalManagerRoles(
      c,
      _fundUpgrader,
      FundRuleRegistryV1(_fundRuleRegistry),
      _fundMultiSig
    );

    c.fundACL.setRole(c.fundStorage.ROLE_FINE_MEMBER_DECREMENT_MANAGER(), _fundController, true);
    c.fundACL.setRole(c.fundStorage.ROLE_DECREMENT_TOKEN_REPUTATION(), _fundRA, true);
    c.fundACL.setRole(c.fundStorage.ROLE_MULTISIG(), _fundMultiSig, true);

    c.fundACL.setRole(c.fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), address(this), true);
    c.fundStorage.addCommunityApp(address(c.fundProposalManager), bytes32(""), bytes32(""), "Default");
    c.fundACL.setRole(c.fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), address(this), false);

    c.currentStep = Step.SECOND;

    emit CreateFundFirstStep(
      fundId,
      address(c.fundRegistry),
      address(c.fundACL),
      address(c.fundStorage),
      _fundRA,
      address(c.fundProposalManager),
      _fundMultiSig,
      _fundController,
      _fundUpgrader,
      _fundRuleRegistry
    );
  }

  function _setFundProposalManagerRoles(
    FundContracts storage _c,
    address _fundUpgrader,
    FundRuleRegistryV1 _fundRuleRegistry,
    address _fundMultiSig
  )
    internal
  {
    PrivateFundFactoryLib.setFundRoles(
      _c.fundACL,
      _c.fundStorage,
      address(_c.fundProposalManager),
      _fundUpgrader,
      FundRuleRegistryV1(_fundRuleRegistry),
      _fundMultiSig
    );
  }

  function buildSecondStep(
    bytes32 _fundId,
    bool _finishFlag,
    string calldata _name,
    string calldata _dataLink,
    address[] calldata _initialRegistriesToApprove,
    uint256[] calldata _initialTokensToApprove
  )
    external
  {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.SECOND, "Requires second step");

    address _fundProposalManager = c.fundRegistry.getProposalManagerAddress();

    c.fundACL.setRole(c.fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER(), address(this), true);
    c.fundStorage.setNameAndDataLink(_name, _dataLink);
    c.fundACL.setRole(c.fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER(), address(this), false);

    uint256 len = _initialTokensToApprove.length;

    c.fundACL.setRole(c.fundStorage.ROLE_NEW_MEMBER_MANAGER(), address(this), true);

    c.fundStorage.approveMintAll(_initialRegistriesToApprove, _initialTokensToApprove);

    c.fundACL.setRole(c.fundStorage.ROLE_NEW_MEMBER_MANAGER(), address(this), false);

    c.fundACL.setRole(c.fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER(), address(this), true);

    for (uint i = 0; i < proposalMarkersSignatures.length; i++) {
      if (bytes8(proposalMarkersNames[i]) == bytes8("storage.")) {
        c.fundStorage.addProposalMarker(
          proposalMarkersSignatures[i],
          address(c.fundStorage),
          _fundProposalManager,
          proposalMarkersNames[i],
          ""
        );
      }
      if (bytes8(proposalMarkersNames[i]) == bytes8("voting.s")) {
        c.fundStorage.addProposalMarker(
          proposalMarkersSignatures[i],
          _fundProposalManager,
          _fundProposalManager,
          proposalMarkersNames[i],
          ""
        );
      }
      if (bytes8(proposalMarkersNames[i]) == bytes8("multiSig")) {
        c.fundStorage.addProposalMarker(
          proposalMarkersSignatures[i],
          c.fundRegistry.getMultiSigAddress(),
          _fundProposalManager,
          proposalMarkersNames[i],
          ""
        );
      }
      if (bytes8(proposalMarkersNames[i]) == bytes8("ruleRegi")) {
        c.fundStorage.addProposalMarker(
          proposalMarkersSignatures[i],
          c.fundRegistry.getRuleRegistryAddress(),
          _fundProposalManager,
          proposalMarkersNames[i],
          ""
        );
      }
    }
    c.fundACL.setRole(c.fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER(), address(this), false);

    if (_finishFlag == true) {
      _applyFundDefaultConfigValues(_fundId);
      _finish(_fundId);
    } else {
      c.currentStep = Step.THIRD;
      emit CreateFundSecondStep(_fundId, len);
    }
  }

  function _applyFundDefaultConfigValues(bytes32 _fundId) internal {
    _applyMarkers(
      _fundId,
      _generateFundDefaultMarkers(_fundId),
      defaultSupportValues,
      defaultQuorumValues,
      defaultTimeoutValues,
      defaultCommittingTimeoutValues
    );
  }

  function _generateFundDefaultMarkers(bytes32 _fundId) internal returns (bytes32[] memory) {
    FundContracts storage c = fundContracts[_fundId];
    uint256 len = defaultMarkerContracts.length;
    bytes32[] memory markers = new bytes32[](len);
    bytes32 marker;

    for (uint256 i = 0; i < len; i++) {
      address current = defaultMarkerContracts[i];
      bytes32 signature = defaultMarkerSignatures[i];

      // address code for fundStorage
      if (current == address(150)) {
        marker = getThresholdMarker(address(c.fundStorage), signature);
      // address code for fundMultiSig
      } else if (current == address(151)) {
        marker = getThresholdMarker(c.fundRegistry.getMultiSigAddress(), signature);
      // address code for fundUpgrader
      } else if (current == address(152)) {
        marker = getThresholdMarker(c.fundRegistry.getUpgraderAddress(), signature);
      // address code for fundRuleRegistry
      } else if (current == address(153)) {
        marker = getThresholdMarker(c.fundRegistry.getRuleRegistryAddress(), signature);
      } else {
        marker = getThresholdMarker(current, signature);
      }
      markers[i] = marker;
    }

    return markers;
  }

  function buildThirdStep(
    bytes32 _fundId,
    bytes32[] calldata _markers,
    uint256[] calldata _supportValues,
    uint256[] calldata _quorumValues,
    uint256[] calldata _timeoutValues,
    uint256[] calldata _committingTimeoutValues
  )
    external
  {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.THIRD, "Requires third step");

    uint256 len = _markers.length;
    require(
      len == _supportValues.length && len == _quorumValues.length && len == _timeoutValues.length && len == _committingTimeoutValues.length,
      "Thresholds key and value array lengths mismatch"
    );

    _applyMarkers(
      _fundId,
      _markers,
      _supportValues,
      _quorumValues,
      _timeoutValues,
      _committingTimeoutValues
    );

    emit CreateFundThirdStep(_fundId, len);

    _finish(_fundId);
  }

  function _applyMarkers(
    bytes32 _fundId,
    bytes32[] memory _markers,
    uint256[] memory _supportValues,
    uint256[] memory _quorumValues,
    uint256[] memory _timeoutValues,
    uint256[] memory _commitmentTimeoutValues
  )
    internal
  {
    FundContracts storage c = fundContracts[_fundId];

    FundProposalManager _fundProposalManager = FundProposalManager(c.fundRegistry.getProposalManagerAddress());
    uint256 len = _markers.length;

    c.fundACL.setRole(_fundProposalManager.ROLE_PROPOSAL_THRESHOLD_MANAGER(), address(this), true);

    for (uint256 i = 0; i < len; i++) {
      _fundProposalManager.setProposalConfig(_markers[i], _supportValues[i], _quorumValues[i], _timeoutValues[i], _commitmentTimeoutValues[i]);
    }

    c.fundACL.setRole(_fundProposalManager.ROLE_PROPOSAL_THRESHOLD_MANAGER(), address(this), false);
  }

  function _finish(bytes32 _fundId) internal {
    FundContracts storage c = fundContracts[_fundId];
    address owner = c.fundRegistry.getUpgraderAddress();

    IOwnedUpgradeabilityProxy(address(c.fundRegistry)).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(address(c.fundACL)).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(c.fundRegistry.getStorageAddress()).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(c.fundRegistry.getProposalManagerAddress()).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(c.fundRegistry.getRAAddress()).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(c.fundRegistry.getControllerAddress()).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(c.fundRegistry.getUpgraderAddress()).transferProxyOwnership(owner);

    c.currentStep = Step.DONE;

    c.fundRegistry.transferOwnership(owner);
    Ownable(address(c.fundACL)).transferOwnership(owner);

    emit CreateFundDone(_fundId);
  }

  // INTERNAL

  function _galtToken() internal view returns (IERC20) {
    return IERC20(globalRegistry.getGaltTokenAddress());
  }

  function getThresholdMarker(address _destination, bytes32 _data) public pure returns(bytes32 marker) {
    bytes32 methodName;

    assembly {
      methodName := and(_data, 0xffffffff00000000000000000000000000000000000000000000000000000000)
    }

    return keccak256(abi.encode(_destination, methodName));
  }

  // GETTERS

  function getCurrentStep(bytes32 _fundId) external view returns (Step) {
    return fundContracts[_fundId].currentStep;
  }

  function getDefaultMarkerContracts() external view returns (address[] memory) {
    return defaultMarkerContracts;
  }

  function getDefaultMarkerSignatures() external view returns (bytes32[] memory) {
    return defaultMarkerSignatures;
  }

  function getDefaultSupportValues() external view returns (uint256[] memory) {
    return defaultSupportValues;
  }

  function getDefaultQuorumValues() external view returns (uint256[] memory) {
    return defaultQuorumValues;
  }

  function getDefaultTimeoutValues() external view returns (uint256[] memory) {
    return defaultTimeoutValues;
  }
}
