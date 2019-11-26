/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

interface IFundRA {
  function balanceOf(address _owner) external view returns (uint256);
  function balanceOfAt(address _owner, uint256 _blockNumber) external view returns (uint256);
  function totalSupplyAt(uint256 _blockNumber) external view returns (uint256);
}
