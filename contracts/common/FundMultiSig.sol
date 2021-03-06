/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@galtproject/multisig/contracts/MultiSigWallet.sol";
import "@galtproject/libs/contracts/traits/Initializable.sol";
import "../abstract/interfaces/IAbstractFundStorage.sol";
import "./interfaces/IFundRegistry.sol";


contract FundMultiSig is MultiSigWallet, Initializable {

  uint256 public constant VERSION = 1;

  event NewOwnerSet(uint256 required, uint256 total);

  bytes32 public constant ROLE_OWNER_MANAGER = bytes32("owner_manager");
  address public constant ETH_CONTRACT_ADDRESS = address(1);

  IFundRegistry public fundRegistry;

  constructor(
    address[] memory _owners
  )
    public
    // WARNING: the implementation won't use this constructor data anyway
    MultiSigWallet(_owners, 1)
  {
  }

  function initialize(
    address[] calldata _owners,
    uint256 _required,
    address _fundRegistry
  )
    external
    isInitializer
    validRequirement(_owners.length, _required)
  {
    // solium-disable-next-line operator-whitespace
    for (uint i=0; i<_owners.length; i++) {
      // solium-disable-next-line error-reason
      require(!isOwner[_owners[i]] && _owners[i] != address(0));
      isOwner[_owners[i]] = true;
    }
    owners = _owners;
    required = _required;
    fundRegistry = IFundRegistry(_fundRegistry);
  }

  modifier forbidden() {
    assert(false);
    _;
  }

  modifier onlyRole(bytes32 _role) {
    require(fundRegistry.getACL().hasRole(msg.sender, _role), "Invalid role");

    _;
  }

  function addOwner(address owner) public forbidden {}
  function removeOwner(address owner) public forbidden {}
  function replaceOwner(address owner, address newOwner) public forbidden {}
  function changeRequirement(uint _required) public forbidden {}

  function setOwners(address[] calldata _newOwners, uint256 _required) external onlyRole(ROLE_OWNER_MANAGER) {
    require(_required <= _newOwners.length, "Required too big");
    require(_required > 0, "Required too low");
    require(_fundStorage().areMembersValid(_newOwners), "Not all members are valid");

    for (uint i = 0; i < owners.length; i++) {
      isOwner[owners[i]] = false;
    }
    for (uint i = 0; i < _newOwners.length; i++) {
      isOwner[_newOwners[i]] = true;
    }

    owners = _newOwners;
    required = _required;

    emit NewOwnerSet(required, _newOwners.length);
  }

  // call has been separated into its own function in order to take advantage
  // of the Solidity's code generator to produce a loop that copies tx.data into memory.
  // solium-disable-next-line mixedcase
  function external_call(address destination, uint value, uint dataLength, bytes memory data) internal returns (bool) {
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
      _fundStorage().handleMultiSigTransaction(ETH_CONTRACT_ADDRESS, _value);
    }

    (bool active,) = _fundStorage().periodLimits(_destination);

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

      _fundStorage().handleMultiSigTransaction(_destination, erc20Value);
    }
  }

  function _fundStorage() internal view returns (IAbstractFundStorage) {
    return IAbstractFundStorage(fundRegistry.getStorageAddress());
  }
}
