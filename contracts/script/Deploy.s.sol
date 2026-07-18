// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {NoCapRegistry} from "../src/NoCapRegistry.sol";
import {HackathonRegistry} from "../src/HackathonRegistry.sol";
import {NoCapBadge} from "../src/NoCapBadge.sol";

/// @notice Deploys full NoCap stack and seeds Spark window.
contract Deploy is Script {
    // Spark 2026 — re-verify against hackathon page before submission
    uint256 constant SPARK_START = 1_783_947_600; // 2026-07-13 13:00 UTC
    uint256 constant SPARK_END = 1_784_505_599; // 2026-07-19 23:59:59 UTC

    /// @dev Hosted relayer address — set NOCAP_RELAYER_ADDRESS env var before running.
    ///      A zero relayer is allowed (opt-in hosted anchoring stays dormant until
    ///      setRelayer() is called later), so this never blocks a bare deploy.
    function run() external {
        bytes32 sparkId = keccak256("spark-2026");
        address relayer = vm.envOr("NOCAP_RELAYER_ADDRESS", address(0));

        vm.startBroadcast();

        NoCapRegistry registry = new NoCapRegistry(relayer);
        HackathonRegistry windows = new HackathonRegistry();
        NoCapBadge badge = new NoCapBadge(address(windows), address(registry));

        windows.registerWindow(sparkId, "Monad Spark 2026", SPARK_START, SPARK_END);

        vm.stopBroadcast();

        console2.log("NoCapRegistry:", address(registry));
        console2.log("HackathonRegistry:", address(windows));
        console2.log("NoCapBadge:", address(badge));
        console2.log("Relayer:", relayer);
        console2.logBytes32(sparkId);
    }
}
