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
import "@galtproject/core/contracts/registries/GaltGlobalRegistry.sol";
import "@galtproject/libs/contracts/proxy/unstructured-storage/interfaces/IOwnedUpgradeabilityProxyFactory.sol";

import "../FundStorage.sol";
import "../FundController.sol";
import "../../common/FundRegistry.sol";
import "../../common/FundACL.sol";
import "../../common/FundProposalManager.sol";
import "../FundRA.sol";
import "../../common/FundUpgrader.sol";

import "./FundStorageFactory.sol";
import "../../common/factories/FundBareFactory.sol";
import "../../common/registries/FundRuleRegistryV1.sol";
import "../../abstract/fees/ChargesEthFee.sol";


contract FundFactory is Ownable {
  bytes32 public constant ROLE_FEE_COLLECTOR = bytes32("FEE_COLLECTOR");
  bytes32 public constant PROPOSAL_MANAGER_FEE = "PROPOSAL_MANAGER_FEE";

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
    address fundUpgrader,
    address fundRuleRegistry
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
    IACL fundACL;
    FundRA fundRA;
    FundMultiSig fundMultiSig;
    FundStorage fundStorage;
    FundController fundController;
    FundProposalManager fundProposalManager;
    FundUpgrader fundUpgrader;
    FundRuleRegistryV1 fundRuleRegistry;
  }

  bool internal initialized;

  uint256 public ethFee;
  uint256 public galtFee;
  address internal collector;

  GaltGlobalRegistry internal ggr;

  FundBareFactory internal fundRAFactory;
  FundStorageFactory internal fundStorageFactory;
  FundBareFactory internal fundMultiSigFactory;
  FundBareFactory internal fundControllerFactory;
  FundBareFactory internal fundProposalManagerFactory;
  FundBareFactory internal fundACLFactory;
  FundBareFactory public fundRegistryFactory;
  FundBareFactory public fundUpgraderFactory;
  FundBareFactory public fundRuleRegistryFactory;

  mapping(bytes32 => uint256) internal fundEthFees;
  mapping(bytes32 => FundContracts) public fundContracts;

  bytes4[] internal proposalMarkersSignatures;
  bytes32[] internal proposalMarkersNames;

  modifier onlyFeeCollector() {
    require(
      ggr.getACL().hasRole(msg.sender, ROLE_FEE_COLLECTOR),
      "Only FEE_COLLECTOR role allowed"
    );
    _;
  }

  constructor (
    GaltGlobalRegistry _ggr,
    FundBareFactory _fundRAFactory,
    FundBareFactory _fundMultiSigFactory,
    FundStorageFactory _fundStorageFactory,
    FundBareFactory _fundControllerFactory,
    FundBareFactory _fundProposalManagerFactory,
    FundBareFactory _fundRegistryFactory,
    FundBareFactory _fundACLFactory,
    FundBareFactory _fundUpgraderFactory,
    FundBareFactory _fundRuleRegistryFactory
  ) public {
    fundRuleRegistryFactory = _fundRuleRegistryFactory;
    fundControllerFactory = _fundControllerFactory;
    fundStorageFactory = _fundStorageFactory;
    fundMultiSigFactory = _fundMultiSigFactory;
    fundRAFactory = _fundRAFactory;
    fundProposalManagerFactory = _fundProposalManagerFactory;
    fundRegistryFactory = _fundRegistryFactory;
    fundACLFactory = _fundACLFactory;
    fundUpgraderFactory = _fundUpgraderFactory;

    ggr = _ggr;

    galtFee = 10 ether;
    ethFee = 5 ether;
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

  function _acceptPayment() internal {
    if (msg.value == 0) {
      ggr.getGaltToken().transferFrom(msg.sender, address(this), galtFee);
    } else {
      require(msg.value == ethFee, "Fee and msg.value not equal");
    }
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

    FundRegistry fundRegistry = FundRegistry(fundRegistryFactory.build());
    FundACL fundACL = FundACL(fundACLFactory.build());

    FundStorage fundStorage = fundStorageFactory.build(
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

    fundRegistry.setContract(fundRegistry.GGR(), address(ggr));
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

    FundRegistry fundRegistry = c.fundRegistry;

    address _fundMultiSigNonPayable = fundMultiSigFactory.build(
      abi.encodeWithSignature(
        "initialize(address[],uint256,address)",
        _initialMultiSigOwners,
        _initialMultiSigRequired,
        address(fundRegistry)
      ),
      2
    );
    address payable _fundMultiSig = address(uint160(_fundMultiSigNonPayable));

    address _fundUpgrader = fundUpgraderFactory.build(address(fundRegistry), 2);
    address _fundController = fundControllerFactory.build(address(fundRegistry), 2);
    address _fundRuleRegistry = fundRuleRegistryFactory.build(address(fundRegistry), 2);

    fundRegistry.setContract(c.fundRegistry.MULTISIG(), _fundMultiSig);
    fundRegistry.setContract(c.fundRegistry.CONTROLLER(), _fundController);
    fundRegistry.setContract(c.fundRegistry.UPGRADER(), _fundUpgrader);
    fundRegistry.setContract(c.fundRegistry.RULE_REGISTRY(), _fundRuleRegistry);

    c.currentStep = Step.THIRD;
    c.fundMultiSig = FundMultiSig(_fundMultiSig);
    c.fundUpgrader = FundUpgrader(_fundUpgrader);
    c.fundController = FundController(_fundController);
    c.fundRuleRegistry = FundRuleRegistryV1(_fundRuleRegistry);

    emit CreateFundSecondStep(
      _fundId,
      _fundMultiSig,
      _fundController,
      _fundUpgrader,
      _fundRuleRegistry
    );
  }

  function buildThirdStep(bytes32 _fundId) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.THIRD, "Requires third step");

    FundStorage _fundStorage = c.fundStorage;
    FundRegistry fundRegistry = c.fundRegistry;
    FundRuleRegistryV1 _fundRuleRegistry = c.fundRuleRegistry;
    IACL _fundACL = c.fundACL;

    address _fundRA = fundRAFactory.build("initialize2(address)", address(fundRegistry), 2);
    address _fundProposalManager = fundProposalManagerFactory.build(address(fundRegistry), 2 | 4);

    ChargesEthFee(_fundProposalManager).setEthFee(fundEthFees[PROPOSAL_MANAGER_FEE]);
    ChargesEthFee(_fundProposalManager).setFeeCollector(owner());
    ChargesEthFee(_fundProposalManager).setFeeManager(owner());

    fundRegistry.setContract(c.fundRegistry.RA(), _fundRA);
    fundRegistry.setContract(c.fundRegistry.PROPOSAL_MANAGER(), _fundProposalManager);

    _fundACL.setRole(_fundStorage.ROLE_CONFIG_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_NEW_MEMBER_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_EXPEL_MEMBER_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_FINE_MEMBER_INCREMENT_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_FINE_MEMBER_DECREMENT_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundRuleRegistry.ROLE_ADD_FUND_RULE_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundRuleRegistry.ROLE_DEACTIVATE_FUND_RULE_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_FEE_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_MEMBER_DETAILS_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_MULTI_SIG_WITHDRAWAL_LIMITS_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_MEMBER_IDENTIFICATION_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_PROPOSAL_THRESHOLD_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_DEFAULT_PROPOSAL_THRESHOLD_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(_fundStorage.ROLE_FINE_MEMBER_DECREMENT_MANAGER(), address(c.fundController), true);
    _fundACL.setRole(_fundStorage.ROLE_DECREMENT_TOKEN_REPUTATION(), _fundRA, true);
    _fundACL.setRole(_fundStorage.ROLE_MULTISIG(), address(c.fundMultiSig), true);
    _fundACL.setRole(c.fundUpgrader.ROLE_UPGRADE_SCRIPT_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(c.fundUpgrader.ROLE_IMPL_UPGRADE_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(c.fundMultiSig.ROLE_OWNER_MANAGER(), _fundProposalManager, true);

    _fundACL.setRole(_fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), address(this), true);
    _fundStorage.addCommunityApp(_fundProposalManager, bytes32(""), bytes32(""), "Default");
    _fundACL.setRole(_fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), address(this), false);

    c.currentStep = Step.FOURTH;
    c.fundRA = FundRA(_fundRA);
    c.fundProposalManager = FundProposalManager(_fundProposalManager);

    emit CreateFundThirdStep(
      _fundId,
      _fundRA,
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

    FundStorage _fundStorage = c.fundStorage;

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

    FundStorage _fundStorage = c.fundStorage;

    c.fundACL.setRole(_fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER(), address(this), true);
    _fundStorage.setNameAndDataLink(_name, _dataLink);
    c.fundACL.setRole(_fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER(), address(this), false);

    c.currentStep = Step.FIFTH;

    emit CreateFundFourthStepDone(_fundId);
  }

  function buildFifthStep(bytes32 _fundId, uint256[] calldata _initialSpaceTokensToApprove) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.FIFTH, "Requires fifth step");

    FundStorage _fundStorage = c.fundStorage;
    uint256 len = _initialSpaceTokensToApprove.length;

    c.fundACL.setRole(_fundStorage.ROLE_NEW_MEMBER_MANAGER(), address(this), true);

    for (uint i = 0; i < len; i++) {
      _fundStorage.approveMint(_initialSpaceTokensToApprove[i]);
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
      if (bytes8(proposalMarkersNames[i]) == bytes8("ruleRegi")) {
        _fundStorage.addProposalMarker(proposalMarkersSignatures[i], address(c.fundRuleRegistry), address(c.fundProposalManager), proposalMarkersNames[i], "");
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
    IOwnedUpgradeabilityProxy(address(c.fundController)).transferProxyOwnership(owner);
    IOwnedUpgradeabilityProxy(address(c.fundUpgrader)).transferProxyOwnership(owner);

    c.fundRegistry.transferOwnership(owner);
    Ownable(address(c.fundACL)).transferOwnership(owner);

    emit CreateFundFifthStep(_fundId, len);
  }

  function setFundEthFees(bytes32[] calldata _feeNames, uint256[] calldata _feeValues) external onlyOwner {
    uint256 len = _feeNames.length;
    require(len == _feeValues.length, "Fee key and value array lengths mismatch");

    for (uint256 i = 0; i < _feeNames.length; i++) {
      fundEthFees[_feeNames[i]] = _feeValues[_feeValues[i]];
    }
  }

  function setEthFee(uint256 _ethFee) external onlyOwner {
    ethFee = _ethFee;
  }

  function setGaltFee(uint256 _galtFee) external onlyOwner {
    galtFee = _galtFee;
  }

  function setCollectorAddress(address _collector) external onlyOwner {
    collector = _collector;
  }

  function getCurrentStep(bytes32 _fundId) external view returns (Step) {
    return fundContracts[_fundId].currentStep;
  }

  function withdrawEthFees() external onlyFeeCollector {
    uint256 balance = address(this).balance;

    msg.sender.transfer(balance);

    emit EthFeeWithdrawal(msg.sender, balance);
  }

  function withdrawGaltFees() external onlyFeeCollector {
    IERC20 galtToken = ggr.getGaltToken();
    uint256 balance = galtToken.balanceOf(address(this));

    galtToken.transfer(msg.sender, balance);

    emit GaltFeeWithdrawal(msg.sender, balance);
  }
}
