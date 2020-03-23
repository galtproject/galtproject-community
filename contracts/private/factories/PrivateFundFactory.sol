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
import "../../common/FundRegistry.sol";
import "../../common/FundUpgrader.sol";
import "../../abstract/interfaces/IAbstractFundStorage.sol";

import "./PrivateFundStorageFactory.sol";
import "../../common/factories/FundBareFactory.sol";
import "../../common/registries/FundRuleRegistryV1.sol";


contract PrivateFundFactory is ChargesFee {

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
    uint256[] calldata _timeoutValues
  )
    external
    onlyOwner
  {
    uint256 len = _markersContracts.length;
    require(
      len == _markersSignatures.length && len == _supportValues.length && len == _quorumValues.length && len == _timeoutValues.length,
      "Thresholds key and value array lengths mismatch"
    );

    defaultMarkerContracts = _markersContracts;
    defaultMarkerSignatures = _markersSignatures;
    defaultSupportValues = _supportValues;
    defaultQuorumValues = _quorumValues;
    defaultTimeoutValues = _timeoutValues;

    emit SetDefaultConfigValues(len);
  }

  // USER INTERFACE

  function buildFirstStep(
    address operator,
    bool _isPrivate,
    uint256 _defaultProposalSupport,
    uint256 _defaultProposalQuorum,
    uint256 _defaultProposalTimeout,
    uint256 _periodLength,
    address[] calldata _initialMultiSigOwners,
    uint256 _initialMultiSigRequired
  )
    external
    payable
    returns (bytes32 fundId)
  {
    fundId = keccak256(abi.encode(blockhash(block.number - 1), msg.sender));

    FundContracts storage c = fundContracts[fundId];
    require(c.currentStep == Step.FIRST, "Requires first step");

    _acceptPayment();

    FundRegistry fundRegistry = FundRegistry(fundRegistryFactory.build());
    IACL fundACL = IACL(fundACLFactory.build());

    PrivateFundStorage fundStorage = fundStorageFactory.build(
      fundRegistry,
      _isPrivate,
      _defaultProposalSupport,
      _defaultProposalQuorum,
      _defaultProposalTimeout,
      _periodLength
    );

    c.creator = msg.sender;
    c.operator = operator;
    c.fundRegistry = fundRegistry;

    fundRegistry.setContract(fundRegistry.PPGR(), address(globalRegistry));
    fundRegistry.setContract(fundRegistry.ACL(), address(fundACL));
    fundRegistry.setContract(fundRegistry.STORAGE(), address(fundStorage));

    address _fundMultiSigNonPayable = fundMultiSigFactory.build(
      abi.encodeWithSignature(
        "initialize(address[],uint256,address)",
        _initialMultiSigOwners,
        _initialMultiSigRequired,
        address(fundRegistry)
      ),
      false,
      true
    );
    address payable _fundMultiSig = address(uint160(_fundMultiSigNonPayable));

    address _fundUpgrader = fundUpgraderFactory.build(address(fundRegistry), false, true);
    address _fundController = fundControllerFactory.build(address(fundRegistry), false, true);
    address _fundRA = fundRAFactory.build(address(fundRegistry), false, true);
    address _fundProposalManager = fundProposalManagerFactory.build(address(fundRegistry), false, true);
    address _fundRuleRegistry = fundRuleRegistryFactory.build(address(fundRegistry), false, true);

    fundRegistry.setContract(c.fundRegistry.MULTISIG(), _fundMultiSig);
    fundRegistry.setContract(c.fundRegistry.CONTROLLER(), _fundController);
    fundRegistry.setContract(c.fundRegistry.UPGRADER(), _fundUpgrader);
    fundRegistry.setContract(c.fundRegistry.RA(), _fundRA);
    fundRegistry.setContract(c.fundRegistry.PROPOSAL_MANAGER(), _fundProposalManager);

    _setFundProposalManagerRoles(
      fundACL,
      fundStorage,
      _fundProposalManager,
      _fundUpgrader,
      FundRuleRegistryV1(_fundRuleRegistry),
      _fundMultiSig
    );

    fundACL.setRole(fundStorage.ROLE_FINE_MEMBER_DECREMENT_MANAGER(), _fundController, true);
    fundACL.setRole(fundStorage.ROLE_DECREMENT_TOKEN_REPUTATION(), _fundRA, true);
    fundACL.setRole(fundStorage.ROLE_MULTISIG(), _fundMultiSig, true);

    fundACL.setRole(fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), address(this), true);
    fundStorage.addCommunityApp(_fundProposalManager, bytes32(""), bytes32(""), "Default");
    fundACL.setRole(fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), address(this), false);

    c.currentStep = Step.SECOND;

    emit CreateFundFirstStep(
      fundId,
      address(fundRegistry),
      address(fundACL),
      address(fundStorage),
      _fundRA,
      _fundProposalManager,
      _fundMultiSig,
      _fundController,
      _fundUpgrader,
      _fundRuleRegistry
    );
  }

  function _setFundProposalManagerRoles(
    IACL fundACL,
    PrivateFundStorage _fundStorage,
    address _fundProposalManager,
    address _fundUpgrader,
    FundRuleRegistryV1 _fundRuleRegistry,
    address payable _fundMultiSig
  )
    internal
  {
    fundACL.setRole(_fundStorage.ROLE_CONFIG_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundStorage.ROLE_NEW_MEMBER_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundStorage.ROLE_EXPEL_MEMBER_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundStorage.ROLE_FINE_MEMBER_INCREMENT_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundStorage.ROLE_FINE_MEMBER_DECREMENT_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundRuleRegistry.ROLE_ADD_FUND_RULE_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundRuleRegistry.ROLE_DEACTIVATE_FUND_RULE_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundStorage.ROLE_FEE_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundStorage.ROLE_MEMBER_DETAILS_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundStorage.ROLE_MULTI_SIG_WITHDRAWAL_LIMITS_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundStorage.ROLE_MEMBER_IDENTIFICATION_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundStorage.ROLE_PROPOSAL_THRESHOLD_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundStorage.ROLE_DEFAULT_PROPOSAL_THRESHOLD_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(_fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER(), _fundProposalManager, true);

    fundACL.setRole(FundUpgrader(_fundUpgrader).ROLE_UPGRADE_SCRIPT_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(FundUpgrader(_fundUpgrader).ROLE_IMPL_UPGRADE_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(FundMultiSig(_fundMultiSig).ROLE_OWNER_MANAGER(), _fundProposalManager, true);
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

    PrivateFundStorage _fundStorage = PrivateFundStorage(c.fundRegistry.getStorageAddress());
    IACL _fundACL = c.fundRegistry.getACL();
    address _fundProposalManager = c.fundRegistry.getProposalManagerAddress();

    _fundACL.setRole(_fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER(), address(this), true);
    _fundStorage.setNameAndDataLink(_name, _dataLink);
    _fundACL.setRole(_fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER(), address(this), false);

    uint256 len = _initialTokensToApprove.length;

    _fundACL.setRole(_fundStorage.ROLE_NEW_MEMBER_MANAGER(), address(this), true);

    _fundStorage.approveMintAll(_initialRegistriesToApprove, _initialTokensToApprove);

    _fundACL.setRole(_fundStorage.ROLE_NEW_MEMBER_MANAGER(), address(this), false);

    _fundACL.setRole(_fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER(), address(this), true);

    for (uint i = 0; i < proposalMarkersSignatures.length; i++) {
      if (bytes8(proposalMarkersNames[i]) == bytes8("storage.")) {
        _fundStorage.addProposalMarker(
          proposalMarkersSignatures[i],
          address(_fundStorage),
          _fundProposalManager,
          proposalMarkersNames[i],
          ""
        );
      }
      if (bytes8(proposalMarkersNames[i]) == bytes8("multiSig")) {
        _fundStorage.addProposalMarker(
          proposalMarkersSignatures[i],
          c.fundRegistry.getMultiSigAddress(),
          _fundProposalManager,
          proposalMarkersNames[i],
          ""
        );
      }
    }
    _fundACL.setRole(_fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER(), address(this), false);

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
      defaultTimeoutValues
    );
  }

  function _generateFundDefaultMarkers(bytes32 _fundId) internal returns (bytes32[] memory) {
    FundContracts storage c = fundContracts[_fundId];
    IAbstractFundStorage fundStorage = IAbstractFundStorage(c.fundRegistry.getStorageAddress());
    uint256 len = defaultMarkerContracts.length;
    bytes32[] memory markers = new bytes32[](len);
    bytes32 marker;

    for (uint256 i = 0; i < len; i++) {
      address current = defaultMarkerContracts[i];
      bytes32 signature = defaultMarkerSignatures[i];

      // address code for fundStorage
      if (current == address(150)) {
        marker = getThresholdMarker(address(fundStorage), signature);
      // address code for fundMultiSig
      } else if (current == address(151)) {
        marker = getThresholdMarker(c.fundRegistry.getMultiSigAddress(), signature);
      // address code for fundUpgrader
      } else if (current == address(152)) {
        marker = getThresholdMarker(c.fundRegistry.getUpgraderAddress(), signature);
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
    uint256[] calldata _timeoutValues
  )
    external
  {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.THIRD, "Requires third step");

    uint256 len = _markers.length;
    require(
      len == _supportValues.length && len == _quorumValues.length && len == _timeoutValues.length,
      "Thresholds key and value array lengths mismatch"
    );

    _applyMarkers(
      _fundId,
      _markers,
      _supportValues,
      _quorumValues,
      _timeoutValues
    );

    emit CreateFundThirdStep(_fundId, len);

    _finish(_fundId);
  }

  function _applyMarkers(
    bytes32 _fundId,
    bytes32[] memory _markers,
    uint256[] memory _supportValues,
    uint256[] memory _quorumValues,
    uint256[] memory _timeoutValues
  )
    internal
  {
    FundContracts storage c = fundContracts[_fundId];

    PrivateFundStorage _fundStorage = PrivateFundStorage(c.fundRegistry.getStorageAddress());
    IACL _fundACL = c.fundRegistry.getACL();
    uint256 len = _markers.length;

    _fundACL.setRole(_fundStorage.ROLE_PROPOSAL_THRESHOLD_MANAGER(), address(this), true);

    for (uint256 i = 0; i < len; i++) {
      _fundStorage.setProposalConfig(_markers[i], _supportValues[i], _quorumValues[i], _timeoutValues[i]);
    }

    _fundACL.setRole(_fundStorage.ROLE_PROPOSAL_THRESHOLD_MANAGER(), address(this), false);
  }

  function _finish(bytes32 _fundId) internal {
    FundContracts storage c = fundContracts[_fundId];
    address owner = c.fundRegistry.getUpgraderAddress();
    IACL _fundACL = c.fundRegistry.getACL();

    IOwnedUpgradeabilityProxy(address(c.fundRegistry)).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(address(_fundACL)).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(c.fundRegistry.getStorageAddress()).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(c.fundRegistry.getProposalManagerAddress()).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(c.fundRegistry.getRAAddress()).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(c.fundRegistry.getControllerAddress()).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(c.fundRegistry.getUpgraderAddress()).transferProxyOwnership(owner);

    c.currentStep = Step.DONE;

    c.fundRegistry.transferOwnership(owner);
    Ownable(address(_fundACL)).transferOwnership(owner);

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
