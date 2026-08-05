import { ethers } from "hardhat";

async function main() {
  const [treasury] = await ethers.getSigners();
  console.log(`Treasury wallet: ${treasury.address}`);

  const tokenAddress = "0xB0288852a83D323D63F87480f7BC8c4Adfd992A0";
  const token = await ethers.getContractAt("TestUSDC", tokenAddress, treasury);
  
  const usdcAmount = ethers.parseUnits("1000", 6);
  console.log(`\nMinting 1000 tUSDC back to the Treasury (Payer)...`);
  const mintTx = await token.mint(treasury.address, usdcAmount);
  await mintTx.wait();
  console.log(`Mint complete: ${mintTx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
