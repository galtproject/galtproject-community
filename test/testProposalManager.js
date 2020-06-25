const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
const {
  ether,
  assertRevert,
  evmIncreaseTime,
  increaseTime,
  zeroAddress,
  assertErc20BalanceChanged
} = require('@galtproject/solidity-test-chest')(web3);

const GaltToken = contract.fromArtifact('GaltToken');
const MockBar = contract.fromArtifact('MockBar');
const PPGlobalRegistry = contract.fromArtifact('PPGlobalRegistry');
const PrivateFundFactory = contract.fromArtifact('PrivateFundFactory');
const EthFeeRegistry = contract.fromArtifact('EthFeeRegistry');
const ERC20Mintable = contract.fromArtifact('ERC20Mintable');

const { deployFundFactory, buildPrivateFund, VotingConfig, CustomVotingConfig } = require('./deploymentHelpers');

MockBar.numberFormat = 'String';
ERC20Mintable.numberFormat = 'String';

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  EXECUTED: 2
};

const Choice = {
  PENDING: 0,
  AYE: 1,
  NAY: 2,
  ABSTAIN: 3
};

const { keccak256 } = web3.utils;

describe('Proposal Manager', () => {
  const [alice, bob, charlie, dan, eve, frank, feeManager] = accounts;
  const coreTeam = defaultSender;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.ppgr = await PPGlobalRegistry.new();
    this.bar = await MockBar.new();
    this.ppFeeRegistry = await EthFeeRegistry.new();

    await this.ppFeeRegistry.initialize(feeManager, feeManager, [], []);

    await this.ppgr.setContract(await this.ppgr.PPGR_GALT_TOKEN(), this.galtToken.address);
    await this.ppgr.setContract(await this.ppgr.PPGR_FEE_REGISTRY(), this.ppFeeRegistry.address);

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    // fund factory contracts
    this.fundFactory = await deployFundFactory(
      PrivateFundFactory,
      this.ppgr.address,
      alice,
      true,
      ether(10),
      ether(20)
    );

    await this.fundFactory.setFeeManager(coreTeam, { from: alice });
  });

  beforeEach(async function() {
    // build fund
    await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
    // support 60 quorum 40
    const fundX = await buildPrivateFund(
      this.fundFactory,
      alice,
      false,
      new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK, 0),
      {
        foo: new CustomVotingConfig(
          this.bar.address,
          '0x3f203935',
          ether(60),
          ether(40),
          VotingConfig.ONE_WEEK,
          VotingConfig.THREE_DAYS
        )
      },
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

    await this.fundRAX.mintAllHack(this.beneficiaries, this.beneficiaries, this.benefeciarSpaceTokens, 300, {
      from: alice
    });
  });

  describe('proposal creation', () => {
    it('should create a new proposal by default', async function() {
      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(
        this.bar.address,
        0,
        false,
        false,
        false,
        zeroAddress,
        calldata,
        'blah',
        {
          from: bob
        }
      );

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
      let res = await this.fundProposalManagerX.propose(
        this.bar.address,
        0,
        true,
        false,
        false,
        zeroAddress,
        calldata,
        'blah',
        {
          from: bob
        }
      );

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
      let res = await this.fundProposalManagerX.propose(
        this.bar.address,
        0,
        true,
        true,
        false,
        zeroAddress,
        calldata,
        'blah',
        {
          from: bob
        }
      );

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
      let res = await this.fundProposalManagerX.propose(
        this.bar.address,
        0,
        true,
        true,
        false,
        zeroAddress,
        calldata,
        'blah',
        {
          from: bob
        }
      );

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
      let res = await this.fundProposalManagerX.propose(
        this.bar.address,
        0,
        true,
        true,
        false,
        zeroAddress,
        calldata,
        'blah',
        {
          from: charlie
        }
      );

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

    it('should deny creating commitReveal vote when missing commitmentTimeout', async function() {
      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      await assertRevert(
        this.fundProposalManagerX.propose(this.bar.address, 0, false, false, true, zeroAddress, calldata, 'blah', {
          from: charlie
        }),
        'Missing committing timeout'
      );
    });

    it('should create commitReveal type proposal when specified', async function() {
      await this.fundRAX.delegate(bob, charlie, 300, { from: charlie });
      await this.fundRAX.delegate(bob, dan, 300, { from: dan });
      await this.fundRAX.delegate(bob, eve, 100, { from: eve });
      await this.fundRAX.delegate(charlie, dan, 200, { from: bob });

      const calldata = this.bar.contract.methods.setAnotherNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(
        this.bar.address,
        0,
        false,
        false,
        true,
        zeroAddress,
        calldata,
        'blah',
        {
          from: charlie
        }
      );

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.equal(res.isCommitReveal, true);
    });
  });

  describe('commitReveal proposals', () => {
    let proposalId;
    const str0 = '0-foo';
    const str1 = '1-bar';
    const str2 = '2-bar';
    const str3 = '3-bar';
    const hash0 = keccak256(web3.eth.abi.encodeParameter('string', str0));
    const hash1 = keccak256(web3.eth.abi.encodeParameter('string', str1));
    const hash2 = keccak256(web3.eth.abi.encodeParameter('string', str2));
    const hash3 = keccak256(web3.eth.abi.encodeParameter('string', str3));

    beforeEach(async function() {
      await this.fundRAX.delegate(bob, charlie, 300, { from: charlie });
      await this.fundRAX.delegate(bob, dan, 300, { from: dan });
      await this.fundRAX.delegate(bob, eve, 100, { from: eve });
      await this.fundRAX.delegate(charlie, dan, 200, { from: bob });

      const calldata = this.bar.contract.methods.setAnotherNumber(42).encodeABI();
      const res = await this.fundProposalManagerX.propose(
        this.bar.address,
        0,
        false,
        false,
        true,
        zeroAddress,
        calldata,
        'blah',
        {
          from: charlie
        }
      );

      proposalId = res.logs[0].args.proposalId.toString(10);
    });

    it('should allow committing for proposal type several times until committingTimeout', async function() {
      await this.fundProposalManagerX.commit(proposalId, hash0, { from: charlie });
      assert.equal(await this.fundProposalManagerX.getCommitmentOf(proposalId, charlie), hash0);

      await this.fundProposalManagerX.commit(proposalId, hash1, { from: charlie });
      assert.equal(await this.fundProposalManagerX.getCommitmentOf(proposalId, charlie), hash1);
    });

    it('should allow revealing ayes after committingTimeout', async function() {
      await this.fundProposalManagerX.commit(proposalId, hash1, { from: charlie });
      await increaseTime(VotingConfig.THREE_DAYS + 5);

      assert.equal(await this.fundProposalManagerX.getParticipantProposalChoice(proposalId, charlie), Choice.PENDING);
      await this.fundProposalManagerX.ayeReveal(proposalId, charlie, false, str1, { from: eve });
      assert.equal(await this.fundProposalManagerX.getParticipantProposalChoice(proposalId, charlie), Choice.AYE);
    });

    it('should allow revealing nays after committingTimeout', async function() {
      await this.fundProposalManagerX.commit(proposalId, hash2, { from: charlie });
      await increaseTime(VotingConfig.THREE_DAYS + 5);

      assert.equal(await this.fundProposalManagerX.getParticipantProposalChoice(proposalId, charlie), Choice.PENDING);
      await this.fundProposalManagerX.nayReveal(proposalId, charlie, str2, { from: eve });
      assert.equal(await this.fundProposalManagerX.getParticipantProposalChoice(proposalId, charlie), Choice.NAY);
    });

    it('should allow revealing abstain after committingTimeout', async function() {
      await this.fundProposalManagerX.commit(proposalId, hash3, { from: charlie });
      await increaseTime(VotingConfig.THREE_DAYS + 5);

      assert.equal(await this.fundProposalManagerX.getParticipantProposalChoice(proposalId, charlie), Choice.PENDING);
      await this.fundProposalManagerX.abstainReveal(proposalId, charlie, true, str3, { from: charlie });
      assert.equal(await this.fundProposalManagerX.getParticipantProposalChoice(proposalId, charlie), Choice.ABSTAIN);
    });

    it('should deny committing after committingTimeout', async function() {
      await increaseTime(VotingConfig.THREE_DAYS + 5);
      await assertRevert(
        this.fundProposalManagerX.commit(proposalId, hash1, { from: charlie }),
        'Committing is closed'
      );
    });

    it('should deny revealing until committingTimeout', async function() {
      await this.fundProposalManagerX.commit(proposalId, hash0, { from: charlie });
      await assertRevert(
        this.fundProposalManagerX.ayeReveal(proposalId, charlie, false, str1, { from: charlie }),
        "Revealing isn't open"
      );
    });

    it('should deny aye revealing with non aye (1) choice', async function() {
      await this.fundProposalManagerX.commit(proposalId, hash2, { from: charlie });
      await increaseTime(VotingConfig.THREE_DAYS + 5);
      await assertRevert(
        this.fundProposalManagerX.ayeReveal(proposalId, charlie, false, str2, { from: charlie }),
        'Invalid choice decoded'
      );
    });

    it('should deny nay revealing with non nay (2) choice', async function() {
      await this.fundProposalManagerX.commit(proposalId, hash1, { from: charlie });
      await increaseTime(VotingConfig.THREE_DAYS + 5);
      await assertRevert(
        this.fundProposalManagerX.nayReveal(proposalId, charlie, str1, { from: charlie }),
        'Invalid choice decoded'
      );
    });

    it('should deny abstain revealing with non abstain (3) choice', async function() {
      await this.fundProposalManagerX.commit(proposalId, hash1, { from: charlie });
      await increaseTime(VotingConfig.THREE_DAYS + 5);
      await assertRevert(
        this.fundProposalManagerX.abstainReveal(proposalId, charlie, false, str1, { from: charlie }),
        'Invalid choice decoded'
      );
    });

    it('should deny revealing twice', async function() {
      await this.fundProposalManagerX.commit(proposalId, hash1, { from: charlie });
      await increaseTime(VotingConfig.THREE_DAYS + 5);
      await this.fundProposalManagerX.ayeReveal(proposalId, charlie, false, str1, { from: charlie });
      await assertRevert(
        this.fundProposalManagerX.ayeReveal(proposalId, charlie, false, str1, { from: charlie }),
        'Already revealed'
      );
    });

    it('should deny committing for commitReveal proposal type', async function() {
      const calldata = this.bar.contract.methods.setAnotherNumber(42).encodeABI();
      const res = await this.fundProposalManagerX.propose(
        this.bar.address,
        0,
        false,
        false,
        false,
        zeroAddress,
        calldata,
        'blah',
        {
          from: charlie
        }
      );

      proposalId = res.logs[0].args.proposalId.toString(10);

      await assertRevert(
        this.fundProposalManagerX.commit(proposalId, hash1, { from: charlie }),
        'Not a commit-reveal vote'
      );
    });

    it('should allow executing proposals after committingTimeout before timeout', async function() {
      await this.fundProposalManagerX.commit(proposalId, hash1, { from: charlie });
      await this.fundProposalManagerX.commit(proposalId, hash1, { from: bob });
      await increaseTime(VotingConfig.THREE_DAYS + 5);
      await this.fundProposalManagerX.ayeReveal(proposalId, charlie, false, str1, { from: charlie });
      await this.fundProposalManagerX.ayeReveal(proposalId, bob, false, str1, { from: bob });

      let res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.currentSupport, ether(100));
      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      await this.fundProposalManagerX.executeProposal(proposalId, 0);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);
    });

    it('should allow executing proposals after timeout', async function() {
      await this.fundProposalManagerX.commit(proposalId, hash1, { from: charlie });
      await this.fundProposalManagerX.commit(proposalId, hash1, { from: bob });
      await increaseTime(VotingConfig.THREE_DAYS + 5);
      await this.fundProposalManagerX.ayeReveal(proposalId, charlie, false, str1, { from: alice });
      await this.fundProposalManagerX.ayeReveal(proposalId, bob, false, str1, { from: alice });

      let res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.currentSupport, ether(100));
      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      await increaseTime(VotingConfig.ONE_WEEK + 3);
      await this.fundProposalManagerX.executeProposal(proposalId, 0);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);
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
      let res = await this.fundProposalManagerX.propose(
        this.bar.address,
        0,
        true,
        true,
        false,
        zeroAddress,
        calldata,
        'blah',
        {
          from: bob
        }
      );

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
      let res = await this.fundProposalManagerX.propose(
        this.bar.address,
        0,
        true,
        true,
        false,
        zeroAddress,
        calldata,
        'blah',
        {
          from: bob
        }
      );

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
      let res = await this.fundProposalManagerX.propose(
        this.bar.address,
        0,
        true,
        true,
        false,
        zeroAddress,
        calldata,
        'blah',
        {
          from: bob
        }
      );

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

    beforeEach(async function() {
      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      const res = await this.fundProposalManagerX.propose(
        this.bar.address,
        0,
        true,
        true,
        false,
        zeroAddress,
        calldata,
        'blah',
        {
          from: bob
        }
      );

      proposalId = res.logs[0].args.proposalId.toString(10);

      await this.ppFeeRegistry.setEthFeeKeysAndValues(
        [await this.fundProposalManagerX.VOTE_FEE_KEY()],
        [ether(0.001)],
        { from: feeManager }
      );
    });

    it('should accept fee for voting and creating proposals', async function() {
      await assertRevert(
        this.fundProposalManagerX.aye(proposalId, true, { from: charlie }),
        'Fee and msg.value not equal.'
      );
      await assertRevert(this.fundProposalManagerX.nay(proposalId, { from: charlie }), 'Fee and msg.value not equal.');
      await assertRevert(
        this.fundProposalManagerX.abstain(proposalId, true, { from: charlie, value: ether(0.002) }),
        'Fee and msg.value not equal.'
      );

      let res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.abstains, []);

      await this.fundProposalManagerX.nay(proposalId, { from: charlie, value: ether(0.001) });
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie, value: ether(0.001) });
      await this.fundProposalManagerX.abstain(proposalId, true, { from: charlie, value: ether(0.001) });

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.abstains, [charlie]);

      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      await assertRevert(
        this.fundProposalManagerX.propose(this.bar.address, 0, true, true, false, zeroAddress, calldata, 'blah', {
          from: bob
        }),
        'Fee and msg.value not equal.'
      );
      await this.fundProposalManagerX.propose(this.bar.address, 0, true, true, false, zeroAddress, calldata, 'blah', {
        from: bob,
        value: ether(0.001)
      });
      await this.fundProposalManagerX.propose(this.bar.address, 0, false, false, false, zeroAddress, calldata, 'blah', {
        from: bob
      });
    });
  });

  describe('reward distribution', () => {
    let proposalId;
    let myToken;

    beforeEach(async function() {
      myToken = await ERC20Mintable.new();
      await myToken.mint(alice, ether(200));
      await myToken.mint(bob, ether(200));

      await this.fundRAX.delegate(charlie, dan, 1, { from: dan });
      assert.equal(await this.fundRAX.balanceOf(bob), 300);
      assert.equal(await this.fundRAX.balanceOf(charlie), 301);

      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      const res = await this.fundProposalManagerX.propose(
        this.bar.address,
        0,
        true,
        true,
        false,
        myToken.address,
        calldata,
        'blah',
        {
          from: bob
        }
      );

      proposalId = res.logs[0].args.proposalId.toString(10);
    });

    it('should allow anyone depositing to a contract', async function() {
      assert.equal(await myToken.balanceOf(this.fundProposalManagerX.address), ether(0));

      await myToken.approve(this.fundProposalManagerX.address, ether(200), { from: alice });
      await myToken.approve(this.fundProposalManagerX.address, ether(200), { from: bob });
      await this.fundProposalManagerX.depositErc20Reward(proposalId, ether(200), { from: alice });
      await this.fundProposalManagerX.depositErc20Reward(proposalId, ether(200), { from: bob });

      assert.equal(await this.fundProposalManagerX.rewardContracts(proposalId), myToken.address);
      assert.equal(await this.fundProposalManagerX.totalDeposited(proposalId), ether(400));
      assert.equal(await myToken.balanceOf(this.fundProposalManagerX.address), ether(400));
    });

    it('should deny depositing to a non existing proposal', async function() {
      await myToken.approve(this.fundProposalManagerX.address, ether(200), { from: alice });
      await assertRevert(
        this.fundProposalManagerX.depositErc20Reward(proposalId + 3, ether(200), { from: alice }),
        "FundProposalManager: Proposal isn't open"
      );
    });

    it('should deny depositing to already executed proposal', async function() {
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });
      await this.fundProposalManagerX.aye(proposalId, true, { from: eve });

      await myToken.approve(this.fundProposalManagerX.address, ether(200), { from: alice });
      await assertRevert(
        this.fundProposalManagerX.depositErc20Reward(proposalId + 3, ether(200), { from: alice }),
        "FundProposalManager: Proposal isn't open"
      );
    });

    it('should deny a voter claiming rewards if a proposal is still active', async function() {
      const res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);
      await myToken.approve(this.fundProposalManagerX.address, ether(200), { from: bob });
      await this.fundProposalManagerX.depositErc20Reward(proposalId, ether(200), { from: bob });

      await assertRevert(
        this.fundProposalManagerX.claimErc20Reward(proposalId, { from: alice }),
        'FundProposalManager: Rewards will be available after the voting ends.'
      );
    });

    it('should allow a voter claiming rewards for their votes', async function() {
      await myToken.approve(this.fundProposalManagerX.address, ether(200), { from: alice });
      await myToken.approve(this.fundProposalManagerX.address, ether(200), { from: bob });
      await this.fundProposalManagerX.depositErc20Reward(proposalId, ether(200), { from: alice });
      await this.fundProposalManagerX.depositErc20Reward(proposalId, ether(200), { from: bob });

      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });
      await this.fundProposalManagerX.aye(proposalId, true, { from: eve });

      let res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);
      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.equal(res.totalVotes, 3);

      await increaseTime(VotingConfig.ONE_WEEK + 3);

      const aliceBalanceBefore = await myToken.balanceOf(alice);
      await this.fundProposalManagerX.claimErc20Reward(proposalId, { from: alice });
      await this.fundProposalManagerX.claimErc20Reward(proposalId, { from: charlie });
      await this.fundProposalManagerX.claimErc20Reward(proposalId, { from: eve });
      const aliceBalanceAfter = await myToken.balanceOf(alice);

      assertErc20BalanceChanged(aliceBalanceBefore, aliceBalanceAfter, '133333333333333333333');
    });

    it('should deny a voter claiming rewards twice', async function() {
      await myToken.approve(this.fundProposalManagerX.address, ether(200), { from: bob });
      await this.fundProposalManagerX.depositErc20Reward(proposalId, ether(200), { from: bob });

      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });
      await this.fundProposalManagerX.aye(proposalId, true, { from: eve });

      await increaseTime(VotingConfig.ONE_WEEK + 3);
      await this.fundProposalManagerX.claimErc20Reward(proposalId, { from: alice });
      await assertRevert(
        this.fundProposalManagerX.claimErc20Reward(proposalId, { from: alice }),
        'FundProposalManager: Reward is already claimed'
      );
    });
  });
});
