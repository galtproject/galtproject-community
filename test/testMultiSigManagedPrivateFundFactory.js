const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
const { getResTimestamp } = require('@galtproject/solidity-test-chest')(web3);

const PPToken = contract.fromArtifact('PPToken');
const GaltToken = contract.fromArtifact('GaltToken');
const PPLockerRegistry = contract.fromArtifact('PPLockerRegistry');
const PPTokenRegistry = contract.fromArtifact('PPTokenRegistry');
const PPLockerFactory = contract.fromArtifact('PPLockerFactory');
const PPTokenFactory = contract.fromArtifact('PPTokenFactory');
const LockerProposalManagerFactory = contract.fromArtifact('LockerProposalManagerFactory');
const PPLocker = contract.fromArtifact('PPLocker');
const PPTokenControllerFactory = contract.fromArtifact('PPTokenControllerFactory');
const PPTokenController = contract.fromArtifact('PPTokenController');
const PPGlobalRegistry = contract.fromArtifact('PPGlobalRegistry');
const PPACL = contract.fromArtifact('PPACL');
const MultiSigManagedPrivateFundFactory = contract.fromArtifact('MultiSigManagedPrivateFundFactory');
const MockBar = contract.fromArtifact('MockBar');
const EthFeeRegistry = contract.fromArtifact('EthFeeRegistry');

const galt = require('@galtproject/utils');
const { mintLockerProposal } = require('@galtproject/private-property-registry/test/proposalHelpers')(contract);
const { deployFundFactory, buildPrivateFund, VotingConfig } = require('./deploymentHelpers');
const { ether, initHelperWeb3, getEventArg, int, assertRevert } = require('./helpers');

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

describe('MultiSig Managed Private Fund Factory', () => {
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
    this.ppFeeRegistry = await EthFeeRegistry.new();

    await this.ppgr.initialize();
    await this.ppTokenRegistry.initialize(this.ppgr.address);
    await this.ppLockerRegistry.initialize(this.ppgr.address);
    await this.ppFeeRegistry.initialize(lockerFeeManager, lockerFeeManager, [], []);

    this.ppTokenControllerFactory = await PPTokenControllerFactory.new();
    this.ppTokenFactory = await PPTokenFactory.new(this.ppTokenControllerFactory.address, this.ppgr.address, 0, 0);
    const lockerProposalManagerFactory = await LockerProposalManagerFactory.new();
    this.ppLockerFactory = await PPLockerFactory.new(this.ppgr.address, lockerProposalManagerFactory.address, 0, 0);

    // PPGR setup
    await this.ppgr.setContract(await this.ppgr.PPGR_ACL(), this.acl.address);
    await this.ppgr.setContract(await this.ppgr.PPGR_GALT_TOKEN(), this.galtToken.address);
    await this.ppgr.setContract(await this.ppgr.PPGR_TOKEN_REGISTRY(), this.ppTokenRegistry.address);
    await this.ppgr.setContract(await this.ppgr.PPGR_LOCKER_REGISTRY(), this.ppLockerRegistry.address);
    await this.ppgr.setContract(await this.ppgr.PPGR_FEE_REGISTRY(), this.ppFeeRegistry.address);

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

    const factoryRes = await this.ppTokenFactory.build('Buildings', 'BDL', '', ONE_HOUR, [], [], utf8ToHex(''), {
      from: coreTeam,
      value: ether(10)
    });
    this.registry1 = await PPToken.at(getEventArg(factoryRes, 'Build', 'token'));
    this.controller1 = await PPTokenController.at(getEventArg(factoryRes, 'Build', 'controller'));

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
      const res1 = await this.controller1.mint(recipient, { from: minter });
      const token1 = getEventArg(res1, 'Mint', 'tokenId');

      // HACK
      await this.controller1.setInitialDetails(token1, 2, 1, area, utf8ToHex('foo'), 'bar', 'buzz', true, {
        from: minter
      });

      return token1;
    };

    this.tokenLock = async (owner, token, fundRa) => {
      await this.galtToken.approve(this.ppLockerFactory.address, galtFee, { from: owner });
      const res1 = await this.ppLockerFactory.build({ from: owner });
      const lockerAddress = res1.logs[0].args.locker;

      const locker = await PPLocker.at(lockerAddress);
      await this.registry1.approve(lockerAddress, token, { from: owner });
      await locker.depositAndMint(this.registry1.address, token, [owner], ['1'], '1', fundRa.address, false, {
        from: owner
      });
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
        new VotingConfig(ether(90), ether(30), VotingConfig.ONE_WEEK, 0),
        {},
        [charlie, dan],
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
      this.fundACLX = fund.fundACL;
      this.fundUpgraderX = fund.fundUpgrader;
      this.fundRuleRegistryX = fund.fundRuleRegistry;

      const locker = await this.tokenLock(bob, token1, this.fundRAX);

      await mintLockerProposal(locker, this.fundRAX, { from: bob });
    });

    it('should approve mint by multisig', async function() {
      const token1 = await this.mintToken(alice, 800);

      const locker = await this.tokenLock(alice, token1, this.fundRAX);

      let res = await locker.totalReputation();
      assert.equal(res, 800);

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
      res = await this.fundMultiSigX.submitTransaction(this.fundStorageX.address, '0', calldata, { from: dan });

      const { transactionId } = res.logs[0].args;
      await this.fundMultiSigX.confirmTransaction(transactionId, { from: charlie });

      res = await this.fundMultiSigX.transactions(transactionId);
      assert.equal(res.executed, true);

      res = await this.fundStorageX.isMintApproved(this.registry1.address, token1);
      assert.equal(res, true);

      await mintLockerProposal(locker, this.fundRAX, { from: alice });

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 800);
    });

    it('should add/deactivate a rule by proposal manager', async function() {
      const ipfsHash = galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd');
      let proposalData = this.fundRuleRegistryX.contract.methods.addRuleType2('0', ipfsHash, 'Do that').encodeABI();

      let res = await this.fundProposalManagerX.propose(
        this.fundRuleRegistryX.address,
        0,
        true,
        true,
        false,
        proposalData,
        'hey',
        {
          from: bob
        }
      );

      const createdAt = await getResTimestamp(res);
      const proposalId = res.logs[0].args.proposalId.toString(10);
      assert.equal((await this.fundProposalManagerX.getProposalVoting(proposalId)).creationTotalSupply, 100);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // verify value changed
      res = await this.fundRuleRegistryX.getActiveFundRulesCount();
      assert.equal(res, 1);

      res = await this.fundRuleRegistryX.getActiveFundRules();
      assert.sameMembers(res.map(int), [1]);

      res = await this.fundRuleRegistryX.fundRules(1);
      assert.equal(res.active, true);
      assert.equal(res.id, 1);
      assert.equal(res.typeId, 2);
      assert.equal(res.createdAt, createdAt);
      assert.equal(res.disabledAt, 0);
      assert.equal(res.ipfsHash, galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd'));
      assert.equal(res.dataLink, 'Do that');

      const ruleId = int(res.id);

      // >>> deactivate aforementioned proposal

      proposalData = this.fundRuleRegistryX.contract.methods.disableRuleType2(ruleId).encodeABI();

      res = await this.fundProposalManagerX.propose(
        this.fundRuleRegistryX.address,
        0,
        false,
        false,
        false,
        proposalData,
        'obsolete',
        {
          from: bob
        }
      );

      const removeProposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.aye(removeProposalId, true, { from: bob });
      const disabledAt = await getResTimestamp(res);

      res = await this.fundProposalManagerX.proposals(removeProposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // verify value changed
      res = await this.fundRuleRegistryX.getActiveFundRulesCount();
      assert.equal(res, 0);

      res = await this.fundRuleRegistryX.getActiveFundRules();
      assert.sameMembers(res.map(int), []);

      res = await this.fundRuleRegistryX.fundRules(ruleId);
      assert.equal(res.active, false);
      assert.equal(res.id, 1);
      assert.equal(res.typeId, 2);
      assert.equal(res.disabledAt, disabledAt);
      assert.equal(res.ipfsHash, galt.ipfsHashToBytes32('QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd'));
      assert.equal(res.dataLink, 'Do that');
    });

    it('should change multisig owners by proposal manager', async function() {
      let res = await this.fundMultiSigX.getOwners();
      assert.sameMembers(res, [dan, charlie]);

      let proposalData = this.fundStorageX.contract.methods.setMultiSigManager(true, bob, 'Bob', '').encodeABI();

      res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        true,
        true,
        false,
        proposalData,
        'hey',
        {
          from: bob
        }
      );

      const proposalId = res.logs[0].args.proposalId.toString(10);
      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      res = await this.fundStorageX.multiSigManagers(bob);
      assert.equal(res.active, true);
      assert.equal(res.manager, bob);
      assert.equal(res.name, 'Bob');

      proposalData = this.fundMultiSigX.contract.methods.setOwners([bob], 1).encodeABI();

      res = await this.fundProposalManagerX.propose(
        this.fundMultiSigX.address,
        0,
        true,
        true,
        false,
        proposalData,
        'obsolete',
        {
          from: bob
        }
      );

      const setOwnersProposalId = res.logs[0].args.proposalId.toString(10);
      res = await this.fundProposalManagerX.proposals(setOwnersProposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      // verify value changed
      res = await this.fundMultiSigX.getOwners();
      assert.sameMembers(res, [bob]);
      assert.equal(await this.fundMultiSigX.isOwner(bob), true);
      assert.equal(await this.fundMultiSigX.isOwner(dan), false);
      assert.equal(await this.fundMultiSigX.isOwner(charlie), false);
    });

    it('fundProposalManager should work with external contracts', async function() {
      const calldata = this.bar.contract.methods.setNumber(42).encodeABI();
      let res = await this.fundProposalManagerX.propose(this.bar.address, 0, true, true, false, calldata, 'blah', {
        from: bob
      });

      const proposalId = res.logs[0].args.proposalId.toString(10);

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);
      assert.equal(res.totalAyes, 100);

      assert.equal(await this.bar.number(), 42);
    });

    it('should not approveMintAll by proposal manager', async function() {
      const token1 = await this.mintToken(alice, 800);

      const proposalData = this.fundStorageX.contract.methods
        .approveMintAll([this.registry1.address], [parseInt(token1, 10)])
        .encodeABI();

      let res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        false,
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

    it('should success approveMintAll by proposal manager after role changed', async function() {
      const token1 = await this.mintToken(alice, 800);

      let res = await this.fundStorageX.isMintApproved(this.registry1.address, token1);
      assert.equal(res, false);

      const newMemberRole = await this.fundStorageX.ROLE_NEW_MEMBER_MANAGER();

      assert.equal(await this.fundACLX.hasRole(this.fundMultiSigX.address, newMemberRole), true);
      assert.equal(await this.fundACLX.hasRole(this.fundProposalManagerX.address, newMemberRole), false);

      const removeOldRoleData = this.fundACLX.contract.methods
        .setRole(newMemberRole, this.fundMultiSigX.address, false)
        .encodeABI();

      const addRoleData = this.fundACLX.contract.methods
        .setRole(newMemberRole, this.fundProposalManagerX.address, true)
        .encodeABI();

      let rolesProposalData = this.fundUpgraderX.contract.methods
        .callContractScript(this.fundACLX.address, removeOldRoleData)
        .encodeABI();

      // delegate role for approveMintAll method to proposalManager instead of multiSig
      res = await this.fundMultiSigX.submitTransaction(this.fundUpgraderX.address, '0', rolesProposalData, {
        from: dan
      });
      let { transactionId } = res.logs[0].args;
      await this.fundMultiSigX.confirmTransaction(transactionId, { from: charlie });

      rolesProposalData = this.fundUpgraderX.contract.methods
        .callContractScript(this.fundACLX.address, addRoleData)
        .encodeABI();

      res = await this.fundMultiSigX.submitTransaction(this.fundUpgraderX.address, '0', rolesProposalData, {
        from: dan
      });
      transactionId = res.logs[0].args.transactionId;
      await this.fundMultiSigX.confirmTransaction(transactionId, { from: charlie });

      assert.equal(await this.fundACLX.hasRole(this.fundMultiSigX.address, newMemberRole), false);
      assert.equal(await this.fundACLX.hasRole(this.fundProposalManagerX.address, newMemberRole), true);

      const proposalData = this.fundStorageX.contract.methods
        .approveMintAll([this.registry1.address], [parseInt(token1, 10)])
        .encodeABI();

      // multiSig can't approveMintAll anymore
      res = await this.fundMultiSigX.submitTransaction(this.fundStorageX.address, '0', proposalData, { from: dan });

      transactionId = res.logs[0].args.transactionId;
      await this.fundMultiSigX.confirmTransaction(transactionId, { from: charlie });

      res = await this.fundMultiSigX.transactions(transactionId);
      assert.equal(res.executed, false);

      res = await this.fundStorageX.isMintApproved(this.registry1.address, token1);
      assert.equal(res, false);

      // execute approveMintAll by proposal manager
      res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        true,
        true,
        false,
        proposalData,
        'hey',
        {
          from: bob
        }
      );

      const proposalId = res.logs[0].args.proposalId.toString(10);
      res = await this.fundProposalManagerX.getProposalVoting(proposalId);
      assert.sameMembers(res.ayes, [bob]);

      res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
      assert.equal(res.ayesShare, ether(100));
      assert.equal(res.currentSupport, ether(100));

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      res = await this.fundStorageX.isMintApproved(this.registry1.address, token1);
      assert.equal(res, true);
    });
  });
});
