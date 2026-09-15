import { PULSE_TEMPLATES, PROTOCOL_NAME, TICKER } from "../lib/catalog";
import { lastPulse } from "../lib/store";

export default function TrainRoute() {
  const pulse = lastPulse();
  return (
    <section data-protocol={PROTOCOL_NAME} data-ticker={TICKER}>
      <h1>train</h1>
      <p>
        {pulse.id} — {pulse.title}
      </p>
      <pre>{pulse.shorthand}</pre>
      <p>{PULSE_TEMPLATES.length} pulses</p>
    </section>
  );
}
