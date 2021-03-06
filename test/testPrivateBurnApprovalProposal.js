const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

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
const PrivateFundFactory = contract.fromArtifact('PrivateFundFactory');
const EthFeeRegistry = contract.fromArtifact('EthFeeRegistry');

PPToken.numberFormat = 'String';
PPLocker.numberFormat = 'String';
PPTokenRegistry.numberFormat = 'String';

const {
  validateProposalSuccess,
  approveBurnLockerProposal,
  mintLockerProposal,
  approveAndMintLockerProposal,
  validateProposalError
} = require('@galtproject/private-property-registry/test/proposalHelpers')(contract);
const { deployFundFactory, buildPrivateFund, VotingConfig } = require('./deploymentHelpers');
const { ether, initHelperWeb3, getEventArg, zeroAddress } = require('./helpers');

const { utf8ToHex } = web3.utils;
const bytes32 = utf8ToHex;

initHelperWeb3(web3);

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  EXECUTED: 2
};

const ONE_HOUR = 3600;

describe('PrivateBurnApprovalProposal', () => {
  const [alice, bob, charlie, dan, eve, frank, minter, fakeRegistry, lockerFeeManager] = accounts;

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
      PrivateFundFactory,
      this.ppgr.address,
      alice,
      true,
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
      new VotingConfig(ether(60), ether(50), VotingConfig.ONE_WEEK, 0),
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
      await locker.deposit(this.registry1.address, token1, [alice], ['1'], '1', { from: alice, value: ether(0.1) });

      // MINT REPUTATION
      await approveAndMintLockerProposal(locker, this.fundRAX, { from: alice });

      assert.equal(await this.fundStorageX.burnLocked(), false);
      assert.equal(await this.fundStorageX.isBurnApproved(this.registry1.address, token1), true);

      // EXPEL
      let proposalData = this.fundStorageX.contract.methods.setBurnLocked(true).encodeABI();
      res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        false,
        false,
        false,
        zeroAddress,
        proposalData,
        'blah',
        {
          from: charlie
        }
      );

      let proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, true, { from: alice });
      await this.fundProposalManagerX.aye(proposalId, true, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      assert.equal(await this.fundStorageX.burnLocked(), true);
      assert.equal(await this.fundStorageX.isBurnApproved(this.registry1.address, token1), false);

      const lockerProposalId = await approveBurnLockerProposal(locker, this.fundRAX, { from: alice });
      await validateProposalError(locker, lockerProposalId);

      proposalData = this.fundStorageX.contract.methods
        .setBurnApprovalAll([this.registry1.address], [token1.toString()], true)
        .encodeABI();
      res = await this.fundProposalManagerX.propose(
        this.fundStorageX.address,
        0,
        false,
        false,
        false,
        zeroAddress,
        proposalData,
        'blah',
        {
          from: charlie
        }
      );

      proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, true, { from: alice });
      await this.fundProposalManagerX.aye(proposalId, true, { from: bob });
      await this.fundProposalManagerX.aye(proposalId, true, { from: charlie });

      res = await this.fundProposalManagerX.proposals(proposalId);
      assert.equal(res.status, ProposalStatus.EXECUTED);

      assert.equal(await this.fundStorageX.burnLocked(), true);
      assert.equal(await this.fundStorageX.isBurnApproved(this.registry1.address, token1), true);

      proposalId = await approveBurnLockerProposal(locker, this.fundRAX, { from: alice });
      await validateProposalSuccess(locker, proposalId);

      proposalId = await mintLockerProposal(locker, this.fundRAX, { from: alice });
      await validateProposalSuccess(locker, proposalId);
    });
  });
});
