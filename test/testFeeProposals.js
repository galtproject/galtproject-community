const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');

const { deployFundFactory, buildFund } = require('./deploymentHelpers');
const { ether, assertRevert, initHelperWeb3, int } = require('./helpers');

const { web3 } = SpaceToken;

initHelperWeb3(web3);

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  APPROVED: 2,
  EXECUTED: 3,
  REJECTED: 4
};

contract('Fee Proposals', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank] = accounts;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.spaceToken = await SpaceToken.new(this.ggr.address, 'Name', 'Symbol', { from: coreTeam });

    await this.ggr.setContract(await this.ggr.SPACE_TOKEN(), this.spaceToken.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.GALT_TOKEN(), this.galtToken.address, { from: coreTeam });

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

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
      600000,
      {},
      [bob, charlie, dan],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundControllerX = fund.fundController;
    this.fundMultiSigX = fund.fundMultiSigX;
    this.fundRAX = fund.fundRA;
    this.fundProposalManagerX = fund.fundProposalManager;

    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['1', '2', '3', '4', '5'];
  });

  describe('Create Fee Proposal', () => {
    it('should encode', async function() {
      await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      const feeContract = alice;
      const calldata = this.fundStorageX.contract.methods.addFeeContract(feeContract).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, calldata, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, { from: bob });
      await this.fundProposalManagerX.nay(proposalId, { from: charlie });

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);
      assert.sameMembers(res.nays, [charlie]);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.fundProposalManagerX.getActiveProposals();
      assert.sameMembers(res.map(int), [1]);
      res = await this.fundProposalManagerX.getApprovedProposals();
      assert.sameMembers(res.map(int), []);
      res = await this.fundProposalManagerX.getRejectedProposals();
      assert.sameMembers(res.map(int), []);

      res = await this.fundProposalManagerX.getAyeShare(proposalId);
      assert.equal(res, 200000);
      res = await this.fundProposalManagerX.getNayShare(proposalId);
      assert.equal(res, 200000);

      // Deny double-vote
      await assertRevert(this.fundProposalManagerX.aye(proposalId, { from: bob }));
      await assertRevert(this.fundProposalManagerX.triggerReject(proposalId, { from: dan }));

      await this.fundProposalManagerX.aye(proposalId, { from: dan });
      await this.fundProposalManagerX.aye(proposalId, { from: eve });

      res = await this.fundProposalManagerX.getAyeShare(proposalId);
      assert.equal(res, 600000);
      res = await this.fundProposalManagerX.getNayShare(proposalId);
      assert.equal(res, 200000);

      // await this.fundProposalManagerX.triggerApprove(proposalId, { from: dan });
      //
      // res = await this.changeMultiSigOwnersProposalManager.getProposalVoting(proposalId);
      // assert.equal(res.status, ProposalStatus.APPROVED);
      //
      // res = await this.changeMultiSigOwnersProposalManager.getActiveProposals();
      // assert.sameMembers(res.map(int), []);
      // res = await this.changeMultiSigOwnersProposalManager.getApprovedProposals();
      // assert.sameMembers(res.map(int), [1]);
      // res = await this.changeMultiSigOwnersProposalManager.getRejectedProposals();
      // assert.sameMembers(res.map(int), []);
      //
      // // verify value changed
      // res = await this.fundMultiSig.getOwners();
      // assert.sameMembers(res, [alice, frank, george]);
    });
  });
});
