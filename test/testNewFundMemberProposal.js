const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const LockerRegistry = artifacts.require('./LockerRegistry.sol');
const SpaceLockerFactory = artifacts.require('./SpaceLockerFactory.sol');
const SpaceLocker = artifacts.require('./SpaceLocker.sol');
const MockSplitMerge = artifacts.require('./MockSplitMerge.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');
const FeeRegistry = artifacts.require('./FeeRegistry.sol');
const ACL = artifacts.require('./ACL.sol');

const { deployFundFactory, buildFund } = require('./deploymentHelpers');
const { ether, assertRevert, initHelperWeb3, paymentMethods, getDestinationMarker } = require('./helpers');

const { web3 } = SpaceToken;
const { utf8ToHex } = web3.utils;
const bytes32 = utf8ToHex;

initHelperWeb3(web3);

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  APPROVED: 2,
  EXECUTED: 3,
  REJECTED: 4
};

contract('NewFundMemberProposal', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank, minter, geoDateManagement, unauthorized] = accounts;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.acl = await ACL.new({ from: coreTeam });
    this.splitMerge = await MockSplitMerge.new({ from: coreTeam });
    this.spaceToken = await SpaceToken.new(this.ggr.address, 'Name', 'Symbol', { from: coreTeam });
    this.spaceLockerRegistry = await LockerRegistry.new(this.ggr.address, bytes32('SPACE_LOCKER_REGISTRAR'), {
      from: coreTeam
    });
    this.feeRegistry = await FeeRegistry.new({ from: coreTeam });

    await this.ggr.setContract(await this.ggr.ACL(), this.acl.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.FEE_REGISTRY(), this.feeRegistry.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.SPACE_TOKEN(), this.spaceToken.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.GALT_TOKEN(), this.galtToken.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.SPACE_GEO_DATA_REGISTRY(), this.splitMerge.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.SPACE_LOCKER_REGISTRY(), this.spaceLockerRegistry.address, {
      from: coreTeam
    });

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    this.spaceLockerFactory = await SpaceLockerFactory.new(this.ggr.address, { from: coreTeam });
    await this.feeRegistry.setGaltFee(await this.spaceLockerFactory.FEE_KEY(), ether(10), { from: coreTeam });
    await this.feeRegistry.setEthFee(await this.spaceLockerFactory.FEE_KEY(), ether(5), { from: coreTeam });
    await this.feeRegistry.setPaymentMethod(await this.spaceLockerFactory.FEE_KEY(), paymentMethods.ETH_AND_GALT, {
      from: coreTeam
    });

    await this.acl.setRole(bytes32('SPACE_MINTER'), minter, true);
    await this.acl.setRole(bytes32('SPACE_LOCKER_REGISTRAR'), this.spaceLockerFactory.address, true, {
      from: coreTeam
    });

    // fund factory contracts
    this.fundFactory = await deployFundFactory(this.ggr.address, alice);
  });

  beforeEach(async function() {
    // build fund
    await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
    const fund = await buildFund(this.fundFactory, alice, true, 300000, {}, [bob, charlie, dan], 2);

    this.fundStorageX = fund.fundStorage;
    this.fundControllerX = fund.fundController;
    this.fundRAX = fund.fundRA;
    this.fundProposalManagerX = fund.fundProposalManager;

    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['1', '2', '3', '4', '5'];
    await this.fundRAX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });
  });

  describe('proposal pipeline', () => {
    it('should allow user who has reputation creating a new proposal', async function() {
      let res = await this.spaceToken.mint(alice, { from: minter });
      const token1 = res.logs[0].args.tokenId.toNumber();

      res = await this.spaceToken.ownerOf(token1);
      assert.equal(res, alice);

      // HACK
      await this.splitMerge.setSpaceTokenArea(token1, 800, { from: geoDateManagement });

      await this.galtToken.approve(this.spaceLockerFactory.address, ether(10), { from: alice });
      res = await this.spaceLockerFactory.build({ from: alice });
      const lockerAddress = res.logs[0].args.locker;

      const locker = await SpaceLocker.at(lockerAddress);

      // DEPOSIT SPACE TOKEN
      await this.spaceToken.approve(lockerAddress, token1, { from: alice });
      await locker.deposit(token1, { from: alice });

      res = await locker.reputation();
      assert.equal(res, 800);

      res = await locker.owner();
      assert.equal(res, alice);

      res = await locker.spaceTokenId();
      assert.equal(res, 0);

      res = await locker.tokenDeposited();
      assert.equal(res, true);

      res = await this.spaceLockerRegistry.isValid(lockerAddress);
      assert.equal(res, true);

      // MINT REPUTATION
      await locker.approveMint(this.fundRAX.address, { from: alice });
      await assertRevert(this.fundRAX.mint(lockerAddress, { from: minter }));
      await assertRevert(this.fundRAX.mint(lockerAddress, { from: alice }));

      const marker = getDestinationMarker(this.fundStorageX, 'approveMint');

      const calldata = this.fundStorageX.contract.methods.approveMint(token1).encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, calldata, 'blah', {
        from: bob
      });

      const { proposalId } = res.logs[0].args;

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.description, 'blah');

      res = await this.fundStorageX.isMintApproved(token1);
      assert.equal(res, false);

      await this.fundProposalManagerX.aye(proposalId, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, { from: charlie });

      res = await this.fundProposalManagerX.getAyeShare(proposalId);
      assert.equal(res, 400000);
      res = await this.fundProposalManagerX.getThreshold(proposalId);
      assert.equal(res, 300000);

      await this.fundProposalManagerX.triggerApprove(proposalId);

      res = await this.fundProposalManagerX.getActiveProposals(marker);
      assert.deepEqual(res, []);
      res = await this.fundProposalManagerX.getActiveProposalsCount(marker);
      assert.equal(res.toString(10), '0');

      res = await this.fundProposalManagerX.getActiveProposalsBySender(unauthorized, marker);
      assert.deepEqual(res, []);
      res = await this.fundProposalManagerX.getActiveProposalsBySenderCount(unauthorized, marker);
      assert.equal(res.toString(10), '0');

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      res = await this.fundStorageX.isMintApproved(token1);
      assert.equal(res, true);

      await this.fundRAX.mint(lockerAddress, { from: alice });

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 800);
    });
  });
});
