// Decimal totals use a fixed scale of 4 (CSV amounts such as 1.2500).

export function parseCsv(text) {
  const source = String(text).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => cell.trim() !== ""));
}

function toUnits(amount) {
  const text = String(amount).trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) {
    throw new Error(`bad amount ${text}`);
  }
  const negative = text.startsWith("-");
  const [whole, frac = ""] = text.replace(/^[+-]/, "").split(".");
  if (frac.length > 4) throw new Error(`amount scale ${text}`);
  const units = BigInt(whole) * 10000n + BigInt((frac + "0000").slice(0, 4));
  return negative ? -units : units;
}

export function formatUnits(units) {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / 10000n;
  const frac = (abs % 10000n).toString().padStart(4, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${frac}`;
}

function categoryOf(cell) {
  if (!cell || !cell.trim()) return "UNKNOWN";
  try {
    const parsed = JSON.parse(cell);
    if (parsed && typeof parsed.primary === "string" && parsed.primary.trim()) {
      return parsed.primary.trim();
    }
  } catch {
    return "UNKNOWN";
  }
  return "UNKNOWN";
}

export function summarizeTransactions(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) {
    return {
      count: 0,
      in_count: 0,
      out_count: 0,
      in_total: "0.0000",
      out_total: "0.0000",
      currency: "",
      by_category: {},
    };
  }
  const header = rows[0].map((cell) => cell.trim());
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const name of ["amount", "direction", "category"]) {
    if (index[name] === undefined) throw new Error(`csv missing ${name}`);
  }
  let inUnits = 0n;
  let outUnits = 0n;
  let inCount = 0;
  let outCount = 0;
  const currencies = new Set();
  const buckets = new Map();
  for (const row of rows.slice(1)) {
    const direction = (row[index.direction] || "").trim().toLowerCase();
    const units = toUnits(row[index.amount] || "0");
    const magnitude = units < 0n ? -units : units;
    const category = categoryOf(row[index.category] || "");
    const currency = index.currency === undefined ? "" : (row[index.currency] || "").trim();
    if (currency) currencies.add(currency);
    if (!buckets.has(category)) buckets.set(category, { count: 0, in: 0n, out: 0n });
    const bucket = buckets.get(category);
    bucket.count += 1;
    if (direction === "in") {
      inUnits += magnitude;
      inCount += 1;
      bucket.in += magnitude;
    } else if (direction === "out") {
      outUnits += magnitude;
      outCount += 1;
      bucket.out += magnitude;
    } else {
      throw new Error(`bad direction ${direction}`);
    }
  }
  const by_category = {};
  for (const name of [...buckets.keys()].sort()) {
    const bucket = buckets.get(name);
    by_category[name] = {
      count: bucket.count,
      in: formatUnits(bucket.in),
      out: formatUnits(bucket.out),
    };
  }
  return {
    count: inCount + outCount,
    in_count: inCount,
    out_count: outCount,
    in_total: formatUnits(inUnits),
    out_total: formatUnits(outUnits),
    currency: currencies.size === 1 ? [...currencies][0] : currencies.size ? "MIXED" : "",
    by_category,
  };
}
