// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NoCapRegistry} from "../src/NoCapRegistry.sol";
import {HackathonRegistry} from "../src/HackathonRegistry.sol";
import {NoCapBadge} from "../src/NoCapBadge.sol";
import {RepoId} from "../src/RepoId.sol";

contract NoCapTest is Test {
    NoCapRegistry internal registry;
    HackathonRegistry internal windows;
    NoCapBadge internal badge;

    address internal owner = address(0xA11CE);
    address internal contributor = address(0xB0B);
    address internal stranger = address(0xBAD);
    address internal relayer = address(0xBEEF);
    address internal deployer = address(this);

    bytes32 internal repoId;
    bytes32 internal sparkId = keccak256("spark-2026");

    // Spark window from plan (verify before mainnet-style deploy)
    uint256 internal constant START = 1_783_947_600; // 2026-07-13 13:00 UTC
    uint256 internal constant END = 1_784_505_599; // 2026-07-19 23:59:59 UTC

    function setUp() public {
        registry = new NoCapRegistry(relayer);
        windows = new HackathonRegistry();
        badge = new NoCapBadge(address(windows), address(registry));
        repoId = RepoId.compute("nocap/demo");
        windows.registerWindow(sparkId, "Monad Spark", START, END);
    }

    function test_registerAndAnchor() public {
        vm.prank(owner);
        registry.registerProject(repoId, "https://github.com/nocap/demo", sparkId);
        assertEq(registry.repoOwner(repoId), owner);
        assertTrue(registry.isContributor(repoId, owner));

        vm.prank(owner);
        vm.expectEmit(true, true, false, true);
        emit NoCapRegistry.Anchored(owner, repoId, bytes32(uint256(1)), "abc123 feat", block.timestamp);
        registry.anchor(repoId, bytes32(uint256(1)), "abc123 feat");
    }

    function test_anchorRevertsForNonContributor() public {
        vm.prank(owner);
        registry.registerProject(repoId, "https://github.com/nocap/demo", sparkId);

        vm.prank(stranger);
        vm.expectRevert("not authorized for this project");
        registry.anchor(repoId, bytes32(uint256(1)), "nope");
    }

    function test_doubleRegisterReverts() public {
        vm.prank(owner);
        registry.registerProject(repoId, "https://github.com/nocap/demo", sparkId);

        vm.prank(stranger);
        vm.expectRevert("already registered");
        registry.registerProject(repoId, "https://github.com/nocap/demo", sparkId);
    }

    function test_addContributorRevertsIfNotOwner() public {
        vm.prank(owner);
        registry.registerProject(repoId, "https://github.com/nocap/demo", sparkId);

        vm.prank(stranger);
        vm.expectRevert("not owner");
        registry.addContributor(repoId, contributor);
    }

    function test_addContributorAndAnchor() public {
        vm.prank(owner);
        registry.registerProject(repoId, "https://github.com/nocap/demo", sparkId);

        vm.prank(owner);
        registry.addContributor(repoId, contributor);

        vm.prank(contributor);
        registry.anchor(repoId, bytes32(uint256(42)), "deadbeef ship it");
    }

    function test_multipleAnchorsAccumulateViaEvents() public {
        vm.prank(owner);
        registry.registerProject(repoId, "https://github.com/nocap/demo", sparkId);

        vm.startPrank(owner);
        registry.anchor(repoId, bytes32(uint256(1)), "one");
        registry.anchor(repoId, bytes32(uint256(2)), "two");
        registry.anchor(repoId, bytes32(uint256(3)), "three");
        vm.stopPrank();
    }

    function test_isEligibleValid() public {
        uint256[] memory ts = new uint256[](3);
        ts[0] = START + 1 hours;
        ts[1] = START + 2 days;
        ts[2] = START + 3 days;
        assertTrue(badge.isEligible(repoId, sparkId, ts));
    }

    function test_isEligibleFalseWhenOutsideWindow() public {
        uint256[] memory ts = new uint256[](3);
        ts[0] = START - 1 days;
        ts[1] = START + 1 days;
        ts[2] = START + 2 days;
        assertFalse(badge.isEligible(repoId, sparkId, ts));
    }

    function test_badgeMintsToRepoOwnerNotCaller() public {
        vm.prank(owner);
        registry.registerProject(repoId, "https://github.com/nocap/demo", sparkId);

        uint256[] memory ts = new uint256[](3);
        ts[0] = START + 1 hours;
        ts[1] = START + 2 days;
        ts[2] = START + 3 days;

        // A third party (e.g. the hosted relayer, or anyone) triggers the claim —
        // the badge must land with the repo's owner, never the caller.
        vm.prank(stranger);
        uint256 tokenId = badge.claimBadge(repoId, sparkId, ts);
        assertEq(badge.ownerOf(tokenId), owner);
        assertNotEq(badge.ownerOf(tokenId), stranger);
    }

    function test_badgeTransferRevertsSoulbound() public {
        vm.prank(owner);
        registry.registerProject(repoId, "https://github.com/nocap/demo", sparkId);

        uint256[] memory ts = new uint256[](3);
        ts[0] = START + 1 hours;
        ts[1] = START + 2 days;
        ts[2] = START + 3 days;

        vm.prank(owner);
        uint256 tokenId = badge.claimBadge(repoId, sparkId, ts);

        vm.prank(owner);
        vm.expectRevert("soulbound");
        badge.transferFrom(owner, stranger, tokenId);
    }

    function test_repoIdLowercases() public {
        assertEq(RepoId.compute("NoCap/Demo"), RepoId.compute("nocap/demo"));
    }

    function test_registerAndAuthorizeOneShot() public {
        vm.prank(owner);
        registry.registerAndAuthorize(repoId, "https://github.com/nocap/demo", sparkId);

        assertEq(registry.repoOwner(repoId), owner);
        assertTrue(registry.isContributor(repoId, owner));
        assertTrue(registry.relayerEnabled(repoId));

        vm.prank(relayer);
        registry.anchor(repoId, bytes32(uint256(7)), "auto-anchored");
    }

    function test_registerAndAuthorizeRevertsOnDoubleRegister() public {
        vm.prank(owner);
        registry.registerAndAuthorize(repoId, "https://github.com/nocap/demo", sparkId);

        vm.prank(stranger);
        vm.expectRevert("already registered");
        registry.registerAndAuthorize(repoId, "https://github.com/nocap/demo", sparkId);
    }

    function test_relayerCannotAnchorRepoThatDidNotOptIn() public {
        vm.prank(owner);
        registry.registerProject(repoId, "https://github.com/nocap/demo", sparkId);

        // plain registerProject() never opted this repo into hosted anchoring
        vm.prank(relayer);
        vm.expectRevert("not authorized for this project");
        registry.anchor(repoId, bytes32(uint256(1)), "should fail");
    }

    function test_ownerCanToggleRelayerAfterTheFact() public {
        vm.prank(owner);
        registry.registerProject(repoId, "https://github.com/nocap/demo", sparkId);

        vm.prank(owner);
        registry.setRelayerEnabled(repoId, true);

        vm.prank(relayer);
        registry.anchor(repoId, bytes32(uint256(1)), "now allowed");

        vm.prank(owner);
        registry.setRelayerEnabled(repoId, false);

        vm.prank(relayer);
        vm.expectRevert("not authorized for this project");
        registry.anchor(repoId, bytes32(uint256(2)), "revoked");
    }

    function test_rotatingRelayerReauthorizesAllOptedInReposInOneTx() public {
        bytes32 repoId2 = RepoId.compute("nocap/second");
        vm.prank(owner);
        registry.registerAndAuthorize(repoId, "https://github.com/nocap/demo", sparkId);
        vm.prank(contributor);
        registry.registerAndAuthorize(repoId2, "https://github.com/nocap/second", sparkId);

        address newRelayer = address(0xCAFE);
        registry.setRelayer(newRelayer); // one admin tx

        vm.prank(newRelayer);
        registry.anchor(repoId, bytes32(uint256(1)), "via new relayer");
        vm.prank(newRelayer);
        registry.anchor(repoId2, bytes32(uint256(2)), "via new relayer");

        // old relayer key is now dead on both repos, no per-repo cleanup needed
        vm.prank(relayer);
        vm.expectRevert("not authorized for this project");
        registry.anchor(repoId, bytes32(uint256(3)), "stale key");
    }

    function test_setRelayerRevertsForNonAdmin() public {
        vm.prank(stranger);
        vm.expectRevert("not admin");
        registry.setRelayer(address(0xCAFE));
    }

    function test_anyoneCanSeedNewWindow() public {
        bytes32 otherId = keccak256("eth-denver-2027");
        vm.prank(stranger);
        windows.registerWindow(otherId, "ETH Denver 2027", START, END);
        assertEq(windows.organizerOf(otherId), stranger);
        (,, string memory name, bool exists) = windows.getWindow(otherId);
        assertTrue(exists);
        assertEq(name, "ETH Denver 2027");
    }

    function test_onlyOrganizerCanUpdateWindow() public {
        // sparkId was seeded by this test contract in setUp — a stranger can't overwrite it
        vm.prank(stranger);
        vm.expectRevert("not organizer");
        windows.registerWindow(sparkId, "hijacked", START, END);

        // but the original organizer can update their own window
        windows.registerWindow(sparkId, "Monad Spark (updated)", START, END + 1 days);
        (, uint256 endTime, string memory name,) = windows.getWindow(sparkId);
        assertEq(name, "Monad Spark (updated)");
        assertEq(endTime, END + 1 days);
    }
}
