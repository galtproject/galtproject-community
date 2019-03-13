const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const SpaceLockerRegistry = artifacts.require('./SpaceLockerRegistry.sol');
const SpaceLockerFactory = artifacts.require('./SpaceLockerFactory.sol');
const SpaceLocker = artifacts.require('./SpaceLocker.sol');
const MockSplitMerge = artifacts.require('./MockSplitMerge.sol');
const RegularEthFee = artifacts.require('./RegularEthFee.sol');
const RegularEthFeeFactory = artifacts.require('./RegularEthFeeFactory.sol');

const { deployFundFactory, buildFund } = require('./deploymentHelpers');
const { ether, assertRevert, initHelperWeb3, lastBlockTimestamp, increaseTime } = require('./helpers');

const { web3 } = SpaceToken;

initHelperWeb3(web3);

// 60 * 60
const ONE_HOUR = 3600;
// 60 * 60 * 24
const ONE_DAY = 86400;
// 60 * 60 * 24 * 30
const ONE_MONTH = 2592000;

contract('RSRA', accounts => {
  const [coreTeam, minter, alice, bob, charlie, unauthorized, geoDateManagement] = accounts;

  beforeEach(async function() {
    this.spaceToken = await SpaceToken.new('Name', 'Symbol', { from: coreTeam });
    this.splitMerge = await MockSplitMerge.new({ from: coreTeam });
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.spaceLockerRegistry = await SpaceLockerRegistry.new({ from: coreTeam });
    this.spaceLockerFactory = await SpaceLockerFactory.new(
      this.spaceLockerRegistry.address,
      this.galtToken.address,
      this.spaceToken.address,
      this.splitMerge.address,
      { from: coreTeam }
    );

    // assign roles
    this.spaceToken.addRoleTo(minter, 'minter', { from: coreTeam });
    this.spaceLockerRegistry.addRoleTo(this.spaceLockerFactory.address, await this.spaceLockerRegistry.ROLE_FACTORY(), {
      from: coreTeam
    });

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });
    await this.galtToken.mint(bob, ether(10000000), { from: coreTeam });
    await this.galtToken.mint(charlie, ether(10000000), { from: coreTeam });

    // fund factory contracts
    const fundFactory = await deployFundFactory(
      this.galtToken.address,
      this.spaceToken.address,
      this.spaceLockerRegistry.address,
      alice
    );

    // build fund
    await this.galtToken.approve(fundFactory.address, ether(100), { from: alice });
    const fund = await buildFund(
      fundFactory,
      alice,
      false,
      [60, 50, 60, 60, 60, 60, 60, 60, 60, 60],
      [bob, charlie],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundControllerX = fund.fundController;
    this.rsraX = fund.fundRsra;
    this.modifyFeeProposalManager = fund.modifyFeeProposalManager;

    let res = await this.spaceToken.mint(alice, { from: minter });
    this.token1 = res.logs[0].args.tokenId.toNumber();
    res = await this.spaceToken.mint(bob, { from: minter });
    this.token2 = res.logs[0].args.tokenId.toNumber();
    res = await this.spaceToken.mint(charlie, { from: minter });
    this.token3 = res.logs[0].args.tokenId.toNumber();

    res = await this.spaceToken.ownerOf(this.token1);
    assert.equal(res, alice);
    res = await this.spaceToken.ownerOf(this.token2);
    assert.equal(res, bob);
    res = await this.spaceToken.ownerOf(this.token3);
    assert.equal(res, charlie);

    // HACK
    await this.splitMerge.setTokenArea(this.token1, 800, { from: geoDateManagement });
    await this.splitMerge.setTokenArea(this.token2, 0, { from: geoDateManagement });
    await this.splitMerge.setTokenArea(this.token3, 0, { from: geoDateManagement });

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
    await this.aliceLocker.approveMint(this.rsraX.address, { from: alice });
    await this.bobLocker.approveMint(this.rsraX.address, { from: bob });
    await this.charlieLocker.approveMint(this.rsraX.address, { from: charlie });
    await this.rsraX.mint(this.aliceLockerAddress, { from: alice });
    await this.rsraX.mint(this.bobLockerAddress, { from: bob });
    await this.rsraX.mint(this.charlieLockerAddress, { from: charlie });
  });

  describe('lock', () => {
    it('should handle basic reputation transfer case', async function() {
      let res = await this.rsraX.balanceOf(alice);
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
      res = await this.modifyFeeProposalManager.propose(calldata, 'add it', { from: alice });
      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.modifyFeeProposalManager.aye(proposalId, { from: bob });
      await this.modifyFeeProposalManager.aye(proposalId, { from: charlie });
      await this.modifyFeeProposalManager.aye(proposalId, { from: alice });
      await this.modifyFeeProposalManager.triggerApprove(proposalId, { from: unauthorized });

      res = await this.fundStorageX.getFeeContracts();
      assert.sameMembers(res, [this.feeAddress]);

      await this.regularEthFee.lockSpaceToken(this.token1, { from: unauthorized });

      res = await this.fundStorageX.isSpaceTokenLocked(this.token1);
      assert.equal(res, true);

      await assertRevert(this.rsraX.approveBurn(this.aliceLockerAddress, { from: alice }));

      await increaseTime(ONE_DAY + 2 * ONE_HOUR);
      await this.regularEthFee.pay(this.token1, { from: alice, value: ether(4) });

      await this.regularEthFee.unlockSpaceToken(this.token1, { from: unauthorized });
      this.rsraX.approveBurn(this.aliceLockerAddress, { from: alice });
    });
  });

  describe('transfer', () => {
    it('should handle basic reputation transfer case', async function() {
      let res = await this.rsraX.balanceOf(alice);
      assert.equal(res, 800);

      // TRANSFER #1
      await this.rsraX.delegate(bob, alice, 350, { from: alice });

      res = await this.rsraX.balanceOf(alice);
      assert.equal(res, 450);

      res = await this.rsraX.balanceOf(bob);
      assert.equal(res, 350);

      // TRANSFER #2
      await this.rsraX.delegate(charlie, alice, 100, { from: bob });

      res = await this.rsraX.balanceOf(alice);
      assert.equal(res, 450);

      res = await this.rsraX.balanceOf(bob);
      assert.equal(res, 250);

      res = await this.rsraX.balanceOf(charlie);
      assert.equal(res, 100);

      // TRANSFER #3
      await this.rsraX.delegate(alice, alice, 50, { from: charlie });

      res = await this.rsraX.balanceOf(alice);
      assert.equal(res, 500);

      res = await this.rsraX.balanceOf(bob);
      assert.equal(res, 250);

      res = await this.rsraX.balanceOf(charlie);
      assert.equal(res, 50);

      // REVOKE #1
      await this.rsraX.revoke(bob, 200, { from: alice });

      await assertRevert(this.rsraX.revoke(bob, 200, { from: charlie }));
      await assertRevert(this.rsraX.revoke(alice, 200, { from: charlie }));

      res = await this.rsraX.balanceOf(alice);
      assert.equal(res, 700);

      res = await this.rsraX.balanceOf(bob);
      assert.equal(res, 50);

      res = await this.rsraX.balanceOf(charlie);
      assert.equal(res, 50);

      // BURN REPUTATION UNSUCCESSFUL ATTEMPTS
      await assertRevert(this.rsraX.approveBurn(this.aliceLockerAddress, { from: alice }));

      // UNSUCCESSFUL WITHDRAW SPACE TOKEN
      await assertRevert(this.aliceLocker.burn(this.rsraX.address, { from: alice }));
      await assertRevert(this.aliceLocker.withdraw(this.token1, { from: alice }));

      // REVOKE REPUTATION
      await this.rsraX.revoke(bob, 50, { from: alice });
      await this.rsraX.revoke(charlie, 50, { from: alice });

      res = await this.rsraX.balanceOf(alice);
      assert.equal(res, 800);

      res = await this.rsraX.balanceOf(bob);
      assert.equal(res, 0);

      res = await this.rsraX.balanceOf(charlie);
      assert.equal(res, 0);

      // WITHDRAW TOKEN
      await assertRevert(this.rsraX.approveBurn(this.aliceLockerAddress, { from: charlie }));
      await this.rsraX.approveBurn(this.aliceLockerAddress, { from: alice });

      await this.aliceLocker.burn(this.rsraX.address, { from: alice });
      await this.aliceLocker.withdraw(this.token1, { from: alice });

      res = await this.rsraX.balanceOf(alice);
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
    });
  });
});
