const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const PPToken = contract.fromArtifact('PPToken');
const GaltToken = contract.fromArtifact('GaltToken');
const PPLocker = contract.fromArtifact('PPLocker');
const PPGlobalRegistry = contract.fromArtifact('PPGlobalRegistry');
const PPACL = contract.fromArtifact('PPACL');
const PrivateFundFactory = contract.fromArtifact('PrivateFundFactory');
const EthFeeRegistry = contract.fromArtifact('EthFeeRegistry');
const OwnedUpgradeabilityProxy = contract.fromArtifact('OwnedUpgradeabilityProxy');
PPToken.numberFormat = 'String';
PPLocker.numberFormat = 'String';

const { BN } = require('web3-utils');

const { deployFundFactory, buildPrivateFund, VotingConfig, CustomVotingConfig } = require('./deploymentHelpers');
const {
  ether,
  initHelperWeb3,
  getDestinationMarker,
  assertRevert,
  zeroAddress,
  increaseTime,
  lastBlockTimestamp
} = require('./helpers');

initHelperWeb3(web3);

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  EXECUTED: 2
};

describe('FundRuleRegistry Calls', () => {
  const [alice, bob, charlie, multisigOwner1, multisigOwner2, fakeRegistry, feeManager, feeReceiver] = accounts;
  const coreTeam = defaultSender;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });

    this.ppgr = await PPGlobalRegistry.new();
    this.acl = await PPACL.new();
    const ppFeeRegistryImpl = await EthFeeRegistry.new();
    await ppFeeRegistryImpl.initialize(feeManager, feeReceiver, [], []);
    const initializeData = ppFeeRegistryImpl.contract.methods.initialize(feeManager, feeReceiver, [], []).encodeABI();
    const ppFeeRegistryProxy = await OwnedUpgradeabilityProxy.new();
    await ppFeeRegistryProxy.upgradeToAndCall(ppFeeRegistryImpl.address, initializeData);
    this.ppFeeRegistry = await EthFeeRegistry.at(ppFeeRegistryProxy.address);

    await this.ppgr.initialize();

    await this.ppgr.setContract(await this.ppgr.PPGR_GALT_TOKEN(), this.galtToken.address);
    await this.ppgr.setContract(await this.ppgr.PPGR_FEE_REGISTRY(), this.ppFeeRegistry.address);
    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    // fund factory contracts
    this.fundFactory = await deployFundFactory(
      PrivateFundFactory,
      this.ppgr.address,
      alice,
      true,
      ether(10),
      ether(20)
    );
    await this.fundFactory.setFeeManager(coreTeam, { from: alice });
  });

  beforeEach(async function() {
    // build fund
    await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
    const fund = await buildPrivateFund(
      this.fundFactory,
      alice,
      false,
      new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK, 0),
      [new CustomVotingConfig('fundRuleRegistry', '0xc9e5d096', ether(100), ether(100), VotingConfig.ONE_WEEK, 0)],
      [multisigOwner1, multisigOwner2],
      2
    );

    this.fundStorageX = fund.fundStorage;
    this.fundRegistryX = fund.fundRegistry;
    this.fundControllerX = fund.fundController;
    this.fundRAX = fund.fundRA;
    this.fundUpgraderX = fund.fundUpgrader;
    this.fundProposalManagerX = fund.fundProposalManager;
    this.fundACLX = fund.fundACL;
    this.fundRuleRegistryX = fund.fundRuleRegistry;

    this.registries = [fakeRegistry];
    this.beneficiaries = [bob];
    this.benefeciarSpaceTokens = ['1'];

    await this.fundRAX.mintAllHack(this.beneficiaries, this.registries, this.benefeciarSpaceTokens, 300, {
      from: alice
    });
  });

  it('should handle addRuleType4 s100%/q100% correctly', async function() {
    const addRuleType4Marker = await this.fundProposalManagerX.customVotingConfigs(
      getDestinationMarker(this.fundRuleRegistryX, 'addRuleType4')
    );
    assert.equal(addRuleType4Marker.support, ether(100));
    assert.equal(addRuleType4Marker.minAcceptQuorum, ether(100));
    assert.equal(addRuleType4Marker.timeout, VotingConfig.ONE_WEEK);

    const calldata = this.fundRuleRegistryX.contract.methods
      .addRuleType4('0', '0x000000000000000000000000000000000000000000000000000000000000002a', 'blah')
      .encodeABI();
    let res = await this.fundProposalManagerX.propose(
      this.fundRuleRegistryX.address,
      0,
      true,
      true,
      false,
      zeroAddress,
      calldata,
      'blah',
      {
        from: bob
      }
    );

    const proposalId = res.logs[0].args.proposalId.toString(10);

    res = await this.fundProposalManagerX.getProposalVotingProgress(proposalId);
    assert.equal(res.currentSupport, ether(100));
    assert.equal(res.ayesShare, ether(100));
    assert.equal(res.naysShare, ether(0));
    assert.equal(res.requiredSupport, ether(100));
    assert.equal(res.minAcceptQuorum, ether(100));

    res = await this.fundProposalManagerX.proposals(proposalId);
    assert.equal(res.status, ProposalStatus.EXECUTED);

    res = await this.fundRuleRegistryX.fundRules(1);
    assert.equal(res.active, true);
    assert.equal(res.typeId, 4);
    assert.equal(res.dataLink, 'blah');
  });

  it('meetings should working correctly', async function() {
    await assertRevert(
      this.fundRuleRegistryX.addMeeting('meetingLink', 0, 1, { from: bob }),
      'startOn must be greater then current timestamp'
    );
    let currentTimestamp = await lastBlockTimestamp();
    const meetingNoticePeriod = 864000;
    const meetingMinDuration = 432000;
    const meetingProposalCreationPeriod = 86400;

    assert.equal(await this.fundRuleRegistryX.meetingNoticePeriod(), meetingNoticePeriod);
    assert.equal(await this.fundRuleRegistryX.meetingMinDuration(), meetingMinDuration);
    assert.equal(await this.fundRuleRegistryX.meetingProposalCreationPeriod(), meetingProposalCreationPeriod);

    await assertRevert(
      this.fundRuleRegistryX.addMeeting('meetingLink', currentTimestamp + meetingNoticePeriod + 100, 1, { from: bob }),
      'duration must be grater or equal meetingMinDuration'
    );
    await assertRevert(
      this.fundRuleRegistryX.addMeeting(
        'meetingLink',
        currentTimestamp + 100,
        currentTimestamp + meetingMinDuration + 100,
        { from: bob }
      ),
      "startOn can't be sooner then meetingNoticePeriod"
    );
    await assertRevert(
      this.fundRuleRegistryX.addMeeting('meetingLink', 0, 1, { from: charlie }),
      'Not member or multiSig owner'
    );

    let res = await this.fundRuleRegistryX.addMeeting(
      'meetingLink',
      currentTimestamp + meetingNoticePeriod + 100,
      currentTimestamp + meetingNoticePeriod + meetingMinDuration + 200,
      { from: bob }
    );
    const meetingId = res.logs[0].args.id.toString(10);
    assert.equal(meetingId, '1');

    res = await this.fundRuleRegistryX.meetings(meetingId);
    assert.equal(res.active, true);
    assert.equal(res.dataLink, 'meetingLink');

    let calldata = this.fundRuleRegistryX.contract.methods
      .addRuleType4(meetingId, '0x000000000000000000000000000000000000000000000000000000000000002a', 'blah')
      .encodeABI();

    assert.equal(await this.fundProposalManagerX.canBeProposedToMeeting(calldata), false);

    await assertRevert(
      this.fundProposalManagerX.propose(
        this.fundRuleRegistryX.address,
        0,
        true,
        true,
        false,
        zeroAddress,
        calldata,
        'blah',
        {
          from: bob
        }
      ),
      'Meeting currently not available to create proposals'
    );

    await increaseTime(meetingNoticePeriod - meetingProposalCreationPeriod + 101);

    res = await this.fundRuleRegistryX.meetings(meetingId);
    const meetingStartOn = parseInt(res.startOn.toString(10), 10);
    const timestamp = await lastBlockTimestamp();
    assert.equal(timestamp > meetingStartOn - meetingProposalCreationPeriod, true);
    assert.equal(await this.fundProposalManagerX.canBeProposedToMeeting(calldata), true);

    res = await this.fundProposalManagerX.propose(
      this.fundRuleRegistryX.address,
      0,
      true,
      true,
      false,
      zeroAddress,
      calldata,
      'blah',
      {
        from: bob
      }
    );

    const proposalId = res.logs[0].args.proposalId.toString(10);

    res = await this.fundProposalManagerX.proposals(proposalId);
    assert.equal(res.status, ProposalStatus.ACTIVE);

    await increaseTime(meetingProposalCreationPeriod);

    assert.equal(await this.fundProposalManagerX.canBeProposedToMeeting(calldata), false);

    await increaseTime(meetingMinDuration);

    assert.equal(await this.fundProposalManagerX.canBeProposedToMeeting(calldata), false);

    await increaseTime(201);

    await this.fundProposalManagerX.executeProposal(proposalId, '0', { from: bob });

    assert.equal(await this.fundProposalManagerX.canBeProposedToMeeting(calldata), false);

    calldata = this.fundRuleRegistryX.contract.methods
      .addRuleType4(meetingId, '0x000000000000000000000000000000000000000000000000000000000000002a', 'blah')
      .encodeABI();

    await assertRevert(
      this.fundProposalManagerX.propose(
        this.fundRuleRegistryX.address,
        0,
        true,
        true,
        false,
        zeroAddress,
        calldata,
        'blah',
        {
          from: bob
        }
      ),
      'Meeting currently not available to create proposals'
    );

    res = await this.fundProposalManagerX.proposals(proposalId);
    assert.equal(res.status, ProposalStatus.EXECUTED);

    res = await this.fundRuleRegistryX.fundRules(1);
    assert.equal(res.active, true);
    assert.equal(res.typeId, 4);
    assert.equal(res.meetingId, meetingId);
    assert.equal(res.dataLink, 'blah');

    await this.ppFeeRegistry.setEthFeeKeysAndValues(
      [await this.fundRuleRegistryX.ADD_MEETING_FEE_KEY()],
      [ether(0.002)],
      { from: feeManager }
    );

    await assertRevert(
      this.fundRuleRegistryX.addMeeting('meetingLink', 0, 1, { from: multisigOwner1 }),
      'Fee and msg.value not equal'
    );

    const feeReceiverBalanceBefore = await web3.eth.getBalance(feeReceiver);

    currentTimestamp = await lastBlockTimestamp();

    const startOn = currentTimestamp + meetingNoticePeriod + 100;
    const endOn = currentTimestamp + meetingNoticePeriod + meetingMinDuration + 200;
    res = await this.fundRuleRegistryX.addMeeting('meetingLink', startOn, endOn, {
      from: multisigOwner1,
      value: ether(0.002)
    });
    const meeting2Id = res.logs[0].args.id.toString(10);
    assert.equal(meeting2Id, '2');

    assert.equal(await web3.eth.getBalance(this.ppFeeRegistry.address), '0');
    const feeReceiverBalanceAfter = await web3.eth.getBalance(feeReceiver);
    assert.equal(new BN(feeReceiverBalanceAfter).sub(new BN(feeReceiverBalanceBefore)), ether(0.002));

    res = await this.fundRuleRegistryX.meetings(meeting2Id);
    assert.equal(res.active, true);
    assert.equal(res.dataLink, 'meetingLink');
    assert.equal(res.startOn, startOn);
    assert.equal(res.endOn, endOn);

    await assertRevert(
      this.fundRuleRegistryX.editMeeting(meeting2Id, 'meetingLink1', startOn + 100, endOn + 100, false, { from: bob }),
      'Not meeting creator'
    );
    await assertRevert(
      this.fundRuleRegistryX.editMeeting(meeting2Id, 'meetingLink1', startOn - 100, endOn - 100, false, { from: bob }),
      "startOn can't be sooner then meetingNoticePeriod"
    );

    await this.fundRuleRegistryX.editMeeting(meeting2Id, 'meetingLink1', startOn + 100, endOn + 100, false, {
      from: multisigOwner1
    });

    res = await this.fundRuleRegistryX.meetings(meeting2Id);
    assert.equal(res.active, false);
    assert.equal(res.dataLink, 'meetingLink1');
    assert.equal(res.startOn, startOn + 100);
    assert.equal(res.endOn, endOn + 100);

    await this.ppFeeRegistry.setEthFeeKeysAndValues(
      [await this.fundRuleRegistryX.EDIT_MEETING_FEE_KEY()],
      [ether(0.001)],
      { from: feeManager }
    );

    await assertRevert(
      this.fundRuleRegistryX.editMeeting(meeting2Id, 'meetingLink2', startOn + 100, endOn + 100, false, {
        from: multisigOwner1
      }),
      'Fee and msg.value not equal'
    );

    await this.fundRuleRegistryX.editMeeting(meeting2Id, 'meetingLink2', startOn + 100, endOn + 100, false, {
      from: multisigOwner1,
      value: ether(0.001)
    });

    res = await this.fundRuleRegistryX.meetings(meeting2Id);
    assert.equal(res.dataLink, 'meetingLink2');

    await increaseTime(meetingNoticePeriod);

    calldata = this.fundRuleRegistryX.contract.methods
      .addRuleType4(meeting2Id, '0x000000000000000000000000000000000000000000000000000000000000002a', 'blah')
      .encodeABI();

    assert.equal((await lastBlockTimestamp()) < startOn + 100, true);
    assert.equal(await this.fundRuleRegistryX.isMeetingStarted(meeting2Id), false);
    assert.equal(await this.fundProposalManagerX.canBeProposedToMeeting(calldata), false);

    await assertRevert(
      this.fundRuleRegistryX.editMeeting(meeting2Id, 'meetingLink2', startOn + 100, endOn + 100, false, {
        from: multisigOwner1
      }),
      'edit not available for reached notice period meetings'
    );

    await increaseTime(meetingMinDuration + 300);

    await this.ppFeeRegistry.setEthFeeKeysAndValues(
      [await this.fundRuleRegistryX.EDIT_MEETING_FEE_KEY()],
      [ether(0.001)],
      { from: feeManager }
    );

    assert.equal(await this.fundProposalManagerX.canBeProposedToMeeting(calldata), false);

    await assertRevert(
      this.fundRuleRegistryX.editMeeting(meeting2Id, 'meetingLink2', startOn + 100, endOn + 100, false, {
        from: multisigOwner1
      }),
      'edit not available for reached notice period meetings'
    );
  });
});
