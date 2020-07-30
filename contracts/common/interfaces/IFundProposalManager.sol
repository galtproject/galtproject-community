/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;


interface IFundProposalManager {

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
  returns (uint256 id);

  function getProposalsCount() external view returns (uint256);

}
