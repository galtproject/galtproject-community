const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const RegularErc20FeeFactory = artifacts.require('./RegularErc20FeeFactory.sol');
const RegularErc20Fee = artifacts.require('./RegularErc20Fee.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');

const { deployFundFactory, buildFund, VotingConfig } = require('./deploymentHelpers');
const { ether, assertRevert, lastBlockTimestamp, initHelperWeb3, increaseTime, evmIncreaseTime } = require('./helpers');

const { web3 } = SpaceToken;

initHelperWeb3(web3);

// 60
const ONE_MINUTE = 60;
// 60 * 60
const ONE_HOUR = 3600;
// 60 * 60 * 24
const ONE_DAY = 86400;
// 60 * 60 * 24 * 30
const ONE_MONTH = 2592000;

contract('Regular ERC20 Fees', accounts => {
  const [coreTeam, alice, bob, charlie, dan] = accounts;

  before(async function() {
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.spaceToken = await SpaceToken.new(this.ggr.address, 'Name', 'Symbol', { from: coreTeam });
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.daiToken = await GaltToken.new({ from: coreTeam });

    await this.ggr.setContract(await this.ggr.SPACE_TOKEN(), this.spaceToken.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.GALT_TOKEN(), this.galtToken.address, { from: coreTeam });

    // assign roles
    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });
    await this.daiToken.mint(alice, ether(10000000), { from: coreTeam });
    await this.daiToken.mint(bob, ether(10000000), { from: coreTeam });
    await this.daiToken.mint(charlie, ether(10000000), { from: coreTeam });

    // fund factory contracts
    this.fundFactory = await deployFundFactory(this.ggr.address, alice);

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

    // this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.beneficiaries = [alice, bob, charlie];
    this.benefeciarSpaceTokens = ['1', '2', '3'];

    await this.fundRAX.mintAllHack(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

    this.regularErc20FeeFactory = await RegularErc20FeeFactory.new({ from: coreTeam });
  });

  beforeEach(async function() {
    let res = await lastBlockTimestamp();
    this.initialTimestamp = res + ONE_HOUR;
    res = await this.regularErc20FeeFactory.build(
      this.daiToken.address,
      this.fundStorageX.address,
      this.initialTimestamp.toString(10),
      ONE_MONTH,
      ether(40)
    );
    this.feeAddress = res.logs[0].args.addr;
    this.regularErc20Fee = await RegularErc20Fee.at(this.feeAddress);
  });

  it('should instantiate contract correctly', async function() {
    let res = await this.regularErc20Fee.initialTimestamp();
    assert.equal(res, this.initialTimestamp);
    res = await this.regularErc20Fee.periodLength();
    assert.equal(res, ONE_MONTH);
    res = await this.regularErc20Fee.rate();
    assert.equal(res, ether(40));
    res = await this.regularErc20Fee.erc20Token();
    assert.equal(res, this.daiToken.address);
  });

  describe('period detection', () => {
    it('should detect period correctly', async function() {
      // >> - 0 month 0 day 1 hour
      await assertRevert(this.regularErc20Fee.getCurrentPeriod());
      let res = await this.regularErc20Fee.getNextPeriodTimestamp();
      assert.equal(res, this.initialTimestamp);

      // >> 0 month 0 day 0 hour
      await increaseTime(ONE_HOUR + ONE_MINUTE);

      res = await this.regularErc20Fee.getCurrentPeriod();
      assert.equal(res, 0);
      res = await this.regularErc20Fee.getNextPeriodTimestamp();
      assert.equal(res, this.initialTimestamp + ONE_MONTH);

      // >> 0 month 0 day 23 hour
      await increaseTime(23 * ONE_HOUR);

      res = await this.regularErc20Fee.getCurrentPeriod();
      assert.equal(res, 0);
      res = await this.regularErc20Fee.getNextPeriodTimestamp();
      assert.equal(res, this.initialTimestamp + ONE_MONTH);

      // >> 0 month 1 day 0 hour
      await increaseTime(ONE_HOUR);

      res = await this.regularErc20Fee.getCurrentPeriod();
      assert.equal(res, 0);
      res = await this.regularErc20Fee.getNextPeriodTimestamp();
      assert.equal(res, this.initialTimestamp + ONE_MONTH);

      // >> 1 month 0 day 0 hour
      await increaseTime(29 * ONE_DAY);

      res = await this.regularErc20Fee.getCurrentPeriod();
      assert.equal(res, 1);
      res = await this.regularErc20Fee.getNextPeriodTimestamp();
      assert.equal(res, this.initialTimestamp + 2 * ONE_MONTH);

      // >> 2 month 0 day 0 hour
      await increaseTime(30 * ONE_DAY);

      res = await this.regularErc20Fee.getCurrentPeriod();
      assert.equal(res, 2);
      res = await this.regularErc20Fee.getNextPeriodTimestamp();
      assert.equal(res, this.initialTimestamp + 3 * ONE_MONTH);
    });
  });

  describe('registered contract', () => {
    it('should od this', async function() {
      const calldata = this.fundStorageX.contract.methods.addFeeContract(this.feeAddress).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, calldata, 'blah', {
        from: alice
      });
      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, { from: charlie });
      await this.fundProposalManagerX.aye(proposalId, { from: alice });

      await evmIncreaseTime(VotingConfig.ONE_WEEK + 1);

      await this.fundProposalManagerX.triggerApprove(proposalId, { from: dan });

      res = await this.fundStorageX.getFeeContracts();
      assert.sameMembers(res, [this.feeAddress]);

      // - initially only Alice, Bob, Charlie are the fund participants

      await increaseTime(ONE_DAY + 2 * ONE_HOUR);

      // >> month 0 day 1 hour 1
      // - alice pays 30 DAI
      await this.daiToken.approve(this.regularErc20Fee.address, ether(30), { from: alice });
      await this.regularErc20Fee.pay('1', ether(30), { from: alice });

      await increaseTime(ONE_DAY);

      // >> month 0 day 2 hour 1
      // - bob pays 40 DAI
      await this.daiToken.approve(this.regularErc20Fee.address, ether(40), { from: bob });
      await this.regularErc20Fee.pay('2', ether(40), { from: bob });
      // - charlie pays 60 DAI
      // TODO: ensure payment not grater given than value
      await this.daiToken.approve(this.regularErc20Fee.address, ether(60), { from: charlie });
      await this.regularErc20Fee.pay('3', ether(60), { from: charlie });

      const multiSigBalance = await this.daiToken.balanceOf(this.fundMultiSigX.address);
      assert.equal(multiSigBalance, ether(130));

      res = await this.regularErc20Fee.paidUntil('1');
      assert.equal(res, this.initialTimestamp + (ONE_MONTH / 4) * 3);

      res = await this.regularErc20Fee.paidUntil('2');
      assert.equal(res, this.initialTimestamp + ONE_MONTH);

      res = await this.regularErc20Fee.paidUntil('3');
      assert.equal(res, this.initialTimestamp + (ONE_MONTH / 4) * 6);
    });
  });
});
