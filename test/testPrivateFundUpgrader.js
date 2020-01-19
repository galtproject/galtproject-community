const PPToken = artifacts.require('./PPToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
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
const { ether, initHelperWeb3, assertRevert, zeroAddress } = require('./helpers');

const { web3 } = PPToken;

initHelperWeb3(web3);

contract('PrivateFundUpgrader', accounts => {
  const [coreTeam, alice, bob, charlie, dan, eve, frank, fakeRegistry] = accounts;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });

    this.ppgr = await PPGlobalRegistry.new();
    this.acl = await PPACL.new();

    await this.ppgr.initialize();

    await this.ppgr.setContract(await this.ppgr.PPGR_GALT_TOKEN(), this.galtToken.address);
    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    // fund factory contracts
    this.fundFactory = await deployFundFactory(this.ppgr.address, alice, true, ether(10), ether(20));
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
    const res = await this.fundProposalManagerX.propose(
      this.fundUpgraderX.address,
      0,
      false,
      false,
      payload,
      'some data',
      {
        from: bob
      }
    );
    const proposalId = res.logs[0].args.proposalId.toString(10);

    await this.fundProposalManagerX.aye(proposalId, true, { from: bob });
    await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });
    await this.fundProposalManagerX.aye(proposalId, true, { from: dan });
    await this.fundProposalManagerX.aye(proposalId, true, { from: eve });

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
    let res = await this.fundProposalManagerX.propose(
      this.fundUpgraderX.address,
      0,
      false,
      false,
      payload,
      'some data',
      {
        from: bob
      }
    );
    const proposalId = res.logs[0].args.proposalId.toString(10);

    await this.fundProposalManagerX.aye(proposalId, true, { from: bob });
    await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });
    await this.fundProposalManagerX.aye(proposalId, true, { from: dan });
    await this.fundProposalManagerX.aye(proposalId, true, { from: eve });

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
