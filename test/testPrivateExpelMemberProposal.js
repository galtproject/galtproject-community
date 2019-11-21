const PPToken = artifacts.require('./PPToken.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const PPLockerRegistry = artifacts.require('./PPLockerRegistry.sol');
const PPTokenRegistry = artifacts.require('./PPTokenRegistry.sol');
const PPLockerFactory = artifacts.require('./PPLockerFactory.sol');
const PPTokenFactory = artifacts.require('./PPTokenFactory.sol');
const PPLocker = artifacts.require('./PPLocker.sol');
const PPGlobalRegistry = artifacts.require('./PPGlobalRegistry.sol');
const PPACL = artifacts.require('./PPACL.sol');

PPToken.numberFormat = 'String';
PPLocker.numberFormat = 'String';
PPTokenRegistry.numberFormat = 'String';

const { deployFundFactory, buildPrivateFund, VotingConfig } = require('./deploymentHelpers');
const { ether, assertRevert, initHelperWeb3, evmIncreaseTime } = require('./helpers');

const { web3 } = PPACL;
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

contract('ExpelFundMemberProposal', accounts => {
  const [
    coreTeam,
    alice,
    bob,
    charlie,
    dan,
    eve,
    frank,
    minter,
    fakeRegistry,
    unauthorized,
    lockerFeeManager
  ] = accounts;

  const ethFee = ether(10);
  const galtFee = ether(20);

  const registryDataLink = 'bafyreihtjrn4lggo3qjvaamqihvgas57iwsozhpdr2al2uucrt3qoed3j1';

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
      new VotingConfig(ether(60), ether(50), VotingConfig.ONE_WEEK),
      {},
      [bob, charlie, dan],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundControllerX = fund.fundController;
    this.fundRAX = fund.fundRA;
    this.fundProposalManagerX = fund.fundProposalManager;

    this.registries = [fakeRegistry, fakeRegistry, fakeRegistry, fakeRegistry, fakeRegistry];
    this.beneficiaries = [bob, charlie, dan, eve, frank];
    this.benefeciarSpaceTokens = ['1', '2', '3', '4', '5'];
    await this.fundRAX.mintAll(this.beneficiaries, this.registries, this.benefeciarSpaceTokens, 300, { from: alice });
  });

  describe('proposal pipeline', () => {
    it('should allow user who has reputation creating a new proposal', async function() {
      let res = await this.ppTokenFactory.build('Buildings', 'BDL', registryDataLink, {
        from: coreTeam,
        value: ether(10)
      });
      this.registry1 = await PPToken.at(res.logs[4].args.token);
      await this.registry1.setMinter(minter);

      res = await this.registry1.mint(alice, { from: minter });
      const token1 = res.logs[0].args.privatePropertyId;

      res = await this.registry1.ownerOf(token1);
      assert.equal(res, alice);

      // HACK
      await this.registry1.setDetails(token1, 2, 1, 800, utf8ToHex('foo'), 'bar', 'buzz', { from: minter });

      await this.galtToken.approve(this.ppLockerFactory.address, ether(20), { from: alice });
      res = await this.ppLockerFactory.build({ from: alice });
      const lockerAddress = res.logs[0].args.locker;

      const locker = await PPLocker.at(lockerAddress);

      // DEPOSIT SPACE TOKEN
      await this.registry1.approve(lockerAddress, token1, { from: alice });
      await locker.deposit(this.registry1.address, token1, { from: alice });

      res = await locker.reputation();
      assert.equal(res, 800);

      res = await locker.owner();
      assert.equal(res, alice);

      res = await locker.tokenId();
      assert.equal(res, 1);

      res = await locker.tokenContract();
      assert.equal(res, this.registry1.address);

      res = await locker.tokenDeposited();
      assert.equal(res, true);

      res = await this.ppLockerRegistry.isValid(lockerAddress);
      assert.equal(res, true);

      // MINT REPUTATION
      await locker.approveMint(this.fundRAX.address, { from: alice });
      await assertRevert(this.fundRAX.mint(lockerAddress, { from: minter }));
      await this.fundRAX.mint(lockerAddress, { from: alice });

      // res = await this.fundRAX.registry1Owners();
      // assert.sameMembers(res, [alice, bob, charlie, dan, eve, frank]);

      // DISTRIBUTE REPUTATION
      await this.fundRAX.delegate(bob, alice, 300, { from: alice });
      await this.fundRAX.delegate(charlie, alice, 100, { from: bob });
      const block0 = (await web3.eth.getBlock('latest')).number;

      await assertRevert(
        this.fundRAX.burnExpelled(this.registry1.address, token1, bob, alice, 200, { from: unauthorized })
      );

      // EXPEL
      const proposalData = this.fundStorageX.contract.methods.expel(this.registry1.address, token1).encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, proposalData, 'blah', {
        from: charlie
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);
      res = await this.fundRAX.totalSupplyAt(block0);
      assert.equal(res, 2300); // 300 * 5 + 800

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.description, 'blah');

      await this.fundProposalManagerX.aye(proposalId, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, { from: charlie });
      await this.fundProposalManagerX.aye(proposalId, { from: dan });
      await this.fundProposalManagerX.aye(proposalId, { from: eve });

      res = await this.fundRAX.totalSupply();
      assert.equal(res, 2300); // 300 * 5 + 800
      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res, 500);
      res = await this.fundRAX.balanceOfAt(bob, block0);
      assert.equal(res, 500);

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.equal(res.totalAyes, 1500); // 500 + 400 + 300 + 300
      assert.equal(res.totalNays, 0);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.totalAyes, 1500); // 500 + 400 + 300 + 300
      assert.equal(res.totalNays, 0);
      assert.equal(res.ayesShare, '65217391304347826086');
      assert.equal(res.currentSupport, ether(100));
      assert.equal(res.requiredSupport, ether(60));
      assert.equal(res.minAcceptQuorum, ether(50));

      res = await this.fundStorageX.getExpelledToken(this.registry1.address, token1);
      assert.equal(res.isExpelled, false);
      assert.equal(res.amount, 0);

      await evmIncreaseTime(VotingConfig.ONE_WEEK + 1);

      // ACCEPT PROPOSAL
      await this.fundProposalManagerX.triggerApprove(proposalId);

      res = await this.fundStorageX.getExpelledToken(this.registry1.address, token1);
      assert.equal(res.isExpelled, true);
      assert.equal(res.amount, 800);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // BURNING LOCKED REPUTATION FOR EXPELLED TOKEN
      await assertRevert(
        this.fundRAX.burnExpelled(this.registry1.address, token1, charlie, alice, 101, { from: unauthorized })
      );
      await this.fundRAX.burnExpelled(this.registry1.address, token1, charlie, alice, 100, { from: unauthorized });
      await assertRevert(
        this.fundRAX.burnExpelled(this.registry1.address, token1, bob, alice, 201, { from: unauthorized })
      );
      await this.fundRAX.burnExpelled(this.registry1.address, token1, bob, alice, 200, { from: unauthorized });
      await assertRevert(
        this.fundRAX.burnExpelled(this.registry1.address, token1, alice, alice, 501, { from: unauthorized })
      );
      await this.fundRAX.burnExpelled(this.registry1.address, token1, alice, alice, 500, { from: unauthorized });

      res = await this.fundStorageX.getExpelledToken(this.registry1.address, token1);
      assert.equal(res.isExpelled, true);
      assert.equal(res.amount, 0);

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 0);
      res = await this.fundRAX.delegatedBalanceOf(alice, alice);
      assert.equal(res, 0);

      // MINT REPUTATION REJECTED
      await assertRevert(this.fundRAX.mint(lockerAddress, { from: alice }));

      // BURN
      await locker.burn(this.fundRAX.address, { from: alice });

      // MINT REPUTATION REJECTED AFTER BURN
      await locker.approveMint(this.fundRAX.address, { from: alice });
      await assertRevert(this.fundRAX.mint(lockerAddress, { from: alice }));
    });
  });
});
