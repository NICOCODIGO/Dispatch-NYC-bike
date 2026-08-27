import { TonePill } from './primitives';
import { TipBody, TipTitle, Tooltip } from './Tooltip';
import type { Tone } from './tone';
import { PROVENANCE_LABEL, PROVENANCE_MEANING, type Provenance } from '../content/constants';

/**
 * The one badge that says how much to trust what it sits next to.
 *
 * The method sheet grew this pattern first, for scoring constants. It is lifted
 * here unchanged because the moment a second screen needed it — the simulated
 * fleet — the alternative was a second badge that meant the same thing in a
 * different colour, and a reader cannot learn two vocabularies for one idea.
 *
 * The tooltip is not optional decoration. A pill reading "Simulated" with no
 * way to ask what that means is a disclaimer rather than an explanation, and
 * this app's whole claim is that it explains itself.
 */

export const PROVENANCE_TONE: Record<Provenance, Tone> = {
  measured: 'ok',
  reasoned: 'flood',
  guess: 'warn',
  simulated: 'mute',
};

export function ProvenancePill({
  provenance,
  detail,
}: {
  provenance: Provenance;
  /** Replaces the generic meaning where a field can say something sharper. */
  detail?: string;
}) {
  return (
    <Tooltip
      help
      width={250}
      content={
        <>
          <TipTitle>{PROVENANCE_LABEL[provenance]}</TipTitle>
          <TipBody>{detail ?? PROVENANCE_MEANING[provenance]}</TipBody>
        </>
      }
    >
      <TonePill label={PROVENANCE_LABEL[provenance]} tone={PROVENANCE_TONE[provenance]} />
    </Tooltip>
  );
}
