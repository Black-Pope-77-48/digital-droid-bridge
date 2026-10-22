import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));

export const CHANNELS = ["bots", "forex", "finance", "invest", "pulse"];

const BLOCKED_ACTIONS = new Set([
  "trade",
  "order",
  "buy",
  "sell",
  "transfer",
  "payment",
  "pay",
  "withdraw",
  "deposit",
  "execute",
  "fill",
]);

export function dataDir() {
  return process.env.RELAY_DATA || join(REPO, "relay", "data");
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function reject(status, ack) {
  return { status, ack, ok: false };
}

function guard(channel, data) {
  const action = typeof data.action === "string" ? data.action.trim().toLowerCase() : "";
  if (BLOCKED_ACTIONS.has(action) || data.execute === true || data.placeTrade === true) {
    return reject(400, "NAK // relay-only");
  }
  if (channel === "forex" && data.mode !== undefined && data.mode !== "paper") {
    return reject(400, "NAK // paper");
  }
  if ((channel === "finance" || channel === "invest") && data.mode !== undefined && data.mode !== "read-only") {
    return reject(400, "NAK // read-only");
  }
  return null;
}

function nextSeq(dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "seq");
  let current = 0;
  try {
    current = Number(readFileSync(file, "utf8"));
    if (!Number.isFinite(current)) current = 0;
  } catch {
    current = 0;
  }
  const seq = current + 1;
  writeFileSync(file, String(seq));
  return seq;
}

function persist(dir, channel, host, mirror) {
  mkdirSync(join(dir, "outbox"), { recursive: true });
  appendFileSync(join(dir, "inbox.jsonl"), `${JSON.stringify(host)}\n`);
  appendFileSync(join(dir, "outbox", `${channel}.jsonl`), `${JSON.stringify(mirror)}\n`);
}

export function admitFrame(input, options = {}) {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : null;
  if (!body) return reject(400, "NAK // body");

  const requested = body.channel === undefined || body.channel === null ? "pulse" : body.channel;
  if (typeof requested !== "string" || !CHANNELS.includes(requested)) {
    return reject(400, "NAK // channel");
  }

  const supplied = asObject(body.data);
  const blocked = guard(requested, supplied);
  if (blocked) return blocked;

  const plain = typeof body.plain === "string" ? body.plain : "";
  const given = typeof body.code === "string" ? body.code.trim() : "";
  const code = given || (options.encode ? options.encode(plain) : plain.trim()) || "NOP";
  const data = options.enrich ? options.enrich(code, supplied) : { ...supplied };
  if (requested === "forex" && data.mode === undefined) data.mode = "paper";
  if ((requested === "finance" || requested === "invest") && data.mode === undefined) data.mode = "read-only";

  const callsign = typeof data.callsign === "string" ? data.callsign.trim() : "";
  const ack = callsign ? `ACK // ${callsign}` : "ACK // rx-ok";
  const ts = new Date().toISOString();
  const dir = options.persist === false ? null : dataDir();
  const hostSeq = dir ? nextSeq(dir) : 0;
  const mirrorSeq = dir ? nextSeq(dir) : 0;
  const host = { seq: hostSeq, ts, dir: "host", channel: requested, code, data };
  const mirror = { seq: mirrorSeq, ts, dir: "mirror", channel: requested, code, data, ack };
  if (dir) persist(dir, requested, host, mirror);
  return { status: 200, ok: true, code, data, host, mirror };
}

function readJsonl(file) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
  const frames = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    frames.push(JSON.parse(line));
  }
  return frames;
}

export function listFrames(channel, limit = 20) {
  const dir = dataDir();
  const take = Number.isFinite(limit) && limit > 0 ? limit : 20;
  if (channel) {
    if (!CHANNELS.includes(channel)) return { channel, frames: [], ack: "NAK // channel" };
    const frames = readJsonl(join(dir, "outbox", `${channel}.jsonl`));
    return { channel, frames: frames.slice(-take) };
  }
  const frames = {};
  for (const name of CHANNELS) {
    frames[name] = readJsonl(join(dir, "outbox", `${name}.jsonl`)).slice(-take);
  }
  return { channels: CHANNELS, frames };
}
