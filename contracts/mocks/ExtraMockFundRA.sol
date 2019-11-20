/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.10;

import "./MockFundRA.sol";


contract ExtraMockFundRA is MockFundRA {

  function mintAllAmounts(address[] calldata _addresses, uint256[] calldata _spaceTokens, uint256[] calldata _amounts) external {
    for (uint256 i = 0; i < _addresses.length; i++) {
      _mint(_addresses[i], _amounts[i]);
      _cacheSpaceTokenOwner(_addresses[i], _spaceTokens[i]);

      emit TokenMint(_spaceTokens[i]);
    }
  }
}
