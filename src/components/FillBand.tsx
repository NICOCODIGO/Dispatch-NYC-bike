import {
  FLOODED_FILL_RATIO,
  STARVING_FILL_RATIO,
  type Signal,
} from '../model/score';

/**
 * Where a fill ratio sits on the 0-100% band, with the Starving / Healthy /
 * Flooded zones marked.
 *
 * Hand-rolled SVG. The zones are flat fills at low alpha (not gradients), and
 * the marker is a plain ink rule — the point is to show a dispatcher exactly
 * which side of a threshold a station is on, not to decorate the page.
 */

export interface FillBandProps {
  /** 0-1, or null when the station reports no usable slots. */
  ratio: number | null;
  signal?: Signal;
  /** Compact drops the zone labels; used in the right rail. */
  compact?: boolean;
  /** Overrides the marker caption (the rail shows a network average). */
  label?: string;
}

const MARKER: Record<Signal, string> = {
  empty: 'var(--signal-empty)',
  full: 'var(--signal-full)',
  outage: 'var(--signal-outage)',
  ok: 'var(--ink)',
};

export function FillBand({ ratio, signal = 'ok', compact = false, label }: FillBandProps) {
  const W = 100;
  const trackY = compact ? 6 : 14;
  const trackH = compact ? 10 : 18;
  const H = compact ? 30 : 58;

  const starveW = STARVING_FILL_RATIO * W;
  const floodX = FLOODED_FILL_RATIO * W;
  const x = ratio === null ? null : Math.max(0, Math.min(1, ratio)) * W;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-[58px] w-full"
        style={compact ? { height: 30 } : undefined}
        role="img"
        aria-label={
          ratio === null
            ? 'No usable slots reported, so there is no fill ratio to place.'
            : `${Math.round(ratio * 100)}% full. Starving is at or below ${Math.round(
                STARVING_FILL_RATIO * 100,
              )}%, flooded at or above ${Math.round(FLOODED_FILL_RATIO * 100)}%.`
        }
      >
        {/* Zones */}
        <rect
          x={0}
          y={trackY}
          width={starveW}
          height={trackH}
          fill="var(--signal-empty)"
          opacity={0.12}
        />
        <rect
          x={starveW}
          y={trackY}
          width={floodX - starveW}
          height={trackH}
          fill="var(--surface)"
        />
        <rect
          x={floodX}
          y={trackY}
          width={W - floodX}
          height={trackH}
          fill="var(--signal-full)"
          opacity={0.12}
        />

        {/* Hairline frame and threshold rules. vectorEffect keeps strokes at
            1px despite the non-uniform viewBox scaling. */}
        <rect
          x={0}
          y={trackY}
          width={W}
          height={trackH}
          fill="none"
          stroke="var(--line)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {[starveW, floodX].map((tx) => (
          <line
            key={tx}
            x1={tx}
            y1={trackY}
            x2={tx}
            y2={trackY + trackH}
            stroke="var(--line)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Marker */}
        {x !== null && (
          <line
            x1={x}
            y1={trackY - 4}
            x2={x}
            y2={trackY + trackH + 4}
            stroke={MARKER[signal]}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <figcaption className="mt-1 flex justify-between">
        {compact ? (
          <>
            <span className="num text-[11px] text-[var(--ink-soft)]">0%</span>
            <span className="num text-[11px] font-semibold text-[var(--ink)]">
              {label ?? (ratio === null ? '—' : `${Math.round(ratio * 100)}%`)}
            </span>
            <span className="num text-[11px] text-[var(--ink-soft)]">100%</span>
          </>
        ) : (
          <>
            <ZoneLabel title="Starving" range="0-15%" />
            <ZoneLabel title="Healthy" range="15-85%" center />
            <ZoneLabel title="Flooded" range="85-100%" right />
          </>
        )}
      </figcaption>
    </figure>
  );
}

function ZoneLabel({
  title,
  range,
  center,
  right,
}: {
  title: string;
  range: string;
  center?: boolean;
  right?: boolean;
}) {
  return (
    <span
      className={`flex flex-col ${right ? 'items-end' : center ? 'items-center' : 'items-start'}`}
    >
      <span className="text-[12px] text-[var(--ink)]">{title}</span>
      <span className="num text-[11px] text-[var(--ink-soft)]">{range}</span>
    </span>
  );
}
