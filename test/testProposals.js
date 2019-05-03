const galt = require('@galtproject/utils');

const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');

const { deployFundFactory, buildFund } = require('./deploymentHelpers');
const { ether, assertRevert, initHelperWeb3 } = require('./helpers');

const { web3 } = SpaceToken;
const bytes32 = web3.utils.utf8ToHex;

initHelperWeb3(web3);

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  APPROVED: 2,
  REJECTED: 3
};

const ActiveRuleAction = {
  ADD: 0,
  REMOVE: 1
};

contract('Proposals', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank, george] = accounts;

  before(async function() {
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.spaceToken = await SpaceToken.new('Name', 'Symbol', { from: coreTeam });

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
      [60, 50, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 5],
      [bob, charlie, dan],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundControllerX = fund.fundController;
    this.fundMultiSigX = fund.fundMultiSig;
    this.fundRAX = fund.fundRA;
    this.expelMemberProposalManagerX = fund.expelMemberProposalManager;
    this.modifyConfigProposalManagerX = fund.modifyConfigProposalManager;
    this.addFundRuleProposalManagerX = fund.addFundRuleProposalManager;
    this.deactivateFundRuleProposalManagerX = fund.deactivateFundRuleProposalManager;
    this.changeMultiSigOwnersProposalManager = fund.changeMultiSigOwnersProposalManager;
    this.modifyMultiSigManagerDetailsProposalManager = fund.modifyMultiSigManagerDetailsProposalManager;
    this.changeMultiSigWithdrawalLimitsProposalManager = fund.changeMultiSigWithdrawalLimitsProposalManager;

    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['1', '2', '3', '4', '5'];
  });

  describe('ModifyConfigProposal', () => {
    describe('proposal creation', () => {
      it('should allow user who has reputation creating a new proposal', async function() {
        await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

        let res = await this.modifyConfigProposalManagerX.propose(
          bytes32('modify_config_threshold'),
          '0x000000000000000000000000000000000000000000000000000000000000002a',
          'blah',
          {
            from: bob
          }
        );

        const proposalId = res.logs[0].args.proposalId.toString(10);

        res = await this.modifyConfigProposalManagerX.getProposal(proposalId);
        assert.equal(web3.utils.hexToUtf8(res.key), 'modify_config_threshold');
        assert.equal(web3.utils.hexToNumberString(res.value), '42');
        assert.equal(res.description, 'blah');
      });
    });

    describe('(Proposal contracts queries FundRA for addresses locked reputation share)', () => {
      it('should allow reverting a proposal if negative votes threshold is reached', async function() {
        await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

        let res = await this.modifyConfigProposalManagerX.propose(
          bytes32('modify_config_threshold'),
          '0x000000000000000000000000000000000000000000000000000000000000002a',
          'blah',
          {
            from: bob
          }
        );

        const proposalId = res.logs[0].args.proposalId.toString(10);

        await this.modifyConfigProposalManagerX.aye(proposalId, { from: bob });
        await this.modifyConfigProposalManagerX.nay(proposalId, { from: charlie });

        res = await this.modifyConfigProposalManagerX.getParticipantProposalChoice(proposalId, bob);
        assert.equal(res, '1');
        res = await this.modifyConfigProposalManagerX.getParticipantProposalChoice(proposalId, charlie);
        assert.equal(res, '2');

        res = await this.modifyConfigProposalManagerX.getProposalVoting(proposalId);
        assert.sameMembers(res.ayes, [bob]);
        assert.sameMembers(res.nays, [charlie]);

        assert.equal(res.status, ProposalStatus.ACTIVE);

        res = await this.modifyConfigProposalManagerX.getActiveProposals();
        assert.sameMembers(res.map(a => a.toNumber(10)), [1]);
        res = await this.modifyConfigProposalManagerX.getApprovedProposals();
        assert.sameMembers(res.map(a => a.toNumber(10)), []);
        res = await this.modifyConfigProposalManagerX.getRejectedProposals();
        assert.sameMembers(res.map(a => a.toNumber(10)), []);

        res = await this.modifyConfigProposalManagerX.getAyeShare(proposalId);
        assert.equal(res, 20);
        res = await this.modifyConfigProposalManagerX.getNayShare(proposalId);
        assert.equal(res, 20);

        // Deny double-vote
        await assertRevert(this.modifyConfigProposalManagerX.aye(proposalId, { from: bob }));

        await assertRevert(this.modifyConfigProposalManagerX.triggerReject(proposalId, { from: dan }));

        await this.modifyConfigProposalManagerX.nay(proposalId, { from: dan });
        await this.modifyConfigProposalManagerX.nay(proposalId, { from: eve });

        res = await this.modifyConfigProposalManagerX.getAyeShare(proposalId);
        assert.equal(res, 20);
        res = await this.modifyConfigProposalManagerX.getNayShare(proposalId);
        assert.equal(res, 60);

        await this.modifyConfigProposalManagerX.triggerReject(proposalId, { from: dan });

        res = await this.modifyConfigProposalManagerX.getProposalVoting(proposalId);
        assert.equal(res.status, ProposalStatus.REJECTED);

        res = await this.modifyConfigProposalManagerX.getActiveProposals();
        assert.sameMembers(res.map(a => a.toNumber(10)), []);
        res = await this.modifyConfigProposalManagerX.getApprovedProposals();
        assert.sameMembers(res.map(a => a.toNumber(10)), []);
        res = await this.modifyConfigProposalManagerX.getRejectedProposals();
        assert.sameMembers(res.map(a => a.toNumber(10)), [1]);
      });

      it('should allow approving proposal if positive votes threshold is reached', async function() {
        await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

        let res = await this.modifyConfigProposalManagerX.propose(
          bytes32('modify_config_threshold'),
          '0x000000000000000000000000000000000000000000000000000000000000002a',
          'blah',
          {
            from: bob
          }
        );

        const proposalId = res.logs[0].args.proposalId.toString(10);

        res = await this.modifyConfigProposalManagerX.getActiveProposals();
        assert.sameMembers(res.map(a => a.toNumber(10)), [1]);
        res = await this.modifyConfigProposalManagerX.getApprovedProposals();
        assert.sameMembers(res.map(a => a.toNumber(10)), []);
        res = await this.modifyConfigProposalManagerX.getRejectedProposals();
        assert.sameMembers(res.map(a => a.toNumber(10)), []);

        await this.modifyConfigProposalManagerX.aye(proposalId, { from: bob });
        await this.modifyConfigProposalManagerX.nay(proposalId, { from: charlie });

        res = await this.modifyConfigProposalManagerX.getProposalVoting(proposalId);
        assert.sameMembers(res.ayes, [bob]);
        assert.sameMembers(res.nays, [charlie]);

        assert.equal(res.status, ProposalStatus.ACTIVE);

        res = await this.modifyConfigProposalManagerX.getAyeShare(proposalId);
        assert.equal(res, 20);
        res = await this.modifyConfigProposalManagerX.getNayShare(proposalId);
        assert.equal(res, 20);

        // Deny double-vote
        await assertRevert(this.modifyConfigProposalManagerX.aye(proposalId, { from: bob }));

        await assertRevert(this.modifyConfigProposalManagerX.triggerReject(proposalId, { from: dan }));

        await this.modifyConfigProposalManagerX.aye(proposalId, { from: dan });
        await this.modifyConfigProposalManagerX.aye(proposalId, { from: eve });

        res = await this.modifyConfigProposalManagerX.getAyeShare(proposalId);
        assert.equal(res, 60);
        res = await this.modifyConfigProposalManagerX.getNayShare(proposalId);
        assert.equal(res, 20);

        // Revert attempt should fail
        await assertRevert(this.modifyConfigProposalManagerX.triggerReject(proposalId));
        await this.modifyConfigProposalManagerX.triggerApprove(proposalId);

        res = await this.modifyConfigProposalManagerX.getProposalVoting(proposalId);
        assert.equal(res.status, ProposalStatus.APPROVED);

        res = await this.fundStorageX.getConfigValue(web3.utils.utf8ToHex('modify_config_threshold'));
        assert.equal(web3.utils.hexToNumberString(res), '42');

        res = await this.modifyConfigProposalManagerX.getActiveProposals();
        assert.sameMembers(res.map(a => a.toNumber(10)), []);
        res = await this.modifyConfigProposalManagerX.getApprovedProposals();
        assert.sameMembers(res.map(a => a.toNumber(10)), [1]);
        res = await this.modifyConfigProposalManagerX.getRejectedProposals();
        assert.sameMembers(res.map(a => a.toNumber(10)), []);
      });
    });
  });

  describe('SetAddFundRuleProposalManager', () => {
    it('should add a new active rule for ADD action', async function() {
      await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      let res = await this.addFundRuleProposalManagerX.propose(
        ActiveRuleAction.ADD,
        galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd'),
        'Do that',
        {
          from: bob
        }
      );

      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.addFundRuleProposalManagerX.aye(proposalId, { from: bob });
      await this.addFundRuleProposalManagerX.nay(proposalId, { from: charlie });

      res = await this.addFundRuleProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);
      assert.sameMembers(res.nays, [charlie]);

      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.addFundRuleProposalManagerX.getActiveProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), [1]);
      res = await this.addFundRuleProposalManagerX.getApprovedProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), []);
      res = await this.addFundRuleProposalManagerX.getRejectedProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), []);

      res = await this.addFundRuleProposalManagerX.getAyeShare(proposalId);
      assert.equal(res, 20);
      res = await this.addFundRuleProposalManagerX.getNayShare(proposalId);
      assert.equal(res, 20);

      // Deny double-vote
      await assertRevert(this.addFundRuleProposalManagerX.aye(proposalId, { from: bob }));
      await assertRevert(this.addFundRuleProposalManagerX.triggerReject(proposalId, { from: dan }));

      await this.addFundRuleProposalManagerX.aye(proposalId, { from: dan });
      await this.addFundRuleProposalManagerX.aye(proposalId, { from: eve });

      res = await this.addFundRuleProposalManagerX.getAyeShare(proposalId);
      assert.equal(res, 60);
      res = await this.addFundRuleProposalManagerX.getNayShare(proposalId);
      assert.equal(res, 20);

      await this.addFundRuleProposalManagerX.triggerApprove(proposalId, { from: dan });

      res = await this.addFundRuleProposalManagerX.getProposalVoting(proposalId);
      assert.equal(res.status, ProposalStatus.APPROVED);

      res = await this.addFundRuleProposalManagerX.getActiveProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), []);
      res = await this.addFundRuleProposalManagerX.getApprovedProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), [1]);
      res = await this.addFundRuleProposalManagerX.getRejectedProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), []);

      // verify value changed
      res = await this.fundStorageX.getActiveFundRulesCount();
      assert.equal(res, 1);

      res = await this.fundStorageX.getActiveFundRules();
      assert.sameMembers(res.map(a => a.toNumber(10)), [1]);

      res = await this.fundStorageX.getFundRule(1);
      assert.equal(res.active, true);
      assert.equal(res.id, 1);
      assert.equal(res.ipfsHash, galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd'));
      assert.equal(res.description, 'Do that');

      // >>> deactivate aforementioned proposal

      res = await this.deactivateFundRuleProposalManagerX.propose(1, 'obsolete', {
        from: bob
      });

      const removeProposalId = res.logs[0].args.proposalId.toString(10);

      await this.deactivateFundRuleProposalManagerX.aye(removeProposalId, { from: bob });
      await this.deactivateFundRuleProposalManagerX.nay(removeProposalId, { from: charlie });

      res = await this.deactivateFundRuleProposalManagerX.getProposalVoting(removeProposalId);
      assert.sameMembers(res.ayes, [bob]);
      assert.sameMembers(res.nays, [charlie]);

      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.deactivateFundRuleProposalManagerX.getActiveProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), [1]);
      res = await this.deactivateFundRuleProposalManagerX.getApprovedProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), []);
      res = await this.deactivateFundRuleProposalManagerX.getRejectedProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), []);

      res = await this.deactivateFundRuleProposalManagerX.getAyeShare(removeProposalId);
      assert.equal(res, 20);
      res = await this.deactivateFundRuleProposalManagerX.getNayShare(removeProposalId);
      assert.equal(res, 20);

      // Deny double-vote
      await assertRevert(this.deactivateFundRuleProposalManagerX.aye(removeProposalId, { from: bob }));
      await assertRevert(this.deactivateFundRuleProposalManagerX.triggerReject(removeProposalId, { from: dan }));

      await this.deactivateFundRuleProposalManagerX.aye(removeProposalId, { from: dan });
      await this.deactivateFundRuleProposalManagerX.aye(removeProposalId, { from: eve });

      res = await this.deactivateFundRuleProposalManagerX.getAyeShare(removeProposalId);
      assert.equal(res, 60);
      res = await this.deactivateFundRuleProposalManagerX.getNayShare(removeProposalId);
      assert.equal(res, 20);

      await this.deactivateFundRuleProposalManagerX.triggerApprove(removeProposalId, { from: dan });

      res = await this.deactivateFundRuleProposalManagerX.getProposalVoting(removeProposalId);
      assert.equal(res.status, ProposalStatus.APPROVED);

      res = await this.deactivateFundRuleProposalManagerX.getActiveProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), []);
      res = await this.deactivateFundRuleProposalManagerX.getApprovedProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), [1]);
      res = await this.deactivateFundRuleProposalManagerX.getRejectedProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), []);

      // verify value changed
      res = await this.fundStorageX.getActiveFundRulesCount();
      assert.equal(res, 0);

      res = await this.fundStorageX.getActiveFundRules();
      assert.sameMembers(res.map(a => a.toNumber(10)), []);

      res = await this.fundStorageX.getFundRule(1);
      assert.equal(res.active, false);
      assert.equal(res.id, 1);
      assert.equal(res.ipfsHash, galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd'));
      assert.equal(res.description, 'Do that');
    });
  });

  describe('ChangeMultiSigOwnersProposalManager && ModifyMultiSigManagerDetailsProposalManager', () => {
    it('should be able to change the list of MultiSig owners', async function() {
      await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      // approve Alice
      let res = await this.modifyMultiSigManagerDetailsProposalManager.propose(
        alice,
        true,
        'Alice',
        [bytes32('asdf')],
        'Hey',
        {
          from: bob
        }
      );
      let pId = res.logs[0].args.proposalId.toString(10);
      await this.modifyMultiSigManagerDetailsProposalManager.aye(pId, { from: bob });
      await this.modifyMultiSigManagerDetailsProposalManager.aye(pId, { from: charlie });
      await this.modifyMultiSigManagerDetailsProposalManager.aye(pId, { from: dan });
      await this.modifyMultiSigManagerDetailsProposalManager.triggerApprove(pId, { from: dan });

      // approve George
      res = await this.modifyMultiSigManagerDetailsProposalManager.propose(
        george,
        true,
        'George',
        [bytes32('asdf')],
        'Hey',
        {
          from: bob
        }
      );
      pId = res.logs[0].args.proposalId.toString(10);
      await this.modifyMultiSigManagerDetailsProposalManager.aye(pId, { from: bob });
      await this.modifyMultiSigManagerDetailsProposalManager.aye(pId, { from: charlie });
      await this.modifyMultiSigManagerDetailsProposalManager.aye(pId, { from: dan });
      await this.modifyMultiSigManagerDetailsProposalManager.triggerApprove(pId, { from: dan });

      //
      let required = await this.fundMultiSigX.required();
      let owners = await this.fundMultiSigX.getOwners();

      assert.equal(required, 2);
      assert.equal(owners.length, 3);

      await assertRevert(
        this.changeMultiSigOwnersProposalManager.propose([alice, frank, george], 4, 'Have a new list', {
          from: bob
        })
      );
      await assertRevert(
        this.changeMultiSigOwnersProposalManager.propose([alice, frank, george], 0, 'Have a new list', {
          from: bob
        })
      );

      res = await this.changeMultiSigOwnersProposalManager.propose([alice, dan, frank, george], 3, 'Have a new list', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.changeMultiSigOwnersProposalManager.aye(proposalId, { from: bob });
      await this.changeMultiSigOwnersProposalManager.nay(proposalId, { from: charlie });

      res = await this.changeMultiSigOwnersProposalManager.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);
      assert.sameMembers(res.nays, [charlie]);

      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.changeMultiSigOwnersProposalManager.getActiveProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), [1]);
      res = await this.changeMultiSigOwnersProposalManager.getApprovedProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), []);
      res = await this.changeMultiSigOwnersProposalManager.getRejectedProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), []);

      res = await this.changeMultiSigOwnersProposalManager.getAyeShare(proposalId);
      assert.equal(res, 20);
      res = await this.changeMultiSigOwnersProposalManager.getNayShare(proposalId);
      assert.equal(res, 20);

      // Deny double-vote
      await assertRevert(this.changeMultiSigOwnersProposalManager.aye(proposalId, { from: bob }));
      await assertRevert(this.changeMultiSigOwnersProposalManager.triggerReject(proposalId, { from: dan }));

      await this.changeMultiSigOwnersProposalManager.aye(proposalId, { from: dan });
      await this.changeMultiSigOwnersProposalManager.aye(proposalId, { from: eve });

      res = await this.changeMultiSigOwnersProposalManager.getAyeShare(proposalId);
      assert.equal(res, 60);
      res = await this.changeMultiSigOwnersProposalManager.getNayShare(proposalId);
      assert.equal(res, 20);

      await assertRevert(this.changeMultiSigOwnersProposalManager.triggerApprove(proposalId, { from: dan }));

      // approve Dan
      res = await this.modifyMultiSigManagerDetailsProposalManager.propose(dan, true, 'Dan', [bytes32('asdf')], 'Hey', {
        from: bob
      });
      pId = res.logs[0].args.proposalId.toString(10);
      await this.modifyMultiSigManagerDetailsProposalManager.aye(pId, { from: bob });
      await this.modifyMultiSigManagerDetailsProposalManager.aye(pId, { from: charlie });
      await this.modifyMultiSigManagerDetailsProposalManager.aye(pId, { from: dan });
      await this.modifyMultiSigManagerDetailsProposalManager.triggerApprove(pId, { from: dan });

      // approve Frank
      res = await this.modifyMultiSigManagerDetailsProposalManager.propose(
        frank,
        true,
        'Frank',
        [bytes32('asdf')],
        'Hey',
        {
          from: bob
        }
      );

      pId = res.logs[0].args.proposalId.toString(10);
      await this.modifyMultiSigManagerDetailsProposalManager.aye(pId, { from: bob });
      await this.modifyMultiSigManagerDetailsProposalManager.aye(pId, { from: charlie });
      await this.modifyMultiSigManagerDetailsProposalManager.aye(pId, { from: dan });
      await this.modifyMultiSigManagerDetailsProposalManager.triggerApprove(pId, { from: dan });

      // now it's ok
      await this.changeMultiSigOwnersProposalManager.triggerApprove(proposalId, { from: dan });

      res = await this.changeMultiSigOwnersProposalManager.getProposalVoting(proposalId);
      assert.equal(res.status, ProposalStatus.APPROVED);

      res = await this.changeMultiSigOwnersProposalManager.getActiveProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), []);
      res = await this.changeMultiSigOwnersProposalManager.getApprovedProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), [1]);
      res = await this.changeMultiSigOwnersProposalManager.getRejectedProposals();
      assert.sameMembers(res.map(a => a.toNumber(10)), []);

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
      const res = await this.changeMultiSigWithdrawalLimitsProposalManager.propose(
        true,
        this.galtToken.address,
        ether(3000),
        'Hey',
        {
          from: bob
        }
      );
      const pId = res.logs[0].args.proposalId.toString(10);
      await this.changeMultiSigWithdrawalLimitsProposalManager.aye(pId, { from: bob });
      await this.changeMultiSigWithdrawalLimitsProposalManager.aye(pId, { from: charlie });
      await this.changeMultiSigWithdrawalLimitsProposalManager.aye(pId, { from: dan });
      await this.changeMultiSigWithdrawalLimitsProposalManager.triggerApprove(pId, { from: dan });

      limit = await this.fundStorageX.getPeriodLimit(this.galtToken.address);
      assert.equal(limit.active, true);
      assert.equal(limit.amount, ether(3000));
    });
  });
});
