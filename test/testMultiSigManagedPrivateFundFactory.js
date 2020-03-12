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

const { deployFundFactory, buildPrivateFund, VotingConfig, CustomVotingConfig } = require('./deploymentHelpers');
const { ether, initHelperWeb3, getEventArg, assertRevert } = require('./helpers');

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
  });

  describe('proposals', async function() {
    beforeEach(async function() {
      await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });

      const fund = await buildPrivateFund(
        this.fundFactory,
        alice,
        true,
        new VotingConfig(ether(90), ether(30), VotingConfig.ONE_WEEK),
        {},
        [bob, charlie, dan],
        2
      );

      this.fundStorageX = fund.fundStorage;
      this.fundControllerX = fund.fundController;
      this.fundRAX = fund.fundRA;
      this.fundProposalManagerX = fund.fundProposalManager;
      this.fundMultiSigX = fund.fundMultiSig;
    });

    it('should approve mint by multisig', async function() {
      let res = await this.controller1.mint(alice, { from: minter });
      const token1 = getEventArg(res, 'Mint', 'tokenId');

      res = await this.registry1.ownerOf(token1);
      assert.equal(res, alice);

      // HACK
      await this.controller1.setInitialDetails(token1, 2, 1, 800, utf8ToHex('foo'), 'bar', 'buzz', true, {
        from: minter
      });

      await this.galtToken.approve(this.ppLockerFactory.address, galtFee, { from: alice });
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

      res = await locker.tokenDeposited();
      assert.equal(res, true);

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 0);

      res = await this.fundStorageX.isMintApproved(this.registry1.address, token1);
      assert.equal(res, false);

      // MINT REPUTATION
      await locker.approveMint(this.fundRAX.address, { from: alice });
      await assertRevert(this.fundRAX.mint(lockerAddress, { from: minter }));
      await assertRevert(this.fundRAX.mint(lockerAddress, { from: alice }));

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

      await this.fundRAX.mint(lockerAddress, { from: alice });

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 800);
    });

    it('should use custom markers with 3rd step', async function() {
      // build fund
      await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
      const fund = await buildPrivateFund(
        this.fundFactory,
        alice,
        false,
        new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK),
        [
          // fundStorage.setPeriodLimit()
          new CustomVotingConfig('fundStorage', '0x8d996c0d', ether(50), ether(30), VotingConfig.ONE_WEEK)
        ],
        [bob, charlie],
        2
      );

      const fundStorageX = fund.fundStorage;
      const fundControllerX = fund.fundController;

      let res = await fundStorageX.customVotingConfigs(
        await fundStorageX.getThresholdMarker(fundStorageX.address, '0x8d996c0d')
      );
      assert.equal(res.support, ether(50));
      assert.equal(res.minAcceptQuorum, ether(30));
      assert.equal(res.timeout, VotingConfig.ONE_WEEK);

      res = await fundStorageX.customVotingConfigs(await fundStorageX.getThresholdMarker(alice, '0x3f554115'));
      assert.equal(res.support, 0);
      assert.equal(res.minAcceptQuorum, 0);
      assert.equal(res.timeout, 0);

      res = await fundStorageX.customVotingConfigs(
        await fundStorageX.getThresholdMarker(fundControllerX.address, '0x8d996c0d')
      );
      assert.equal(res.support, 0);
      assert.equal(res.minAcceptQuorum, 0);
      assert.equal(res.timeout, 0);
    });
  });
});
