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
import "@galtproject/libs/contracts/proxy/unstructured-storage/interfaces/IOwnedUpgradeabilityProxyFactory.sol";

import "../PrivateFundStorage.sol";
import "../PrivateFundController.sol";
import "../../common/FundRegistry.sol";
import "../../common/FundACL.sol";
import "../../common/FundProposalManager.sol";

import "./PrivateFundRAFactory.sol";
import "./PrivateFundStorageFactory.sol";
import "./PrivateFundControllerFactory.sol";
import "../../common/factories/FundMultiSigFactory.sol";
import "../../common/factories/FundProposalManagerFactory.sol";
import "../../common/factories/FundACLFactory.sol";
import "../../common/factories/FundRegistryFactory.sol";
import "../../common/factories/FundUpgraderFactory.sol";


contract PrivateFundFactory is Ownable, ChargesFee {

  event CreateFundFirstStep(
    bytes32 fundId,
    address fundRegistry,
    address fundACL,
    address fundStorage
  );

  event CreateFundSecondStep(
    bytes32 fundId,
    address fundMultiSig,
    address fundController,
    address fundUpgrader
  );

  event CreateFundThirdStep(
    bytes32 fundId,
    address fundRA,
    address fundProposalManager
  );

  event CreateFundFourthStep(
    bytes32 fundId,
    uint256 thresholdCount
  );

  event CreateFundFourthStepDone(
    bytes32 fundId
  );

  event CreateFundFifthStep(
    bytes32 fundId,
    uint256 initialTokenCount
  );

  event EthFeeWithdrawal(address indexed collector, uint256 amount);
  event GaltFeeWithdrawal(address indexed collector, uint256 amount);

  enum Step {
    FIRST,
    SECOND,
    THIRD,
    FOURTH,
    FIFTH,
    DONE
  }

  struct FundContracts {
    address creator;
    address operator;
    Step currentStep;
    FundRegistry fundRegistry;
    FundACL fundACL;
    PrivateFundRA fundRA;
    FundMultiSig fundMultiSig;
    PrivateFundStorage fundStorage;
    PrivateFundController fundController;
    FundProposalManager fundProposalManager;
    FundUpgrader fundUpgrader;
  }

  bool internal initialized;

  IPPGlobalRegistry internal globalRegistry;

  PrivateFundRAFactory internal fundRAFactory;
  PrivateFundStorageFactory internal fundStorageFactory;
  FundMultiSigFactory internal fundMultiSigFactory;
  PrivateFundControllerFactory internal fundControllerFactory;
  FundProposalManagerFactory internal fundProposalManagerFactory;
  FundACLFactory internal fundACLFactory;
  FundRegistryFactory internal fundRegistryFactory;
  FundUpgraderFactory internal fundUpgraderFactory;

  mapping(bytes32 => address) internal managerFactories;
  mapping(bytes32 => FundContracts) public fundContracts;

  bytes4[] internal proposalMarkersSignatures;
  bytes32[] internal proposalMarkersNames;

  constructor (
    IPPGlobalRegistry _globalRegistry,
    PrivateFundRAFactory _fundRAFactory,
    FundMultiSigFactory _fundMultiSigFactory,
    PrivateFundStorageFactory _fundStorageFactory,
    PrivateFundControllerFactory _fundControllerFactory,
    FundProposalManagerFactory _fundProposalManagerFactory,
    FundRegistryFactory _fundRegistryFactory,
    FundACLFactory _fundACLFactory,
    FundUpgraderFactory _fundUpgraderFactory,
    address _galtToken,
    uint256 _ethFee,
    uint256 _galtFee
  )
    public
    Ownable()
    ChargesFee(_galtToken, _ethFee, _galtFee)
  {
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

  function buildFirstStep(
    address operator,
    bool _isPrivate,
    uint256 _defaultProposalSupport,
    uint256 _defaultProposalQuorum,
    uint256 _defaultProposalTimeout,
    uint256 _periodLength
  )
    external
    payable
    returns (bytes32 fundId)
  {
    fundId = keccak256(abi.encode(blockhash(block.number - 1), msg.sender));

    FundContracts storage c = fundContracts[fundId];
    require(c.currentStep == Step.FIRST, "Requires first step");

    _acceptPayment();

    FundRegistry fundRegistry = fundRegistryFactory.build();
    FundACL fundACL = fundACLFactory.build();

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
    c.fundStorage = fundStorage;
    c.fundRegistry = fundRegistry;
    c.fundACL = fundACL;

    fundRegistry.setContract(fundRegistry.PPGR(), address(globalRegistry));
    fundRegistry.setContract(fundRegistry.ACL(), address(fundACL));
    fundRegistry.setContract(fundRegistry.STORAGE(), address(fundStorage));

    c.currentStep = Step.SECOND;

    emit CreateFundFirstStep(fundId, address(fundRegistry), address(fundACL), address(fundStorage));

    return fundId;
  }

  function buildSecondStep(bytes32 _fundId, address[] calldata _initialMultiSigOwners, uint256 _initialMultiSigRequired) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.SECOND, "Requires second step");

    FundRegistry _fundRegistry = c.fundRegistry;

    FundMultiSig _fundMultiSig = fundMultiSigFactory.build(
      _initialMultiSigOwners,
      _initialMultiSigRequired,
      _fundRegistry
    );
    FundUpgrader _fundUpgrader = fundUpgraderFactory.build(_fundRegistry);

    c.fundMultiSig = _fundMultiSig;
    c.fundController = fundControllerFactory.build(_fundRegistry);
    c.fundUpgrader = _fundUpgrader;

    c.fundRegistry.setContract(c.fundRegistry.MULTISIG(), address(_fundMultiSig));
    c.fundRegistry.setContract(c.fundRegistry.CONTROLLER(), address(c.fundController));
    c.fundRegistry.setContract(c.fundRegistry.UPGRADER(), address(_fundUpgrader));

    c.currentStep = Step.THIRD;

    emit CreateFundSecondStep(
      _fundId,
      address(_fundMultiSig),
      address(c.fundController),
      address(_fundUpgrader)
    );
  }

  function buildThirdStep(bytes32 _fundId) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.THIRD, "Requires third step");

    PrivateFundStorage _fundStorage = c.fundStorage;
    FundRegistry _fundRegistry = c.fundRegistry;
    FundACL _fundACL = c.fundACL;

    c.fundRA = fundRAFactory.build(_fundRegistry);
    c.fundProposalManager = fundProposalManagerFactory.build(_fundRegistry);

    c.fundRegistry.setContract(c.fundRegistry.RA(), address(c.fundRA));
    c.fundRegistry.setContract(c.fundRegistry.PROPOSAL_MANAGER(), address(c.fundProposalManager));

    address _fundProposalManager = address(c.fundProposalManager);

    _fundACL.setRole(_fundStorage.ROLE_CONFIG_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_NEW_MEMBER_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_EXPEL_MEMBER_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_FINE_MEMBER_INCREMENT_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_FINE_MEMBER_DECREMENT_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_ADD_FUND_RULE_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_DEACTIVATE_FUND_RULE_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_FEE_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_MEMBER_DETAILS_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_MULTI_SIG_WITHDRAWAL_LIMITS_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_MEMBER_IDENTIFICATION_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_PROPOSAL_THRESHOLD_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_DEFAULT_PROPOSAL_THRESHOLD_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_FINE_MEMBER_DECREMENT_MANAGER(), address(c.fundController), true);
    _fundACL.setRole(_fundStorage.ROLE_DECREMENT_TOKEN_REPUTATION(), address(c.fundRA), true);
    _fundACL.setRole(_fundStorage.ROLE_MULTISIG(), address(c.fundMultiSig), true);
    _fundACL.setRole(c.fundUpgrader.ROLE_UPGRADE_SCRIPT_MANAGER(), address(c.fundProposalManager), true);
    _fundACL.setRole(c.fundMultiSig.ROLE_OWNER_MANAGER(), _fundProposalManager, true);

    _fundACL.setRole(_fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), address(this), true);
    _fundStorage.addCommunityApp(_fundProposalManager, bytes32(""), bytes32(""), "Default");
    _fundACL.setRole(_fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), address(this), false);

    c.currentStep = Step.FOURTH;

    emit CreateFundThirdStep(
      _fundId,
      address(c.fundRA),
      _fundProposalManager
    );
  }

  function buildFourthStep(
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
    require(c.currentStep == Step.FOURTH, "Requires fourth step");

    uint256 len = _markers.length;
    require(
      len == _supportValues.length && len == _quorumValues.length && len == _timeoutValues.length,
      "Thresholds key and value array lengths mismatch"
    );

    PrivateFundStorage _fundStorage = c.fundStorage;

    c.fundACL.setRole(_fundStorage.ROLE_PROPOSAL_THRESHOLD_MANAGER(), address(this), true);

    for (uint256 i = 0; i < len; i++) {
      _fundStorage.setProposalConfig(_markers[i], _supportValues[i], _quorumValues[i], _timeoutValues[i]);
    }

    c.fundACL.setRole(_fundStorage.ROLE_PROPOSAL_THRESHOLD_MANAGER(), address(this), false);

    emit CreateFundFourthStep(_fundId, len);
  }

  function buildFourthStepDone(bytes32 _fundId, string calldata _name, string calldata _dataLink) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.FOURTH, "Requires fourth step");

    PrivateFundStorage _fundStorage = c.fundStorage;

    c.fundACL.setRole(_fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER(), address(this), true);
    _fundStorage.setNameAndDataLink(_name, _dataLink);
    c.fundACL.setRole(_fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER(), address(this), false);

    c.currentStep = Step.FIFTH;

    emit CreateFundFourthStepDone(_fundId);
  }

  function buildFifthStep(
    bytes32 _fundId,
    address[] calldata _initialRegistriesToApprove,
    uint256[] calldata _initialTokensToApprove
  )
    external
  {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.FIFTH, "Requires fifth step");

    PrivateFundStorage _fundStorage = c.fundStorage;
    uint256 len = _initialTokensToApprove.length;

    c.fundACL.setRole(_fundStorage.ROLE_NEW_MEMBER_MANAGER(), address(this), true);

    for (uint i = 0; i < len; i++) {
      _fundStorage.approveMint(_initialRegistriesToApprove[i], _initialTokensToApprove[i]);
    }

    c.fundACL.setRole(_fundStorage.ROLE_NEW_MEMBER_MANAGER(), address(this), false);

    c.fundACL.setRole(_fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER(), address(this), true);
    for (uint i = 0; i < proposalMarkersSignatures.length; i++) {
      if (bytes8(proposalMarkersNames[i]) == bytes8("storage.")) {
        _fundStorage.addProposalMarker(proposalMarkersSignatures[i], address(_fundStorage), address(c.fundProposalManager), proposalMarkersNames[i], "");
      }
      if (bytes8(proposalMarkersNames[i]) == bytes8("multiSig")) {
        _fundStorage.addProposalMarker(proposalMarkersSignatures[i], address(c.fundMultiSig), address(c.fundProposalManager), proposalMarkersNames[i], "");
      }
    }
    c.fundACL.setRole(_fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER(), address(this), true);

    c.currentStep = Step.DONE;
    address owner = address(c.fundUpgrader);

    IOwnedUpgradeabilityProxy(address(c.fundRegistry)).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(address(c.fundACL)).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(address(c.fundStorage)).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(address(c.fundProposalManager)).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(address(c.fundRA)).transferProxyOwnership(owner);

    c.fundRegistry.transferOwnership(owner);
    c.fundACL.transferOwnership(owner);

    emit CreateFundFifthStep(_fundId, len);
  }

  function getCurrentStep(bytes32 _fundId) external view returns (Step) {
    return fundContracts[_fundId].currentStep;
  }
}
