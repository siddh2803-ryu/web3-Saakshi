import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying EvidenceRegistry with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "POL/ETH");

  const Factory = await ethers.getContractFactory("EvidenceRegistry");
  const registry = await Factory.deploy(deployer.address);
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("EvidenceRegistry successfully deployed to:", address);

  const deploymentsDir = path.resolve(__dirname, "../../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const networkName = network.name === "localhost" || network.name === "hardhat" ? "local" : network.name;
  const deploymentFile = path.join(deploymentsDir, `${networkName}.json`);

  const netInfo = await ethers.provider.getNetwork();
  const deploymentData = {
    address,
    network: network.name,
    chainId: Number(netInfo.chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2), "utf8");
  console.log(`Saved deployment info to: ${deploymentFile}`);
  console.log("Save address to NEXT_PUBLIC_REGISTRY_ADDRESS in your env configuration.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
