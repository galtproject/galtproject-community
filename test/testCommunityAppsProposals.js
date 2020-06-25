const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const SpaceToken = contract.fromArtifact('SpaceToken');
const GaltToken = contract.fromArtifact('GaltToken');
const GaltGlobalRegistry = contract.fromArtifact('GaltGlobalRegistry');
const FundFactory = contract.fromArtifact('FundFactory');

const { deployFundFactory, buildFund, VotingConfig } = require('./deploymentHelpers');
const { ether, initHelperWeb3, hex, evmIncreaseTime } = require('./helpers');

initHelperWeb3(web3);

describe('Community Apps Proposals', () => {
  const [alice, bob, charlie, dan, eve, frank, customContract] = accounts;
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
      new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK, 0),
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

  describe('Create Community App Proposal', () => {
    it('should correctly set and get', async function() {
      await this.fundRAX.mintAllHack(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      let communityApps = await this.fundStorageX.getCommunityApps();
      const prevLength = communityApps.length;

      const calldata = this.fundStorageX.contract.methods
        .addCommunityApp(customContract, hex('custom'), hex('Qm1'), 'dataLink')
        .encodeABI();
      const res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        false,
        false,
        false,
        calldata,
        'blah',
        {
          from: bob
        }
      );

      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, true, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });

      await evmIncreaseTime(VotingConfig.ONE_WEEK + 1);

      await this.fundProposalManagerX.executeProposal(proposalId, 0, { from: dan });

      communityApps = await this.fundStorageX.getCommunityApps();
      assert.equal(communityApps.length, prevLength + 1);
      assert.equal(communityApps[communityApps.length - 1], customContract);

      const customContractDetails = await this.fundStorageX.communityAppsInfo(customContract);
      assert.equal(customContractDetails.appType, hex('custom'));
      assert.equal(customContractDetails.dataLink, 'dataLink');
      assert.equal(customContractDetails.abiIpfsHash, hex('Qm1'));
    });
  });
});
