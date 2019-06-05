const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');

const { deployFundFactory, buildFund } = require('./deploymentHelpers');
const { ether, initHelperWeb3, hex, fullHex } = require('./helpers');

const { web3 } = SpaceToken;

initHelperWeb3(web3);

contract('Identification Proposals', accounts => {
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
      [60, 50, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 5],
      [bob, charlie, dan],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundControllerX = fund.fundController;
    this.fundMultiSigX = fund.fundMultiSigX;
    this.fundRAX = fund.fundRA;
    this.expelMemberProposalManagerX = fund.expelMemberProposalManager;
    this.modifyConfigProposalManagerX = fund.modifyConfigProposalManager;
    this.addFundRuleProposalManagerX = fund.addFundRuleProposalManager;
    this.deactivateFundRuleProposalManagerX = fund.deactivateFundRuleProposalManager;
    this.memberIdentificationProposalManager = fund.memberIdentificationProposalManager;

    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['1', '2', '3', '4', '5'];
  });

  describe('Create Member Identifier Proposal', () => {
    it('should correctly set and get', async function() {
      await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      const calldata = this.fundStorageX.contract.methods.setMemberIdentification(alice, hex('alice_id')).encodeABI();
      const res = await this.memberIdentificationProposalManager.propose(calldata, 'New id', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.memberIdentificationProposalManager.aye(proposalId, { from: bob });
      await this.memberIdentificationProposalManager.aye(proposalId, { from: charlie });

      await this.memberIdentificationProposalManager.triggerApprove(proposalId, { from: dan });

      const aliceId = await this.fundStorageX.getMemberIdentification(alice);
      assert.equal(fullHex(aliceId), hex('alice_id'));
    });
  });
});
