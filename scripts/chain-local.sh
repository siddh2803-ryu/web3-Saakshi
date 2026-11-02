#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=================================================="
echo "Starting Saakshi Local Hardhat Chain (Chain ID: 31337)"
echo "=================================================="

# Check if port 8545 is already in use
if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null ; then
    echo "Found existing service on port 8545. Checking responsiveness..."
else
    echo "Starting Hardhat node in background..."
    nohup npx --prefix contracts hardhat node --hostname 127.0.0.1 --port 8545 > /tmp/hardhat_node.log 2>&1 &
    disown
fi

# Wait for RPC to be available
echo "Waiting for local RPC http://127.0.0.1:8545..."
READY=0
for i in {1..30}; do
    if curl -s -X POST http://127.0.0.1:8545 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | grep -q "0x7a69"; then
        READY=1
        echo "Local RPC is ready (Chain ID 31337 / 0x7a69)."
        break
    fi
    sleep 1
done

if [ $READY -ne 1 ]; then
    echo "Error: Local RPC failed to start within 30 seconds."
    exit 1
fi

echo "Deploying EvidenceRegistry to local chain..."
(cd contracts && npx hardhat run --network localhost scripts/deploy.ts)

DEPLOY_JSON="$DIR/deployments/local.json"
if [ ! -f "$DEPLOY_JSON" ]; then
    echo "Error: deployments/local.json was not created."
    exit 1
fi

REGISTRY_ADDR=$(node -e "console.log(require('$DEPLOY_JSON').address)")
echo "EvidenceRegistry deployed at: $REGISTRY_ADDR"

# Create .env.chain-local
ENV_FILE="$DIR/.env.chain-local"
cat > "$ENV_FILE" <<EOF
# Local Hardhat Chain Configuration (Chain ID 31337)
NEXT_PUBLIC_CHAIN_ID=31337
CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
RPC_URL=http://127.0.0.1:8545
AMOY_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_AMOY_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_REGISTRY_ADDRESS=$REGISTRY_ADDR
# Hardhat Test Account #0 (Public well-known test key)
ANCHOR_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
NEXT_PUBLIC_EXPLORER_URL=
EOF

echo "Wrote configuration to: $ENV_FILE"
echo ""
echo "Env values to use for local development & testing:"
echo "--------------------------------------------------"
cat "$ENV_FILE"
echo "--------------------------------------------------"
echo "Done!"
