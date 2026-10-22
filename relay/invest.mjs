import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseCsv } from "./csv.mjs";

const SCALE = 8;
const SCALE_UNIT = 10n ** BigInt(SCALE);
const PLAID_COLUMNS = [
  "ticker_symbol",
  "security_name",
  "security_type",
  "quantity",
  "cost_basis",
  "institution_price",
  "institution_value",
  "currency",
];
// Column names are the eight headers cgt-calc documents for a Revolut Invest
// account-statement CSV. Revolut's own help page does not publish them.
const STATEMENT_COLUMNS = [
  "Date",
  "Ticker",
  "Type",
  "Quantity",
  "Price per share",
  "Total Amount",
  "Currency",
  "FX Rate",
];
const IGNORED_STATEMENT_TYPES = new Set([
  "DIVIDEND",
  "DIVIDEND TAX (CORRECTION)",
  "CUSTODY FEE",
  "CASH TOP-UP",
  "CASH WITHDRAWAL",
  "TRANSFER FROM REVOLUT BANK UAB TO REVOLUT SECURITIES EUROPE UAB",
  "TRANSFER FROM REVOLUT TRADING LTD TO REVOLUT SECURITIES EUROPE UAB",
]);

export function formatUnits(units) {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / SCALE_UNIT;
  const frac = (abs % SCALE_UNIT).toString().padStart(SCALE, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${frac}`;
}

export function parseDecimal(input) {
  let text = String(input ?? "").trim();
  text = text.replace(/^[A-Za-z]{3}\s+/, "");
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) throw new Error(`bad number ${input}`);
  const negative = text.startsWith("-");
  const [whole, frac = ""] = text.replace(/^[+-]/, "").split(".");
  if (frac.length > SCALE) throw new Error(`scale ${input}`);
  const units = BigInt(whole) * SCALE_UNIT + BigInt((frac + "0".repeat(SCALE)).slice(0, SCALE));
  return negative ? -units : units;
}

function headerIndex(header, required) {
  const index = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
  const missing = required.filter((name) => index[name] === undefined);
  if (missing.length) throw new Error(`missing columns ${missing.join(",")}`);
  return index;
}

function rowsOf(csvText, required) {
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error("empty csv");
  const index = headerIndex(rows[0], required);
  return { index, rows: rows.slice(1) };
}

function holdingRecord(fields) {
  return {
    callsign: "READ",
    kind: "holding",
    mode: "read-only",
    ticker_symbol: fields.ticker_symbol,
    security_name: fields.security_name,
    security_type: fields.security_type,
    quantity: formatUnits(fields.quantity),
    cost_basis: formatUnits(fields.cost_basis),
    institution_price: fields.institution_price === null ? null : formatUnits(fields.institution_price),
    institution_value: fields.institution_value === null ? null : formatUnits(fields.institution_value),
    currency: fields.currency,
  };
}

export function holdingsFromPlaid(csvText) {
  const { index, rows } = rowsOf(csvText, PLAID_COLUMNS);
  return rows.map((row) => holdingRecord({
    ticker_symbol: row[index.ticker_symbol].trim(),
    security_name: row[index.security_name].trim(),
    security_type: row[index.security_type].trim(),
    quantity: parseDecimal(row[index.quantity]),
    cost_basis: parseDecimal(row[index.cost_basis]),
    institution_price: parseDecimal(row[index.institution_price]),
    institution_value: parseDecimal(row[index.institution_value]),
    currency: row[index.currency].trim(),
  }));
}

function applyStatementRow(book, row, index) {
  const ticker = row[index.Ticker].trim();
  const type = row[index.Type].trim();
  const quantity = parseDecimal(row[index.Quantity]);
  const total = parseDecimal(row[index["Total Amount"]]);
  const currency = row[index.Currency].trim();
  if (!ticker) throw new Error("statement ticker missing");
  if (IGNORED_STATEMENT_TYPES.has(type)) return;
  if (!book.has(ticker)) {
    book.set(ticker, { quantity: 0n, cost_basis: 0n, currency, security_type: "unknown" });
  }
  const slot = book.get(ticker);
  if (slot.currency !== currency) throw new Error(`mixed currency ${ticker}`);
  if (type === "BUY - MARKET" || type === "BUY - LIMIT") {
    slot.quantity += quantity;
    slot.cost_basis += total < 0n ? -total : total;
    return;
  }
  if (type === "SELL - MARKET" || type === "SELL - LIMIT") {
    if (quantity > slot.quantity) throw new Error(`sell exceeds holding ${ticker}`);
    if (slot.quantity === 0n) throw new Error(`sell exceeds holding ${ticker}`);
    const remaining = slot.quantity - quantity;
    slot.cost_basis = (slot.cost_basis * remaining) / slot.quantity;
    slot.quantity = remaining;
    return;
  }
  if (type === "STOCK SPLIT") {
    slot.quantity += quantity;
    return;
  }
  throw new Error(`unknown statement type ${type}`);
}

export function holdingsFromStatement(csvText) {
  const { index, rows } = rowsOf(csvText, STATEMENT_COLUMNS);
  const book = new Map();
  for (const row of rows) applyStatementRow(book, row, index);
  const holdings = [];
  for (const [ticker, slot] of book) {
    if (slot.quantity === 0n) continue;
    if (slot.quantity < 0n) throw new Error(`negative holding ${ticker}`);
    holdings.push(holdingRecord({
      ticker_symbol: ticker,
      security_name: "",
      security_type: slot.security_type,
      quantity: slot.quantity,
      cost_basis: slot.cost_basis,
      institution_price: null,
      institution_value: null,
      currency: slot.currency,
    }));
  }
  return holdings.sort((a, b) => a.ticker_symbol.localeCompare(b.ticker_symbol));
}

export function pdfLiterals(buffer) {
  const raw = Buffer.isBuffer(buffer) ? buffer.toString("latin1") : String(buffer);
  const lines = [];
  const pattern = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  for (const match of raw.matchAll(pattern)) {
    lines.push(match[1].replace(/\\([()\\])/g, "$1").replace(/\\n/g, "\n"));
  }
  return lines.join("\n");
}

export function holdingsFromPdfText(text) {
  const body = String(text);
  if (body.includes("ticker_symbol") && body.includes("institution_value")) {
    const start = body.indexOf("ticker_symbol");
    return holdingsFromPlaid(body.slice(start));
  }
  if (body.includes("Price per share") && body.includes("FX Rate")) {
    const start = body.indexOf("Date,Ticker,Type,Quantity");
    if (start < 0) throw new Error("pdf text missing statement header");
    return holdingsFromStatement(body.slice(start));
  }
  throw new Error("pdf text layout not recognised");
}

export function portfolioSummary(holdings, source) {
  const currencies = [...new Set(holdings.map((item) => item.currency))];
  const currency = currencies.length === 1 ? currencies[0] : currencies.length ? "MIXED" : "";
  const single = currency !== "MIXED" && currency !== "";
  let cost = 0n;
  let value = 0n;
  let valueKnown = holdings.length > 0 && single;
  for (const item of holdings) {
    cost += parseDecimal(item.cost_basis);
    if (item.institution_value === null) valueKnown = false;
    else value += parseDecimal(item.institution_value);
  }
  const totalValue = single && valueKnown ? value : null;
  const totalCost = single ? cost : null;
  const unrealised = totalValue === null || totalCost === null ? null : totalValue - totalCost;
  const basis = totalValue !== null ? "institution_value" : "cost_basis";
  const basisTotal = basis === "institution_value" ? totalValue : totalCost;
  const allocation_by_ticker = {};
  const allocation_by_type = {};
  let used = 0n;
  holdings.forEach((item, position) => {
    const part = basis === "institution_value" ? parseDecimal(item.institution_value) : parseDecimal(item.cost_basis);
    let weight = 0n;
    if (basisTotal && basisTotal !== 0n) {
      weight = position === holdings.length - 1 ? SCALE_UNIT - used : (part * SCALE_UNIT) / basisTotal;
      used += weight;
    }
    const entry = {
      quantity: item.quantity,
      cost_basis: item.cost_basis,
      institution_value: item.institution_value,
      weight: formatUnits(weight),
    };
    allocation_by_ticker[item.ticker_symbol] = entry;
    if (!allocation_by_type[item.security_type]) {
      allocation_by_type[item.security_type] = { cost_basis: 0n, institution_value: 0n, value_known: true, weight: 0n };
    }
    const bucket = allocation_by_type[item.security_type];
    bucket.cost_basis += parseDecimal(item.cost_basis);
    bucket.weight += weight;
    if (item.institution_value === null) bucket.value_known = false;
    else bucket.institution_value += parseDecimal(item.institution_value);
  });
  const types = {};
  for (const [name, bucket] of Object.entries(allocation_by_type)) {
    types[name] = {
      cost_basis: formatUnits(bucket.cost_basis),
      institution_value: bucket.value_known ? formatUnits(bucket.institution_value) : null,
      weight: formatUnits(bucket.weight),
    };
  }
  return {
    callsign: "READ",
    kind: "portfolio-summary",
    mode: "read-only",
    source,
    currency,
    holdings_count: holdings.length,
    total_value: totalValue === null ? null : formatUnits(totalValue),
    cost_basis: totalCost === null ? null : formatUnits(totalCost),
    unrealised: unrealised === null ? null : formatUnits(unrealised),
    allocation_basis: holdings.length && single ? basis : null,
    allocation_by_ticker,
    allocation_by_type: types,
  };
}

function framesFor(holdings, source, filename) {
  const summary = portfolioSummary(holdings, source);
  const frames = holdings.map((holding) => ({
    channel: "invest",
    code: `INV.HOLD ${holding.ticker_symbol}`,
    data: { ...holding, source, source_file: basename(filename) },
  }));
  frames.push({
    channel: "invest",
    code: "INV.SUM READ",
    data: { ...summary, source_file: basename(filename) },
  });
  return frames;
}

export function framesFromInvestFile(filename, kind) {
  if (kind === "plaid") {
    return framesFor(holdingsFromPlaid(readFileSync(filename, "utf8")), "plaid", filename);
  }
  if (kind === "statement") {
    return framesFor(holdingsFromStatement(readFileSync(filename, "utf8")), "revolut-statement", filename);
  }
  if (kind === "pdf-text") {
    return framesFor(holdingsFromPdfText(readFileSync(filename, "utf8")), "pdf-text", filename);
  }
  if (kind === "pdf") {
    const text = pdfLiterals(readFileSync(filename));
    if (!text.trim()) throw new Error("pdf text empty");
    return framesFor(holdingsFromPdfText(text), "pdf-text", filename);
  }
  throw new Error(`unknown invest kind ${kind}`);
}
