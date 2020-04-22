/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "@galtproject/libs/contracts/traits/Initializable.sol";
import "@galtproject/core/contracts/reputation/components/LiquidRA.sol";
import "@galtproject/private-property-registry/contracts/interfaces/IPPGlobalRegistry.sol";
import "@galtproject/private-property-registry/contracts/interfaces/IPPLockerRegistry.sol";
import "@galtproject/private-property-registry/contracts/interfaces/IPPTokenRegistry.sol";
import "@galtproject/private-property-registry/contracts/abstract/interfaces/IAbstractLocker.sol";
import "@galtproject/private-property-registry/contracts/abstract/interfaces/IAbstractToken.sol";


contract PPTokenInputRA is LiquidRA, Initializable {
  using SafeMath for uint256;
  IPPGlobalRegistry public globalRegistry;

  ArraySet.AddressSet internal _tokenOwners;

  // owner => tokenCount
  mapping(address => uint256) public ownerTokenCount;

  // registry => (tokenId => owners)
  mapping(address => mapping(uint256 => address[])) public tokenOwnersMinted;
  // registry => (tokenId => mintedAmount)
  mapping(address => mapping(uint256 => uint256)) public tokenReputationMinted;
  // owner => registry => (tokenId => mintedAmount)
  mapping(address => mapping(address => mapping(uint256 => uint256))) public ownerReputationMinted;

  function initializeInternal(IPPGlobalRegistry _globalRegistry) internal {
    globalRegistry = _globalRegistry;
  }

  // @dev Mints reputation for given token to the owner account
  function mintForOwners(
    IAbstractLocker _tokenLocker,
    address[] memory _owners
  )
    public
  {
    tokenLockerRegistry().requireValidLocker(address(_tokenLocker));

    uint256 ownersLen = _owners.length;
    if (ownersLen == 1) {
      require(
        msg.sender == _owners[0] || msg.sender == _tokenLocker.proposalManager() || msg.sender == address(_tokenLocker),
        "Not the owner, locker or proposalManager of locker"
      );
    } else {
      require(
        msg.sender == _tokenLocker.proposalManager() || msg.sender == address(_tokenLocker),
        "Not the locker or proposalManager of locker"
      );
    }

    uint256[] memory ownersReputation = new uint256[](ownersLen);
    for (uint256 i = 0; i < ownersLen; i++) {
      ownersReputation[i] = _tokenLocker.reputationOf(_owners[i]);
      require(ownersReputation[i] > 0, "Owner does not have reputation in locker");
    }

    address registry = address(_tokenLocker.tokenContract());
    uint256 tokenId = _tokenLocker.tokenId();

    require(tokenReputationMinted[registry][tokenId] == 0, "Reputation already minted");

    _setTokenOwnersReputation(_owners, ownersReputation, registry, tokenId);
  }

  function revokeBurnedTokenReputation(IAbstractLocker _tokenLocker) external {
    IAbstractToken tokenContract = _tokenLocker.tokenContract();
    uint256 tokenId = _tokenLocker.tokenId();

    require(tokenContract.exists(tokenId) == false, "Token still exists");
    _burnLockerOwnersReputation(_tokenLocker, tokenOwnersMinted[address(tokenContract)][tokenId]);
  }

  // Burn token total reputation
  // Owner should revoke all delegated reputation back to his account before performing this action
  function approveBurnForOwners(IAbstractLocker _tokenLocker, address[] memory _owners) public {
    if (_owners.length == 1) {
      require(
        msg.sender == _owners[0] || msg.sender == _tokenLocker.proposalManager() || msg.sender == address(_tokenLocker),
        "Not the owner, locker or proposalManager of locker"
      );
    } else {
      require(
        msg.sender == _tokenLocker.proposalManager() || msg.sender == address(_tokenLocker),
        "Not the locker or proposalManager of locker"
      );
    }

    _burnLockerOwnersReputation(_tokenLocker, _owners);
  }

  function _burnLockerOwnersReputation(IAbstractLocker _tokenLocker, address[] memory _burnOwners) internal {
    tokenLockerRegistry().requireValidLocker(address(_tokenLocker));

    (address[] memory allLockerOwners, , address registry, uint256 tokenId, , , ,) = _tokenLocker.getLockerInfo();

    require(tokenReputationMinted[registry][tokenId] > 0, "Reputation doesn't minted");

    uint256 totalReputationMinted = tokenReputationMinted[registry][tokenId];
    uint256 len = _burnOwners.length;
    for (uint256 i = 0; i < len; i++) {
      require(ownerReputationMinted[_burnOwners[i]][registry][tokenId] > 0, "Reputation doesn't minted for owner");
      _burn(_burnOwners[i], _burnOwners[i], ownerReputationMinted[_burnOwners[i]][registry][tokenId]);
      totalReputationMinted -= ownerReputationMinted[_burnOwners[i]][registry][tokenId];
      ownerReputationMinted[_burnOwners[i]][registry][tokenId] = 0;

      _cacheTokenDecrement(_burnOwners[i]);
    }

    tokenOwnersMinted[registry][tokenId] = new address[](0);

    uint256 allLockerOwnersLen = allLockerOwners.length;
    for (uint256 i = 0; i < allLockerOwnersLen; i++) {
      if (ownerReputationMinted[allLockerOwners[i]][registry][tokenId] > 0) {
        tokenOwnersMinted[registry][tokenId].push(allLockerOwners[i]);
      }
    }

    tokenReputationMinted[registry][tokenId] = totalReputationMinted;
  }

  function _setTokenOwnersReputation(
    address[] memory _owners,
    uint256[] memory _ownersReputation,
    address _registry,
    uint256 _tokenId
  )
    internal
  {
    uint256 totalReputationMinted = tokenReputationMinted[_registry][_tokenId];
    uint256 len = _owners.length;
    for (uint256 i = 0; i < len; i++) {
      require(ownerReputationMinted[_owners[i]][_registry][_tokenId] == 0, "Reputation already minted for owner");
      ownerReputationMinted[_owners[i]][_registry][_tokenId] = _ownersReputation[i];
      _mint(_owners[i], _ownersReputation[i]);

      totalReputationMinted += _ownersReputation[i];

      _tokenOwners.addSilent(_owners[i]);
      ownerTokenCount[_owners[i]] = ownerTokenCount[_owners[i]].add(1);

      tokenOwnersMinted[_registry][_tokenId].push(_owners[i]);
    }

    tokenReputationMinted[_registry][_tokenId] = totalReputationMinted;
  }

  function _cacheTokenDecrement(address _owner) internal {
    ownerTokenCount[_owner] = ownerTokenCount[_owner].sub(1);
    if (ownerTokenCount[_owner] == 0) {
      _tokenOwners.remove(_owner);
    }
  }

  function tokenLockerRegistry() internal view returns(IPPLockerRegistry) {
    return IPPLockerRegistry(globalRegistry.getPPLockerRegistryAddress());
  }

  function tokenOwners() public view returns (address[] memory) {
    return _tokenOwners.elements();
  }

  function tokenOwnersCount() public view returns (uint256) {
    return _tokenOwners.size();
  }

  function isMember(address _owner) public view returns (bool) {
    return _tokenOwners.has(_owner);
  }
}
