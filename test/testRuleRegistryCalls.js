const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const PPToken = contract.fromArtifact('PPToken');
const GaltToken = contract.fromArtifact('GaltToken');
const PPLocker = contract.fromArtifact('PPLocker');
const PPGlobalRegistry = contract.fromArtifact('PPGlobalRegistry');
const PPACL = contract.fromArtifact('PPACL');
const PrivateFundFactory = contract.fromArtifact('PrivateFundFactory');

PPToken.numberFormat = 'String';
PPLocker.numberFormat = 'String';

const { deployFundFactory, buildPrivateFund, VotingConfig, CustomVotingConfig } = require('./deploymentHelpers');
const { ether, initHelperWeb3, getDestinationMarker, assertRevert } = require('./helpers');

initHelperWeb3(web3);

const ProposalStatus = {
  NULL: 0,
  ACTIVE: 1,
  EXECUTED: 2
};

describe('FundRuleRegistry Calls', () => {
  const [alice, bob, charlie, multisigOwner1, multisigOwner2, fakeRegistry] = accounts;
  const coreTeam = defaultSender;

  before(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });

    this.ppgr = await PPGlobalRegistry.new();
    this.acl = await PPACL.new();

    await this.ppgr.initialize();

    await this.ppgr.setContract(await this.ppgr.PPGR_GALT_TOKEN(), this.galtToken.address);
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
  });

  beforeEach(async function() {
    // build fund
    await this.galtToken.approve(this.fundFactory.address, ether(100), { from: alice });
    const fund = await buildPrivateFund(
      this.fundFactory,
      alice,
      false,
      new VotingConfig(ether(60), ether(40), VotingConfig.ONE_WEEK),
      [new CustomVotingConfig('fundRuleRegistry', '0xc9e5d096', ether(100), ether(100), VotingConfig.ONE_WEEK)],
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
    let res = await this.fundProposalManagerX.propose(this.fundRuleRegistryX.address, 0, true, true, calldata, 'blah', {
      from: bob
    });

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
      this.fundRuleRegistryX.addMeeting('meetingLink', 0, 1, { from: charlie }),
      'Not member or multiSig owner'
    );

    let res = await this.fundRuleRegistryX.addMeeting('meetingLink', 0, 1, { from: bob });
    const meetingId = res.logs[0].args.id.toString(10);
    assert.equal(meetingId, '1');

    res = await this.fundRuleRegistryX.meetings(meetingId);
    assert.equal(res.active, true);
    assert.equal(res.dataLink, 'meetingLink');

    const calldata = this.fundRuleRegistryX.contract.methods
      .addRuleType4(meetingId, '0x000000000000000000000000000000000000000000000000000000000000002a', 'blah')
      .encodeABI();

    res = await this.fundProposalManagerX.propose(this.fundRuleRegistryX.address, 0, true, true, calldata, 'blah', {
      from: bob
    });

    const proposalId = res.logs[0].args.proposalId.toString(10);

    res = await this.fundProposalManagerX.proposals(proposalId);
    assert.equal(res.status, ProposalStatus.EXECUTED);

    res = await this.fundRuleRegistryX.fundRules(1);
    assert.equal(res.active, true);
    assert.equal(res.typeId, 4);
    assert.equal(res.meetingId, meetingId);
    assert.equal(res.dataLink, 'blah');

    res = await this.fundRuleRegistryX.addMeeting('meetingLink', 0, 1, { from: multisigOwner1 });
    assert.equal(res.logs[0].args.id.toString(10), '2');
  });
});
