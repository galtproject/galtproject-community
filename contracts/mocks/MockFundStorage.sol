/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.10;

import "openzeppelin-solidity/contracts/drafts/Counters.sol";
import "../decentralized/FundStorage.sol";


contract MockFundStorage is FundStorage {

  constructor (
    GaltGlobalRegistry _ggr,
    bool _isPrivate,
    uint256 _defaultProposalSupport,
    uint256 _defaultProposalQuorum,
    uint256 _defaultProposalTimeout,
    uint256 _periodLength
  )
  public
  FundStorage(_ggr, _isPrivate, _defaultProposalSupport, _defaultProposalQuorum, _defaultProposalTimeout, _periodLength)
  {

  }

  function approveMintAllHack(uint256[] calldata _spaceTokenIdList) external {
    for (uint256 i = 0; i < _spaceTokenIdList.length; i++) {
      _mintApprovals[_spaceTokenIdList[i]] = true;
      emit ApproveMint(_spaceTokenIdList[i]);
    }
  }
}
