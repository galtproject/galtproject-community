/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;


contract DetailableFee {

  // "regular_erc20" or "regular_eth"
  bytes32 public feeType;
  string public title;
  string public description;
  string public dataLink;

  bool public detailsSet;

  constructor() public {

  }

  function setDetails(
    bytes32 _feeType,
    string memory _title,
    string memory _description,
    string memory _dataLink
  )
    public
  {
    require(!detailsSet, "Details already set");
    //TODO: maybe use ownable for restrict setDetails only for owners?

    feeType = _feeType;
    title = _title;
    description = _description;
    dataLink = _dataLink;

    detailsSet = true;
  }

  function getDetails() public view returns (
    bytes32 _feeType,
    string memory _title,
    string memory _description,
    string memory _dataLink
  )
  {

    return (
      feeType,
      title,
      description,
      dataLink
    );
  }
}
