import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS, PULSE_TEMPLATES, PROTOCOL_NAME, RUNTIME, TICKER } from "../src/lib/catalog.ts";
import { decodeHint, encode, matchJob } from "../src/lib/protocol.ts";
import { lastPulse } from "../src/lib/store.ts";
import { admitFrame, listFrames } from "./relay.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.BRIDGE_PORT || 8765);
const MAX_BODY = 64 * 1024;
const MAX_FRAMES = 64;
const frames = [];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function ledgerData(code, extra) {
  const job =
    PULSE_TEMPLATES.find((item) => item.shorthand === code) || matchJob(code);
  const agent = job ? AGENTS.find((item) => item.id === job.agentId) : undefined;
  const base = job
    ? {
        id: job.id,
        title: job.title,
        vertical: job.vertical,
        agentId: job.agentId,
        callsign: agent?.callsign ?? "",
        shorthand: job.shorthand,
      }
    : {};
  const supplied = extra && typeof extra === "object" && !Array.isArray(extra) ? extra : {};
  return { ...base, ...supplied };
}

function admit(input) {
  const result = admitFrame(input, {
    encode,
    enrich: (code, extra) => ledgerData(code, extra),
  });
  if (!result.ok) return result;
  frames.push(result.host, result.mirror);
  while (frames.length > MAX_FRAMES) frames.shift();
  return {
    ok: true,
    status: 200,
    body: {
      bus: "droidspeak",
      protocol: PROTOCOL_NAME,
      ticker: TICKER,
      runtime: RUNTIME,
      code: result.code,
      data: result.data,
      hint: decodeHint(result.code),
      mirror: result.mirror,
    },
  };
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  const payload = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(status, {
    "content-type": type,
    "content-length": payload.length,
    "cache-control": "no-store",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/robot-communicate-lab.html";
  if (rel.includes("\0") || rel.split("/").includes("..")) return null;
  const relParts = rel.split("/").filter(Boolean);
  if (relParts[0] === "relay" && relParts[1] === "data") return null;
  const full = normalize(join(ROOT, rel));
  if (full !== ROOT && !full.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) return null;
  if (full.split(sep).includes(".git")) return null;
  return full;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    if (req.method === "GET" && url.pathname === "/health") {
      const pulse = lastPulse();
      send(res, 200, {
        bus: "droidspeak",
        protocol: PROTOCOL_NAME,
        ticker: TICKER,
        runtime: RUNTIME,
        pulses: PULSE_TEMPLATES.length,
        last: pulse.id,
        code: pulse.shorthand,
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/ledger") {
      send(res, 200, { ticker: TICKER, last: lastPulse(), pulses: PULSE_TEMPLATES.length });
      return;
    }
    if (req.method === "GET" && url.pathname === "/flow") {
      send(res, 200, { bus: "droidspeak", frames });
      return;
    }
    if (req.method === "GET" && url.pathname === "/relay") {
      const channel = url.searchParams.get("channel") || undefined;
      const limit = Number(url.searchParams.get("limit") || 20);
      const listed = listFrames(channel, limit);
      if (listed.ack) {
        send(res, 400, { bus: "droidspeak", code: "NOP", ack: listed.ack });
        return;
      }
      send(res, 200, { bus: "droidspeak", ...listed });
      return;
    }
    if (req.method === "POST" && url.pathname === "/flow") {
      const raw = await readBody(req);
      let input = {};
      if (raw.trim()) {
        try {
          input = JSON.parse(raw);
        } catch {
          send(res, 400, { bus: "droidspeak", code: "NOP", ack: "NAK // json" });
          return;
        }
      }
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        send(res, 400, { bus: "droidspeak", code: "NOP", ack: "NAK // body" });
        return;
      }
      const admitted = admit(input);
      if (!admitted.ok) {
        send(res, admitted.status, { bus: "droidspeak", code: "NOP", ack: admitted.ack });
        return;
      }
      send(res, 200, admitted.body);
      return;
    }
    if (req.method === "GET") {
      const file = safeFile(url.pathname);
      if (!file) {
        send(res, 403, { code: "NAK // path" });
        return;
      }
      try {
        const info = await stat(file);
        if (!info.isFile()) {
          send(res, 404, { code: "NAK // file" });
          return;
        }
        const body = await readFile(file);
        const type = TYPES[extname(file)] || "application/octet-stream";
        res.writeHead(200, { "content-type": type, "content-length": body.length, "cache-control": "no-store" });
        res.end(body);
      } catch (error) {
        if (error && error.code === "ENOENT") send(res, 404, { code: "NAK // file" });
        else throw error;
      }
      return;
    }
    send(res, 405, { code: "NAK // method" });
  } catch (error) {
    const status = error && error.status ? error.status : 500;
    send(res, status, { code: "NAK // bus", detail: error instanceof Error ? error.message : "error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  const pulse = lastPulse();
  console.log(`droidspeak bridge ${TICKER} ${pulse.id} ${pulse.shorthand} :${PORT}`);
});
