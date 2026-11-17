import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import type { ChainCheckRegistry } from '../typechain-types';

const RecordType = { TURN_CHECK: 0, INSPECTION: 1 } as const;
const ZERO_HASH = ethers.ZeroHash;

describe('ChainCheckRegistry', () => {
  async function deploy(): Promise<ChainCheckRegistry> {
    return (await ethers.deployContract('ChainCheckRegistry')) as unknown as ChainCheckRegistry;
  }

  it('assegna recordId incrementali e salva i dati scritti', async () => {
    const registry = await deploy();
    const hashA = ethers.id('turn-check-1');
    const hashB = ethers.id('inspection-1');

    await registry.writeRecord(RecordType.TURN_CHECK, hashA, ZERO_HASH);
    await registry.writeRecord(RecordType.INSPECTION, hashB, hashA);

    expect(await registry.recordCount()).to.equal(2n);

    const second = await registry.getRecord(1);
    expect(second.recordType).to.equal(RecordType.INSPECTION);
    expect(second.hash).to.equal(hashB);
    expect(second.linkedHash).to.equal(hashA);
  });

  it('emette RecordWritten con i campi corretti', async () => {
    const registry = await deploy();
    const hash = ethers.id('turn-check-2');

    await expect(registry.writeRecord(RecordType.TURN_CHECK, hash, ZERO_HASH))
      .to.emit(registry, 'RecordWritten')
      .withArgs(0n, RecordType.TURN_CHECK, hash, ZERO_HASH, (await ethers.getSigners())[0]!.address, anyValue);
  });
});
