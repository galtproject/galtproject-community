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

  // @dev Transfer owned reputation
  // PermissionED
  function delegate(address _to, address _owner, uint256 _amount) public {
    require(_tokenOwners.has(_to), "Beneficiary isn't a token owner");

    _transfer(msg.sender, _to, _owner, _amount);
  }

  // @dev Mints reputation for given token to the owner account
  function mint(
    IAbstractLocker _tokenLocker
  )
    public
  {
    tokenLockerRegistry().requireValidLocker(address(_tokenLocker));

    (
      address[] memory owners,
      uint256[] memory ownersReputation,
      address registry,
      uint256 tokenId,
      uint256 totalReputation,
      ,
      ,
    ) = _tokenLocker.getLockerInfo();

    require(tokenReputationMinted[registry][tokenId] == 0, "Reputation already minted");
    require(msg.sender == address(_tokenLocker), "Not owner of the locker or not locker");

    _setTokenOwnersReputation(owners, ownersReputation, registry, tokenId, totalReputation);
  }

  function revokeBurnedTokenReputation(IAbstractLocker _tokenLocker) external {
    IAbstractToken tokenContract = _tokenLocker.tokenContract();
    uint256 tokenId = _tokenLocker.tokenId();

    require(tokenContract.exists(tokenId) == false, "Token still exists");
    _burnLockerReputation(_tokenLocker);
  }

  // Burn token total reputation
  // Owner should revoke all delegated reputation back to his account before performing this action
  function approveBurn(
    IAbstractLocker _tokenLocker
  )
    public
  {
    require(msg.sender == address(_tokenLocker), "Not owner of the locker or not locker");
    _burnLockerReputation(_tokenLocker);
  }

  function _burnLockerReputation(IAbstractLocker _tokenLocker) internal {
    tokenLockerRegistry().requireValidLocker(address(_tokenLocker));

    address registry = address(_tokenLocker.tokenContract());
    uint256 tokenId = _tokenLocker.tokenId();

    require(tokenReputationMinted[registry][tokenId] > 0, "Reputation doesn't minted");

    address[] storage owners = tokenOwnersMinted[registry][tokenId];

    uint256 len = owners.length;
    for (uint256 i = 0; i < len; i++) {
      _burn(owners[i], owners[i], ownerReputationMinted[owners[i]][registry][tokenId]);
      ownerReputationMinted[owners[i]][registry][tokenId] = 0;

      _cacheTokenDecrement(owners[i]);
    }

    tokenOwnersMinted[registry][tokenId] = new address[](0);
    tokenReputationMinted[registry][tokenId] = 0;
  }

  function _setTokenOwnersReputation(
    address[] memory owners,
    uint256[] memory ownersReputation,
    address _registry,
    uint256 _tokenId,
    uint256 _totalReputation
  )
    internal
  {
    tokenOwnersMinted[_registry][_tokenId] = owners;
    tokenReputationMinted[_registry][_tokenId] = _totalReputation;

    uint256 len = owners.length;
    for (uint256 i = 0; i < len; i++) {
      ownerReputationMinted[owners[i]][_registry][_tokenId] = ownersReputation[i];
      _mint(owners[i], ownersReputation[i]);

      _tokenOwners.addSilent(owners[i]);
      ownerTokenCount[owners[i]] = ownerTokenCount[owners[i]].add(1);
    }
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
