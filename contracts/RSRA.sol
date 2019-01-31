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

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC721/IERC721.sol";
import "@galtproject/core/contracts/LiquidReputationAccounting.sol";
import "@galtproject/core/contracts/registries/interfaces/ISpaceLockerRegistry.sol";
import "./FundStorage.sol";
import "./interfaces/IRSRA.sol";


contract RSRA is IRSRA, LiquidReputationAccounting {
  using SafeMath for uint256;
  using ArraySet for ArraySet.AddressSet;

  FundStorage public fundStorage;

  mapping(uint256 => bool) internal _tokensToExpel;

  constructor(
    IERC721 _spaceToken,
    ISpaceLockerRegistry _spaceLockerRegistry,
    FundStorage _fundStorage
  )
    public
    LiquidReputationAccounting(_spaceToken, _spaceLockerRegistry)
  {
    fundStorage = _fundStorage;
  }

  function mint(
    ISpaceLocker _spaceLocker
  )
    public
  {
    uint256 spaceTokenId = _spaceLocker.spaceTokenId();
    require(fundStorage.isMintApproved(spaceTokenId), "No mint permissions");
    super.mint(_spaceLocker);
  }

  function approveBurn(
    ISpaceLocker _spaceLocker
  )
    public
  {
    require(fundStorage.getFineAmount(_spaceLocker.spaceTokenId()) == 0, "There are pending fines");
    super.approveBurn(_spaceLocker);
  }

  function burnExpelled(uint256 _spaceTokenId, address _delegate, address _owner, uint256 _amount) external {
    bool completelyBurned = fundStorage.decrementExpelledTokenReputation(_spaceTokenId, _amount);

    _debitAccount(_delegate, _owner, _amount);

    if (completelyBurned) {
      reputationMinted[_spaceTokenId] = false;
    }
  }

  // GETTERS

  function getShare(address[] calldata _addresses) external view returns (uint256) {
    uint256 aggregator = 0;

    for (uint256 i = 0; i < _addresses.length; i++) {
      aggregator += balanceOf(_addresses[i]);
    }

    return aggregator * 100 / totalSupply();
  }
}
