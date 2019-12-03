const PPToken = artifacts.require('./PPToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const PPLockerRegistry = artifacts.require('./PPLockerRegistry.sol');
const PPTokenRegistry = artifacts.require('./PPTokenRegistry.sol');
const PPLockerFactory = artifacts.require('./PPLockerFactory.sol');
const PPTokenFactory = artifacts.require('./PPTokenFactory.sol');
const PPLocker = artifacts.require('./PPLocker.sol');
const PPGlobalRegistry = artifacts.require('./PPGlobalRegistry.sol');
const PPACL = artifacts.require('./PPACL.sol');
const MockUpgradeScript1 = artifacts.require('./MockUpgradeScript1.sol');
const MockUpgradeScript2 = artifacts.require('./MockUpgradeScript2.sol');
const MockFundProposalManagerV2 = artifacts.require('./MockFundProposalManagerV2.sol');
const IOwnedUpgradeabilityProxy = artifacts.require('./IOwnedUpgradeabilityProxy.sol');

PPToken.numberFormat = 'String';
PPLocker.numberFormat = 'String';
MockUpgradeScript1.numberFormat = 'String';

const { deployFundFactory, buildPrivateFund, VotingConfig } = require('./deploymentHelpers');
const { ether, initHelperWeb3, evmIncreaseTime, assertRevert, zeroAddress } = require('./helpers');

const { web3 } = PPToken;
const { utf8ToHex } = web3.utils;
const bytes32 = utf8ToHex;

initHelperWeb3(web3);

contract('PrivateFundUpgrader', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank, fakeRegistry, lockerFeeManager] = accounts;

  const ethFee = ether(10);
  const galtFee = ether(20);

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });

    this.ppgr = await PPGlobalRegistry.new();
    this.acl = await PPACL.new();
    this.ppTokenRegistry = await PPTokenRegistry.new();
    this.ppLockerRegistry = await PPLockerRegistry.new();

    await this.ppgr.initialize();
    await this.ppTokenRegistry.initialize(this.ppgr.address);
    await this.ppLockerRegistry.initialize(this.ppgr.address);

    this.ppTokenFactory = await PPTokenFactory.new(this.ppgr.address, this.galtToken.address, 0, 0);
    this.ppLockerFactory = await PPLockerFactory.new(this.ppgr.address, this.galtToken.address, 0, 0);

    // PPGR setup
    await this.ppgr.setContract(await this.ppgr.PPGR_ACL(), this.acl.address);
    await this.ppgr.setContract(await this.ppgr.PPGR_TOKEN_REGISTRY(), this.ppTokenRegistry.address);
    await this.ppgr.setContract(await this.ppgr.PPGR_LOCKER_REGISTRY(), this.ppLockerRegistry.address);

    // ACL setup
    await this.acl.setRole(bytes32('TOKEN_REGISTRAR'), this.ppTokenFactory.address, true);
    await this.acl.setRole(bytes32('LOCKER_REGISTRAR'), this.ppLockerFactory.address, true);

    // Fees setup
    await this.ppTokenFactory.setFeeManager(lockerFeeManager);
    await this.ppTokenFactory.setEthFee(ethFee, { from: lockerFeeManager });
    await this.ppTokenFactory.setGaltFee(galtFee, { from: lockerFeeManager });

    await this.ppLockerFactory.setFeeManager(lockerFeeManager);
    await this.ppLockerFactory.setEthFee(ethFee, { from: lockerFeeManager });
    await this.ppLockerFactory.setGaltFee(galtFee, { from: lockerFeeManager });

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });
    await this.galtToken.mint(bob, ether(10000000), { from: coreTeam });
    await this.galtToken.mint(charlie, ether(10000000), { from: coreTeam });

    // fund factory contracts
    this.fundFactory = await deployFundFactory(
      this.ppgr.address,
      alice,
      true,
      this.galtToken.address,
      ether(10),
      ether(20)
    );
  });

  beforeEach(async function() {
    // build fund
    await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
    const fund = await buildPrivateFund(
      this.fundFactory,
      alice,
      false,
      new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK),
      {},
      [bob, charlie],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundRegistryX = fund.fundRegistry;
    this.fundControllerX = fund.fundController;
    this.fundRAX = fund.fundRA;
    this.fundUpgraderX = fund.fundUpgrader;
    this.fundProposalManagerX = fund.fundProposalManager;
    this.fundACLX = fund.fundACL;

    this.registries = [fakeRegistry, fakeRegistry, fakeRegistry, fakeRegistry, fakeRegistry];
    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['1', '2', '3', '4', '5'];

    await this.fundRAX.mintAllHack(this.beneficiaries, this.registries, this.benefeciarSpaceTokens, 300, {
      from: alice
    });
  });

  it('should allow updating FundRegistry and FundACL records', async function() {
    const u1 = await MockUpgradeScript1.new(eve, dan);

    assert.equal(await this.fundUpgraderX.fundRegistry(), this.fundRegistryX.address);
    assert.equal(await this.fundUpgraderX.nextUpgradeScript(), zeroAddress);

    const payload = this.fundUpgraderX.contract.methods.setNextUpgradeScript(u1.address).encodeABI();
    const res = await this.fundProposalManagerX.propose(this.fundUpgraderX.address, 0, payload, 'some data', {
      from: bob
    });
    const proposalId = res.logs[0].args.proposalId.toString(10);

    await this.fundProposalManagerX.aye(proposalId, { from: bob });
    await this.fundProposalManagerX.aye(proposalId, { from: charlie });
    await this.fundProposalManagerX.aye(proposalId, { from: dan });
    await this.fundProposalManagerX.aye(proposalId, { from: eve });

    await evmIncreaseTime(VotingConfig.ONE_WEEK + 1);

    await this.fundProposalManagerX.triggerApprove(proposalId);

    assert.equal(await this.fundUpgraderX.nextUpgradeScript(), u1.address);

    // before
    assert.equal(await this.fundACLX.hasRole(eve, await this.fundStorageX.ROLE_CONFIG_MANAGER()), false);
    assert.equal(await this.fundRegistryX.getControllerAddress(), this.fundControllerX.address);

    await this.fundUpgraderX.upgrade();

    // check executed
    assert.equal(await this.fundUpgraderX.nextUpgradeScript(), zeroAddress);

    // after
    assert.equal(await this.fundACLX.hasRole(eve, await this.fundStorageX.ROLE_CONFIG_MANAGER()), true);
    assert.equal(await this.fundRegistryX.getControllerAddress(), dan);
  });

  it('should allow updating proposalManager contract by updating proxy implementation', async function() {
    const proposalManagerImplementationV2 = await MockFundProposalManagerV2.new();
    const proposalManagerV2 = await MockFundProposalManagerV2.at(this.fundProposalManagerX.address);
    const u2 = await MockUpgradeScript2.new(proposalManagerImplementationV2.address, 'fooV2');
    const proxy = await IOwnedUpgradeabilityProxy.at(this.fundProposalManagerX.address);

    assert.equal(await this.fundUpgraderX.nextUpgradeScript(), zeroAddress);

    const payload = this.fundUpgraderX.contract.methods.setNextUpgradeScript(u2.address).encodeABI();
    let res = await this.fundProposalManagerX.propose(this.fundUpgraderX.address, 0, payload, 'some data', {
      from: bob
    });
    const proposalId = res.logs[0].args.proposalId.toString(10);

    await this.fundProposalManagerX.aye(proposalId, { from: bob });
    await this.fundProposalManagerX.aye(proposalId, { from: charlie });
    await this.fundProposalManagerX.aye(proposalId, { from: dan });
    await this.fundProposalManagerX.aye(proposalId, { from: eve });

    await evmIncreaseTime(VotingConfig.ONE_WEEK + 1);

    await this.fundProposalManagerX.triggerApprove(proposalId);

    assert.equal(await this.fundUpgraderX.nextUpgradeScript(), u2.address);

    // before
    await assertRevert(proposalManagerV2.foo(), 'blah');

    await this.fundUpgraderX.upgrade();

    // check executed
    assert.equal(await this.fundUpgraderX.nextUpgradeScript(), zeroAddress);

    // after
    assert.equal(await proxy.implementation(), proposalManagerImplementationV2.address);
    res = await proposalManagerV2.foo();
    assert.equal(res.oldValue, this.fundRegistryX.address);
    assert.equal(res.newValue, 'fooV2');
  });
});
