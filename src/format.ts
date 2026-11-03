import type { ViewMode } from "./types"

export function tone(value: number): string {
  if (value > 0.005) return "pos"
  if (value < -0.005) return "neg"
  return "flat"
}

export function dollars(value: number, signed = true): string {
  const abs = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (!signed) return value < 0 ? `−$${abs}` : `$${abs}`
  if (value > 0.005) return `+$${abs}`
  if (value < -0.005) return `−$${abs}`
  return `$${abs}`
}

export function shown(value: number, mode: ViewMode, balance: number, signed = true): string {
  if (mode === "privacy") return "•••"
  if (mode === "percent") {
    if (!balance) return "—"
    const pct = (value / balance) * 100
    const text = `${Math.abs(pct).toFixed(2)}%`
    if (!signed) return pct < 0 ? `−${text}` : text
    if (pct > 0.005) return `+${text}`
    if (pct < -0.005) return `−${text}`
    return text
  }
  return dollars(value, signed)
}

export function pct(value: number | null): string {
  if (value == null) return "—"
  return `${(value * 100).toFixed(1)}%`
}

export function formatR(net: number, rDollars: number): string {
  if (!rDollars) return "—"
  const value = net / rDollars
  const text = Math.abs(value).toFixed(1)
  if (value > 0.0005) return `+${text}R`
  if (value < -0.0005) return `−${text}R`
  return "0.0R"
}

export function factor(value: number | null): string {
  if (value == null) return "∞"
  return value.toFixed(2)
}

export function compactDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function longDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
}

export function clock(stamp: string): string {
  const time = stamp.slice(11, 16)
  return time || "—"
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number)
  const date = new Date(y, m - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}
