const GaltToken = artifacts.require('./GaltToken.sol');
const MockBar = artifacts.require('./MockBar.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');

const { deployFundFactory, buildFund, VotingConfig } = require('./deploymentHelpers');
const { ether, initHelperWeb3, assertRevert } = require('./helpers');

const { web3 } = MockBar;

initHelperWeb3(web3);

MockBar.numberFormat = 'String';

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  EXECUTED: 2
};

contract('Proposal Manager', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank] = accounts;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.bar = await MockBar.new();

    await this.ggr.setContract(await this.ggr.GALT_TOKEN(), this.galtToken.address, { from: coreTeam });

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    // fund factory contracts
    this.fundFactory = await deployFundFactory(this.ggr.address, alice);

    // build fund
    await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
    // support 60 quorum 40
    const fundX = await buildFund(
      this.fundFactory,
      alice,
      false,
      new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK),
      {},
      [bob, charlie, dan],
      2
    );

    this.fundStorageX = fundX.fundStorage;
    this.fundControllerX = fundX.fundController;
    this.fundMultiSigX = fundX.fundMultiSigX;
    this.fundRAX = fundX.fundRA;
    this.fundProposalManagerX = fundX.fundProposalManager;

    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['1', '2', '3', '4', '5'];

    await this.fundRAX.mintAllHack(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });
  });

  describe('proposal creation', () => {
    it('should create a new proposal by default', async function() {
      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, false, false, calldata, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.currentSupport, ether(0));
      assert.equal(res.ayesShare, ether(0));
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));
    });

    it('should count a vote if the castVote flag is true', async function() {
      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, true, false, calldata, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.totalAyes, 300);
      assert.equal(res.currentSupport, ether(100));
      assert.equal(res.ayesShare, ether(20));
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      await assertRevert(this.fundProposalManagerX.aye(proposalId, true, { from: bob }), 'hack');
    });

    it('should only count a vote if both cast/execute flags are true w/o enough support', async function() {
      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, true, true, calldata, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.totalAyes, 300);
      assert.equal(res.currentSupport, ether(100));
      assert.equal(res.ayesShare, ether(20));
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      assert.equal(await this.bar.number(), 0);
    });

    it('should execute script if both cast/execute flags are true with enough support', async function() {
      assert.equal(await this.fundRAX.balanceOf(charlie), 300);
      assert.equal(await this.fundRAX.delegatedBalanceOf(charlie, charlie), 300);
      assert.equal(await this.fundRAX.totalSupply(), 1500);

      await this.fundRAX.delegate(bob, charlie, 300, { from: charlie });
      await this.fundRAX.delegate(bob, dan, 300, { from: dan });
      await this.fundRAX.delegate(bob, eve, 300, { from: eve });

      assert.equal(await this.fundRAX.balanceOf(bob), 1200);

      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, true, true, calldata, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.totalAyes, 1200);
      assert.equal(res.currentSupport, ether(100));
      assert.equal(res.ayesShare, ether(80));
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      assert.equal(await this.bar.number(), 42);
    });

    it('should execute script on aye if execute flags are true with enough support', async function() {
      assert.equal(await this.fundRAX.balanceOf(charlie), 300);
      assert.equal(await this.fundRAX.delegatedBalanceOf(charlie, charlie), 300);
      assert.equal(await this.fundRAX.totalSupply(), 1500);

      await this.fundRAX.delegate(bob, charlie, 200, { from: charlie });
      await this.fundRAX.delegate(bob, dan, 300, { from: dan });
      await this.fundRAX.delegate(bob, eve, 300, { from: eve });

      assert.equal(await this.fundRAX.balanceOf(bob), 1100);

      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, true, true, calldata, 'blah', {
        from: charlie
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [charlie]);

      await this.fundProposalManagerX.aye(proposalId, true, {from: bob});
      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [charlie, bob]);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.totalAyes, 1200);
      assert.equal(res.currentSupport, ether(100));
      assert.equal(res.ayesShare, ether(80));
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      assert.equal(await this.bar.number(), 42);
    });
  });
});
