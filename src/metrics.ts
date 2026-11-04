import type { Account, Filters, JournalState, PnlBasis, Trade, Transaction } from "./types"

export function todayKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + delta)
  return todayKey(date)
}

export function dayOf(stamp: string | null): string | null {
  if (!stamp) return null
  return stamp.slice(0, 10)
}

export function tradeNet(trade: Trade, basis: PnlBasis): number {
  if (basis === "gross") return trade.grossPnl
  return trade.grossPnl - trade.commission - trade.fees
}

export function isWin(net: number): boolean {
  return net > 0.005
}

export function isLoss(net: number): boolean {
  return net < -0.005
}

export function applyFilters(state: JournalState, today = todayKey()): Trade[] {
  const { filters } = state
  return state.trades.filter((trade) => {
    if (filters.accountId !== "all" && trade.accountId !== filters.accountId) return false
    if (filters.side !== "all" && trade.side !== filters.side) return false
    if (filters.instrument !== "all" && trade.instrument !== filters.instrument) return false
    if (filters.status !== "all" && trade.status !== filters.status) return false
    if (filters.symbol && !trade.symbol.toLowerCase().includes(filters.symbol.trim().toLowerCase())) return false
    const day = dayOf(trade.status === "Closed" ? trade.closeTime : trade.openTime)
    if (!day) return false
    return inRange(day, filters, today)
  })
}

export function inRange(day: string, filters: Filters, today: string): boolean {
  if (filters.range === "all") return true
  if (filters.range === "7d") return day >= addDays(today, -6) && day <= today
  if (filters.range === "30d") return day >= addDays(today, -29) && day <= today
  if (filters.range === "month") return day.slice(0, 7) === today.slice(0, 7)
  return day >= filters.from && day <= filters.to
}

export type DayStat = {
  date: string
  trades: Trade[]
  closed: Trade[]
  net: number
  gross: number
  commission: number
  fees: number
  volume: number
  wins: number
  losses: number
  scratches: number
}

export function dayStats(trades: Trade[], basis: PnlBasis): DayStat[] {
  const map = new Map<string, Trade[]>()
  for (const trade of trades) {
    const day = dayOf(trade.status === "Closed" ? trade.closeTime : trade.openTime)
    if (!day) continue
    const list = map.get(day) ?? []
    list.push(trade)
    map.set(day, list)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] < b[0] ? 1 : -1)
    .map(([date, dayTrades]) => {
      const closed = dayTrades.filter((trade) => trade.status === "Closed")
      let net = 0
      let gross = 0
      let commission = 0
      let fees = 0
      let volume = 0
      let wins = 0
      let losses = 0
      let scratches = 0
      for (const trade of closed) {
        const value = tradeNet(trade, basis)
        net += value
        gross += trade.grossPnl
        commission += trade.commission
        fees += trade.fees
        volume += trade.volume
        if (isWin(value)) wins += 1
        else if (isLoss(value)) losses += 1
        else scratches += 1
      }
      return { date, trades: dayTrades, closed, net, gross, commission, fees, volume, wins, losses, scratches }
    })
}

export function profitFactor(nets: number[]): number | null {
  let profit = 0
  let loss = 0
  for (const net of nets) {
    if (net > 0) profit += net
    else if (net < 0) loss += net
  }
  if (loss === 0) return profit > 0 ? null : 0
  return profit / Math.abs(loss)
}

export type Summary = {
  closed: number
  open: number
  net: number
  gross: number
  commission: number
  fees: number
  wins: number
  losses: number
  scratches: number
  winRate: number | null
  dayWinRate: number | null
  avgWin: number | null
  avgLoss: number | null
  avgRatio: number | null
  expectancy: number | null
  averageTrade: number | null
  profitFactor: number | null
  largestWin: number | null
  largestLoss: number | null
  maxDrawdown: number
  maxDrawdownDate: string | null
  peak: number
  dayStreak: number
  tradeStreak: number
  winningDays: number
  losingDays: number
  flatDays: number
  tradingDays: number
  volume: number
  avgHoldMinutes: number | null
}

export function summarize(trades: Trade[], basis: PnlBasis): Summary {
  const closed = trades
    .filter((trade) => trade.status === "Closed")
    .slice()
    .sort((a, b) => (a.closeTime ?? "").localeCompare(b.closeTime ?? ""))
  const nets = closed.map((trade) => tradeNet(trade, basis))
  const wins = nets.filter(isWin)
  const losses = nets.filter(isLoss)
  const days = dayStats(closed, basis).slice().reverse()
  let peak = 0
  let cum = 0
  let maxDrawdown = 0
  let maxDrawdownDate: string | null = null
  let winningDays = 0
  let losingDays = 0
  let flatDays = 0
  for (const day of days) {
    cum += day.net
    if (cum > peak) peak = cum
    const drop = peak - cum
    if (drop > maxDrawdown) {
      maxDrawdown = drop
      maxDrawdownDate = day.date
    }
    if (isWin(day.net)) winningDays += 1
    else if (isLoss(day.net)) losingDays += 1
    else if (day.closed.length) flatDays += 1
  }
  const avgWin = wins.length ? wins.reduce((sum, net) => sum + net, 0) / wins.length : null
  const avgLoss = losses.length ? losses.reduce((sum, net) => sum + net, 0) / losses.length : null
  const winRate = closed.length ? wins.length / closed.length : null
  const lossRate = closed.length ? losses.length / closed.length : null
  const expectancy = avgWin != null && avgLoss != null && winRate != null && lossRate != null
    ? winRate * avgWin + lossRate * avgLoss
    : closed.length
      ? nets.reduce((sum, net) => sum + net, 0) / closed.length
      : null
  let hold = 0
  let holdCount = 0
  for (const trade of closed) {
    if (!trade.closeTime) continue
    const minutes = (Date.parse(trade.closeTime) - Date.parse(trade.openTime)) / 60000
    if (Number.isFinite(minutes) && minutes >= 0) {
      hold += minutes
      holdCount += 1
    }
  }
  return {
    closed: closed.length,
    open: trades.filter((trade) => trade.status === "Open").length,
    net: nets.reduce((sum, net) => sum + net, 0),
    gross: closed.reduce((sum, trade) => sum + trade.grossPnl, 0),
    commission: closed.reduce((sum, trade) => sum + trade.commission, 0),
    fees: closed.reduce((sum, trade) => sum + trade.fees, 0),
    wins: wins.length,
    losses: losses.length,
    scratches: nets.length - wins.length - losses.length,
    winRate,
    dayWinRate: days.length ? winningDays / days.length : null,
    avgWin,
    avgLoss,
    avgRatio: avgWin != null && avgLoss != null && avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null,
    expectancy,
    averageTrade: closed.length ? nets.reduce((sum, net) => sum + net, 0) / closed.length : null,
    profitFactor: profitFactor(nets),
    largestWin: wins.length ? Math.max(...wins) : null,
    largestLoss: losses.length ? Math.min(...losses) : null,
    maxDrawdown,
    maxDrawdownDate,
    peak,
    dayStreak: streak(days.map((day) => day.net)),
    tradeStreak: streak(nets),
    winningDays,
    losingDays,
    flatDays,
    tradingDays: new Set(trades.map((trade) => dayOf(trade.openTime)).filter(Boolean)).size,
    volume: closed.reduce((sum, trade) => sum + trade.volume, 0),
    avgHoldMinutes: holdCount ? hold / holdCount : null,
  }
}

function streak(values: number[]): number {
  let count = 0
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (!isWin(values[i])) break
    count += 1
  }
  return count
}

function band(value: number, rows: Array<[number, number]>, floor: number): number {
  for (const [threshold, score] of rows) {
    if (value >= threshold) return score
  }
  return floor
}

export function edgeScore(summary: Summary, days: DayStat[]): number | null {
  if (!summary.closed) return null
  const winScore = summary.winRate == null ? 0 : Math.min(100, (summary.winRate * 100 / 60) * 100)
  const ratioScore = summary.avgRatio == null ? 20 : band(summary.avgRatio, [[2.6, 100], [2.4, 95], [2.2, 85], [2, 75], [1.9, 65], [1.8, 55]], 20)
  const factorScore = summary.profitFactor == null ? 100 : band(summary.profitFactor, [[2.6, 100], [2.4, 95], [2.2, 85], [2, 75], [1.9, 65], [1.8, 55]], 20)
  const ddPct = summary.peak > 0 ? (summary.maxDrawdown / summary.peak) * 100 : 0
  const ddScore = Math.max(0, Math.min(100, 100 - ddPct))
  const recovery = summary.maxDrawdown > 0 ? summary.net / summary.maxDrawdown : summary.net > 0 ? 3.5 : 0
  const recoveryScore = band(recovery, [[3.5, 100], [3, 80], [2.5, 65], [2, 55], [1.5, 40], [1, 15]], 0)
  const daily = days.map((day) => day.net)
  const mean = daily.length ? daily.reduce((sum, net) => sum + net, 0) / daily.length : 0
  let consistency = 0
  if (mean >= 0 && summary.net > 0 && daily.length) {
    const variance = daily.reduce((sum, net) => sum + (net - mean) ** 2, 0) / daily.length
    consistency = Math.sqrt(variance) / summary.net
  }
  const consistencyScore = Math.max(0, Math.min(100, 100 - consistency * 100))
  const score = factorScore * 0.25 + ratioScore * 0.2 + ddScore * 0.2 + winScore * 0.15 + recoveryScore * 0.1 + consistencyScore * 0.1
  return Math.round(score * 10) / 10
}

export function scoreLabel(score: number): string {
  if (score >= 80) return "Great"
  if (score >= 65) return "Solid"
  if (score >= 50) return "Mixed"
  return "Weak"
}

export type WeekStat = DayStat & { start: string; end: string; days: DayStat[] }

export function weekStats(days: DayStat[]): WeekStat[] {
  const map = new Map<string, DayStat[]>()
  for (const day of days) {
    const start = weekStart(day.date)
    const list = map.get(start) ?? []
    list.push(day)
    map.set(start, list)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] < b[0] ? 1 : -1)
    .map(([start, list]) => {
      const sorted = list.slice().sort((a, b) => a.date < b.date ? -1 : 1)
      return {
        date: start,
        start,
        end: addDays(start, 6),
        days: sorted,
        trades: sorted.flatMap((day) => day.trades),
        closed: sorted.flatMap((day) => day.closed),
        net: sorted.reduce((sum, day) => sum + day.net, 0),
        gross: sorted.reduce((sum, day) => sum + day.gross, 0),
        commission: sorted.reduce((sum, day) => sum + day.commission, 0),
        fees: sorted.reduce((sum, day) => sum + day.fees, 0),
        volume: sorted.reduce((sum, day) => sum + day.volume, 0),
        wins: sorted.reduce((sum, day) => sum + day.wins, 0),
        losses: sorted.reduce((sum, day) => sum + day.losses, 0),
        scratches: sorted.reduce((sum, day) => sum + day.scratches, 0),
      }
    })
}

export function weekStart(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const sunday = new Date(date)
  sunday.setDate(date.getDate() - date.getDay())
  return todayKey(sunday)
}

export function monthGrid(month: string): Array<{ date: string; inMonth: boolean }> {
  const [y, m] = month.split("-").map(Number)
  const first = new Date(y, m - 1, 1)
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  const cells = []
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    const key = todayKey(date)
    cells.push({ date: key, inMonth: key.slice(0, 7) === month })
  }
  return cells
}

export function accountWithdrawn(account: Account, transactions: Transaction[] = []): number {
  return transactions
    .filter((tx) => tx.accountId === account.id && tx.category === "Payout" && tx.status !== "Ignored")
    .reduce((sum, tx) => sum + (tx.withdrawn ?? 0), 0)
}

export function accountBalance(account: Account, trades: Trade[], basis: PnlBasis, transactions: Transaction[] = []): number {
  const net = trades
    .filter((trade) => trade.accountId === account.id && trade.status === "Closed")
    .reduce((sum, trade) => sum + tradeNet(trade, basis), 0)
  return account.size + net - accountWithdrawn(account, transactions)
}

export function ruleProgress(account: Account, trades: Trade[], basis: PnlBasis, transactions: Transaction[] = []) {
  const mine = trades.filter((trade) => trade.accountId === account.id)
  const closed = mine.filter((trade) => trade.status === "Closed")
  const summary = summarize(closed, basis)
  const days = dayStats(closed, basis)
  const today = todayKey()
  const todayNet = days.find((day) => day.date === today)?.net ?? 0
  const best = days.reduce((max, day) => Math.max(max, day.net), 0)
  const tradedDays = new Set(mine.map((trade) => dayOf(trade.openTime)).filter(Boolean)).size
  const winningDayProfit = days.reduce((sum, day) => sum + Math.max(0, day.net), 0)
  const consistency = winningDayProfit > 0 ? (best / winningDayProfit) * 100 : 0
  return {
    net: summary.net,
    balance: account.size + summary.net - accountWithdrawn(account, transactions),
    targetPct: account.profitTarget > 0 ? summary.net / account.profitTarget : 0,
    dailyUsed: Math.max(0, -todayNet),
    drawdownUsed: summary.maxDrawdown,
    tradedDays,
    consistency,
    best,
  }
}
