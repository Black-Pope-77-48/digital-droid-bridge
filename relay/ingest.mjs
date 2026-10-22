import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { summarizeTransactions } from "./csv.mjs";
import { framesFromInvestFile } from "./invest.mjs";

const CALLSIGNS = {
  "graph and network - god": "GOD",
  "forex trader": "FX",
  "digital bridge": "BRIDGE",
  "digital bank": "BANK",
  "chief financial officer": "CFO",
};

function usage() {
  return "usage: node relay/ingest.mjs --url http://127.0.0.1:8765/flow [--roster file.json] [--forex report.md ...] [--snapshot file.json] [--transactions file.csv] [--invest-plaid file.csv] [--invest-statement file.csv] [--invest-pdf file.pdf] [--invest-pdf-text file.txt]";
}

function parseArgs(argv) {
  const args = {
    forex: [],
    investPlaid: [],
    investStatement: [],
    investPdf: [],
    investPdfText: [],
    url: process.env.BRIDGE_URL || "http://127.0.0.1:8765/flow",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--url") {
      args.url = value;
      i += 1;
    } else if (flag === "--roster") {
      args.roster = value;
      i += 1;
    } else if (flag === "--forex") {
      args.forex.push(value);
      i += 1;
    } else if (flag === "--snapshot") {
      args.snapshot = value;
      i += 1;
    } else if (flag === "--transactions") {
      args.transactions = value;
      i += 1;
    } else if (flag === "--invest-plaid") {
      args.investPlaid.push(value);
      i += 1;
    } else if (flag === "--invest-statement") {
      args.investStatement.push(value);
      i += 1;
    } else if (flag === "--invest-pdf") {
      args.investPdf.push(value);
      i += 1;
    } else if (flag === "--invest-pdf-text") {
      args.investPdfText.push(value);
      i += 1;
    } else if (flag === "--help") {
      args.help = true;
    } else {
      throw new Error(`unknown arg ${flag}`);
    }
  }
  return args;
}

function callsignFor(name) {
  const known = CALLSIGNS[name.trim().toLowerCase()];
  if (known) return known;
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ")[0] || "BOT";
  return slug.slice(0, 8);
}

export function framesFromRoster(roster) {
  if (!roster || !Array.isArray(roster.bots)) throw new Error("roster.bots missing");
  return roster.bots.map((bot) => {
    if (!bot || typeof bot.name !== "string") throw new Error("roster bot name missing");
    const callsign = callsignFor(bot.name);
    return {
      channel: "bots",
      code: `BOT.ROSTER ${callsign}`,
      data: {
        callsign,
        kind: "roster",
        name: bot.name,
        role: typeof bot.role === "string" ? bot.role : "",
        rules: Array.isArray(roster.rules) ? roster.rules : [],
      },
    };
  });
}

export function frameFromForex(markdown, filename) {
  const text = String(markdown).replace(/^\uFEFF/, "");
  const title = (text.split("\n").find((line) => line.trim()) || filename).replace(/^#\s*/, "").trim();
  const kind = /system overview/i.test(title) ? "overview" : "daily";
  const code = kind === "overview" ? "FX.PAPER SYS" : "FX.PAPER DAY";
  return {
    channel: "forex",
    code,
    data: {
      callsign: "PAPER",
      kind,
      mode: "paper",
      source: basename(filename),
      title,
      body: text,
    },
  };
}

export function frameFromSnapshot(snapshot) {
  const holdings = Array.isArray(snapshot.investment_holdings) ? snapshot.investment_holdings : [];
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  return {
    channel: "finance",
    code: "FIN.SNAP READ",
    data: {
      callsign: "READ",
      kind: "snapshot",
      mode: "read-only",
      source: "plaid",
      institution: snapshot.institution || "",
      as_of: snapshot.as_of || "",
      accounts,
      account_count: accounts.length,
      investment_holdings: holdings,
      holdings_count: holdings.length,
      note: typeof snapshot.note === "string" ? snapshot.note : "",
    },
  };
}

export function frameFromTransactions(csvText) {
  const summary = summarizeTransactions(csvText);
  return {
    channel: "finance",
    code: "FIN.SUM READ",
    data: {
      callsign: "READ",
      kind: "tx-summary",
      mode: "read-only",
      source: "csv",
      ...summary,
    },
  };
}

async function postFrame(url, frame) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(frame),
  });
  const bodyText = await response.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = { raw: bodyText };
  }
  const ack = body && body.mirror && body.mirror.ack ? body.mirror.ack : body.ack || "NAK // bus";
  console.log(`HTTP ${response.status} ${frame.channel} ${frame.code}`);
  console.log(ack);
  return { status: response.status, ack, body };
}

export async function ingestFiles(args) {
  const frames = [];
  args.forex ||= [];
  args.investPlaid ||= [];
  args.investStatement ||= [];
  args.investPdf ||= [];
  args.investPdfText ||= [];
  if (args.roster) frames.push(...framesFromRoster(JSON.parse(readFileSync(args.roster, "utf8"))));
  for (const file of args.forex) frames.push(frameFromForex(readFileSync(file, "utf8"), file));
  if (args.snapshot) frames.push(frameFromSnapshot(JSON.parse(readFileSync(args.snapshot, "utf8"))));
  if (args.transactions) frames.push(frameFromTransactions(readFileSync(args.transactions, "utf8")));
  for (const file of args.investPlaid) frames.push(...framesFromInvestFile(file, "plaid"));
  for (const file of args.investStatement) frames.push(...framesFromInvestFile(file, "statement"));
  for (const file of args.investPdf) frames.push(...framesFromInvestFile(file, "pdf"));
  for (const file of args.investPdfText) frames.push(...framesFromInvestFile(file, "pdf-text"));
  if (!frames.length) throw new Error("no input files");
  const results = [];
  for (const frame of frames) results.push(await postFrame(args.url, frame));
  return results;
}

if (import.meta.url === new URL(process.argv[1], "file:").href || process.argv[1].endsWith("ingest.mjs")) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
  } else {
    ingestFiles(args).then((results) => {
      const failed = results.filter((item) => item.status !== 200);
      if (failed.length) process.exitCode = 1;
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
