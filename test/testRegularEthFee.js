const SpaceToken = artifacts.require('./SpaceToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const RegularEthFeeFactory = artifacts.require('./RegularEthFeeFactory.sol');
const RegularEthFee = artifacts.require('./RegularEthFee.sol');

const { deployFundFactory, buildFund } = require('./deploymentHelpers');
const { ether, assertRevert, lastBlockTimestamp, initHelperWeb3, increaseTime } = require('./helpers');

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

contract('Regular ETH Fees', accounts => {
  const [coreTeam, alice, bob, charlie, dan, spaceLockerRegistryAddress] = accounts;

  before(async function() {
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
      [60, 50, 60, 60, 60, 60, 60, 60, 60, 60],
      [bob, charlie, dan],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundControllerX = fund.fundController;
    this.fundMultiSigX = fund.fundMultiSig;
    this.rsraX = fund.fundRsra;
    this.expelMemberProposalManagerX = fund.expelMemberProposalManager;
    this.modifyConfigProposalManagerX = fund.modifyConfigProposalManager;
    this.addFundRuleProposalManagerX = fund.addFundRuleProposalManager;
    this.deactivateFundRuleProposalManagerX = fund.deactivateFundRuleProposalManager;
    this.modifyFeeProposalManager = fund.modifyFeeProposalManager;

    // this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.beneficiaries = [alice, bob, charlie];
    this.benefeciarSpaceTokens = ['1', '2', '3'];

    await this.rsraX.mintAll(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });

    this.regularEthFeeFactory = await RegularEthFeeFactory.new({ from: coreTeam });
  });

  beforeEach(async function() {
    let res = await lastBlockTimestamp();
    this.initialTimestamp = res + ONE_HOUR;
    res = await this.regularEthFeeFactory.build(
      this.fundStorageX.address,
      this.initialTimestamp.toString(10),
      ONE_MONTH,
      ether(4)
    );
    this.feeAddress = res.logs[0].args.addr;
    this.regularEthFee = await RegularEthFee.at(this.feeAddress);
  });

  it('should instantiate contract correctly', async function() {
    let res = await this.regularEthFee.initialTimestamp();
    assert.equal(res, this.initialTimestamp);
    res = await this.regularEthFee.periodLength();
    assert.equal(res, ONE_MONTH);
    res = await this.regularEthFee.rate();
    assert.equal(res, ether(4));
  });

  describe('period detection', () => {
    it('should detect period correctly', async function() {
      // >> - 0 month 0 day 1 hour
      await assertRevert(this.regularEthFee.getCurrentPeriod());
      let res = await this.regularEthFee.getNextPeriodTimestamp();
      assert.equal(res, this.initialTimestamp);

      // >> 0 month 0 day 0 hour
      await increaseTime(ONE_HOUR + ONE_MINUTE);

      res = await this.regularEthFee.getCurrentPeriod();
      assert.equal(res, 0);
      res = await this.regularEthFee.getNextPeriodTimestamp();
      assert.equal(res, this.initialTimestamp + ONE_MONTH);

      // >> 0 month 0 day 23 hour
      await increaseTime(23 * ONE_HOUR);

      res = await this.regularEthFee.getCurrentPeriod();
      assert.equal(res, 0);
      res = await this.regularEthFee.getNextPeriodTimestamp();
      assert.equal(res, this.initialTimestamp + ONE_MONTH);

      // >> 0 month 1 day 0 hour
      await increaseTime(ONE_HOUR);

      res = await this.regularEthFee.getCurrentPeriod();
      assert.equal(res, 0);
      res = await this.regularEthFee.getNextPeriodTimestamp();
      assert.equal(res, this.initialTimestamp + ONE_MONTH);

      // >> 1 month 0 day 0 hour
      await increaseTime(29 * ONE_DAY);

      res = await this.regularEthFee.getCurrentPeriod();
      assert.equal(res, 1);
      res = await this.regularEthFee.getNextPeriodTimestamp();
      assert.equal(res, this.initialTimestamp + 2 * ONE_MONTH);

      // >> 2 month 0 day 0 hour
      await increaseTime(30 * ONE_DAY);

      res = await this.regularEthFee.getCurrentPeriod();
      assert.equal(res, 2);
      res = await this.regularEthFee.getNextPeriodTimestamp();
      assert.equal(res, this.initialTimestamp + 3 * ONE_MONTH);
    });
  });

  describe('registered contract', () => {
    it('should od this', async function() {
      const calldata = this.fundStorageX.contract.methods.addFeeContract(this.feeAddress).encodeABI();
      let res = await this.modifyFeeProposalManager.propose(calldata, 'add it', { from: alice });
      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.modifyFeeProposalManager.aye(proposalId, { from: bob });
      await this.modifyFeeProposalManager.aye(proposalId, { from: charlie });
      await this.modifyFeeProposalManager.aye(proposalId, { from: alice });
      await this.modifyFeeProposalManager.triggerApprove(proposalId, { from: dan });

      res = await this.fundStorageX.getFeeContracts();
      assert.sameMembers(res, [this.feeAddress]);

      // - initially only Alice, Bob, Charlie are the fund participants

      await increaseTime(ONE_DAY + 2 * ONE_HOUR);

      // >> month 0 day 1 hour 1
      // - alice pays 3 ETH
      await this.regularEthFee.pay('1', { from: alice, value: ether(3) });

      await increaseTime(ONE_DAY);

      // >> month 0 day 2 hour 1
      // - bob pays 4 ETH
      await this.regularEthFee.pay('2', { from: bob, value: ether(4) });
      // - charlie pays 6 ETH
      // TODO: ensure payment not grater given than value
      await this.regularEthFee.pay('3', { from: bob, value: ether(6) });

      const multiSigBalance = await web3.eth.getBalance(this.fundMultiSigX.address);
      assert.equal(multiSigBalance, ether(13));

      res = await this.regularEthFee.paidUntil('1');
      assert.equal(res, this.initialTimestamp + (ONE_MONTH / 4) * 3);

      res = await this.regularEthFee.paidUntil('2');
      assert.equal(res, this.initialTimestamp + ONE_MONTH);

      res = await this.regularEthFee.paidUntil('3');
      assert.equal(res, this.initialTimestamp + (ONE_MONTH / 4) * 6);
    });
  });
});
