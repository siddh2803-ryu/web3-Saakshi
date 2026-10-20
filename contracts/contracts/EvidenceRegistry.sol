// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title EvidenceRegistry
 * @notice Anchors Merkle roots of canonical web evidence manifests captured by Saakshi.
 * Compatible with OpenZeppelin StandardMerkleTree (JS) leaf encoding ["bytes32"].
 */
contract EvidenceRegistry is AccessControl {
    bytes32 public constant ANCHOR_ROLE = keccak256("ANCHOR_ROLE");

    struct Batch {
        uint64 anchoredAt;
        uint32 size;
        string cid;
    }

    mapping(bytes32 => Batch) public batches;

    event Anchored(bytes32 indexed root, uint32 size, string cid, uint64 anchoredAt);
    event Custody(bytes32 indexed evidenceId, bytes32 actionHash, uint8 action, uint64 at);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ANCHOR_ROLE, admin);
    }

    function anchorRoot(bytes32 root, uint32 size, string calldata cid) external onlyRole(ANCHOR_ROLE) {
        require(root != bytes32(0), "empty root");
        require(batches[root].anchoredAt == 0, "already anchored");
        batches[root] = Batch(uint64(block.timestamp), size, cid);
        emit Anchored(root, size, cid, uint64(block.timestamp));
    }

    function logCustody(bytes32 evidenceId, bytes32 actionHash, uint8 action) external onlyRole(ANCHOR_ROLE) {
        emit Custody(evidenceId, actionHash, action, uint64(block.timestamp));
    }

    // Leaf hashing matches OpenZeppelin's StandardMerkleTree (JS) with encoding ["bytes32"].
    function verify(bytes32 manifestHash, bytes32[] calldata proof, bytes32 root)
        external
        view
        returns (bool ok, uint64 anchoredAt)
    {
        anchoredAt = batches[root].anchoredAt;
        if (anchoredAt == 0) return (false, 0);
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(manifestHash))));
        ok = MerkleProof.verify(proof, root, leaf);
    }
}
