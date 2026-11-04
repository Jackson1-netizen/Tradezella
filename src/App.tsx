import { useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react"
import { EXECUTION_TEMPLATE, HISTORY_TEMPLATE, importCsv } from "./csv"
import { compactDate, dollars, factor, formatR, longDate, monthLabel, pct, shiftMonth, shown, tone, clock } from "./format"
import { accountBalance, applyFilters, dayStats, edgeScore, monthGrid, ruleProgress, scoreLabel, summarize, todayKey, tradeNet, weekStats, type DayStat } from "./metrics"
import { useStore } from "./store"
import type { Account, DrawdownType, Page, Phase, Trade, TxCategory, ViewMode } from "./types"

const PAGES: Array<{ id: Page; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "trades", label: "Trade log" },
  { id: "daily", label: "Daily summary" },
  { id: "longterm", label: "Long-term" },
  { id: "prop", label: "Prop firm" },
]

const MOODS = ["Very negative", "Negative", "Neutral", "Positive", "Very positive"]

export default function App() {
  const store = useStore()
  const { state } = store
  const [page, setPage] = useState<Page>("dashboard")
  const [mode, setMode] = useState<ViewMode>("dollars")
  const [logTab, setLogTab] = useState<"day" | "week" | "all">("day")
  const [propTab, setPropTab] = useState<"dashboard" | "accounts" | "transactions">("dashboard")
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "close", dir: -1 })
  const [importNote, setImportNote] = useState("")
  const importRef = useRef<HTMLDialogElement>(null)
  const trackRef = useRef<HTMLDialogElement>(null)
  const txRef = useRef<HTMLDialogElement>(null)

  const today = todayKey()
  const trades = useMemo(() => applyFilters(state, today), [state, today])
  const days = useMemo(() => dayStats(trades, state.basis), [trades, state.basis])
  const summary = useMemo(() => summarize(trades, state.basis), [trades, state.basis])
  const score = useMemo(() => edgeScore(summary, days), [summary, days])
  const balance = state.accounts
    .filter((account) => state.filters.accountId === "all" || account.id === state.filters.accountId)
    .reduce((sum, account) => sum + account.size, 0)

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">J</div>
          <div>
            <strong>JACKS0N</strong>
            <span>Prop journal</span>
          </div>
        </div>
        <div className="sidebar-actions">
          <button className="primary" type="button" onClick={() => { setImportNote(""); importRef.current?.showModal() }}>Import trades</button>
          <button className="ghost" type="button" onClick={() => trackRef.current?.showModal()}>Track prop account</button>
        </div>
        <nav className="nav" aria-label="Journal">
          {PAGES.map((item) => (
            <button key={item.id} type="button" aria-current={page === item.id ? "page" : undefined} onClick={() => setPage(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <p className="side-note">Sample trades stay in this browser. Nothing here asks for a broker login.</p>
      </aside>
      <main className="main">
        <FilterBar mode={mode} setMode={setMode} />
        {page === "dashboard" && <Dashboard trades={trades} days={days} summary={summary} score={score} mode={mode} balance={balance} />}
        {page === "trades" && <TradeLog tab={logTab} setTab={setLogTab} trades={trades} days={days} summary={summary} mode={mode} balance={balance} sort={sort} setSort={setSort} />}
        {page === "daily" && <Daily days={days} mode={mode} balance={balance} />}
        {page === "longterm" && <LongTerm days={days} summary={summary} mode={mode} balance={balance} />}
        {page === "prop" && <PropFirm tab={propTab} setTab={setPropTab} mode={mode} onTransaction={() => txRef.current?.showModal()} />}
      </main>
      <ImportDialog dialogRef={importRef} note={importNote} setNote={setImportNote} />
      <TrackDialog dialogRef={trackRef} />
      <TransactionDialog dialogRef={txRef} />
    </div>
  )
}

function FilterBar({ mode, setMode }: { mode: ViewMode; setMode: (mode: ViewMode) => void }) {
  const { state, setFilters, setBasis } = useStore()
  const { filters } = state
  return (
    <div className="topbar">
      <label className="field">Range
        <select value={filters.range} onChange={(event) => setFilters({ range: event.target.value as typeof filters.range })}>
          <option value="all">All dates</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="month">This month</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      {filters.range === "custom" && (
        <>
          <label className="field">From
            <input type="date" value={filters.from} onChange={(event) => setFilters({ from: event.target.value })} />
          </label>
          <label className="field">To
            <input type="date" value={filters.to} onChange={(event) => setFilters({ to: event.target.value })} />
          </label>
        </>
      )}
      <label className="field">Account
        <select value={filters.accountId} onChange={(event) => setFilters({ accountId: event.target.value })}>
          <option value="all">All accounts</option>
          {state.accounts.map((account) => <option key={account.id} value={account.id}>{account.nickname}</option>)}
        </select>
      </label>
      <label className="field">Symbol
        <input aria-label="Symbol" value={filters.symbol} placeholder="Any" onChange={(event) => setFilters({ symbol: event.target.value })} />
      </label>
      <label className="field">Side
        <select value={filters.side} onChange={(event) => setFilters({ side: event.target.value as typeof filters.side })}>
          <option value="all">All</option>
          <option value="Long">Long</option>
          <option value="Short">Short</option>
        </select>
      </label>
      <label className="field">Instrument
        <select value={filters.instrument} onChange={(event) => setFilters({ instrument: event.target.value as typeof filters.instrument })}>
          <option value="all">All</option>
          <option>Future</option>
          <option>Stock</option>
          <option>Forex</option>
          <option>Crypto</option>
          <option>Single</option>
        </select>
      </label>
      <label className="field">Status
        <select value={filters.status} onChange={(event) => setFilters({ status: event.target.value as typeof filters.status })}>
          <option value="all">Open and closed</option>
          <option value="Closed">Closed</option>
          <option value="Open">Open</option>
        </select>
      </label>
      <div className="segment" role="group" aria-label="Number format">
        {(["dollars", "percent", "privacy"] as ViewMode[]).map((item) => (
          <button key={item} type="button" aria-pressed={mode === item} onClick={() => setMode(item)}>
            {item === "dollars" ? "Dollars" : item === "percent" ? "Percent" : "Privacy"}
          </button>
        ))}
      </div>
      <div className="segment" role="group" aria-label="P&L basis">
        <button type="button" aria-pressed={state.basis === "net"} onClick={() => setBasis("net")}>Net</button>
        <button type="button" aria-pressed={state.basis === "gross"} onClick={() => setBasis("gross")}>Gross</button>
      </div>
    </div>
  )
}

function Money({ value, mode, balance, signed = true }: { value: number; mode: ViewMode; balance: number; signed?: boolean }) {
  return <span className={tone(value)} aria-label={dollars(value, signed)}><span aria-hidden="true">{shown(value, mode, balance, signed)}</span></span>
}

function Dashboard({ trades, days, summary, score, mode, balance }: {
  trades: Trade[]
  days: ReturnType<typeof dayStats>
  summary: ReturnType<typeof summarize>
  score: number | null
  mode: ViewMode
  balance: number
}) {
  const richest = useMemo(() => {
    const counts = new Map<string, number>()
    for (const day of days) counts.set(day.date.slice(0, 7), (counts.get(day.date.slice(0, 7)) ?? 0) + 1)
    let best = todayKey().slice(0, 7)
    let count = -1
    for (const [month, total] of counts) if (total > count) { best = month; count = total }
    return best
  }, [days])
  const [month, setMonth] = useState(richest)
  const [picked, setPicked] = useState<string | null>(null)
  const { state, setShowInR, setRDollars } = useStore()
  const byDay = new Map(days.map((day) => [day.date, day]))
  const pickedDay = picked ? byDay.get(picked) : undefined
  const recent = trades.filter((trade) => trade.status === "Closed").slice().sort((a, b) => (b.closeTime ?? "").localeCompare(a.closeTime ?? "")).slice(0, 6)

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="kicker">Tracking</p>
          <h1>Dashboard</h1>
          <p className="sub">{summary.closed} closed trades · {summary.open} open · P&amp;L is booked on the close date.</p>
        </div>
      </header>
      {!summary.closed && <Empty title="No closed trades in this view" body="Import a CSV or load the sample prop book. Open trades stay off the daily P&L until they close." />}
      <div className="widgets">
        <Widget label="Net P&L" value={<Money value={summary.net} mode={mode} balance={balance} />} hint="Closed trades in the filter" />
        <Widget label="Trade win %" value={pct(summary.winRate)} hint={`${summary.wins} wins · ${summary.losses} losses · ${summary.scratches} flat`} />
        <Widget label="Profit factor" value={factor(summary.profitFactor)} hint="Gross profits ÷ gross losses" />
        <Widget label="Day win %" value={pct(summary.dayWinRate)} hint={`${summary.winningDays} green days`} />
        <Widget label="Avg win / loss" value={summary.avgRatio == null ? "—" : summary.avgRatio.toFixed(2)} hint="Size of winners versus losers" />
        <Widget label="Expectancy" value={summary.expectancy == null ? "—" : <Money value={summary.expectancy} mode={mode} balance={balance} />} hint="Per closed trade" />
        <Widget label="Max drawdown" value={<Money value={-summary.maxDrawdown} mode={mode} balance={balance} />} hint={summary.maxDrawdownDate ? `On ${compactDate(summary.maxDrawdownDate)}` : "No peak yet"} />
        <Widget label="Win streak" value={String(summary.tradeStreak)} hint={`${summary.dayStreak} winning days in a row`} />
      </div>
      <div className="layout">
        <article className="card">
          <div className="calendar-head">
            <h2>{monthLabel(month)}</h2>
            <div className="inline-actions">
              <button className="secondary" type="button" aria-pressed={state.showInR} onClick={() => setShowInR(!state.showInR)}>Show in R</button>
              <label className="field r-field">1R $
                <input aria-label="1R in dollars" inputMode="decimal" min="1" step="1" type="number" value={state.rDollars} onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next) && next > 0) setRDollars(next)
                }} />
              </label>
              <button className="secondary" type="button" onClick={() => setMonth(shiftMonth(month, -1))}>Previous</button>
              <button className="secondary" type="button" onClick={() => setMonth(todayKey().slice(0, 7))}>This month</button>
              <button className="secondary" type="button" onClick={() => setMonth(shiftMonth(month, 1))}>Next</button>
            </div>
          </div>
          <div className="calendar" aria-label="Performance calendar">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="dow">{day}</div>)}
            {monthGrid(month).map((cell) => {
              const day = byDay.get(cell.date)
              const closed = day?.closed.length ?? 0
              const kind = !closed ? "" : day!.net > 0.005 ? "win" : day!.net < -0.005 ? "loss" : ""
              const amount = day && closed ? (state.showInR ? formatR(day.net, state.rDollars) : shown(day.net, mode, balance)) : ""
              return (
                <button key={cell.date} type="button" className={`cell ${kind} ${cell.inMonth ? "" : "out"} ${state.notes[cell.date] ? "has-note" : ""}`} onClick={() => setPicked(cell.date)}>
                  <small>{Number(cell.date.slice(8))}</small>
                  {closed > 0 && day && <>
                    <span className={`amt ${tone(day.net)}`}>{amount}</span>
                    <small>{closed} trade{closed === 1 ? "" : "s"}</small>
                  </>}
                </button>
              )
            })}
          </div>
        </article>
        <div>
          <WeekSummary month={month} byDay={byDay} showInR={state.showInR} rDollars={state.rDollars} mode={mode} balance={balance} />
          <article className="card" style={{ marginBottom: 12 }}>
            <p className="label">Edge score</p>
            <p className="score-num">{score == null ? "—" : score.toFixed(1)}</p>
            <p className="hint">{score == null ? "Needs closed trades" : scoreLabel(score)} · six public weights, computed locally</p>
            <div className="meter" aria-hidden="true">{score != null && <i style={{ left: `${score}%` }} />}</div>
          </article>
          <article className="card">
            <p className="label">{pickedDay ? longDate(pickedDay.date) : "Recent closes"}</p>
            {picked && !pickedDay && <p className="hint">No closed P&amp;L on {longDate(picked)}.</p>}
            <TradeTable trades={pickedDay ? pickedDay.closed : recent} mode={mode} balance={balance} withDate />
          </article>
        </div>
      </div>
    </section>
  )
}

function WeekSummary({ month, byDay, showInR, rDollars, mode, balance }: {
  month: string
  byDay: Map<string, DayStat>
  showInR: boolean
  rDollars: number
  mode: ViewMode
  balance: number
}) {
  const today = todayKey()
  const cells = monthGrid(month)
  const weeks = []
  for (let index = 0; index < cells.length; index += 7) {
    const slice = cells.slice(index, index + 7)
    const traded = slice.flatMap((cell) => {
      const day = byDay.get(cell.date)
      return day && day.closed.length ? [day] : []
    })
    if (!traded.length) continue
    const net = traded.reduce((sum, day) => sum + day.net, 0)
    weeks.push({
      start: slice[0].date,
      end: slice[6].date,
      net,
      count: traded.length,
      inProgress: today >= slice[0].date && today <= slice[6].date,
    })
  }
  return (
    <article className="card week-summary">
      <h2>Week summary</h2>
      <p className="hint">Adds only days with closed trades. A week still in progress shows the total so far.</p>
      {weeks.length === 0 && <p className="hint">No closed trades in this month.</p>}
      {weeks.map((week) => (
        <p key={week.start} className="row-between week-row">
          <span>{compactDate(week.start)} – {compactDate(week.end)} · {week.count} day{week.count === 1 ? "" : "s"}{week.inProgress ? " · so far" : ""}</span>
          <strong className={tone(week.net)}>{showInR ? formatR(week.net, rDollars) : shown(week.net, mode, balance)}</strong>
        </p>
      ))}
    </article>
  )
}

function Widget({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return <article className="card"><p className="label">{label}</p><strong>{value}</strong><p className="hint">{hint}</p></article>
}

function TradeLog({ tab, setTab, trades, days, summary, mode, balance, sort, setSort }: {
  tab: "day" | "week" | "all"
  setTab: (tab: "day" | "week" | "all") => void
  trades: Trade[]
  days: DayStat[]
  summary: ReturnType<typeof summarize>
  mode: ViewMode
  balance: number
  sort: { key: string; dir: 1 | -1 }
  setSort: (sort: { key: string; dir: 1 | -1 }) => void
}) {
  const basis = useStore().state.basis
  const weeks = weekStats(days)
  const sorted = trades.slice().sort((a, b) => {
    const value = (trade: Trade) => {
      if (sort.key === "symbol") return trade.symbol
      if (sort.key === "open") return trade.openTime
      if (sort.key === "status") return trade.status
      return trade.closeTime ?? trade.openTime
    }
    if (sort.key === "volume") return (a.volume - b.volume) * sort.dir
    if (sort.key === "pnl") return (tradeNet(a, basis) - tradeNet(b, basis)) * sort.dir
    return value(a).localeCompare(value(b)) * sort.dir
  })
  return (
    <section>
      <header className="page-head">
        <div>
          <p className="kicker">Journal</p>
          <h1>Trade log</h1>
          <p className="sub">Day, week, and the full book share the same filters.</p>
        </div>
      </header>
      <div className="tabs" role="tablist">
        {(["day", "week", "all"] as const).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>
            {item === "day" ? "Day" : item === "week" ? "Week" : "All"}
          </button>
        ))}
      </div>
      {tab === "all" && (
        <div className="widgets">
          <Widget label="Net cumulative" value={<Money value={summary.net} mode={mode} balance={balance} />} hint="Filtered closed trades" />
          <Widget label="Profit factor" value={factor(summary.profitFactor)} hint="Wins over losses" />
          <Widget label="Trade win %" value={pct(summary.winRate)} hint={`${summary.closed} closed`} />
          <Widget label="Avg win / loss" value={summary.avgWin == null || summary.avgLoss == null ? "—" : <><Money value={summary.avgWin} mode={mode} balance={balance} /> / <Money value={summary.avgLoss} mode={mode} balance={balance} /></>} hint="Per trade" />
        </div>
      )}
      {!trades.length && <Empty title="No trades match these filters" body="Clear the symbol or account filter, or import a CSV into this account." />}
      {tab === "day" && days.map((day) => <DayBlock key={day.date} day={day} mode={mode} balance={balance} />)}
      {tab === "week" && weeks.map((week) => (
        <details key={week.start} className="week">
          <summary>
            <span>{compactDate(week.start)} – {compactDate(week.end)}</span>
            <strong className={tone(week.net)}><Money value={week.net} mode={mode} balance={balance} /></strong>
          </summary>
          <div className="week-body">
            <div className="stats">
              <span>{week.closed.length} trades</span>
              <span>Win rate {week.closed.length ? pct(week.wins / week.closed.length) : "—"}</span>
              <span>Volume {week.volume}</span>
              <span>Commissions {dollars(week.commission, false)}</span>
            </div>
            <div className="calendar">
              {Array.from({ length: 7 }, (_, index) => {
                const date = addDaysLocal(week.start, index)
                const day = week.days.find((item) => item.date === date)
                return <div key={date} className={`cell ${day ? tone(day.net) : ""}`}><small>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][index]}</small>{day ? <span className={`amt ${tone(day.net)}`}>{shown(day.net, mode, balance)}</span> : <small>No trades</small>}</div>
              })}
            </div>
          </div>
        </details>
      ))}
      {tab === "all" && trades.length > 0 && (
        <article className="card table-wrap">
          <table>
            <caption>All filtered trades</caption>
            <thead>
              <tr>
                <SortHead label="Open" id="open" sort={sort} setSort={setSort} />
                <SortHead label="Symbol" id="symbol" sort={sort} setSort={setSort} />
                <th>Side</th>
                <SortHead label="Status" id="status" sort={sort} setSort={setSort} />
                <SortHead label="Close" id="close" sort={sort} setSort={setSort} />
                <SortHead label="Volume" id="volume" sort={sort} setSort={setSort} />
                <SortHead label="Net P&L" id="pnl" sort={sort} setSort={setSort} />
                <th>Net ROI</th>
                <th>Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((trade) => <TradeRow key={trade.id} trade={trade} mode={mode} balance={balance} />)}
            </tbody>
          </table>
        </article>
      )}
    </section>
  )
}

function addDaysLocal(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number)
  const date = new Date(y, m - 1, d + delta)
  return todayKey(date)
}

function SortHead({ label, id, sort, setSort }: { label: string; id: string; sort: { key: string; dir: 1 | -1 }; setSort: (sort: { key: string; dir: 1 | -1 }) => void }) {
  return <th><button type="button" onClick={() => setSort({ key: id, dir: sort.key === id && sort.dir === 1 ? -1 : 1 })}>{label}</button></th>
}

function DayBlock({ day, mode, balance }: { day: DayStat; mode: ViewMode; balance: number }) {
  const { state, saveNote, saveMood } = useStore()
  const winRate = day.closed.length ? day.wins / day.closed.length : null
  const grossProfit = day.closed.reduce((sum, trade) => sum + Math.max(0, tradeNet(trade, state.basis)), 0)
  const grossLoss = day.closed.reduce((sum, trade) => sum + Math.min(0, tradeNet(trade, state.basis)), 0)
  const dayFactor = grossLoss === 0 ? (grossProfit > 0 ? null : 0) : grossProfit / Math.abs(grossLoss)
  return (
    <details className="day" open={day.date === "2026-11-02"}>
      <summary>
        <span>{longDate(day.date)} · {day.closed.length} closed{state.notes[day.date] ? " · note" : ""}</span>
        <strong className={tone(day.net)}><Money value={day.net} mode={mode} balance={balance} /></strong>
      </summary>
      <div className="day-body">
        <div className="stats">
          <span>Net <Money value={day.net} mode={mode} balance={balance} /></span>
          <span>Gross {dollars(day.gross)}</span>
          <span>Win rate {pct(winRate)}</span>
          <span>{day.wins} / {day.losses}</span>
          <span>Volume {day.volume}</span>
          <span>{dayFactor == null ? "PF no losses" : `PF ${dayFactor.toFixed(2)}`}</span>
          <span>Commissions {dollars(day.commission, false)}</span>
        </div>
        <p className="label">How did this day feel?</p>
        <div className="moods">
          {MOODS.map((label, index) => (
            <button key={label} type="button" aria-pressed={state.moods[day.date] === index + 1} onClick={() => saveMood(day.date, index + 1)}>{label}</button>
          ))}
        </div>
        <label className="field">Day note
          <textarea defaultValue={state.notes[day.date] ?? ""} onBlur={(event) => saveNote(day.date, event.target.value)} />
        </label>
        <TradeTable trades={day.trades} mode={mode} balance={balance} />
      </div>
    </details>
  )
}

function TradeTable({ trades, mode, balance, withDate = false }: { trades: Trade[]; mode: ViewMode; balance: number; withDate?: boolean }) {
  const basis = useStore().state.basis
  if (!trades.length) return <p className="hint">Nothing in this list.</p>
  return (
    <div className="table-wrap">
      <table>
        <caption>Trades</caption>
        <thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Net P&L</th><th>Strategy</th></tr></thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.id}>
              <td>{withDate ? `${(trade.closeTime ?? trade.openTime).slice(5, 10)} ${clock(trade.closeTime ?? trade.openTime)}` : clock(trade.closeTime ?? trade.openTime)}</td>
              <td>{trade.symbol}</td>
              <td>{trade.side}</td>
              <td>{trade.status === "Open" ? "Open" : <Money value={tradeNet(trade, basis)} mode={mode} balance={balance} />}</td>
              <td>{trade.strategy || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TradeRow({ trade, mode, balance }: { trade: Trade; mode: ViewMode; balance: number }) {
  const { state, toggleReviewed } = useStore()
  const account = state.accounts.find((item) => item.id === trade.accountId)
  const net = tradeNet(trade, state.basis)
  const roi = account && trade.status === "Closed" ? net / account.size : null
  return (
    <tr>
      <td>{trade.openTime.replace("T", " ").slice(0, 16)}</td>
      <td>{trade.symbol}</td>
      <td>{trade.side}</td>
      <td>{trade.status}</td>
      <td>{trade.closeTime ? trade.closeTime.replace("T", " ").slice(0, 16) : "—"}</td>
      <td>{trade.volume}</td>
      <td>{trade.status === "Open" ? "—" : <Money value={net} mode={mode} balance={balance} />}</td>
      <td>{roi == null ? "—" : pct(roi)}</td>
      <td><input type="checkbox" checked={trade.reviewed} aria-label={`Reviewed ${trade.symbol}`} onChange={() => toggleReviewed(trade.id)} /></td>
    </tr>
  )
}

function Daily({ days, mode, balance }: { days: DayStat[]; mode: ViewMode; balance: number }) {
  return (
    <section>
      <header className="page-head">
        <div>
          <p className="kicker">End of day</p>
          <h1>Daily summary</h1>
          <p className="sub">P&amp;L lands on the close. Notes and the five-step mood stay with the session.</p>
        </div>
      </header>
      {!days.length && <Empty title="No sessions in this range" body="A day appears after a trade closes, or after you import history." />}
      {days.map((day) => <DayBlock key={day.date} day={day} mode={mode} balance={balance} />)}
    </section>
  )
}

function LongTerm({ days, summary, mode, balance }: { days: DayStat[]; summary: ReturnType<typeof summarize>; mode: ViewMode; balance: number }) {
  const basis = useStore().state.basis
  const weeks = weekStats(days).slice(0, 8).reverse()
  const max = Math.max(1, ...weeks.map((week) => Math.abs(week.net)))
  const months = new Map<string, { net: number; trades: number; days: number }>()
  for (const day of days) {
    const key = day.date.slice(0, 7)
    const current = months.get(key) ?? { net: 0, trades: 0, days: 0 }
    current.net += day.net
    current.trades += day.closed.length
    current.days += day.closed.length ? 1 : 0
    months.set(key, current)
  }
  return (
    <section>
      <header className="page-head">
        <div>
          <p className="kicker">Reports</p>
          <h1>Long-term summary</h1>
          <p className="sub">Overview stats for the current filters. Switch Net and Gross in the bar above.</p>
        </div>
      </header>
      {!summary.closed && <Empty title="Not enough closed trades" body="The long view waits for closes. Open positions are counted, but they do not move P&L yet." />}
      <div className="widgets">
        <Widget label="Total P&L" value={<Money value={summary.net} mode={mode} balance={balance} />} hint={basis === "net" ? "Net of commission and fees" : "Gross, fees excluded"} />
        <Widget label="Closed trades" value={String(summary.closed)} hint={`${summary.wins} / ${summary.losses} / ${summary.scratches} flat`} />
        <Widget label="Winning days" value={String(summary.winningDays)} hint={`${summary.losingDays} losing · ${summary.flatDays} flat`} />
        <Widget label="Trading days" value={String(summary.tradingDays)} hint="Days with an entry" />
        <Widget label="Average trade" value={summary.averageTrade == null ? "—" : <Money value={summary.averageTrade} mode={mode} balance={balance} />} hint="Mean closed result" />
        <Widget label="Average daily" value={days.length ? <Money value={summary.net / days.length} mode={mode} balance={balance} /> : "—"} hint="Across days with closes" />
        <Widget label="Largest win" value={summary.largestWin == null ? "—" : <Money value={summary.largestWin} mode={mode} balance={balance} />} hint="Single trade" />
        <Widget label="Largest loss" value={summary.largestLoss == null ? "—" : <Money value={summary.largestLoss} mode={mode} balance={balance} />} hint="Single trade" />
        <Widget label="Commissions" value={dollars(summary.commission, false)} hint={`Fees ${dollars(summary.fees, false)}`} />
        <Widget label="Avg hold" value={summary.avgHoldMinutes == null ? "—" : `${Math.round(summary.avgHoldMinutes)} min`} hint="Closed trades" />
        <Widget label="Volume" value={summary.volume.toLocaleString("en-US")} hint="Contracts or units" />
        <Widget label="Open trades" value={String(summary.open)} hint="Excluded from P&L" />
      </div>
      <div className="layout">
        <article className="card">
          <h2>Weekly P&L</h2>
          <div className="bars">
            {weeks.map((week) => (
              <div key={week.start}>
                <i className={tone(week.net)} style={{ height: `${Math.max(8, (Math.abs(week.net) / max) * 100)}%`, background: week.net >= 0 ? "#0f8a4b" : "#c43838" }} />
                <span>{compactDate(week.start)}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="card">
          <h2>Monthly recap</h2>
          {[...months.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1).map(([month, recap]) => (
            <p key={month} className="row-between" style={{ marginTop: 10 }}>
              <span>{monthLabel(month)} · {recap.trades} trades · {recap.days} days</span>
              <strong className={tone(recap.net)}><Money value={recap.net} mode={mode} balance={balance} /></strong>
            </p>
          ))}
        </article>
      </div>
    </section>
  )
}

function PropFirm({ tab, setTab, mode, onTransaction }: { tab: "dashboard" | "accounts" | "transactions"; setTab: (tab: "dashboard" | "accounts" | "transactions") => void; mode: ViewMode; onTransaction: () => void }) {
  const { state, loadSample, clearJournal, deleteAccount } = useStore()
  const deleteRef = useRef<HTMLDialogElement>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const pending = state.accounts.find((account) => account.id === pendingDelete)
  const { basis } = state
  const funded = state.accounts.filter((account) => account.phase === "Funded" && account.status === "Active")
  const evals = state.accounts.filter((account) => account.phase === "Evaluation" && account.status === "Active")
  const spent = state.transactions.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  const earned = state.transactions.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0)
  const net = earned - spent
  const roi = spent ? net / spent : 0
  return (
    <section>
      <header className="page-head">
        <div>
          <p className="kicker">Prop firm</p>
          <h1>Accounts and cash</h1>
          <p className="sub">Fees are negative. Payouts are positive. Trade P&amp;L stays in the journal.</p>
        </div>
        <div className="inline-actions">
          <button className="secondary" type="button" onClick={loadSample}>Reset to Alpha accounts</button>
          <button className="secondary" type="button" onClick={clearJournal}>Clear journal</button>
          <button className="primary" type="button" onClick={onTransaction}>Add transaction</button>
        </div>
      </header>
      <div className="tabs" role="tablist">
        {(["dashboard", "accounts", "transactions"] as const).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>
        ))}
      </div>
      {!state.accounts.length && <Empty title="No prop accounts yet" body="Track an account with rules only, or reset to the Alpha Futures accounts. Broker passwords are not part of this journal." />}
      {tab === "dashboard" && state.accounts.length > 0 && (
        <div className="prop-cards">
          <article className="card">
            <p className="label">Net total</p>
            <strong className={tone(net)}><Money value={net} mode={mode} balance={spent || 1} /></strong>
            <p className="hint">{state.accounts.length} prop accounts · ROI {pct(roi)}</p>
          </article>
          <Widget label="Funded" value={dollars(funded.reduce((sum, account) => sum + accountBalance(account, state.trades, basis, state.transactions), 0), false)} hint={`${funded.length} active`} />
          <Widget label="Evaluation" value={dollars(evals.reduce((sum, account) => sum + accountBalance(account, state.trades, basis, state.transactions), 0), false)} hint={`${evals.length} active`} />
          <Widget label="Total spent" value={dollars(-spent)} hint="Evals, resets, activation" />
          <Widget label="Total earned" value={dollars(earned)} hint="Payouts and refunds" />
        </div>
      )}
      {tab === "accounts" && (
        <div className="account-grid">
          {state.accounts.map((account) => {
            const progress = ruleProgress(account, state.trades, basis, state.transactions)
            return (
              <article key={account.id} className="card">
                <div className="row-between">
                  <h2>{account.nickname}</h2>
                  <button className="danger" type="button" onClick={() => { setPendingDelete(account.id); deleteRef.current?.showModal() }}>Delete</button>
                </div>
                <p className="hint">{account.plan ? `${account.firm} ${account.plan} · ` : ""}{account.phase}{account.statusLabel ? ` (${account.statusLabel})` : ""} · {account.status} · since {account.startDate}</p>
                <p className="hint">{account.firm} · {account.broker} · {dollars(account.size, false)} · {account.drawdownType} drawdown</p>
                <p style={{ marginTop: 8 }}>Closed P&amp;L <strong className={tone(progress.net)}><Money value={progress.net} mode={mode} balance={account.size} /></strong></p>
                {account.profitTarget > 0 ? (<>
                  <p className="label" style={{ marginTop: 10 }}>Profit target {pct(Math.max(0, progress.targetPct))}</p>
                  <div className="track"><b style={{ width: `${Math.max(0, Math.min(100, progress.targetPct * 100))}%` }} /></div>
                </>) : <p className="label" style={{ marginTop: 10 }}>Profit target: None</p>}
                {account.maxDailyLoss > 0 && <p className="hint">Daily loss used {dollars(progress.dailyUsed, false)} of {dollars(account.maxDailyLoss, false)}</p>}
                <p className="hint">Balance {dollars(progress.balance, false)}</p>
                <p className="hint">Drawdown {dollars(progress.drawdownUsed, false)} of {dollars(account.maxDrawdown, false)}</p>
                <p className="hint">{progress.tradedDays} trading days · min {account.minTradingDays}{account.consistencyPct != null ? ` · best day ${progress.consistency.toFixed(0)}% vs ${account.consistencyPct}% cap` : ""}</p>
                <ul className="hint" aria-label="Account rules" style={{ marginTop: 8, paddingLeft: 18 }}>
                  <li>Max drawdown {dollars(account.maxDrawdown, false)} ({account.drawdownType})</li>
                  {account.maxDailyLoss > 0 && <li>Daily loss limit {dollars(account.maxDailyLoss, false)}</li>}
                  {account.singleDayLossCap != null && <li>Single-day max loss cap {dollars(account.singleDayLossCap, false)}</li>}
                  {account.consistencyPct != null && <li>Consistency rule {account.consistencyPct}%</li>}
                  <li>Min trading days {account.minTradingDays}</li>
                  {account.minDailyProfit != null && <li>Min daily profit {dollars(account.minDailyProfit, false)} USD per qualifying day</li>}
                  <li>Profit target {account.profitTarget > 0 ? dollars(account.profitTarget, false) : "None"}</li>
                  {account.payoutDrawdownRule && <li>{account.payoutDrawdownRule}</li>}
                </ul>
              </article>
            )
          })}
        </div>
      )}
      <dialog ref={deleteRef} aria-labelledby="delete-title" closedby="any" onClose={(event) => {
        const dialog = event.currentTarget
        if (dialog.returnValue === "delete" && pendingDelete) deleteAccount(pendingDelete)
        dialog.returnValue = ""
        setPendingDelete(null)
      }}>
        <form method="dialog" className="dialog">
          <h2 id="delete-title">Delete {pending?.nickname ?? "this account"}?</h2>
          <p>This removes the account, its trades, fees, and payouts. Other accounts stay. Clear journal still wipes everything.</p>
          <div className="dialog-actions">
            <button className="secondary" type="submit" value="cancel" autoFocus>Cancel</button>
            <button className="danger" type="submit" value="delete">Delete account</button>
          </div>
        </form>
      </dialog>
      {tab === "transactions" && (
        <article className="card table-wrap">
          {state.transactions.length === 0 ? <p>No fees or payouts yet.</p> : (
            <table>
              <caption>Prop firm transactions</caption>
              <thead><tr><th>Date</th><th>Firm</th><th>Category</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {state.transactions.slice().sort((a, b) => b.date.localeCompare(a.date)).map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.date}</td>
                    <td>{tx.firm}</td>
                    <td>{tx.category}</td>
                    <td>{tx.description}</td>
                    <td className={tone(tx.amount)}>{shown(tx.amount, mode, spent || 1)}</td>
                    <td>{tx.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      )}
    </section>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return <div className="empty"><h2>{title}</h2><p>{body}</p></div>
}

function ImportDialog({ dialogRef, note, setNote }: { dialogRef: RefObject<HTMLDialogElement | null>; note: string; setNote: (note: string) => void }) {
  const { state, addTrades } = useStore()
  const [accountId, setAccountId] = useState(state.accounts[0]?.id ?? "")
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = (form.elements.namedItem("file") as HTMLInputElement).files?.[0]
    const target = (form.elements.namedItem("account") as HTMLSelectElement).value
    if (!file || !target) {
      setNote("Choose an account and a CSV file.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = importCsv(String(reader.result ?? ""), target)
      if (result.trades.length) addTrades(result.trades)
      const skipped = result.skipped.slice(0, 4).join(" ")
      setNote(`${result.format === "history" ? "Trade history" : "Execution"} import added ${result.trades.length} trade${result.trades.length === 1 ? "" : "s"}.${skipped ? ` ${skipped}` : ""}`)
    }
    reader.readAsText(file)
  }
  return (
    <dialog ref={dialogRef} aria-labelledby="import-title" closedby="any">
      <form className="dialog" onSubmit={onSubmit}>
        <h2 id="import-title">Import trades</h2>
        <p>Use a trade-history CSV (one closed trade per row) or an execution CSV (one fill per row). No broker credentials.</p>
        <label className="field">Account
          <select name="account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {state.accounts.map((account) => <option key={account.id} value={account.id}>{account.nickname}</option>)}
            {!state.accounts.length && <option value="">Create an account first</option>}
          </select>
        </label>
        <label className="field">CSV file
          <input name="file" type="file" accept=".csv,text/csv" />
        </label>
        {note && <p className="message" role="status">{note}</p>}
        <div className="inline-actions">
          <button className="secondary" type="button" onClick={() => download("trade-history-template.csv", HISTORY_TEMPLATE)}>History template</button>
          <button className="secondary" type="button" onClick={() => download("execution-template.csv", EXECUTION_TEMPLATE)}>Execution template</button>
          <button className="secondary" type="button" onClick={() => dialogRef.current?.close()}>Close</button>
          <button className="primary" type="submit">Import</button>
        </div>
      </form>
    </dialog>
  )
}

function TrackDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const { addAccount } = useStore()
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const id = `acc-${crypto.randomUUID()}`
    const size = Number(data.get("size"))
    const account: Account = {
      id,
      nickname: String(data.get("nickname") || "Prop account"),
      firm: String(data.get("firm") || "Unlisted firm"),
      broker: String(data.get("broker") || "CSV"),
      size,
      phase: String(data.get("phase")) as Phase,
      status: "Active",
      steps: 1,
      profitTarget: Number(data.get("target")),
      maxDailyLoss: Number(data.get("daily")),
      maxDrawdown: Number(data.get("drawdown")),
      drawdownType: String(data.get("drawdownType")) as DrawdownType,
      consistencyPct: data.get("consistency") ? Number(data.get("consistency")) : null,
      minTradingDays: Number(data.get("days") || 0),
      startDate: String(data.get("start")),
      plan: String(data.get("plan") || "") || undefined,
      minDailyProfit: data.get("minDailyProfit") ? Number(data.get("minDailyProfit")) : undefined,
      payoutDrawdownRule: String(data.get("payoutRule") || "") || undefined,
    }
    const fee = Number(data.get("fee") || 0)
    addAccount(account, fee ? { amount: fee, category: "Evaluation Fee", description: `${account.nickname} evaluation` } : undefined)
    event.currentTarget.reset()
    dialogRef.current?.close()
  }
  return (
    <dialog ref={dialogRef} aria-labelledby="track-title" closedby="any">
      <form className="dialog" onSubmit={onSubmit}>
        <h2 id="track-title">Track a prop account</h2>
        <p>Rules only. This does not connect to a firm or a broker.</p>
        <div className="grid-2">
          <label className="field">Nickname<input name="nickname" required defaultValue="New 50K eval" /></label>
          <label className="field">Firm<input name="firm" required defaultValue="Topstep" /></label>
          <label className="field">Broker label<input name="broker" defaultValue="Tradovate" /></label>
          <label className="field">Account size
            <select name="size" defaultValue="50000">
              {[25000, 50000, 75000, 100000, 150000, 200000].map((size) => <option key={size} value={size}>{dollars(size, false)}</option>)}
            </select>
          </label>
          <label className="field">Phase
            <select name="phase" defaultValue="Evaluation"><option>Evaluation</option><option>Funded</option></select>
          </label>
          <label className="field">Start date<input name="start" type="date" required defaultValue={todayKey()} /></label>
          <label className="field">Profit target $<input name="target" type="number" min="0" step="1" required defaultValue="3000" /></label>
          <label className="field">Max daily loss $<input name="daily" type="number" min="0" step="1" required defaultValue="1000" /></label>
          <label className="field">Max drawdown $<input name="drawdown" type="number" min="0" step="1" required defaultValue="2000" /></label>
          <label className="field">Drawdown type
            <select name="drawdownType" defaultValue="Trailing"><option>Static</option><option>EOD</option><option>Trailing</option></select>
          </label>
          <label className="field">Best-day cap %<input name="consistency" type="number" min="0" max="100" defaultValue="50" /></label>
          <label className="field">Min trading days<input name="days" type="number" min="0" defaultValue="5" /></label>
          <label className="field">Plan<input name="plan" placeholder="Standard 50K" /></label>
          <label className="field">Min daily profit $<input name="minDailyProfit" type="number" min="0" step="1" /></label>
          <label className="field">Post-payout drawdown rule<input name="payoutRule" placeholder="Optional" /></label>
          <label className="field">Evaluation fee $<input name="fee" type="number" min="0" step="0.01" defaultValue="149" /></label>
        </div>
        <div className="dialog-actions">
          <button className="secondary" type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button className="primary" type="submit">Create account</button>
        </div>
      </form>
    </dialog>
  )
}

function TransactionDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const { state, addTransaction } = useStore()
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const account = state.accounts.find((item) => item.id === String(data.get("account")))
    const kind = String(data.get("kind"))
    const magnitude = Math.abs(Number(data.get("amount")))
    const income = kind === "Payout" || kind === "Refund"
    addTransaction({
      id: `tx-${crypto.randomUUID()}`,
      date: String(data.get("date")),
      description: String(data.get("description")),
      accountId: account?.id ?? "",
      firm: account?.firm ?? String(data.get("firm") || ""),
      category: kind as TxCategory,
      amount: income ? magnitude : -magnitude,
      status: "Reviewed",
    })
    event.currentTarget.reset()
    dialogRef.current?.close()
  }
  return (
    <dialog ref={dialogRef} aria-labelledby="tx-title" closedby="any">
      <form className="dialog" onSubmit={onSubmit}>
        <h2 id="tx-title">Add a transaction</h2>
        <p>Expenses are stored as negative amounts. Payouts and refunds are stored as positive.</p>
        <div className="grid-2">
          <label className="field">Date<input name="date" type="date" required defaultValue={todayKey()} /></label>
          <label className="field">Account
            <select name="account" required>
              {state.accounts.map((account) => <option key={account.id} value={account.id}>{account.nickname}</option>)}
            </select>
          </label>
          <label className="field">Category
            <select name="kind" defaultValue="Evaluation Fee">
              <option>Evaluation Fee</option>
              <option>Reset Fee</option>
              <option>Activation Fee</option>
              <option>Payout</option>
              <option>Refund</option>
            </select>
          </label>
          <label className="field">Amount $<input name="amount" type="number" min="0" step="0.01" required defaultValue="149" /></label>
          <label className="field">Description<input name="description" required defaultValue="Evaluation fee" /></label>
        </div>
        <div className="dialog-actions">
          <button className="secondary" type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button className="primary" type="submit">Save</button>
        </div>
      </form>
    </dialog>
  )
}

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
