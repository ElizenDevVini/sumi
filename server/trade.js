const {
  encodeAbiParameters,
  encodeFunctionData,
  decodeAbiParameters,
  toFunctionSelector,
  getAddress,
  formatUnits,
  parseUnits,
} = require("viem");
const { publicClient, walletClient } = require("./chain");
const {
  UNIVERSAL_ROUTER,
  V4_QUOTER,
  MULTICALL3,
  PERMIT2,
  USDG,
  USDG_DECIMALS,
  STOCK_DECIMALS,
  STOCKS,
  POOL_FEE,
  POOL_TICK_SPACING,
  POOL_HOOKS,
  MAX_TRADE_USD,
  SLIPPAGE_BPS,
} = require("./config");

const POOL_KEY_COMPONENTS = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
];

// V4Quoter is standard 4-field QuoteExactSingleParams (verified: no minHopPriceX36 on the quoter).
const QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "poolKey", type: "tuple", components: POOL_KEY_COMPONENTS },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
];

const ROUTER_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
];

const ERC20_BALANCE_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
];

const MULTICALL3_ETH_ABI = [
  { type: "function", name: "getEthBalance", stateMutability: "view", inputs: [{ name: "addr", type: "address" }], outputs: [{ name: "balance", type: "uint256" }] },
];

// Modified fork struct: extra minHopPriceX36 (uint256) between amountOutMinimum and hookData.
// This is the whole reason SDK calldata reverts here. minHopPriceX36: 0 disables hop pricing.
const EXACT_INPUT_SINGLE_TUPLE = {
  type: "tuple",
  components: [
    { name: "poolKey", type: "tuple", components: POOL_KEY_COMPONENTS },
    { name: "zeroForOne", type: "bool" },
    { name: "amountIn", type: "uint128" },
    { name: "amountOutMinimum", type: "uint128" },
    { name: "minHopPriceX36", type: "uint256" },
    { name: "hookData", type: "bytes" },
  ],
};

const V4_SWAP = "0x10"; // Commands.V4_SWAP (verified)
const ACTION_SWAP_EXACT_IN_SINGLE = "06"; // Actions.SWAP_EXACT_IN_SINGLE (verified)
const ACTION_SETTLE_ALL = "0c"; // Actions.SETTLE_ALL (verified)
const ACTION_TAKE_ALL = "0f"; // Actions.TAKE_ALL (verified)

function poolFor(symbol) {
  const sym = symbol.toUpperCase();
  const stock = STOCKS[sym];
  if (!stock) throw new Error("unknown symbol " + symbol + ". known: " + Object.keys(STOCKS).join(", "));
  const usdg = getAddress(USDG);
  const stk = getAddress(stock);
  const [currency0, currency1] = usdg.toLowerCase() < stk.toLowerCase() ? [usdg, stk] : [stk, usdg];
  return {
    poolKey: { currency0, currency1, fee: POOL_FEE, tickSpacing: POOL_TICK_SPACING, hooks: POOL_HOOKS },
    usdgIsCurrency0: currency0 === usdg,
    usdg,
    stock: stk,
  };
}

async function quoteExactIn(poolKey, zeroForOne, amountIn) {
  const { result } = await publicClient.simulateContract({
    address: getAddress(V4_QUOTER),
    abi: QUOTER_ABI,
    functionName: "quoteExactInputSingle",
    args: [{ poolKey, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
  });
  return result[0]; // amountOut
}

function applySlippage(amount) {
  return (amount * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;
}

// side "buy" spends usdAmount of USDG for a stock. side "sell" sells the stock quantity
// worth usdAmount of USDG. Sell is sized via a buy-direction quote (how many shares $X buys)
// then priced via the real sell-direction quote, so the reported price is the sell price and
// the buy/sell gap is the round-trip cost.
async function quote({ symbol, side, usdAmount }) {
  if (side !== "buy" && side !== "sell") throw new Error("side must be buy or sell");
  const usd = Number(usdAmount);
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("usdAmount must be a positive number");
  if (usd > MAX_TRADE_USD) throw new Error("trade " + usd + " exceeds MAX_TRADE_USD cap of " + MAX_TRADE_USD);

  const { poolKey, usdgIsCurrency0, usdg, stock } = poolFor(symbol);
  const usdgWei = parseUnits(usd.toString(), USDG_DECIMALS);

  if (side === "buy") {
    const zeroForOne = usdgIsCurrency0; // input is USDG
    const amountOut = await quoteExactIn(poolKey, zeroForOne, usdgWei);
    const shares = Number(formatUnits(amountOut, STOCK_DECIMALS));
    return {
      symbol: symbol.toUpperCase(),
      side,
      usdAmount: usd,
      amountIn: usdgWei,
      amountOut,
      amountOutMin: applySlippage(amountOut),
      inputCurrency: usdg,
      outputCurrency: stock,
      poolKey,
      zeroForOne,
      shares,
      price: usd / shares,
    };
  }

  // sell: size the stock quantity worth $usd via the buy direction
  const buyZeroForOne = usdgIsCurrency0;
  const stockWei = await quoteExactIn(poolKey, buyZeroForOne, usdgWei);
  const zeroForOne = !usdgIsCurrency0; // input is the stock
  const usdgOut = await quoteExactIn(poolKey, zeroForOne, stockWei);
  const shares = Number(formatUnits(stockWei, STOCK_DECIMALS));
  const usdgOutHuman = Number(formatUnits(usdgOut, USDG_DECIMALS));
  return {
    symbol: symbol.toUpperCase(),
    side,
    usdAmount: usd,
    amountIn: stockWei,
    amountOut: usdgOut,
    amountOutMin: applySlippage(usdgOut),
    inputCurrency: stock,
    outputCurrency: usdg,
    poolKey,
    zeroForOne,
    shares,
    price: usdgOutHuman / shares,
  };
}

// Builds UniversalRouter.execute() calldata: one V4_SWAP command whose actions are
// [SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]. TAKE_ALL sends output to msgSender(), so the
// tx signer must equal recipient. sendSwap enforces that; here we validate recipient is real.
function buildSwap(q, recipient) {
  const to = getAddress(recipient);

  const swapParams = encodeAbiParameters(
    [EXACT_INPUT_SINGLE_TUPLE],
    [
      {
        poolKey: q.poolKey,
        zeroForOne: q.zeroForOne,
        amountIn: q.amountIn,
        amountOutMinimum: q.amountOutMin,
        minHopPriceX36: 0n,
        hookData: "0x",
      },
    ]
  );
  const settleParams = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [q.inputCurrency, q.amountIn] // maxAmount = exact-in debt
  );
  const takeParams = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [q.outputCurrency, q.amountOutMin] // minAmount = slippage floor
  );

  const actions = "0x" + ACTION_SWAP_EXACT_IN_SINGLE + ACTION_SETTLE_ALL + ACTION_TAKE_ALL;
  const v4Input = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [actions, [swapParams, settleParams, takeParams]]
  );

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);
  const calldata = encodeFunctionData({
    abi: ROUTER_ABI,
    functionName: "execute",
    args: [V4_SWAP, [v4Input], deadline],
  });

  return { calldata, value: 0n, recipient: to, deadline, router: getAddress(UNIVERSAL_ROUTER) };
}

// Error selectors, computed not recalled. stage tells us where in the flow a revert landed:
// "settle"/"swap" = calldata got past command dispatch and the real pool swap (encoding good,
// just unfunded/unapproved); "dispatch" = the router never understood the actions (encoding broken).
const ERR = {};
for (const [sig, stage] of [
  ["ExecutionFailed(uint256,bytes)", "wrapper"],
  ["AllowanceExpired(uint256)", "settle"], // Permit2: no router allowance set
  ["InsufficientAllowance(uint256)", "settle"], // Permit2: allowance too small
  ["V4TooLittleReceived(uint256,uint256)", "swap"], // slippage floor, past swap
  ["V4TooLittleReceivedPerHopSingle(uint256,uint256)", "swap"],
  ["DeltaNotNegative(address)", "settle"],
  ["DeltaNotPositive(address)", "swap"],
  ["UnsupportedAction(uint256)", "dispatch"],
  ["InputLengthMismatch()", "dispatch"],
  ["LengthMismatch()", "dispatch"],
  ["TransactionDeadlinePassed()", "deadline"],
  ["Error(string)", "string"],
]) {
  ERR[toFunctionSelector(sig)] = { sig, stage };
}

function findRevertData(err) {
  if (err && typeof err.walk === "function") {
    const hit = err.walk((e) => e && typeof e.data === "string" && e.data.startsWith("0x") && e.data.length >= 10);
    if (hit) return hit.data;
  }
  let cur = err;
  while (cur) {
    for (const k of ["data", "raw"]) {
      if (typeof cur[k] === "string" && cur[k].startsWith("0x") && cur[k].length >= 10) return cur[k];
    }
    cur = cur.cause;
  }
  return null;
}

function decodeRevert(data) {
  if (!data || data.length < 10) return { selector: data || null, sig: null, stage: "unknown", reason: null };
  const selector = data.slice(0, 10);
  const known = ERR[selector];
  if (!known) return { selector, sig: null, stage: "unknown", reason: null };

  if (known.sig === "Error(string)") {
    let reason = null;
    try {
      [reason] = decodeAbiParameters([{ type: "string" }], "0x" + data.slice(10));
    } catch {}
    const settle = reason && /TRANSFER_FROM_FAILED|STF|transfer|allowance/i.test(reason);
    return { selector, sig: known.sig, stage: settle ? "settle" : "string", reason };
  }
  if (known.sig === "ExecutionFailed(uint256,bytes)") {
    // Unwrap: the inner command revert bytes are the real signal.
    try {
      const [index, message] = decodeAbiParameters([{ type: "uint256" }, { type: "bytes" }], "0x" + data.slice(10));
      const inner = decodeRevert(message);
      return { selector, sig: known.sig, stage: inner.stage, reason: "commandIndex " + index.toString(), inner };
    } catch {
      return { selector, sig: known.sig, stage: "unknown", reason: null };
    }
  }
  return { selector, sig: known.sig, stage: known.stage, reason: null };
}

// Runs the swap read-only from `account` against the router. Never broadcasts.
// Verdict logic: a revert whose deepest stage is settle/swap proves the calldata passed command
// dispatch, action decode, and the live pool swap, reverting only at the token pull (unfunded).
// That is the phase-2 "encoding reached settlement" proof. A dispatch-stage or unknown revert
// means the encoding is wrong.
async function simulate(account, calldata, value) {
  const from = getAddress(account.address);
  const to = getAddress(UNIVERSAL_ROUTER);
  const callParams = { account: from, to, data: calldata, value: value ?? 0n };

  // Attempt state override first (fund native ETH) purely to confirm the RPC accepts the field.
  // A full-path override would need USDG's unknown storage slots + Permit2's packed allowance
  // slot; we deliberately do not slot-scan (fragile), so the verdict rests on revert stage.
  let stateOverrideAccepted = false;
  try {
    await publicClient.call({ ...callParams, stateOverride: [{ address: from, balance: 10n ** 18n }] });
    stateOverrideAccepted = true;
    return { ok: true, verdict: "SUCCESS", detail: "call returned without revert under state override", stateOverrideAccepted };
  } catch (err) {
    if (/state override|not supported|unsupported|invalid argument|method|stateOverride/i.test(err.shortMessage || err.message || "")) {
      // RPC likely rejected the override field, not a swap revert. Fall through to plain call.
    } else {
      stateOverrideAccepted = true;
      const decoded = decodeRevert(findRevertData(err));
      const deepest = decoded.inner || decoded;
      return classify(decoded, deepest, stateOverrideAccepted);
    }
  }

  try {
    const res = await publicClient.call(callParams);
    return { ok: true, verdict: "SUCCESS", detail: "plain call returned: " + (res.data || "0x"), stateOverrideAccepted };
  } catch (err) {
    const decoded = decodeRevert(findRevertData(err));
    const deepest = decoded.inner || decoded;
    return classify(decoded, deepest, stateOverrideAccepted);
  }
}

function classify(decoded, deepest, stateOverrideAccepted) {
  const pathOk = deepest.stage === "settle" || deepest.stage === "swap";
  return {
    ok: pathOk,
    verdict: pathOk ? "ENCODING_OK_UNFUNDED" : "ENCODING_SUSPECT",
    detail: pathOk
      ? "reverted at " + deepest.stage + " stage (" + (deepest.sig || deepest.selector) + ") — dispatch + swap passed, only the token pull failed"
      : "reverted at " + deepest.stage + " stage (" + (deepest.sig || deepest.selector || "no revert data") + ") — did not reach settlement",
    revert: decoded,
    stateOverrideAccepted,
  };
}

const REFUSAL =
  "sendSwap refused: broadcasting is disabled. This tool never broadcasts by default. " +
  "The funded round-trip test is a human step. To enable, set ALLOW_BROADCAST=yes in the environment.";

async function sendSwap({ account, built }) {
  if (process.env.ALLOW_BROADCAST !== "yes") throw new Error(REFUSAL);
  if (getAddress(account.address) !== getAddress(built.recipient)) {
    throw new Error(
      "signer " + account.address + " != recipient " + built.recipient +
      ". TAKE_ALL sends output to the tx signer; sign with the recipient's key."
    );
  }
  return walletClient(account).sendTransaction({ to: built.router, data: built.calldata, value: built.value });
}

// Input settlement is Permit2 AllowanceTransfer (verified in Permit2Payments.sol), so a funded
// wallet needs two one-time approvals per input token: token.approve(Permit2) and
// Permit2.approve(router). Without them execute() reverts AllowanceExpired at settle.
const ERC20_APPROVE_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
];
const PERMIT2_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "token", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "token", type: "address" }, { name: "spender", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }], outputs: [] },
];

const MAX_UINT256 = 2n ** 256n - 1n;
const MAX_UINT160 = 2n ** 160n - 1n;
const MAX_UINT48 = 2n ** 48n - 1n;

async function allowanceStatus(owner, token) {
  const from = getAddress(owner);
  const tok = getAddress(token);
  const [erc20, p2] = await publicClient.multicall({
    contracts: [
      { address: tok, abi: ERC20_APPROVE_ABI, functionName: "allowance", args: [from, getAddress(PERMIT2)] },
      { address: getAddress(PERMIT2), abi: PERMIT2_ABI, functionName: "allowance", args: [from, tok, getAddress(UNIVERSAL_ROUTER)] },
    ],
    multicallAddress: getAddress(MULTICALL3),
    allowFailure: false,
  });
  const [amount, expiration] = p2;
  const now = Math.floor(Date.now() / 1000);
  return {
    erc20,
    permit2Amount: amount,
    permit2Expiration: Number(expiration),
    needsErc20: erc20 < 2n ** 128n,
    needsPermit2: amount < 2n ** 96n || Number(expiration) <= now,
  };
}

async function sendApprovals({ account, token }) {
  if (process.env.ALLOW_BROADCAST !== "yes") throw new Error(REFUSAL.replace("sendSwap", "sendApprovals"));
  const tok = getAddress(token);
  const status = await allowanceStatus(account.address, tok);
  const wallet = walletClient(account);
  const hashes = [];
  if (status.needsErc20) {
    const hash = await wallet.writeContract({ address: tok, abi: ERC20_APPROVE_ABI, functionName: "approve", args: [getAddress(PERMIT2), MAX_UINT256] });
    await publicClient.waitForTransactionReceipt({ hash });
    hashes.push(hash);
  }
  if (status.needsPermit2) {
    const hash = await wallet.writeContract({ address: getAddress(PERMIT2), abi: PERMIT2_ABI, functionName: "approve", args: [tok, getAddress(UNIVERSAL_ROUTER), MAX_UINT160, MAX_UINT48] });
    await publicClient.waitForTransactionReceipt({ hash });
    hashes.push(hash);
  }
  return { hashes, before: status, after: await allowanceStatus(account.address, tok) };
}

async function balances(address) {
  const addr = getAddress(address);
  const tokens = [["USDG", getAddress(USDG), USDG_DECIMALS]];
  for (const [sym, a] of Object.entries(STOCKS)) tokens.push([sym, getAddress(a), STOCK_DECIMALS]);

  const calls = [
    { address: getAddress(MULTICALL3), abi: MULTICALL3_ETH_ABI, functionName: "getEthBalance", args: [addr] },
    ...tokens.map(([, a]) => ({ address: a, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [addr] })),
  ];
  const res = await publicClient.multicall({ contracts: calls, multicallAddress: getAddress(MULTICALL3), allowFailure: false });

  const out = { ETH: formatUnits(res[0], 18) };
  tokens.forEach(([sym, , dec], i) => {
    out[sym] = formatUnits(res[i + 1], dec);
  });
  return out;
}

module.exports = { quote, buildSwap, simulate, sendSwap, balances, poolFor, allowanceStatus, sendApprovals };
