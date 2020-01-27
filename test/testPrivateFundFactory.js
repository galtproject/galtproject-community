const GaltToken = artifacts.require('./GaltToken.sol');
const MockBar = artifacts.require('./MockBar.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');
const PrivateFundFactory = artifacts.require('./PrivateFundFactory.sol');

const { ether, initHelperWeb3 } = require('./helpers');

const { web3 } = MockBar;

initHelperWeb3(web3);

MockBar.numberFormat = 'String';

contract('Private Fund Factory', accounts => {
  const [
    coreTeam,
    alice,
    raFactory,
    multiSigFactory,
    storageFactory,
    controllerFactory,
    proposalManagerFactory,
    registryFactory,
    aclFactory,
    upgraderFactory,

    raFactory2,
    multiSigFactory2,
    storageFactory2,
    controllerFactory2,
    proposalManagerFactory2,
    registryFactory2,
    aclFactory2,
    upgraderFactory2
  ] = accounts;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.bar = await MockBar.new();

    await this.ggr.setContract(await this.ggr.GALT_TOKEN(), this.galtToken.address, { from: coreTeam });

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });
  });

  it.only('should create a new proposal by default', async function() {
    const fundFactory = await PrivateFundFactory.new(
      alice,
      raFactory,
      multiSigFactory,
      storageFactory,
      controllerFactory,
      proposalManagerFactory,
      registryFactory,
      aclFactory,
      upgraderFactory,
      1,
      2
    );

    assert.equal(await fundFactory.fundRAFactory(), raFactory);
    assert.equal(await fundFactory.fundStorageFactory(), storageFactory);
    assert.equal(await fundFactory.fundMultiSigFactory(), multiSigFactory);
    assert.equal(await fundFactory.fundControllerFactory(), controllerFactory);
    assert.equal(await fundFactory.fundProposalManagerFactory(), proposalManagerFactory);
    assert.equal(await fundFactory.fundACLFactory(), aclFactory);
    assert.equal(await fundFactory.fundRegistryFactory(), registryFactory);
    assert.equal(await fundFactory.fundUpgraderFactory(), upgraderFactory);

    await fundFactory.setSubFactoryAddresses(
      raFactory2,
      multiSigFactory2,
      storageFactory2,
      controllerFactory2,
      proposalManagerFactory2,
      registryFactory2,
      aclFactory2,
      upgraderFactory2
    );

    assert.equal(await fundFactory.fundRAFactory(), raFactory2);
    assert.equal(await fundFactory.fundStorageFactory(), storageFactory2);
    assert.equal(await fundFactory.fundMultiSigFactory(), multiSigFactory2);
    assert.equal(await fundFactory.fundControllerFactory(), controllerFactory2);
    assert.equal(await fundFactory.fundProposalManagerFactory(), proposalManagerFactory2);
    assert.equal(await fundFactory.fundACLFactory(), aclFactory2);
    assert.equal(await fundFactory.fundRegistryFactory(), registryFactory2);
    assert.equal(await fundFactory.fundUpgraderFactory(), upgraderFactory2);
  });
});
