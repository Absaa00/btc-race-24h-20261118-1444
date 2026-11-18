# Dip-bounce cbBTC bot — btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/Absaa00/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/Absaa00/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)

Entry for [make.fun](https://make.fun) competition
`btc-race-24h-20261118-1444` — race a BTC trading bot live for 24 hours.
Simulation only: the bot trades $1,000 of paper money against real
on-chain cbBTC prices. No real money is traded.

## Strategy

A long-only, cash-first dip-bounce bot on 1-minute cbBTC/USDC bars from
the Orca Whirlpool. It holds cash most of the time and only buys a dip
that has already started to bounce:

- **BUY** (all cash) when the 45-minute return is ≤ −0.5% **and** the last
  5 minutes already bounce ≥ +0.2%. A dip still falling is never bought.
- **SELL** (whole position) at take profit **+2.0%** over the entry close,
  stop loss **−1.0%** under it, or a trailing stop **−0.75%** below the
  highest close since entry.

A full round trip costs about 26 bps in fees, slippage and price impact,
so a trade must catch a move well above that. A 45-minute dip that is
already bouncing keeps recovering often enough to clear the cost, while
the trailing stop banks the bounce before it rolls over. Sitting in cash
the rest of the time means a falling market costs nothing.

## Local grade (dev window)

```
node cli/makefun.mjs grade-local --kit . --bot <repository> --driver process
```

Dev window (kit): net PnL **+$14.86** (offline sweep; verified by
grade-local below), 4 trades (2 round trips), max drawdown 1.78%.
Out-of-sample on the previous race's dev window: **+$22.93**, 4 trades,
max drawdown 0.97%. Buy-and-hold loses −2.79% on this dev window.

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript, standard library
  only; all decisions are integer arithmetic on closes seen so far —
  no clock, no environment, no randomness, no network).
- `vendor/makefun-bars.ts` — the kit's bars-replay/v1 shim, copied
  byte-for-byte from the kit's `sdk/`.
- `LICENSE` — MIT.
