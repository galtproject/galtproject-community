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

const WLProposalManager = artifacts.require('./WLProposalManager.sol');

const { ether, initHelperWeb3 } = require('./helpers');

const { web3 } = SpaceToken;

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
    this.modifyConfigProposalManagerAddress = res.logs[0].args.modifyConfigProposalManager;

    res = await this.fundFactory.buildThirdStep({ from: alice });
    this.wlProposalManagerX = await WLProposalManager.at(res.logs[0].args.whiteListProposalManager);

    this.beneficiaries = [bob, charlie, dan, eve, frank];
  });

  describe('pipeline', () => {
    it('should allow address addition to the WL', async function() {
      await this.rsraX.mintAll(this.beneficiaries, 300, { from: alice });

      let res = await this.wlProposalManagerX.propose(address4wl, Action.ADD, 'blah', {
        from: bob
      });

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
      await this.rsraX.mintAll(this.beneficiaries, 300, { from: alice });

      let res = await this.wlProposalManagerX.propose(this.modifyConfigProposalManagerAddress, Action.REMOVE, 'blah', {
        from: bob
      });

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
