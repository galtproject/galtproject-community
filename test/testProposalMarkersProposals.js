const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const SpaceToken = contract.fromArtifact('SpaceToken');
const GaltToken = contract.fromArtifact('GaltToken');
const GaltGlobalRegistry = contract.fromArtifact('GaltGlobalRegistry');
const FundFactory = contract.fromArtifact('FundFactory');

const { deployFundFactory, buildFund, VotingConfig } = require('./deploymentHelpers');
const { initHelperWeb3, getDestinationMarker, getMethodSignature, evmIncreaseTime } = require('./helpers');

// eslint-disable-next-line import/order
const { ether, hex, assertRevert } = require('@galtproject/solidity-test-chest')(web3);

initHelperWeb3(web3);

describe('Proposal Markers Proposals', () => {
  const [alice, bob, charlie, dan, eve, frank, proposalManager] = accounts;
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
    this.fundMultiSigX = fund.fundMultiSig;
    this.fundRAX = fund.fundRA;
    this.fundProposalManagerX = fund.fundProposalManager;

    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['1', '2', '3', '4', '5'];
  });

  describe('Add And Replace Proposal Marker', () => {
    it('should correctly set and get', async function() {
      await this.fundRAX.mintAllHack(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      const signature = getMethodSignature(this.galtToken.abi, 'transfer');
      const marker = getDestinationMarker(this.galtToken, 'transfer');

      let calldata = this.fundStorageX.contract.methods
        .addProposalMarker(signature, this.galtToken.address, proposalManager, hex('name'), 'dataLink')
        .encodeABI();
      let res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, calldata, 'blah', {
        from: bob
      });

      let proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, true, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });

      await assertRevert(
        this.fundProposalManagerX.executeProposal(proposalId, 0, { from: dan }),
        'Proposal is still active'
      );

      await evmIncreaseTime(VotingConfig.ONE_WEEK + 1);

      await this.fundProposalManagerX.executeProposal(proposalId, 0, { from: dan });

      let markerDetails = await this.fundStorageX.proposalMarkers(marker);
      assert.equal(markerDetails.proposalManager, proposalManager);
      assert.equal(web3.utils.hexToUtf8(markerDetails.name), 'name');
      assert.equal(markerDetails.dataLink, 'dataLink');
      assert.equal(markerDetails.destination, this.galtToken.address);

      const newSignature = getMethodSignature(this.spaceToken.abi, 'transferFrom');
      const newMarker = getDestinationMarker(this.spaceToken, 'transferFrom');

      calldata = this.fundStorageX.contract.methods
        .replaceProposalMarker(marker, newSignature, this.spaceToken.address)
        .encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, calldata, 'blah', {
        from: bob
      });

      proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, true, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });

      await evmIncreaseTime(VotingConfig.ONE_WEEK + 1);

      await this.fundProposalManagerX.executeProposal(proposalId, 0, { from: dan });

      markerDetails = await this.fundStorageX.proposalMarkers(newMarker);
      assert.equal(markerDetails.proposalManager, proposalManager);
      assert.equal(web3.utils.hexToUtf8(markerDetails.name), 'name');
      assert.equal(markerDetails.dataLink, 'dataLink');
      assert.equal(markerDetails.destination, this.spaceToken.address);
    });
  });
});
