const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const SpaceLockerRegistry = artifacts.require('./SpaceLockerRegistry.sol');
const SpaceLockerFactory = artifacts.require('./SpaceLockerFactory.sol');
const SpaceLocker = artifacts.require('./SpaceLocker.sol');
const MockSplitMerge = artifacts.require('./MockSplitMerge.sol');

const { deployFundFactory, buildFund } = require('./deploymentHelpers');
const { ether, assertRevert, initHelperWeb3, zeroAddress } = require('./helpers');

const { web3 } = SpaceToken;

initHelperWeb3(web3);

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  APPROVED: 2,
  REJECTED: 3
};

const Currency = {
  ETH: 0,
  ERC20: 1
};

const ETH_CONTRACT = '0x0000000000000000000000000000000000000001';

contract('FineFundMemberProposal', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank, minter, geoDateManagement, unauthorized] = accounts;

  beforeEach(async function() {
    this.spaceToken = await SpaceToken.new('Name', 'Symbol', { from: coreTeam });
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.splitMerge = await MockSplitMerge.new();
    this.spaceLockerRegistry = await SpaceLockerRegistry.new({ from: coreTeam });
    this.spaceLockerFactory = await SpaceLockerFactory.new(
      this.spaceLockerRegistry.address,
      this.galtToken.address,
      this.spaceToken.address,
      this.splitMerge.address,
      { from: coreTeam }
    );

    // assign roles
    this.spaceToken.addRoleTo(minter, 'minter', { from: coreTeam });
    this.spaceLockerRegistry.addRoleTo(this.spaceLockerFactory.address, await this.spaceLockerRegistry.ROLE_FACTORY(), {
      from: coreTeam
    });
    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    // fund factory contracts
    const fundFactory = await deployFundFactory(
      this.galtToken.address,
      this.spaceToken.address,
      this.spaceLockerRegistry.address,
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
    this.fundMultiSigX = fund.fundMultiSig;
    this.rsraX = fund.fundRsra;
    this.fineMemberProposalManagerX = fund.fineMemberProposalManager;

    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['2', '3', '4', '5', '6'];
    await this.rsraX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });
  });

  describe('proposal pipeline', () => {
    beforeEach(async function() {
      let res = await this.spaceToken.mint(alice, { from: minter });
      this.token1 = res.logs[0].args.tokenId.toNumber();

      res = await this.spaceToken.ownerOf(this.token1);
      assert.equal(res, alice);

      // HACK
      await this.splitMerge.setTokenArea(this.token1, 800, { from: geoDateManagement });

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
      assert.equal(res, 0);

      res = await locker.tokenDeposited();
      assert.equal(res, true);

      res = await this.spaceLockerRegistry.isValid(this.lockerAddress);
      assert.equal(res, true);

      // MINT REPUTATION
      await locker.approveMint(this.rsraX.address, { from: alice });
      await assertRevert(this.rsraX.mint(this.lockerAddress, { from: minter }));
      await this.rsraX.mint(this.lockerAddress, { from: alice });
    });

    it('should allow proposals an payments in GALT (ERC20)', async function() {
      // FINE
      let res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, 0);

      res = await this.fineMemberProposalManagerX.propose(
        this.token1,
        Currency.ERC20,
        350,
        this.galtToken.address,
        'blah',
        {
          from: unauthorized
        }
      );

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fineMemberProposalManagerX.getProposal(proposalId);
      assert.equal(web3.utils.hexToNumberString(res.spaceTokenId), this.token1);
      assert.equal(res.description, 'blah');

      await this.fineMemberProposalManagerX.aye(proposalId, { from: bob });
      await this.fineMemberProposalManagerX.aye(proposalId, { from: charlie });
      await this.fineMemberProposalManagerX.aye(proposalId, { from: dan });
      await this.fineMemberProposalManagerX.aye(proposalId, { from: eve });
      await this.fineMemberProposalManagerX.aye(proposalId, { from: frank });

      res = await this.fineMemberProposalManagerX.getAyeShare(proposalId);
      assert.equal(res, 65);
      res = await this.fineMemberProposalManagerX.getThreshold();
      assert.equal(res, 60);

      await this.fineMemberProposalManagerX.triggerApprove(proposalId);

      res = await this.fineMemberProposalManagerX.getProposalVoting(proposalId);
      assert.equal(res.status, ProposalStatus.APPROVED);

      // BURN SHOULD BE REJECTED IF THERE ARE SOME FINES REGARDING THIS TOKEN
      await assertRevert(this.rsraX.approveBurn(this.lockerAddress, { from: alice }));

      res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, 350);
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, 350);

      res = await this.fundStorageX.getFineProposals(this.token1, this.galtToken.address);
      assert.deepEqual(res.map(id => id.toString(10)), [proposalId.toString(10)]);

      res = await this.fundStorageX.getFineProposalsManagers(this.token1, this.galtToken.address);
      assert.deepEqual(res, [this.fineMemberProposalManagerX.address]);

      res = await this.fundStorageX.getFineSpaceTokens();
      assert.deepEqual(res.map(tokenId => tokenId.toString(10)), [this.token1.toString(10)]);

      res = await this.fundStorageX.getFineContractsBySpaceToken(this.token1);
      assert.deepEqual(res, [this.galtToken.address]);

      // Pay fee partially
      await this.galtToken.approve(this.fundControllerX.address, 300, { from: alice });
      await this.fundControllerX.payFine(this.token1, Currency.ERC20, 300, this.galtToken.address, { from: alice });
      res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, 50);
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, 50);

      // STILL UNABLE TO BURN REPUTATION
      await assertRevert(this.rsraX.approveBurn(this.lockerAddress, { from: alice }));

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
      await this.rsraX.approveBurn(this.lockerAddress, { from: alice });
    });

    it('should allow proposals an payments in ETH', async function() {
      // FINE
      let res = await this.fundStorageX.getFineAmount(this.token1, ETH_CONTRACT);
      assert.equal(res, 0);

      res = await this.fineMemberProposalManagerX.propose(this.token1, Currency.ETH, ether(350), zeroAddress, 'blah', {
        from: unauthorized
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fineMemberProposalManagerX.getProposal(proposalId);
      assert.equal(web3.utils.hexToNumberString(res.spaceTokenId), this.token1);
      assert.equal(res.description, 'blah');

      await this.fineMemberProposalManagerX.aye(proposalId, { from: bob });
      await this.fineMemberProposalManagerX.aye(proposalId, { from: charlie });
      await this.fineMemberProposalManagerX.aye(proposalId, { from: dan });
      await this.fineMemberProposalManagerX.aye(proposalId, { from: eve });
      await this.fineMemberProposalManagerX.aye(proposalId, { from: frank });

      res = await this.fineMemberProposalManagerX.getAyeShare(proposalId);
      assert.equal(res, 65);
      res = await this.fineMemberProposalManagerX.getThreshold();
      assert.equal(res, 60);

      await this.fineMemberProposalManagerX.triggerApprove(proposalId);

      res = await this.fineMemberProposalManagerX.getProposalVoting(proposalId);
      assert.equal(res.status, ProposalStatus.APPROVED);

      // BURN SHOULD BE REJECTED IF THERE ARE SOME FINES REGARDING THIS TOKEN
      await assertRevert(this.rsraX.approveBurn(this.lockerAddress, { from: alice }));

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
      await assertRevert(this.rsraX.approveBurn(this.lockerAddress, { from: alice }));

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
      await this.rsraX.approveBurn(this.lockerAddress, { from: alice });
    });

    it('should allow multiple proposals in ETH, GALT and other ERC20 tokens', async function() {
      await this.galtToken.mint(bob, ether(10000000), { from: coreTeam });

      this.dai = await GaltToken.new({ from: coreTeam });
      await this.dai.mint(alice, ether(10000000), { from: coreTeam });

      // MINT ANOTHER SPACE TOKEN
      let res = await this.spaceToken.mint(bob, { from: minter });
      this.token2 = res.logs[0].args.tokenId.toNumber();

      await this.splitMerge.setTokenArea(this.token2, 900, { from: geoDateManagement });
      await this.galtToken.approve(this.spaceLockerFactory.address, ether(10), { from: bob });
      res = await this.spaceLockerFactory.build({ from: bob });
      this.lockerAddress2 = res.logs[0].args.locker;
      const locker2 = await SpaceLocker.at(this.lockerAddress2);

      // DEPOSIT SPACE TOKEN
      await this.spaceToken.approve(this.lockerAddress2, this.token2, { from: bob });
      await locker2.deposit(this.token2, { from: bob });
      await locker2.approveMint(this.rsraX.address, { from: bob });
      await assertRevert(this.rsraX.mint(this.lockerAddress2, { from: minter }));
      await this.rsraX.mint(this.lockerAddress2, { from: bob });

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
      res = await this.fineMemberProposalManagerX.propose(this.token1, Currency.ETH, ether(350), zeroAddress, 'blah', {
        from: unauthorized
      });
      const ethProposalId = res.logs[0].args.proposalId.toString(10);
      await this.fineMemberProposalManagerX.aye(ethProposalId, { from: bob });
      await this.fineMemberProposalManagerX.aye(ethProposalId, { from: charlie });
      await this.fineMemberProposalManagerX.aye(ethProposalId, { from: dan });
      await this.fineMemberProposalManagerX.aye(ethProposalId, { from: eve });
      await this.fineMemberProposalManagerX.aye(ethProposalId, { from: frank });
      await this.fineMemberProposalManagerX.triggerApprove(ethProposalId);

      await assertRevert(this.rsraX.approveBurn(this.lockerAddress, { from: alice }));

      res = await this.fundStorageX.getFineAmount(this.token1, ETH_CONTRACT);
      assert.equal(res, ether(350));
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(350));

      // FINE in GALT
      res = await this.fineMemberProposalManagerX.propose(
        this.token1,
        Currency.ERC20,
        ether(450),
        this.galtToken.address,
        'blah',
        {
          from: unauthorized
        }
      );
      const galtProposalId = res.logs[0].args.proposalId.toString(10);
      await this.fineMemberProposalManagerX.aye(galtProposalId, { from: bob });
      await this.fineMemberProposalManagerX.aye(galtProposalId, { from: charlie });
      await this.fineMemberProposalManagerX.aye(galtProposalId, { from: dan });
      await this.fineMemberProposalManagerX.aye(galtProposalId, { from: eve });
      await this.fineMemberProposalManagerX.aye(galtProposalId, { from: frank });
      await this.fineMemberProposalManagerX.triggerApprove(galtProposalId);

      await assertRevert(this.rsraX.approveBurn(this.lockerAddress, { from: alice }));

      res = await this.fundStorageX.getFineAmount(this.token1, this.galtToken.address);
      assert.equal(res, ether(450));
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(800));

      // FINE in DAI
      res = await this.fineMemberProposalManagerX.propose(
        this.token1,
        Currency.ERC20,
        ether(550),
        this.dai.address,
        'blah',
        {
          from: unauthorized
        }
      );
      const daiProposalId = res.logs[0].args.proposalId.toString(10);
      await this.fineMemberProposalManagerX.aye(daiProposalId, { from: bob });
      await this.fineMemberProposalManagerX.aye(daiProposalId, { from: charlie });
      await this.fineMemberProposalManagerX.aye(daiProposalId, { from: dan });
      await this.fineMemberProposalManagerX.aye(daiProposalId, { from: eve });
      await this.fineMemberProposalManagerX.aye(daiProposalId, { from: frank });
      await this.fineMemberProposalManagerX.triggerApprove(daiProposalId);

      await assertRevert(this.rsraX.approveBurn(this.lockerAddress, { from: alice }));

      res = await this.fundStorageX.getFineAmount(this.token1, this.dai.address);
      assert.equal(res, ether(550));
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(1350));

      // TOKEN2 FINE in DAI
      res = await this.fineMemberProposalManagerX.propose(
        this.token2,
        Currency.ERC20,
        ether(650),
        this.galtToken.address,
        'blah',
        {
          from: unauthorized
        }
      );
      const anotherGaltProposalId = res.logs[0].args.proposalId.toString(10);
      await this.fineMemberProposalManagerX.aye(anotherGaltProposalId, { from: bob });
      await this.fineMemberProposalManagerX.aye(anotherGaltProposalId, { from: charlie });
      await this.fineMemberProposalManagerX.aye(anotherGaltProposalId, { from: dan });
      await this.fineMemberProposalManagerX.aye(anotherGaltProposalId, { from: eve });
      await this.fineMemberProposalManagerX.aye(anotherGaltProposalId, { from: frank });
      await this.fineMemberProposalManagerX.triggerApprove(anotherGaltProposalId);

      await assertRevert(this.rsraX.approveBurn(this.lockerAddress2, { from: alice }));

      res = await this.fundStorageX.getFineAmount(this.token1, this.dai.address);
      assert.equal(res, ether(550));
      res = await this.fundStorageX.getTotalFineAmount(this.token1);
      assert.equal(res, ether(1350));
      res = await this.fundStorageX.getFineAmount(this.token2, this.galtToken.address);
      assert.equal(res, ether(650));
      res = await this.fundStorageX.getTotalFineAmount(this.token2);
      assert.equal(res, ether(650));

      await assertRevert(this.rsraX.approveBurn(this.lockerAddress, { from: alice }));
      await assertRevert(this.rsraX.approveBurn(this.lockerAddress2, { from: bob }));

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

      await assertRevert(this.rsraX.approveBurn(this.lockerAddress, { from: alice }));
      await assertRevert(this.rsraX.approveBurn(this.lockerAddress2, { from: bob }));

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

      await assertRevert(this.rsraX.approveBurn(this.lockerAddress, { from: alice }));
      await assertRevert(this.rsraX.approveBurn(this.lockerAddress2, { from: bob }));

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

      await assertRevert(this.rsraX.approveBurn(this.lockerAddress, { from: alice }));
      await assertRevert(this.rsraX.approveBurn(this.lockerAddress2, { from: bob }));

      // ANOTHER FINE in ETH
      res = await this.fineMemberProposalManagerX.propose(this.token1, Currency.ETH, ether(150), zeroAddress, 'blah', {
        from: unauthorized
      });
      const ethProposal2Id = res.logs[0].args.proposalId.toString(10);
      await this.fineMemberProposalManagerX.aye(ethProposal2Id, { from: bob });
      await this.fineMemberProposalManagerX.aye(ethProposal2Id, { from: charlie });
      await this.fineMemberProposalManagerX.aye(ethProposal2Id, { from: dan });
      await this.fineMemberProposalManagerX.aye(ethProposal2Id, { from: eve });
      await this.fineMemberProposalManagerX.aye(ethProposal2Id, { from: frank });
      await this.fineMemberProposalManagerX.triggerApprove(ethProposal2Id);

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

      await assertRevert(this.rsraX.approveBurn(this.lockerAddress, { from: alice }));
      await assertRevert(this.rsraX.approveBurn(this.lockerAddress2, { from: bob }));

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

      await assertRevert(this.rsraX.approveBurn(this.lockerAddress2, { from: bob }));

      // TOKEN 1 REPUTATION BURN
      this.rsraX.approveBurn(this.lockerAddress, { from: alice });

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
      this.rsraX.approveBurn(this.lockerAddress2, { from: bob });

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
