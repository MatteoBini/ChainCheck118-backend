import { ethers } from 'hardhat';

async function main() {
  const registry = await ethers.deployContract('ChainCheckRegistry');
  await registry.waitForDeployment();
  console.log(`ChainCheckRegistry deployato a ${await registry.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
