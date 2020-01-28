const FundImplementationRegistry = artifacts.require('./FundImplementationRegistry.sol');

const { initHelperWeb3, zeroAddress } = require('./helpers');

const { web3 } = FundImplementationRegistry;

initHelperWeb3(web3);

FundImplementationRegistry.numberFormat = 'String';

const { utf8ToHex } = web3.utils;
const bytes32 = utf8ToHex;

contract('Fund Implementation Registry', accounts => {
  const [alice, bob, charlie, dan] = accounts;

  const code1 = bytes32('code1');
  const code2 = bytes32('code2');
  const code3 = bytes32('code3');
  let registry;

  before(async function() {
    registry = await FundImplementationRegistry.new();
    await registry.addVersion(code2, alice);
    await registry.addVersion(code3, bob);
    await registry.addVersion(code3, charlie);
    await registry.addVersion(code3, dan);
  });

  it('should respond with 0s with no implementation', async function() {
    assert.equal(await registry.getLatestVersionNumber(code1), 0);
    assert.equal(await registry.getLatestVersionAddress(code1), zeroAddress);
    assert.sameMembers(await registry.getVersions(code1), []);

    assert.equal(await registry.getLatestVersionNumber(code2), 1);
    assert.equal(await registry.getLatestVersionAddress(code2), alice);
    assert.sameMembers(await registry.getVersions(code2), [zeroAddress, alice]);

    assert.equal(await registry.getLatestVersionNumber(code3), 3);
    assert.equal(await registry.getLatestVersionAddress(code3), dan);
    assert.sameMembers(await registry.getVersions(code3), [zeroAddress, bob, charlie, dan]);
  });
});
