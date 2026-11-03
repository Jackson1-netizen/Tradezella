import type { Account, JournalState } from "./types"
import { APEX_ACCOUNT_ID, attachApexBook } from "./apex-book"
import { alphaTrades } from "./alpha-trades"

const SAMPLE_ACCOUNT_IDS = ["apex-50k", "ftmo-100k"]
const SAMPLE_TX_IDS = ["x1", "x2", "x3", "x4", "x5"]
const SAMPLE_NOTES: Record<string, string> = {
  "2026-10-09": "Gave the open back. Size was too big after the first loss. Reset fee posted the same day.",
  "2026-10-20": "Opening drive held. This is the session to repeat.",
  "2026-11-02": "One clean MNQ. Flat after the target. MES still open into the afternoon.",
}

export const PAYOUT_DRAWDOWN_RULE = "After a payout the drawdown floor stays anchored at (highest balance before the payout) minus $2,000."

const ALPHA_RULES = {
  firm: "Alpha Futures",
  size: 50000,
  phase: "Funded" as const,
  status: "Active" as const,
  steps: 1 as const,
  plan: "Standard 50K",
  statusLabel: "Qualified",
  profitTarget: 0,
  maxDailyLoss: 1000,
  singleDayLossCap: 1000,
  maxDrawdown: 2000,
  drawdownType: "Trailing" as const,
  consistencyPct: 40,
  minTradingDays: 5,
  minDailyProfit: 200,
  payoutDrawdownRule: PAYOUT_DRAWDOWN_RULE,
}

export const ALPHA_ACCOUNTS: Account[] = [
  { id: APEX_ACCOUNT_ID, nickname: "Alpha Futures Standard 50K · …0541", broker: "STDQA2026101600541", startDate: "2026-10-17", ...ALPHA_RULES },
  { id: "stdqa-50k-0575", nickname: "Alpha Futures Standard 50K · …0575", broker: "STDQA2026102000575", startDate: "2026-10-21", ...ALPHA_RULES },
  { id: "stdqa-50k-0257", nickname: "Alpha Futures Standard 50K · …0257", broker: "STDQA2026102200257", startDate: "2026-10-22", ...ALPHA_RULES },
]

/** Idempotent: drops the old Apex/FTMO sample book, attaches the 0541 trades once, and upserts the three Alpha accounts by broker id. */
export function migrate(input: JournalState): JournalState {
  const isSample = (id: string) => SAMPLE_ACCOUNT_IDS.includes(id)
  const keep = (account: Account) => !isSample(account.id) || account.broker.startsWith("STDQA")
  const dropped = new Set(input.accounts.filter((a) => !keep(a)).map((a) => a.id))
  SAMPLE_ACCOUNT_IDS.forEach((id) => { if (!input.accounts.some((a) => a.id === id && keep(a))) dropped.add(id) })
  const notes = Object.fromEntries(Object.entries(input.notes ?? {}).filter(([date, text]) => SAMPLE_NOTES[date] !== text))
  let state: JournalState = {
    ...input,
    accounts: input.accounts.filter(keep),
    trades: input.trades.filter((t) => !dropped.has(t.accountId)),
    transactions: (input.transactions ?? []).filter((tx) => !dropped.has(tx.accountId) && !(SAMPLE_TX_IDS.includes(tx.id) && isSample(tx.accountId))),
    notes,
    moods: Object.fromEntries(Object.entries(input.moods ?? {}).filter(([date]) => !SAMPLE_NOTES[date] || notes[date])),
    filters: dropped.has(input.filters.accountId) ? { ...input.filters, accountId: "all" } : input.filters,
  }
  state = attachApexBook(state)
  const accounts = [...state.accounts]
  for (const seed of ALPHA_ACCOUNTS) {
    const at = accounts.findIndex((a) => a.broker === seed.broker)
    if (at >= 0) accounts[at] = { ...accounts[at], ...seed, id: accounts[at].id }
    else accounts.push(seed)
  }
  const ids = new Set(state.trades.map((t) => t.id))
  const byBroker = new Map(accounts.map((a) => [a.broker, a.id]))
  const seedId = new Map(ALPHA_ACCOUNTS.map((a) => [a.id, a.broker]))
  const missing = alphaTrades()
    .filter((t) => !ids.has(t.id))
    .map((t) => ({ ...t, accountId: byBroker.get(seedId.get(t.accountId) ?? "") ?? t.accountId }))
  return { ...state, accounts, trades: missing.length ? [...state.trades, ...missing] : state.trades, filters: missing.length ? { ...state.filters, accountId: "all" } : state.filters }
}
