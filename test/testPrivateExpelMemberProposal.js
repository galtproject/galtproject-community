const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const PPToken = contract.fromArtifact('PPToken');
const GaltToken = contract.fromArtifact('GaltToken');
const PPLockerRegistry = contract.fromArtifact('PPLockerRegistry');
const PPTokenRegistry = contract.fromArtifact('PPTokenRegistry');
const PPLockerFactory = contract.fromArtifact('PPLockerFactory');
const PPTokenFactory = contract.fromArtifact('PPTokenFactory');
const PPLocker = contract.fromArtifact('PPLocker');
const PPTokenControllerFactory = contract.fromArtifact('PPTokenControllerFactory');
const PPTokenController = contract.fromArtifact('PPTokenController');
const PPGlobalRegistry = contract.fromArtifact('PPGlobalRegistry');
const PPACL = contract.fromArtifact('PPACL');
const PrivateFundFactory = contract.fromArtifact('PrivateFundFactory');

PPToken.numberFormat = 'String';
PPLocker.numberFormat = 'String';
PPTokenRegistry.numberFormat = 'String';

const { deployFundFactory, buildPrivateFund, VotingConfig } = require('./deploymentHelpers');
const { ether, assertRevert, initHelperWeb3, getEventArg, evmIncreaseTime } = require('./helpers');

const { utf8ToHex } = web3.utils;
const bytes32 = utf8ToHex;

initHelperWeb3(web3);

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  EXECUTED: 2
};

// 60 * 60
const ONE_HOUR = 3600;

describe('PrivateExpelFundMemberProposal', () => {
  const [alice, bob, charlie, dan, eve, frank, minter, fakeRegistry, unauthorized, lockerFeeManager] = accounts;

  const coreTeam = defaultSender;

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

    this.ppTokenControllerFactory = await PPTokenControllerFactory.new();
    this.ppTokenFactory = await PPTokenFactory.new(this.ppTokenControllerFactory.address, this.ppgr.address, 0, 0);
    this.ppLockerFactory = await PPLockerFactory.new(this.ppgr.address, 0, 0);

    // PPGR setup
    await this.ppgr.setContract(await this.ppgr.PPGR_ACL(), this.acl.address);
    await this.ppgr.setContract(await this.ppgr.PPGR_GALT_TOKEN(), this.galtToken.address);
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
    this.fundFactory = await deployFundFactory(PrivateFundFactory, this.ppgr.address, alice, true, ether(10), ether(20));
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
    this.benefeciarSpaceTokens = ['4', '5', '6', '7', '8'];
    await this.fundRAX.mintAllHack(this.beneficiaries, this.registries, this.benefeciarSpaceTokens, 300, {
      from: alice
    });
  });

  describe('proposal pipeline', () => {
    it('should allow user who has reputation creating a new proposal', async function() {
      let res = await this.ppTokenFactory.build('Buildings', 'BDL', registryDataLink, ONE_HOUR, [], [], utf8ToHex(''), {
        from: coreTeam,
        value: ether(10)
      });
      this.registry1 = await PPToken.at(getEventArg(res, 'Build', 'token'));
      this.controller1 = await PPTokenController.at(getEventArg(res, 'Build', 'controller'));

      await this.controller1.setMinter(minter);
      await this.controller1.setFee(bytes32('LOCKER_ETH'), ether(0.1));

      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res.toString(10), '300');
      res = await this.fundRAX.balanceOf(charlie);
      assert.equal(res.toString(10), '300');
      res = await this.fundRAX.balanceOf(dan);
      assert.equal(res.toString(10), '300');
      res = await this.fundRAX.balanceOf(eve);
      assert.equal(res.toString(10), '300');
      res = await this.fundRAX.balanceOf(frank);
      assert.equal(res.toString(10), '300');

      res = await this.controller1.mint(alice, { from: minter });
      const token1 = getEventArg(res, 'Mint', 'tokenId');

      res = await this.registry1.ownerOf(token1);
      assert.equal(res, alice);

      // HACK
      await this.controller1.setInitialDetails(token1, 2, 1, 800, utf8ToHex('foo'), 'bar', 'buzz', true, {
        from: minter
      });

      await this.galtToken.approve(this.ppLockerFactory.address, ether(20), { from: alice });
      res = await this.ppLockerFactory.build({ from: alice });
      const lockerAddress = res.logs[0].args.locker;

      const locker = await PPLocker.at(lockerAddress);

      // DEPOSIT SPACE TOKEN
      await this.registry1.approve(lockerAddress, token1, { from: alice });
      await locker.deposit(this.registry1.address, token1, { from: alice, value: ether(0.1) });

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
      const proposalData = this.fundStorageX.contract.methods
        .expel(this.registry1.address, parseInt(token1, 10))
        .encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, proposalData, 'blah', {
        from: charlie
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);
      res = await this.fundRAX.totalSupplyAt(block0);
      assert.equal(res, 2300); // 300 * 5 + 800

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.dataLink, 'blah');
      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.fundRAX.totalSupply();
      assert.equal(res, 2300); // 300 * 5 + 800
      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res, 500);
      res = await this.fundRAX.balanceOfAt(bob, block0);
      assert.equal(res, 500);
      res = await this.fundRAX.tokenOwnersCount();
      assert.equal(res, 6);
      res = await this.fundRAX.isMember(alice);
      assert.equal(res, true);

      await this.fundProposalManagerX.aye(proposalId, true, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });
      await this.fundProposalManagerX.aye(proposalId, true, { from: dan });
      await this.fundProposalManagerX.aye(proposalId, true, { from: eve });

      res = await this.fundProposalManagerX.getCurrentSupport(proposalId);
      assert.equal(res, ether(100));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

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
      res = await this.fundRAX.ownedBalanceOf(alice);
      assert.equal(res, 0);
      res = await this.fundRAX.totalSupply();
      assert.equal(res, 1500); // 300 * 5
      res = await this.fundRAX.tokenOwnersCount();
      assert.equal(res, 5);
      res = await this.fundRAX.isMember(alice);
      assert.equal(res, false);

      // MINT REPUTATION REJECTED
      await assertRevert(this.fundRAX.mint(lockerAddress, { from: alice }));

      // BURN
      await locker.burn(this.fundRAX.address, { from: alice });

      // MINT REPUTATION REJECTED AFTER BURN
      await locker.approveMint(this.fundRAX.address, { from: alice });
      await assertRevert(this.fundRAX.mint(lockerAddress, { from: alice }));

      const proposalData2 = this.fundStorageX.contract.methods
        .approveMintAll([this.registry1.address], [parseInt(token1, 10)])
        .encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, proposalData2, 'blah', {
        from: charlie
      });

      const proposalId2 = res.logs[0].args.proposalId.toString(10);
      await this.fundProposalManagerX.aye(proposalId2, true, { from: bob });
      await this.fundProposalManagerX.aye(proposalId2, true, { from: charlie });
      await this.fundProposalManagerX.aye(proposalId2, true, { from: dan });
      await this.fundProposalManagerX.aye(proposalId2, true, { from: eve });

      await evmIncreaseTime(VotingConfig.ONE_WEEK + 1);

      res = await this.fundProposalManagerX.proposals(proposalId2);
      if (res !== ProposalStatus.EXECUTED) {
        await this.fundProposalManagerX.executeProposal(proposalId2, 0, { from: dan });
      }

      res = await this.fundProposalManagerX.getCurrentSupport(proposalId);
      assert.equal(res, ether(100));
      res = await this.fundProposalManagerX.proposals(proposalId2);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // MINT REPUTATION AGAIN
      assert.equal(await this.fundRAX.balanceOf(alice), 0);
      await this.fundRAX.mint(lockerAddress, { from: alice });
      assert.equal(await this.fundRAX.balanceOf(alice), 800);

      res = await this.fundRAX.totalSupply();
      assert.equal(res, 2300); // 300 * 5 + 800
      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res.toString(10), '300');
      res = await this.fundRAX.balanceOf(charlie);
      assert.equal(res.toString(10), '300');
      res = await this.fundRAX.balanceOf(dan);
      assert.equal(res.toString(10), '300');
      res = await this.fundRAX.balanceOf(eve);
      assert.equal(res.toString(10), '300');
      res = await this.fundRAX.balanceOf(frank);
      assert.equal(res.toString(10), '300');
      res = await this.fundRAX.tokenOwnersCount();
      assert.equal(res, 6);
      res = await this.fundRAX.isMember(alice);
      assert.equal(res, true);
    });
  });
});
