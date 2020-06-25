const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const GaltToken = contract.fromArtifact('GaltToken');
const GaltGlobalRegistry = contract.fromArtifact('GaltGlobalRegistry');
const FundFactory = contract.fromArtifact('FundFactory');

const { deployFundFactory, buildFund, VotingConfig } = require('./deploymentHelpers');
const { ether, assertRevert, initHelperWeb3, increaseTime } = require('./helpers');

initHelperWeb3(web3);

// 60
// const ONE_MINUTE = 60;
// 60 * 60
// const ONE_HOUR = 3600;
// 60 * 60 * 24
// const ONE_DAY = 86400;
// 60 * 60 * 24 * 30
const ONE_MONTH = 2592000;

const ETH_CONTRACT = '0x0000000000000000000000000000000000000001';

describe('MultiSig Withdrawal Limits', () => {
  const [alice, bob, charlie, dan, eve, frank, george] = accounts;
  const coreTeam = defaultSender;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.daiToken = await GaltToken.new({ from: coreTeam });
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });

    await this.ggr.setContract(await this.ggr.GALT_TOKEN(), this.galtToken.address, { from: coreTeam });
    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    await this.daiToken.mint(alice, ether(10000000), { from: coreTeam });

    // fund factory contracts
    this.fundFactory = await deployFundFactory(FundFactory, this.ggr.address, alice);
  });

  before(async function() {
    // build fund
    await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
    const fund = await buildFund(
      this.fundFactory,
      alice,
      false,
      new VotingConfig(ether(60), ether(60), VotingConfig.ONE_WEEK, 0),
      {},
      [bob, charlie, dan],
      2,
      ONE_MONTH
    );

    this.fundStorageX = fund.fundStorage;
    this.fundControllerX = fund.fundController;
    this.fundMultiSigX = fund.fundMultiSig;
    this.fundRegistryX = fund.fundRegistry;
    this.fundACLX = fund.fundACL;
    this.fundRAX = fund.fundRA;
    this.fundProposalManagerX = fund.fundProposalManager;

    this.beneficiaries = [alice, bob, charlie];
    this.benefeciarSpaceTokens = ['1', '2', '3'];

    await this.fundRAX.mintAllHack(this.beneficiaries, this.benefeciarSpaceTokens, 300, { from: alice });
  });

  it('should limit sending ERC20 tokens', async function() {
    // Initially all payments are allowed
    await this.galtToken.mint(this.fundMultiSigX.address, ether(10000000), { from: coreTeam });
    await this.daiToken.mint(this.fundMultiSigX.address, ether(10000000), { from: coreTeam });

    let txData = this.galtToken.contract.methods.transfer(dan, ether(1000)).encodeABI();
    let res = await this.fundMultiSigX.submitTransaction(this.galtToken.address, '0', txData, { from: bob });
    let txId = res.logs[0].args.transactionId.toString(10);
    await this.fundMultiSigX.confirmTransaction(txId, { from: charlie });
    res = await this.fundMultiSigX.transactions(txId);
    assert.equal(res.executed, true);

    // Limit GaltToken payments
    const calldata = this.fundStorageX.contract.methods
      .setPeriodLimit(true, this.galtToken.address, ether(4000))
      .encodeABI();
    res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, false, calldata, 'blah', {
      from: bob
    });
    const pId = res.logs[0].args.proposalId.toString(10);
    await this.fundProposalManagerX.aye(pId, true, { from: bob });
    await this.fundProposalManagerX.aye(pId, true, { from: charlie });

    const limit = await this.fundStorageX.periodLimits(this.galtToken.address);
    assert.equal(limit.active, true);
    assert.equal(limit.amount, ether(4000));

    // Now spendings limited to 4K GALT
    // 5K GALT spending should fail
    txData = this.galtToken.contract.methods.transfer(dan, ether(5000)).encodeABI();
    res = await this.fundMultiSigX.submitTransaction(this.galtToken.address, '0', txData, { from: bob });
    txId = res.logs[0].args.transactionId.toString(10);
    const txId2nd = txId;
    await assertRevert(this.fundMultiSigX.confirmTransaction(txId, { from: charlie }));
    res = await this.fundMultiSigX.transactions(txId);
    assert.equal(res.executed, false);

    // 5K DAI spending should succeed
    txData = this.daiToken.contract.methods.transfer(dan, ether(5000)).encodeABI();
    res = await this.fundMultiSigX.submitTransaction(this.daiToken.address, '0', txData, { from: bob });
    txId = res.logs[0].args.transactionId.toString(10);
    await this.fundMultiSigX.confirmTransaction(txId, { from: charlie });
    res = await this.fundMultiSigX.transactions(txId);
    assert.equal(res.executed, true);

    // on period #2
    await increaseTime(ONE_MONTH);
    // 2-nd proposal could be executed
    await assertRevert(this.fundMultiSigX.confirmTransaction(txId2nd, { from: charlie }));
    res = await this.fundMultiSigX.transactions(txId2nd);
    assert.equal(res.executed, false);
  });

  it('should limit sending ETH tokens', async function() {
    // Initially all payments are allowed
    await web3.eth.sendTransaction({
      from: alice,
      to: this.fundMultiSigX.address,
      value: ether(10000)
    });

    let res = await this.fundMultiSigX.submitTransaction(alice, ether(1000), '0x0', { from: bob });
    let txId = res.logs[0].args.transactionId.toString(10);
    await this.fundMultiSigX.confirmTransaction(txId, { from: charlie });
    res = await this.fundMultiSigX.transactions(txId);
    assert.equal(res.executed, true);

    // Limit ETH payments
    const calldata = this.fundStorageX.contract.methods.setPeriodLimit(true, ETH_CONTRACT, ether(4000)).encodeABI();
    res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, false, calldata, 'blah', {
      from: bob
    });
    const pId = res.logs[0].args.proposalId.toString(10);

    assert.equal(await this.fundRAX.balanceOf(bob), 300);
    assert.equal(await this.fundRAX.balanceOf(charlie), 300);
    assert.equal(await this.fundRAX.balanceOf(alice), 300);

    await this.fundProposalManagerX.aye(pId, true, { from: bob });
    await this.fundProposalManagerX.nay(pId, { from: charlie });
    await this.fundProposalManagerX.aye(pId, true, { from: alice });

    res = await this.fundProposalManagerX.getProposalVotingProgress(pId);
    assert.equal(res.currentSupport, '66666666666666666666');
    assert.equal(res.ayesShare, '66666666666666666666');
    assert.equal(res.requiredSupport, ether(60));
    assert.equal(res.minAcceptQuorum, ether(60));

    const limit = await this.fundStorageX.periodLimits(ETH_CONTRACT);
    assert.equal(limit.active, true);
    assert.equal(limit.amount, ether(4000));

    // Now spendings limited to 4K ETH
    // 5K ETH spending should fail
    res = await this.fundMultiSigX.submitTransaction(dan, ether(5000), '0x0', { from: bob });
    txId = res.logs[0].args.transactionId.toString(10);
    const txId2nd = txId;
    await assertRevert(this.fundMultiSigX.confirmTransaction(txId, { from: charlie }));
    res = await this.fundMultiSigX.transactions(txId);
    assert.equal(res.executed, false);

    // on period #2
    await increaseTime(ONE_MONTH);

    // 2-nd proposal could be executed
    await assertRevert(this.fundMultiSigX.confirmTransaction(txId2nd, { from: charlie }));
    res = await this.fundMultiSigX.transactions(txId2nd);
    assert.equal(res.executed, false);
  });

  describe('not limits tests, but multisig', async function() {
    it.skip("should revert if required doesn't match requirements", async function() {
      await this.fundACLX.setRole(await this.fundStorageX.ROLE_MEMBER_DETAILS_MANAGER(), eve, true, {
        from: alice
      });

      await this.fundACLX.setRole(await this.fundMultiSigX.ROLE_OWNER_MANAGER(), eve, true, {
        from: alice
      });

      await this.fundStorageX.setMultiSigManager(true, alice, 'Alice', 'asdf', { from: eve });
      await this.fundStorageX.setMultiSigManager(true, frank, 'Frank', 'asdf', { from: eve });
      await this.fundStorageX.setMultiSigManager(true, george, 'George', 'asdf', { from: eve });

      await assertRevert(this.fundMultiSigX.setOwners([alice, frank, george], 4), { from: eve });
      await assertRevert(this.fundMultiSigX.setOwners([alice, frank, george], 0), { from: eve });
      await this.fundMultiSigX.setOwners([alice, frank, george], 2, { from: eve });
    });
  });
});
