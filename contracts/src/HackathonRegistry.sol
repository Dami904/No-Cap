// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HackathonRegistry
/// @notice Reusable time windows for NoCap eligibility checks.
/// @dev Permissionless hosting: first wallet to seed a hackathonId becomes its organizer
///      (first-registrant-wins, mirroring NoCapRegistry's repo ownership). Only that
///      organizer can update the window afterwards.
contract HackathonRegistry {
    struct Window {
        uint256 startTime;
        uint256 endTime;
        string name;
        bool exists;
    }

    mapping(bytes32 => Window) public windows;
    mapping(bytes32 => address) public organizerOf;

    event WindowRegistered(
        bytes32 indexed hackathonId,
        address indexed organizer,
        string name,
        uint256 startTime,
        uint256 endTime
    );

    function registerWindow(
        bytes32 hackathonId,
        string calldata name,
        uint256 startTime,
        uint256 endTime
    ) external {
        require(endTime > startTime, "invalid window");
        address organizer = organizerOf[hackathonId];
        require(organizer == address(0) || organizer == msg.sender, "not organizer");
        if (organizer == address(0)) {
            organizerOf[hackathonId] = msg.sender;
        }
        windows[hackathonId] = Window(startTime, endTime, name, true);
        emit WindowRegistered(hackathonId, msg.sender, name, startTime, endTime);
    }

    function getWindow(bytes32 hackathonId)
        external
        view
        returns (uint256 startTime, uint256 endTime, string memory name, bool exists)
    {
        Window storage w = windows[hackathonId];
        return (w.startTime, w.endTime, w.name, w.exists);
    }
}
