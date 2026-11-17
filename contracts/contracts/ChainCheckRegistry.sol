// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ChainCheckRegistry {
    enum RecordType { TURN_CHECK, INSPECTION }

    struct Record {
        RecordType recordType;
        bytes32 hash;
        bytes32 linkedHash;
        address submitter;
        uint256 timestamp;
    }

    Record[] private records;

    event RecordWritten(
        uint256 indexed recordId,
        RecordType recordType,
        bytes32 hash,
        bytes32 linkedHash,
        address submitter,
        uint256 timestamp
    );

    function writeRecord(RecordType recordType, bytes32 hash, bytes32 linkedHash) external returns (uint256) {
        records.push(Record(recordType, hash, linkedHash, msg.sender, block.timestamp));
        uint256 recordId = records.length - 1;
        emit RecordWritten(recordId, recordType, hash, linkedHash, msg.sender, block.timestamp);
        return recordId;
    }

    function getRecord(uint256 recordId) external view returns (Record memory) {
        return records[recordId];
    }

    function recordCount() external view returns (uint256) {
        return records.length;
    }
}
