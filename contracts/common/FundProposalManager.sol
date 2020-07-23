/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "./interfaces/IFundRegistry.sol";
import "./registries/interfaces/IFundRuleRegistry.sol";
import "../common/interfaces/IFundRA.sol";
import "../abstract/interfaces/IAbstractFundStorage.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@galtproject/private-property-registry/contracts/abstract/PPAbstractProposalManager.sol";
import "./interfaces/IFundProposalManager.sol";


contract FundProposalManager is IFundProposalManager, PPAbstractProposalManager {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  uint256 constant VERSION = 2;

  bytes32 public constant ROLE_PROPOSAL_THRESHOLD_MANAGER = bytes32("THRESHOLD_MANAGER");
  bytes32 public constant ROLE_DEFAULT_PROPOSAL_THRESHOLD_MANAGER = bytes32("DEFAULT_THRESHOLD_MANAGER");

  event DepositErc20Reward(uint256 indexed proposalId, address indexed depositer, uint256 amount);
  event WithdrawErc20Reward(uint256 indexed proposalId, address indexed withdrawer, uint256 amount);

  IFundRegistry public fundRegistry;

  // period => tokenContract
  mapping(uint256 => address) public rewardContracts;
  // period => totalDeposited
  mapping(uint256 => uint256) public totalDeposited;
  // period => (voter => hasClaimed)
  mapping(uint256 => mapping(address => bool)) public rewardClaimed;

  modifier onlyMember() {
    require(_fundRA().balanceOf(msg.sender) > 0 || msg.sender == fundRegistry.getRuleRegistryAddress(), "Not valid member");

    _;
  }

  modifier onlyProposalConfigManager() {
    require(fundRegistry.getACL().hasRole(msg.sender, ROLE_PROPOSAL_THRESHOLD_MANAGER), "Invalid role");

    _;
  }

  modifier onlyProposalDefaultConfigManager() {
    require(fundRegistry.getACL().hasRole(msg.sender, ROLE_DEFAULT_PROPOSAL_THRESHOLD_MANAGER), "Invalid role");

    _;
  }

  constructor() public {
  }

  function initialize(address _fundRegistry) public isInitializer {
    fundRegistry = IFundRegistry(_fundRegistry);
    globalRegistry = IPPGlobalRegistry(fundRegistry.getContract(fundRegistry.PPGR()));
  }

  function feeRegistry() public view returns(address) {
    // TODO: support feeRegistry for GGR too with fundFactory too
    if (address(globalRegistry) == address(0)) {
      return address(0);
    }
    return globalRegistry.getPPFeeRegistryAddress();
  }

  function propose(
    address _destination,
    uint256 _value,
    bool _castVote,
    bool _executesIfDecided,
    bool _isCommitReveal,
    address _erc20RewardsContract,
    bytes calldata _data,
    string calldata _dataLink
  )
    external
    payable
    returns (uint256)
  {
    require(canBeProposedToMeeting(_data), "Only rule registry can propose meeting fund rules");

    uint256 id = _propose(_destination, _value, _castVote, _executesIfDecided, _isCommitReveal, _data, _dataLink);

    if (_erc20RewardsContract != address(0)) {
      rewardContracts[id] = _erc20RewardsContract;
    }
    return id;
  }

  function canBeProposedToMeeting(bytes memory _data) public view returns (bool) {
    uint256 meetingId;

    assembly {
      let code := mload(add(_data, 0x20))
      code := and(code, 0xffffffff00000000000000000000000000000000000000000000000000000000)

      switch code
      // addRuleType1
      case 0x83a4481300000000000000000000000000000000000000000000000000000000 {
        meetingId := mload(add(_data, 0x24))
      }
      // addRuleType2
      case 0xca8decda00000000000000000000000000000000000000000000000000000000 {
        meetingId := mload(add(_data, 0x24))
      }
      // addRuleType3
      case 0x46b78ee200000000000000000000000000000000000000000000000000000000 {
        meetingId := mload(add(_data, 0x24))
      }
      // addRuleType4
      case 0xc9e5d09600000000000000000000000000000000000000000000000000000000 {
        meetingId := mload(add(_data, 0x24))
      }
    }
    return meetingId == 0 ? true : msg.sender == fundRegistry.getRuleRegistryAddress();
  }

  function depositErc20Reward(uint256 _proposalId, uint256 _amount) external {
    require(_isProposalOpen(_proposalId), "FundProposalManager: Proposal isn't open");
    address tokenAddress = rewardContracts[_proposalId];

    require(tokenAddress != address(0), "FundProposalManager: Reward token is not assigned");

    totalDeposited[_proposalId] = totalDeposited[_proposalId].add(_amount);

    emit DepositErc20Reward(_proposalId, msg.sender, _amount);

    IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), _amount);
  }

  function claimErc20Reward(uint256 _proposalId) external {
    require(rewardClaimed[_proposalId][msg.sender] == false, "FundProposalManager: Reward is already claimed");
    require(
      block.timestamp > _proposalVotings[_proposalId].timeoutAt,
      "FundProposalManager: Rewards will be available after the voting ends"
    );

    uint256 reward = calculateErc20Reward(_proposalId);
    require(reward > 0, "FundProposalManager: Calculated reward is 0");

    address rewardToken = rewardContracts[_proposalId];
    require(rewardToken != address(0), "FundProposalManager: Reward token is not assigned");


    rewardClaimed[_proposalId][msg.sender] = true;

    emit WithdrawErc20Reward(_proposalId, msg.sender, reward);

    // Empty contract check is done in calculateErc20Reward() method
    IERC20(rewardToken).safeTransfer(msg.sender, reward);
  }

  function calculateErc20Reward(uint256 _proposalId) public view returns (uint256) {
    uint256 totalVotes = _proposalVotings[_proposalId].totalVotes;
    require(totalVotes > 0, "FundProposalManager: Proposal has no votes");

    uint256 totalReward = totalDeposited[_proposalId];
    require(totalReward > 0, "FundProposalManager: Missing reward deposit");

    return totalReward / totalVotes;
  }

  function _fundStorage() internal view returns (IAbstractFundStorage) {
    return IAbstractFundStorage(fundRegistry.getStorageAddress());
  }

  function _fundRA() internal view returns (IFundRA) {
    return IFundRA(fundRegistry.getRAAddress());
  }

  function reputationOf(address _address) public view returns (uint256) {
    return _fundRA().balanceOf(_address);
  }

  function reputationOfAt(address _address, uint256 _blockNumber) public view returns (uint256) {
    return _fundRA().balanceOfAt(_address, _blockNumber);
  }

  function totalReputationSupplyAt(uint256 _blockNumber) public view returns (uint256) {
    return _fundRA().totalSupplyAt(_blockNumber);
  }
}
