const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');

const galt = require('@galtproject/utils');
const { deployFundFactory, buildFund } = require('./deploymentHelpers');
const { ether, initHelperWeb3 } = require('./helpers');

const { web3 } = SpaceToken;
const bytes32 = web3.utils.utf8ToHex;

initHelperWeb3(web3);

const Action = {
  ADD: 0,
  REMOVE: 1
};

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  APPROVED: 2,
  REJECTED: 3
};

contract('WLProposal', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank, spaceLockerRegistryAddress, address4wl] = accounts;

  beforeEach(async function() {
    this.spaceToken = await SpaceToken.new('Name', 'Symbol', { from: coreTeam });
    this.galtToken = await GaltToken.new({ from: coreTeam });

    // assign roles
    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    // fund factory contracts
    const fundFactory = await deployFundFactory(
      this.galtToken.address,
      this.spaceToken.address,
      spaceLockerRegistryAddress,
      alice
    );

    // build fund
    await this.galtToken.approve(fundFactory.address, ether(100), { from: alice });
    const fund = await buildFund(
      fundFactory,
      alice,
      false,
      [60, 50, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60],
      [bob, charlie, dan],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundControllerX = fund.fundController;
    this.rsraX = fund.fundRsra;
    this.wlProposalManagerX = fund.whiteListProposalManager;
    this.modifyConfigProposalManagerAddress = fund.modifyConfigProposalManager.address;
    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['1', '2', '3', '4', '5'];
  });

  describe('pipeline', () => {
    it('should allow address addition to the WL', async function() {
      await this.rsraX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      let res = await this.wlProposalManagerX.propose(
        Action.ADD,
        address4wl,
        bytes32('new_contract'),
        galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd'),
        'blah',
        { from: bob }
      );

      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.wlProposalManagerX.aye(proposalId, { from: bob });
      await this.wlProposalManagerX.nay(proposalId, { from: charlie });
      await this.wlProposalManagerX.aye(proposalId, { from: dan });
      await this.wlProposalManagerX.aye(proposalId, { from: eve });

      res = await this.wlProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob, dan, eve]);
      assert.sameMembers(res.nays, [charlie]);

      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.wlProposalManagerX.getAyeShare(proposalId);
      assert.equal(res, 60);
      res = await this.wlProposalManagerX.getNayShare(proposalId);
      assert.equal(res, 20);

      await this.wlProposalManagerX.triggerApprove(proposalId, { from: dan });

      res = await this.wlProposalManagerX.getProposalVoting(proposalId);
      assert.equal(res.status, ProposalStatus.APPROVED);

      res = await this.fundStorageX.getWhiteListedContracts();
      assert.include(res, address4wl);
    });

    it('should allow address removal from the WL', async function() {
      await this.rsraX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

      let res = await this.wlProposalManagerX.propose(
        Action.REMOVE,
        this.modifyConfigProposalManagerAddress,
        bytes32('new_contract'),
        bytes32(''),
        'obsolete',
        {
          from: bob
        }
      );

      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.wlProposalManagerX.aye(proposalId, { from: bob });
      await this.wlProposalManagerX.nay(proposalId, { from: charlie });
      await this.wlProposalManagerX.aye(proposalId, { from: dan });
      await this.wlProposalManagerX.aye(proposalId, { from: eve });

      res = await this.wlProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob, dan, eve]);
      assert.sameMembers(res.nays, [charlie]);

      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.wlProposalManagerX.getAyeShare(proposalId);
      assert.equal(res, 60);
      res = await this.wlProposalManagerX.getNayShare(proposalId);
      assert.equal(res, 20);

      res = await this.fundStorageX.getWhiteListedContracts();
      assert.include(res, this.modifyConfigProposalManagerAddress);

      await this.wlProposalManagerX.triggerApprove(proposalId, { from: dan });

      res = await this.wlProposalManagerX.getProposalVoting(proposalId);
      assert.equal(res.status, ProposalStatus.APPROVED);

      res = await this.fundStorageX.getWhiteListedContracts();
      assert.notInclude(res, this.modifyConfigProposalManagerAddress);
    });
  });
});
