import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying EvidenceRegistry with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "POL");

  const Factory = await ethers.getContractFactory("EvidenceRegistry");
  const registry = await Factory.deploy(deployer.address);
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("EvidenceRegistry successfully deployed to:", address);
  console.log("Save this to NEXT_PUBLIC_REGISTRY_ADDRESS in your .env.local file");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
