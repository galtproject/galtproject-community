/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "@galtproject/private-property-registry/contracts/traits/ChargesFee.sol";

import "../PrivateFundStorage.sol";
import "../PrivateFundController.sol";
import "../../common/FundProposalManager.sol";

import "./PrivateFundRAFactory.sol";
import "./PrivateFundStorageFactory.sol";
import "./PrivateFundControllerFactory.sol";
import "../../common/factories/FundMultiSigFactory.sol";
import "../../common/factories/FundProposalManagerFactory.sol";


contract PrivateFundFactory is Ownable, ChargesFee {
  // Pre-defined proposal contracts
  bytes32 public constant MODIFY_CONFIG_TYPE = bytes32("modify_config");
  bytes32 public constant NEW_MEMBER_TYPE = bytes32("new_member");
  bytes32 public constant FINE_MEMBER_TYPE = bytes32("fine_member");
  bytes32 public constant WHITE_LIST_TYPE = bytes32("white_list");
  bytes32 public constant EXPEL_MEMBER_TYPE = bytes32("expel_member");
  bytes32 public constant CHANGE_NAME_AND_DESCRIPTION_TYPE = bytes32("change_info");
  bytes32 public constant ADD_FUND_RULE_TYPE = bytes32("add_rule");
  bytes32 public constant DEACTIVATE_FUND_RULE_TYPE = bytes32("deactivate_rule");
  bytes32 public constant CHANGE_MULTISIG_OWNERS_TYPE = bytes32("change_ms_owners");
  bytes32 public constant MODIFY_FEE_TYPE = bytes32("modify_fee");
  bytes32 public constant MODIFY_MULTISIG_MANAGER_DETAILS_TYPE = bytes32("modify_ms_manager_details");
  bytes32 public constant CHANGE_MULTISIG_WITHDRAWAL_LIMIT_TYPE = bytes32("change_ms_withdrawal_limits");
  bytes32 public constant MEMBER_IDENTIFICATION_TYPE = bytes32("member_identification");

  bytes32 public constant ROLE_FEE_COLLECTOR = bytes32("FEE_COLLECTOR");

  event CreateFundFirstStep(
    bytes32 fundId,
    address fundStorage
  );

  event CreateFundSecondStep(
    bytes32 fundId,
    address fundMultiSig,
    address fundController
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
    PrivateFundRA fundRA;
    FundMultiSig fundMultiSig;
    PrivateFundStorage fundStorage;
    PrivateFundController fundController;
    FundProposalManager fundProposalManager;
  }

  bool internal initialized;

  IPPGlobalRegistry internal globalRegistry;

  PrivateFundRAFactory fundRAFactory;
  PrivateFundStorageFactory fundStorageFactory;
  FundMultiSigFactory fundMultiSigFactory;
  PrivateFundControllerFactory fundControllerFactory;
  FundProposalManagerFactory fundProposalManagerFactory;

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

    PrivateFundStorage fundStorage = fundStorageFactory.build(
      globalRegistry,
      _isPrivate,
      _defaultProposalSupport,
      _defaultProposalQuorum,
      _defaultProposalTimeout,
      _periodLength
    );

    c.creator = msg.sender;
    c.operator = operator;
    c.fundStorage = fundStorage;

    c.currentStep = Step.SECOND;

    emit CreateFundFirstStep(fundId, address(fundStorage));

    return fundId;
  }

  function buildSecondStep(bytes32 _fundId, address[] calldata _initialMultiSigOwners, uint256 _initialMultiSigRequired) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.SECOND, "Requires second step");

    PrivateFundStorage _fundStorage = c.fundStorage;

    FundMultiSig _fundMultiSig = fundMultiSigFactory.build(
      _initialMultiSigOwners,
      _initialMultiSigRequired,
      _fundStorage
    );
    c.fundMultiSig = _fundMultiSig;

    c.fundController = fundControllerFactory.build(_fundStorage);

    c.currentStep = Step.THIRD;

    emit CreateFundSecondStep(
      _fundId,
      address(_fundMultiSig),
      address(c.fundController)
    );
  }

  function buildThirdStep(bytes32 _fundId) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.THIRD, "Requires third step");

    PrivateFundStorage _fundStorage = c.fundStorage;

    c.fundRA = fundRAFactory.build(_fundStorage);
    c.fundProposalManager = fundProposalManagerFactory.build(_fundStorage);

    address _fundProposalManager = address(c.fundProposalManager);

    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_CONFIG_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_NEW_MEMBER_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_EXPEL_MEMBER_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_FINE_MEMBER_INCREMENT_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_FINE_MEMBER_DECREMENT_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_ADD_FUND_RULE_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_DEACTIVATE_FUND_RULE_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_FEE_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_MEMBER_DETAILS_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_MULTI_SIG_WITHDRAWAL_LIMITS_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_MEMBER_IDENTIFICATION_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_PROPOSAL_THRESHOLD_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_DEFAULT_PROPOSAL_THRESHOLD_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_WHITELIST_CONTRACTS_MANAGER());
    _fundStorage.addRoleTo(_fundProposalManager, _fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER());
    _fundStorage.addRoleTo(address(c.fundController), _fundStorage.ROLE_FINE_MEMBER_DECREMENT_MANAGER());
    _fundStorage.addRoleTo(address(c.fundRA), _fundStorage.ROLE_DECREMENT_TOKEN_REPUTATION());
    c.fundMultiSig.addRoleTo(_fundProposalManager, c.fundMultiSig.ROLE_OWNER_MANAGER());

    _fundStorage.addRoleTo(address(this), _fundStorage.ROLE_WHITELIST_CONTRACTS_MANAGER());
    _fundStorage.addCommunityApp(_fundProposalManager, bytes32(""), bytes32(""), "Default");
    _fundStorage.removeRoleFrom(address(this), _fundStorage.ROLE_WHITELIST_CONTRACTS_MANAGER());

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

    _fundStorage.addRoleTo(address(this), _fundStorage.ROLE_PROPOSAL_THRESHOLD_MANAGER());

    for (uint256 i = 0; i < len; i++) {
      _fundStorage.setProposalConfig(_markers[i], _supportValues[i], _quorumValues[i], _timeoutValues[i]);
    }

    _fundStorage.removeRoleFrom(address(this), _fundStorage.ROLE_PROPOSAL_THRESHOLD_MANAGER());

    emit CreateFundFourthStep(_fundId, len);
  }

  function buildFourthStepDone(bytes32 _fundId, string calldata _name, string calldata _dataLink) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.FOURTH, "Requires fourth step");

    PrivateFundStorage _fundStorage = c.fundStorage;

    _fundStorage.addRoleTo(address(this), _fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER());
    _fundStorage.setNameAndDataLink(_name, _dataLink);
    _fundStorage.removeRoleFrom(address(this), _fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER());

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
    FundMultiSig _fundMultiSig = c.fundMultiSig;
    uint256 len = _initialTokensToApprove.length;

    _fundStorage.addRoleTo(address(this), _fundStorage.ROLE_NEW_MEMBER_MANAGER());

    for (uint i = 0; i < len; i++) {
      _fundStorage.approveMint(_initialRegistriesToApprove[i], _initialTokensToApprove[i]);
    }

    _fundStorage.removeRoleFrom(address(this), _fundStorage.ROLE_NEW_MEMBER_MANAGER());

    _fundStorage.initialize(
      address(c.fundMultiSig),
      address(c.fundController),
      address(c.fundRA),
      address(c.fundProposalManager)
    );

    _fundStorage.addRoleTo(msg.sender, _fundStorage.ROLE_ROLE_MANAGER());
    _fundMultiSig.addRoleTo(msg.sender, _fundMultiSig.ROLE_ROLE_MANAGER());

    _fundStorage.addRoleTo(address(this), _fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER());
    for (uint i = 0; i < proposalMarkersSignatures.length; i++) {
      if (bytes8(proposalMarkersNames[i]) == bytes8("storage.")) {
        _fundStorage.addProposalMarker(proposalMarkersSignatures[i], address(_fundStorage), address(c.fundProposalManager), proposalMarkersNames[i], "");
      }
      if (bytes8(proposalMarkersNames[i]) == bytes8("multiSig")) {
        _fundStorage.addProposalMarker(proposalMarkersSignatures[i], address(c.fundMultiSig), address(c.fundProposalManager), proposalMarkersNames[i], "");
      }
    }
    _fundStorage.removeRoleFrom(address(this), _fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER());

    _fundStorage.removeRoleFrom(address(this), _fundStorage.ROLE_ROLE_MANAGER());
    _fundMultiSig.removeRoleFrom(address(this), _fundMultiSig.ROLE_ROLE_MANAGER());

    c.currentStep = Step.DONE;

    emit CreateFundFifthStep(_fundId, len);
  }

  function getCurrentStep(bytes32 _fundId) external view returns (Step) {
    return fundContracts[_fundId].currentStep;
  }
}
