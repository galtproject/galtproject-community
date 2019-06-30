const FundFactory = artifacts.require('./FundFactory.sol');
const FundStorageFactory = artifacts.require('./FundStorageFactory.sol');
const FundMultiSigFactory = artifacts.require('./FundMultiSigFactory.sol');
const FundControllerFactory = artifacts.require('./FundControllerFactory.sol');
const MockFundRAFactory = artifacts.require('./MockFundRAFactory.sol');
const FundProposalManagerFactory = artifacts.require('./FundProposalManagerFactory.sol');

const FundStorage = artifacts.require('./FundStorage.sol');
const FundController = artifacts.require('./FundController.sol');
const FundMultiSig = artifacts.require('./FundMultiSig.sol');
const MockFundRA = artifacts.require('./MockFundRA.sol');
const FundProposalManager = artifacts.require('./FundProposalManager.sol');

MockFundRA.numberFormat = 'String';
FundProposalManager.numberFormat = 'String';
FundStorage.numberFormat = 'String';

// 60 * 60 * 24 * 30
const ONE_MONTH = 2592000;

async function deployFundFactory(ggrAddress, owner) {
  this.fundRAFactory = await MockFundRAFactory.new();
  this.fundStorageFactory = await FundStorageFactory.new();
  this.fundMultiSigFactory = await FundMultiSigFactory.new();
  this.fundControllerFactory = await FundControllerFactory.new();
  this.fundProposalManagerFactory = await FundProposalManagerFactory.new();

  const fundFactory = await FundFactory.new(
    ggrAddress,
    this.fundRAFactory.address,
    this.fundMultiSigFactory.address,
    this.fundStorageFactory.address,
    this.fundControllerFactory.address,
    this.fundProposalManagerFactory.address,
    { from: owner }
  );

  return fundFactory;
}

/**
 * Performs all required steps to build a new fund
 *
 * @param {FundMultiSigFactory} factory
 * @param {boolean} isPrivate
 * @param {number} defaultThreshold
 * @param {Object} customThresholds
 * @param {Array<string>} initialMultiSigOwners
 * @param {number} initialMultiSigRequired
 * @param {number} periodLength
 * @param {string} name
 * @param {string} description
 * @param {Array<string>} initialSpaceTokens
 * @param {string} creator
 * @param {number} value
 * @returns {Promise<{}>}
 */
async function buildFund(
  factory,
  creator,
  isPrivate,
  defaultThreshold,
  customThresholds,
  initialMultiSigOwners,
  initialMultiSigRequired,
  periodLength = ONE_MONTH,
  name = 'foo',
  description = 'bar',
  initialSpaceTokens = [],
  value = 0
) {
  // >>> Step #1
  let res = await factory.buildFirstStep(creator, isPrivate, defaultThreshold, periodLength, {
    from: creator,
    value
  });
  // console.log('buildFirstStep gasUsed', res.receipt.gasUsed);
  const fundId = await res.logs[0].args.fundId;
  const fundStorage = await FundStorage.at(res.logs[0].args.fundStorage);

  // >>> Step #2
  res = await factory.buildSecondStep(fundId, initialMultiSigOwners, initialMultiSigRequired, { from: creator });
  // console.log('buildSecondStep gasUsed', res.receipt.gasUsed);
  const fundController = await FundController.at(res.logs[0].args.fundController);
  const fundMultiSig = await FundMultiSig.at(res.logs[0].args.fundMultiSig);

  // >>> Step #3
  res = await factory.buildThirdStep(fundId, { from: creator });
  // console.log('buildThirdStep gasUsed', res.receipt.gasUsed);
  const fundRA = await MockFundRA.at(res.logs[0].args.fundRA);
  const fundProposalManager = await FundProposalManager.at(res.logs[0].args.fundProposalManager);

  const keys = Object.keys(customThresholds);
  let markers = [];
  let signatures = [];
  const values = [];

  signatures = keys.map(k => fundStorage[`${k}_SIGNATURE`]());
  signatures = await Promise.all(signatures);

  for (let i = 0; i < keys.length; i++) {
    const val = customThresholds[keys[i]];
    const localKeys = Object.keys(val);
    assert(localKeys.length === 1, 'Invalid threshold keys length');
    const contract = localKeys[0];
    let marker;

    switch (contract) {
      case 'fundStorage':
        marker = fundStorage.getThresholdMarker(fundStorage.address, signatures[i]);
        break;
      case 'fundMultiSig':
        marker = fundStorage.getThresholdMarker(fundMultiSig.address, signatures[i]);
        break;
      case 'fundController':
        marker = fundStorage.getThresholdMarker(fundController.address, signatures[i]);
        break;
      case 'fundRA':
        marker = fundStorage.getThresholdMarker(fundRA.address, signatures[i]);
        break;
      default:
        marker = fundStorage.getThresholdMarker(contract, signatures[i]);
        break;
    }

    markers.push(marker);
    values.push(customThresholds[keys[i]][contract]);
  }

  markers = await Promise.all(markers);

  // >>> Step #4
  res = await factory.buildFourthStep(fundId, markers, values, { from: creator });

  await factory.buildFourthStepDone(fundId, name, description, { from: creator });

  // >>> Step #5
  await factory.buildFifthStep(fundId, initialSpaceTokens, { from: creator });

  return {
    fundStorage,
    fundMultiSig,
    fundRA,
    fundController,
    fundProposalManager
  };
}

module.exports = {
  deployFundFactory,
  buildFund
};
