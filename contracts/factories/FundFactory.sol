/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

pragma solidity 0.5.7;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "@galtproject/core/contracts/registries/GaltGlobalRegistry.sol";

import "../FundStorage.sol";
import "../FundController.sol";
import "./FundRAFactory.sol";

import "./FundStorageFactory.sol";
import "./FundMultiSigFactory.sol";
import "./FundControllerFactory.sol";
import "./AbstractProposalManagerFactory.sol";

import "./AddFundRuleProposalManagerFactory.sol";
import "./DeactivateFundRuleProposalManagerFactory.sol";
import "./NewMemberProposalManagerFactory.sol";
import "./ExpelMemberProposalManagerFactory.sol";
import "./WLProposalManagerFactory.sol";
import "./FineMemberProposalManagerFactory.sol";
import "./ModifyConfigProposalManagerFactory.sol";
import "./ModifyFeeProposalManagerFactory.sol";
import "./ChangeNameAndDescriptionProposalManagerFactory.sol";
import "./ChangeMultiSigOwnersProposalManagerFactory.sol";
import "./ModifyMultiSigManagerDetailsProposalManagerFactory.sol";
import "./ChangeMultiSigWithdrawalLimitsProposalManagerFactory.sol";
import "./MemberIdentificationProposalManagerFactory.sol";

contract FundFactory is Ownable {
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

  event CreateFundFirstStep(
    bytes32 fundId,
    address fundStorage
  );

  event CreateFundSecondStep(
    bytes32 fundId,
    address fundMultiSig,
    address fundController,
    address memberIdentificationProposalManager
  );

  event CreateFundThirdStep(
    bytes32 fundId,
    address fundRA,
    address modifyConfigProposalManager,
    address newMemberProposalManager
  );

  event CreateFundFourthStep(
    bytes32 fundId,
    address fineMemberProposalManager,
    address whiteListProposalManager,
    address expelMemberProposalManager
  );

  event CreateFundFifthStep(
    bytes32 fundId,
    address changeNameAndDescriptionProposalManager
  );

  event CreateFundSixthStep(
    bytes32 fundId,
    address addFundRuleProposalManager,
    address deactivateFundRuleProposalManager
  );

  event CreateFundSeventhStep(
    bytes32 fundId,
    address changeMultiSigOwnersProposalManager,
    address modifyFeeProposalManager
  );

  event CreateFundEighthStep(
    bytes32 fundId,
    address modifyMultiSigManagerDetailsProposalManager,
    address changeMultiSigWithdrawalLimitsProposalManager
  );

  enum Step {
    FIRST,
    SECOND,
    THIRD,
    FOURTH,
    FIFTH,
    SIXTH,
    SEVENTH,
    EIGHTH,
    DONE
  }

  struct FundContracts {
    address creator;
    address operator;
    Step currentStep;
    FundRA fundRA;
    FundMultiSig fundMultiSig;
    FundStorage fundStorage;
    FundController fundController;
  }

  bool initialized;

  uint256 public ethFee;
  uint256 public galtFee;
  address internal collector;

  GaltGlobalRegistry internal ggr;

  FundRAFactory fundRAFactory;
  FundStorageFactory fundStorageFactory;
  FundMultiSigFactory fundMultiSigFactory;
  FundControllerFactory fundControllerFactory;

  mapping(bytes32 => address) internal managerFactories;
  mapping(bytes32 => FundContracts) internal fundContracts;

  constructor (
    GaltGlobalRegistry _ggr,
    FundRAFactory _fundRAFactory,
    FundMultiSigFactory _fundMultiSigFactory,
    FundStorageFactory _fundStorageFactory,
    FundControllerFactory _fundControllerFactory
  ) public {
    fundControllerFactory = _fundControllerFactory;
    fundStorageFactory = _fundStorageFactory;
    fundMultiSigFactory = _fundMultiSigFactory;
    fundRAFactory = _fundRAFactory;
    ggr = _ggr;

    galtFee = 10 ether;
    ethFee = 5 ether;
  }

  // All the arguments don't fit into a stack limit of constructor,
  // so there is one more method for initialization
  function initialize(
    address[] calldata _managerFactories,
    bytes32[] calldata _managerFactoriesNames
  )
    external
    onlyOwner
  {
    require(initialized == false);

    for (uint i = 0; i < _managerFactories.length; i++) {
      managerFactories[_managerFactoriesNames[i]] = _managerFactories[i];
    }

    initialized = true;
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
    uint256[] calldata _thresholds,
    uint256 _periodLength
  )
    external
    payable
    returns (bytes32 fundId)
  {
    require(_thresholds.length == 13, "Thresholds length should be 13");

    fundId = keccak256(abi.encode(blockhash(block.number - 1), msg.sender));

    FundContracts storage c = fundContracts[fundId];
    require(c.currentStep == Step.FIRST, "Requires first step");

    _acceptPayment();

    FundStorage fundStorage = fundStorageFactory.build(
      ggr,
      _isPrivate,
      _thresholds,
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

    FundStorage _fundStorage = c.fundStorage;

    FundMultiSig _fundMultiSig = fundMultiSigFactory.build(
      _initialMultiSigOwners,
      _initialMultiSigRequired,
      _fundStorage
    );
    c.fundMultiSig = _fundMultiSig;

    c.fundController = fundControllerFactory.build(_fundStorage);

    address memberIdentificationProposalManager = buildProposalFactory(MEMBER_IDENTIFICATION_TYPE, _fundStorage);

    _fundStorage.addRoleTo(memberIdentificationProposalManager, _fundStorage.CONTRACT_MEMBER_IDENTIFICATION_MANAGER());
    _fundStorage.addRoleTo(address(this), _fundStorage.CONTRACT_WHITELIST_MANAGER());
    _fundStorage.addWhiteListedContract(memberIdentificationProposalManager, MEMBER_IDENTIFICATION_TYPE, 0x0, "");

    c.currentStep = Step.THIRD;

    emit CreateFundSecondStep(
      _fundId,
      address(_fundMultiSig),
      address(c.fundController),
      memberIdentificationProposalManager
    );
  }

  function buildThirdStep(bytes32 _fundId) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.THIRD, "Requires third step");

    FundStorage _fundStorage = c.fundStorage;
    c.fundRA = fundRAFactory.build(_fundStorage);

    address modifyConfigProposalManager = buildProposalFactory(MODIFY_CONFIG_TYPE, _fundStorage);
    address newMemberProposalManager = buildProposalFactory(NEW_MEMBER_TYPE, _fundStorage);

    _fundStorage.addWhiteListedContract(modifyConfigProposalManager, MODIFY_CONFIG_TYPE, 0x0, "");
    _fundStorage.addWhiteListedContract(newMemberProposalManager, NEW_MEMBER_TYPE, 0x0, "");

    _fundStorage.addRoleTo(modifyConfigProposalManager, _fundStorage.CONTRACT_CONFIG_MANAGER());
    _fundStorage.addRoleTo(newMemberProposalManager, _fundStorage.CONTRACT_NEW_MEMBER_MANAGER());
    _fundStorage.addRoleTo(address(c.fundRA), _fundStorage.DECREMENT_TOKEN_REPUTATION_ROLE());
    _fundStorage.addRoleTo(address(c.fundController), _fundStorage.CONTRACT_FINE_MEMBER_DECREMENT_MANAGER());

    c.currentStep = Step.FOURTH;

    emit CreateFundThirdStep(
      _fundId,
      address(c.fundRA),
      modifyConfigProposalManager,
      newMemberProposalManager
    );
  }

  function buildFourthStep(bytes32 _fundId) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.FOURTH, "Requires fourth step");

    FundStorage _fundStorage = c.fundStorage;

    address fineMemberProposalManager = buildProposalFactory(FINE_MEMBER_TYPE, c.fundStorage);
    address wlProposalManager = buildProposalFactory(WHITE_LIST_TYPE, c.fundStorage);
    address expelMemberProposalManager = buildProposalFactory(EXPEL_MEMBER_TYPE, c.fundStorage);

    _fundStorage.addWhiteListedContract(fineMemberProposalManager, FINE_MEMBER_TYPE, 0x0, "");
    _fundStorage.addWhiteListedContract(wlProposalManager, WHITE_LIST_TYPE, 0x0, "");
    _fundStorage.addWhiteListedContract(expelMemberProposalManager, EXPEL_MEMBER_TYPE, 0x0, "");

    _fundStorage.addRoleTo(fineMemberProposalManager, _fundStorage.CONTRACT_FINE_MEMBER_INCREMENT_MANAGER());
    _fundStorage.addRoleTo(wlProposalManager, _fundStorage.CONTRACT_WHITELIST_MANAGER());
    _fundStorage.addRoleTo(expelMemberProposalManager, _fundStorage.CONTRACT_EXPEL_MEMBER_MANAGER());

    c.currentStep = Step.FIFTH;

    emit CreateFundFourthStep(
      _fundId,
      fineMemberProposalManager,
      wlProposalManager,
      expelMemberProposalManager
    );
  }

  function buildFifthStep(bytes32 _fundId, string calldata _name, string calldata _description) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.FIFTH, "Requires fifth step");

    FundStorage _fundStorage = c.fundStorage;

    address changeNameAndDescriptionProposalManager = buildProposalFactory(CHANGE_NAME_AND_DESCRIPTION_TYPE, c.fundStorage);

    _fundStorage.addRoleTo(changeNameAndDescriptionProposalManager, _fundStorage.CONTRACT_CHANGE_NAME_AND_DESCRIPTION_MANAGER());

    _fundStorage.addWhiteListedContract(changeNameAndDescriptionProposalManager, CHANGE_NAME_AND_DESCRIPTION_TYPE, 0x0, "");

    _fundStorage.addRoleTo(address(this), _fundStorage.CONTRACT_CHANGE_NAME_AND_DESCRIPTION_MANAGER());
    _fundStorage.setNameAndDescription(_name, _description);
    _fundStorage.removeRoleFrom(address(this), _fundStorage.CONTRACT_CHANGE_NAME_AND_DESCRIPTION_MANAGER());

    c.currentStep = Step.SIXTH;

    emit CreateFundFifthStep(
      _fundId,
      changeNameAndDescriptionProposalManager
    );
  }

  function buildSixthStep(bytes32 _fundId, uint256[] calldata _initialSpaceTokensToApprove) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.SIXTH, "Requires sixth step");

    FundStorage _fundStorage = c.fundStorage;

    address addFundRuleProposalManager = buildProposalFactory(ADD_FUND_RULE_TYPE, c.fundStorage);
    address deactivateFundRuleProposalManager = buildProposalFactory(DEACTIVATE_FUND_RULE_TYPE, c.fundStorage);

    _fundStorage.addRoleTo(addFundRuleProposalManager, _fundStorage.CONTRACT_ADD_FUND_RULE_MANAGER());
    _fundStorage.addRoleTo(deactivateFundRuleProposalManager, _fundStorage.CONTRACT_DEACTIVATE_FUND_RULE_MANAGER());

    _fundStorage.addWhiteListedContract(addFundRuleProposalManager, ADD_FUND_RULE_TYPE, 0x0, "");
    _fundStorage.addWhiteListedContract(deactivateFundRuleProposalManager, DEACTIVATE_FUND_RULE_TYPE, 0x0, "");

    _fundStorage.addRoleTo(address(this), _fundStorage.CONTRACT_NEW_MEMBER_MANAGER());

    for (uint i = 0; i < _initialSpaceTokensToApprove.length; i++) {
      _fundStorage.approveMint(_initialSpaceTokensToApprove[i]);
    }

    _fundStorage.removeRoleFrom(address(this), _fundStorage.CONTRACT_NEW_MEMBER_MANAGER());

    c.currentStep = Step.SEVENTH;

    emit CreateFundSixthStep(
      _fundId,
      addFundRuleProposalManager,
      deactivateFundRuleProposalManager
    );
  }

  function buildSeventhStep(bytes32 _fundId) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.SEVENTH, "Requires seventh step");

    FundStorage _fundStorage = c.fundStorage;

    address changeMultiSigOwnersProposalManager = buildProposalFactory(CHANGE_MULTISIG_OWNERS_TYPE, _fundStorage);
    address modifyFeeProposalManager = buildProposalFactory(MODIFY_FEE_TYPE, _fundStorage);

    c.fundMultiSig.addRoleTo(changeMultiSigOwnersProposalManager, c.fundMultiSig.OWNER_MANAGER());
    _fundStorage.addRoleTo(modifyFeeProposalManager, _fundStorage.CONTRACT_FEE_MANAGER());

    _fundStorage.addWhiteListedContract(changeMultiSigOwnersProposalManager, CHANGE_MULTISIG_OWNERS_TYPE, 0x0, "");
    _fundStorage.addWhiteListedContract(modifyFeeProposalManager, MODIFY_FEE_TYPE, 0x0, "");

    c.currentStep = Step.EIGHTH;

    emit CreateFundSeventhStep(
      _fundId,
      changeMultiSigOwnersProposalManager,
      modifyFeeProposalManager
    );
  }

  function buildEighthStep(bytes32 _fundId) external {
    FundContracts storage c = fundContracts[_fundId];
    require(msg.sender == c.creator || msg.sender == c.operator, "Only creator/operator allowed");
    require(c.currentStep == Step.EIGHTH, "Requires eighth step");

    FundStorage _fundStorage = c.fundStorage;

    address modifyMultiSigManagerDetailsProposalManager = buildProposalFactory(MODIFY_MULTISIG_MANAGER_DETAILS_TYPE, _fundStorage);
    address changeMultiSigWithdrawalLimitsProposalManager = buildProposalFactory(CHANGE_MULTISIG_WITHDRAWAL_LIMIT_TYPE, _fundStorage);

    _fundStorage.addRoleTo(modifyMultiSigManagerDetailsProposalManager, _fundStorage.CONTRACT_MEMBER_DETAILS_MANAGER());
    _fundStorage.addRoleTo(changeMultiSigWithdrawalLimitsProposalManager, _fundStorage.CONTRACT_MULTI_SIG_WITHDRAWAL_LIMITS_MANAGER());

    _fundStorage.addWhiteListedContract(modifyMultiSigManagerDetailsProposalManager, MODIFY_MULTISIG_MANAGER_DETAILS_TYPE, 0x0, "");
    _fundStorage.addWhiteListedContract(changeMultiSigWithdrawalLimitsProposalManager, CHANGE_MULTISIG_WITHDRAWAL_LIMIT_TYPE, 0x0, "");
    _fundStorage.removeRoleFrom(address(this), _fundStorage.CONTRACT_WHITELIST_MANAGER());

    _fundStorage.initialize(
      c.fundMultiSig,
      c.fundController,
      c.fundRA
    );

    c.currentStep = Step.DONE;

    emit CreateFundEighthStep(
      _fundId,
      modifyMultiSigManagerDetailsProposalManager,
      changeMultiSigWithdrawalLimitsProposalManager
    );
  }

  function buildProposalFactory(bytes32 _proposalType, FundStorage _fundStorage) internal returns (address) {
    return AbstractProposalManagerFactory(managerFactories[_proposalType]).build(_fundStorage);
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

  function getLastCreatedContracts(bytes32 _fundId) external view returns (
    address operator,
    Step currentStep,
    IFundRA fundRA,
    FundMultiSig fundMultiSig,
    FundStorage fundStorage,
    FundController fundController
  )
  {
    FundContracts storage c = fundContracts[_fundId];
    return (
    c.operator,
    c.currentStep,
    c.fundRA,
    c.fundMultiSig,
    c.fundStorage,
    c.fundController
    );
  }

  function getCurrentStep(bytes32 _fundId) external view returns (Step) {
    return fundContracts[_fundId].currentStep;
  }
}
