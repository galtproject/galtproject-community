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
import "../private/PrivateFundRA.sol";


contract MockPrivateFundRA is PrivateFundRA {
  using Counters for Counters.Counter;

  function mintHack(address _beneficiary, uint256 _amount, address _registry, uint256 _tokenId) external {
    _mint(_beneficiary, _amount);
    _cacheTokenOwner(_beneficiary, _registry, _tokenId);

    emit TokenMint(_registry, _tokenId);
  }

  function delegateHack(address _to, address _from, address _owner, uint256 _amount) external {
    _transfer(_to, _from, _owner, _amount);
  }

  function mintAllHack(
    address[] calldata _addresses,
    address[] calldata _registries,
    uint256[] calldata _tokenIds,
    uint256 _amount
  )
  external
  {
    for (uint256 i = 0; i < _addresses.length; i++) {
      _mint(_addresses[i], _amount);
      _cacheTokenOwner(_addresses[i], _registries[i], _tokenIds[i]);

      emit TokenMint(_registries[i], _tokenIds[i]);
    }
  }
}
