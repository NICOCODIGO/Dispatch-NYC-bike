import { NEEDS_TRUCK_THRESHOLD, type Signal } from '../model/score';
import { formatClock } from '../lib/time';

/**
 * A station's score across this session's readings.
 *
 * Hand-rolled SVG, 0-100 on the y axis with the truck threshold drawn as a
 * dashed rule — so "did it drop below the line?" is answerable without reading
 * a number. Each reading is a dot carrying its own time and score on hover,
 * because a line with no time axis is a shape, not evidence.
 */

const STROKE: Record<Signal, string> = {
  empty: 'var(--signal-empty)',
  full: 'var(--signal-full)',
  outage: 'var(--signal-outage)',
  ok: 'var(--signal-ok)',
};

export interface SparklineProps {
  /** Chronological scores, oldest first. */
  points: number[];
  /** Matching timestamps, for the per-point tooltips. */
  times?: number[];
  signal: Signal;
  width?: number;
  height?: number;
  /** Tiny mono labels under each end of the axis. */
  startLabel?: string;
  endLabel?: string;
}

export function Sparkline({
  points,
  times,
  signal,
  width = 132,
  height = 30,
  startLabel,
  endLabel,
}: SparklineProps) {
  if (points.length === 0) {
    return <span className="num text-[11px] text-[var(--ink-soft)]">no history</span>;
  }

  const pad = 3;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const toY = (score: number) => pad + innerH - (Math.max(0, Math.min(100, score)) / 100) * innerH;
  const toX = (i: number) =>
    points.length === 1 ? pad + innerW / 2 : pad + (i / (points.length - 1)) * innerW;

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p).toFixed(1)}`)
    .join(' ');
  const thresholdY = toY(NEEDS_TRUCK_THRESHOLD);
  const color = STROKE[signal];

  return (
    <span className="inline-block">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible"
        role="img"
        aria-label={`Score history: ${points.join(', ')}. Truck threshold is ${NEEDS_TRUCK_THRESHOLD}.`}
      >
        <line
          x1={0}
          y1={thresholdY}
          x2={width}
          y2={thresholdY}
          stroke="var(--line)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={toX(i)}
            cy={toY(p)}
            r={i === points.length - 1 ? 2.6 : 1.8}
            fill={i === points.length - 1 ? color : 'var(--surface)'}
            stroke={color}
            strokeWidth={1.2}
          >
            <title>
              {times?.[i] !== undefined ? `${formatClock(times[i]!)} — ` : ''}score {p}
            </title>
          </circle>
        ))}
      </svg>

      {(startLabel || endLabel) && (
        <span className="mt-1 flex justify-between" style={{ width }}>
          <span className="num text-[10px] text-[var(--ink-soft)]">{startLabel}</span>
          <span className="num text-[10px] text-[var(--ink-soft)]">{endLabel}</span>
        </span>
      )}
    </span>
  );
}
