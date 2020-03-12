const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const SpaceToken = contract.fromArtifact('SpaceToken');
const GaltToken = contract.fromArtifact('GaltToken');
const GaltGlobalRegistry = contract.fromArtifact('GaltGlobalRegistry');
const FundFactory = contract.fromArtifact('FundFactory');

const { deployFundFactory, buildFund, VotingConfig } = require('./deploymentHelpers');
const { ether, assertRevert, initHelperWeb3 } = require('./helpers');

initHelperWeb3(web3);

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  EXECUTED: 2
};

describe('Fee Proposals', () => {
  const [alice, bob, charlie, dan, eve, frank] = accounts;
  const coreTeam = defaultSender;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.spaceToken = await SpaceToken.new(this.ggr.address, 'Name', 'Symbol', { from: coreTeam });

    await this.ggr.setContract(await this.ggr.SPACE_TOKEN(), this.spaceToken.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.GALT_TOKEN(), this.galtToken.address, { from: coreTeam });

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    // fund factory contracts
    this.fundFactory = await deployFundFactory(FundFactory, this.ggr.address, alice);
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
      await this.fundRAX.mintAllHack(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      const feeContract = alice;
      const calldata = this.fundStorageX.contract.methods.addFeeContract(feeContract).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, calldata, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, true, { from: bob });
      await this.fundProposalManagerX.nay(proposalId, { from: charlie });

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);
      assert.sameMembers(res.nays, [charlie]);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, ether(20));
      assert.equal(res.naysShare, ether(20));

      // Deny double-vote
      await assertRevert(this.fundProposalManagerX.aye(proposalId, true, { from: bob }), 'bar');
      await assertRevert(this.fundProposalManagerX.executeProposal(proposalId, 0, { from: dan }), 'foo');

      await this.fundProposalManagerX.aye(proposalId, true, { from: dan });
      await this.fundProposalManagerX.aye(proposalId, true, { from: eve });

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, ether(60));
      assert.equal(res.naysShare, ether(20));
    });
  });
});
