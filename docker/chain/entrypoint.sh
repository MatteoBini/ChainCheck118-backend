#!/bin/sh
# Avvia il nodo Hardhat e deploya ChainCheckRegistry. Lo stato della chain è in memoria:
# a ogni riavvio il contratto viene rideployato allo stesso indirizzo (primo deploy dell'account #0).
set -e

rm -f /tmp/chain-ready

# node_modules vive in un volume (dev): se package-lock.json è cambiato, reinstalla.
current_hash="$(sha256sum package-lock.json)"
if [ "$(cat node_modules/.deps-hash 2>/dev/null)" != "$current_hash" ]; then
  echo "[chain] package-lock.json cambiato: npm install..."
  npm install --no-audit --no-fund
  echo "$current_hash" > node_modules/.deps-hash
fi

npx hardhat node --hostname 0.0.0.0 &
node_pid=$!
trap 'kill -TERM "$node_pid" 2>/dev/null' TERM INT

echo "[chain] attendo il nodo RPC..."
until node -e "fetch('http://127.0.0.1:8545',{method:'POST',headers:{'content-type':'application/json'},body:'{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\",\"params\":[]}'}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"; do
  kill -0 "$node_pid" 2>/dev/null || { echo "[chain] il nodo Hardhat è terminato"; exit 1; }
  sleep 1
done

npx hardhat run scripts/deploy.ts --network localhost
touch /tmp/chain-ready
echo "[chain] pronto"

wait "$node_pid"
