const { contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const PrivateFundStorageFactory = contract.fromArtifact('PrivateFundStorageFactory');
const PrivateFundStorage = contract.fromArtifact('PrivateFundStorage');
const PrivateFundController = contract.fromArtifact('PrivateFundController');
const MockPrivateFundRA = contract.fromArtifact('MockPrivateFundRA');
const FundBareFactory = contract.fromArtifact('FundBareFactory');
const FundStorageFactory = contract.fromArtifact('FundStorageFactory');

const FundACL = contract.fromArtifact('FundACL');
const FundRegistry = contract.fromArtifact('FundRegistry');
const FundStorage = contract.fromArtifact('FundStorage');
const FundController = contract.fromArtifact('FundController');
const FundMultiSig = contract.fromArtifact('FundMultiSig');
const MockFundRA = contract.fromArtifact('MockFundRA');
const FundProposalManager = contract.fromArtifact('FundProposalManager');
const FundRuleRegistryV1 = contract.fromArtifact('FundRuleRegistryV1');
const OwnedUpgradeabilityProxyFactory = contract.fromArtifact('OwnedUpgradeabilityProxyFactory');
const FundUpgrader = contract.fromArtifact('FundUpgrader');
const PrivateFundFactoryLib = contract.fromArtifact('PrivateFundFactoryLib');

const { initHelperWeb3, getMethodSignature, hex, getEventArg, addressOne } = require('./helpers');

initHelperWeb3(web3);

MockFundRA.numberFormat = 'String';
FundProposalManager.numberFormat = 'String';
FundUpgrader.numberFormat = 'String';
FundStorage.numberFormat = 'String';
PrivateFundStorage.numberFormat = 'String';
FundMultiSig.numberFormat = 'String';
FundRuleRegistryV1.numberFormat = 'String';

// 60 * 60 * 24 * 30
const ONE_MONTH = 2592000;

async function deployFundFactory(FundFactory, globalRegistry, owner, privateProperty = false, ...ppArguments) {
  let fundFactory;

  // deploy contracts
  const fundRegistry = await FundRegistry.new();
  const fundACL = await FundACL.new();
  const fundRuleRegistry = await FundRuleRegistryV1.new();

  // TODO: transfer owned contracts ownership to the 0x0 address

  // deploy proxied contract factories
  this.ownedUpgradeabilityProxyFactory = await OwnedUpgradeabilityProxyFactory.new();
  const proxyFactory = this.ownedUpgradeabilityProxyFactory.address;

  this.fundRegistryFactory = await FundBareFactory.new(proxyFactory, fundRegistry.address);
  this.fundACLFactory = await FundBareFactory.new(proxyFactory, fundACL.address);
  this.fundRuleRegistryFactory = await FundBareFactory.new(proxyFactory, fundRuleRegistry.address);

  if (privateProperty) {
    const fundRA = await MockPrivateFundRA.new();
    const fundController = await PrivateFundController.new();
    const fundProposalManager = await FundProposalManager.new();
    const fundUpgrader = await FundUpgrader.new();
    const fundStorage = await PrivateFundStorage.new();
    const fundMultiSig = await FundMultiSig.new([addressOne]);
    const privateFundFactoryLib = await PrivateFundFactoryLib.new();

    this.fundRAFactory = await FundBareFactory.new(proxyFactory, fundRA.address);
    this.fundStorageFactory = await PrivateFundStorageFactory.new(proxyFactory, fundStorage.address);
    this.fundMultiSigFactory = await FundBareFactory.new(proxyFactory, fundMultiSig.address);
    this.fundControllerFactory = await FundBareFactory.new(proxyFactory, fundController.address);
    this.fundProposalManagerFactory = await FundBareFactory.new(proxyFactory, fundProposalManager.address);
    this.fundUpgraderFactory = await FundBareFactory.new(proxyFactory, fundUpgrader.address);

    await FundFactory.detectNetwork();
    FundFactory.link('PrivateFundFactoryLib', privateFundFactoryLib.address);

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
      this.fundRuleRegistryFactory.address,
      ...ppArguments,
      { from: owner, gas: 9800000 }
    );
  } else {
    const fundRA = await MockFundRA.new();
    const fundController = await FundController.new();
    const fundProposalManager = await FundProposalManager.new();
    const fundUpgrader = await FundUpgrader.new();
    const fundStorage = await FundStorage.new();
    const fundMultiSig = await FundMultiSig.new([addressOne]);

    this.fundRAFactory = await FundBareFactory.new(proxyFactory, fundRA.address);
    this.fundStorageFactory = await FundStorageFactory.new(proxyFactory, fundStorage.address);
    this.fundMultiSigFactory = await FundBareFactory.new(proxyFactory, fundMultiSig.address);
    this.fundControllerFactory = await FundBareFactory.new(proxyFactory, fundController.address);
    this.fundProposalManagerFactory = await FundBareFactory.new(proxyFactory, fundProposalManager.address);
    this.fundUpgraderFactory = await FundBareFactory.new(proxyFactory, fundUpgrader.address);

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
      this.fundRuleRegistryFactory.address,
      { from: owner }
    );
  }

  const markersSignatures = [];
  const markersNames = [];
  getBaseFundStorageMarkersNames().forEach(fullMethodName => {
    // noinspection TypeScriptValidateTypes
    const contractName = fullMethodName.split('.')[0];
    // noinspection TypeScriptValidateTypes
    const methodName = fullMethodName.split('.')[1];
    let chosenContract;
    if (contractName === 'storage') {
      chosenContract = FundStorage;
    } else if (contractName === 'multiSig') {
      chosenContract = FundMultiSig;
    } else if (contractName === 'ruleRegistry') {
      chosenContract = FundRuleRegistryV1;
    } else if (contractName === 'voting') {
      chosenContract = FundProposalManager;
    }
    markersNames.push(hex(`${fullMethodName}`));
    markersSignatures.push(getMethodSignature(chosenContract._json.abi, methodName));
  });

  await fundFactory.initialize(markersSignatures, markersNames, { from: owner });

  return fundFactory;
}

function getBaseFundStorageMarkersNames() {
  return [
    'storage.addProposalMarker',
    'storage.removeProposalMarker',
    'storage.replaceProposalMarker',
    'ruleRegistry.addRuleType1',
    'ruleRegistry.addRuleType2',
    'ruleRegistry.addRuleType3',
    'ruleRegistry.addRuleType4',
    'ruleRegistry.disableRuleType1',
    'ruleRegistry.disableRuleType2',
    'ruleRegistry.disableRuleType3',
    'ruleRegistry.disableRuleType4',
    'storage.addFeeContract',
    'storage.removeFeeContract',
    'storage.setMemberIdentification',
    'storage.setNameAndDataLink',
    'storage.setPeriodLimit',
    'voting.setProposalConfig',
    'voting.setDefaultProposalConfig',
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
  let res = await factory.buildFirstStep(creator, isPrivate, periodLength, {
    from: creator,
    gas: 9000000,
    value
  });
  // console.log('buildFirstStep gasUsed', res.receipt.gasUsed);
  const fundId = getEventArg(res, 'CreateFundFirstStep', 'fundId');
  const fundStorage = await FundStorage.at(getEventArg(res, 'CreateFundFirstStep', 'fundStorage'));
  const fundRegistry = await FundRegistry.at(getEventArg(res, 'CreateFundFirstStep', 'fundRegistry'));
  const fundACL = await FundACL.at(getEventArg(res, 'CreateFundFirstStep', 'fundACL'));

  // >>> Step #2
  res = await factory.buildSecondStep(fundId, initialMultiSigOwners, initialMultiSigRequired, { from: creator });
  // console.log('buildSecondStep gasUsed', res.receipt.gasUsed);
  const fundController = await FundController.at(getEventArg(res, 'CreateFundSecondStep', 'fundController'));
  const fundMultiSig = await FundMultiSig.at(getEventArg(res, 'CreateFundSecondStep', 'fundMultiSig'));
  const fundUpgrader = await FundUpgrader.at(getEventArg(res, 'CreateFundSecondStep', 'fundUpgrader'));
  const fundRuleRegistry = await FundRuleRegistryV1.at(getEventArg(res, 'CreateFundSecondStep', 'fundRuleRegistry'));

  // >>> Step #3
  res = await factory.buildThirdStep(
    fundId,
    defaultVotingConfig.support,
    defaultVotingConfig.quorum,
    defaultVotingConfig.timeout,
    { from: creator }
  );
  // console.log('buildThirdStep gasUsed', res.receipt.gasUsed);
  const fundRA = await MockFundRA.at(getEventArg(res, 'CreateFundThirdStep', 'fundRA'));
  const fundProposalManager = await FundProposalManager.at(
    getEventArg(res, 'CreateFundThirdStep', 'fundProposalManager')
  );

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
    const contractName = localKeys[0];
    let marker;

    switch (contractName) {
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
        marker = fundStorage.getThresholdMarker(contractName, signatures[i]);
        break;
    }

    markers.push(marker);
    supports.push(customVotingConfigs[keys[i]][contractName].support);
    quorums.push(customVotingConfigs[keys[i]][contractName].quorum);
    timeouts.push(customVotingConfigs[keys[i]][contractName].timeout);
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
    fundUpgrader,
    fundProposalManager,
    fundRuleRegistry
  };
}

/**
 * Performs all required steps to build a new fund
 *
 * @param {FundMultiSigFactory} factory
 * @param {boolean} isPrivate
 * @param {VotingConfig} defaultVotingConfig
 * @param {CustomVotingConfig[]} customVotingConfigs
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
  const finishOn2ndStep = Object.keys(customVotingConfigs).length === 0;

  // >>> Step #1
  let res = await factory.buildFirstStep(
    creator,
    isPrivate,
    defaultVotingConfig.support,
    defaultVotingConfig.quorum,
    defaultVotingConfig.timeout,
    periodLength,
    initialMultiSigOwners,
    initialMultiSigRequired,
    {
      from: creator,
      gas: 9000000,
      value
    }
  );
  // console.log('buildFirstStep gasUsed', res.receipt.gasUsed);
  const fundId = getEventArg(res, 'CreateFundFirstStep', 'fundId');
  const fundStorage = await PrivateFundStorage.at(getEventArg(res, 'CreateFundFirstStep', 'fundStorage'));
  const fundRegistry = await FundRegistry.at(getEventArg(res, 'CreateFundFirstStep', 'fundRegistry'));
  const fundACL = await FundACL.at(getEventArg(res, 'CreateFundFirstStep', 'fundACL'));
  const fundController = await PrivateFundController.at(getEventArg(res, 'CreateFundFirstStep', 'fundController'));
  const fundMultiSig = await FundMultiSig.at(getEventArg(res, 'CreateFundFirstStep', 'fundMultiSig'));
  const fundUpgrader = await FundUpgrader.at(getEventArg(res, 'CreateFundFirstStep', 'fundUpgrader'));
  const fundRA = await MockPrivateFundRA.at(getEventArg(res, 'CreateFundFirstStep', 'fundRA'));
  const fundRuleRegistry = await FundRuleRegistryV1.at(getEventArg(res, 'CreateFundFirstStep', 'fundRuleRegistry'));
  const fundProposalManager = await FundProposalManager.at(
    getEventArg(res, 'CreateFundFirstStep', 'fundProposalManager')
  );

  // >>> Step #2
  res = await factory.buildSecondStep(fundId, finishOn2ndStep, name, dataLink, initialRegistries, initialTokens, {
    from: creator,
    gas: 9500000
  });
  // console.log('buildSecondStep gasUsed', res.receipt.gasUsed);

  const keys = Object.keys(customVotingConfigs);
  let markers = [];
  const supports = [];
  const quorums = [];
  const timeouts = [];

  // We don't know the fund contract addresses in advance to generate a marker,
  // so a contract name should be used instead
  for (let i = 0; i < keys.length; i++) {
    const config = customVotingConfigs[keys[i]];
    assert(config instanceof CustomVotingConfig, 'Invalid threshold keys length');
    const contractName = config.contractAddress;
    let marker;

    switch (contractName) {
      case 'fundStorage':
        marker = fundStorage.getThresholdMarker(fundStorage.address, config.methodSignature);
        break;
      case 'fundMultiSig':
        marker = fundStorage.getThresholdMarker(fundMultiSig.address, config.methodSignature);
        break;
      case 'fundController':
        marker = fundStorage.getThresholdMarker(fundController.address, config.methodSignature);
        break;
      case 'fundRA':
        marker = fundStorage.getThresholdMarker(fundRA.address, config.methodSignature);
        break;
      case 'fundRuleRegistry':
        marker = fundStorage.getThresholdMarker(fundRuleRegistry.address, config.methodSignature);
        break;
      default:
        marker = fundStorage.getThresholdMarker(contractName, config.methodSignature);
        break;
    }

    markers.push(marker);
    supports.push(config.support);
    quorums.push(config.quorum);
    timeouts.push(config.timeout);
  }

  markers = await Promise.all(markers);

  if (!finishOn2ndStep) {
    // >>> Step #3
    res = await factory.buildThirdStep(fundId, markers, supports, quorums, timeouts, { from: creator });
    // console.log('buildThirdStep gasUsed', res.receipt.gasUsed);
  }

  // assert DONE
  assert.equal(await factory.getCurrentStep(fundId), 3);

  return {
    fundRegistry,
    fundACL,
    fundStorage,
    fundMultiSig,
    fundRA,
    fundController,
    fundUpgrader,
    fundProposalManager,
    fundRuleRegistry
  };
}

function VotingConfig(support, quorum, timeout) {
  this.support = support;
  this.quorum = quorum;
  this.timeout = timeout;
}

function CustomVotingConfig(contractAddress, methodSignature, support, quorum, timeout) {
  this.contractAddress = contractAddress;
  this.methodSignature = methodSignature;
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
  VotingConfig,
  CustomVotingConfig
};
