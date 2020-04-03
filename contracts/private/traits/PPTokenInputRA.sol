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
import "@galtproject/private-property-registry/contracts/interfaces/IPPLocker.sol";


contract PPTokenInputRA is LiquidRA, Initializable {
  using SafeMath for uint256;
  IPPGlobalRegistry public globalRegistry;

  ArraySet.AddressSet internal _tokenOwners;

  // owner => tokenCount
  mapping(address => uint256) public ownerTokenCount;

  // registry => (tokenId => mintedAmount)
  mapping(address => mapping(uint256 => uint256)) public reputationMinted;

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
    require(msg.sender == owner || msg.sender == address(_tokenLocker), "Not owner of the locker or not locker");

    uint256 tokenId = _tokenLocker.tokenId();
    address registry = address(_tokenLocker.tokenContract());
    require(reputationMinted[registry][tokenId] == 0, "Reputation already minted");

    uint256 reputation = _tokenLocker.reputation();

    _cacheTokenOwner(owner, registry, tokenId, reputation);
    _mint(owner, reputation);
  }

  function revokeBurnedTokenReputation(IPPLocker _tokenLocker) external {

    tokenLockerRegistry().requireValidLocker(address(_tokenLocker));

    IPPToken tokenContract = _tokenLocker.tokenContract();
    uint256 tokenId = _tokenLocker.tokenId();
    address tokenContractAddress = address(tokenContract);

    require(tokenContract.exists(tokenId) == false, "Token still exists");
    require(reputationMinted[tokenContractAddress][tokenId] > 0, "Reputation doesn't minted");

    address owner = _tokenLocker.owner();

    _burn(owner, reputationMinted[tokenContractAddress][tokenId]);
    _cacheTokenDecrement(owner);

    reputationMinted[tokenContractAddress][tokenId] = 0;
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
    uint256 tokenId = _tokenLocker.tokenId();

    require(reputationMinted[registry][tokenId] > 0, "Reputation doesn't minted");

    _burn(owner, reputationMinted[registry][tokenId]);
    _cacheTokenDecrement(owner);

    reputationMinted[registry][tokenId] = 0;
  }

  function _cacheTokenOwner(address _owner, address _registry, uint256 _tokenId, uint256 _reputation) internal {
    _tokenOwners.addSilent(_owner);
    ownerTokenCount[_owner] = ownerTokenCount[_owner].add(1);
    reputationMinted[_registry][_tokenId] = _reputation;
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
