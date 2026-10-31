export type Vertical =
  | "orbital"
  | "energy"
  | "health"
  | "logistics"
  | "finance"
  | "civic"
  | "media"
  | "legal"
  | "climate"
  | "compute"
  | "maritime"
  | "agrifood";

export interface Agent {
  id: string;
  callsign: string;
  role: string;
}

export interface JobTemplate {
  id: string;
  title: string;
  vertical: Vertical;
  agentId: string;
  shorthand: string;
}

export const PROTOCOL_NAME = "Faith.Emezue Droidspeak";
export const TICKER = "FAITH";
export const RUNTIME = "Digital Droid Bridge";

export const AGENTS: Agent[] = [
  { id: "kite-07", callsign: "KITE-07", role: "architect" },
  { id: "spar-12", callsign: "SPAR-12", role: "welder" },
  { id: "haul-03", callsign: "HAUL-03", role: "hauler" },
  { id: "iris-21", callsign: "IRIS-21", role: "inspector" },
  { id: "rig-09", callsign: "RIG-09", role: "rigger" },
  { id: "forge-44", callsign: "FORGE-44", role: "former" },
  { id: "nest-18", callsign: "NEST-18", role: "fitter" },
  { id: "arc-02", callsign: "ARC-02", role: "grid" },
  { id: "drift-33", callsign: "DRIFT-33", role: "scout" },
  { id: "anchor-01", callsign: "ANCHOR-01", role: "dock" },
];

export const PULSE_TEMPLATES: JobTemplate[] = [
  {
    id: "pulse-keel-lock",
    title: "Keel torque lock",
    vertical: "orbital",
    agentId: "spar-12",
    shorthand: "KEEL.TQ LOCK // spec-ok",
  },
  {
    id: "pulse-hab-seat",
    title: "Hab plate seat",
    vertical: "orbital",
    agentId: "nest-18",
    shorthand: "HAB.PLATE SEAT // ring-0",
  },
  {
    id: "pulse-lattice-node",
    title: "Outer lattice node",
    vertical: "orbital",
    agentId: "rig-09",
    shorthand: "LAT.NODE SEAT // sweep-ok",
  },
  {
    id: "pulse-solar-hinge",
    title: "Solar hinge play",
    vertical: "energy",
    agentId: "arc-02",
    shorthand: "SOL.HINGE PLAY // tol-ok",
  },
  {
    id: "pulse-dock-square",
    title: "Docking collar square",
    vertical: "logistics",
    agentId: "anchor-01",
    shorthand: "DOCK.COL SQUARE // spine-ref",
  },
  {
    id: "pulse-grid-hot",
    title: "Yard power bus hot",
    vertical: "energy",
    agentId: "arc-02",
    shorthand: "BUS.HOT HOLD // swarm-10",
  },
  {
    id: "pulse-scan-spar",
    title: "Optical spar sweep",
    vertical: "compute",
    agentId: "iris-21",
    shorthand: "OPT.SPAR SWEEP // 4mm",
  },
  {
    id: "pulse-haul-beam",
    title: "Beam haul vector",
    vertical: "logistics",
    agentId: "haul-03",
    shorthand: "BEAM.VEC LOCK // crew-go",
  },
  {
    id: "pulse-climate-seal",
    title: "Pressure seal green",
    vertical: "climate",
    agentId: "kite-07",
    shorthand: "SEAL.GRN HOLD // press-ok",
  },
  {
    id: "pulse-civic-yard",
    title: "Yard control vector",
    vertical: "civic",
    agentId: "kite-07",
    shorthand: "YARD.VEC LOCK // lattice-10",
  },
  {
    id: "pulse-claim-adj",
    title: "Claims adjudication pulse",
    vertical: "legal",
    agentId: "iris-21",
    shorthand: "CLAIM.ADJ PULSE // hold-file",
  },
  {
    id: "pulse-berth-tide",
    title: "Berth tide gate",
    vertical: "maritime",
    agentId: "anchor-01",
    shorthand: "BERTH.TIDE GATE // hull-ok",
  },
  {
    id: "pulse-silo-weigh",
    title: "Silo lot weigh",
    vertical: "agrifood",
    agentId: "haul-03",
    shorthand: "SILO.LOT WEIGH // yield-ok",
  },
  {
    id: "pulse-recon-sweep",
    title: "Ledger recon sweep",
    vertical: "finance",
    agentId: "iris-21",
    shorthand: "LED.RECON SWEEP // break-0",
  },
  {
    id: "pulse-infusion-lock",
    title: "Infusion pump lock",
    vertical: "health",
    agentId: "nest-18",
    shorthand: "INF.PUMP LOCK // rate-ok",
  },
  {
    id: "pulse-cast-air",
    title: "Studio feed air",
    vertical: "media",
    agentId: "drift-33",
    shorthand: "CAST.FEED AIR // cut-ok",
  },
  {
    id: "pulse-strake-form",
    title: "Strake plate form",
    vertical: "maritime",
    agentId: "forge-44",
    shorthand: "STRAKE.PLT FORM // fair-ok",
  },
  {
    id: "pulse-etch-hold",
    title: "Wafer etch hold",
    vertical: "compute",
    agentId: "iris-21",
    shorthand: "WAF.ETCH HOLD // spec-ok",
  },
  {
    id: "pulse-sterile-field",
    title: "Sterile field hold",
    vertical: "health",
    agentId: "iris-21",
    shorthand: "STER.FIELD HOLD // pack-ok",
  },
  {
    id: "pulse-belt-tens",
    title: "Belt tension lock",
    vertical: "logistics",
    agentId: "rig-09",
    shorthand: "BELT.TENS LOCK // load-ok",
  },
  {
    id: "pulse-batt-seat",
    title: "Battery pack seat",
    vertical: "energy",
    agentId: "nest-18",
    shorthand: "BATT.PACK SEAT // therm-ok",
  },
  {
    id: "pulse-atmo-scrub",
    title: "Atmo scrub cycle",
    vertical: "climate",
    agentId: "kite-07",
    shorthand: "ATMO.SCRUB CYCLE // ppm-ok",
  },
  {
    id: "pulse-irr-valve",
    title: "Irrigation valve lock",
    vertical: "agrifood",
    agentId: "nest-18",
    shorthand: "IRR.VALVE LOCK // flow-ok",
  },
  {
    id: "pulse-turb-pitch",
    title: "Turbine pitch lock",
    vertical: "energy",
    agentId: "arc-02",
    shorthand: "TURB.PITCH LOCK // rpm-ok",
  },
  {
    id: "pulse-crane-boom",
    title: "Crane boom lock",
    vertical: "logistics",
    agentId: "rig-09",
    shorthand: "CRANE.BOOM LOCK // reach-ok",
  },
  {
    id: "pulse-shaft-aln",
    title: "Shaft align lock",
    vertical: "maritime",
    agentId: "forge-44",
    shorthand: "SHAFT.ALN LOCK // runout-ok",
  },
  {
    id: "pulse-stack-opac",
    title: "Stack opacity hold",
    vertical: "climate",
    agentId: "kite-07",
    shorthand: "STACK.OPAC HOLD // ppm-ok",
  },
  {
    id: "pulse-permit-queue",
    title: "Permit queue hold",
    vertical: "civic",
    agentId: "kite-07",
    shorthand: "PERM.QUEUE HOLD // stamp-ok",
  },
  {
    id: "pulse-docket-seal",
    title: "Docket seal hold",
    vertical: "legal",
    agentId: "iris-21",
    shorthand: "DOCKT.SEAL HOLD // file-ok",
  },
  {
    id: "pulse-cold-probe",
    title: "Cold chain probe",
    vertical: "agrifood",
    agentId: "iris-21",
    shorthand: "COLD.PROBE HOLD // temp-ok",
  },
  {
    id: "pulse-cue-sheet",
    title: "Cue sheet lock",
    vertical: "media",
    agentId: "drift-33",
    shorthand: "CUE.SHEET LOCK // slate-ok",
  },
  {
    id: "pulse-weld-bead",
    title: "Weld bead hold",
    vertical: "orbital",
    agentId: "spar-12",
    shorthand: "WELD.BEAD HOLD // bead-ok",
  },
  {
    id: "pulse-nostro-bal",
    title: "Nostro balance hold",
    vertical: "finance",
    agentId: "iris-21",
    shorthand: "NOST.BAL HOLD // cut-ok",
  },
  {
    id: "pulse-rad-plate",
    title: "Radiograph plate hold",
    vertical: "health",
    agentId: "iris-21",
    shorthand: "RAD.PLATE HOLD // dose-ok",
  },
  {
    id: "pulse-pallet-wrap",
    title: "Pallet wrap lock",
    vertical: "logistics",
    agentId: "haul-03",
    shorthand: "PALL.WRAP LOCK // film-ok",
  },
  {
    id: "pulse-swgr-rack",
    title: "Switchgear rack lock",
    vertical: "energy",
    agentId: "arc-02",
    shorthand: "SWGR.RACK LOCK // trip-ok",
  },
  {
    id: "pulse-probe-card",
    title: "Probe card seat",
    vertical: "compute",
    agentId: "iris-21",
    shorthand: "PROB.CARD SEAT // cont-ok",
  },
  {
    id: "pulse-hatch-seal",
    title: "Cargo hatch seal",
    vertical: "maritime",
    agentId: "anchor-01",
    shorthand: "HATCH.SEAL LOCK // press-ok",
  },
  {
    id: "pulse-mask-align",
    title: "Mask align hold",
    vertical: "compute",
    agentId: "iris-21",
    shorthand: "MASK.ALN HOLD // reg-ok",
  },
  {
    id: "pulse-fork-mast",
    title: "Forklift mast lock",
    vertical: "logistics",
    agentId: "rig-09",
    shorthand: "FORK.MAST LOCK // height-ok",
  },
  {
    id: "pulse-dial-filt",
    title: "Dialysis filter lock",
    vertical: "health",
    agentId: "nest-18",
    shorthand: "DIAL.FILT LOCK // flow-ok",
  },
  {
    id: "pulse-settle-batch",
    title: "Settlement batch hold",
    vertical: "finance",
    agentId: "iris-21",
    shorthand: "SETL.BATCH HOLD // clear-ok",
  },
  {
    id: "pulse-grain-dry",
    title: "Grain dryer hold",
    vertical: "agrifood",
    agentId: "nest-18",
    shorthand: "GRAIN.DRY HOLD // moist-ok",
  },
  {
    id: "pulse-seed-drill",
    title: "Seed drill lock",
    vertical: "agrifood",
    agentId: "haul-03",
    shorthand: "SEED.DRL LOCK // depth-ok",
  },
  {
    id: "pulse-xfmr-tap",
    title: "Transformer tap lock",
    vertical: "energy",
    agentId: "arc-02",
    shorthand: "XFMR.TAP LOCK // volt-ok",
  },
  {
    id: "pulse-valve-act",
    title: "Valve actuator lock",
    vertical: "energy",
    agentId: "arc-02",
    shorthand: "VALVE.ACT LOCK // pos-ok",
  },
  {
    id: "pulse-vent-tidal",
    title: "Ventilator tidal lock",
    vertical: "health",
    agentId: "nest-18",
    shorthand: "VENT.TID LOCK // vol-ok",
  },
  {
    id: "pulse-inverter-sync",
    title: "Inverter sync lock",
    vertical: "energy",
    agentId: "arc-02",
    shorthand: "INV.SYNC LOCK // phase-ok",
  },
  {
    id: "pulse-pipe-clamp",
    title: "Pipe clamp lock",
    vertical: "logistics",
    agentId: "rig-09",
    shorthand: "PIPE.CLMP LOCK // torque-ok",
  },
  {
    id: "pulse-winch-brake",
    title: "Winch brake lock",
    vertical: "maritime",
    agentId: "rig-09",
    shorthand: "WINCH.BRK LOCK // hold-ok",
  },
  {
    id: "pulse-breaker-trip",
    title: "Breaker trip lock",
    vertical: "energy",
    agentId: "arc-02",
    shorthand: "BRKR.TRIP LOCK // open-ok",
  },
  {
    id: "pulse-fan-tray",
    title: "Fan tray seat",
    vertical: "compute",
    agentId: "iris-21",
    shorthand: "FAN.TRAY SEAT // rpm-ok",
  },
  {
    id: "pulse-cool-spray",
    title: "Cooling spray lock",
    vertical: "climate",
    agentId: "kite-07",
    shorthand: "COOL.SPRAY LOCK // flow-ok",
  },
  {
    id: "pulse-ecg-lead",
    title: "ECG lead lock",
    vertical: "health",
    agentId: "nest-18",
    shorthand: "ECG.LEAD LOCK // trace-ok",
  },
  {
    id: "pulse-sort-gate",
    title: "Sorter gate lock",
    vertical: "logistics",
    agentId: "haul-03",
    shorthand: "SORT.GATE LOCK // divert-ok",
  },
  {
    id: "pulse-bag-filt",
    title: "Baghouse filter lock",
    vertical: "climate",
    agentId: "kite-07",
    shorthand: "BAG.FILT LOCK // dust-ok",
  },
  {
    id: "pulse-boom-mic",
    title: "Boom mic lock",
    vertical: "media",
    agentId: "drift-33",
    shorthand: "BOOM.MIC LOCK // gain-ok",
  },
  {
    id: "pulse-mri-mag",
    title: "MRI magnet hold",
    vertical: "health",
    agentId: "iris-21",
    shorthand: "MRI.MAG HOLD // field-ok",
  },
];
