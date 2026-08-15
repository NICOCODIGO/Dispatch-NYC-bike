import { TONE, type Tone } from './tone';
import { cn } from '../lib/cn';

/**
 * Hand-rolled SVG charts.
 *
 * The console draws three shapes — a donut, a line pair and a bar row — and a
 * charting library would ship a renderer, a scale system and a theme layer to
 * produce them. These take the tone table directly, so a chart can never drift
 * from the badge colors sitting next to it.
 */

/* ---------------------------------------------------------------------------
   Donut.
--------------------------------------------------------------------------- */

export interface Slice {
  label: string;
  value: number;
  tone: Tone;
}

export function Donut({
  slices,
  size = 150,
  thickness = 26,
  centerValue,
  centerLabel,
  showSliceLabels = false,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerLabel?: string;
  showSliceLabels?: boolean;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  /** Three significant figures: 40.9%, 33.8%, 18.1%, 6.87%. */
  const pct = (v: number) => `${Number(((v / total) * 100).toPrecision(3))}%`;

  let acc = 0;
  const arcs = slices.map((s) => {
    const frac = s.value / total;
    const arc = { ...s, frac, offset: acc };
    acc += frac;
    return arc;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      <title>{slices.map((s) => `${s.label} ${pct(s.value)}`).join(', ')}</title>

      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {arcs.map((a) => (
          <circle
            key={a.label}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={TONE[a.tone].fg}
            strokeWidth={thickness}
            strokeDasharray={`${a.frac * c} ${c - a.frac * c}`}
            strokeDashoffset={-a.offset * c}
          />
        ))}
      </g>

      {showSliceLabels &&
        arcs
          .filter((a) => a.frac > 0.04)
          .map((a) => {
            const mid = (a.offset + a.frac / 2) * 2 * Math.PI - Math.PI / 2;
            return (
              <text
                key={a.label}
                x={cx + r * Math.cos(mid)}
                y={cy + r * Math.sin(mid)}
                textAnchor="middle"
                dominantBaseline="central"
                className="num"
                fontSize="10"
                fontWeight="600"
                fill="#fff"
              >
                {pct(a.value)}
              </text>
            );
          })}

      {centerValue && (
        <text
          x={cx}
          y={cy - (centerLabel ? 5 : 0)}
          textAnchor="middle"
          dominantBaseline="central"
          className="num"
          fontSize={size > 140 ? 19 : 15}
          fontWeight="600"
          fill="var(--color-ink)"
        >
          {centerValue}
        </text>
      )}
      {centerLabel && (
        <text
          x={cx}
          y={cy + 11}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="8"
          letterSpacing="0.08em"
          fill="var(--color-ink-3)"
        >
          {centerLabel}
        </text>
      )}
    </svg>
  );
}

export function Legend({
  slices,
  direction = 'row',
  size = 11,
  className,
}: {
  slices: Slice[];
  direction?: 'row' | 'column';
  size?: number;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        'flex',
        direction === 'column' ? 'flex-col gap-y-1' : 'flex-wrap justify-center gap-x-4 gap-y-1.5',
        className,
      )}
      style={{ fontSize: size }}
    >
      {slices.map((s) => (
        <li
          key={s.label}
          className="flex items-center gap-1.5 whitespace-nowrap text-[var(--color-ink-2)]"
        >
          <span
            aria-hidden="true"
            className="h-[8px] w-[8px] shrink-0 rounded-[2px]"
            style={{ backgroundColor: TONE[s.tone].fg }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
   Line chart — actual vs predicted.
--------------------------------------------------------------------------- */

export function LineChart({
  actual,
  predicted,
  xLabels,
  yMax = 200,
  yStep = 50,
  height = 210,
  yTitle,
}: {
  actual: number[];
  predicted: number[];
  xLabels: string[];
  yMax?: number;
  yStep?: number;
  height?: number;
  yTitle?: string;
}) {
  // A fixed viewBox scaled by `preserveAspectRatio="none"` would stretch the
  // stroke, so the chart draws into a wide viewBox and scales uniformly.
  const W = 1000;
  const H = height;
  const padL = 42;
  const padR = 12;
  const padT = 10;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const x = (i: number, n: number) => padL + (i / (n - 1)) * innerW;
  const y = (v: number) => padT + innerH - (v / yMax) * innerH;

  const toPath = (series: number[]) =>
    series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, series.length).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  const gridLines: number[] = [];
  for (let v = 0; v <= yMax; v += yStep) gridLines.push(v);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="Predicted versus actual system volume over 24 hours"
    >
      {gridLines.map((v) => (
        <g key={v}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--color-line-soft)"
            strokeWidth="1"
          />
          <text
            x={padL - 8}
            y={y(v)}
            textAnchor="end"
            dominantBaseline="central"
            className="num"
            fontSize="9"
            fill="var(--color-ink-3)"
          >
            {v}
          </text>
        </g>
      ))}

      {xLabels.map((label, i) => {
        const px = x((i / (xLabels.length - 1)) * (actual.length - 1), actual.length);
        return (
          <g key={label}>
            <line
              x1={px}
              x2={px}
              y1={padT}
              y2={padT + innerH}
              stroke="var(--color-line-soft)"
              strokeWidth="1"
            />
            <text
              x={px}
              y={H - 8}
              textAnchor="middle"
              className="num"
              fontSize="9"
              fill="var(--color-ink-3)"
            >
              {label}
            </text>
          </g>
        );
      })}

      {yTitle && (
        <text
          transform={`rotate(-90 12 ${padT + innerH / 2})`}
          x={12}
          y={padT + innerH / 2}
          textAnchor="middle"
          fontSize="9"
          fill="var(--color-ink-2)"
        >
          {yTitle}
        </text>
      )}

      <path
        d={toPath(predicted)}
        fill="none"
        stroke="var(--color-ink-2)"
        strokeWidth="1.5"
        strokeDasharray="3 3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={toPath(actual)}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The small key above the line chart. */
export function LineLegend() {
  return (
    <div className="flex items-center gap-5 text-[10px] text-[var(--color-ink-2)]">
      <span className="inline-flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden="true">
          <line x1="0" y1="3" x2="22" y2="3" stroke="var(--color-ink)" strokeWidth="2" />
        </svg>
        Actual System Demand
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden="true">
          <line
            x1="0"
            y1="3"
            x2="22"
            y2="3"
            stroke="var(--color-ink-2)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        </svg>
        Predicted Demand
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Bar row — 24h reporting health.
--------------------------------------------------------------------------- */

export function BarRow({
  bars,
  height = 56,
}: {
  bars: { value: number; tone: Tone }[];
  height?: number;
}) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {bars.map((b, i) => (
        <span
          key={i}
          className="flex-1 rounded-[3px]"
          style={{
            height: `${Math.max(8, (b.value / max) * 100)}%`,
            backgroundColor: TONE[b.tone].bg,
            boxShadow: `inset 0 0 0 1px ${TONE[b.tone].line}`,
          }}
        />
      ))}
    </div>
  );
}
