// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {HackathonRegistry} from "./HackathonRegistry.sol";
import {NoCapRegistry} from "./NoCapRegistry.sol";

/// @title NoCapBadge
/// @notice Soulbound "Certified No Cap" NFT.
/// @dev Eligibility is an OPTIMISTIC claim over caller-supplied timestamps — publicly re-checkable
///      against chain logs, not independently re-derived from event history onchain.
///      claimBadge() is permissionless (anyone — including a hosted relayer — may trigger it
///      on a repo's behalf) but always mints to that repo's registered owner, never the caller,
///      so an automated claimer can never end up holding someone else's badge.
contract NoCapBadge is ERC721 {
    HackathonRegistry public immutable hackathonRegistry;
    NoCapRegistry public immutable projectRegistry;

    uint256 public nextTokenId = 1;
    uint256 public minAnchors = 3;
    uint256 public minSpanSeconds = 1 days;

    /// @dev repoId => hackathonId => claimed
    mapping(bytes32 => mapping(bytes32 => bool)) public claimed;
    mapping(uint256 => bytes32) public tokenRepoId;
    mapping(uint256 => bytes32) public tokenHackathonId;

    event BadgeClaimed(
        address indexed claimer,
        uint256 indexed tokenId,
        bytes32 indexed repoId,
        bytes32 hackathonId
    );

    constructor(address hackathonRegistry_, address projectRegistry_)
        ERC721("Certified No Cap", "NOCAP")
    {
        require(hackathonRegistry_ != address(0), "zero registry");
        require(projectRegistry_ != address(0), "zero registry");
        hackathonRegistry = HackathonRegistry(hackathonRegistry_);
        projectRegistry = NoCapRegistry(projectRegistry_);
    }

    /// @notice Optimistic eligibility: caller supplies timestamps; anyone can re-verify vs logs.
    function isEligible(
        bytes32, /* repoId */
        bytes32 hackathonId,
        uint256[] calldata anchorTimestamps
    ) public view returns (bool) {
        (uint256 startTime, uint256 endTime,, bool exists) = hackathonRegistry.getWindow(hackathonId);
        if (!exists) return false;
        if (anchorTimestamps.length < minAnchors) return false;

        uint256 first = anchorTimestamps[0];
        uint256 last = anchorTimestamps[0];
        for (uint256 i = 0; i < anchorTimestamps.length; i++) {
            uint256 t = anchorTimestamps[i];
            if (t < first) first = t;
            if (t > last) last = t;
        }

        if (first < startTime || first > endTime) return false;
        if (last < startTime || last > endTime) return false;
        if (last < first || (last - first) < minSpanSeconds) return false;
        return true;
    }

    /// @notice Claim the badge for a repo. Permissionless: anyone (a builder, a judge,
    ///         or the hosted relayer acting automatically once a repo becomes eligible)
    ///         may call this. The NFT always mints to repoOwner — never to msg.sender —
    ///         so triggering someone else's claim can never redirect their badge to you.
    function claimBadge(bytes32 repoId, bytes32 hackathonId, uint256[] calldata anchorTimestamps)
        external
        returns (uint256 tokenId)
    {
        require(!claimed[repoId][hackathonId], "already claimed");
        require(isEligible(repoId, hackathonId, anchorTimestamps), "not eligible");
        address owner = projectRegistry.repoOwner(repoId);
        require(owner != address(0), "repo not registered");

        claimed[repoId][hackathonId] = true;
        tokenId = nextTokenId++;
        tokenRepoId[tokenId] = repoId;
        tokenHackathonId[tokenId] = hackathonId;
        _mint(owner, tokenId);
        emit BadgeClaimed(owner, tokenId, repoId, hackathonId);
    }

    /// @dev Soulbound: block transfers after mint.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert("soulbound");
        }
        return super._update(to, tokenId, auth);
    }
}
