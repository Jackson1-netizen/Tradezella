import type { Instrument, Side, Trade } from "./types"

const MULTIPLIERS: Record<string, number> = {
  ES: 50,
  MES: 5,
  NQ: 20,
  MNQ: 2,
  YM: 5,
  MYM: 0.5,
  RTY: 50,
  M2K: 5,
  CL: 1000,
  MCL: 100,
  GC: 100,
  MGC: 10,
}

export type ImportResult = {
  trades: Trade[]
  skipped: string[]
  format: "history" | "execution"
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const source = text.replace(/^\uFEFF/, "")
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else cell += char
    } else if (char === '"') quoted = true
    else if (char === ",") {
      row.push(cell)
      cell = ""
    } else if (char === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else if (char !== "\r") cell += char
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((item) => item.some((value) => value.trim()))
}

function headerIndex(headers: string[]): Map<string, number> {
  const map = new Map<string, number>()
  headers.forEach((header, index) => map.set(header.trim().toLowerCase().replace(/\s+/g, " "), index))
  return map
}

function pick(row: string[], map: Map<string, number>, names: string[]): string {
  for (const name of names) {
    const index = map.get(name)
    if (index != null && row[index] != null) return row[index].trim()
  }
  return ""
}

function sideOf(value: string): Side | null {
  const text = value.trim().toLowerCase()
  if (text === "buy" || text === "long" || text === "b") return "Long"
  if (text === "sell" || text === "short" || text === "s") return "Short"
  return null
}

function instrumentOf(value: string): Instrument {
  const text = value.trim().toLowerCase()
  if (text.startsWith("fut")) return "Future"
  if (text.startsWith("for")) return "Forex"
  if (text.startsWith("cry")) return "Crypto"
  if (text.startsWith("sin") || text.startsWith("opt")) return "Single"
  return "Stock"
}

export function parseStamp(value: string): string | null {
  const text = value.trim()
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}T${match[4].padStart(2, "0")}:${match[5]}:${match[6] ?? "00"}`
  }
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}T00:00:00`
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i)
  if (!match) return null
  let year = Number(match[3])
  if (year < 100) year += 2000
  let hour = Number(match[4] ?? 0)
  const ampm = match[7]?.toUpperCase()
  if (ampm === "PM" && hour < 12) hour += 12
  if (ampm === "AM" && hour === 12) hour = 0
  const month = match[1].padStart(2, "0")
  const day = match[2].padStart(2, "0")
  return `${year}-${month}-${day}T${String(hour).padStart(2, "0")}:${match[5] ?? "00"}:${match[6] ?? "00"}`
}

function numberOf(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value.replace(/[$,]/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function pointsPnl(symbol: string, instrument: Instrument, side: Side, volume: number, open: number, close: number): number {
  const sign = side === "Long" ? 1 : -1
  const multiplier = instrument === "Future" ? MULTIPLIERS[symbol.toUpperCase()] ?? 1 : 1
  return (close - open) * volume * multiplier * sign
}

let importSeq = 0

function nextId(): string {
  importSeq += 1
  return `csv-${Date.now().toString(36)}-${importSeq}`
}

export function importCsv(text: string, accountId: string): ImportResult {
  const rows = parseCsv(text)
  if (rows.length < 2) return { trades: [], skipped: ["The file needs a header row and at least one trade."], format: "history" }
  const map = headerIndex(rows[0])
  const execution = map.has("buy/sell") || (map.has("quantity") && map.has("price") && !map.has("open price"))
  return execution ? importExecutions(rows.slice(1), map, accountId) : importHistory(rows.slice(1), map, accountId)
}

function importHistory(rows: string[][], map: Map<string, number>, accountId: string): ImportResult {
  const trades: Trade[] = []
  const skipped: string[] = []
  rows.forEach((row, index) => {
    const line = index + 2
    const openTime = parseStamp(pick(row, map, ["open time", "open date", "entry time"]))
    const closeTime = parseStamp(pick(row, map, ["close time", "close date", "exit time"]))
    const symbol = pick(row, map, ["symbol", "ticker"]).toUpperCase()
    const side = sideOf(pick(row, map, ["direction", "side", "buy/sell"]))
    const volume = numberOf(pick(row, map, ["volume", "quantity", "qty"]))
    const openPrice = numberOf(pick(row, map, ["open price", "entry price"]))
    const closePrice = numberOf(pick(row, map, ["close price", "exit price"]))
    if (!openTime || !closeTime || !symbol || !side || volume == null || openPrice == null || closePrice == null) {
      skipped.push(`Row ${line} is missing a required trade-history field.`)
      return
    }
    const instrument = instrumentOf(pick(row, map, ["spread", "instrument", "asset"]))
    const explicit = numberOf(pick(row, map, ["p&l", "pnl", "profit", "gross p&l"]))
    const gross = explicit ?? pointsPnl(symbol, instrument, side, volume, openPrice, closePrice)
    trades.push({
      id: nextId(),
      accountId,
      symbol,
      instrument,
      side,
      volume,
      openTime,
      closeTime,
      openPrice,
      closePrice,
      grossPnl: gross,
      commission: numberOf(pick(row, map, ["commission"])) ?? 0,
      fees: (numberOf(pick(row, map, ["fees", "fee"])) ?? 0) + (numberOf(pick(row, map, ["swap"])) ?? 0),
      status: "Closed",
      reviewed: false,
      strategy: "",
      tags: ["csv"],
      note: "",
    })
  })
  return { trades, skipped, format: "history" }
}

type Fill = { time: string; side: Side; qty: number; price: number; commission: number; fees: number; instrument: Instrument; symbol: string }

function importExecutions(rows: string[][], map: Map<string, number>, accountId: string): ImportResult {
  const skipped: string[] = []
  const fills: Fill[] = []
  rows.forEach((row, index) => {
    const line = index + 2
    const combined = pick(row, map, ["date&time", "date & time", "datetime"])
    const splitDate = pick(row, map, ["date"])
    const splitTime = pick(row, map, ["time"])
    const time = parseStamp(combined || `${splitDate} ${splitTime}`.trim())
    const symbol = pick(row, map, ["symbol", "ticker"]).toUpperCase()
    const side = sideOf(pick(row, map, ["buy/sell", "side", "direction"]))
    const qty = numberOf(pick(row, map, ["quantity", "qty", "volume"]))
    const price = numberOf(pick(row, map, ["price"]))
    if (!time || !symbol || !side || qty == null || price == null) {
      skipped.push(`Row ${line} is missing a required execution field.`)
      return
    }
    fills.push({
      time,
      side,
      qty,
      price,
      commission: numberOf(pick(row, map, ["commission"])) ?? 0,
      fees: numberOf(pick(row, map, ["fees", "fee"])) ?? 0,
      instrument: instrumentOf(pick(row, map, ["spread", "instrument", "asset"])),
      symbol,
    })
  })
  fills.sort((a, b) => a.time < b.time ? -1 : 1)
  const open = new Map<string, Fill[]>()
  const trades: Trade[] = []
  for (const fill of fills) {
    const book = open.get(fill.symbol) ?? []
    let qty = fill.qty
    while (qty > 0 && book.length && book[0].side !== fill.side) {
      const first = book[0]
      const matched = Math.min(qty, first.qty)
      const share = matched / first.qty
      const closeShare = matched / fill.qty
      const side = first.side
      const gross = pointsPnl(fill.symbol, fill.instrument, side, matched, first.price, fill.price)
      trades.push({
        id: nextId(),
        accountId,
        symbol: fill.symbol,
        instrument: fill.instrument,
        side,
        volume: matched,
        openTime: first.time,
        closeTime: fill.time,
        openPrice: first.price,
        closePrice: fill.price,
        grossPnl: gross,
        commission: first.commission * share + fill.commission * closeShare,
        fees: first.fees * share + fill.fees * closeShare,
        status: "Closed",
        reviewed: false,
        strategy: "",
        tags: ["csv"],
        note: "",
      })
      first.qty -= matched
      qty -= matched
      if (first.qty <= 0.000001) book.shift()
    }
    if (qty > 0) book.push({ ...fill, qty })
    open.set(fill.symbol, book)
  }
  for (const book of open.values()) {
    for (const fill of book) {
      trades.push({
        id: nextId(),
        accountId,
        symbol: fill.symbol,
        instrument: fill.instrument,
        side: fill.side,
        volume: fill.qty,
        openTime: fill.time,
        closeTime: null,
        openPrice: fill.price,
        closePrice: null,
        grossPnl: 0,
        commission: fill.commission,
        fees: fill.fees,
        status: "Open",
        reviewed: false,
        strategy: "",
        tags: ["csv"],
        note: "",
      })
    }
  }
  return { trades, skipped, format: "execution" }
}

export const HISTORY_TEMPLATE = `Open Time,Close Time,Symbol,Direction,Volume,Open Price,Close Price,P&L,Spread,Commission,Swap,Currency
2026-11-03 09:35:00,2026-11-03 10:05:00,MNQ,Long,1,21400,21440,80,Future,2.25,0,USD
2026-11-03 10:20:00,2026-11-03 10:48:00,MES,Short,1,6860,6848,60,Future,2.00,0,USD
2026-11-04 09:40:00,2026-11-04 09:55:00,MNQ,Long,1,21480,21450,-60,Future,2.25,0,USD
`

export const EXECUTION_TEMPLATE = `Date&Time,Symbol,Buy/Sell,Quantity,Price,Spread,Commission,Fees
2026-11-03 09:35:00,MNQ,Buy,1,21400,Future,1.12,0.13
2026-11-03 10:05:00,MNQ,Sell,1,21440,Future,1.13,0.12
`
