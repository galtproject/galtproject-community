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
import "../common/interfaces/IFundRA.sol";
import "../abstract/interfaces/IAbstractFundStorage.sol";

import "@galtproject/private-property-registry/contracts/abstract/PPAbstractProposalManager.sol";


contract FundProposalManager is PPAbstractProposalManager {

  uint256 constant VERSION = 2;

  bytes32 public constant ROLE_PROPOSAL_THRESHOLD_MANAGER = bytes32("THRESHOLD_MANAGER");
  bytes32 public constant ROLE_DEFAULT_PROPOSAL_THRESHOLD_MANAGER = bytes32("DEFAULT_THRESHOLD_MANAGER");

  IFundRegistry public fundRegistry;

  modifier onlyMember() {
    require(_fundRA().balanceOf(msg.sender) > 0, "Not valid member");

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
    bytes calldata _data,
    string calldata _dataLink
  )
    external
    payable
  {
    _propose(_destination, _value, _castVote, _executesIfDecided, _data, _dataLink);
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
