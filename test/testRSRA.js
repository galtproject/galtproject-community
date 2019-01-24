const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const SpaceLockerRegistry = artifacts.require('./SpaceLockerRegistry.sol');
const SpaceLockerFactory = artifacts.require('./SpaceLockerFactory.sol');
const SpaceLocker = artifacts.require('./SpaceLocker.sol');
const FundStorageFactory = artifacts.require('./FundStorageFactory.sol');
const RSRAFactory = artifacts.require('./RSRAFactory.sol');
const FundFactory = artifacts.require('./FundFactory.sol');
const MockRSRA = artifacts.require('./MockRSRA.sol');
const MockSplitMerge = artifacts.require('./MockSplitMerge.sol');
const FundStorage = artifacts.require('./FundStorage.sol');

const FundMultiSigFactory = artifacts.require('./FundMultiSigFactory.sol');
const FundControllerFactory = artifacts.require('./FundControllerFactory.sol');

const NewMemberProposalManagerFactory = artifacts.require('./NewMemberProposalManagerFactory.sol');
const ExpelMemberProposalManagerFactory = artifacts.require('./ExpelMemberProposalManagerFactory.sol');
const WLProposalManagerFactory = artifacts.require('./WLProposalManagerFactory.sol');
const FineMemberProposalManagerFactory = artifacts.require('./FineMemberProposalManagerFactory.sol');
const MockModifyConfigProposalManagerFactory = artifacts.require('./MockModifyConfigProposalManagerFactory.sol');

const { ether, assertRevert, initHelperWeb3 } = require('./helpers');

const { web3 } = SpaceToken;

initHelperWeb3(web3);

contract('RSRA', accounts => {
  const [coreTeam, minter, alice, bob, charlie, geoDateManagement] = accounts;

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

    // fund factory contracts

    this.rsraFactory = await RSRAFactory.new();
    this.fundStorageFactory = await FundStorageFactory.new();
    this.fundMultiSigFactory = await FundMultiSigFactory.new();
    this.fundControllerFactory = await FundControllerFactory.new();

    this.modifyConfigProposalManagerFactory = await MockModifyConfigProposalManagerFactory.new();
    this.newMemberProposalManagerFactory = await NewMemberProposalManagerFactory.new();
    this.fineMemberProposalManagerFactory = await FineMemberProposalManagerFactory.new();
    this.expelMemberProposalManagerFactory = await ExpelMemberProposalManagerFactory.new();
    this.wlProposalManagerFactory = await WLProposalManagerFactory.new();

    this.fundFactory = await FundFactory.new(
      this.galtToken.address,
      this.spaceToken.address,
      this.spaceLockerRegistry.address,
      this.rsraFactory.address,
      this.fundMultiSigFactory.address,
      this.fundStorageFactory.address,
      this.fundControllerFactory.address,
      this.modifyConfigProposalManagerFactory.address,
      this.newMemberProposalManagerFactory.address,
      this.fineMemberProposalManagerFactory.address,
      this.expelMemberProposalManagerFactory.address,
      this.wlProposalManagerFactory.address,
      { from: coreTeam }
    );

    // assign roles
    this.spaceToken.addRoleTo(minter, 'minter', { from: coreTeam });
    this.spaceLockerRegistry.addRoleTo(this.spaceLockerFactory.address, await this.spaceLockerRegistry.ROLE_FACTORY(), {
      from: coreTeam
    });

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    // build fund
    await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
    const res = await this.fundFactory.buildFirstStep(false, 60, 50, 60, 60, 60, [bob, charlie], 2, {
      from: alice
    });
    this.rsraX = await MockRSRA.at(res.logs[0].args.fundRsra);
    this.fundStorageX = await FundStorage.at(res.logs[0].args.fundStorage);
  });

  describe('transfer', () => {
    it('should handle basic reputation transfer case', async function() {
      let res = await this.spaceToken.mint(alice, { from: minter });
      const token1 = res.logs[0].args.tokenId.toNumber();

      res = await this.spaceToken.ownerOf(token1);
      assert.equal(res, alice);

      // HACK
      await this.splitMerge.setTokenArea(token1, 800, { from: geoDateManagement });

      await this.galtToken.approve(this.spaceLockerFactory.address, ether(10), { from: alice });
      res = await this.spaceLockerFactory.build({ from: alice });
      const lockerAddress = res.logs[0].args.locker;

      const locker = await SpaceLocker.at(lockerAddress);

      // DEPOSIT SPACE TOKEN
      await this.spaceToken.approve(lockerAddress, token1, { from: alice });
      await locker.deposit(token1, { from: alice });

      res = await locker.reputation();
      assert.equal(res, 800);

      res = await locker.owner();
      assert.equal(res, alice);

      res = await locker.spaceTokenId();
      assert.equal(res, 0);

      res = await locker.tokenDeposited();
      assert.equal(res, true);

      res = await this.spaceLockerRegistry.isValid(lockerAddress);
      assert.equal(res, true);

      // MINT REPUTATION
      await locker.approveMint(this.rsraX.address, { from: alice });
      await assertRevert(this.rsraX.mint(lockerAddress, { from: minter }));
      await this.rsraX.mint(lockerAddress, { from: alice });

      res = await this.rsraX.balanceOf(alice);
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
      await assertRevert(this.rsraX.approveBurn(lockerAddress, { from: alice }));

      // UNSUCCESSFUL WITHDRAW SPACE TOKEN
      await assertRevert(locker.burn(this.rsraX.address, { from: alice }));
      await assertRevert(locker.withdraw(token1, { from: alice }));

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
      await assertRevert(this.rsraX.approveBurn(lockerAddress, { from: charlie }));
      await this.rsraX.approveBurn(lockerAddress, { from: alice });

      await locker.burn(this.rsraX.address, { from: alice });
      await locker.withdraw(token1, { from: alice });

      res = await this.rsraX.balanceOf(alice);
      assert.equal(res, 0);

      res = await locker.reputation();
      assert.equal(res, 0);

      res = await locker.owner();
      assert.equal(res, alice);

      res = await locker.spaceTokenId();
      assert.equal(res, 0);

      res = await locker.tokenDeposited();
      assert.equal(res, false);

      res = await this.spaceLockerRegistry.isValid(lockerAddress);
      assert.equal(res, true);
    });
  });

  describe('lock/unlock by delegate', () => {
    it('should allow update balances of all whitelisted proposal contracts', async function() {
      let res = await this.spaceToken.mint(alice, { from: minter });
      const token1 = res.logs[0].args.tokenId.toNumber();

      // HACK
      await this.splitMerge.setTokenArea(token1, 800, { from: geoDateManagement });

      // CREATE LOCKER
      await this.galtToken.approve(this.spaceLockerFactory.address, ether(10), { from: alice });
      res = await this.spaceLockerFactory.build({ from: alice });
      const lockerAddress = res.logs[0].args.locker;

      const locker = await SpaceLocker.at(lockerAddress);

      // DEPOSIT SPACE TOKEN
      await this.spaceToken.approve(lockerAddress, token1, { from: alice });
      await locker.deposit(token1, { from: alice });

      // APPROVE
      await locker.approveMint(this.rsraX.address, { from: alice });

      // STAKE
      await this.rsraX.mint(lockerAddress, { from: alice });
      await this.rsraX.delegate(bob, alice, 350, { from: alice });
      await this.rsraX.delegate(charlie, alice, 100, { from: bob });
      await this.rsraX.delegate(alice, alice, 50, { from: charlie });

      res = await this.rsraX.balanceOf(alice);
      assert.equal(res, 500);

      res = await this.rsraX.balanceOf(bob);
      assert.equal(res, 250);

      res = await this.rsraX.balanceOf(charlie);
      assert.equal(res, 50);

      await this.rsraX.lockReputation(100, { from: alice });
      await this.rsraX.lockReputation(30, { from: bob });
      await this.rsraX.lockReputation(50, { from: charlie });

      // Alice can revoke only 220 unlocked reputation tokens
      await assertRevert(this.rsraX.revoke(bob, 221, { from: alice }));
      await this.rsraX.revoke(bob, 220, { from: alice });

      // Alice can us revokeLocked for the rest of the delegated amount
      await assertRevert(this.rsraX.revokeLocked(bob, 31, { from: alice }));
      await this.rsraX.revokeLocked(bob, 30, { from: alice });

      // Charlie partially unlocks his reputation
      await assertRevert(this.rsraX.unlockReputation(51, { from: charlie }));
      await this.rsraX.unlockReputation(25, { from: charlie });

      res = await this.rsraX.balanceOf(alice);
      assert.equal(res, 650);

      res = await this.rsraX.balanceOf(bob);
      assert.equal(res, 0);

      res = await this.rsraX.balanceOf(charlie);
      assert.equal(res, 25);

      res = await this.rsraX.lockedBalanceOf(alice);
      assert.equal(res, 100);

      res = await this.rsraX.lockedBalanceOf(bob);
      assert.equal(res, 0);

      res = await this.rsraX.lockedBalanceOf(charlie);
      assert.equal(res, 25);

      await this.rsraX.revokeLocked(charlie, 25, { from: alice });
      await this.rsraX.revoke(charlie, 25, { from: alice });
      await this.rsraX.unlockReputation(100, { from: alice });

      res = await this.rsraX.balanceOf(alice);
      assert.equal(res, 800);

      res = await this.rsraX.balanceOf(bob);
      assert.equal(res, 0);

      res = await this.rsraX.balanceOf(charlie);
      assert.equal(res, 0);

      res = await this.rsraX.lockedBalanceOf(alice);
      assert.equal(res, 0);

      res = await this.rsraX.lockedBalanceOf(bob);
      assert.equal(res, 0);

      res = await this.rsraX.lockedBalanceOf(charlie);
      assert.equal(res, 0);

      // ATTEMPT TO BURN
      await assertRevert(locker.burn(this.rsraX.address, { from: alice }));

      // APPROVE BURN AND TRY AGAIN
      await this.rsraX.approveBurn(lockerAddress, { from: alice });
      await locker.burn(this.rsraX.address, { from: alice });

      // Withdraw token
      await locker.withdraw(token1, { from: alice });
    });
  });
});
