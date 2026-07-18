// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title NoCapRegistry
/// @notice Event-driven build provenance registry. Only hashes and short labels go onchain.
/// @dev Anchors prove "this repo's attester said this commit SHA existed at this block time."
contract NoCapRegistry {
    event ProjectRegistered(
        address indexed builder,
        bytes32 indexed repoId,
        bytes32 indexed hackathonId,
        string repoUrl,
        uint256 registeredAt
    );
    event ContributorAdded(bytes32 indexed repoId, address indexed contributor);
    event Anchored(
        address indexed builder,
        bytes32 indexed repoId,
        bytes32 commitHash,
        string label,
        uint256 timestamp
    );
    event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer);
    event RelayerEnabledForRepo(bytes32 indexed repoId, bool enabled);

    mapping(bytes32 => address) public repoOwner;
    mapping(bytes32 => mapping(address => bool)) public isContributor;
    mapping(bytes32 => bytes32) public repoHackathon;
    mapping(bytes32 => string) public repoUrlOf;

    /// @dev Repos that opted into hosted auto-anchoring at registration time. Scoped
    ///      per-repo on purpose: a compromised relayer key can only touch repos that
    ///      explicitly opted in, never every project on the registry.
    mapping(bytes32 => bool) public relayerEnabled;

    address public admin;
    /// @notice Current hosted-relayer address. Checked dynamically in anchor(), so
    ///         rotating it (setRelayer) re-authorizes every opted-in repo in one
    ///         transaction instead of re-adding the new key project by project.
    address public relayer;

    constructor(address relayer_) {
        admin = msg.sender;
        relayer = relayer_;
    }

    /// @notice Register a project. First-registrant-wins ownership.
    /// @param repoId keccak256(bytes(lowercase("owner/repo"))) — compute offchain via shared helper
    /// @param repoUrl Human-readable GitHub URL for explorers/UI
    /// @param hackathonId Optional association for discovery (bytes32(0) if none)
    function registerProject(bytes32 repoId, string calldata repoUrl, bytes32 hackathonId) external {
        require(repoOwner[repoId] == address(0), "already registered");
        repoOwner[repoId] = msg.sender;
        isContributor[repoId][msg.sender] = true;
        repoHackathon[repoId] = hackathonId;
        repoUrlOf[repoId] = repoUrl;
        emit ProjectRegistered(msg.sender, repoId, hackathonId, repoUrl, block.timestamp);
    }

    /// @notice Register + opt into hosted auto-anchoring in one signature.
    /// @dev Equivalent to registerProject() + setRelayerEnabled(repoId, true).
    function registerAndAuthorize(bytes32 repoId, string calldata repoUrl, bytes32 hackathonId)
        external
    {
        require(repoOwner[repoId] == address(0), "already registered");
        repoOwner[repoId] = msg.sender;
        isContributor[repoId][msg.sender] = true;
        repoHackathon[repoId] = hackathonId;
        repoUrlOf[repoId] = repoUrl;
        relayerEnabled[repoId] = true;
        emit ProjectRegistered(msg.sender, repoId, hackathonId, repoUrl, block.timestamp);
        emit RelayerEnabledForRepo(repoId, true);
    }

    function addContributor(bytes32 repoId, address contributor) external {
        require(msg.sender == repoOwner[repoId], "not owner");
        require(contributor != address(0), "zero address");
        isContributor[repoId][contributor] = true;
        emit ContributorAdded(repoId, contributor);
    }

    /// @notice Opt an already-registered project into (or out of) hosted auto-anchoring.
    function setRelayerEnabled(bytes32 repoId, bool enabled) external {
        require(msg.sender == repoOwner[repoId], "not owner");
        relayerEnabled[repoId] = enabled;
        emit RelayerEnabledForRepo(repoId, enabled);
    }

    /// @notice Rotate the hosted relayer address. Takes effect immediately for every
    ///         repo with relayerEnabled=true — no per-project migration needed.
    function setRelayer(address newRelayer) external {
        require(msg.sender == admin, "not admin");
        require(newRelayer != address(0), "zero address");
        emit RelayerUpdated(relayer, newRelayer);
        relayer = newRelayer;
    }

    /// @notice Permissionless for contributors (or the opted-in relayer) only.
    function anchor(bytes32 repoId, bytes32 commitHash, string calldata label) external {
        require(
            isContributor[repoId][msg.sender] ||
                (relayerEnabled[repoId] && msg.sender == relayer),
            "not authorized for this project"
        );
        emit Anchored(msg.sender, repoId, commitHash, label, block.timestamp);
    }
}
