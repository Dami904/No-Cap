// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {NoCapRegistry} from "../src/NoCapRegistry.sol";
import {NoCapBadge} from "../src/NoCapBadge.sol";

/// @notice Redeploys NoCapRegistry (relayer support) + NoCapBadge (mints to repoOwner,
///         not caller). HackathonRegistry is untouched — it already holds real windows
///         seeded by other organizers and must not be redeployed.
contract RedeployRegistry is Script {
    function run() external {
        address existingHackathonRegistry = vm.envAddress("NOCAP_HACKATHON_REGISTRY");
        address relayer = vm.envOr("NOCAP_RELAYER_ADDRESS", address(0));

        vm.startBroadcast();

        NoCapRegistry registry = new NoCapRegistry(relayer);
        NoCapBadge badge = new NoCapBadge(existingHackathonRegistry, address(registry));

        vm.stopBroadcast();

        console2.log("NoCapRegistry:", address(registry));
        console2.log("NoCapBadge:", address(badge));
        console2.log("Relayer:", relayer);
        console2.log("HackathonRegistry (unchanged):", existingHackathonRegistry);
    }
}
