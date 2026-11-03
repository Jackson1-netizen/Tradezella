import type { JournalState } from "./types"
import { todayKey } from "./metrics"

export function sampleState(): JournalState {
  return {
    accounts: [],
    trades: [],
    transactions: [],
    notes: {},
    moods: {},
    filters: {
      range: "all",
      from: "2026-10-17",
      to: todayKey(),
      accountId: "all",
      side: "all",
      symbol: "",
      instrument: "all",
      status: "all",
    },
    basis: "net",
    rDollars: 200,
    showInR: false,
  }
}
