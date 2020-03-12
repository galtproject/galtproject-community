const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const GaltToken = contract.fromArtifact('GaltToken');
const MockBar = contract.fromArtifact('MockBar');
const MultiSigManagedPrivateFundFactory = contract.fromArtifact('MultiSigManagedPrivateFundFactory');
const PPGlobalRegistry = contract.fromArtifact('PPGlobalRegistry');
const PrivateFundFactory = contract.fromArtifact('PrivateFundFactory');

const { deployFundFactory, buildPrivateFund, VotingConfig, CustomVotingConfig } = require('./deploymentHelpers');
const { ether, initHelperWeb3, fundStorageAddressCode, fundUpgraderAddressCode } = require('./helpers');

initHelperWeb3(web3);

MockBar.numberFormat = 'String';

describe('MultiSig Managed Private Fund Factory', () => {
  const [
    alice,
    bob,
    charlie,
    raFactory,
    multiSigFactory,
    storageFactory,
    controllerFactory,
    proposalManagerFactory,
    registryFactory,
    aclFactory,
    upgraderFactory,

    raFactory2,
    multiSigFactory2,
    storageFactory2,
    controllerFactory2,
    proposalManagerFactory2,
    registryFactory2,
    aclFactory2,
    upgraderFactory2
  ] = accounts;
  const coreTeam = defaultSender;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.ppgr = await PPGlobalRegistry.new();

    await this.ppgr.initialize();

    await this.ppgr.setContract(await this.ppgr.PPGR_GALT_TOKEN(), this.galtToken.address);

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });
  });

  describe('markers', async function() {
    beforeEach(async function() {
      this.fundFactory = await deployFundFactory(PrivateFundFactory, this.ppgr.address, alice, true, ether(10), ether(20));
      await this.fundFactory.setDefaultConfigValues(
        [fundStorageAddressCode, alice, fundUpgraderAddressCode],
        ['0x72483bf9', '0x3f554115', '0x8d996c0d'],
        [ether(20), ether(30), ether(20)],
        [ether(10), ether(20), ether(10)],
        [VotingConfig.ONE_WEEK, VotingConfig.ONE_WEEK, VotingConfig.ONE_WEEK],
        { from: alice }
      );
    });

    it('should use default markers without 3rd step', async function() {
      // build fund
      await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
      const fund = await buildPrivateFund(
        this.fundFactory,
        alice,
        false,
        new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK),
        {},
        [bob, charlie],
        2
      );

      const fundStorageX = fund.fundStorage;
      const fundControllerX = fund.fundController;
      const fundUpgraderX = fund.fundUpgrader;

      let res = await fundStorageX.customVotingConfigs(
        await fundStorageX.getThresholdMarker(fundStorageX.address, '0x72483bf9')
      );
      assert.equal(res.support, ether(20));
      assert.equal(res.minAcceptQuorum, ether(10));
      assert.equal(res.timeout, VotingConfig.ONE_WEEK);

      res = await fundStorageX.customVotingConfigs(await fundStorageX.getThresholdMarker(alice, '0x3f554115'));
      assert.equal(res.support, ether(30));
      assert.equal(res.minAcceptQuorum, ether(20));
      assert.equal(res.timeout, VotingConfig.ONE_WEEK);

      res = await fundStorageX.customVotingConfigs(
        await fundStorageX.getThresholdMarker(fundUpgraderX.address, '0x8d996c0d')
      );
      assert.equal(res.support, ether(20));
      assert.equal(res.minAcceptQuorum, ether(10));
      assert.equal(res.timeout, VotingConfig.ONE_WEEK);

      res = await fundStorageX.customVotingConfigs(
        await fundStorageX.getThresholdMarker(fundControllerX.address, '0x8d996c0d')
      );
      assert.equal(res.support, 0);
      assert.equal(res.minAcceptQuorum, 0);
      assert.equal(res.timeout, 0);
    });

    it('should use custom markers with 3rd step', async function() {
      // build fund
      await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
      const fund = await buildPrivateFund(
        this.fundFactory,
        alice,
        false,
        new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK),
        [
          // fundStorage.setPeriodLimit()
          new CustomVotingConfig('fundStorage', '0x8d996c0d', ether(50), ether(30), VotingConfig.ONE_WEEK)
        ],
        [bob, charlie],
        2
      );

      const fundStorageX = fund.fundStorage;
      const fundControllerX = fund.fundController;

      let res = await fundStorageX.customVotingConfigs(
        await fundStorageX.getThresholdMarker(fundStorageX.address, '0x8d996c0d')
      );
      assert.equal(res.support, ether(50));
      assert.equal(res.minAcceptQuorum, ether(30));
      assert.equal(res.timeout, VotingConfig.ONE_WEEK);

      res = await fundStorageX.customVotingConfigs(await fundStorageX.getThresholdMarker(alice, '0x3f554115'));
      assert.equal(res.support, 0);
      assert.equal(res.minAcceptQuorum, 0);
      assert.equal(res.timeout, 0);

      res = await fundStorageX.customVotingConfigs(
        await fundStorageX.getThresholdMarker(fundControllerX.address, '0x8d996c0d')
      );
      assert.equal(res.support, 0);
      assert.equal(res.minAcceptQuorum, 0);
      assert.equal(res.timeout, 0);
    });
  });
});
