/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;

import "openzeppelin-solidity/contracts/token/ERC721/IERC721.sol";
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "@galtproject/libs/contracts/traits/Initializable.sol";
import "@galtproject/core/contracts/reputation/components/LiquidRA.sol";
import "@galtproject/private-property-registry/contracts/interfaces/IPPGlobalRegistry.sol";
import "@galtproject/private-property-registry/contracts/interfaces/IPPLockerRegistry.sol";
import "@galtproject/private-property-registry/contracts/interfaces/IPPTokenRegistry.sol";
import "@galtproject/private-property-registry/contracts/interfaces/IPPLocker.sol";


contract PPTokenInputRA is LiquidRA, Initializable {
  IPPGlobalRegistry public globalRegistry;

  ArraySet.AddressSet internal _tokenOwners;

  mapping(address => ArraySet.Uint256Set) internal _tokenByOwner;

  // registry => (tokenId => isMinted)
  mapping(address => mapping(uint256 => bool)) public reputationMinted;

  modifier onlyTokenOwner(address _registry, uint256 _tokenId, IPPLocker _tokenLocker) {
    IPPTokenRegistry(globalRegistry.getPPTokenRegistryAddress()).requireValidToken(_registry);
    require(address(_tokenLocker) == IERC721(_registry).ownerOf(_tokenId), "Invalid sender. Token owner expected.");
    require(msg.sender == _tokenLocker.owner(), "Not PPLocker owner");
    tokenLockerRegistry().requireValidLocker(address(_tokenLocker));
    _;
  }

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
    IPPLocker _tokenLocker
  )
    public
  {
    tokenLockerRegistry().requireValidLocker(address(_tokenLocker));

    address owner = _tokenLocker.owner();
    require(msg.sender == owner, "Not owner of the locker");

    uint256 tokenId = _tokenLocker.tokenId();
    address registry = address(_tokenLocker.tokenContract());
    require(reputationMinted[registry][tokenId] == false, "Reputation already minted");

    uint256 reputation = _tokenLocker.reputation();

    _cacheTokenOwner(owner, registry, tokenId);
    _mint(owner, reputation);
  }

  // Burn token total reputation
  // Owner should revoke all delegated reputation back to his account before performing this action
  function approveBurn(
    IPPLocker _tokenLocker
  )
    public
  {
    tokenLockerRegistry().requireValidLocker(address(_tokenLocker));

    address owner = _tokenLocker.owner();

    require(msg.sender == owner, "Not owner of the locker");

    address registry = address(_tokenLocker.tokenContract());
    uint256 reputation = _tokenLocker.reputation();
    uint256 tokenId = _tokenLocker.tokenId();

    require(reputationMinted[registry][tokenId] == true, "Reputation doesn't minted");

    _burn(owner, reputation);

    _tokenByOwner[owner].remove(tokenId);
    if (_tokenByOwner[owner].size() == 0) {
      _tokenOwners.remove(owner);
    }

    reputationMinted[registry][tokenId] = false;
  }

  function _cacheTokenOwner(address _owner, address _registry, uint256 _tokenId) internal {
    _tokenByOwner[_owner].add(_tokenId);
    _tokenOwners.addSilent(_owner);
    reputationMinted[_registry][_tokenId] = true;
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

  function ownerHasToken(address _owner, uint256 _tokenId) public view returns (bool) {
    return _tokenByOwner[_owner].has(_tokenId);
  }

  function tokensByOwner(address _owner) public view returns (uint256[] memory) {
    return _tokenByOwner[_owner].elements();
  }

  function tokensByOwnerCount(address _owner) public view returns (uint256) {
    return _tokenByOwner[_owner].size();
  }
}
