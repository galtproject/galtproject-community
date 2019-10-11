/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.10;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC721/IERC721.sol";
import "@galtproject/core/contracts/interfaces/ISpaceLocker.sol";

// This contract will be included into the current one
import "./ExtraMockFundRA.sol";


contract ExtraMockFundRAFactory is Ownable {
  function build(
    FundStorage fundStorage
  )
    external
    returns (ExtraMockFundRA)
  {
    ExtraMockFundRA fundRA = new ExtraMockFundRA();
    fundRA.initialize(fundStorage);

    return fundRA;
  }
}
