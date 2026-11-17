/** ABI minima di ChainCheckRegistry.sol: solo ciò che il backend chiama davvero. */
export const CHAIN_CHECK_REGISTRY_ABI = [
  "function writeRecord(uint8 recordType, bytes32 hash, bytes32 linkedHash) external returns (uint256)",
  "function getRecord(uint256 recordId) external view returns (tuple(uint8 recordType, bytes32 hash, bytes32 linkedHash, address submitter, uint256 timestamp))",
  "event RecordWritten(uint256 indexed recordId, uint8 recordType, bytes32 hash, bytes32 linkedHash, address submitter, uint256 timestamp)",
] as const;
