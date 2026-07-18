// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Onchain mirror of the shared computeRepoId helper (for tests / optional verification).
library RepoId {
    function compute(string memory ownerSlashRepo) internal pure returns (bytes32) {
        bytes memory b = bytes(ownerSlashRepo);
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 65 && c <= 90) {
                b[i] = bytes1(c + 32); // A-Z -> a-z
            }
        }
        return keccak256(b);
    }
}
