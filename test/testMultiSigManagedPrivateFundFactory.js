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
const MultiSigManagedPrivateFundFactory = contract.fromArtifact('MultiSigManagedPrivateFundFactory');
const MockBar = contract.fromArtifact('MockBar');

const { deployFundFactory, buildPrivateFund, VotingConfig, CustomVotingConfig } = require('./deploymentHelpers');
const { ether, initHelperWeb3, getEventArg, int, assertRevert } = require('./helpers');

const galt = require('@galtproject/utils');

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  EXECUTED: 2
};

const { utf8ToHex } = web3.utils;
const bytes32 = utf8ToHex;

// 60 * 60
const ONE_HOUR = 3600;

initHelperWeb3(web3);

PPToken.numberFormat = 'String';
PPLocker.numberFormat = 'String';
PPTokenRegistry.numberFormat = 'String';

describe.only('MultiSig Managed Private Fund Factory', () => {
  const [alice, bob, charlie, dan, minter, lockerFeeManager] = accounts;
  const coreTeam = defaultSender;

  const ethFee = ether(10);
  const galtFee = ether(20);

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.bar = await MockBar.new();

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

    await this.ppTokenFactory.setFeeManager(lockerFeeManager);
    await this.ppTokenFactory.setEthFee(ethFee, { from: lockerFeeManager });
    await this.ppTokenFactory.setGaltFee(galtFee, { from: lockerFeeManager });

    await this.ppLockerFactory.setFeeManager(lockerFeeManager);
    await this.ppLockerFactory.setEthFee(ethFee, { from: lockerFeeManager });
    await this.ppLockerFactory.setGaltFee(galtFee, { from: lockerFeeManager });

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });
    await this.galtToken.mint(bob, ether(10000000), { from: coreTeam });
    await this.galtToken.mint(charlie, ether(10000000), { from: coreTeam });

    const res = await this.ppTokenFactory.build('Buildings', 'BDL', '', ONE_HOUR, [], [], utf8ToHex(''), {
      from: coreTeam,
      value: ether(10)
    });
    this.registry1 = await PPToken.at(getEventArg(res, 'Build', 'token'));
    this.controller1 = await PPTokenController.at(getEventArg(res, 'Build', 'controller'));

    await this.controller1.setMinter(minter);
    await this.controller1.setFee(bytes32('LOCKER_ETH'), ether(0.1));

    this.fundFactory = await deployFundFactory(
      MultiSigManagedPrivateFundFactory,
      this.ppgr.address,
      alice,
      true,
      ether(10),
      ether(20)
    );

    this.mintToken = async (recipient, area) => {
      let res = await this.controller1.mint(recipient, { from: minter });
      const token1 = getEventArg(res, 'Mint', 'tokenId');

      // HACK
      await this.controller1.setInitialDetails(token1, 2, 1, area, utf8ToHex('foo'), 'bar', 'buzz', true, {
        from: minter
      });

      return token1;
    };

    this.tokenLock = async (owner, token, fundRa) => {
      await this.galtToken.approve(this.ppLockerFactory.address, galtFee, { from: owner });
      let res = await this.ppLockerFactory.build({ from: owner });
      const lockerAddress = res.logs[0].args.locker;

      const locker = await PPLocker.at(lockerAddress);
      await this.registry1.approve(lockerAddress, token, { from: owner });
      await locker.deposit(this.registry1.address, token, { from: owner });

      await locker.approveMint(fundRa.address, { from: owner });
      return locker;
    };
  });

  describe('proposals', async function() {
    beforeEach(async function() {
      await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });

      const token1 = await this.mintToken(bob, 100);

      const fund = await buildPrivateFund(
        this.fundFactory,
        alice,
        true,
        new VotingConfig(ether(90), ether(30), VotingConfig.ONE_WEEK),
        {},
        [bob, charlie, dan],
        2,
        ONE_HOUR,
        '',
        '',
        [token1],
        [this.registry1.address]
      );

      this.fundStorageX = fund.fundStorage;
      this.fundControllerX = fund.fundController;
      this.fundRAX = fund.fundRA;
      this.fundProposalManagerX = fund.fundProposalManager;
      this.fundMultiSigX = fund.fundMultiSig;

      let locker = await this.tokenLock(bob, token1, this.fundRAX);

      await this.fundRAX.mint(locker.address, { from: bob });
    });

    it('should approve mint by multisig', async function() {
      const token1 = await this.mintToken(alice, 800);

      const locker = await this.tokenLock(alice, token1, this.fundRAX);

      let res = await locker.reputation();
      assert.equal(res, 800);

      res = await locker.owner();
      assert.equal(res, alice);

      res = await locker.tokenDeposited();
      assert.equal(res, true);

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 0);

      res = await this.fundStorageX.isMintApproved(this.registry1.address, token1);
      assert.equal(res, false);

      // MINT REPUTATION
      await assertRevert(this.fundRAX.mint(locker.address, { from: minter }));
      await assertRevert(this.fundRAX.mint(locker.address, { from: alice }));

      const calldata = this.fundStorageX.contract.methods
        .approveMintAll([this.registry1.address], [parseInt(token1, 10)])
        .encodeABI();
      res = await this.fundMultiSigX.submitTransaction(this.fundStorageX.address, '0', calldata, { from: bob });

      const { transactionId } = res.logs[0].args;
      await this.fundMultiSigX.confirmTransaction(transactionId, { from: charlie });

      res = await this.fundMultiSigX.transactions(transactionId);
      assert.equal(res.executed, true);

      res = await this.fundStorageX.isMintApproved(this.registry1.address, token1);
      assert.equal(res, true);

      await this.fundRAX.mint(locker.address, { from: alice });

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 800);
    });

    it('should add/deactivate a rule by proposal manager', async function() {
      const ipfsHash = galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd');
      let proposalData = this.fundStorageX.contract.methods.addFundRule(ipfsHash, 'Do that').encodeABI();

      let res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        false,
        false,
        proposalData,
        'hey',
        {
          from: bob
        }
      );

      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, true, { from: bob });

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // verify value changed
      res = await this.fundStorageX.getActiveFundRulesCount();
      assert.equal(res, 1);

      res = await this.fundStorageX.getActiveFundRules();
      assert.sameMembers(res.map(int), [1]);

      res = await this.fundStorageX.fundRules(1);
      assert.equal(res.active, true);
      assert.equal(res.id, 1);
      assert.equal(res.ipfsHash, galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd'));
      assert.equal(res.dataLink, 'Do that');

      const ruleId = int(res.id);

      // >>> deactivate aforementioned proposal

      proposalData = this.fundStorageX.contract.methods.disableFundRule(ruleId).encodeABI();

      res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        false,
        false,
        proposalData,
        'obsolete',
        {
          from: bob
        }
      );

      const removeProposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(removeProposalId, true, { from: bob });

      res = await this.fundProposalManagerX.proposals(removeProposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // verify value changed
      res = await this.fundStorageX.getActiveFundRulesCount();
      assert.equal(res, 0);

      res = await this.fundStorageX.getActiveFundRules();
      assert.sameMembers(res.map(int), []);

      res = await this.fundStorageX.fundRules(ruleId);
      assert.equal(res.active, false);
      assert.equal(res.id, 1);
      assert.equal(res.ipfsHash, galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd'));
      assert.equal(res.dataLink, 'Do that');
    });

    it('should execute script if both cast/execute flags are true with enough support', async function() {
      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, true, true, calldata, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.totalAyes, 100);

      assert.equal(await this.bar.number(), 42);
    });

    it('should not approveMintAll by proposal manager', async function() {
      const token1 = await this.mintToken(alice, 800);

      let proposalData = this.fundStorageX.contract.methods.approveMintAll([this.registry1.address], [parseInt(token1, 10)]).encodeABI();

      let res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        false,
        false,
        proposalData,
        'hey',
        {
          from: bob
        }
      );

      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, true, { from: bob });

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, ether(100));
      assert.equal(res.currentSupport, ether(100));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.ACTIVE);

      res = await this.fundStorageX.isMintApproved(this.registry1.address, token1);
      assert.equal(res, false);
    });
  });
});
