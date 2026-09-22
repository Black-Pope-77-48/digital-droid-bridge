import { PULSE_TEMPLATES, type JobTemplate, type Vertical } from "./catalog";

export const VERTICAL_HINTS: Record<Vertical, string[]> = {
  orbital: ["keel", "ring", "lattice", "spine", "seal"],
  energy: ["solar", "grid", "bus", "hinge"],
  health: ["vitals", "med", "triage", "infusion", "pump"],
  logistics: ["haul", "dock", "vector", "beam"],
  finance: ["clear", "settle", "ledger", "recon"],
  civic: ["yard", "permit", "control"],
  media: ["feed", "cast", "cut", "studio", "air"],
  legal: ["clause", "file", "hold", "claim"],
  climate: ["press", "atmo", "seal"],
  compute: ["opt", "scan", "sync", "wafer", "etch"],
  maritime: ["berth", "hull", "tide", "strake", "fair"],
  agrifood: ["yield", "silo", "lot"],
};

const STOP = new Set([
  "the",
  "a",
  "an",
  "in",
  "on",
  "to",
  "of",
  "and",
  "is",
  "are",
  "for",
  "with",
  "at",
  "from",
]);

const LEX: Record<string, string> = {
  "strut torque in spec": "STRUT.TQ OK",
  "plate seam sealed": "PLATE.SEAM LOCK",
  "keel pass complete": "KEEL.PASS DONE",
  "truss lock confirmed": "TRUSS.LOCK OK",
  "weld bead holding": "WELD.BEAD HOLD",
  "lattice node seated": "LAT.NODE SEAT",
  "ring alignment within 4mm. correcting": "RING.ALN 4MM // corr",
  "no microfracture on outer spar": "SPAR.SCAN CLEAR",
  "solar hinge play is inside tolerance": "SOL.HINGE PLAY // tol-ok",
  "docking collar square to the spine": "DOCK.COL SQUARE // spine-ref",
  "keel and spine authorized. hold the line": "KEEL.SPINE AUTH // hold",
  "inner hab ring going live. droids to stations": "HAB.RING LIVE // stations",
  "outer lattice unfolding. watch the sweep": "LAT.OUT UNFOLD // sweep",
  "solar arrays deploying. grid on standby": "SOL.ARRAY GO // grid-sb",
  "docking arms and pressure seal. finish it": "DOCK.SEAL FIN // press",
  "assembly vector locked. crew deploying": "ASM.VEC LOCK // crew-go",
  "all units returning to holding lattice": "SWARM.RCL HOLD // lattice",
  "optical uplink established": "OPT.UPLINK LOCK",
  "uplink locked. swarm telemetry live": "LINK.LOCK // tel-10",
};

export function encode(plain: string): string {
  const key = plain
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
  if (LEX[key]) return LEX[key];
  const hit = matchJob(plain);
  if (hit) return hit.shorthand;
  const parts = key
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .slice(0, 5)
    .map((w) => w.slice(0, 6).toUpperCase());
  if (!parts.length) return "NOP";
  const head = parts.slice(0, 2).join(".");
  const tail = parts.slice(2).join("-");
  return tail ? `${head} ${tail}` : head;
}

export function matchJob(plain: string): JobTemplate | undefined {
  const blob = plain.toLowerCase();
  return PULSE_TEMPLATES.find((job) => {
    const hints = VERTICAL_HINTS[job.vertical] ?? [];
    const titleBits = job.title.toLowerCase().split(/\s+/);
    return [...hints, ...titleBits].some((w) => w.length > 2 && blob.includes(w));
  });
}

export function decodeHint(code: string): string {
  const job = PULSE_TEMPLATES.find((j) => j.shorthand === code);
  return job ? job.title : code;
}
