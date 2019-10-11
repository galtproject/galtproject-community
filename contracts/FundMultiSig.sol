/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

import "@galtproject/libs/contracts/traits/Permissionable.sol";
import "@galtproject/multisig/contracts/MultiSigWallet.sol";
import "./FundStorage.sol";


contract FundMultiSig is MultiSigWallet, Permissionable {
  event NewOwnerSet(uint256 required, uint256 total);

  string public constant ROLE_OWNER_MANAGER = "owner_manager";
  address public constant ETH_CONTRACT_ADDRESS = address(1);

  FundStorage fundStorage;


  constructor(
    address[] memory _initialOwners,
    uint256 _required,
    FundStorage _fundStorage
  )
    public
    MultiSigWallet(_initialOwners, _required)
  {
    fundStorage = _fundStorage;
  }

  modifier forbidden() {
    assert(false);
    _;
  }

  function addOwner(address owner) public forbidden {}
  function removeOwner(address owner) public forbidden {}
  function replaceOwner(address owner, address newOwner) public forbidden {}
  function changeRequirement(uint _required) public forbidden {}

  function setOwners(address[] calldata _newOwners, uint256 _required) external onlyRole(ROLE_OWNER_MANAGER) {
    require(_required <= _newOwners.length, "Required too big");
    require(_required > 0, "Required too low");
    require(fundStorage.areMembersValid(_newOwners), "Not all members are valid");

    owners = _newOwners;
    required = _required;

    emit NewOwnerSet(required, _newOwners.length);
  }

  // call has been separated into its own function in order to take advantage
  // of the Solidity's code generator to produce a loop that copies tx.data into memory.
  function external_call(address destination, uint value, uint dataLength, bytes memory data) private returns (bool) {
    beforeTransactionHook(destination, value, dataLength, data);

    bool result;
    assembly {
        let x := mload(0x40)   // "Allocate" memory for output (0x40 is where "free memory" pointer is stored by convention)
        let d := add(data, 32) // First 32 bytes are the padded length of data, so exclude that
        result := call(
            sub(gas, 34710),   // 34710 is the value that solidity is currently emitting
                               // It includes callGas (700) + callVeryLow (3, to pay for SUB) + callValueTransferGas (9000) +
                               // callNewAccountGas (25000, in case the destination address does not exist and needs creating)
            destination,
            value,
            d,
            dataLength,        // Size of the input (in bytes) - this is what fixes the padding problem
            x,
            0                  // Output is ignored, therefore the output size is zero
        )
    }
    return result;
  }

  function beforeTransactionHook(address _destination, uint _value, uint _dataLength, bytes memory _data) private {
    if (_value > 0) {
      fundStorage.handleMultiSigTransaction(ETH_CONTRACT_ADDRESS, _value);
    }

    (bool active,) = fundStorage.getPeriodLimit(_destination);

    // If a withdrawal limit exists for this t_destination
    if (active) {
      uint256 erc20Value;

      assembly {
        let code := mload(add(_data, 0x20))
        code := and(code, 0xffffffff00000000000000000000000000000000000000000000000000000000)

        switch code
        // transfer(address,uint256)
        case 0xa9059cbb00000000000000000000000000000000000000000000000000000000 {
          erc20Value := mload(add(_data, 0x44))
        }
        default {
          // Methods other than transfer are prohibited for ERC20 contracts
          revert(0, 0)
        }
      }

      if (erc20Value == 0) {
        return;
      }

      fundStorage.handleMultiSigTransaction(_destination, erc20Value);
    }
  }
}
