// Dip-bounce cbBTC bot — entry for make.fun btc-race-24h-20261118-1444.
//
// Long-only, cash-first, one position at a time, $1,000 of paper money on
// 1-minute cbBTC/USDC bars from the Orca Whirlpool. The bot watches every
// bar's close and only buys a dip that has already started to bounce:
//
//   BUY  (all cash) when the 45-minute return is at or below -0.5% AND the
//        last 5 minutes already bounce by at least +0.2%. A dip that is
//        still falling is never bought.
//   SELL (whole position) at take profit +2.0% over the entry close, stop
//        loss -1.0% under it, or a trailing stop -0.75% below the highest
//        close seen since entry.
//
// Why this shape: a full round trip costs about 26 bps in fees, slippage
// and price impact, so a trade must catch a move well above that. On
// 1-minute bars most moves are noise, but a 45-minute dip that is already
// bouncing keeps recovering often enough to clear the cost, while the
// trailing stop banks the bounce before it rolls over. The bot sits in cash
// the rest of the time, so a falling market costs it nothing.
//
// Determinism: every decision is integer arithmetic on the closes seen so
// far. No clock, no environment, no randomness, no network, no files
// outside the repository. Two runs on the same bars answer every batch
// with the same orders.

import { runBars } from "./vendor/makefun-bars.ts";

const SYMBOL = "CBBTC";

// Entry: dip over 45 bars, bounce over 5 bars (basis points).
const DIP_LOOKBACK = 45;
const BOUNCE_LOOKBACK = 5;
const DIP_BPS = 50; // 45-minute return <= -0.50%
const BOUNCE_BPS = 20; // 5-minute return >= +0.20%

// Exits (basis points, measured from the entry close / the peak close).
const TAKE_PROFIT_BPS = 200; // +2.00%
const STOP_LOSS_BPS = 100; // -1.00%
const TRAILING_BPS = 75; // -0.75% from the highest close since entry

// How far a fill may move from the latest close before the order is
// rejected: 2% either way, far above the ~26 bps a round trip costs.
const MAX_SLIPPAGE_BPS = 200;

// Minimum buy: 1 USDC, in the quote's raw units (6 decimals).
const MIN_NOTIONAL = 1_000_000n;

const BPS = 10_000n;

// Cross-multiplied comparisons, so no division ever truncates a negative
// return toward zero: a <= b * (10000 - n) / 10000, in integers.
function atOrBelowByBps(price: bigint, ref: bigint, bps: bigint): boolean {
  return price * BPS <= ref * (BPS - bps);
}

function atOrAboveByBps(price: bigint, ref: bigint, bps: bigint): boolean {
  return price * BPS >= ref * (BPS + bps);
}

const closes: bigint[] = [];

// Position bookkeeping, set when a buy is decided and cleared on a sell.
let holding = false;
let entryClose = 0n;
let peakClose = 0n;

await runBars({
  onBatch(state, batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = BigInt(bar.c);
    closes.push(close);

    const held = state.positions.get(SYMBOL);
    const qty = held === undefined ? 0n : held.qty;

    // A buy decided on the previous bar fills at this bar's open, so the
    // position shows up one batch later; adopt it defensively if our own
    // bookkeeping ever disagrees with the account.
    if (qty > 0n && !holding) {
      holding = true;
      entryClose = close;
      peakClose = close;
    }
    // A buy that was rejected leaves no position: drop the stale flag.
    if (qty === 0n && holding) {
      holding = false;
    }

    if (state.warmingUp) return [];

    if (holding) {
      if (close > peakClose) peakClose = close;
      const takeProfit = atOrAboveByBps(close, entryClose, BigInt(TAKE_PROFIT_BPS));
      const stopLoss = atOrBelowByBps(close, entryClose, BigInt(STOP_LOSS_BPS));
      const trailing = atOrBelowByBps(close, peakClose, BigInt(TRAILING_BPS));
      // Defensive: never send a zero-quantity sell if the bookkeeping and
      // the account ever disagree; the reset above normally prevents this.
      if ((takeProfit || stopLoss || trailing) && qty > 0n) {
        holding = false;
        return [
          {
            side: "sell",
            symbol: SYMBOL,
            qty,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
          },
        ];
      }
      return [];
    }

    // Flat: arm the dip-bounce entry once enough history exists.
    const n = closes.length;
    if (n <= DIP_LOOKBACK) return [];
    const dipRef = closes[n - 1 - DIP_LOOKBACK]!;
    const bounceRef = closes[n - 1 - BOUNCE_LOOKBACK]!;
    const dipped = atOrBelowByBps(close, dipRef, BigInt(DIP_BPS));
    const bouncing = atOrAboveByBps(close, bounceRef, BigInt(BOUNCE_BPS));
    if (!dipped || !bouncing) return [];
    if (state.cash < MIN_NOTIONAL) return [];

    holding = true;
    entryClose = close;
    peakClose = close;
    return [
      {
        side: "buy",
        symbol: SYMBOL,
        notional_quote_units: state.cash,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      },
    ];
  },
});
