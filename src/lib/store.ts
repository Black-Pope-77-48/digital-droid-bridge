import { PULSE_TEMPLATES, type JobTemplate } from "./catalog";

export function lastPulse(): JobTemplate {
  return PULSE_TEMPLATES[PULSE_TEMPLATES.length - 1];
}

export function findPulse(id: string): JobTemplate | undefined {
  return PULSE_TEMPLATES.find((j) => j.id === id);
}
