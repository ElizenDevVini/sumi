#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

// Load server/.env before requiring anything that reads env at import time.
(function loadEnv() {
  const p = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
})();

const { generatePrivateKey, privateKeyToAccount } = require("viem/accounts");
const { loadAccount } = require("../chain");
const { quote, buildSwap, simulate, sendSwap, balances, allowanceStatus, sendApprovals } = require("../trade");
const { USDG, STOCKS } = require("../config");
const { keccak256 } = require("viem");

function tokenFor(name) {
  if (!name) return USDG;
  const up = name.toUpperCase();
  if (up === "USDG") return USDG;
  if (STOCKS[up]) return STOCKS[up];
  console.error("unknown token " + name + ". known: USDG, " + Object.keys(STOCKS).join(", "));
  process.exit(1);
}

function fmtAllowance(label, s) {
  console.log(label);
  console.log("  erc20 -> Permit2:   " + s.erc20.toString() + (s.needsErc20 ? "  (needs approve)" : "  ok"));
  console.log("  Permit2 -> router:  " + s.permit2Amount.toString() + " exp " + s.permit2Expiration + (s.needsPermit2 ? "  (needs approve)" : "  ok"));
}

function requireAccount() {
  const acct = loadAccount();
  if (!acct) {
    console.error("no OPS_WALLET_KEY set. Run `gen-wallet` then add OPS_WALLET_KEY to server/.env");
    process.exit(1);
  }
  return acct;
}

function fmtQuote(q) {
  const inDec = q.side === "buy" ? "USDG" : q.symbol;
  const outDec = q.side === "buy" ? q.symbol : "USDG";
  console.log(q.side.toUpperCase() + " $" + q.usdAmount + " " + q.symbol);
  console.log("  price:        $" + q.price.toFixed(2) + " / share");
  console.log("  shares:       " + q.shares);
  console.log("  amountIn:     " + q.amountIn.toString() + " (" + inDec + " base units)");
  console.log("  amountOut:    " + q.amountOut.toString() + " (" + outDec + " base units)");
  console.log("  amountOutMin: " + q.amountOutMin.toString() + " (after " + "2% slippage)");
  console.log("  zeroForOne:   " + q.zeroForOne);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === "gen-wallet") {
    const key = generatePrivateKey();
    const acct = privateKeyToAccount(key);
    console.log("address:     " + acct.address);
    console.log("private key: " + key);
    console.log("");
    console.log("Add this line to server/.env manually (never commit it):");
    console.log("OPS_WALLET_KEY=" + key);
    console.log("");
    console.log("This key was printed once and written to no file. Copy it now.");
    return;
  }

  if (cmd === "balance") {
    const addr = rest[0] || requireAccount().address;
    const b = await balances(addr);
    console.log("balances for " + addr);
    for (const [k, v] of Object.entries(b)) console.log("  " + k.padEnd(6) + v);
    return;
  }

  if (cmd === "quote") {
    const [side, usd, sym] = rest;
    const q = await quote({ symbol: sym, side, usdAmount: usd });
    fmtQuote(q);
    return;
  }

  if (cmd === "dry") {
    const [side, usd, sym] = rest;
    const acct = requireAccount();
    const q = await quote({ symbol: sym, side, usdAmount: usd });
    fmtQuote(q);
    const built = buildSwap(q, acct.address);
    console.log("");
    console.log("router:       " + built.router);
    console.log("recipient:    " + built.recipient);
    console.log("calldata len: " + (built.calldata.length - 2) / 2 + " bytes");
    console.log("calldata sha: " + keccak256(built.calldata));
    console.log("value:        " + built.value.toString());
    console.log("");
    const sim = await simulate(acct, built.calldata, built.value);
    console.log("SIMULATION");
    console.log("  verdict:            " + sim.verdict);
    console.log("  encoding reached:   " + (sim.ok ? "yes" : "NO"));
    console.log("  stateOverride used: " + sim.stateOverrideAccepted);
    console.log("  detail:             " + sim.detail);
    if (sim.revert) {
      console.log("  revert selector:    " + sim.revert.selector);
      if (sim.revert.sig) console.log("  revert error:       " + sim.revert.sig);
      if (sim.revert.inner) console.log("  inner error:        " + (sim.revert.inner.sig || sim.revert.inner.selector) + " (" + sim.revert.inner.stage + ")");
      if (sim.revert.reason) console.log("  reason:             " + sim.revert.reason);
    }
    return;
  }

  if (cmd === "allowance") {
    const acct = requireAccount();
    const tok = tokenFor(rest[0]);
    fmtAllowance((rest[0] || "USDG").toUpperCase() + " allowances for " + acct.address, await allowanceStatus(acct.address, tok));
    return;
  }

  if (cmd === "setup") {
    const acct = requireAccount();
    const tok = tokenFor(rest[0]);
    const res = await sendApprovals({ account: acct, token: tok });
    if (res.hashes.length === 0) console.log("nothing to do, allowances already set");
    for (const h of res.hashes) console.log("approval tx: " + h);
    fmtAllowance("after", res.after);
    return;
  }

  if (cmd === "send") {
    const [side, usd, sym] = rest;
    const acct = requireAccount();
    const q = await quote({ symbol: sym, side, usdAmount: usd });
    const built = buildSwap(q, acct.address);
    const hash = await sendSwap({ account: acct, built });
    console.log("tx hash: " + hash);
    return;
  }

  console.log("sumi trade-cli");
  console.log("  gen-wallet");
  console.log("  balance [addr]");
  console.log("  quote buy|sell <usd> <SYM>");
  console.log("  dry   buy|sell <usd> <SYM>");
  console.log("  allowance [SYM|USDG]");
  console.log("  setup <SYM|USDG>             (one-time Permit2 approvals; refuses unless ALLOW_BROADCAST=yes)");
  console.log("  send  buy|sell <usd> <SYM>   (refuses unless ALLOW_BROADCAST=yes)");
  process.exit(cmd ? 1 : 0);
}

main().catch((e) => {
  console.error("error: " + (e.shortMessage || e.message));
  process.exit(1);
});
