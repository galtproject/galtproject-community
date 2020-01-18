const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const LockerRegistry = artifacts.require('./LockerRegistry.sol');
const SpaceLockerFactory = artifacts.require('./SpaceLockerFactory.sol');
const SpaceLocker = artifacts.require('./SpaceLocker.sol');
const MockSpaceGeoDataRegistry = artifacts.require('./MockSpaceGeoDataRegistry.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');
const FeeRegistry = artifacts.require('./FeeRegistry.sol');
const ACL = artifacts.require('./ACL.sol');

const { deployFundFactory, buildFund, VotingConfig } = require('./deploymentHelpers');
const { ether, assertRevert, initHelperWeb3, zeroAddress, paymentMethods } = require('./helpers');

const { web3 } = SpaceToken;
const { utf8ToHex } = web3.utils;
const bytes32 = utf8ToHex;

initHelperWeb3(web3);

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  EXECUTED: 2
};

const Currency = {
  ETH: 0,
  ERC20: 1
};

const ETH_CONTRACT = '0x0000000000000000000000000000000000000001';

contract('FineFundMemberProposal', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank, minter, geoDateManagement] = accounts;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.acl = await ACL.new({ from: coreTeam });
    this.spaceGeoDataRegistry = await MockSpaceGeoDataRegistry.new({ from: coreTeam });
    this.spaceToken = await SpaceToken.new(this.ggr.address, 'Name', 'Symbol', { from: coreTeam });
    this.lockerRegistry = await LockerRegistry.new(this.ggr.address, bytes32('SPACE_LOCKER_REGISTRAR'), {
      from: coreTeam
    });
    this.feeRegistry = await FeeRegistry.new({ from: coreTeam });

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    await this.ggr.setContract(await this.ggr.ACL(), this.acl.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.FEE_REGISTRY(), this.feeRegistry.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.SPACE_TOKEN(), this.spaceToken.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.GALT_TOKEN(), this.galtToken.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.SPACE_GEO_DATA_REGISTRY(), this.spaceGeoDataRegistry.address, {
      from: coreTeam
    });
    await this.ggr.setContract(await this.ggr.SPACE_LOCKER_REGISTRY(), this.lockerRegistry.address, {
      from: coreTeam
    });

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
    // NOTICE: hardcoded token IDs, increment when new tests added
    this.benefeciarSpaceTokens = ['4', '5', '6', '7', '8'];
    await this.fundRAX.mintAllHack(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });
  });

  describe('proposal pipeline', () => {
    beforeEach(async function() {
      let res = await this.spaceToken.mint(alice, { from: minter });
      this.token1 = res.logs[0].args.tokenId.toNumber();

      res = await this.spaceToken.ownerOf(this.token1);
      assert.equal(res, alice);

      // HACK
      await this.spaceGeoDataRegistry.setArea(this.token1, 800, { from: geoDateManagement });

      await this.galtToken.approve(this.spaceLockerFactory.address, ether(10), { from: alice });
      res = await this.spaceLockerFactory.build({ from: alice });
      this.lockerAddress = res.logs[0].args.locker;

      const locker = await SpaceLocker.at(this.lockerAddress);

      // DEPOSIT SPACE TOKEN
      await this.spaceToken.approve(this.lockerAddress, this.token1, { from: alice });
      await locker.deposit(this.token1, { from: alice });

      res = await locker.reputation();
      assert.equal(res, 800);

      res = await locker.owner();
      assert.equal(res, alice);

      res = await locker.spaceTokenId();
      assert.equal(res, this.token1);

      res = await locker.tokenDeposited();
      assert.equal(res, true);

      res = await this.lockerRegistry.isValid(this.lockerAddress);
      assert.equal(res, true);

      // MINT REPUTATION
      await locker.approveMint(this.fundRAX.address, { from: alice });
      await assertRevert(this.fundRAX.mint(this.lockerAddress, { from: minter }));
      await this.fundRAX.mint(this.lockerAddress, { from: alice });
    });

    it('should allow proposals an payments in GALT (ERC20)', async function() {
      // FINE
      let res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, 0);

      const proposalData = this.fundStorageX.contract.methods
        .incrementFine(this.token1, this.galtToken.address, 350)
        .encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, proposalData, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.dataLink, 'blah');

      await this.fundProposalManagerX.aye(proposalId, true, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });
      await this.fundProposalManagerX.aye(proposalId, true, { from: dan });
      await this.fundProposalManagerX.aye(proposalId, true, { from: eve });
      await this.fundProposalManagerX.aye(proposalId, true, { from: frank });

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, '65217391304347826086');
      assert.equal(res.requiredSupport, ether(60));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // BURN SHOULD BE REJECTED IF THERE ARE SOME FINES REGARDING THIS TOKEN
      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress, { from: alice }));

      res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, 350);
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, 350);

      // Pay fee partially
      await this.galtToken.approve(this.fundControllerX.address, 300, { from: alice });
      await this.fundControllerX.payFine(this.token1, Currency.ERC20, 300, this.galtToken.address, { from: alice });
      res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, 50);
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, 50);

      // STILL UNABLE TO BURN REPUTATION
      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress, { from: alice }));

      await this.galtToken.approve(this.fundControllerX.address, 51, { from: alice });
      await assertRevert(
        this.fundControllerX.payFine(this.token1, Currency.ERC20, 51, this.galtToken.address, { from: alice })
      );

      // Pay fee completely
      await this.fundControllerX.payFine(this.token1, Currency.ERC20, 50, this.galtToken.address, { from: alice });
      res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, 0);
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, 0);

      // EVENTUALLY BURN REPUTATION
      await this.fundRAX.approveBurn(this.lockerAddress, { from: alice });
    });

    it('should allow proposals an payments in ETH', async function() {
      // FINE
      let res = await this.fundStorageX.getFineAmount(this.token1, ETH_CONTRACT);
      assert.equal(res, 0);

      const proposalData = this.fundStorageX.contract.methods
        .incrementFine(this.token1, ETH_CONTRACT, ether(350))
        .encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, proposalData, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.dataLink, 'blah');

      await this.fundProposalManagerX.aye(proposalId, true, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });
      await this.fundProposalManagerX.aye(proposalId, true, { from: dan });
      await this.fundProposalManagerX.aye(proposalId, true, { from: eve });
      await this.fundProposalManagerX.aye(proposalId, true, { from: frank });

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, '65217391304347826086');

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // BURN SHOULD BE REJECTED IF THERE ARE SOME FINES REGARDING THIS TOKEN
      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress, { from: alice }));

      res = await this.fundStorageX.getFineAmount(this.token1, ETH_CONTRACT);
      assert.equal(res, ether(350));
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(350));

      // Pay fee partially
      await this.fundControllerX.payFine(this.token1, Currency.ETH, 0, zeroAddress, { from: alice, value: ether(300) });
      res = await this.fundStorageX.getFineAmount(this.token1, ETH_CONTRACT);
      assert.equal(res, ether(50));
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(50));

      // STILL UNABLE TO BURN REPUTATION
      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress, { from: alice }));

      await assertRevert(
        this.fundControllerX.payFine(this.token1, Currency.ETH, 0, zeroAddress, { from: alice, value: ether(51) })
      );

      // Pay fee completely
      await this.fundControllerX.payFine(this.token1, Currency.ETH, 0, zeroAddress, { from: alice, value: ether(50) });
      res = await this.fundStorageX.getFineAmount(this.token1, ETH_CONTRACT);
      assert.equal(res, 0);
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, 0);

      // EVENTUALLY BURN REPUTATION
      await this.fundRAX.approveBurn(this.lockerAddress, { from: alice });
    });

    it('should allow multiple proposals in ETH, GALT and other ERC20 tokens', async function() {
      await this.galtToken.mint(bob, ether(10000000), { from: coreTeam });

      this.dai = await GaltToken.new({ from: coreTeam });
      await this.dai.mint(alice, ether(10000000), { from: coreTeam });

      // MINT ANOTHER SPACE TOKEN
      let res = await this.spaceToken.mint(bob, { from: minter });
      this.token2 = res.logs[0].args.tokenId.toNumber();

      await this.spaceGeoDataRegistry.setArea(this.token2, 900, { from: geoDateManagement });
      await this.galtToken.approve(this.spaceLockerFactory.address, ether(10), { from: bob });
      res = await this.spaceLockerFactory.build({ from: bob });
      this.lockerAddress2 = res.logs[0].args.locker;
      const locker2 = await SpaceLocker.at(this.lockerAddress2);

      // DEPOSIT SPACE TOKEN
      await this.spaceToken.approve(this.lockerAddress2, this.token2, { from: bob });
      await locker2.deposit(this.token2, { from: bob });
      await locker2.approveMint(this.fundRAX.address, { from: bob });
      await assertRevert(this.fundRAX.mint(this.lockerAddress2, { from: minter }));
      await this.fundRAX.mint(this.lockerAddress2, { from: bob });

      // Scenario:
      // FINE in ETH 350
      // FINE in GALT 450
      // FINE in ERC20 550
      // TOKEN2 FINE in GALT 650
      // COMPLETE PAY in GALT
      // PARTIAL PAY in ETH
      // COMPLETE PAY in ERC20
      // ANOTHER FINE in ETH 150
      // COMPLETE PAY in ETH
      // TOKEN2 COMPLETE PAY in GALT

      // FINE in ETH
      let proposalData = this.fundStorageX.contract.methods
        .incrementFine(this.token1, ETH_CONTRACT, ether(350))
        .encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, proposalData, 'blah', {
        from: bob
      });

      const ethProposalId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(ethProposalId, true, { from: bob });
      await this.fundProposalManagerX.aye(ethProposalId, true, { from: charlie });
      await this.fundProposalManagerX.aye(ethProposalId, true, { from: dan });
      await this.fundProposalManagerX.aye(ethProposalId, true, { from: eve });

      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress, { from: alice }));

      res = await this.fundStorageX.getFineAmount(this.token1, ETH_CONTRACT);
      assert.equal(res, ether(350));
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(350));

      // FINE in GALT
      proposalData = this.fundStorageX.contract.methods
        .incrementFine(this.token1, this.galtToken.address, ether(450))
        .encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, proposalData, 'blah', {
        from: bob
      });
      const galtProposalId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(galtProposalId, true, { from: bob });
      await this.fundProposalManagerX.aye(galtProposalId, true, { from: charlie });
      await this.fundProposalManagerX.aye(galtProposalId, true, { from: dan });
      await this.fundProposalManagerX.aye(galtProposalId, true, { from: eve });

      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress, { from: alice }));

      res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, ether(450));
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(800));

      // FINE in DAI
      proposalData = this.fundStorageX.contract.methods
        .incrementFine(this.token1, this.dai.address, ether(550))
        .encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, proposalData, 'blah', {
        from: bob
      });
      const daiProposalId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(daiProposalId, true, { from: bob });
      await this.fundProposalManagerX.aye(daiProposalId, true, { from: charlie });
      await this.fundProposalManagerX.aye(daiProposalId, true, { from: dan });
      await this.fundProposalManagerX.aye(daiProposalId, true, { from: eve });

      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress, { from: alice }));

      res = await this.fundStorageX.getFineAmount(this.token1, this.dai.address);
      assert.equal(res, ether(550));
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(1350));

      // TOKEN2 FINE in DAI
      proposalData = this.fundStorageX.contract.methods
        .incrementFine(this.token2, this.galtToken.address, ether(650))
        .encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, proposalData, 'blah', {
        from: bob
      });
      const anotherGaltProposalId = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(anotherGaltProposalId, true, { from: bob });
      await this.fundProposalManagerX.aye(anotherGaltProposalId, true, { from: charlie });
      await this.fundProposalManagerX.aye(anotherGaltProposalId, true, { from: dan });
      await this.fundProposalManagerX.aye(anotherGaltProposalId, true, { from: eve });

      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress2, { from: alice }));

      res = await this.fundStorageX.getFineAmount(this.token1, this.dai.address);
      assert.equal(res, ether(550));
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(1350));
      res = await this.fundStorageX.getFineAmount(this.token2, this.galtToken.address);
      assert.equal(res, ether(650));
      res = await this.fundStorageX.getTotalFineAmount(this.token2);
      assert.equal(res, ether(650));

      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress, { from: alice }));
      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress2, { from: bob }));

      // COMPLETE PAY in GALT
      await this.galtToken.approve(this.fundControllerX.address, ether(450), { from: alice });
      await this.fundControllerX.payFine(this.token1, Currency.ERC20, ether(450), this.galtToken.address, {
        from: alice
      });

      res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, 0);
      res = await this.fundStorageX.getFineAmount(this.token1, this.dai.address);
      assert.equal(res, ether(550));
      res = await this.fundStorageX.getFineAmount(this.token2, this.galtToken.address);
      assert.equal(res, ether(650));

      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(900));
      res = await this.fundStorageX.getTotalFineAmount(this.token2);
      assert.equal(res, ether(650));

      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress, { from: alice }));
      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress2, { from: bob }));

      // PARTIAL PAY in ETH
      await this.fundControllerX.payFine(this.token1, Currency.ETH, 0, zeroAddress, {
        from: alice,
        value: ether(300)
      });

      res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, 0);
      res = await this.fundStorageX.getFineAmount(this.token1, this.dai.address);
      assert.equal(res, ether(550));
      res = await this.fundStorageX.getFineAmount(this.token1, ETH_CONTRACT);
      assert.equal(res, ether(50));
      res = await this.fundStorageX.getFineAmount(this.token2, this.galtToken.address);
      assert.equal(res, ether(650));

      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(600));
      res = await this.fundStorageX.getTotalFineAmount(this.token2);
      assert.equal(res, ether(650));

      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress, { from: alice }));
      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress2, { from: bob }));

      // COMPLETE PAY in ERC20
      await this.dai.approve(this.fundControllerX.address, ether(550), { from: alice });
      await this.fundControllerX.payFine(this.token1, Currency.ERC20, ether(550), this.dai.address, {
        from: alice
      });

      res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, 0);
      res = await this.fundStorageX.getFineAmount(this.token1, this.dai.address);
      assert.equal(res, ether(0));
      res = await this.fundStorageX.getFineAmount(this.token1, ETH_CONTRACT);
      assert.equal(res, ether(50));
      res = await this.fundStorageX.getFineAmount(this.token2, this.galtToken.address);
      assert.equal(res, ether(650));

      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(50));
      res = await this.fundStorageX.getTotalFineAmount(this.token2);
      assert.equal(res, ether(650));

      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress, { from: alice }));
      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress2, { from: bob }));

      // ANOTHER FINE in ETH
      proposalData = this.fundStorageX.contract.methods
        .incrementFine(this.token1, ETH_CONTRACT, ether(150))
        .encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, proposalData, 'blah', {
        from: bob
      });
      const ethProposal2Id = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(ethProposal2Id, true, { from: bob });
      await this.fundProposalManagerX.aye(ethProposal2Id, true, { from: charlie });
      await this.fundProposalManagerX.aye(ethProposal2Id, true, { from: dan });
      await this.fundProposalManagerX.aye(ethProposal2Id, true, { from: eve });

      res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, 0);
      res = await this.fundStorageX.getFineAmount(this.token1, this.dai.address);
      assert.equal(res, ether(0));
      res = await this.fundStorageX.getFineAmount(this.token1, ETH_CONTRACT);
      assert.equal(res, ether(200));
      res = await this.fundStorageX.getFineAmount(this.token2, this.galtToken.address);
      assert.equal(res, ether(650));

      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(200));
      res = await this.fundStorageX.getTotalFineAmount(this.token2);
      assert.equal(res, ether(650));

      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress, { from: alice }));
      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress2, { from: bob }));

      // COMPLETE PAY in ETH
      await this.fundControllerX.payFine(this.token1, Currency.ETH, 0, zeroAddress, {
        from: alice,
        value: ether(200)
      });

      res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, 0);
      res = await this.fundStorageX.getFineAmount(this.token1, this.dai.address);
      assert.equal(res, ether(0));
      res = await this.fundStorageX.getFineAmount(this.token1, ETH_CONTRACT);
      assert.equal(res, ether(0));
      res = await this.fundStorageX.getFineAmount(this.token2, this.galtToken.address);
      assert.equal(res, ether(650));

      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(0));
      res = await this.fundStorageX.getTotalFineAmount(this.token2);
      assert.equal(res, ether(650));

      await assertRevert(this.fundRAX.approveBurn(this.lockerAddress2, { from: bob }));

      // TOKEN 1 REPUTATION BURN
      this.fundRAX.approveBurn(this.lockerAddress, { from: alice });

      // TOKEN2 COMPLETE PAY in GALT
      await this.galtToken.approve(this.fundControllerX.address, ether(650), { from: alice });
      await this.fundControllerX.payFine(this.token2, Currency.ERC20, ether(650), this.galtToken.address, {
        from: alice
      });

      res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, 0);
      res = await this.fundStorageX.getFineAmount(this.token1, this.dai.address);
      assert.equal(res, ether(0));
      res = await this.fundStorageX.getFineAmount(this.token1, ETH_CONTRACT);
      assert.equal(res, ether(0));
      res = await this.fundStorageX.getFineAmount(this.token2, this.galtToken.address);
      assert.equal(res, ether(0));

      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(0));
      res = await this.fundStorageX.getTotalFineAmount(this.token2);
      assert.equal(res, ether(0));

      // TOKEN 2 REPUTATION BURN
      this.fundRAX.approveBurn(this.lockerAddress2, { from: bob });

      // CHECK MULTISIG BALANCES
      res = await this.galtToken.balanceOf(this.fundMultiSigX.address);
      assert.equal(res, ether(1100));

      res = await this.dai.balanceOf(this.fundMultiSigX.address);
      assert.equal(res, ether(550));

      res = await web3.eth.getBalance(this.fundMultiSigX.address);
      assert.equal(res, ether(500));
    });
  });
});
