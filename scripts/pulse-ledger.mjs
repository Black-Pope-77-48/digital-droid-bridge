import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const VERTICALS = Object.freeze([
  "orbital",
  "energy",
  "health",
  "logistics",
  "finance",
  "civic",
  "media",
  "legal",
  "climate",
  "compute",
  "maritime",
  "agrifood",
]);

export const WINDOW_DAYS = 7;
export const SHORTHAND_MAX_BYTES = 32;
export const ISSUE_COMMENTS =
  "https://api.github.com/repos/Black-Pope-77-48/digital-droid-bridge/issues/1/comments";

const TEMPLATE_RE =
  /\{\s*id:\s*"(pulse-[a-z0-9-]+)"\s*,\s*title:\s*"([^"]*)"\s*,\s*vertical:\s*"([a-z]+)"/g;

export function emptyVerticals() {
  return Object.fromEntries(VERTICALS.map((name) => [name, null]));
}

export function normalizeIso(value) {
  if (typeof value !== "string") return null;
  const millis = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d{1,3}Z$/.exec(value);
  if (millis) return normalizeIso(`${millis[1]}Z`);
  const zulu = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(value);
  if (zulu) return stamp(zulu[1], zulu[2], zulu[3], zulu[4], zulu[5], zulu[6]);
  const minute = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})Z$/.exec(value);
  if (minute) return stamp(minute[1], minute[2], minute[3], minute[4], minute[5], "00");
  const offset = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2})$/.exec(value);
  if (!offset) return null;
  const ms = Date.parse(`${offset[1]}${offset[2]}`);
  if (Number.isNaN(ms)) return null;
  return normalizeIso(new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z"));
}

function stamp(year, month, day, hour, minute, second) {
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const dt = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  const back = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}Z`;
  return back === iso ? iso : null;
}

export function shorthandError(value) {
  if (typeof value !== "string" || value.length === 0) return "shorthand is empty";
  if (!/^[\x20-\x7E]+$/.test(value)) return "shorthand must be printable ASCII";
  if (Buffer.byteLength(value, "utf8") > SHORTHAND_MAX_BYTES) return "shorthand exceeds 32 bytes";
  return null;
}

export function tickLit(at, now, windowDays = WINDOW_DAYS) {
  const pulse = normalizeIso(at);
  const current = now instanceof Date ? normalizeIso(now.toISOString()) : normalizeIso(now);
  if (!pulse || !current) return false;
  if (pulse > current) return false;
  return Date.parse(current) - Date.parse(pulse) <= windowDays * 24 * 60 * 60 * 1000;
}

export function templatesFromCatalog(source) {
  const templates = [];
  const seen = new Set();
  for (const match of source.matchAll(TEMPLATE_RE)) {
    const id = match[1];
    if (seen.has(id)) throw new Error(`duplicate template id ${id}`);
    const vertical = match[3];
    if (!VERTICALS.includes(vertical)) throw new Error(`${id} has unknown vertical ${vertical}`);
    seen.add(id);
    templates.push({ id, title: match[2], vertical });
  }
  const ids = [...source.matchAll(/id:\s*"(pulse-[a-z0-9-]+)"/g)].map((match) => match[1]);
  if (ids.length !== templates.length) {
    throw new Error(`catalog parse found ${templates.length} templates and ${ids.length} ids`);
  }
  return templates;
}

export function evidenceFromComments(comments) {
  const evidence = [];
  for (const comment of comments) {
    const at = normalizeIso(comment?.created_at);
    if (!at || typeof comment?.body !== "string") continue;
    for (const line of comment.body.split(/\r?\n/)) {
      const match = /^\s*vertical:\s*([a-z]+)\b/.exec(line);
      if (!match || !VERTICALS.includes(match[1])) continue;
      evidence.push({
        vertical: match[1],
        at,
        source: comment.html_url || `issue comment ${comment.id ?? "unknown"}`,
      });
    }
  }
  return evidence;
}

export function latestVerticals(evidence) {
  const verticals = emptyVerticals();
  for (const item of evidence) {
    if (!VERTICALS.includes(item.vertical)) continue;
    const at = normalizeIso(item.at);
    if (!at) continue;
    const prev = verticals[item.vertical];
    if (prev == null || at > prev) verticals[item.vertical] = at;
  }
  return verticals;
}

function git(root, args, { missing = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (missing && error.status === 128) return null;
    const stderr = error.stderr?.toString?.() ?? "";
    throw new Error(`git ${args.join(" ")} failed: ${stderr || error.message}`);
  }
}

// Commit evidence is the `lastPulse.at` value stored in each historical
// WORKFLOW.json. A template that was committed but never recorded as
// lastPulse uses that commit's author time instead. No other clock is used.
export function collectGitEvidence(root) {
  const catalogPath = path.join(root, "src/lib/catalog.ts");
  const workflowPath = path.join(root, "WORKFLOW.json");
  const currentTemplates = templatesFromCatalog(readFileSync(catalogPath, "utf8"));
  const verticalOf = new Map(currentTemplates.map((template) => [template.id, template.vertical]));
  const seen = new Set();
  const log = git(root, ["log", "--reverse", "--format=%H%x09%aI", "--", "src/lib/catalog.ts", "WORKFLOW.json"]).trim();
  const additions = [];
  const pulses = [];
  let previousKey = "";

  if (log) {
    for (const line of log.split("\n")) {
      const [hash, authored] = line.split("\t");
      const names = git(root, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", hash])
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean);
      if (names.includes("src/lib/catalog.ts")) {
        const source = git(root, ["show", `${hash}:src/lib/catalog.ts`], { missing: true });
        if (source) {
          for (const template of templatesFromCatalog(source)) {
            const known = verticalOf.get(template.id);
            if (known && known !== template.vertical) {
              throw new Error(`${template.id} changed vertical from ${known} to ${template.vertical}`);
            }
            if (!known) verticalOf.set(template.id, template.vertical);
            if (seen.has(template.id)) continue;
            seen.add(template.id);
            const at = normalizeIso(authored);
            if (!at) throw new Error(`commit ${hash} has no ISO author time`);
            additions.push({
              id: template.id,
              vertical: template.vertical,
              at,
              source: `commit ${hash} added ${template.id}`,
            });
          }
        }
      }
      if (names.includes("WORKFLOW.json")) {
        const raw = git(root, ["show", `${hash}:WORKFLOW.json`], { missing: true });
        if (!raw) continue;
        const workflow = JSON.parse(raw);
        const id = workflow?.lastPulse?.id;
        const at = normalizeIso(workflow?.lastPulse?.at);
        if (!id || !at) continue;
        const key = `${id}@${at}`;
        if (key === previousKey) continue;
        previousKey = key;
        pulses.push({ id, at, source: `commit ${hash} lastPulse ${id}` });
      }
    }
  }

  const workflow = JSON.parse(readFileSync(workflowPath, "utf8"));
  const currentAt = normalizeIso(workflow?.lastPulse?.at);
  if (workflow?.lastPulse?.id && currentAt) {
    const key = `${workflow.lastPulse.id}@${currentAt}`;
    if (key !== previousKey) {
      pulses.push({
        id: workflow.lastPulse.id,
        at: currentAt,
        source: `WORKFLOW.json lastPulse ${workflow.lastPulse.id}`,
      });
    }
  }

  const evidenced = new Set(pulses.map((pulse) => pulse.id));
  const evidence = [];
  for (const pulse of pulses) {
    const vertical = verticalOf.get(pulse.id);
    if (!vertical) throw new Error(`no catalog vertical for ${pulse.id}`);
    evidence.push({ vertical, at: pulse.at, source: pulse.source });
  }
  for (const addition of additions) {
    if (evidenced.has(addition.id)) continue;
    evidence.push({
      vertical: addition.vertical,
      at: addition.at,
      source: addition.source,
    });
  }
  return evidence;
}

export async function fetchIssueComments() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "digital-droid-bridge-pulse-sync",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const comments = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(`${ISSUE_COMMENTS}?per_page=100&page=${page}`, { headers });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`GitHub issue comments ${response.status}: ${detail.slice(0, 180)}`);
    }
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error("GitHub issue comments were not a list");
    comments.push(...batch);
    if (batch.length < 100) break;
  }
  if (comments.length === 0) throw new Error("GitHub issue #1 returned no comments");
  return comments;
}

export function formatVerticalsProperty(verticals) {
  const normalized = latestVerticals(
    VERTICALS.flatMap((name) => {
      const at = verticals?.[name];
      return at == null ? [] : [{ vertical: name, at }];
    }),
  );
  for (const name of VERTICALS) {
    if (verticals?.[name] != null && normalized[name] == null) {
      throw new Error(`invalid timestamp for ${name}`);
    }
  }
  const lines = VERTICALS.map((name, index) => {
    const value = normalized[name] == null ? "null" : JSON.stringify(normalized[name]);
    const comma = index === VERTICALS.length - 1 ? "" : ",";
    return `    "${name}": ${value}${comma}`;
  });
  return `"verticals": {\n${lines.join("\n")}\n  }`;
}

export function upsertVerticals(text, verticals) {
  const property = formatVerticalsProperty(verticals);
  let next;
  if (/"verticals"\s*:/.test(text)) {
    next = text.replace(/"verticals"\s*:\s*\{[^}]*\}/, property);
    if (next === text && !text.includes(property)) throw new Error("failed to replace verticals");
  } else {
    const trimmed = text.replace(/\s*$/, "");
    const closeAt = trimmed.lastIndexOf("}");
    if (closeAt < 0) throw new Error("WORKFLOW.json has no closing brace");
    let head = trimmed.slice(0, closeAt).replace(/\s*$/, "");
    if (!head.endsWith(",")) head += ",";
    next = `${head}\n  ${property}\n}\n`;
  }
  return next.endsWith("\n") ? next : `${next}\n`;
}

export function pulseDocument({ verticals, lastPulse, updatedAt }) {
  const at = normalizeIso(lastPulse?.at);
  if (!at) throw new Error("lastPulse.at is not an ISO UTC timestamp");
  const shorthand = shorthandError(lastPulse?.shorthand);
  if (shorthand) throw new Error(shorthand);
  if (typeof lastPulse?.id !== "string" || !/^pulse-[a-z0-9-]+$/.test(lastPulse.id)) {
    throw new Error("lastPulse.id is missing");
  }
  const updated = normalizeIso(updatedAt);
  if (!updated) throw new Error("updatedAt is not an ISO UTC timestamp");
  return {
    verticals: latestVerticals(
      VERTICALS.flatMap((name) => (verticals[name] == null ? [] : [{ vertical: name, at: verticals[name] }])),
    ),
    lastPulse: { id: lastPulse.id, shorthand: lastPulse.shorthand, at },
    windowDays: WINDOW_DAYS,
    updatedAt: updated,
  };
}

function samePulse(a, b) {
  if (!a || !b) return false;
  const strip = (doc) => JSON.stringify({ ...doc, updatedAt: "" });
  return strip(a) === strip(b);
}

export async function syncPulse({ root, write, now = new Date(), comments }) {
  const workflowPath = path.join(root, "WORKFLOW.json");
  const pulsePath = path.join(root, "pulse.json");
  const workflow = JSON.parse(readFileSync(workflowPath, "utf8"));
  const resolvedComments = comments ?? (await fetchIssueComments());
  const evidence = [...collectGitEvidence(root), ...evidenceFromComments(resolvedComments)];
  const verticals = latestVerticals(evidence);
  for (const name of VERTICALS) {
    if (verticals[name] != null && !evidence.some((item) => item.vertical === name && item.at === verticals[name])) {
      throw new Error(`refusing to publish an unearned timestamp for ${name}`);
    }
  }
  const updatedAt = normalizeIso(now.toISOString());
  let document = pulseDocument({ verticals, lastPulse: workflow.lastPulse, updatedAt });
  let existing = null;
  try {
    existing = JSON.parse(readFileSync(pulsePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (existing && samePulse(existing, document)) {
    document = { ...document, updatedAt: existing.updatedAt };
  }
  const workflowText = readFileSync(workflowPath, "utf8");
  const nextWorkflow = upsertVerticals(workflowText, document.verticals);
  const nextPulse = `${JSON.stringify(document, null, 2)}\n`;
  const changed = nextWorkflow !== workflowText || readOrEmpty(pulsePath) !== nextPulse;
  if (write && changed) {
    writeFileSync(workflowPath, nextWorkflow);
    writeFileSync(pulsePath, nextPulse);
  }
  return { changed, document, evidence, workflow: nextWorkflow, pulseText: nextPulse };
}

function readOrEmpty(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}
