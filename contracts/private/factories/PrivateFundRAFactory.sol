/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "../PrivateFundStorage.sol";

// This contract will be included into the current one
import "../PrivateFundRA.sol";


contract PrivateFundRAFactory is Ownable {
  function build(
    PrivateFundStorage fundStorage
  )
    external
    returns (PrivateFundRA)
  {
    PrivateFundRA fundRA = new PrivateFundRA();
    fundRA.initialize(fundStorage);

    return fundRA;
  }
}
