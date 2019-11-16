const galt = require('@galtproject/utils');

const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');

const { deployFundFactory, buildFund } = require('./deploymentHelpers');
const { ether, assertRevert, initHelperWeb3, fullHex, int, getDestinationMarker } = require('./helpers');

const { web3 } = SpaceToken;
const bytes32 = web3.utils.utf8ToHex;

initHelperWeb3(web3);

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  APPROVED: 2,
  EXECUTED: 3,
  REJECTED: 4
};

contract('FundProposalManager', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank, george] = accounts;

  before(async function() {
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.galtToken = await GaltToken.new({ from: coreTeam });
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
      // [60, 50, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 5],
      [bob, charlie, dan],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundControllerX = fund.fundController;
    this.fundMultiSigX = fund.fundMultiSig;
    this.fundRAX = fund.fundRA;
    this.fundProposalManagerX = fund.fundProposalManager;

    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['1', '2', '3', '4', '5'];
  });

  describe('FundProposalManager', () => {
    describe('proposal creation', () => {
      it('should allow user who has reputation creating a new proposal', async function() {
        await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

        const proposalData = this.fundStorageX.contract.methods
          .setProposalThreshold(bytes32('modify_config_threshold'), 420000)
          .encodeABI();

        let res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, proposalData, 'blah', {
          from: bob
        });

        const proposalId = res.logs[0].args.proposalId.toString(10);

        res = await this.fundProposalManagerX.proposals(proposalId);
        assert.equal(res.description, 'blah');
      });
    });

    describe('(Proposal contracts queries FundRA for addresses locked reputation share)', () => {
      it('should allow reverting a proposal if negative votes threshold is reached', async function() {
        await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

        const marker = getDestinationMarker(this.fundStorageX, 'setProposalThreshold');

        const proposalData = this.fundStorageX.contract.methods
          .setProposalThreshold(bytes32('modify_config_threshold'), 420000)
          .encodeABI();

        let res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, proposalData, 'blah', {
          from: bob
        });

        const proposalId = res.logs[0].args.proposalId.toString(10);

        await this.fundProposalManagerX.aye(proposalId, { from: bob });
        await this.fundProposalManagerX.nay(proposalId, { from: charlie });

        res = await this.fundProposalManagerX.getParticipantProposalChoice(proposalId, bob);
        assert.equal(res, '1');
        res = await this.fundProposalManagerX.getParticipantProposalChoice(proposalId, charlie);
        assert.equal(res, '2');

        res = await this.fundProposalManagerX.getProposalVoting(proposalId);
        assert.sameMembers(res.ayes, [bob]);
        assert.sameMembers(res.nays, [charlie]);

        res = await this.fundProposalManagerX.proposals(proposalId);
        assert.equal(res.status, ProposalStatus.ACTIVE);

        res = await this.fundProposalManagerX.getActiveProposals(marker);
        assert.sameMembers(res.map(int), [1]);
        res = await this.fundProposalManagerX.getApprovedProposals(marker);
        assert.sameMembers(res.map(int), []);
        res = await this.fundProposalManagerX.getRejectedProposals(marker);
        assert.sameMembers(res.map(int), []);

        res = await this.fundProposalManagerX.getAyeShare(proposalId);
        assert.equal(res, 200000);
        res = await this.fundProposalManagerX.getNayShare(proposalId);
        assert.equal(res, 200000);
        res = await this.fundProposalManagerX.getThreshold(proposalId);
        assert.equal(res, 600000);

        // Deny double-vote
        await assertRevert(this.fundProposalManagerX.aye(proposalId, { from: bob }));

        await assertRevert(this.fundProposalManagerX.triggerReject(proposalId, { from: dan }));

        await this.fundProposalManagerX.nay(proposalId, { from: dan });
        await this.fundProposalManagerX.nay(proposalId, { from: eve });

        res = await this.fundProposalManagerX.getAyeShare(proposalId);
        assert.equal(res, 200000);
        res = await this.fundProposalManagerX.getNayShare(proposalId);
        assert.equal(res, 600000);

        await this.fundProposalManagerX.triggerReject(proposalId, { from: dan });

        res = await this.fundProposalManagerX.proposals(proposalId);
        assert.equal(res.status, ProposalStatus.REJECTED);

        res = await this.fundProposalManagerX.getActiveProposals(marker);
        assert.sameMembers(res.map(int), []);
        res = await this.fundProposalManagerX.getApprovedProposals(marker);
        assert.sameMembers(res.map(int), []);
        res = await this.fundProposalManagerX.getRejectedProposals(marker);
        assert.sameMembers(res.map(int), [1]);
      });

      it('should allow approving proposal if positive votes threshold is reached', async function() {
        await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

        const marker = getDestinationMarker(this.fundStorageX, 'setProposalThreshold');

        const proposalData = this.fundStorageX.contract.methods.setProposalThreshold(marker, 420000).encodeABI();

        let res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, proposalData, 'blah', {
          from: bob
        });

        const proposalId = res.logs[0].args.proposalId.toString(10);

        res = await this.fundProposalManagerX.getActiveProposals(marker);
        assert.sameMembers(res.map(int), [1]);
        res = await this.fundProposalManagerX.getApprovedProposals(marker);
        assert.sameMembers(res.map(int), []);
        res = await this.fundProposalManagerX.getRejectedProposals(marker);
        assert.sameMembers(res.map(int), []);

        await this.fundProposalManagerX.aye(proposalId, { from: bob });
        await this.fundProposalManagerX.nay(proposalId, { from: charlie });

        res = await this.fundProposalManagerX.proposals(proposalId);
        assert.equal(res.status, ProposalStatus.ACTIVE);

        res = await this.fundProposalManagerX.getProposalVoting(proposalId);
        assert.sameMembers(res.ayes, [bob]);
        assert.sameMembers(res.nays, [charlie]);

        res = await this.fundProposalManagerX.getAyeShare(proposalId);
        assert.equal(res, 200000);
        res = await this.fundProposalManagerX.getNayShare(proposalId);
        assert.equal(res, 200000);
        res = await this.fundProposalManagerX.getThreshold(proposalId);
        assert.equal(res, 600000);

        // Deny double-vote
        await assertRevert(this.fundProposalManagerX.aye(proposalId, { from: bob }));

        await assertRevert(this.fundProposalManagerX.triggerReject(proposalId, { from: dan }));

        res = await this.fundProposalManagerX.proposals(proposalId);
        assert.equal(res.status, ProposalStatus.ACTIVE);

        await this.fundProposalManagerX.aye(proposalId, { from: dan });
        await this.fundProposalManagerX.aye(proposalId, { from: eve });

        res = await this.fundProposalManagerX.getAyeShare(proposalId);
        assert.equal(res, 600000);
        res = await this.fundProposalManagerX.getNayShare(proposalId);
        assert.equal(res, 200000);

        // Revert attempt should fail
        await assertRevert(this.fundProposalManagerX.triggerReject(proposalId));

        await this.fundProposalManagerX.triggerApprove(proposalId);

        res = await this.fundProposalManagerX.proposals(proposalId);
        assert.equal(res.status, ProposalStatus.EXECUTED);

        res = await this.fundStorageX.thresholds(marker);
        assert.equal(res, '420000');

        res = await this.fundProposalManagerX.getActiveProposals(marker);
        assert.sameMembers(res.map(int), []);
        res = await this.fundProposalManagerX.getApprovedProposals(marker);
        assert.sameMembers(res.map(int), [1]);
        res = await this.fundProposalManagerX.getRejectedProposals(marker);
        assert.sameMembers(res.map(int), []);

        res = await this.fundProposalManagerX.getThreshold(proposalId);
        assert.equal(res, 420000);
      });
    });
  });

  describe('SetAddFundRuleProposalManager', () => {
    it('should add/deactivate a rule', async function() {
      await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      const addFundRuleMarker = getDestinationMarker(this.fundStorageX, 'addFundRule');

      const ipfsHash = galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd');
      let proposalData = this.fundStorageX.contract.methods.addFundRule(ipfsHash, 'Do that').encodeABI();

      let res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, proposalData, 'hey', {
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

      await this.fundProposalManagerX.triggerApprove(proposalId, { from: dan });

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // verify value changed
      res = await this.fundStorageX.getActiveFundRulesCount();
      assert.equal(res, 1);

      res = await this.fundStorageX.getActiveFundRules();
      assert.sameMembers(res.map(int), [0]);

      res = await this.fundStorageX.fundRules(0);
      assert.equal(res.active, true);
      assert.equal(res.id, 0);
      assert.equal(res.ipfsHash, galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd'));
      assert.equal(res.description, 'Do that');

      const ruleId = int(res.id);

      // >>> deactivate aforementioned proposal

      const disableFundRuleMarker = getDestinationMarker(this.fundStorageX, 'disableFundRule');

      proposalData = this.fundStorageX.contract.methods.disableFundRule(ruleId).encodeABI();

      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, proposalData, 'obsolete', {
        from: bob
      });

      const removeProposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(removeProposalId, { from: bob });
      await this.fundProposalManagerX.nay(removeProposalId, { from: charlie });

      res = await this.fundProposalManagerX.getProposalVoting(removeProposalId);
      assert.sameMembers(res.ayes, [bob]);
      assert.sameMembers(res.nays, [charlie]);

      res = await this.fundProposalManagerX.proposals(removeProposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.fundProposalManagerX.getAyeShare(removeProposalId);
      assert.equal(res, 200000);
      res = await this.fundProposalManagerX.getNayShare(removeProposalId);
      assert.equal(res, 200000);

      // Deny double-vote
      await assertRevert(this.fundProposalManagerX.aye(removeProposalId, { from: bob }));
      await assertRevert(this.fundProposalManagerX.triggerReject(removeProposalId, { from: dan }));

      await this.fundProposalManagerX.aye(removeProposalId, { from: dan });
      await this.fundProposalManagerX.aye(removeProposalId, { from: eve });

      res = await this.fundProposalManagerX.getAyeShare(removeProposalId);
      assert.equal(res, 600000);
      res = await this.fundProposalManagerX.getNayShare(removeProposalId);
      assert.equal(res, 200000);

      await this.fundProposalManagerX.triggerApprove(removeProposalId, { from: dan });

      res = await this.fundProposalManagerX.proposals(removeProposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      res = await this.fundProposalManagerX.getActiveProposals(addFundRuleMarker);
      assert.sameMembers(res.map(int), []);
      res = await this.fundProposalManagerX.getActiveProposals(disableFundRuleMarker);
      assert.sameMembers(res.map(int), []);
      res = await this.fundProposalManagerX.getApprovedProposals(addFundRuleMarker);
      assert.sameMembers(res.map(int), [1]);
      res = await this.fundProposalManagerX.getApprovedProposals(disableFundRuleMarker);
      assert.sameMembers(res.map(int), [2]);
      res = await this.fundProposalManagerX.getRejectedProposals(addFundRuleMarker);
      assert.sameMembers(res.map(int), []);
      res = await this.fundProposalManagerX.getRejectedProposals(disableFundRuleMarker);
      assert.sameMembers(res.map(int), []);

      // verify value changed
      res = await this.fundStorageX.getActiveFundRulesCount();
      assert.equal(res, 0);

      res = await this.fundStorageX.getActiveFundRules();
      assert.sameMembers(res.map(int), []);

      res = await this.fundStorageX.fundRules(ruleId);
      assert.equal(res.active, false);
      assert.equal(res.id, 0);
      assert.equal(res.ipfsHash, galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd'));
      assert.equal(res.description, 'Do that');
    });
  });

  describe('ChangeMultiSigOwnersProposalManager && ModifyMultiSigManagerDetailsProposalManager', () => {
    it('should be able to change the list of MultiSig owners', async function() {
      await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      // approve Alice
      let proposalData = this.fundStorageX.contract.methods
        .setMultiSigManager(true, alice, 'Alice', [bytes32('asdf')])
        .encodeABI();

      let res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, proposalData, 'blah', {
        from: bob
      });

      let pId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(pId, { from: bob });
      await this.fundProposalManagerX.aye(pId, { from: charlie });
      await this.fundProposalManagerX.aye(pId, { from: dan });
      await this.fundProposalManagerX.triggerApprove(pId, { from: dan });

      // approve George
      proposalData = this.fundStorageX.contract.methods
        .setMultiSigManager(true, george, 'George', [bytes32('asdf')])
        .encodeABI();

      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, proposalData, 'blah', {
        from: bob
      });
      pId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(pId, { from: bob });
      await this.fundProposalManagerX.aye(pId, { from: charlie });
      await this.fundProposalManagerX.aye(pId, { from: dan });
      await this.fundProposalManagerX.triggerApprove(pId, { from: dan });

      res = await this.fundStorageX.getMultisigManager(george);
      assert.deepEqual(
        res.documents.map(doc => doc.toString(10)),
        [fullHex(bytes32('asdf'))]
      );
      res = await this.fundStorageX.getActiveMultisigManagers();
      assert.deepEqual(res, [alice, george]);

      let required = await this.fundMultiSigX.required();
      let owners = await this.fundMultiSigX.getOwners();

      assert.equal(required, 2);
      assert.equal(owners.length, 3);

      proposalData = this.fundMultiSigX.contract.methods.setOwners([alice, dan, frank, george], 3).encodeABI();

      res = await this.fundProposalManagerX.propose(this.fundMultiSigX.address, 0, proposalData, 'blah', {
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

      await this.fundProposalManagerX.triggerApprove(proposalId, { from: dan });

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.APPROVED);

      // approve Dan
      proposalData = this.fundStorageX.contract.methods
        .setMultiSigManager(true, dan, 'Dan', [bytes32('asdf')])
        .encodeABI();

      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, proposalData, 'blah', {
        from: bob
      });
      pId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(pId, { from: bob });
      await this.fundProposalManagerX.aye(pId, { from: charlie });
      await this.fundProposalManagerX.aye(pId, { from: dan });
      await this.fundProposalManagerX.triggerApprove(pId, { from: dan });

      // approve Frank
      proposalData = this.fundStorageX.contract.methods
        .setMultiSigManager(true, frank, 'Frank', [bytes32('asdf')])
        .encodeABI();

      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, proposalData, 'blah', {
        from: bob
      });
      pId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(pId, { from: bob });
      await this.fundProposalManagerX.aye(pId, { from: charlie });
      await this.fundProposalManagerX.aye(pId, { from: dan });
      await this.fundProposalManagerX.triggerApprove(pId, { from: dan });

      // now it's ok
      await this.fundProposalManagerX.execute(proposalId, { from: dan });

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // verify value changed
      res = await this.fundMultiSigX.getOwners();
      assert.sameMembers(res, [alice, dan, frank, george]);

      required = await this.fundMultiSigX.required();
      owners = await this.fundMultiSigX.getOwners();

      assert.equal(required, 3);
      assert.equal(owners.length, 4);
    });
  });

  describe('ChangeMultiSigWithdrawalLimitsProposalManager', () => {
    it('should be able to change limit the for each erc20 contract', async function() {
      await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      let limit = await this.fundStorageX.getPeriodLimit(this.galtToken.address);
      assert.equal(limit.active, false);
      assert.equal(limit.amount, ether(0));

      // set limit
      const proposalData = this.fundStorageX.contract.methods
        .setPeriodLimit(true, this.galtToken.address, ether(3000))
        .encodeABI();
      let res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, proposalData, 'blah', {
        from: bob
      });
      const pId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(pId, { from: bob });
      await this.fundProposalManagerX.aye(pId, { from: charlie });
      await this.fundProposalManagerX.aye(pId, { from: dan });
      await this.fundProposalManagerX.triggerApprove(pId, { from: dan });

      limit = await this.fundStorageX.getPeriodLimit(this.galtToken.address);
      assert.equal(limit.active, true);
      assert.equal(limit.amount, ether(3000));

      res = await this.fundProposalManagerX.proposals(pId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      assert.deepEqual(await this.fundStorageX.getActivePeriodLimits(), [this.galtToken.address]);
      assert.deepEqual((await this.fundStorageX.getActivePeriodLimitsCount()).toString(10), '1');
    });
  });
});
