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

contract AbstractDetailedFee {
  
  bytes32 public type;
  string public title;
  string public description;
  string public docLink;
  
  bool detailsSet;

  function setDetails(
    bytes32 _type,
    string _title,
    string _description,
    string _docLink
  ) public {
    require(!detailsSet, "Details already set");
    
    type = _type;
    title = _title;
    description = _description;
    docLink = _docLink;

    detailsSet = true;
  }

  function getDetails() public view returns (
    bytes32 _type,
    string _title,
    string _description,
    string _docLink
  ) {
    
    return (
      type,
      title,
      description,
      docLink
    );
  }
}
