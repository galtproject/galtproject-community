const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const SpaceLockerRegistry = artifacts.require('./SpaceLockerRegistry.sol');
const SpaceLockerFactory = artifacts.require('./SpaceLockerFactory.sol');
const SpaceLocker = artifacts.require('./SpaceLocker.sol');
const FundStorageFactory = artifacts.require('./FundStorageFactory.sol');
const FundMultiSigFactory = artifacts.require('./FundMultiSigFactory.sol');
const FundControllerFactory = artifacts.require('./FundControllerFactory.sol');
const MockSplitMerge = artifacts.require('./MockSplitMerge.sol');
const MockRSRA = artifacts.require('./MockRSRA.sol');
const MockRSRAFactory = artifacts.require('./MockRSRAFactory.sol');
const FundFactory = artifacts.require('./FundFactory.sol');
const FundStorage = artifacts.require('./FundStorage.sol');

const NewMemberProposalManagerFactory = artifacts.require('./NewMemberProposalManagerFactory.sol');
const ExpelMemberProposalManagerFactory = artifacts.require('./ExpelMemberProposalManagerFactory.sol');
const WLProposalManagerFactory = artifacts.require('./WLProposalManagerFactory.sol');
const FineMemberProposalManagerFactory = artifacts.require('./FineMemberProposalManagerFactory.sol');
const MockModifyConfigProposalManagerFactory = artifacts.require('./MockModifyConfigProposalManagerFactory.sol');
const ChangeNameAndDescriptionProposalManagerFactory = artifacts.require(
  './ChangeNameAndDescriptionProposalManagerFactory.sol'
);
const AddFundRuleProposalManagerFactory = artifacts.require('./AddFundRuleProposalManagerFactory.sol');
const DeactivateFundRuleProposalManagerFactory = artifacts.require('./DeactivateFundRuleProposalManagerFactory.sol');

const MockModifyConfigProposalManager = artifacts.require('./MockModifyConfigProposalManager.sol');
const NewMemberProposalManager = artifacts.require('./NewMemberProposalManager.sol');

const { ether, assertRevert, initHelperWeb3 } = require('./helpers');

const { web3 } = SpaceToken;

initHelperWeb3(web3);

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  APPROVED: 2,
  REJECTED: 3
};

contract('NewFundMemberProposal', accounts => {
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

    // fund factory contracts

    this.rsraFactory = await MockRSRAFactory.new();
    this.fundStorageFactory = await FundStorageFactory.new();
    this.fundMultiSigFactory = await FundMultiSigFactory.new();
    this.fundControllerFactory = await FundControllerFactory.new();

    this.modifyConfigProposalManagerFactory = await MockModifyConfigProposalManagerFactory.new();
    this.newMemberProposalManagerFactory = await NewMemberProposalManagerFactory.new();
    this.fineMemberProposalManagerFactory = await FineMemberProposalManagerFactory.new();
    this.expelMemberProposalManagerFactory = await ExpelMemberProposalManagerFactory.new();
    this.wlProposalManagerFactory = await WLProposalManagerFactory.new();
    this.changeNameAndDescriptionProposalManagerFactory = await ChangeNameAndDescriptionProposalManagerFactory.new();
    this.addFundRuleProposalManagerFactory = await AddFundRuleProposalManagerFactory.new();
    this.deactivateFundRuleProposalManagerFactory = await DeactivateFundRuleProposalManagerFactory.new();

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
      this.addFundRuleProposalManagerFactory.address,
      this.deactivateFundRuleProposalManagerFactory.address,
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
    let res = await this.fundFactory.buildFirstStep(true, [60, 50, 30, 60, 60, 60, 60, 60], [bob, charlie, dan], 2, {
      from: alice
    });
    this.fundStorageX = await FundStorage.at(res.logs[0].args.fundStorage);

    res = await this.fundFactory.buildSecondStep({ from: alice });
    this.rsraX = await MockRSRA.at(res.logs[0].args.fundRsra);
    this.modifyConfigProposalManagerX = await MockModifyConfigProposalManager.at(
      res.logs[0].args.modifyConfigProposalManager
    );
    this.newMemberProposalManagerX = await NewMemberProposalManager.at(res.logs[0].args.newMemberProposalManager);

    await this.fundFactory.buildThirdStep({ from: alice });

    this.beneficiaries = [bob, charlie, dan, eve, frank];
    await this.rsraX.mintAll(this.beneficiaries, 300, { from: alice });
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
      await assertRevert(this.rsraX.mint(lockerAddress, { from: alice }));

      res = await this.newMemberProposalManagerX.propose(token1, 'blah', { from: unauthorized });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.newMemberProposalManagerX.getActiveProposals();
      assert.deepEqual(res.map(i => i.toString(10)), [proposalId]);
      res = await this.newMemberProposalManagerX.getActiveProposalsCount();
      assert.equal(res.toString(10), '1');

      res = await this.newMemberProposalManagerX.getActiveProposalsBySender(unauthorized);
      assert.deepEqual(res.map(i => i.toString(10)), [proposalId]);
      res = await this.newMemberProposalManagerX.getActiveProposalsBySenderCount(unauthorized);
      assert.equal(res.toString(10), '1');

      res = await this.newMemberProposalManagerX.getProposal(proposalId);
      assert.equal(web3.utils.hexToNumberString(res.spaceTokenId), token1);
      assert.equal(res.description, 'blah');

      res = await this.fundStorageX.isMintApproved(token1);
      assert.equal(res, false);

      await this.newMemberProposalManagerX.aye(proposalId, { from: bob });
      await this.newMemberProposalManagerX.aye(proposalId, { from: charlie });

      res = await this.newMemberProposalManagerX.getAyeShare(proposalId);
      assert.equal(res, 40);
      res = await this.newMemberProposalManagerX.getThreshold();
      assert.equal(res, 30);

      await this.newMemberProposalManagerX.triggerApprove(proposalId);

      res = await this.newMemberProposalManagerX.getActiveProposals();
      assert.deepEqual(res, []);
      res = await this.newMemberProposalManagerX.getActiveProposalsCount();
      assert.equal(res.toString(10), '0');

      res = await this.newMemberProposalManagerX.getActiveProposalsBySender(unauthorized);
      assert.deepEqual(res, []);
      res = await this.newMemberProposalManagerX.getActiveProposalsBySenderCount(unauthorized);
      assert.equal(res.toString(10), '0');

      res = await this.newMemberProposalManagerX.getProposalVoting(proposalId);
      assert.equal(res.status, ProposalStatus.APPROVED);

      res = await this.fundStorageX.isMintApproved(token1);
      assert.equal(res, true);

      await this.rsraX.mint(lockerAddress, { from: alice });

      res = await this.rsraX.balanceOf(alice);
      assert.equal(res, 800);
    });
  });
});
