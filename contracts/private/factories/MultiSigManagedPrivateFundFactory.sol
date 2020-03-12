/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "./PrivateFundFactory.sol";


contract MultiSigManagedPrivateFundFactory is PrivateFundFactory {


  constructor (
    IPPGlobalRegistry _globalRegistry,
    FundBareFactory _fundRAFactory,
    FundBareFactory _fundMultiSigFactory,
    PrivateFundStorageFactory _fundStorageFactory,
    FundBareFactory _fundControllerFactory,
    FundBareFactory _fundProposalManagerFactory,
    FundBareFactory _fundRegistryFactory,
    FundBareFactory _fundACLFactory,
    FundBareFactory _fundUpgraderFactory,
    uint256 _ethFee,
    uint256 _galtFee
  )
    public
    PrivateFundFactory(
      _globalRegistry,
      _fundRAFactory,
      _fundMultiSigFactory,
      _fundStorageFactory,
      _fundControllerFactory,
      _fundProposalManagerFactory,
      _fundRegistryFactory,
      _fundACLFactory,
      _fundUpgraderFactory,
      _ethFee,
      _galtFee
    )
  {

  }

  function _setFundProposalManagerRoles(
    IACL fundACL,
    PrivateFundStorage fundStorage,
    address _fundProposalManager,
    address _fundUpgrader,
    address payable _fundMultiSig
  )
    internal
  {
    fundACL.setRole(fundStorage.ROLE_CONFIG_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(fundStorage.ROLE_NEW_MEMBER_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(fundStorage.ROLE_EXPEL_MEMBER_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(fundStorage.ROLE_FINE_MEMBER_INCREMENT_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(fundStorage.ROLE_FINE_MEMBER_DECREMENT_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(fundStorage.ROLE_CHANGE_NAME_AND_DESCRIPTION_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(fundStorage.ROLE_ADD_FUND_RULE_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(fundStorage.ROLE_DEACTIVATE_FUND_RULE_MANAGER(), _fundProposalManager, true);
    fundACL.setRole(fundStorage.ROLE_FEE_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(fundStorage.ROLE_MEMBER_DETAILS_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(fundStorage.ROLE_MULTI_SIG_WITHDRAWAL_LIMITS_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(fundStorage.ROLE_MEMBER_IDENTIFICATION_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(fundStorage.ROLE_PROPOSAL_THRESHOLD_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(fundStorage.ROLE_DEFAULT_PROPOSAL_THRESHOLD_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(fundStorage.ROLE_COMMUNITY_APPS_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(fundStorage.ROLE_PROPOSAL_MARKERS_MANAGER(), _fundMultiSig, true);

    fundACL.setRole(FundUpgrader(_fundUpgrader).ROLE_UPGRADE_SCRIPT_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(FundUpgrader(_fundUpgrader).ROLE_IMPL_UPGRADE_MANAGER(), _fundMultiSig, true);
    fundACL.setRole(FundMultiSig(_fundMultiSig).ROLE_OWNER_MANAGER(), _fundProposalManager, true);
  }

}
