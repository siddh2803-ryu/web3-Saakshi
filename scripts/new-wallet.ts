import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";

const ENV_PATH = path.resolve(__dirname, "../.env.local");

async function main() {
  let envContent = "";
  if (fs.existsSync(ENV_PATH)) {
    envContent = fs.readFileSync(ENV_PATH, "utf8");
  }

  const match = envContent.match(/^ANCHOR_PRIVATE_KEY=(.*)$/m);
  let privateKey = match ? match[1].trim() : "";
  let address = "";

  if (privateKey && privateKey.length > 0) {
    const wallet = new ethers.Wallet(privateKey);
    address = wallet.address;
    console.log(`Existing wallet detected.`);
    console.log(`Public Address: ${address}`);
  } else {
    const wallet = ethers.Wallet.createRandom();
    address = wallet.address;
    const newPk = wallet.privateKey;

    if (match) {
      // Replace empty ANCHOR_PRIVATE_KEY= line
      envContent = envContent.replace(
        /^ANCHOR_PRIVATE_KEY=.*$/m,
        `ANCHOR_PRIVATE_KEY=${newPk}`
      );
    } else {
      // Append
      envContent += `\nANCHOR_PRIVATE_KEY=${newPk}\n`;
    }

    fs.writeFileSync(ENV_PATH, envContent, "utf8");
    console.log(`Generated fresh anchor wallet.`);
    console.log(`Public Address: ${address}`);
  }

  // Check Amoy RPC URL & balance
  const rpcUrlMatch = envContent.match(/^AMOY_RPC_URL=(.*)$/m);
  const preferredRpc = (rpcUrlMatch && rpcUrlMatch[1].trim()) || "https://polygon-amoy-bor-rpc.publicnode.com";
  const candidateRpcs = [
    preferredRpc,
    "https://polygon-amoy-bor-rpc.publicnode.com",
    "https://polygon-amoy.drpc.org",
  ];

  let checked = false;
  for (const rpcUrl of candidateRpcs) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl, 80002, { staticNetwork: true });
      const balanceWei = await provider.getBalance(address);
      const balancePol = ethers.formatEther(balanceWei);
      console.log(`Amoy Balance: ${balancePol} POL (via ${rpcUrl})`);
      checked = true;
      break;
    } catch {
      // Try next
    }
  }

  if (!checked) {
    console.warn(`Could not fetch balance from candidate Amoy RPCs.`);
  }
}

main().catch((err) => {
  console.error("Error setting up wallet:", err.message);
  process.exit(1);
});
