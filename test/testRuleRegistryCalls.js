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
  const [
    alice,
    bob,
    charlie,
    multisigOwner1,
    multisigOwner2,
    fakeRegistry,
    feeManager,
    feeReceiver,
    anyone,
    serviceCompany
  ] = accounts;
  const coreTeam = defaultSender;

  const mockDataLink = 'bafyreidlwatcadkjrnykng7alhuss4iysmpn7lfxidvi6p5dgkhr4xtt6';

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

  afterEach(async function() {
    await this.ppFeeRegistry.setEthFeeKeysAndValues(
      [await this.fundRuleRegistryX.ADD_MEETING_FEE_KEY(), await this.fundRuleRegistryX.EDIT_MEETING_FEE_KEY()],
      ['0', '0'],
      { from: feeManager }
    );
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
      this.fundRuleRegistryX.addMeeting('meetingLink', 0, 1, false, zeroAddress, { from: bob }),
      'startOn must be greater then current timestamp'
    );
    let currentTimestamp = await lastBlockTimestamp();
    const meetingNoticePeriod = 864000;
    const meetingDuration = 432000;

    assert.equal(await this.fundRuleRegistryX.meetingNoticePeriod(), meetingNoticePeriod);
    await assertRevert(
      this.fundRuleRegistryX.addMeeting(
        'meetingLink',
        currentTimestamp + 100,
        currentTimestamp + meetingDuration + 100,
        false,
        zeroAddress,
        { from: bob }
      ),
      "startOn can't be sooner then meetingNoticePeriod"
    );
    await assertRevert(
      this.fundRuleRegistryX.addMeeting('meetingLink', 0, 1, false, zeroAddress, { from: charlie }),
      "msg.sender can't manage meeting"
    );

    let res = await this.fundRuleRegistryX.addMeeting(
      'meetingLink',
      currentTimestamp + meetingNoticePeriod + 100,
      currentTimestamp + meetingNoticePeriod + meetingDuration + 200,
      false,
      zeroAddress,
      { from: bob }
    );
    const meetingId = res.logs[0].args.id.toString(10);
    assert.equal(meetingId, '1');

    const getMockCalldata = str => {
      return this.fundRuleRegistryX.contract.methods
        .addRuleType4(
          meetingId,
          '0x476b55a32bf26c82001e57317c5a00351c5c764bc0967bb501ecbab39b516b06',
          mockDataLink + str
        )
        .encodeABI();
    };

    res = await this.fundRuleRegistryX.meetings(meetingId);
    assert.equal(res.active, true);
    assert.equal(res.dataLink, 'meetingLink');

    await assertRevert(
      this.fundRuleRegistryX.addMeetingProposalsData(
        meetingId,
        '0',
        this.fundRuleRegistryX.contract.methods
          .addRuleType4('2', '0x476b55a32bf26c82001e57317c5a00351c5c764bc0967bb501ecbab39b516b06', `${mockDataLink}1`)
          .encodeABI(),
        getMockCalldata('2'),
        getMockCalldata('3'),
        getMockCalldata('4'),
        getMockCalldata('5'),
        getMockCalldata('6'),
        { from: bob }
      ),
      'Meeting id does not match'
    );

    await this.fundRuleRegistryX.addMeetingProposalsData(
      meetingId,
      '0',
      getMockCalldata('1'),
      getMockCalldata('2'),
      getMockCalldata('3'),
      getMockCalldata('4'),
      getMockCalldata('5'),
      getMockCalldata('6'),
      { from: bob }
    );
    assert.equal(await this.fundRuleRegistryX.getMeetingProposalsDataCount(meetingId), 6);

    await this.fundRuleRegistryX.addMeetingProposalsData(
      meetingId,
      '6',
      getMockCalldata('7'),
      getMockCalldata('8'),
      getMockCalldata('9'),
      getMockCalldata('a'),
      getMockCalldata('b'),
      getMockCalldata('c'),
      { from: bob }
    );
    assert.equal(await this.fundRuleRegistryX.getMeetingProposalsDataCount(meetingId), 12);

    await this.fundRuleRegistryX.addMeetingProposalsData(
      meetingId,
      '12',
      getMockCalldata('d'),
      getMockCalldata('e'),
      getMockCalldata('f'),
      getMockCalldata('g'),
      getMockCalldata('h'),
      getMockCalldata('j'),
      { from: bob }
    );
    assert.equal(await this.fundRuleRegistryX.getMeetingProposalsDataCount(meetingId), 18);

    await assertRevert(
      this.fundRuleRegistryX.addMeetingProposalsData(
        meetingId,
        '18',
        getMockCalldata('k'),
        '0x0',
        getMockCalldata('m'),
        getMockCalldata('n'),
        getMockCalldata('o'),
        '0x0',
        { from: bob }
      ),
      'Index too big'
    );

    await assertRevert(
      this.fundRuleRegistryX.addMeetingProposalsData(
        meetingId,
        '18',
        getMockCalldata('k'),
        getMockCalldata('l'),
        getMockCalldata('m'),
        getMockCalldata('n'),
        getMockCalldata('o'),
        '0x0',
        { from: multisigOwner1 }
      ),
      'Not meeting creator'
    );

    await this.fundRuleRegistryX.addMeetingProposalsData(
      meetingId,
      '18',
      getMockCalldata('k'),
      getMockCalldata('l'),
      getMockCalldata('m'),
      getMockCalldata('n'),
      getMockCalldata('o'),
      '0x0',
      { from: bob }
    );
    assert.equal(await this.fundRuleRegistryX.getMeetingProposalsDataCount(meetingId), 23);

    res = await this.fundRuleRegistryX.meetings(meetingId);
    assert.equal(res.createdProposalsCount, 0);

    await assertRevert(
      this.fundRuleRegistryX.createMeetingProposals(meetingId, '20', { from: anyone }),
      'Proposals creation currently not available'
    );

    await increaseTime(meetingNoticePeriod + 101);

    await assertRevert(
      this.fundRuleRegistryX.addMeetingProposalsData(
        meetingId,
        '18',
        getMockCalldata('k'),
        getMockCalldata('l'),
        getMockCalldata('m'),
        getMockCalldata('n'),
        getMockCalldata('o'),
        '0x0',
        { from: bob }
      ),
      'Meeting already started'
    );

    assert.equal(await this.fundProposalManagerX.getProposalsCount(), 0);

    await this.fundRuleRegistryX.createMeetingProposals(meetingId, '20', { from: anyone });
    await assertRevert(
      this.fundRuleRegistryX.createMeetingProposals(meetingId, '4', { from: anyone }),
      'Proposals overflow'
    );

    res = await this.fundRuleRegistryX.meetings(meetingId);
    assert.equal(res.createdProposalsCount, 20);

    await this.fundRuleRegistryX.createMeetingProposals(meetingId, '3', { from: anyone });

    res = await this.fundRuleRegistryX.meetings(meetingId);
    assert.equal(res.createdProposalsCount, 23);

    await assertRevert(
      this.fundRuleRegistryX.createMeetingProposals(meetingId, '1', { from: anyone }),
      'Proposals overflow'
    );
    await assertRevert(
      this.fundRuleRegistryX.createMeetingProposals(meetingId, '0', { from: anyone }),
      "countToCreate can't be 0"
    );

    assert.equal(await this.fundProposalManagerX.getProposalsCount(), 23);

    const proposal1 = await this.fundProposalManagerX.proposals('1');
    assert.equal(proposal1.dataLink, `${mockDataLink}1`);

    const proposal10 = await this.fundProposalManagerX.proposals('10');
    assert.equal(proposal10.dataLink, `${mockDataLink}a`);

    const proposal22 = await this.fundProposalManagerX.proposals('22');
    assert.equal(proposal22.dataLink, `${mockDataLink}n`);

    const proposal23 = await this.fundProposalManagerX.proposals('23');
    assert.equal(proposal23.dataLink, `${mockDataLink}o`);

    await this.fundProposalManagerX.aye('1', true, { from: bob });

    res = await this.fundProposalManagerX.proposals('1');
    assert.equal(res.status, ProposalStatus.EXECUTED);

    res = await this.fundRuleRegistryX.fundRules(1);
    assert.equal(res.active, true);
    assert.equal(res.typeId, 4);
    assert.equal(res.meetingId, meetingId);
    assert.equal(res.dataLink, `${mockDataLink}1`);

    await this.ppFeeRegistry.setEthFeeKeysAndValues(
      [await this.fundRuleRegistryX.ADD_MEETING_FEE_KEY()],
      [ether(0.002)],
      { from: feeManager }
    );

    await assertRevert(
      this.fundRuleRegistryX.addMeeting('meetingLink', 0, 1, false, zeroAddress, { from: multisigOwner1 }),
      'Fee and msg.value not equal'
    );

    const feeReceiverBalanceBefore = await web3.eth.getBalance(feeReceiver);

    currentTimestamp = await lastBlockTimestamp();

    const startOn = currentTimestamp + meetingNoticePeriod + 100;
    const endOn = currentTimestamp + meetingNoticePeriod + meetingDuration + 200;
    res = await this.fundRuleRegistryX.addMeeting('meetingLink', startOn, endOn, false, zeroAddress, {
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
      this.fundRuleRegistryX.editMeeting(
        meeting2Id,
        'meetingLink1',
        startOn + 100,
        endOn + 100,
        false,
        zeroAddress,
        false,
        { from: bob }
      ),
      'Not meeting creator'
    );
    await assertRevert(
      this.fundRuleRegistryX.editMeeting(
        meeting2Id,
        'meetingLink1',
        startOn - 100,
        endOn - 100,
        false,
        zeroAddress,
        false,
        { from: bob }
      ),
      "startOn can't be sooner then meetingNoticePeriod"
    );

    await this.fundRuleRegistryX.editMeeting(
      meeting2Id,
      'meetingLink1',
      startOn + 100,
      endOn + 100,
      false,
      zeroAddress,
      false,
      {
        from: multisigOwner1
      }
    );

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
      this.fundRuleRegistryX.editMeeting(
        meeting2Id,
        'meetingLink2',
        startOn + 100,
        endOn + 100,
        false,
        zeroAddress,
        false,
        {
          from: multisigOwner1
        }
      ),
      'Fee and msg.value not equal'
    );

    await this.fundRuleRegistryX.editMeeting(
      meeting2Id,
      'meetingLink2',
      startOn + 100,
      endOn + 100,
      false,
      zeroAddress,
      false,
      {
        from: multisigOwner1,
        value: ether(0.001)
      }
    );

    res = await this.fundRuleRegistryX.meetings(meeting2Id);
    assert.equal(res.dataLink, 'meetingLink2');

    await increaseTime(meetingNoticePeriod);

    // calldata = this.fundRuleRegistryX.contract.methods
    //   .addRuleType4(meeting2Id, '0x000000000000000000000000000000000000000000000000000000000000002a', 'blah')
    //   .encodeABI();

    assert.equal((await lastBlockTimestamp()) < startOn + 100, true);
    assert.equal(await this.fundRuleRegistryX.isMeetingStarted(meeting2Id), false);

    await assertRevert(
      this.fundRuleRegistryX.editMeeting(
        meeting2Id,
        'meetingLink2',
        startOn + 100,
        endOn + 100,
        false,
        zeroAddress,
        false,
        {
          from: multisigOwner1
        }
      ),
      'edit not available for reached notice period meetings'
    );

    await increaseTime(meetingDuration + 300);

    await this.ppFeeRegistry.setEthFeeKeysAndValues(
      [await this.fundRuleRegistryX.EDIT_MEETING_FEE_KEY()],
      [ether(0.001)],
      { from: feeManager }
    );

    await assertRevert(
      this.fundRuleRegistryX.editMeeting(
        meeting2Id,
        'meetingLink2',
        startOn + 100,
        endOn + 100,
        false,
        zeroAddress,
        false,
        {
          from: multisigOwner1
        }
      ),
      'edit not available for reached notice period meetings'
    );
  });

  it('serviceCompany should manage meetings', async function() {
    const currentTimestamp = await lastBlockTimestamp();
    const meetingNoticePeriod = 864000;
    const meetingDuration = 432000;

    await assertRevert(
      this.fundRuleRegistryX.addMeeting(
        'meetingLink',
        currentTimestamp + meetingNoticePeriod + 100,
        currentTimestamp + meetingNoticePeriod + meetingDuration + 200,
        false,
        zeroAddress,
        { from: serviceCompany }
      ),
      "msg.sender can't manage meeting"
    );

    const calldata = this.fundStorageX.contract.methods.setServiceCompany(serviceCompany).encodeABI();

    let res = await this.fundProposalManagerX.propose(
      this.fundStorageX.address,
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
    assert.equal(res.status, ProposalStatus.EXECUTED);

    res = await this.fundRuleRegistryX.addMeeting(
      'meetingLink',
      currentTimestamp + meetingNoticePeriod + 100,
      currentTimestamp + meetingNoticePeriod + meetingDuration + 200,
      false,
      zeroAddress,
      { from: serviceCompany }
    );
    const meetingId = res.logs[0].args.id.toString(10);
    assert.equal(meetingId, '1');

    const getMockCalldata = str => {
      return this.fundRuleRegistryX.contract.methods
        .addRuleType4(
          meetingId,
          '0x476b55a32bf26c82001e57317c5a00351c5c764bc0967bb501ecbab39b516b06',
          mockDataLink + str
        )
        .encodeABI();
    };

    res = await this.fundRuleRegistryX.meetings(meetingId);
    assert.equal(res.active, true);
    assert.equal(res.dataLink, 'meetingLink');

    await this.fundRuleRegistryX.addMeetingProposalsData(
      meetingId,
      '0',
      getMockCalldata('1'),
      getMockCalldata('2'),
      getMockCalldata('3'),
      getMockCalldata('4'),
      getMockCalldata('5'),
      getMockCalldata('6'),
      { from: serviceCompany }
    );

    assert.equal(await this.fundRuleRegistryX.getMeetingProposalsDataCount(meetingId), 6);

    await this.fundRuleRegistryX.removeMeetingProposalsData(meetingId, '2', { from: serviceCompany });

    await this.fundRuleRegistryX.addMeetingProposalsData(
      meetingId,
      '0',
      getMockCalldata('11'),
      getMockCalldata('22'),
      getMockCalldata('33'),
      getMockCalldata('44'),
      '0x',
      '0x',
      { from: serviceCompany }
    );

    assert.equal(await this.fundRuleRegistryX.getMeetingProposalsDataCount(meetingId), 4);

    await increaseTime(101);

    await assertRevert(
      this.fundRuleRegistryX.addMeetingProposalsData(
        meetingId,
        '0',
        getMockCalldata('1'),
        getMockCalldata('2'),
        getMockCalldata('3'),
        getMockCalldata('4'),
        getMockCalldata('5'),
        getMockCalldata('6'),
        { from: serviceCompany }
      ),
      'edit not available for reached notice period meetings'
    );

    assert.equal(await this.fundRuleRegistryX.getMeetingProposalsDataCount(meetingId), 4);

    res = await this.fundRuleRegistryX.meetings(meetingId);
    assert.equal(res.createdProposalsCount, 0);

    assert.equal(await this.fundProposalManagerX.getProposalsCount(), 1);

    await increaseTime(meetingNoticePeriod);

    await this.fundRuleRegistryX.createMeetingProposals(meetingId, '4', { from: anyone });

    res = await this.fundRuleRegistryX.meetings(meetingId);
    assert.equal(res.createdProposalsCount, 4);

    assert.equal(await this.fundProposalManagerX.getProposalsCount(), 5);

    const proposal1 = await this.fundProposalManagerX.proposals('2');
    assert.equal(proposal1.dataLink, `${mockDataLink}11`);
  });
});
