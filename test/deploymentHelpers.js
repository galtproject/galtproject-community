// const PrivateFundFactory = artifacts.require('./PrivateFundFactory.sol');
// const PrivateFundStorageFactory = artifacts.require('./PrivateFundStorageFactory.sol');
// const MockPrivateFundRAFactory = artifacts.require('./MockPrivateFundRAFactory.sol');
// const PrivateFundStorage = artifacts.require('./PrivateFundStorage.sol');
// const PrivateFundController = artifacts.require('./PrivateFundController.sol');
// const PrivateFundControllerFactory = artifacts.require('./PrivateFundControllerFactory.sol');
// const MockPrivateFundRA = artifacts.require('./MockPrivateFundRA.sol');
const OwnedUpgradeabilityProxy = artifacts.require('./OwnedUpgradeabilityProxy.sol');
const FundRegistryFactory = artifacts.require('./FundRegistryFactory.sol');
const FundACLFactory = artifacts.require('./FundACLFactory.sol');
const FundFactory = artifacts.require('./FundFactory.sol');
const FundStorageFactory = artifacts.require('./FundStorageFactory.sol');
const FundMultiSigFactory = artifacts.require('./FundMultiSigFactory.sol');
const FundControllerFactory = artifacts.require('./FundControllerFactory.sol');
const MockFundRAFactory = artifacts.require('./MockFundRAFactory.sol');
const FundProposalManagerFactory = artifacts.require('./FundProposalManagerFactory.sol');
const FundUpgraderFactory = artifacts.require('./FundUpgraderFactory.sol');

const FundACL = artifacts.require('./FundACL.sol');
const FundRegistry = artifacts.require('./FundRegistry.sol');
const FundStorage = artifacts.require('./FundStorage.sol');
const FundController = artifacts.require('./FundController.sol');
const FundMultiSig = artifacts.require('./FundMultiSig.sol');
const MockFundRA = artifacts.require('./MockFundRA.sol');
const FundProposalManager = artifacts.require('./FundProposalManager.sol');
const FundUpgrader = artifacts.require('./FundUpgrader.sol');

const { initHelperWeb3, getMethodSignature, hex, getEventArg } = require('./helpers');

initHelperWeb3(FundProposalManager.web3);

MockFundRA.numberFormat = 'String';
// MockPrivateFundRA.numberFormat = 'String';
// PrivateFundStorage.numberFormat = 'String';
FundProposalManager.numberFormat = 'String';
FundStorage.numberFormat = 'String';
FundMultiSig.numberFormat = 'String';

// 60 * 60 * 24 * 30
const ONE_MONTH = 2592000;

async function deployFundFactory(globalRegistry, owner, privateProperty = false, ...ppArguments) {
  let fundFactory;

  if (privateProperty) {
    // this.fundRAFactory = await MockPrivateFundRAFactory.new();
    // this.fundStorageFactory = await PrivateFundStorageFactory.new();
    // this.fundMultiSigFactory = await FundMultiSigFactory.new();
    // this.fundControllerFactory = await PrivateFundControllerFactory.new();
    // this.fundProposalManagerFactory = await FundProposalManagerFactory.new();
    // fundFactory = await PrivateFundFactory.new(
    //   globalRegistry,
    //   this.fundRAFactory.address,
    //   this.fundMultiSigFactory.address,
    //   this.fundStorageFactory.address,
    //   this.fundControllerFactory.address,
    //   this.fundProposalManagerFactory.address,
    //   ...ppArguments,
    //   { from: owner, gas: 9000000 }
    // );
  } else {
    this.fundRegistryFactory = await FundRegistryFactory.new();
    this.fundACLFactory = await FundACLFactory.new();
    this.fundRAFactory = await MockFundRAFactory.new();
    this.fundStorageFactory = await FundStorageFactory.new();
    this.fundMultiSigFactory = await FundMultiSigFactory.new();
    this.fundControllerFactory = await FundControllerFactory.new();
    this.fundProposalManagerFactory = await FundProposalManagerFactory.new();
    this.fundUpgraderFactory = await FundUpgraderFactory.new();
    fundFactory = await FundFactory.new(
      globalRegistry,
      this.fundRAFactory.address,
      this.fundMultiSigFactory.address,
      this.fundStorageFactory.address,
      this.fundControllerFactory.address,
      this.fundProposalManagerFactory.address,
      this.fundRegistryFactory.address,
      this.fundACLFactory.address,
      this.fundUpgraderFactory.address,
      { from: owner }
    );
  }

  const markersSignatures = [];
  const markersNames = [];
  getBaseFundStorageMarkersNames().forEach(fullMethodName => {
    const contractName = fullMethodName.split('.')[0];
    const methodName = fullMethodName.split('.')[1];
    let contract;
    if (contractName === 'storage') {
      contract = FundStorage;
    } else if (contractName === 'multiSig') {
      contract = FundMultiSig;
    }
    markersNames.push(hex(`${fullMethodName}`));
    markersSignatures.push(getMethodSignature(contract._json.abi, methodName));
  });

  await fundFactory.initialize(markersSignatures, markersNames, { from: owner });

  return fundFactory;
}

function getBaseFundStorageMarkersNames() {
  return [
    'storage.addProposalMarker',
    'storage.removeProposalMarker',
    'storage.replaceProposalMarker',
    'storage.addFundRule',
    'storage.disableFundRule',
    'storage.addFeeContract',
    'storage.removeFeeContract',
    'storage.setMemberIdentification',
    'storage.setNameAndDataLink',
    'storage.setPeriodLimit',
    'storage.setProposalConfig',
    'storage.setConfigValue',
    'multiSig.setOwners'
  ];
}

/**
 * Performs all required steps to build a new fund
 *
 * @param {FundMultiSigFactory} factory
 * @param {boolean} isPrivate
 * @param {VotingConfig} defaultVotingConfig
 * @param {VotingConfig[]} customVotingConfigs
 * @param {Array<string>} initialMultiSigOwners
 * @param {number} initialMultiSigRequired
 * @param {number} periodLength
 * @param {string} name
 * @param {string} dataLink
 * @param {Array<string>} initialSpaceTokens
 * @param {string} creator
 * @param {number} value
 * @returns {Promise<{}>}
 */
async function buildFund(
  factory,
  creator,
  isPrivate,
  defaultVotingConfig,
  customVotingConfigs,
  initialMultiSigOwners,
  initialMultiSigRequired,
  periodLength = ONE_MONTH,
  name = 'foo',
  dataLink = 'bar',
  initialSpaceTokens = [],
  value = 0
) {
  // >>> Step #1
  let res = await factory.buildFirstStep(
    creator,
    isPrivate,
    defaultVotingConfig.support,
    defaultVotingConfig.quorum,
    defaultVotingConfig.timeout,
    periodLength,
    {
      from: creator,
      gas: 9000000,
      value
    }
  );
  // console.log('buildFirstStep gasUsed', res.receipt.gasUsed);
  const fundId = getEventArg(res, 'CreateFundFirstStep', 'fundId');
  const fundStorage = await FundStorage.at(getEventArg(res, 'CreateFundFirstStep', 'fundStorage'));
  const fundRegistry = await FundRegistry.at(getEventArg(res, 'CreateFundFirstStep', 'fundRegistry'));
  const fundACL = await FundACL.at(getEventArg(res, 'CreateFundFirstStep', 'fundACL'));

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

  const keys = Object.keys(customVotingConfigs);
  let markers = [];
  let signatures = [];
  const supports = [];
  const quorums = [];
  const timeouts = [];

  signatures = keys.map(k => fundStorage[`${k}_SIGNATURE`]());
  signatures = await Promise.all(signatures);

  for (let i = 0; i < keys.length; i++) {
    const val = customVotingConfigs[keys[i]];
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
    supports.push(customVotingConfigs[keys[i]][contract].support);
    quorums.push(customVotingConfigs[keys[i]][contract].quorum);
    timeouts.push(customVotingConfigs[keys[i]][contract].timeout);
  }

  markers = await Promise.all(markers);

  // >>> Step #4
  res = await factory.buildFourthStep(fundId, markers, supports, quorums, timeouts, { from: creator });
  // console.log('buildFourthStep gasUsed', res.receipt.gasUsed);

  res = await factory.buildFourthStepDone(fundId, name, dataLink, { from: creator });
  // console.log('buildFourthStepDone gasUsed', res.receipt.gasUsed);

  // >>> Step #5
  res = await factory.buildFifthStep(fundId, initialSpaceTokens, { from: creator });
  // console.log('buildFifthStep gasUsed', res.receipt.gasUsed);

  return {
    fundRegistry,
    fundACL,
    fundStorage,
    fundMultiSig,
    fundRA,
    fundController,
    fundProposalManager
  };
}

/**
 * Performs all required steps to build a new fund
 *
 * @param {FundMultiSigFactory} factory
 * @param {boolean} isPrivate
 * @param {VotingConfig} defaultVotingConfig
 * @param {VotingConfig[]} customVotingConfigs
 * @param {Array<string>} initialMultiSigOwners
 * @param {number} initialMultiSigRequired
 * @param {number} periodLength
 * @param {string} name
 * @param {string} dataLink
 * @param {Array<string>} initialTokens
 * @param {string} creator
 * @param initialRegistries
 * @param {number} value
 * @returns {Promise<{}>}
 */
async function buildPrivateFund(
  factory,
  creator,
  isPrivate,
  defaultVotingConfig,
  customVotingConfigs,
  initialMultiSigOwners,
  initialMultiSigRequired,
  periodLength = ONE_MONTH,
  name = 'foo',
  dataLink = 'bar',
  initialTokens = [],
  initialRegistries = [],
  value = 0
) {
  // >>> Step #1
  let res = await factory.buildFirstStep(
    creator,
    isPrivate,
    defaultVotingConfig.support,
    defaultVotingConfig.quorum,
    defaultVotingConfig.timeout,
    periodLength,
    {
      from: creator,
      value
    }
  );
  // console.log('buildFirstStep gasUsed', res.receipt.gasUsed);
  const fundId = await res.logs[0].args.fundId;
  const fundStorage = await PrivateFundStorage.at(res.logs[0].args.fundStorage);

  // >>> Step #2
  res = await factory.buildSecondStep(fundId, initialMultiSigOwners, initialMultiSigRequired, { from: creator });
  // console.log('buildSecondStep gasUsed', res.receipt.gasUsed);
  const fundController = await PrivateFundController.at(res.logs[0].args.fundController);
  const fundMultiSig = await FundMultiSig.at(res.logs[0].args.fundMultiSig);

  // >>> Step #3
  res = await factory.buildThirdStep(fundId, { from: creator });
  // console.log('buildThirdStep gasUsed', res.receipt.gasUsed);
  const fundRA = await MockPrivateFundRA.at(res.logs[0].args.fundRA);
  const fundProposalManager = await FundProposalManager.at(res.logs[0].args.fundProposalManager);

  const keys = Object.keys(customVotingConfigs);
  let markers = [];
  let signatures = [];
  const supports = [];
  const quorums = [];
  const timeouts = [];

  signatures = keys.map(k => fundStorage[`${k}_SIGNATURE`]());
  signatures = await Promise.all(signatures);

  for (let i = 0; i < keys.length; i++) {
    const val = customVotingConfigs[keys[i]];
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
    supports.push(customVotingConfigs[keys[i]][contract].support);
    quorums.push(customVotingConfigs[keys[i]][contract].quorum);
    timeouts.push(customVotingConfigs[keys[i]][contract].timeout);
  }

  markers = await Promise.all(markers);

  // >>> Step #4
  res = await factory.buildFourthStep(fundId, markers, supports, quorums, timeouts, { from: creator });
  // console.log('buildFourthStep gasUsed', res.receipt.gasUsed);

  res = await factory.buildFourthStepDone(fundId, name, dataLink, { from: creator });
  // console.log('buildFourthStepDone gasUsed', res.receipt.gasUsed);

  // >>> Step #5
  res = await factory.buildFifthStep(fundId, initialRegistries, initialTokens, { from: creator });
  // console.log('buildFifthStep gasUsed', res.receipt.gasUsed);

  return {
    fundStorage,
    fundMultiSig,
    fundRA,
    fundController,
    fundProposalManager
  };
}

function VotingConfig(support, quorum, timeout) {
  this.support = support;
  this.quorum = quorum;
  this.timeout = timeout;
}

VotingConfig.ONE_WEEK = 60 * 60 * 24 * 7;

module.exports = {
  deployFundFactory,
  buildFund,
  buildPrivateFund,
  getBaseFundStorageMarkersNames,
  VotingConfig
};
