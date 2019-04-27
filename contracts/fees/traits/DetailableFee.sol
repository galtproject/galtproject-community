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

contract DetailableFee {

  // "regular_erc20" or "regular_eth"
  bytes32 public feeType;
  string public title;
  string public description;
  string public docLink;

  bool public detailsSet;

  constructor() public {
    
  }

  function setDetails(
    bytes32 _feeType,
    string memory _title,
    string memory _description,
    string memory _docLink
  ) 
    public 
  {
    require(!detailsSet, "Details already set");
    //TODO: maybe use ownable for restrict setDetails only for owners?

    feeType = _feeType;
    title = _title;
    description = _description;
    docLink = _docLink;

    detailsSet = true;
  }

  function getDetails() public view returns (
    bytes32 _feeType,
    string memory _title,
    string memory _description,
    string memory _docLink
  ) 
  {

    return (
      feeType,
      title,
      description,
      docLink
    );
  }
}
