/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "../common/FundACL.sol";


contract MockFundACL is FundACL {
  function hackRole(bytes32 _role, address _candidate, bool _allow) external {
    _roles[_role][_candidate] = _allow;
    emit SetRole(_role, _candidate, _allow);
  }
}
