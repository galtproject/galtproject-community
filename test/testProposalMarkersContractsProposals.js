const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');

const { deployFundFactory, buildFund } = require('./deploymentHelpers');
const { ether, initHelperWeb3, hex, getDestinationMarker } = require('./helpers');

const { web3 } = SpaceToken;

initHelperWeb3(web3);

contract('Proposal Markers Proposals', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank, proposalManager] = accounts;

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
    const fund = await buildFund(this.fundFactory, alice, false, 400000, {}, [bob, charlie, dan], 2);

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
      await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      let proposalMarkers = await this.fundStorageX.getProposalMarkers();
      const prevLength = proposalMarkers.length;

      const marker = getDestinationMarker(this.galtToken, 'transfer');

      const calldata = this.fundStorageX.contract.methods
        .addProposalMarker(marker, proposalManager, 'name', 'description')
        .encodeABI();
      const res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, calldata, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, { from: charlie });

      await this.fundProposalManagerX.triggerApprove(proposalId, { from: dan });

      proposalMarkers = await this.fundStorageX.getProposalMarkers();
      assert.equal(proposalMarkers.length, prevLength + 1);
      assert.equal(proposalMarkers[proposalMarkers.length - 1], marker);

      const markerDetails = await this.fundStorageX.getProposalMarker(marker);
      assert.equal(markerDetails._proposalManager, proposalManager);
      assert.equal(markerDetails._name, 'name');
      assert.equal(markerDetails._description, 'description');
    });
  });
});
