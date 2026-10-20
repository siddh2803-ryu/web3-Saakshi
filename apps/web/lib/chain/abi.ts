export const EVIDENCE_REGISTRY_ABI = [
  {
    inputs: [{ internalType: "address", name: "admin", type: "address" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "root", type: "bytes32" },
      { indexed: false, internalType: "uint32", name: "size", type: "uint32" },
      { indexed: false, internalType: "string", name: "cid", type: "string" },
      { indexed: false, internalType: "uint64", name: "anchoredAt", type: "uint64" },
    ],
    name: "Anchored",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "evidenceId", type: "bytes32" },
      { indexed: false, internalType: "bytes32", name: "actionHash", type: "bytes32" },
      { indexed: false, internalType: "uint8", name: "action", type: "uint8" },
      { indexed: false, internalType: "uint64", name: "at", type: "uint64" },
    ],
    name: "Custody",
    type: "event",
  },
  {
    inputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    name: "batches",
    outputs: [
      { internalType: "uint64", name: "anchoredAt", type: "uint64" },
      { internalType: "uint32", name: "size", type: "uint32" },
      { internalType: "string", name: "cid", type: "string" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "root", type: "bytes32" },
      { internalType: "uint32", name: "size", type: "uint32" },
      { internalType: "string", name: "cid", type: "string" },
    ],
    name: "anchorRoot",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "evidenceId", type: "bytes32" },
      { internalType: "bytes32", name: "actionHash", type: "bytes32" },
      { internalType: "uint8", name: "action", type: "uint8" },
    ],
    name: "logCustody",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "manifestHash", type: "bytes32" },
      { internalType: "bytes32[]", name: "proof", type: "bytes32[]" },
      { internalType: "bytes32", name: "root", type: "bytes32" },
    ],
    name: "verify",
    outputs: [
      { internalType: "bool", name: "ok", type: "bool" },
      { internalType: "uint64", name: "anchoredAt", type: "uint64" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
