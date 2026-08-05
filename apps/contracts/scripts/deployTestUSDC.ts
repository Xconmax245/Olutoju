/**
 * Deploy TestUSDC to Base Sepolia and mint initial supply to the treasury wallet.
 *
 * Mints:
 *   - 1,000 tUSDC  to the treasury (x402 payer / MPP payer)
 *   - 100  tUSDC  to itself (payout address placeholder — same wallet for demo)
 *
 * Run:
 *   npx hardhat run scripts/deployTestUSDC.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying TestUSDC from: ${deployer.address}`);

  const TestUSDC = await ethers.getContractFactory("TestUSDC");
  const token = await TestUSDC.deploy();
  await token.waitForDeployment();
  const address = await token.getAddress();
  console.log(`TestUSDC deployed to: ${address}`);

  // Mint 1000 tUSDC (6 decimals) to the deployer (used as x402 payer & MPP payer)
  const MINT_AMOUNT = ethers.parseUnits("1000", 6);
  const mintTx = await token.mint(deployer.address, MINT_AMOUNT);
  await mintTx.wait();
  console.log(`Minted 1000 tUSDC to ${deployer.address} (tx: ${mintTx.hash})`);

  const network = await ethers.provider.getNetwork();
  const deployment = {
    name: "TestUSDC",
    address,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    mintTxHash: mintTx.hash,
    mintedTo: deployer.address,
    mintedAmount: "1000000000", // 1000 tUSDC in base units
  };

  const outDir  = path.join(__dirname, "..", "deployments");
  const outFile = path.join(outDir, "testusdc.json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  console.log(`\nDeployment artifact: ${outFile}`);
  console.log(`\n--- Add to apps/agent/.env ---`);
  console.log(`X402_ASSET=${address}`);
  console.log(`X402_PAYER_KEY=<TREASURY_PRIVATE_KEY>`);
  console.log(`X402_PAYOUT_ADDRESS=${deployer.address}`);
  console.log(`X402_BASE_USDC=5`);
  console.log(`MPP_ASSET=${address}`);
  console.log(`MPP_PAYOUT_ADDRESS=${deployer.address}`);
  console.log(`MPP_AMOUNT_PER_PERIOD=2000000`);
  console.log(`MPP_PERIOD_SECONDS=60`);
  console.log(`MPP_PROTOCOL=MockVault`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
