const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const galt = require('@galtproject/utils');

const SpaceToken = contract.fromArtifact('SpaceToken');
const GaltToken = contract.fromArtifact('GaltToken');
const GaltGlobalRegistry = contract.fromArtifact('GaltGlobalRegistry');
const FundFactory = contract.fromArtifact('FundFactory');

const { deployFundFactory, buildFund, VotingConfig } = require('./deploymentHelpers');
const { initHelperWeb3, int, getDestinationMarker, evmIncreaseTime, zeroAddress } = require('./helpers');

const bytes32 = web3.utils.utf8ToHex;

// eslint-disable-next-line import/order
const { ether, assertRevert } = require('@galtproject/solidity-test-chest')(web3);

initHelperWeb3(web3);

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  EXECUTED: 2
};

describe('FundProposalManager', () => {
  const [alice, bob, charlie, dan, eve, frank, george] = accounts;
  const coreTeam = defaultSender;

  before(async function() {
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.galtToken = await GaltToken.new({ from: coreTeam });
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
      new VotingConfig(ether(60), ether(50), VotingConfig.ONE_WEEK, 0),
      {},
      [bob, charlie, dan],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundControllerX = fund.fundController;
    this.fundMultiSigX = fund.fundMultiSig;
    this.fundRAX = fund.fundRA;
    this.fundProposalManagerX = fund.fundProposalManager;
    this.fundRuleRegistryX = fund.fundRuleRegistry;

    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['1', '2', '3', '4', '5'];
  });

  describe('FundProposalManager', () => {
    describe('proposal creation', () => {
      it('should allow user who has reputation creating a new proposal', async function() {
        await this.fundRAX.mintAllHack(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

        const proposalData = this.fundProposalManagerX.contract.methods
          .setProposalConfig(bytes32('modify_config_threshold'), ether(42), ether(12), 123, 0)
          .encodeABI();

        let res = await this.fundProposalManagerX.propose(
          this.fundProposalManagerX.address,
          0,
          false,
          false,
          false,
          zeroAddress,
          proposalData,
          'blah',
          {
            from: bob
          }
        );

        const proposalId = res.logs[0].args.proposalId.toString(10);

        res = await this.fundProposalManagerX.proposals(proposalId);
        assert.equal(res.dataLink, 'blah');
      });
    });

    describe('(Proposal contracts queries FundRA for addresses locked reputation share)', () => {
      it('should allow approving proposal if positive votes threshold is reached', async function() {
        await this.fundRAX.mintAllHack(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

        const marker = getDestinationMarker(this.fundProposalManagerX, 'setProposalConfig');

        const proposalData = this.fundProposalManagerX.contract.methods
          .setProposalConfig(marker, ether(42), ether(40), 555, 0)
          .encodeABI();

        let res = await this.fundProposalManagerX.propose(
          this.fundProposalManagerX.address,
          0,
          false,
          false,
          false,
          zeroAddress,
          proposalData,
          'blah',
          {
            from: bob
          }
        );
        let timeoutAt = (await web3.eth.getBlock(res.receipt.blockNumber)).timestamp + VotingConfig.ONE_WEEK;

        const proposalId = res.logs[0].args.proposalId.toString(10);

        await this.fundProposalManagerX.aye(proposalId, true, { from: bob });
        await this.fundProposalManagerX.nay(proposalId, { from: charlie });

        res = await this.fundProposalManagerX.proposals(proposalId);
        assert.equal(res.status, ProposalStatus.ACTIVE);

        res = await this.fundProposalManagerX.getProposalVoting(proposalId);
        assert.sameMembers(res.ayes, [bob]);
        assert.sameMembers(res.nays, [charlie]);
        assert.equal(res.totalAyes, 300);
        assert.equal(res.totalNays, 300);

        res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
        assert.equal(res.ayesShare, ether(20));
        assert.equal(res.naysShare, ether(20));
        assert.equal(res.currentSupport, ether(50));
        assert.equal(res.requiredSupport, ether(60));
        assert.equal(res.minAcceptQuorum, ether(50));
        assert.equal(res.timeoutAt, timeoutAt);

        // Deny double-vote
        await assertRevert(this.fundProposalManagerX.aye(proposalId, false, { from: bob }), 'Element already exists');

        await assertRevert(
          this.fundProposalManagerX.executeProposal(proposalId, 0, { from: dan }),
          'Proposal is still active'
        );

        assert.equal(await this.fundRAX.balanceOf(alice), 0);
        assert.equal(await this.fundRAX.balanceOf(bob), 300);
        assert.equal(await this.fundRAX.balanceOf(charlie), 300);
        assert.equal(await this.fundRAX.balanceOf(dan), 300);
        assert.equal(await this.fundRAX.balanceOf(eve), 300);

        await this.fundProposalManagerX.aye(proposalId, true, { from: dan });
        await this.fundProposalManagerX.aye(proposalId, false, { from: eve });

        res = await this.fundProposalManagerX.getProposalVoting(proposalId);
        assert.equal(res.totalAyes, 900);
        assert.equal(res.totalNays, 300);

        res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
        assert.equal(res.ayesShare, ether(60));
        assert.equal(res.naysShare, ether(20));
        assert.equal(res.currentSupport, ether(75));
        assert.equal(res.requiredSupport, ether(60));
        assert.equal(res.minAcceptQuorum, ether(50));

        res = await this.fundProposalManagerX.proposals(proposalId);
        assert.equal(res.status, ProposalStatus.ACTIVE);

        await evmIncreaseTime(VotingConfig.ONE_WEEK + 1);

        await this.fundProposalManagerX.executeProposal(proposalId, 0, { from: george });

        res = await this.fundProposalManagerX.proposals(proposalId);
        assert.equal(res.status, ProposalStatus.EXECUTED);

        res = await this.fundProposalManagerX.customVotingConfigs(marker);
        assert.equal(res.support, ether(42));
        assert.equal(res.minAcceptQuorum, ether(40));
        assert.equal(res.timeout, 555);

        res = await this.fundProposalManagerX.getProposalVoting(proposalId);
        assert.equal(res.totalAyes, 900);
        assert.equal(res.totalNays, 300);

        // doesn't affect already created proposals
        res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
        assert.equal(res.ayesShare, ether(60));
        assert.equal(res.naysShare, ether(20));
        assert.equal(res.currentSupport, ether(75));
        assert.equal(res.requiredSupport, ether(60));
        assert.equal(res.minAcceptQuorum, ether(50));

        // but the new one has a different requirements
        res = await this.fundProposalManagerX.propose(
          this.fundProposalManagerX.address,
          0,
          false,
          false,
          false,
          zeroAddress,
          proposalData,
          'blah',
          {
            from: bob
          }
        );
        timeoutAt = (await web3.eth.getBlock(res.receipt.blockNumber)).timestamp + 555;

        const newProposalId = res.logs[0].args.proposalId.toString(10);

        res = await this.fundProposalManagerX.getProposalVoting(newProposalId);
        assert.equal(res.totalAyes, 0);
        assert.equal(res.totalNays, 0);

        res = await this.fundProposalManagerX.getProposalVotingProgress(newProposalId);
        assert.equal(res.ayesShare, 0);
        assert.equal(res.naysShare, 0);
        assert.equal(res.currentSupport, ether(0));
        assert.equal(res.requiredSupport, ether(42));
        assert.equal(res.minAcceptQuorum, ether(40));
        assert.equal(res.timeoutAt, timeoutAt);
      });
    });
  });

  describe('SetAddFundRuleProposalManager', () => {
    it('should add/deactivate a rule', async function() {
      const addRuleType3Marker = await this.fundStorageX.proposalMarkers(
        getDestinationMarker(this.fundRuleRegistryX, 'addRuleType3')
      );
      assert.equal(addRuleType3Marker.active, true);
      assert.equal(addRuleType3Marker.destination, this.fundRuleRegistryX.address);
      assert.equal(addRuleType3Marker.proposalManager, this.fundProposalManagerX.address);

      await this.fundRAX.mintAllHack(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      const ipfsHash = galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd');
      let proposalData = this.fundRuleRegistryX.contract.methods.addRuleType3('0', ipfsHash, 'Do that').encodeABI();

      let res = await this.fundProposalManagerX.propose(
        this.fundRuleRegistryX.address,
        0,
        false,
        false,
        false,
        zeroAddress,
        proposalData,
        'hey',
        {
          from: bob
        }
      );

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
      await assertRevert(this.fundProposalManagerX.aye(proposalId, true, { from: bob }));
      await assertRevert(this.fundProposalManagerX.executeProposal(proposalId, 0, { from: dan }));

      await this.fundProposalManagerX.aye(proposalId, true, { from: dan });
      await this.fundProposalManagerX.aye(proposalId, true, { from: eve });

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, ether(60));
      assert.equal(res.naysShare, ether(20));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // verify value changed
      res = await this.fundRuleRegistryX.getActiveFundRulesCount();
      assert.equal(res, 1);

      res = await this.fundRuleRegistryX.getActiveFundRules();
      assert.sameMembers(res.map(int), [1]);

      res = await this.fundRuleRegistryX.fundRules(1);
      assert.equal(res.active, true);
      assert.equal(res.id, 1);
      assert.equal(res.ipfsHash, galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd'));
      assert.equal(res.dataLink, 'Do that');

      const ruleId = int(res.id);

      // >>> deactivate aforementioned proposal

      proposalData = this.fundRuleRegistryX.contract.methods.disableRuleType3(ruleId).encodeABI();

      res = await this.fundProposalManagerX.propose(
        this.fundRuleRegistryX.address,
        0,
        false,
        false,
        false,
        zeroAddress,
        proposalData,
        'obsolete',
        {
          from: bob
        }
      );

      const removeProposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(removeProposalId, true, { from: bob });
      await this.fundProposalManagerX.nay(removeProposalId, { from: charlie });

      res = await this.fundProposalManagerX.getProposalVoting(removeProposalId);
      assert.sameMembers(res.ayes, [bob]);
      assert.sameMembers(res.nays, [charlie]);

      res = await this.fundProposalManagerX.proposals(removeProposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.fundProposalManagerX.getProposalVotingProgress(removeProposalId);
      assert.equal(res.ayesShare, ether(20));
      assert.equal(res.naysShare, ether(20));

      // Deny double-vote
      await assertRevert(this.fundProposalManagerX.aye(removeProposalId, true, { from: bob }));
      await assertRevert(this.fundProposalManagerX.executeProposal(removeProposalId, 0, { from: dan }));

      await this.fundProposalManagerX.aye(removeProposalId, true, { from: dan });
      await this.fundProposalManagerX.aye(removeProposalId, true, { from: eve });

      res = await this.fundProposalManagerX.getProposalVotingProgress(removeProposalId);
      assert.equal(res.ayesShare, ether(60));
      assert.equal(res.naysShare, ether(20));

      res = await this.fundProposalManagerX.proposals(removeProposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // verify value changed
      res = await this.fundRuleRegistryX.getActiveFundRulesCount();
      assert.equal(res, 0);

      res = await this.fundRuleRegistryX.getActiveFundRules();
      assert.sameMembers(res.map(int), []);

      res = await this.fundRuleRegistryX.fundRules(ruleId);
      assert.equal(res.active, false);
      assert.equal(res.id, 1);
      assert.equal(res.ipfsHash, galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd'));
      assert.equal(res.dataLink, 'Do that');
    });
  });

  describe('ChangeMultiSigOwnersProposalManager && ModifyMultiSigManagerDetailsProposalManager', () => {
    it('should be able to change the list of MultiSig owners', async function() {
      await this.fundRAX.mintAllHack(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      // approve Alice
      let proposalData = this.fundStorageX.contract.methods
        .setMultiSigManager(true, alice, 'Alice', 'asdf')
        .encodeABI();

      let res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        false,
        false,
        false,
        zeroAddress,
        proposalData,
        'blah',
        {
          from: bob
        }
      );

      let pId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(pId, true, { from: bob });
      await this.fundProposalManagerX.aye(pId, true, { from: charlie });
      await this.fundProposalManagerX.aye(pId, true, { from: dan });

      res = await this.fundProposalManagerX.proposals(pId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // approve George
      proposalData = this.fundStorageX.contract.methods.setMultiSigManager(true, george, 'George', 'asdf').encodeABI();

      res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        false,
        false,
        false,
        zeroAddress,
        proposalData,
        'blah',
        {
          from: bob
        }
      );
      pId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(pId, true, { from: bob });
      await this.fundProposalManagerX.aye(pId, true, { from: charlie });
      await this.fundProposalManagerX.aye(pId, true, { from: dan });

      res = await this.fundProposalManagerX.proposals(pId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      res = await this.fundStorageX.multiSigManagers(george);
      assert.equal(res.dataLink, 'asdf');
      res = await this.fundStorageX.getActiveMultisigManagers();
      assert.deepEqual(res, [alice, george]);

      let required = await this.fundMultiSigX.required();
      let owners = await this.fundMultiSigX.getOwners();

      assert.equal(required, 2);
      assert.equal(owners.length, 3);

      // setOwners
      proposalData = this.fundMultiSigX.contract.methods.setOwners([alice, dan, frank, george], 3).encodeABI();

      res = await this.fundProposalManagerX.propose(
        this.fundMultiSigX.address,
        0,
        false,
        false,
        false,
        zeroAddress,
        proposalData,
        'blah',
        {
          from: bob
        }
      );

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
      await assertRevert(this.fundProposalManagerX.aye(proposalId, true, { from: bob }));
      await assertRevert(this.fundProposalManagerX.executeProposal(proposalId, 0, { from: dan }));

      await this.fundProposalManagerX.aye(proposalId, true, { from: dan });
      await this.fundProposalManagerX.aye(proposalId, true, { from: eve });

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, ether(60));
      assert.equal(res.naysShare, ether(20));
      assert.equal(res.currentSupport, ether(75));
      assert.equal(res.ayesShare, ether(60));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(50));

      await evmIncreaseTime(VotingConfig.ONE_WEEK + 1);

      res = await this.fundProposalManagerX.executeProposal(proposalId, 0, { from: dan });
      assert.equal(res.logs[0].args.success, false);

      res = await this.fundProposalManagerX.proposals(proposalId);
      // failed to execute
      assert.equal(res.status, ProposalStatus.ACTIVE);

      // approve Dan
      proposalData = this.fundStorageX.contract.methods.setMultiSigManager(true, dan, 'Dan', 'asdf').encodeABI();

      res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        false,
        false,
        false,
        zeroAddress,
        proposalData,
        'blah',
        {
          from: bob
        }
      );
      pId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(pId, true, { from: bob });
      await this.fundProposalManagerX.aye(pId, true, { from: charlie });
      await this.fundProposalManagerX.aye(pId, true, { from: dan });

      // approve Frank
      proposalData = this.fundStorageX.contract.methods.setMultiSigManager(true, frank, 'Frank', 'asdf').encodeABI();

      res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        false,
        false,
        false,
        zeroAddress,
        proposalData,
        'blah',
        {
          from: bob
        }
      );
      pId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(pId, true, { from: bob });
      await this.fundProposalManagerX.aye(pId, true, { from: charlie });
      await this.fundProposalManagerX.aye(pId, true, { from: dan });

      res = await this.fundProposalManagerX.proposals(pId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // now it's ok
      await this.fundProposalManagerX.executeProposal(proposalId, 0, { from: dan });

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
      await this.fundRAX.mintAllHack(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      let limit = await this.fundStorageX.periodLimits(this.galtToken.address);
      assert.equal(limit.active, false);
      assert.equal(limit.amount, ether(0));

      // set limit
      const proposalData = this.fundStorageX.contract.methods
        .setPeriodLimit(true, this.galtToken.address, ether(3000))
        .encodeABI();
      let res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        false,
        false,
        false,
        zeroAddress,
        proposalData,
        'blah',
        {
          from: bob
        }
      );
      const pId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(pId, true, { from: bob });
      await this.fundProposalManagerX.aye(pId, true, { from: charlie });
      await this.fundProposalManagerX.aye(pId, true, { from: dan });

      limit = await this.fundStorageX.periodLimits(this.galtToken.address);
      assert.equal(limit.active, true);
      assert.equal(limit.amount, ether(3000));

      res = await this.fundProposalManagerX.proposals(pId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      assert.deepEqual(await this.fundStorageX.getActivePeriodLimits(), [this.galtToken.address]);
      assert.deepEqual((await this.fundStorageX.getActivePeriodLimitsCount()).toString(10), '1');
    });
  });
});
