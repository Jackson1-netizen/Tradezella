export type Instrument = "Future" | "Stock" | "Forex" | "Crypto" | "Single"
export type Side = "Long" | "Short"
export type Phase = "Evaluation" | "Funded"
export type AccountStatus = "Active" | "Breached"
export type DrawdownType = "Static" | "EOD" | "Trailing"
export type ViewMode = "dollars" | "percent" | "privacy"
export type RangeKey = "all" | "7d" | "30d" | "month" | "custom"
export type PnlBasis = "net" | "gross"
export type Page = "dashboard" | "trades" | "daily" | "longterm" | "prop"

export type Account = {
  id: string
  nickname: string
  firm: string
  broker: string
  size: number
  phase: Phase
  status: AccountStatus
  steps: 1 | 2
  profitTarget: number
  maxDailyLoss: number
  maxDrawdown: number
  drawdownType: DrawdownType
  consistencyPct: number | null
  minTradingDays: number
  startDate: string
}

export type Trade = {
  id: string
  accountId: string
  symbol: string
  instrument: Instrument
  side: Side
  volume: number
  openTime: string
  closeTime: string | null
  openPrice: number
  closePrice: number | null
  grossPnl: number
  commission: number
  fees: number
  status: "Open" | "Closed"
  reviewed: boolean
  strategy: string
  tags: string[]
  note: string
}

export type TxCategory = "Evaluation Fee" | "Reset Fee" | "Activation Fee" | "Payout" | "Refund"

export type Transaction = {
  id: string
  date: string
  description: string
  accountId: string
  firm: string
  category: TxCategory
  amount: number
  status: "Reviewed" | "Not Reviewed" | "Ignored"
}

export type Filters = {
  range: RangeKey
  from: string
  to: string
  accountId: string
  side: "all" | Side
  symbol: string
  instrument: "all" | Instrument
  status: "all" | "Open" | "Closed"
}

export type JournalState = {
  accounts: Account[]
  trades: Trade[]
  transactions: Transaction[]
  notes: Record<string, string>
  moods: Record<string, number>
  filters: Filters
  basis: PnlBasis
  rDollars: number
  showInR: boolean
}
