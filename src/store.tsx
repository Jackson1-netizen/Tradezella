import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { Account, Filters, JournalState, PnlBasis, Trade, Transaction } from "./types"
import { attachApexBook } from "./apex-book"
import { sampleState } from "./sample"

const KEY = "jacks0n-journal-v1"

type Store = {
  state: JournalState
  setFilters: (patch: Partial<Filters>) => void
  setBasis: (basis: PnlBasis) => void
  toggleReviewed: (id: string) => void
  saveNote: (date: string, note: string) => void
  saveMood: (date: string, mood: number) => void
  addAccount: (account: Account, fee?: { amount: number; category: Transaction["category"]; description: string }) => void
  addTrades: (trades: Trade[]) => void
  addTransaction: (tx: Transaction) => void
  loadSample: () => void
  clearJournal: () => void
  setShowInR: (showInR: boolean) => void
  setRDollars: (rDollars: number) => void
  deleteAccount: (id: string) => void
}

const StoreContext = createContext<Store | null>(null)

function withDisplay(state: JournalState): JournalState {
  const rDollars = Number(state.rDollars)
  return {
    ...state,
    rDollars: Number.isFinite(rDollars) && rDollars > 0 ? rDollars : 200,
    showInR: Boolean(state.showInR),
  }
}

function load(): JournalState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return withDisplay(attachApexBook(sampleState()))
    const parsed = JSON.parse(raw) as JournalState
    if (!parsed.accounts || !parsed.trades || !parsed.filters) return withDisplay(attachApexBook(sampleState()))
    return withDisplay(attachApexBook(parsed))
  } catch {
    return withDisplay(attachApexBook(sampleState()))
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<JournalState>(load)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state))
  }, [state])

  const store = useMemo<Store>(() => ({
    state,
    setFilters: (patch) => setState((current) => ({ ...current, filters: { ...current.filters, ...patch } })),
    setBasis: (basis) => setState((current) => ({ ...current, basis })),
    toggleReviewed: (id) => setState((current) => ({
      ...current,
      trades: current.trades.map((trade) => trade.id === id ? { ...trade, reviewed: !trade.reviewed } : trade),
    })),
    saveNote: (date, note) => setState((current) => ({ ...current, notes: { ...current.notes, [date]: note } })),
    saveMood: (date, mood) => setState((current) => ({ ...current, moods: { ...current.moods, [date]: mood } })),
    addAccount: (account, fee) => setState((current) => ({
      ...current,
      accounts: [...current.accounts, account],
      transactions: fee
        ? [...current.transactions, {
            id: `fee-${account.id}`,
            date: account.startDate,
            description: fee.description,
            accountId: account.id,
            firm: account.firm,
            category: fee.category,
            amount: -Math.abs(fee.amount),
            status: "Reviewed",
          }]
        : current.transactions,
    })),
    addTrades: (trades) => setState((current) => ({ ...current, trades: [...current.trades, ...trades] })),
    addTransaction: (tx) => setState((current) => ({ ...current, transactions: [...current.transactions, tx] })),
    loadSample: () => setState(withDisplay(attachApexBook(sampleState()))),
    clearJournal: () => setState((current) => ({
      ...sampleState(),
      accounts: [],
      trades: [],
      transactions: [],
      notes: {},
      moods: {},
      filters: { ...current.filters, accountId: "all" },
      rDollars: current.rDollars,
      showInR: current.showInR,
    })),
    setShowInR: (showInR) => setState((current) => ({ ...current, showInR })),
    setRDollars: (rDollars) => setState((current) => ({ ...current, rDollars })),
    deleteAccount: (id) => setState((current) => ({
      ...current,
      accounts: current.accounts.filter((account) => account.id !== id),
      trades: current.trades.filter((trade) => trade.accountId !== id),
      transactions: current.transactions.filter((tx) => tx.accountId !== id),
      filters: current.filters.accountId === id ? { ...current.filters, accountId: "all" } : current.filters,
    })),
  }), [state])

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error("Store missing")
  return store
}
