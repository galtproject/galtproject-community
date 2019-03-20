/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

pragma solidity 0.5.3;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

// This contract will be included into the current one
import "../FundStorage.sol";


contract FundStorageFactory is Ownable {
  function build(
    bool _isPrivate,
    FundMultiSig _multiSig,
    uint256[] calldata _thresholds
  )
    external
    returns (FundStorage)
  {
    FundStorage fundStorage = new FundStorage(
      _isPrivate,
      _multiSig,
      // _manageWhiteListThreshold,
        _thresholds[0],
      // _modifyConfigThreshold,
        _thresholds[1],
      // _newMemberThreshold,
        _thresholds[2],
      // _expelMemberThreshold,
        _thresholds[3],
      // _fineMemberThreshold,
        _thresholds[4],
      // _changeNameAndDescriptionThreshold,
        _thresholds[5],
      // _addFundRuleThreshold,
        _thresholds[6],
      // _deactivateFundRuleThreshold,
        _thresholds[7],
      // _changeMsOwnersThreshold,
        _thresholds[8],
      // _modifyFeeThreshold,
      _thresholds[9]

    );

    fundStorage.addRoleTo(msg.sender, "role_manager");
    fundStorage.removeRoleFrom(address(this), "role_manager");

    return fundStorage;
  }
}
