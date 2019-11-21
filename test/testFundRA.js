const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const LockerRegistry = artifacts.require('./LockerRegistry.sol');
const SpaceLockerFactory = artifacts.require('./SpaceLockerFactory.sol');
const SpaceLocker = artifacts.require('./SpaceLocker.sol');
const MockSpaceGeoDataRegistry = artifacts.require('./MockSpaceGeoDataRegistry.sol');
const RegularEthFee = artifacts.require('./RegularEthFee.sol');
const RegularEthFeeFactory = artifacts.require('./RegularEthFeeFactory.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');
const FeeRegistry = artifacts.require('./FeeRegistry.sol');
const ACL = artifacts.require('./ACL.sol');

SpaceToken.numberFormat = 'String';
SpaceLocker.numberFormat = 'String';

const { deployFundFactory, buildFund, VotingConfig } = require('./deploymentHelpers');
const {
  ether,
  assertRevert,
  initHelperWeb3,
  lastBlockTimestamp,
  increaseTime,
  paymentMethods,
  evmIncreaseTime
} = require('./helpers');

const { web3 } = SpaceToken;
const { utf8ToHex } = web3.utils;
const bytes32 = utf8ToHex;

initHelperWeb3(web3);

// 60 * 60
const ONE_HOUR = 3600;
// 60 * 60 * 24
const ONE_DAY = 86400;
// 60 * 60 * 24 * 30
const ONE_MONTH = 2592000;

contract('FundRA', accounts => {
  const [coreTeam, minter, alice, bob, charlie, unauthorized, geoDateManagement] = accounts;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.acl = await ACL.new({ from: coreTeam });
    this.spaceGeoDataRegistry = await MockSpaceGeoDataRegistry.new({ from: coreTeam });
    this.spaceToken = await SpaceToken.new(this.ggr.address, 'Name', 'Symbol', { from: coreTeam });
    this.spaceLockerRegistry = await LockerRegistry.new(this.ggr.address, bytes32('SPACE_LOCKER_REGISTRAR'), {
      from: coreTeam
    });
    this.feeRegistry = await FeeRegistry.new({ from: coreTeam });

    await this.ggr.initialize();
    await this.acl.initialize();
    await this.feeRegistry.initialize();

    await this.ggr.setContract(await this.ggr.ACL(), this.acl.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.FEE_REGISTRY(), this.feeRegistry.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.SPACE_TOKEN(), this.spaceToken.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.GALT_TOKEN(), this.galtToken.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.SPACE_GEO_DATA_REGISTRY(), this.spaceGeoDataRegistry.address, {
      from: coreTeam
    });
    await this.ggr.setContract(await this.ggr.SPACE_LOCKER_REGISTRY(), this.spaceLockerRegistry.address, {
      from: coreTeam
    });

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });
    await this.galtToken.mint(bob, ether(10000000), { from: coreTeam });
    await this.galtToken.mint(charlie, ether(10000000), { from: coreTeam });

    this.spaceLockerFactory = await SpaceLockerFactory.new(this.ggr.address, { from: coreTeam });

    await this.feeRegistry.setGaltFee(await this.spaceLockerFactory.FEE_KEY(), ether(10), { from: coreTeam });
    await this.feeRegistry.setEthFee(await this.spaceLockerFactory.FEE_KEY(), ether(5), { from: coreTeam });
    await this.feeRegistry.setPaymentMethod(await this.spaceLockerFactory.FEE_KEY(), paymentMethods.ETH_AND_GALT, {
      from: coreTeam
    });

    await this.acl.setRole(bytes32('SPACE_MINTER'), minter, true);
    await this.acl.setRole(bytes32('SPACE_LOCKER_REGISTRAR'), this.spaceLockerFactory.address, true, {
      from: coreTeam
    });

    // fund factory contracts
    this.fundFactory = await deployFundFactory(this.ggr.address, alice);
  });

  beforeEach(async function() {
    // build fund
    await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
    const fund = await buildFund(
      this.fundFactory,
      alice,
      false,
      new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK),
      {},
      [bob, charlie],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundControllerX = fund.fundController;
    this.fundRAX = fund.fundRA;
    this.fundProposalManagerX = fund.fundProposalManager;

    await assertRevert(this.fundRAX.initialize(alice));

    let res = await this.spaceToken.mint(alice, { from: minter });
    this.token1 = res.logs[0].args.tokenId;
    res = await this.spaceToken.mint(bob, { from: minter });
    this.token2 = res.logs[0].args.tokenId;
    res = await this.spaceToken.mint(charlie, { from: minter });
    this.token3 = res.logs[0].args.tokenId;

    res = await this.spaceToken.ownerOf(this.token1);
    assert.equal(res, alice);
    res = await this.spaceToken.ownerOf(this.token2);
    assert.equal(res, bob);
    res = await this.spaceToken.ownerOf(this.token3);
    assert.equal(res, charlie);

    // HACK
    await this.spaceGeoDataRegistry.setArea(this.token1, 800, { from: geoDateManagement });
    await this.spaceGeoDataRegistry.setArea(this.token2, 0, { from: geoDateManagement });
    await this.spaceGeoDataRegistry.setArea(this.token3, 0, { from: geoDateManagement });

    await this.galtToken.approve(this.spaceLockerFactory.address, ether(10), { from: alice });
    res = await this.spaceLockerFactory.build({ from: alice });
    this.aliceLockerAddress = res.logs[0].args.locker;

    await this.galtToken.approve(this.spaceLockerFactory.address, ether(10), { from: bob });
    res = await this.spaceLockerFactory.build({ from: bob });
    this.bobLockerAddress = res.logs[0].args.locker;

    await this.galtToken.approve(this.spaceLockerFactory.address, ether(10), { from: charlie });
    res = await this.spaceLockerFactory.build({ from: charlie });
    this.charlieLockerAddress = res.logs[0].args.locker;

    this.aliceLocker = await SpaceLocker.at(this.aliceLockerAddress);
    this.bobLocker = await SpaceLocker.at(this.bobLockerAddress);
    this.charlieLocker = await SpaceLocker.at(this.charlieLockerAddress);

    // APPROVE SPACE TOKEN
    await this.spaceToken.approve(this.aliceLockerAddress, this.token1, { from: alice });
    await this.spaceToken.approve(this.bobLockerAddress, this.token2, { from: bob });
    await this.spaceToken.approve(this.charlieLockerAddress, this.token3, { from: charlie });

    // DEPOSIT SPACE TOKEN
    await this.aliceLocker.deposit(this.token1, { from: alice });
    await this.bobLocker.deposit(this.token2, { from: bob });
    await this.charlieLocker.deposit(this.token3, { from: charlie });

    // APPROVE REPUTATION MINT
    await this.aliceLocker.approveMint(this.fundRAX.address, { from: alice });
    await this.bobLocker.approveMint(this.fundRAX.address, { from: bob });
    await this.charlieLocker.approveMint(this.fundRAX.address, { from: charlie });

    await this.fundRAX.mint(this.aliceLockerAddress, { from: alice });
    await this.fundRAX.mint(this.bobLockerAddress, { from: bob });
    await this.fundRAX.mint(this.charlieLockerAddress, { from: charlie });
  });

  describe('lock', () => {
    it('should handle basic reputation transfer case', async function() {
      let res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 800);

      res = await lastBlockTimestamp();
      this.initialTimestamp = res + ONE_HOUR;
      this.regularEthFeeFactory = await RegularEthFeeFactory.new({ from: coreTeam });
      res = await this.regularEthFeeFactory.build(
        this.fundStorageX.address,
        this.initialTimestamp.toString(10),
        ONE_MONTH,
        ether(4)
      );
      this.feeAddress = res.logs[0].args.addr;
      this.regularEthFee = await RegularEthFee.at(this.feeAddress);

      const calldata = this.fundStorageX.contract.methods.addFeeContract(this.feeAddress).encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, calldata, 'blah', {
        from: alice
      });
      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, { from: charlie });
      await this.fundProposalManagerX.aye(proposalId, { from: alice });

      await evmIncreaseTime(VotingConfig.ONE_WEEK + 1);

      await this.fundProposalManagerX.triggerApprove(proposalId, { from: unauthorized });

      res = await this.fundStorageX.getFeeContracts();
      assert.sameMembers(res, [this.feeAddress]);

      await this.regularEthFee.lockSpaceToken(this.token1, { from: unauthorized });

      res = await this.fundStorageX.isSpaceTokenLocked(this.token1);
      assert.equal(res, true);

      await assertRevert(this.fundRAX.approveBurn(this.aliceLockerAddress, { from: alice }));

      await increaseTime(ONE_DAY + 2 * ONE_HOUR);
      await this.regularEthFee.pay(this.token1, { from: alice, value: ether(4) });

      await this.regularEthFee.unlockSpaceToken(this.token1, { from: unauthorized });
      this.fundRAX.approveBurn(this.aliceLockerAddress, { from: alice });
    });
  });

  describe('transfer', () => {
    it('should handle basic reputation transfer case', async function() {
      let res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 800);

      const block0 = (await web3.eth.getBlock('latest')).number;

      // TRANSFER #1
      await this.fundRAX.delegate(bob, alice, 350, { from: alice });
      const block1 = (await web3.eth.getBlock('latest')).number;

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 450);

      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res, 350);

      // TRANSFER #2
      await this.fundRAX.delegate(charlie, alice, 100, { from: bob });
      const block2 = (await web3.eth.getBlock('latest')).number;

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 450);

      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res, 250);

      res = await this.fundRAX.balanceOf(charlie);
      assert.equal(res, 100);

      // TRANSFER #3
      await this.fundRAX.delegate(alice, alice, 50, { from: charlie });
      const block3 = (await web3.eth.getBlock('latest')).number;

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 500);

      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res, 250);

      res = await this.fundRAX.balanceOf(charlie);
      assert.equal(res, 50);

      // REVOKE #1
      await this.fundRAX.revoke(bob, 200, { from: alice });
      const block4 = (await web3.eth.getBlock('latest')).number;

      await assertRevert(this.fundRAX.revoke(bob, 200, { from: charlie }));
      await assertRevert(this.fundRAX.revoke(alice, 200, { from: charlie }));

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 700);

      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res, 50);

      res = await this.fundRAX.balanceOf(charlie);
      assert.equal(res, 50);

      // BURN REPUTATION UNSUCCESSFUL ATTEMPTS
      await assertRevert(this.fundRAX.approveBurn(this.aliceLockerAddress, { from: alice }));

      // UNSUCCESSFUL WITHDRAW SPACE TOKEN
      await assertRevert(this.aliceLocker.burn(this.fundRAX.address, { from: alice }));
      await assertRevert(this.aliceLocker.withdraw(this.token1, { from: alice }));

      // REVOKE REPUTATION
      await this.fundRAX.revoke(bob, 50, { from: alice });
      await this.fundRAX.revoke(charlie, 50, { from: alice });
      const block5 = (await web3.eth.getBlock('latest')).number;

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 800);

      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res, 0);

      res = await this.fundRAX.balanceOf(charlie);
      assert.equal(res, 0);

      // WITHDRAW TOKEN
      await assertRevert(this.fundRAX.approveBurn(this.aliceLockerAddress, { from: charlie }));
      await this.fundRAX.approveBurn(this.aliceLockerAddress, { from: alice });
      const block6 = (await web3.eth.getBlock('latest')).number;

      await this.aliceLocker.burn(this.fundRAX.address, { from: alice });
      await this.aliceLocker.withdraw(this.token1, { from: alice });

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 0);

      res = await this.aliceLocker.reputation();
      assert.equal(res, 0);

      res = await this.aliceLocker.owner();
      assert.equal(res, alice);

      res = await this.aliceLocker.spaceTokenId();
      assert.equal(res, 0);

      res = await this.aliceLocker.tokenDeposited();
      assert.equal(res, false);

      res = await this.spaceLockerRegistry.isValid(this.aliceLockerAddress);
      assert.equal(res, true);

      // CHECK CACHED BALANCES
      res = await this.fundRAX.balanceOfAt(alice, block0);
      assert.equal(res, 800);
      res = await this.fundRAX.balanceOfAt(bob, block0);
      assert.equal(res, 0);
      res = await this.fundRAX.balanceOfAt(charlie, block0);
      assert.equal(res, 0);

      res = await this.fundRAX.balanceOfAt(alice, block1);
      assert.equal(res, 450);
      res = await this.fundRAX.balanceOfAt(bob, block1);
      assert.equal(res, 350);
      res = await this.fundRAX.balanceOfAt(charlie, block1);
      assert.equal(res, 0);

      res = await this.fundRAX.balanceOfAt(alice, block2);
      assert.equal(res, 450);
      res = await this.fundRAX.balanceOfAt(bob, block2);
      assert.equal(res, 250);
      res = await this.fundRAX.balanceOfAt(charlie, block2);
      assert.equal(res, 100);

      res = await this.fundRAX.balanceOfAt(alice, block3);
      assert.equal(res, 500);
      res = await this.fundRAX.balanceOfAt(bob, block3);
      assert.equal(res, 250);
      res = await this.fundRAX.balanceOfAt(charlie, block3);
      assert.equal(res, 50);

      res = await this.fundRAX.balanceOfAt(alice, block4);
      assert.equal(res, 700);
      res = await this.fundRAX.balanceOfAt(bob, block4);
      assert.equal(res, 50);
      res = await this.fundRAX.balanceOfAt(charlie, block4);
      assert.equal(res, 50);

      res = await this.fundRAX.balanceOfAt(alice, block5);
      assert.equal(res, 800);
      res = await this.fundRAX.balanceOfAt(bob, block5);
      assert.equal(res, 0);
      res = await this.fundRAX.balanceOfAt(charlie, block5);
      assert.equal(res, 0);

      res = await this.fundRAX.balanceOfAt(alice, block6);
      assert.equal(res, 0);
      res = await this.fundRAX.balanceOfAt(bob, block6);
      assert.equal(res, 0);
      res = await this.fundRAX.balanceOfAt(charlie, block6);
      assert.equal(res, 0);
    });
  });
});
