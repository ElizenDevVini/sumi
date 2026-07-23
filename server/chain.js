const { createPublicClient, createWalletClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { RPC_URL, CHAIN_ID, EXPLORER } = require("./config");

const chain = {
  id: CHAIN_ID,
  name: "robinhood",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: EXPLORER } },
};

const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

// Loads the ops account from env. Returns null when unset so read-only paths
// (quote, balance) work without a key present.
function loadAccount() {
  const key = process.env.OPS_WALLET_KEY;
  if (!key) return null;
  const normalized = key.startsWith("0x") ? key : "0x" + key;
  return privateKeyToAccount(normalized);
}

// Signing client. Only ever reached through trade.sendSwap, which refuses unless
// ALLOW_BROADCAST=yes. Constructed lazily so read-only paths never build it.
function walletClient(account) {
  return createWalletClient({ account, chain, transport: http(RPC_URL) });
}

module.exports = { chain, publicClient, loadAccount, walletClient };
