// Robinhood Chain mainnet + Uniswap v4 swap constants.
// Every address here is Blockscout-verified and checksum-validated (viem getAddress)
// before hardcoding. Provenance noted per line. See phase-0 ground truth in the plan.

const RPC_URL = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

const CHAIN_ID = 4663; // Robinhood Chain mainnet
const EXPLORER = "https://robinhoodchain.blockscout.com";

// UniversalRouter fork (modified v4 struct: extra minHopPriceX36). Blockscout-verified source.
const UNIVERSAL_ROUTER = "0x8876789976dEcBfCbBbe364623C63652db8C0904";
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // v4 PoolManager
const V4_QUOTER = "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94"; // V4Quoter (standard 4-field QuoteExactSingleParams)
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // canonical Permit2
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11"; // canonical Multicall3

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"; // quote currency, 6 decimals
const USDG_DECIMALS = 6;
const STOCK_DECIMALS = 18;

// Tokenized-stock ERC-20s (18 dec). Checksums fixed via viem getAddress; the sibling-repo
// TSLA value carried a lowercase byte, corrected here.
const STOCKS = {
  TSLA: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
  AAPL: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
  NVDA: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
  MSFT: "0xe93237C50D904957Cf27E7B1133b510C669c2e74",
  AMZN: "0x12f190a9F9d7D37a250758b26824B97CE941bF54",
};

// Stock/USDG v4 pools, decoded live on-chain from a real swap. Same for every stock pool.
const POOL_FEE = 3000;
const POOL_TICK_SPACING = 60;
const POOL_HOOKS = "0x0000000000000000000000000000000000000000";

// Risk caps. Code-side semantic limits; Privy policy is the separate backstop (phase 3).
const MAX_TRADE_USD = 20;
const SLIPPAGE_BPS = 200; // 2%
const GLOBAL_DAILY_USD = 100;

module.exports = {
  RPC_URL,
  CHAIN_ID,
  EXPLORER,
  UNIVERSAL_ROUTER,
  POOL_MANAGER,
  V4_QUOTER,
  PERMIT2,
  MULTICALL3,
  USDG,
  USDG_DECIMALS,
  STOCK_DECIMALS,
  STOCKS,
  POOL_FEE,
  POOL_TICK_SPACING,
  POOL_HOOKS,
  MAX_TRADE_USD,
  SLIPPAGE_BPS,
  GLOBAL_DAILY_USD,
};
