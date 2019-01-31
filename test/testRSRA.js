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
const ChangeNameAndDescriptionProposalManagerFactory = artifacts.require('./ChangeNameAndDescriptionProposalManagerFactory.sol');
const ActiveRulesProposalManagerFactory = artifacts.require('./ActiveRulesProposalManagerFactory.sol');
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
    this.changeNameAndDescriptionProposalManagerFactory = await ChangeNameAndDescriptionProposalManagerFactory.new();
    this.activeRulesProposalManagerFactory = await ActiveRulesProposalManagerFactory.new();
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
      this.changeNameAndDescriptionProposalManagerFactory.address,
      this.activeRulesProposalManagerFactory.address,
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

    // build fund
    await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
    let res = await this.fundFactory.buildFirstStep(false, 60, 50, 60, 60, 60, [bob, charlie], 2, {
      from: alice
    });
    this.rsraX = await MockRSRA.at(res.logs[0].args.fundRsra);
    this.fundStorageX = await FundStorage.at(res.logs[0].args.fundStorage);

    res = await this.spaceToken.mint(alice, { from: minter });
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
