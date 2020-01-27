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

import "./PrivateFundStorageFactory.sol";
import "../../common/factories/FundMultiSigFactory.sol";
import "../../common/factories/FundBareFactory.sol";


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
    address fundUpgrader
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

  FundBareFactory internal fundRAFactory;
  PrivateFundStorageFactory internal fundStorageFactory;
  FundMultiSigFactory internal fundMultiSigFactory;
  FundBareFactory internal fundControllerFactory;
  FundBareFactory internal fundProposalManagerFactory;
  FundBareFactory internal fundACLFactory;
  FundBareFactory internal fundRegistryFactory;
  FundBareFactory internal fundUpgraderFactory;

  mapping(bytes32 => address) internal managerFactories;
  mapping(bytes32 => FundContracts) public fundContracts;

  bytes4[] internal proposalMarkersSignatures;
  bytes32[] internal proposalMarkersNames;

  constructor (
    IPPGlobalRegistry _globalRegistry,
    FundBareFactory _fundRAFactory,
    FundMultiSigFactory _fundMultiSigFactory,
    PrivateFundStorageFactory _fundStorageFactory,
    FundBareFactory _fundControllerFactory,
    FundBareFactory _fundProposalManagerFactory,
    FundBareFactory _fundRegistryFactory,
    FundBareFactory _fundACLFactory,
    FundBareFactory _fundUpgraderFactory,
    uint256 _ethFee,
    uint256 _galtFee
  )
    public
    Ownable()
    ChargesFee(_ethFee, _galtFee)
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
    address fundACL = fundACLFactory.build();

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
    fundRegistry.setContract(fundRegistry.ACL(), fundACL);
    fundRegistry.setContract(fundRegistry.STORAGE(), address(fundStorage));

    FundMultiSig _fundMultiSig = fundMultiSigFactory.build(
      _initialMultiSigOwners,
      _initialMultiSigRequired,
      fundRegistry
    );
    PrivateFundStorage _fundStorage = PrivateFundStorage(fundRegistry.getStorageAddress());
    IACL _fundACL = fundRegistry.getACL();

    address _fundUpgrader = fundUpgraderFactory.build(address(fundRegistry), false, true);
    address _fundController = fundControllerFactory.build(address(fundRegistry), false, true);
    address _fundRA = fundRAFactory.build(address(fundRegistry), false, true);
    address _fundProposalManager = fundProposalManagerFactory.build(address(fundRegistry), false, true);

    fundRegistry.setContract(c.fundRegistry.MULTISIG(), address(_fundMultiSig));
    fundRegistry.setContract(c.fundRegistry.CONTROLLER(), _fundController);
    fundRegistry.setContract(c.fundRegistry.UPGRADER(), _fundUpgrader);
    fundRegistry.setContract(c.fundRegistry.RA(), _fundRA);
    fundRegistry.setContract(c.fundRegistry.PROPOSAL_MANAGER(), _fundProposalManager);

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
    _fundACL.setRole(_fundStorage.ROLE_FINE_MEMBER_DECREMENT_MANAGER(), _fundController, true);
    _fundACL.setRole(_fundStorage.ROLE_DECREMENT_TOKEN_REPUTATION(), _fundRA, true);
    _fundACL.setRole(_fundStorage.ROLE_MULTISIG(), address(_fundMultiSig), true);
    _fundACL.setRole(FundUpgrader(_fundUpgrader).ROLE_UPGRADE_SCRIPT_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(FundUpgrader(_fundUpgrader).ROLE_IMPL_UPGRADE_MANAGER(), _fundProposalManager, true);
    _fundACL.setRole(FundMultiSig(_fundMultiSig).ROLE_OWNER_MANAGER(), _fundProposalManager, true);

    _fundACL.setRole(_fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), address(this), true);
    _fundStorage.addCommunityApp(_fundProposalManager, bytes32(""), bytes32(""), "Default");
    _fundACL.setRole(_fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), address(this), false);

    c.currentStep = Step.SECOND;

    emit CreateFundFirstStep(
      fundId,
      address(fundRegistry),
      address(_fundACL),
      address(fundStorage),
      _fundRA,
      _fundProposalManager,
      address(_fundMultiSig),
      _fundController,
      _fundUpgrader
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
    _fundACL.setRole(_fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER(), address(this), true);

    if (_finishFlag == true) {
      _finish(_fundId);
    } else {
      c.currentStep = Step.THIRD;
      emit CreateFundSecondStep(_fundId, len);
    }
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

    PrivateFundStorage _fundStorage = PrivateFundStorage(c.fundRegistry.getStorageAddress());
    IACL _fundACL = c.fundRegistry.getACL();

    _fundACL.setRole(_fundStorage.ROLE_PROPOSAL_THRESHOLD_MANAGER(), address(this), true);

    for (uint256 i = 0; i < len; i++) {
      _fundStorage.setProposalConfig(_markers[i], _supportValues[i], _quorumValues[i], _timeoutValues[i]);
    }

    _fundACL.setRole(_fundStorage.ROLE_PROPOSAL_THRESHOLD_MANAGER(), address(this), false);

    emit CreateFundThirdStep(_fundId, len);

    _finish(_fundId);
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

  // GETTERS

  function getCurrentStep(bytes32 _fundId) external view returns (Step) {
    return fundContracts[_fundId].currentStep;
  }
}
