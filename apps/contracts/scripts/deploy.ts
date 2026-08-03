import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const MockVault = await ethers.getContractFactory("MockVault");
  const vault = await MockVault.deploy();
  await vault.waitForDeployment();
  const address = await vault.getAddress();

  const network = await ethers.provider.getNetwork();
  const deployment = {
    name: "MockVault",
    address,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
  };

  // Write a shared deployment file the agent can load
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "mockvault.json");
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  console.log(`MockVault deployed to: ${address}`);
  console.log(`Deployment artifact written to: ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});