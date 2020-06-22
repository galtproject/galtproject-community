const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const SpaceToken = contract.fromArtifact('SpaceToken');
const GaltToken = contract.fromArtifact('GaltToken');
const MockSpaceGeoDataRegistry = contract.fromArtifact('MockSpaceGeoDataRegistry');
const GaltGlobalRegistry = contract.fromArtifact('GaltGlobalRegistry');
const FeeRegistry = contract.fromArtifact('FeeRegistry');
const ACL = contract.fromArtifact('ACL');
const FundFactory = contract.fromArtifact('FundFactory');

const { deployFundFactory, buildFund, VotingConfig } = require('./deploymentHelpers');
const { ether, assertRevert, initHelperWeb3, assertEthBalanceChanged, assertGaltBalanceChanged } = require('./helpers');

const { utf8ToHex } = web3.utils;
const bytes32 = utf8ToHex;

GaltToken.numberFormat = 'String';

initHelperWeb3(web3);

describe('FundFactory', () => {
  const [alice, bob, charlie, feeCollector] = accounts;
  const coreTeam = defaultSender;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.acl = await ACL.new({ from: coreTeam });
    this.spaceGeoDataRegistry = await MockSpaceGeoDataRegistry.new({ from: coreTeam });
    this.spaceToken = await SpaceToken.new(this.ggr.address, 'Name', 'Symbol', { from: coreTeam });
    this.feeRegistry = await FeeRegistry.new({ from: coreTeam });

    await this.ggr.initialize();
    await this.acl.initialize();
    await this.feeRegistry.initialize();

    await this.ggr.setContract(await this.ggr.ACL(), this.acl.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.FEE_REGISTRY(), this.feeRegistry.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.SPACE_TOKEN(), this.spaceToken.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.GALT_TOKEN(), this.galtToken.address, { from: coreTeam });

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });
    await this.galtToken.mint(bob, ether(10000000), { from: coreTeam });
    await this.galtToken.mint(charlie, ether(10000000), { from: coreTeam });

    await this.acl.setRole(bytes32('FEE_COLLECTOR'), feeCollector, true, { from: coreTeam });
  });

  beforeEach(async function() {
    // fund factory contracts
    this.fundFactory = await deployFundFactory(FundFactory, this.ggr.address, coreTeam);
    this.fundFactory.setEthFee(ether(5));
    this.fundFactory.setGaltFee(ether(10));
    this.fundFactory.setCollectorAddress(feeCollector);
  });

  describe('protocol fee', () => {
    async function build(factory, value = 0) {
      await buildFund(
        factory,
        alice,
        false,
        new VotingConfig(ether(60), ether(50), VotingConfig.ONE_WEEK, 0),
        {},
        [bob, charlie],
        2,
        2592000,
        'foo',
        'bar',
        [],
        value
      );
    }

    describe('payments', async function() {
      it('should accept GALT payments with a registered value', async function() {
        await this.galtToken.approve(this.fundFactory.address, ether(10), { from: alice });
        await build(this.fundFactory, 0);
      });

      it('should accept ETH payments with a registered value', async function() {
        await build(this.fundFactory, ether(5));
      });

      it('should accept GALT payments with an approved value higher than a registered', async function() {
        await this.galtToken.approve(this.fundFactory.address, ether(11), { from: alice });
        await build(this.fundFactory, 0);
        const res = await this.galtToken.balanceOf(this.fundFactory.address);
        assert.equal(res, ether(10));
      });

      it('should reject GALT payments with an approved value lower than a registered', async function() {
        await this.galtToken.approve(this.fundFactory.address, ether(9), { from: alice });
        await assertRevert(build(this.fundFactory, 0));
      });

      it('should accept ETH payments with a value higher than a registered one', async function() {
        await assertRevert(build(this.fundFactory, ether(6)));
      });

      it('should accept ETH payments with a value lower than a registered one', async function() {
        await assertRevert(build(this.fundFactory, ether(4)));
      });
    });

    describe('fee collection', () => {
      it('should allow the collector withdrawing all collected ETH fees', async function() {
        this.timeout(15000);
        await build(this.fundFactory, ether(5));
        await build(this.fundFactory, ether(5));
        await build(this.fundFactory, ether(5));
        await build(this.fundFactory, ether(5));
        await build(this.fundFactory, ether(5));
        await build(this.fundFactory, ether(5));

        assert.equal(await web3.eth.getBalance(this.fundFactory.address), ether(30));
        const ethBalanceBefore = await web3.eth.getBalance(feeCollector);
        await this.fundFactory.withdrawEthFees({ from: feeCollector });
        const ethBalanceAfter = await web3.eth.getBalance(feeCollector);
        assertEthBalanceChanged(ethBalanceBefore, ethBalanceAfter, ether(30));
      });

      it('should allow the collector withdrawing all collected GALT fees', async function() {
        this.timeout(15000);
        await this.galtToken.approve(this.fundFactory.address, ether(70), { from: alice });
        await build(this.fundFactory, 0);
        await build(this.fundFactory, 0);
        await build(this.fundFactory, 0);
        await build(this.fundFactory, 0);
        await build(this.fundFactory, 0);
        await build(this.fundFactory, 0);
        await build(this.fundFactory, 0);

        const galtBalanceBefore = await this.galtToken.balanceOf(feeCollector);
        await this.fundFactory.withdrawGaltFees({ from: feeCollector });
        const galtBalanceAfter = await this.galtToken.balanceOf(feeCollector);

        assertGaltBalanceChanged(galtBalanceBefore, galtBalanceAfter, ether(70));
      });
    });
  });
});
