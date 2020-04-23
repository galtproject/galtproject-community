const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const PPToken = contract.fromArtifact('PPToken');
const GaltToken = contract.fromArtifact('GaltToken');
const PPLockerRegistry = contract.fromArtifact('PPLockerRegistry');
const PPTokenRegistry = contract.fromArtifact('PPTokenRegistry');
const PPLockerFactory = contract.fromArtifact('PPLockerFactory');
const LockerProposalManagerFactory = contract.fromArtifact('LockerProposalManagerFactory');
const PPTokenFactory = contract.fromArtifact('PPTokenFactory');
const PPTokenControllerFactory = contract.fromArtifact('PPTokenControllerFactory');
const PPTokenController = contract.fromArtifact('PPTokenController');
const PPLocker = contract.fromArtifact('PPLocker');
const PrivateRegularEthFee = contract.fromArtifact('PrivateRegularEthFee');
const PrivateRegularEthFeeFactory = contract.fromArtifact('PrivateRegularEthFeeFactory');
const PPGlobalRegistry = contract.fromArtifact('PPGlobalRegistry');
const PPACL = contract.fromArtifact('PPACL');
const PrivateFundFactory = contract.fromArtifact('PrivateFundFactory');

PPToken.numberFormat = 'String';
PPLocker.numberFormat = 'String';

const {
  approveBurnLockerProposal,
  approveMintLockerProposal,
  approveAndMintLockerProposal,
  burnWithReputationLockerProposal,
  validateProposalError,
  burnLockerProposal,
  ayeLockerProposal,
  nayLockerProposal,
  abstainLockerProposal,
  getLockerProposal,
  withdrawLockerProposal,
  validateProposalSuccess
} = require('@galtproject/private-property-registry/test/proposalHelpers')(contract);

const { deployFundFactory, buildPrivateFund, VotingConfig } = require('./deploymentHelpers');
const {
  ether,
  assertRevert,
  initHelperWeb3,
  lastBlockTimestamp,
  increaseTime,
  evmIncreaseTime,
  getEventArg
} = require('./helpers');

const { utf8ToHex, BN } = web3.utils;
const bytes32 = utf8ToHex;

initHelperWeb3(web3);

// 60 * 60
const ONE_HOUR = 3600;
// 60 * 60 * 24
const ONE_DAY = 86400;
// 60 * 60 * 24 * 7
const ONE_WEEK = 86400 * 7;
// 60 * 60 * 24 * 30
const ONE_MONTH = 2592000;

const ether33 = new BN(ether(100)).div(new BN(3)).toString(10);
const ether66 = new BN(ether(100))
  .div(new BN(3))
  .mul(new BN(2))
  .toString(10);
const ether99 = new BN(ether(100))
  .div(new BN(3))
  .mul(new BN(3))
  .toString(10);

describe('PrivateFundRA', () => {
  const [minter, alice, bob, charlie, dan, lola, nana, burner, unauthorized, lockerFeeManager] = accounts;
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
    const lockerProposalManagerFactory = await LockerProposalManagerFactory.new();
    this.ppLockerFactory = await PPLockerFactory.new(this.ppgr.address, lockerProposalManagerFactory.address, 0, 0);

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
      new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK),
      {},
      [bob, charlie],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundRegistryX = fund.fundRegistry;
    this.fundControllerX = fund.fundController;
    this.fundRAX = fund.fundRA;
    this.fundProposalManagerX = fund.fundProposalManager;

    // CREATE REGISTRIES
    let res = await this.ppTokenFactory.build('Buildings', 'BDL', registryDataLink, ONE_HOUR, [], [], utf8ToHex(''), {
      from: coreTeam,
      value: ether(10)
    });
    this.registry1 = await PPToken.at(getEventArg(res, 'Build', 'token'));
    this.controller1 = await PPTokenController.at(getEventArg(res, 'Build', 'controller'));

    res = await this.ppTokenFactory.build('Land Plots', 'PLT', registryDataLink, ONE_HOUR, [], [], utf8ToHex(''), {
      from: coreTeam,
      value: ether(10)
    });
    this.registry2 = await PPToken.at(getEventArg(res, 'Build', 'token'));
    this.controller2 = await PPTokenController.at(getEventArg(res, 'Build', 'controller'));

    res = await this.ppTokenFactory.build('Appartments', 'APS', registryDataLink, ONE_HOUR, [], [], utf8ToHex(''), {
      from: coreTeam,
      value: ether(10)
    });
    this.registry3 = await PPToken.at(getEventArg(res, 'Build', 'token'));
    this.controller3 = await PPTokenController.at(getEventArg(res, 'Build', 'controller'));

    await this.controller1.setMinter(minter);
    await this.controller2.setMinter(minter);
    await this.controller3.setMinter(minter);

    await this.controller1.setFee(bytes32('LOCKER_ETH'), ether(0.1));
    await this.controller2.setFee(bytes32('LOCKER_ETH'), ether(0.1));
    await this.controller3.setFee(bytes32('LOCKER_ETH'), ether(0.1));

    // MINT TOKENS
    res = await this.controller1.mint(alice, { from: minter });
    this.token1 = getEventArg(res, 'Mint', 'tokenId');
    res = await this.controller2.mint(bob, { from: minter });
    this.token2 = getEventArg(res, 'Mint', 'tokenId');
    res = await this.controller3.mint(charlie, { from: minter });
    this.token3 = getEventArg(res, 'Mint', 'tokenId');

    res = await this.registry1.ownerOf(this.token1);
    assert.equal(res, alice);
    res = await this.registry2.ownerOf(this.token2);
    assert.equal(res, bob);
    res = await this.registry3.ownerOf(this.token3);
    assert.equal(res, charlie);

    // HACK
    await this.controller1.setInitialDetails(this.token1, 2, 1, 800, utf8ToHex('foo'), 'bar', 'buzz', true, {
      from: minter
    });
    await this.controller2.setInitialDetails(this.token2, 2, 1, 100, utf8ToHex('foo'), 'bar', 'buzz', true, {
      from: minter
    });
    await this.controller3.setInitialDetails(this.token3, 2, 1, 100, utf8ToHex('foo'), 'bar', 'buzz', true, {
      from: minter
    });

    // BUILD LOCKERS
    await this.galtToken.approve(this.ppLockerFactory.address, ether(20), { from: alice });
    res = await this.ppLockerFactory.build({ from: alice });
    this.aliceLockerAddress = res.logs[0].args.locker;

    await this.galtToken.approve(this.ppLockerFactory.address, ether(20), { from: bob });
    res = await this.ppLockerFactory.build({ from: bob });
    this.bobLockerAddress = res.logs[0].args.locker;

    await this.galtToken.approve(this.ppLockerFactory.address, ether(20), { from: charlie });
    res = await this.ppLockerFactory.build({ from: charlie });
    this.charlieLockerAddress = res.logs[0].args.locker;

    this.aliceLocker = await PPLocker.at(this.aliceLockerAddress);
    this.bobLocker = await PPLocker.at(this.bobLockerAddress);
    this.charlieLocker = await PPLocker.at(this.charlieLockerAddress);

    // APPROVE SPACE TOKEN
    await this.registry1.approve(this.aliceLockerAddress, this.token1, { from: alice });
    await this.registry2.approve(this.bobLockerAddress, this.token2, { from: bob });
    await this.registry3.approve(this.charlieLockerAddress, this.token3, { from: charlie });

    // DEPOSIT SPACE TOKEN
    await this.aliceLocker.depositAndMint(
      this.registry1.address,
      this.token1,
      [alice],
      ['1'],
      '1',
      this.fundRAX.address,
      true,
      { from: alice, value: ether(0.1) }
    );
    await this.bobLocker.depositAndMint(
      this.registry2.address,
      this.token2,
      [bob],
      ['1'],
      '1',
      this.fundRAX.address,
      true,
      {
        from: bob,
        value: ether(0.1)
      }
    );
    await this.charlieLocker.depositAndMint(
      this.registry3.address,
      this.token3,
      [charlie],
      ['1'],
      '1',
      this.fundRAX.address,
      true,
      { from: charlie, value: ether(0.1) }
    );
  });

  describe('mint', () => {
    it('should mint reputation by depositAndMint function', async function() {
      assert.equal(await this.fundRAX.balanceOf(dan), 0);

      let res = await this.controller1.mint(dan, { from: minter });
      const danToken = getEventArg(res, 'Mint', 'tokenId');

      // HACK
      await this.controller1.setInitialDetails(danToken, 2, 1, 800, utf8ToHex('foo'), 'bar', 'buzz', true, {
        from: minter
      });

      await this.galtToken.approve(this.ppLockerFactory.address, ether(20), { from: charlie });
      res = await this.ppLockerFactory.buildForOwner(dan, ether(100), ether(100), ONE_WEEK, [], [], [], [], {
        from: charlie
      });

      const danLocker = await PPLocker.at(res.logs[0].args.locker);

      // APPROVE SPACE TOKEN
      await this.registry1.approve(danLocker.address, danToken, { from: dan });

      await danLocker.depositAndMint(this.registry1.address, danToken, [dan], ['1'], '1', this.fundRAX.address, true, {
        from: dan
      });

      assert.equal(await danLocker.totalReputation(), 800);
      assert.equal(await danLocker.tokenId(), danToken);
      assert.equal(await danLocker.tokenContract(), this.registry1.address);

      assert.equal(await this.fundRAX.balanceOf(dan), 800);

      await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
      const newFund = await buildPrivateFund(
        this.fundFactory,
        alice,
        false,
        new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK),
        {},
        [bob, charlie],
        2
      );

      await approveAndMintLockerProposal(danLocker, newFund.fundRA, { from: dan });

      assert.equal(await newFund.fundRA.balanceOf(dan), 800);

      await burnWithReputationLockerProposal(danLocker, newFund.fundRA, { from: dan });

      assert.equal(await newFund.fundRA.balanceOf(dan), 0);
    });

    it('should mint reputation to shared owners by depositAndMint function', async function() {
      assert.equal(await this.fundRAX.balanceOf(dan), 0);

      let res = await this.controller1.mint(dan, { from: minter });
      const danToken = getEventArg(res, 'Mint', 'tokenId');

      // HACK
      await this.controller1.setInitialDetails(danToken, 2, 1, ether(100), utf8ToHex('foo'), 'bar', 'buzz', true, {
        from: minter
      });

      await this.galtToken.approve(this.ppLockerFactory.address, ether(20), { from: charlie });
      res = await this.ppLockerFactory.buildForOwner(dan, ether(100), ether(100), ONE_WEEK, [], [], [], [], {
        from: charlie
      });

      const danLocker = await PPLocker.at(res.logs[0].args.locker);

      // APPROVE SPACE TOKEN
      await this.registry1.approve(danLocker.address, danToken, { from: dan });

      await assertRevert(
        danLocker.depositAndMint(
          this.registry1.address,
          danToken,
          [dan, lola, nana],
          ['1', '1', '1'],
          '2',
          this.fundRAX.address,
          true,
          {
            from: dan
          }
        ),
        'Calculated shares and total shares does not equal'
      );

      await assertRevert(
        danLocker.depositAndMint(
          this.registry1.address,
          danToken,
          [dan, lola, nana],
          ['1', '1'],
          '3',
          this.fundRAX.address,
          true,
          {
            from: dan
          }
        ),
        'Calculated shares and total shares does not equal'
      );

      await danLocker.depositAndMint(
        this.registry1.address,
        danToken,
        [dan, lola, nana],
        ['1', '1', '1'],
        '3',
        this.fundRAX.address,
        true,
        {
          from: dan
        }
      );

      assert.equal(await danLocker.totalReputation(), ether99);
      assert.equal(await danLocker.tokenId(), danToken);
      assert.equal(await danLocker.tokenContract(), this.registry1.address);

      assert.equal(await this.fundRAX.balanceOf(dan), ether33);
      assert.equal(await this.fundRAX.balanceOf(nana), ether33);
      assert.equal(await this.fundRAX.balanceOf(lola), ether33);

      await this.fundRAX.delegate(nana, dan, await this.fundRAX.balanceOf(dan), { from: dan });
      assert.equal(await this.fundRAX.balanceOf(dan), '0');
      assert.equal(await this.fundRAX.balanceOf(nana), ether66);

      await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
      const newFund = await buildPrivateFund(
        this.fundFactory,
        alice,
        false,
        new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK),
        {},
        [bob, charlie],
        2
      );

      let proposalId = await approveAndMintLockerProposal(danLocker, newFund.fundRA, { from: dan });
      let proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 1);
      await ayeLockerProposal(danLocker, proposalId, { from: lola });
      proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 1);
      await ayeLockerProposal(danLocker, proposalId, { from: nana });
      proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 2);

      assert.equal(await newFund.fundRA.balanceOf(dan), ether33);

      proposalId = await burnWithReputationLockerProposal(danLocker, newFund.fundRA, { from: dan });
      proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 1);
      await ayeLockerProposal(danLocker, proposalId, { from: lola });
      proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 1);

      await nayLockerProposal(danLocker, proposalId, { from: nana });
      proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 1);
      await abstainLockerProposal(danLocker, proposalId, { from: nana });
      proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 1);
      await ayeLockerProposal(danLocker, proposalId, { from: nana });
      proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 2);

      assert.equal(await newFund.fundRA.balanceOf(dan), 0);
      assert.equal(await newFund.fundRA.balanceOf(nana), 0);
      assert.equal(await newFund.fundRA.balanceOf(lola), 0);
    });

    it('should mint and burn reputation for each owner by shared locker', async function() {
      assert.equal(await this.fundRAX.balanceOf(dan), 0);

      let res = await this.controller1.mint(dan, { from: minter });
      const danToken = getEventArg(res, 'Mint', 'tokenId');

      // HACK
      await this.controller1.setInitialDetails(danToken, 2, 1, ether(100), utf8ToHex('foo'), 'bar', 'buzz', true, {
        from: minter
      });

      await this.galtToken.approve(this.ppLockerFactory.address, ether(20), { from: charlie });
      res = await this.ppLockerFactory.buildForOwner(dan, ether(100), ether(100), ONE_WEEK, [], [], [], [], {
        from: charlie
      });

      const danLocker = await PPLocker.at(res.logs[0].args.locker);

      // APPROVE SPACE TOKEN
      await this.registry1.approve(danLocker.address, danToken, { from: dan });

      await assertRevert(
        danLocker.depositAndMint(
          this.registry1.address,
          danToken,
          [dan, lola, nana],
          ['1', '1', '1'],
          '2',
          this.fundRAX.address,
          false,
          {
            from: dan
          }
        ),
        'Calculated shares and total shares does not equal'
      );

      await assertRevert(
        danLocker.depositAndMint(
          this.registry1.address,
          danToken,
          [dan, lola, nana],
          ['1', '1'],
          '3',
          this.fundRAX.address,
          false,
          {
            from: dan
          }
        ),
        'Calculated shares and total shares does not equal'
      );

      await danLocker.depositAndMint(
        this.registry1.address,
        danToken,
        [dan, lola, nana],
        ['1', '1', '1'],
        '3',
        this.fundRAX.address,
        false,
        {
          from: dan
        }
      );

      assert.equal(await danLocker.totalReputation(), ether99);
      assert.equal(await danLocker.tokenId(), danToken);
      assert.equal(await danLocker.tokenContract(), this.registry1.address);

      await assertRevert(
        this.fundRAX.mintForOwners(danLocker.address, [nana], { from: dan }),
        'Not the owner, locker or proposalManager of locker'
      );
      await assertRevert(
        this.fundRAX.mintForOwners(danLocker.address, [dan, nana], { from: dan }),
        'Not the locker or proposalManager of locker'
      );
      await assertRevert(
        this.fundRAX.mintForOwners(danLocker.address, [dan, nana, lola], { from: dan }),
        'Not the locker or proposalManager of locker'
      );
      await assertRevert(
        this.fundRAX.mintForOwners(danLocker.address, [bob], { from: dan }),
        'Owner does not have reputation in locker'
      );
      await this.fundRAX.mintForOwners(danLocker.address, [dan], { from: dan });

      assert.equal(await this.fundRAX.balanceOf(dan), ether33);
      assert.equal(await this.fundRAX.balanceOf(nana), '0');
      assert.equal(await this.fundRAX.balanceOf(lola), '0');
      assert.equal(await this.fundRAX.tokenReputationMinted(this.registry1.address, danToken), ether33);
      assert.sameMembers(await this.fundRAX.getTokenOwnersMintedByToken(this.registry1.address, danToken), [dan]);

      await assertRevert(
        this.fundRAX.mintForOwners(danLocker.address, [dan], { from: dan }),
        'Reputation already minted for owner'
      );

      await assertRevert(
        this.fundRAX.mintForOwners(danLocker.address, [lola], { from: nana }),
        'Not the owner, locker or proposalManager of locker'
      );
      await assertRevert(
        this.fundRAX.mintForOwners(danLocker.address, [nana, lola], { from: nana }),
        'Not the locker or proposalManager of locker'
      );
      await this.fundRAX.mintForOwners(danLocker.address, [nana], { from: nana });

      assert.equal(await this.fundRAX.balanceOf(dan), ether33);
      assert.equal(await this.fundRAX.balanceOf(nana), ether33);
      assert.equal(await this.fundRAX.balanceOf(lola), '0');
      assert.equal(await this.fundRAX.tokenReputationMinted(this.registry1.address, danToken), ether66);
      assert.sameMembers(await this.fundRAX.getTokenOwnersMintedByToken(this.registry1.address, danToken), [dan, nana]);

      await assertRevert(
        this.fundRAX.approveBurnForOwners(danLocker.address, [dan], { from: nana }),
        'Not the owner, locker or proposalManager of locker'
      );
      await assertRevert(
        this.fundRAX.approveBurnForOwners(danLocker.address, [dan, nana], { from: nana }),
        'Not the locker or proposalManager of locker'
      );
      await assertRevert(
        this.fundRAX.approveBurnForOwners(danLocker.address, [nana, dan], { from: nana }),
        'Not the locker or proposalManager of locker'
      );
      await this.fundRAX.approveBurnForOwners(danLocker.address, [nana], { from: nana });

      assert.equal(await this.fundRAX.balanceOf(dan), ether33);
      assert.equal(await this.fundRAX.balanceOf(nana), '0');
      assert.equal(await this.fundRAX.balanceOf(lola), '0');
      assert.equal(await this.fundRAX.tokenReputationMinted(this.registry1.address, danToken), ether33);
      assert.sameMembers(await this.fundRAX.getTokenOwnersMintedByToken(this.registry1.address, danToken), [dan]);

      await this.fundRAX.mintForOwners(danLocker.address, [nana], { from: nana });

      assert.equal(await this.fundRAX.balanceOf(dan), ether33);
      assert.equal(await this.fundRAX.balanceOf(nana), ether33);
      assert.equal(await this.fundRAX.balanceOf(lola), '0');
      assert.equal(await this.fundRAX.tokenReputationMinted(this.registry1.address, danToken), ether66);
      assert.sameMembers(await this.fundRAX.getTokenOwnersMintedByToken(this.registry1.address, danToken), [dan, nana]);

      await this.fundRAX.mintForOwners(danLocker.address, [lola], { from: lola });

      assert.equal(await this.fundRAX.balanceOf(dan), ether33);
      assert.equal(await this.fundRAX.balanceOf(nana), ether33);
      assert.equal(await this.fundRAX.balanceOf(lola), ether33);
      assert.equal(await this.fundRAX.tokenReputationMinted(this.registry1.address, danToken), ether99);
      assert.sameMembers(await this.fundRAX.getTokenOwnersMintedByToken(this.registry1.address, danToken), [
        dan,
        nana,
        lola
      ]);

      await this.fundRAX.delegate(nana, dan, await this.fundRAX.balanceOf(dan), { from: dan });
      assert.equal(await this.fundRAX.balanceOf(dan), '0');
      assert.equal(await this.fundRAX.balanceOf(nana), ether66);

      await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
      const newFund = await buildPrivateFund(
        this.fundFactory,
        alice,
        false,
        new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK),
        {},
        [bob, charlie],
        2
      );

      await assertRevert(
        newFund.fundRA.mintForOwners(danLocker.address, [dan], { from: dan }),
        'Sra does not added to locker'
      );

      let proposalId = await approveMintLockerProposal(danLocker, newFund.fundRA, { from: dan });
      await ayeLockerProposal(danLocker, proposalId, { from: lola });
      await ayeLockerProposal(danLocker, proposalId, { from: nana });
      let proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 2);

      await newFund.fundRA.mintForOwners(danLocker.address, [dan], { from: dan });
      await newFund.fundRA.mintForOwners(danLocker.address, [nana], { from: nana });
      await newFund.fundRA.mintForOwners(danLocker.address, [lola], { from: lola });

      assert.equal(await newFund.fundRA.balanceOf(dan), ether33);
      assert.equal(await newFund.fundRA.balanceOf(nana), ether33);
      assert.equal(await newFund.fundRA.balanceOf(lola), ether33);
      assert.sameMembers(await newFund.fundRA.getTokenOwnersMintedByToken(this.registry1.address, danToken), [
        dan,
        nana,
        lola
      ]);

      proposalId = await burnWithReputationLockerProposal(danLocker, newFund.fundRA, { from: dan });
      proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 1);
      await ayeLockerProposal(danLocker, proposalId, { from: lola });
      proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 1);

      await nayLockerProposal(danLocker, proposalId, { from: nana });
      proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 1);
      await abstainLockerProposal(danLocker, proposalId, { from: nana });
      proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 1);
      await ayeLockerProposal(danLocker, proposalId, { from: nana });
      proposal = await getLockerProposal(danLocker, proposalId);
      assert.equal(proposal.status, 2);

      assert.equal(await newFund.fundRA.balanceOf(dan), 0);
      assert.equal(await newFund.fundRA.balanceOf(nana), 0);
      assert.equal(await newFund.fundRA.balanceOf(lola), 0);
      assert.equal(await newFund.fundRA.tokenReputationMinted(this.registry1.address, danToken), '0');
      assert.sameMembers(await newFund.fundRA.getTokenOwnersMintedByToken(this.registry1.address, danToken), []);
    });
  });

  describe('lock', () => {
    it('should handle basic reputation transfer case', async function() {
      let res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 800);

      res = await lastBlockTimestamp();
      this.initialTimestamp = res + ONE_HOUR;
      this.regularEthFeeFactory = await PrivateRegularEthFeeFactory.new({ from: coreTeam });
      res = await this.regularEthFeeFactory.build(
        this.fundRegistryX.address,
        this.initialTimestamp.toString(10),
        ONE_MONTH,
        ether(4)
      );
      this.feeAddress = res.logs[0].args.addr;
      this.regularEthFee = await PrivateRegularEthFee.at(this.feeAddress);

      const calldata = this.fundStorageX.contract.methods.addFeeContract(this.feeAddress).encodeABI();
      res = await this.fundProposalManagerX.propose(this.fundStorageX.address, 0, false, false, calldata, 'blah', {
        from: alice
      });
      const proposalId = res.logs[0].args.proposalId.toString(10);

      await this.fundProposalManagerX.aye(proposalId, true, { from: alice });

      res = await this.fundStorageX.getFeeContracts();
      assert.sameMembers(res, [this.feeAddress]);

      await this.regularEthFee.lockToken(this.registry1.address, this.token1, { from: unauthorized });

      res = await this.fundStorageX.isTokenLocked(this.registry1.address, this.token1);
      assert.equal(res, true);

      assert.equal(await this.fundStorageX.isTokenLocked(this.registry1.address, this.token1), true);
      await assertRevert(this.fundRAX.approveBurn(this.aliceLockerAddress, { from: alice }), 'heck');

      assert.equal(await this.fundRAX.balanceOf(alice), 800);

      await increaseTime(ONE_DAY + 2 * ONE_HOUR);
      await this.regularEthFee.pay(this.registry1.address, this.token1, { from: alice, value: ether(4) });

      await this.regularEthFee.unlockToken(this.registry1.address, this.token1, { from: unauthorized });
      await approveBurnLockerProposal(this.aliceLocker, this.fundRAX, { from: alice });

      assert.equal(await this.fundRAX.balanceOf(alice), 0);
    });
  });

  describe('reputation burn when token was burned', () => {
    beforeEach(async function() {
      const res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 800);

      // burn
      await this.controller1.setBurner(burner);
      await this.controller1.initiateTokenBurn(this.token1, { from: burner });

      await evmIncreaseTime(ONE_HOUR + 2);

      await this.controller1.burnTokenByTimeout(this.token1);

      assert.equal(await this.registry1.exists(this.token1), false);
    });

    it('should burn reputation if the token owner has sufficient balance', async function() {
      await this.fundRAX.revokeBurnedTokenReputation(this.aliceLockerAddress, { from: unauthorized });
      await assertRevert(this.fundRAX.revokeBurnedTokenReputation(this.aliceLockerAddress, { from: unauthorized }));
    });

    it('should burn reputation after others sends the required amount to the token owner', async function() {
      await this.fundRAX.delegate(bob, alice, 350, { from: alice });
      await assertRevert(this.fundRAX.revokeBurnedTokenReputation(this.aliceLockerAddress, { from: unauthorized }));
      await this.fundRAX.delegate(alice, alice, 350, { from: bob });
      await this.fundRAX.revokeBurnedTokenReputation(this.aliceLockerAddress, { from: unauthorized });
    });
  });

  describe('transfer', () => {
    it('should handle basic reputation transfer case', async function() {
      let res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 800);

      const block0 = (await web3.eth.getBlock('latest')).number;

      // TRANSFER #1
      await this.fundRAX.delegate(bob, alice, 350, { from: alice });
      const block1 = (await web3.eth.getBlock('latest')).number;

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 450);

      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res, 450);

      // TRANSFER #2
      await this.fundRAX.delegate(charlie, alice, 100, { from: bob });
      const block2 = (await web3.eth.getBlock('latest')).number;

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 450);

      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res, 350);

      res = await this.fundRAX.balanceOf(charlie);
      assert.equal(res, 200);

      // TRANSFER #3
      await this.fundRAX.delegate(alice, alice, 50, { from: charlie });
      const block3 = (await web3.eth.getBlock('latest')).number;

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 500);

      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res, 350);

      res = await this.fundRAX.balanceOf(charlie);
      assert.equal(res, 150);

      // REVOKE #1
      await this.fundRAX.revoke(bob, 200, { from: alice });
      const block4 = (await web3.eth.getBlock('latest')).number;

      await assertRevert(this.fundRAX.revoke(bob, 200, { from: charlie }));
      await assertRevert(this.fundRAX.revoke(alice, 200, { from: charlie }));

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 700);

      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res, 150);

      res = await this.fundRAX.balanceOf(charlie);
      assert.equal(res, 150);

      // BURN REPUTATION UNSUCCESSFUL ATTEMPTS
      let proposalId = await approveBurnLockerProposal(this.aliceLocker, this.fundRAX, { from: alice });
      await validateProposalError(this.aliceLocker, proposalId);

      // UNSUCCESSFUL WITHDRAW SPACE TOKEN
      proposalId = await burnLockerProposal(this.aliceLocker, this.fundRAX, { from: alice });
      await validateProposalError(this.aliceLocker, proposalId);
      proposalId = await withdrawLockerProposal(this.aliceLocker, alice, alice, { from: alice });
      await validateProposalError(this.aliceLocker, proposalId);

      // REVOKE REPUTATION
      await this.fundRAX.revoke(bob, 50, { from: alice });
      await this.fundRAX.revoke(charlie, 50, { from: alice });
      const block5 = (await web3.eth.getBlock('latest')).number;

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 800);

      res = await this.fundRAX.balanceOf(bob);
      assert.equal(res, 100);

      res = await this.fundRAX.balanceOf(charlie);
      assert.equal(res, 100);

      // WITHDRAW TOKEN
      await assertRevert(
        approveBurnLockerProposal(this.aliceLocker, this.fundRAX, { from: charlie }),
        ' Not the locker owner'
      );
      proposalId = await approveBurnLockerProposal(this.aliceLocker, this.fundRAX, { from: alice });
      await validateProposalSuccess(this.aliceLocker, proposalId);
      const block6 = (await web3.eth.getBlock('latest')).number;

      proposalId = await burnLockerProposal(this.aliceLocker, this.fundRAX, { from: alice });
      await validateProposalSuccess(this.aliceLocker, proposalId);

      proposalId = await withdrawLockerProposal(this.aliceLocker, alice, alice, { from: alice });
      await validateProposalSuccess(this.aliceLocker, proposalId);

      res = await this.fundRAX.balanceOf(alice);
      assert.equal(res, 0);

      res = await this.aliceLocker.totalReputation();
      assert.equal(res, 0);

      res = await this.aliceLocker.tokenId();
      assert.equal(res, 0);

      res = await this.aliceLocker.tokenDeposited();
      assert.equal(res, false);

      res = await this.ppLockerRegistry.isValid(this.aliceLockerAddress);
      assert.equal(res, true);

      // CHECK CACHED BALANCES
      res = await this.fundRAX.balanceOfAt(alice, block0);
      assert.equal(res, 800);
      res = await this.fundRAX.balanceOfAt(bob, block0);
      assert.equal(res, 100);
      res = await this.fundRAX.balanceOfAt(charlie, block0);
      assert.equal(res, 100);

      res = await this.fundRAX.balanceOfAt(alice, block1);
      assert.equal(res, 450);
      res = await this.fundRAX.balanceOfAt(bob, block1);
      assert.equal(res, 450);
      res = await this.fundRAX.balanceOfAt(charlie, block1);
      assert.equal(res, 100);

      res = await this.fundRAX.balanceOfAt(alice, block2);
      assert.equal(res, 450);
      res = await this.fundRAX.balanceOfAt(bob, block2);
      assert.equal(res, 350);
      res = await this.fundRAX.balanceOfAt(charlie, block2);
      assert.equal(res, 200);

      res = await this.fundRAX.balanceOfAt(alice, block3);
      assert.equal(res, 500);
      res = await this.fundRAX.balanceOfAt(bob, block3);
      assert.equal(res, 350);
      res = await this.fundRAX.balanceOfAt(charlie, block3);
      assert.equal(res, 150);

      res = await this.fundRAX.balanceOfAt(alice, block4);
      assert.equal(res, 700);
      res = await this.fundRAX.balanceOfAt(bob, block4);
      assert.equal(res, 150);
      res = await this.fundRAX.balanceOfAt(charlie, block4);
      assert.equal(res, 150);

      res = await this.fundRAX.balanceOfAt(alice, block5);
      assert.equal(res, 800);
      res = await this.fundRAX.balanceOfAt(bob, block5);
      assert.equal(res, 100);
      res = await this.fundRAX.balanceOfAt(charlie, block5);
      assert.equal(res, 100);

      res = await this.fundRAX.balanceOfAt(alice, block6);
      assert.equal(res, 0);
      res = await this.fundRAX.balanceOfAt(bob, block6);
      assert.equal(res, 100);
      res = await this.fundRAX.balanceOfAt(charlie, block6);
      assert.equal(res, 100);
    });
  });
});
