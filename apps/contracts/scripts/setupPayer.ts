import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [treasury] = await ethers.getSigners();
  console.log(`Treasury wallet: ${treasury.address}`);

  // Create a fresh wallet to act as the "Protocol Payer" (insurance pool)
  const payer = ethers.Wallet.createRandom().connect(ethers.provider);
  console.log(`\nNew Payer Wallet (Protocol Insurance Pool):`);
  console.log(`Address: ${payer.address}`);
  console.log(`Private Key: ${payer.privateKey}`);

  // 1. Send some Base Sepolia ETH to the payer for gas
  const ethAmount = ethers.parseEther("0.00005");
  console.log(`\nSending 0.00005 ETH from treasury to payer for gas...`);


  const ethTx = await treasury.sendTransaction({
    to: payer.address,
    value: ethAmount
  });
  await ethTx.wait();
  console.log(`ETH transfer complete: ${ethTx.hash}`);

  // 2. Transfer tUSDC from treasury (who minted it) to the payer
  const tokenAddress = "0xB0288852a83D323D63F87480f7BC8c4Adfd992A0";
  const token = await ethers.getContractAt("TestUSDC", tokenAddress, treasury);
  
  const usdcAmount = ethers.parseUnits("1000", 6);
  console.log(`\nTransferring 1000 tUSDC to the payer...`);
  const tokenTx = await token.transfer(payer.address, usdcAmount);
  await tokenTx.wait();
  console.log(`tUSDC transfer complete: ${tokenTx.hash}`);

  // 3. Update the agent .env file with the new payer key
  const envPath = path.join(__dirname, "..", "..", "agent", ".env");
  let envContent = fs.readFileSync(envPath, "utf8");
  
  // Replace the placeholder we added earlier with the real, distinct payer key
  const oldKey = process.env.TREASURY_PRIVATE_KEY!;
  envContent = envContent.replace(`X402_PAYER_KEY=${oldKey}`, `X402_PAYER_KEY=${payer.privateKey}`);
  
  fs.writeFileSync(envPath, envContent);
  console.log(`\nUpdated apps/agent/.env with new X402_PAYER_KEY (separated identity).`);
  console.log(`PAYOUT remains the Treasury (${treasury.address})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
