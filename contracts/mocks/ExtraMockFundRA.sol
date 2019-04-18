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

pragma solidity ^0.5.3;

import "./MockFundRA.sol";

contract ExtraMockFundRA is MockFundRA {

  constructor(FundStorage _fundStorage) public MockFundRA(_fundStorage) { }

  function mintAllAmounts(address[] calldata _addresses, uint256[] calldata _spaceTokens, uint256[] calldata _amounts) external {
    for (uint256 i = 0; i < _addresses.length; i++) {
      _mint(_addresses[i], _amounts[i]);
      _cacheSpaceTokenOwner(_addresses[i], _spaceTokens[i]);
    }
  }
}
