const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const SpaceLockerRegistry = artifacts.require('./SpaceLockerRegistry.sol');
const SpaceLockerFactory = artifacts.require('./SpaceLockerFactory.sol');
const SpaceLocker = artifacts.require('./SpaceLocker.sol');
const MockSplitMerge = artifacts.require('./MockSplitMerge.sol');

const { deployFundFactory, buildFund } = require('./deploymentHelpers');
const { ether, assertRevert, initHelperWeb3 } = require('./helpers');

const { web3 } = SpaceToken;

initHelperWeb3(web3);

web3.utils.BN.prototype.toString = function() {
  return this.toString(10);
};

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  APPROVED: 2,
  REJECTED: 3
};

contract('ExpelFundMemberProposal', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank, minter, geoDateManagement, unauthorized] = accounts;

  beforeEach(async function() {
    this.spaceToken = await SpaceToken.new('Name', 'Symbol', { from: coreTeam });
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.splitMerge = await MockSplitMerge.new({ from: coreTeam });
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
      [60, 50, 60, 60, 60, 60, 60, 60, 60],
      [bob, charlie, dan],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundControllerX = fund.fundController;
    this.rsraX = fund.fundRsra;
    this.expelMemberProposalManagerX = fund.expelMemberProposalManager;

    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['1', '2', '3', '4', '5'];
    await this.rsraX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });
  });

  describe('proposal pipeline', () => {
    it('should allow user who has reputation creating a new proposal', async function() {
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

      res = await this.rsraX.spaceTokenOwners();
      assert.sameMembers(res, [alice, bob, charlie, dan, eve, frank]);

      // DISTRIBUTE REPUTATION
      await this.rsraX.delegate(bob, alice, 300, { from: alice });
      await this.rsraX.delegate(charlie, alice, 100, { from: bob });

      await assertRevert(this.rsraX.burnExpelled(token1, bob, alice, 200, { from: unauthorized }));

      // EXPEL
      res = await this.expelMemberProposalManagerX.propose(token1, 'blah', { from: unauthorized });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.expelMemberProposalManagerX.getProposal(proposalId);
      assert.equal(web3.utils.hexToNumberString(res.spaceTokenId), token1);
      assert.equal(res.description, 'blah');

      await this.expelMemberProposalManagerX.aye(proposalId, { from: bob });
      await this.expelMemberProposalManagerX.aye(proposalId, { from: charlie });
      await this.expelMemberProposalManagerX.aye(proposalId, { from: dan });
      await this.expelMemberProposalManagerX.aye(proposalId, { from: eve });

      res = await this.rsraX.totalSupply();
      assert.equal(res, 2300); // 300 * 5 + 800
      res = await this.rsraX.balanceOf(bob);
      assert.equal(res, 500);
      res = await this.rsraX.getShare([bob]);
      assert.equal(res, 21);
      res = await this.expelMemberProposalManagerX.getAyeShare(proposalId);
      assert.equal(res, 65); // (500 + 400 + 300 + 300) / 2300
      res = await this.expelMemberProposalManagerX.getThreshold();
      assert.equal(res, 60);

      res = await this.fundStorageX.getExpelledToken(token1);
      assert.equal(res.isExpelled, false);
      assert.equal(res.amount, 0);

      // ACCEPT PROPOSAL
      await this.expelMemberProposalManagerX.triggerApprove(proposalId);

      res = await this.fundStorageX.getExpelledToken(token1);
      assert.equal(res.isExpelled, true);
      assert.equal(res.amount, 800);

      res = await this.expelMemberProposalManagerX.getProposalVoting(proposalId);
      assert.equal(res.status, ProposalStatus.APPROVED);

      // BURNING LOCKED REPUTATION FOR EXPELLED TOKEN
      await assertRevert(this.rsraX.burnExpelled(token1, charlie, alice, 101, { from: unauthorized }));
      await this.rsraX.burnExpelled(token1, charlie, alice, 100, { from: unauthorized });
      await assertRevert(this.rsraX.burnExpelled(token1, bob, alice, 201, { from: unauthorized }));
      await this.rsraX.burnExpelled(token1, bob, alice, 200, { from: unauthorized });
      await assertRevert(this.rsraX.burnExpelled(token1, alice, alice, 501, { from: unauthorized }));
      await this.rsraX.burnExpelled(token1, alice, alice, 500, { from: unauthorized });

      res = await this.fundStorageX.getExpelledToken(token1);
      assert.equal(res.isExpelled, true);
      assert.equal(res.amount, 0);

      res = await this.rsraX.balanceOf(alice);
      assert.equal(res, 0);
      res = await this.rsraX.delegatedBalanceOf(alice, alice);
      assert.equal(res, 0);

      // MINT REPUTATION REJECTED
      await assertRevert(this.rsraX.mint(lockerAddress, { from: alice }));

      // BURN
      await locker.burn(this.rsraX.address, { from: alice });

      // MINT REPUTATION REJECTED AFTER BURN
      await locker.approveMint(this.rsraX.address, { from: alice });
      await assertRevert(this.rsraX.mint(lockerAddress, { from: alice }));
    });
  });
});
