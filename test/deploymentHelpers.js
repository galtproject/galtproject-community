const FundFactory = artifacts.require('./FundFactory.sol');
const FundStorageFactory = artifacts.require('./FundStorageFactory.sol');
const FundMultiSigFactory = artifacts.require('./FundMultiSigFactory.sol');
const FundControllerFactory = artifacts.require('./FundControllerFactory.sol');
const MockRSRAFactory = artifacts.require('./MockRSRAFactory.sol');
const NewMemberProposalManagerFactory = artifacts.require('./NewMemberProposalManagerFactory.sol');
const ExpelMemberProposalManagerFactory = artifacts.require('./ExpelMemberProposalManagerFactory.sol');
const FineMemberProposalManagerFactory = artifacts.require('./FineMemberProposalManagerFactory.sol');
const WLProposalManagerFactory = artifacts.require('./WLProposalManagerFactory.sol');
const MockModifyConfigProposalManagerFactory = artifacts.require('./MockModifyConfigProposalManagerFactory.sol');
const ModifyFeeProposalManagerFactory = artifacts.require('./ModifyFeeProposalManagerFactory.sol');
const ChangeNameAndDescriptionProposalManagerFactory = artifacts.require(
  './ChangeNameAndDescriptionProposalManagerFactory.sol'
);
const ChangeMultiSigOwnersProposalManagerFactory = artifacts.require(
  './ChangeMultiSigOwnersProposalManagerFactory.sol'
);
const ModifyMultiSigManagerDetailsProposalManagerFactory = artifacts.require(
  './ModifyMultiSigManagerDetailsProposalManagerFactory.sol'
);

const FundStorage = artifacts.require('./FundStorage.sol');
const FundController = artifacts.require('./FundController.sol');
const FundMultiSig = artifacts.require('./FundMultiSig.sol');
const MockRSRA = artifacts.require('./MockRSRA.sol');

const MockModifyConfigProposalManager = artifacts.require('./MockModifyConfigProposalManager.sol');
const NewMemberProposalManager = artifacts.require('./NewMemberProposalManager.sol');
const ExpelMemberProposalManager = artifacts.require('./ExpelMemberProposalManager.sol');
const ChangeMultiSigOwnersProposalManager = artifacts.require('./ChangeMultiSigOwnersProposalManager.sol');
const FineMemberProposalManager = artifacts.require('./FineMemberProposalManager.sol');
const AddFundRuleProposalManager = artifacts.require('./AddFundRuleProposalManager.sol');
const DeactivateFundRuleProposalManager = artifacts.require('./DeactivateFundRuleProposalManager.sol');
const ChangeNameAndDescriptionProposalManager = artifacts.require('./ChangeNameAndDescriptionProposalManager.sol');
const AddFundRuleProposalManagerFactory = artifacts.require('./AddFundRuleProposalManagerFactory.sol');
const DeactivateFundRuleProposalManagerFactory = artifacts.require('./DeactivateFundRuleProposalManagerFactory.sol');
const ModifyFeeProposalManager = artifacts.require('./ModifyFeeProposalManager.sol');
const WLProposalManager = artifacts.require('./WLProposalManager.sol');
const ModifyMultiSigManagerDetailsProposalManager = artifacts.require(
  './ModifyMultiSigManagerDetailsProposalManager.sol'
);

async function deployFundFactory(galtTokenAddress, spaceTokenAddress, spaceLockerRegistryAddress, owner) {
  this.rsraFactory = await MockRSRAFactory.new();
  this.fundStorageFactory = await FundStorageFactory.new();
  this.fundMultiSigFactory = await FundMultiSigFactory.new();
  this.fundControllerFactory = await FundControllerFactory.new();

  this.modifyConfigProposalManagerFactory = await MockModifyConfigProposalManagerFactory.new();
  this.newMemberProposalManagerFactory = await NewMemberProposalManagerFactory.new();
  this.fineMemberProposalManagerFactory = await FineMemberProposalManagerFactory.new();
  this.expelMemberProposalManagerFactory = await ExpelMemberProposalManagerFactory.new();
  this.wlProposalManagerFactory = await WLProposalManagerFactory.new();
  this.changeNameAndDescriptionProposalManagerFactory = await ChangeNameAndDescriptionProposalManagerFactory.new();
  this.addFundRuleProposalManagerFactory = await AddFundRuleProposalManagerFactory.new();
  this.deactivateFundRuleProposalManagerFactory = await DeactivateFundRuleProposalManagerFactory.new();
  this.changeMultiSigOwnersProposalManagerFactory = await ChangeMultiSigOwnersProposalManagerFactory.new();
  this.modifyFeeProposalManagerFactory = await ModifyFeeProposalManagerFactory.new();
  // eslint-disable-next-line
  this.modifyMultiSigManagerDetailsProposalManagerFactory = await ModifyMultiSigManagerDetailsProposalManagerFactory.new();

  const fundFactory = await FundFactory.new(
    galtTokenAddress,
    spaceTokenAddress,
    spaceLockerRegistryAddress,
    this.rsraFactory.address,
    this.fundMultiSigFactory.address,
    this.fundStorageFactory.address,
    this.fundControllerFactory.address,
    { from: owner }
  );

  await fundFactory.initialize(
    this.modifyConfigProposalManagerFactory.address,
    this.newMemberProposalManagerFactory.address,
    this.fineMemberProposalManagerFactory.address,
    this.expelMemberProposalManagerFactory.address,
    this.wlProposalManagerFactory.address,
    this.changeNameAndDescriptionProposalManagerFactory.address,
    this.addFundRuleProposalManagerFactory.address,
    this.deactivateFundRuleProposalManagerFactory.address,
    this.changeMultiSigOwnersProposalManagerFactory.address,
    this.modifyFeeProposalManagerFactory.address,
    this.modifyMultiSigManagerDetailsProposalManagerFactory.address,
    { from: owner }
  );

  return fundFactory;
}

/**
 * Performs all required steps to build a new fund
 *
 * @param {FundMultiSigFactory} factory
 * @param {boolean} isPrivate
 * @param {Array<number>} thresholds
 * @param {Array<string>} initialMultiSigOwners
 * @param {number} initialMultiSigRequired
 * @param {string} name
 * @param {string} description
 * @param {Array<string>} initialSpaceTokens
 * @param {string} creator
 * @returns {Promise<{}>}
 */
async function buildFund(
  factory,
  creator,
  isPrivate,
  thresholds,
  initialMultiSigOwners,
  initialMultiSigRequired,
  name = 'foo',
  description = 'bar',
  initialSpaceTokens = []
) {
  // >>> Step #1
  let res = await factory.buildFirstStep(
    creator,
    isPrivate,
    thresholds,
    initialMultiSigOwners,
    initialMultiSigRequired,
    {
      from: creator
    }
  );
  // console.log('buildFirstStep gasUsed', res.receipt.gasUsed);
  const fundId = await res.logs[0].args.fundId;
  const fundStorage = await FundStorage.at(res.logs[0].args.fundStorage);
  const fundMultiSig = await FundMultiSig.at(res.logs[0].args.fundMultiSig);

  // >>> Step #2
  res = await factory.buildSecondStep(fundId, { from: creator });
  // console.log('buildSecondStep gasUsed', res.receipt.gasUsed);
  const fundController = await FundController.at(res.logs[0].args.fundController);

  // >>> Step #3
  res = await factory.buildThirdStep(fundId, { from: creator });
  // console.log('buildThirdStep gasUsed', res.receipt.gasUsed);
  const fundRsra = await MockRSRA.at(res.logs[0].args.fundRsra);
  const modifyConfigProposalManager = await MockModifyConfigProposalManager.at(
    res.logs[0].args.modifyConfigProposalManager
  );
  const newMemberProposalManager = await NewMemberProposalManager.at(res.logs[0].args.newMemberProposalManager);

  // >>> Step #4
  res = await factory.buildFourthStep(fundId, { from: creator });
  // console.log('buildFourthStep gasUsed', res.receipt.gasUsed);
  const fineMemberProposalManager = await FineMemberProposalManager.at(res.logs[0].args.fineMemberProposalManager);
  const whiteListProposalManager = await WLProposalManager.at(res.logs[0].args.whiteListProposalManager);
  const expelMemberProposalManager = await ExpelMemberProposalManager.at(res.logs[0].args.expelMemberProposalManager);

  // >>> Step #5
  res = await factory.buildFifthStep(fundId, name, description, { from: creator });
  // console.log('buildFifthStep gasUsed', res.receipt.gasUsed);
  const changeNameAndDescriptionProposalManager = await ChangeNameAndDescriptionProposalManager.at(
    res.logs[0].args.changeNameAndDescriptionProposalManager
  );

  // >>> Step #6
  res = await factory.buildSixthStep(fundId, initialSpaceTokens, { from: creator });
  // console.log('buildSixthStep gasUsed', res.receipt.gasUsed);

  const addFundRuleProposalManager = await AddFundRuleProposalManager.at(res.logs[0].args.addFundRuleProposalManager);
  const deactivateFundRuleProposalManager = await DeactivateFundRuleProposalManager.at(
    res.logs[0].args.deactivateFundRuleProposalManager
  );

  // >>> Step #7
  res = await factory.buildSeventhStep(fundId, { from: creator });
  // console.log('buildSeventhStep gasUsed', res.receipt.gasUsed);

  const changeMultiSigOwnersProposalManager = await ChangeMultiSigOwnersProposalManager.at(
    res.logs[0].args.changeMultiSigOwnersProposalManager
  );
  const modifyFeeProposalManager = await ModifyFeeProposalManager.at(res.logs[0].args.modifyFeeProposalManager);

  // >>> Step #8
  res = await factory.buildEighthStep(fundId, { from: creator });
  // console.log('buildEighthStep gasUsed', res.receipt.gasUsed);
  const modifyMultiSigManagerDetailsProposalManager = await ModifyMultiSigManagerDetailsProposalManager.at(
    res.logs[0].args.modifyMultiSigManagerDetailsProposalManager
  );

  return {
    fundStorage,
    fundMultiSig,
    fundRsra,
    fundController,
    modifyConfigProposalManager,
    fineMemberProposalManager,
    whiteListProposalManager,
    expelMemberProposalManager,
    newMemberProposalManager,
    changeNameAndDescriptionProposalManager,
    addFundRuleProposalManager,
    deactivateFundRuleProposalManager,
    changeMultiSigOwnersProposalManager,
    modifyFeeProposalManager,
    modifyMultiSigManagerDetailsProposalManager
  };
}

module.exports = {
  deployFundFactory,
  buildFund
};
