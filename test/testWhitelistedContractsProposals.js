const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');

const { deployFundFactory, buildFund, VotingConfig } = require('./deploymentHelpers');
const { ether, initHelperWeb3, hex, evmIncreaseTime } = require('./helpers');

const { web3 } = SpaceToken;

initHelperWeb3(web3);

contract('Whitelisted Contracts Proposals', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank, customContract] = accounts;

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

  describe('Create Member Identifier Proposal', () => {
    it('should correctly set and get', async function() {
      await this.fundRAX.mintAllHack(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      let whitelistedContracts = await this.fundStorageX.getWhitelistedContracts();
      const prevLength = whitelistedContracts.length;

      const calldata = this.fundStorageX.contract.methods
        .addWhiteListedContract(customContract, hex('custom'), hex('Qm1'), 'dataLink')
        .encodeABI();
      const res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, calldata, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, { from: charlie });

      await evmIncreaseTime(VotingConfig.ONE_WEEK + 1);

      await this.fundProposalManagerX.triggerApprove(proposalId, { from: dan });

      whitelistedContracts = await this.fundStorageX.getWhitelistedContracts();
      assert.equal(whitelistedContracts.length, prevLength + 1);
      assert.equal(whitelistedContracts[whitelistedContracts.length - 1], customContract);

      const customContractDetails = await this.fundStorageX.whitelistedContracts(customContract);
      assert.equal(customContractDetails.contractType, hex('custom'));
      assert.equal(customContractDetails.dataLink, 'dataLink');
      assert.equal(customContractDetails.abiIpfsHash, hex('Qm1'));
    });
  });
});
