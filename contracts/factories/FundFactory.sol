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

pragma solidity 0.5.3;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC721/IERC721.sol";
import "@galtproject/core/contracts/interfaces/ISpaceLocker.sol";
import "@galtproject/core/contracts/registries/interfaces/ISpaceLockerRegistry.sol";
import "../FundStorage.sol";
import "../FundController.sol";
import "./RSRAFactory.sol";

import "./FundStorageFactory.sol";
import "./FundMultiSigFactory.sol";
import "./FundControllerFactory.sol";

import "./ModifyConfigProposalManagerFactory.sol";
import "./NewMemberProposalManagerFactory.sol";
import "./FineMemberProposalManagerFactory.sol";
import "./ExpelMemberProposalManagerFactory.sol";
import "./WLProposalManagerFactory.sol";
import "./ChangeNameAndDescriptionProposalManagerFactory.sol";
import "./AddFundRuleProposalManagerFactory.sol";
import "./DeactivateFundRuleProposalManagerFactory.sol";


contract FundFactory is Ownable {
  event CreateFundFirstStep(
    address creator,
    address fundRsra,
    address fundMultiSig,
    address fundStorage,
    address fundController
  );

  event CreateFundSecondStep(
    address creator,
    address multiSig,
    address modifyConfigProposalManager,
    address newMemberProposalManager,
    address fineMemberProposalManager
  );

  event CreateFundThirdStep(
    address creator,
    address multiSig,
    address whiteListProposalManager,
    address expelMemberProposalManager
  );

  event CreateFundFourthStep(
    address creator,
    address changeNameAndDescriptionProposalManager,
    address addFundRuleProposalManager,
    address deactivateFundRuleProposalManager
  );

  string public constant RSRA_CONTRACT = "rsra_contract";

  uint256 commission;

  IERC20 galtToken;
  IERC721 spaceToken;
  ISpaceLockerRegistry spaceLockerRegistry;

  RSRAFactory rsraFactory;
  FundStorageFactory fundStorageFactory;
  FundMultiSigFactory fundMultiSigFactory;
  FundControllerFactory fundControllerFactory;
  ModifyConfigProposalManagerFactory modifyConfigProposalManagerFactory;
  NewMemberProposalManagerFactory newMemberProposalManagerFactory;
  FineMemberProposalManagerFactory fineMemberProposalManagerFactory;
  ExpelMemberProposalManagerFactory expelMemberProposalManagerFactory;
  WLProposalManagerFactory wlProposalManagerFactory;
  ChangeNameAndDescriptionProposalManagerFactory changeNameAndDescriptionProposalManagerFactory;
  AddFundRuleProposalManagerFactory addFundRuleProposalManagerFactory;
  DeactivateFundRuleProposalManagerFactory deactivateFundRuleProposalManagerFactory;

  enum Step {
    FIRST,
    SECOND,
    THIRD,
    FOURTH
  }

  struct FirstStepContracts {
    Step currentStep;
    IRSRA rsra;
    FundMultiSig fundMultiSig;
    FundStorage fundStorage;
    FundController fundController;
  }

  mapping(address => FirstStepContracts) private _firstStepContracts;

  constructor (
    ERC20 _galtToken,
    IERC721 _spaceToken,
    ISpaceLockerRegistry _spaceLockerRegistry,
    RSRAFactory _rsraFactory,
    FundMultiSigFactory _fundMultiSigFactory,
    FundStorageFactory _fundStorageFactory,
    FundControllerFactory _fundControllerFactory,
    ModifyConfigProposalManagerFactory _modifyConfigProposalManagerFactory,
    NewMemberProposalManagerFactory _newMemberProposalManagerFactory,
    FineMemberProposalManagerFactory _fineMemberProposalManagerFactory,
    ExpelMemberProposalManagerFactory _expelMemberProposalManagerFactory,
    WLProposalManagerFactory _wlProposalManagerFactory,
    ChangeNameAndDescriptionProposalManagerFactory _changeNameAndDescriptionProposalManagerFactory,
    AddFundRuleProposalManagerFactory _addFundRuleProposalManagerFactory,
    DeactivateFundRuleProposalManagerFactory _deactivateFundRuleProposalManagerFactory
  ) public {
    commission = 10 ether;

    galtToken = _galtToken;
    spaceToken = _spaceToken;
    spaceLockerRegistry = _spaceLockerRegistry;

    rsraFactory = _rsraFactory;
    fundStorageFactory = _fundStorageFactory;
    fundMultiSigFactory = _fundMultiSigFactory;
    fundControllerFactory = _fundControllerFactory;
    modifyConfigProposalManagerFactory = _modifyConfigProposalManagerFactory;
    newMemberProposalManagerFactory = _newMemberProposalManagerFactory;
    fineMemberProposalManagerFactory = _fineMemberProposalManagerFactory;
    expelMemberProposalManagerFactory = _expelMemberProposalManagerFactory;
    wlProposalManagerFactory = _wlProposalManagerFactory;
    changeNameAndDescriptionProposalManagerFactory = _changeNameAndDescriptionProposalManagerFactory;
    addFundRuleProposalManagerFactory = _addFundRuleProposalManagerFactory;
    deactivateFundRuleProposalManagerFactory = _deactivateFundRuleProposalManagerFactory;
  }

  function buildFirstStep(
    bool _isPrivate,
    uint256[] calldata _thresholds,
    address[] calldata _multiSigInitialOwners,
    uint256 _multiSigRequired
  )
    external
    returns (IRSRA rsra, FundMultiSig fundMultiSig, FundStorage fundStorage, FundController fundController)
  {
    require(_thresholds.length == 8, "Thresholds length should be 8");

    FirstStepContracts storage c = _firstStepContracts[msg.sender];
    require(c.currentStep == Step.FIRST, "Requires first step");

    _acceptPayment();

    fundMultiSig = fundMultiSigFactory.build(_multiSigInitialOwners, _multiSigRequired);
    fundStorage = fundStorageFactory.build(
      _isPrivate,
      _thresholds
    );
    fundController = fundControllerFactory.build(
      galtToken,
      fundStorage,
      fundMultiSig
    );
    rsra = rsraFactory.build(spaceToken, spaceLockerRegistry, fundStorage);

    c.currentStep = Step.SECOND;
    c.rsra = rsra;
    c.fundStorage = fundStorage;
    c.fundMultiSig = fundMultiSig;
    c.fundController = fundController;

    emit CreateFundFirstStep(msg.sender, address(rsra), address(fundMultiSig), address(fundStorage), address(fundController));
  }

  function buildSecondStep() external {
    FirstStepContracts storage c = _firstStepContracts[msg.sender];
    require(c.currentStep == Step.SECOND, "Requires second step");

    IRSRA _rsra = c.rsra;
    FundStorage _fundStorage = c.fundStorage;
    FundMultiSig _fundMultiSig = c.fundMultiSig;
    FundController _fundController = c.fundController;

    ModifyConfigProposalManager modifyConfigProposalManager = modifyConfigProposalManagerFactory.build(_rsra, _fundStorage);
    NewMemberProposalManager newMemberProposalManager = newMemberProposalManagerFactory.build(_rsra, _fundStorage);
    FineMemberProposalManager fineMemberProposalManager = fineMemberProposalManagerFactory.build(_rsra, _fundStorage);

    _fundStorage.addRoleTo(address(this), _fundStorage.CONTRACT_WHITELIST_MANAGER());
    _fundStorage.addWhiteListedContract(address(modifyConfigProposalManager), 0x0, "");
    _fundStorage.addWhiteListedContract(address(newMemberProposalManager), 0x0, "");
    _fundStorage.addWhiteListedContract(address(fineMemberProposalManager), 0x0, "");
    _fundStorage.removeRoleFrom(address(this), _fundStorage.CONTRACT_WHITELIST_MANAGER());

    _fundStorage.addRoleTo(address(modifyConfigProposalManager), _fundStorage.CONTRACT_CONFIG_MANAGER());
    _fundStorage.addRoleTo(address(newMemberProposalManager), _fundStorage.CONTRACT_NEW_MEMBER_MANAGER());
    _fundStorage.addRoleTo(address(fineMemberProposalManager), _fundStorage.CONTRACT_FINE_MEMBER_INCREMENT_MANAGER());
    _fundStorage.addRoleTo(address(_rsra), _fundStorage.CONTRACT_RSRA());
    _fundStorage.addRoleTo(address(_fundController), _fundStorage.CONTRACT_FINE_MEMBER_DECREMENT_MANAGER());

    c.currentStep = Step.THIRD;

    emit CreateFundSecondStep(
      msg.sender,
      address(_fundMultiSig),
      address(modifyConfigProposalManager),
      address(newMemberProposalManager),
      address(fineMemberProposalManager)
    );
  }

  function buildThirdStep() external {
    FirstStepContracts storage c = _firstStepContracts[msg.sender];
    require(c.currentStep == Step.THIRD, "Requires second step");

    FundStorage _fundStorage = c.fundStorage;
    IRSRA _rsra = c.rsra;

    WLProposalManager wlProposalManager = wlProposalManagerFactory.build(c.rsra, _fundStorage);
    ExpelMemberProposalManager expelMemberProposalManager = expelMemberProposalManagerFactory.build(_rsra, _fundStorage, spaceToken);

    _fundStorage.addRoleTo(address(this), _fundStorage.CONTRACT_WHITELIST_MANAGER());
    _fundStorage.addWhiteListedContract(address(wlProposalManager), 0x0, "");
    _fundStorage.addWhiteListedContract(address(expelMemberProposalManager), 0x0, "");
    _fundStorage.removeRoleFrom(address(this), _fundStorage.CONTRACT_WHITELIST_MANAGER());

    _fundStorage.addRoleTo(address(wlProposalManager), _fundStorage.CONTRACT_WHITELIST_MANAGER());
    _fundStorage.addRoleTo(address(expelMemberProposalManager), _fundStorage.CONTRACT_EXPEL_MEMBER_MANAGER());

    c.currentStep = Step.FOURTH;

    emit CreateFundThirdStep(
      msg.sender,
      address(c.fundMultiSig),
      address(wlProposalManager),
      address(expelMemberProposalManager)
    );
  }

  function buildFourthStep(string calldata _name, string calldata _description) external {
    FirstStepContracts storage c = _firstStepContracts[msg.sender];
    require(c.currentStep == Step.FOURTH, "Requires fourth step");

    FundStorage _fundStorage = c.fundStorage;

    ChangeNameAndDescriptionProposalManager changeNameAndDescriptionProposalManager =
      changeNameAndDescriptionProposalManagerFactory.build(c.rsra, _fundStorage);
    AddFundRuleProposalManager addFundRuleProposalManager = addFundRuleProposalManagerFactory.build(c.rsra, _fundStorage);
    DeactivateFundRuleProposalManager deactivateFundRuleProposalManager = deactivateFundRuleProposalManagerFactory.build(c.rsra, _fundStorage);

    _fundStorage.addRoleTo(address(changeNameAndDescriptionProposalManager), _fundStorage.CONTRACT_CHANGE_NAME_AND_DESCRIPTION_MANAGER());
    _fundStorage.addRoleTo(address(addFundRuleProposalManager), _fundStorage.CONTRACT_ADD_FUND_RULE_MANAGER());
    _fundStorage.addRoleTo(address(deactivateFundRuleProposalManager), _fundStorage.CONTRACT_DEACTIVATE_FUND_RULE_MANAGER());

    _fundStorage.addRoleTo(address(this), _fundStorage.CONTRACT_WHITELIST_MANAGER());
    _fundStorage.addWhiteListedContract(address(changeNameAndDescriptionProposalManager), 0x0, "");
    _fundStorage.addWhiteListedContract(address(addFundRuleProposalManager), 0x0, "");
    _fundStorage.addWhiteListedContract(address(deactivateFundRuleProposalManager), 0x0, "");
    _fundStorage.removeRoleFrom(address(this), _fundStorage.CONTRACT_WHITELIST_MANAGER());

    _fundStorage.addRoleTo(address(this), _fundStorage.CONTRACT_CHANGE_NAME_AND_DESCRIPTION_MANAGER());
    _fundStorage.setNameAndDescription(_name, _description);
    _fundStorage.removeRoleFrom(address(this), _fundStorage.CONTRACT_CHANGE_NAME_AND_DESCRIPTION_MANAGER());

    delete _firstStepContracts[msg.sender];

    emit CreateFundFourthStep(
      msg.sender,
      address(changeNameAndDescriptionProposalManager),
      address(addFundRuleProposalManager),
      address(deactivateFundRuleProposalManager)
    );
  }

  function _acceptPayment() internal {
    galtToken.transferFrom(msg.sender, address(this), commission);
  }

  function setCommission(uint256 _commission) external onlyOwner {
    commission = _commission;
  }

  function getMyLastCreatedContracts() external returns (
    Step currentStep,
    IRSRA rsra,
    FundMultiSig fundMultiSig,
    FundStorage fundStorage,
    FundController fundController
  )
  {
    return (
      _firstStepContracts[msg.sender].currentStep,
      _firstStepContracts[msg.sender].rsra,
      _firstStepContracts[msg.sender].fundMultiSig,
      _firstStepContracts[msg.sender].fundStorage,
      _firstStepContracts[msg.sender].fundController
    );
  }

  function getCurrentStep(address _creator) external returns (Step) {
    return _firstStepContracts[_creator].currentStep;
  }
}
