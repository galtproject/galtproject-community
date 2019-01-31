const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const FundStorageFactory = artifacts.require('./FundStorageFactory.sol');
const FundMultiSigFactory = artifacts.require('./FundMultiSigFactory.sol');
const FundControllerFactory = artifacts.require('./FundControllerFactory.sol');
const MockRSRA = artifacts.require('./MockRSRA.sol');
const MockRSRAFactory = artifacts.require('./MockRSRAFactory.sol');
const FundFactory = artifacts.require('./FundFactory.sol');
const FundStorage = artifacts.require('./FundStorage.sol');

const NewMemberProposalManagerFactory = artifacts.require('./NewMemberProposalManagerFactory.sol');
const ExpelMemberProposalManagerFactory = artifacts.require('./ExpelMemberProposalManagerFactory.sol');
const WLProposalManagerFactory = artifacts.require('./WLProposalManagerFactory.sol');
const FineMemberProposalManagerFactory = artifacts.require('./FineMemberProposalManagerFactory.sol');
const MockModifyConfigProposalManagerFactory = artifacts.require('./MockModifyConfigProposalManagerFactory.sol');
const ChangeNameAndDescriptionProposalManagerFactory = artifacts.require('./ChangeNameAndDescriptionProposalManagerFactory.sol');
const ActiveRulesProposalManagerFactory = artifacts.require('./ActiveRulesProposalManagerFactory.sol');

const MockModifyConfigProposalManager = artifacts.require('./MockModifyConfigProposalManager.sol');

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

contract.only('Proposals', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank, spaceLockerRegistryAddress] = accounts;

  beforeEach(async function() {
    this.spaceToken = await SpaceToken.new('Name', 'Symbol', { from: coreTeam });
    this.galtToken = await GaltToken.new({ from: coreTeam });

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
    this.activeRulesProposalManagerFactory = await ActiveRulesProposalManagerFactory.new();

    this.fundFactory = await FundFactory.new(
      this.galtToken.address,
      this.spaceToken.address,
      spaceLockerRegistryAddress,
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
      this.activeRulesProposalManagerFactory.address,
      { from: coreTeam }
    );

    // assign roles
    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    // build fund
    await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
    let res = await this.fundFactory.buildFirstStep(false, 60, 50, 60, 60, 60, [bob, charlie, dan], 2, { from: alice });
    this.rsraX = await MockRSRA.at(res.logs[0].args.fundRsra);
    this.fundStorageX = await FundStorage.at(res.logs[0].args.fundStorage);

    res = await this.fundFactory.buildSecondStep({ from: alice });
    this.modifyConfigProposalManagerX = await MockModifyConfigProposalManager.at(
      res.logs[0].args.modifyConfigProposalManager
    );

    await this.fundFactory.buildThirdStep({ from: alice });

    this.beneficiaries = [bob, charlie, dan, eve, frank];
  });

  describe('ModifyConfigProposal', () => {
    describe('proposal creation', () => {
      it('should allow user who has reputation creating a new proposal', async function() {
        await this.rsraX.mintAll(this.beneficiaries, 300, { from: alice });

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

    describe('(Proposal contracts queries RSRA for addresses locked reputation share)', () => {
      it('should allow reverting a proposal if negative votes threshold is reached', async function() {
        await this.rsraX.mintAll(this.beneficiaries, 300, { from: alice });

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
        await this.rsraX.mintAll(this.beneficiaries, 300, { from: alice });

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
});