const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
const { ether, assertRevert, evmIncreaseTime } = require('@galtproject/solidity-test-chest')(web3);

const GaltToken = contract.fromArtifact('GaltToken');
const MockBar = contract.fromArtifact('MockBar');
const GaltGlobalRegistry = contract.fromArtifact('GaltGlobalRegistry');
const PrivateFundFactory = contract.fromArtifact('PrivateFundFactory');

const { deployFundFactory, buildPrivateFund, VotingConfig } = require('./deploymentHelpers');

MockBar.numberFormat = 'String';

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  EXECUTED: 2
};

describe('Proposal Manager', () => {
  const [alice, bob, charlie, dan, eve, frank] = accounts;
  const coreTeam = defaultSender;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.bar = await MockBar.new();

    await this.ggr.setContract(await this.ggr.GALT_TOKEN(), this.galtToken.address, { from: coreTeam });

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    // fund factory contracts
    this.fundFactory = await deployFundFactory(
      PrivateFundFactory,
      this.ggr.address,
      alice,
      true,
      ether(10),
      ether(20)
    );

    await this.fundFactory.setFeeManager(coreTeam, {from: alice});
  });

  beforeEach(async function() {
    // build fund
    await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
    // support 60 quorum 40
    const fundX = await buildPrivateFund(
      this.fundFactory,
      alice,
      false,
      new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK),
      {},
      [bob, charlie, dan],
      2
    );

    this.fundRegistryX = fundX.fundRegistry;
    this.fundStorageX = fundX.fundStorage;
    this.fundControllerX = fundX.fundController;
    this.fundMultiSigX = fundX.fundMultiSig;
    this.fundRAX = fundX.fundRA;
    this.fundProposalManagerX = fundX.fundProposalManager;

    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['1', '2', '3', '4', '5'];

    await this.fundRAX.mintAllHack(this.beneficiaries, this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });
  });

  describe('proposal creation', () => {
    it('should create a new proposal by default', async function() {
      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, false, false, calldata, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, ether(0));
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.currentQuorum, ether(0));
      assert.equal(res.currentSupport, ether(0));
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
      assert.equal(res.totalAyes, 300);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.currentSupport, ether(100));
      assert.equal(res.ayesShare, ether(20));
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      await assertRevert(this.fundProposalManagerX.aye(proposalId, true, { from: bob }), 'Element already exists');
    });

    it('should only count a vote if both cast/execute flags are true w/o enough support', async function() {
      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, true, true, calldata, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);
      assert.equal(res.totalAyes, 300);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
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
      assert.equal(res.totalAyes, 1200);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.currentSupport, ether(100));
      assert.equal(res.ayesShare, ether(80));
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      assert.equal(await this.bar.number(), 42);
    });

    it('should execute script on aye if execute flags are true with enough support', async function() {
      await this.fundRAX.delegate(bob, charlie, 300, { from: charlie });
      await this.fundRAX.delegate(bob, dan, 300, { from: dan });
      await this.fundRAX.delegate(bob, eve, 100, { from: eve });

      assert.equal(await this.fundRAX.balanceOf(bob), 1000);

      await this.fundRAX.delegate(charlie, dan, 200, { from: bob });

      assert.equal(await this.fundRAX.balanceOf(bob), 800);
      assert.equal(await this.fundRAX.balanceOf(charlie), 200);

      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, true, true, calldata, 'blah', {
        from: charlie
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [charlie]);

      await this.fundProposalManagerX.aye(proposalId, true, { from: bob });
      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [charlie, bob]);
      assert.equal(res.totalAyes, 1000);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, '66666666666666666666');
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.currentSupport, ether(100));
      assert.equal(res.currentQuorum, '66666666666666666666');
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      assert.equal(await this.bar.number(), 42);
    });
  });

  describe('execution before timeout', () => {
    let proposalId;

    beforeEach(async function() {
      // transfer 1 reputation point to make charlies reputation eq. 201
      await this.fundRAX.delegate(charlie, dan, 1, { from: dan });
      assert.equal(await this.fundRAX.balanceOf(bob), 300);
      assert.equal(await this.fundRAX.balanceOf(charlie), 301);

      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, true, true, calldata, 'blah', {
        from: bob
      });

      proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, ether(20));
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.currentQuorum, ether(20));
      assert.equal(res.currentSupport, ether(100));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);
    });

    it('it should allow immediately executing on aye vote  when support threshold is reached', async function() {
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });
      await this.fundProposalManagerX.aye(proposalId, true, { from: eve });

      let res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [charlie, bob, eve]);
      assert.equal(res.totalAyes, 901);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, '60066666666666666666');
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.currentQuorum, '60066666666666666666');
      assert.equal(res.currentSupport, ether(100));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      assert.equal(await this.bar.number(), 42);
    });

    it('it should allow delayed execution when support threshold is reached by aye vote', async function() {
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });
      await this.fundProposalManagerX.aye(proposalId, false, { from: eve });

      let res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [charlie, bob, eve]);
      assert.equal(res.totalAyes, 901);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, '60066666666666666666');
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.currentQuorum, '60066666666666666666');
      assert.equal(res.currentSupport, ether(100));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      await this.fundProposalManagerX.executeProposal(proposalId, 0);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      assert.equal(await this.bar.number(), 42);
    });
  });

  describe('execution after timeout', () => {
    let proposalId;

    beforeEach(async function() {
      // transfer 1 reputation point to make charlies reputation eq. 201
      await this.fundRAX.delegate(charlie, dan, 1, { from: dan });
      assert.equal(await this.fundRAX.balanceOf(bob), 300);
      assert.equal(await this.fundRAX.balanceOf(charlie), 301);

      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, true, true, calldata, 'blah', {
        from: bob
      });

      proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, ether(20));
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.currentQuorum, ether(20));
      assert.equal(res.currentSupport, ether(100));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);
    });

    it('it allow execution with S- / S+ Q+', async function() {
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });
      await this.fundProposalManagerX.abstain(proposalId, false, { from: eve });

      let res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [charlie, bob]);
      assert.sameMembers(res.abstains, [eve]);
      assert.equal(res.totalAyes, 601);
      assert.equal(res.totalAbstains, 300);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, '40066666666666666666');
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.abstainsShare, ether(20));
      assert.equal(res.currentQuorum, '60066666666666666666');
      assert.equal(res.currentSupport, '66703662597114317425');
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      await assertRevert(this.fundProposalManagerX.executeProposal(proposalId, 0), 'Proposal is still active');

      await evmIncreaseTime(VotingConfig.ONE_WEEK + 3);

      await this.fundProposalManagerX.executeProposal(proposalId, 0);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      assert.equal(await this.bar.number(), 42);
    });

    it('it deny execution with S- / S- Q+', async function() {
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });
      await this.fundProposalManagerX.abstain(proposalId, true, { from: bob });
      await this.fundProposalManagerX.abstain(proposalId, false, { from: eve });

      let res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [charlie]);
      assert.sameMembers(res.abstains, [bob, eve]);
      assert.equal(res.totalAyes, 301);
      assert.equal(res.totalAbstains, 600);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, '20066666666666666666');
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.abstainsShare, ether(40));
      assert.equal(res.currentQuorum, '60066666666666666666');
      assert.equal(res.currentSupport, '33407325194228634850');
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      await assertRevert(this.fundProposalManagerX.executeProposal(proposalId, 0), 'Proposal is still active');

      await evmIncreaseTime(VotingConfig.ONE_WEEK + 3);

      await assertRevert(this.fundProposalManagerX.executeProposal(proposalId, 0), "Support hasn't been reached");
    });

    it('it deny execution with S- / S- Q+', async function() {
      await this.fundProposalManagerX.abstain(proposalId, true, { from: eve });

      let res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);
      assert.sameMembers(res.abstains, [eve]);
      assert.equal(res.totalAyes, 300);
      assert.equal(res.totalAbstains, 300);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, ether(20));
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.abstainsShare, ether(20));
      assert.equal(res.currentQuorum, ether(40));
      assert.equal(res.currentSupport, ether(50));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      await assertRevert(this.fundProposalManagerX.executeProposal(proposalId, 0), 'Proposal is still active');

      await evmIncreaseTime(VotingConfig.ONE_WEEK + 3);

      await assertRevert(this.fundProposalManagerX.executeProposal(proposalId, 0), "Support hasn't been reached");
    });

    it('it deny execution with S- / S+ Q-', async function() {
      // transfer 1 reputation point to make charlies reputation eq. 201
      await this.fundRAX.delegate(dan, bob, 150, { from: bob });
      await this.fundRAX.delegate(dan, eve, 200, { from: eve });
      assert.equal(await this.fundRAX.balanceOf(bob), 150);
      assert.equal(await this.fundRAX.balanceOf(eve), 100);

      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, true, true, calldata, 'blah', {
        from: bob
      });

      proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.abstain(proposalId, true, { from: eve });

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);
      assert.sameMembers(res.abstains, [eve]);
      assert.equal(res.totalAyes, 150);
      assert.equal(res.totalAbstains, 100);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, ether(10));
      assert.equal(res.naysShare, ether(0));
      assert.equal(res.abstainsShare, '6666666666666666666');
      assert.equal(res.currentQuorum, '16666666666666666666');
      assert.equal(res.currentSupport, ether(60));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(40));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      await assertRevert(this.fundProposalManagerX.executeProposal(proposalId, 0), 'Proposal is still active');

      await evmIncreaseTime(VotingConfig.ONE_WEEK + 3);

      await assertRevert(this.fundProposalManagerX.executeProposal(proposalId, 0), "MIN quorum hasn't been reached");
    });
  });

  describe('accept fee', () => {
    let proposalId;

    beforeEach(async function () {
      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, true, true, calldata, 'blah', {
        from: bob
      });

      proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.setEthFee(ether(0.001), {from: coreTeam});
    });

    it('should accept fee for voting and creating proposals', async function () {
      await assertRevert(this.fundProposalManagerX.aye(proposalId, true, {from: charlie}), 'Fee and msg.value not equal.');
      await assertRevert(this.fundProposalManagerX.nay(proposalId, {from: charlie}), 'Fee and msg.value not equal.');
      await assertRevert(this.fundProposalManagerX.abstain(proposalId, true, {from: charlie, value: ether(0.002) }), 'Fee and msg.value not equal.');

      let res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.abstains, []);

      await this.fundProposalManagerX.nay(proposalId, {from: charlie, value: ether(0.001) });
      await this.fundProposalManagerX.aye(proposalId, true, {from: charlie, value: ether(0.001) });
      await this.fundProposalManagerX.abstain(proposalId, true, {from: charlie, value: ether(0.001) });

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.abstains, [charlie]);

      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      await assertRevert(
        this.fundProposalManagerX.propose(this.bar.address, 0, true, true, calldata, 'blah', {
          from: bob
        }),
        'Fee and msg.value not equal.'
      );
      this.fundProposalManagerX.propose(this.bar.address, 0, true, true, calldata, 'blah', {
        from: bob,
        value: ether(0.001)
      });
      await this.fundProposalManagerX.propose(this.bar.address, 0, false, false, calldata, 'blah', {
        from: bob
      });
    });
  });
});
