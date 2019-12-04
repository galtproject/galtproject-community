/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@openzeppelin/contracts/drafts/Counters.sol";
import "../decentralized/FundStorage.sol";


contract MockFundStorage is FundStorage {

  constructor () public FundStorage() { }

  function approveMintAllHack(uint256[] calldata _spaceTokenIdList) external {
    for (uint256 i = 0; i < _spaceTokenIdList.length; i++) {
      _mintApprovals[_spaceTokenIdList[i]] = true;
      emit ApproveMint(_spaceTokenIdList[i]);
    }
  }
}
