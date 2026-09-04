import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import { Tooltip, TipBody, TipTitle } from '../ui/Tooltip';

/**
 * The vocabulary, in plain English.
 *
 * This console inherited a domain language — flooded, starving, staleness,
 * capacity weight — that is precise, documented, and completely opaque to
 * somebody on their first shift. Rather than dumb the interface down, the
 * words teach themselves: every term below gets a dotted underline and a
 * definition on hover, wherever it appears in prose.
 *
 * Plain meaning first, mechanism second. A reader who stops after the first
 * sentence should still have learnt the right thing.
 */

export interface Definition {
  /** What it means to a person, before any arithmetic. */
  plain: string;
  /** How the board actually decides it. Optional. */
  mechanism?: string;
}

export const DEFINITIONS: Record<string, Definition> = {
  flooded: {
    plain:
      'The station is nearly full, so a rider arriving has almost nowhere to park. Nothing to do with water.',
    mechanism: 'At or above 85% of the slots it reports usable. A vehicle fixes it by collecting bikes.',
  },
  full: {
    plain: 'The station has no free docks at all. A rider arriving has to ride on and find another.',
    mechanism: 'Zero open docks reported. The hard version of flooded.',
  },
  empty: {
    plain: 'The station has no bikes. Somebody walking up to rent one leaves with nothing.',
    mechanism: 'Zero bikes reported. A vehicle fixes it by dropping bikes off.',
  },
  'low stock': {
    plain: 'Nearly out of bikes — there are a few left, but the next few riders may find none.',
    mechanism: 'At or below 15% of the slots the station reports usable. Called "starving" in the model.',
  },
  starving: {
    plain: 'Nearly out of bikes — a few left, but the next few riders may find none.',
    mechanism: 'At or below 15% of usable slots.',
  },
  unverified: {
    plain:
      'The station has gone quiet, so nobody knows what is actually there. Its numbers are not trusted and it is kept out of the ranking.',
    mechanism:
      'No report for over 60 minutes. Sending a vehicle on an hour-old reading is how you drive to a station that fixed itself.',
  },
  'not reporting': {
    plain: 'The station has stopped checking in, so its bike counts cannot be believed.',
    mechanism: 'Silent for more than 60 minutes. Excluded from scoring entirely.',
  },
  'threshold excess': {
    plain: 'How far past the deadline a silent station is — how long it has been quiet beyond the hour it is allowed.',
    mechanism: 'Time since last report, minus the 60-minute cutoff.',
  },
  pressure: {
    plain: 'The share of a borough that needs a vehicle right now. High pressure means the trouble is concentrated there.',
    mechanism: 'Stations needing a vehicle divided by all stations in that borough.',
  },
  'capacity weight': {
    plain:
      'Big stations count for more. A 60-dock station running dry strands far more riders than a 12-dock one, so the same failure scores higher.',
    mechanism: 'A multiplier from 0.75 to 1.25, scaled against the network’s 90th-percentile station size.',
  },
  staleness: {
    plain:
      'How old the reading is. An old reading is not evidence a station is bad — it is a reason to go and look.',
    mechanism: 'Adds up to 10 points once a report is over 15 minutes old. Past 60 minutes the station is dropped instead.',
  },
  'grace window': {
    plain: 'The first 15 minutes after a report, during which the numbers are taken at face value.',
    mechanism: 'No staleness penalty applies inside it.',
  },
  relocatable: {
    plain:
      'Bikes that can be fixed by moving them between stations — taken from somewhere too full and delivered somewhere too empty. The rest has to come from a depot.',
    mechanism: 'The smaller of the outstanding surplus and the outstanding deficit.',
  },
  'urgency score': {
    plain: 'How badly one station needs attention, from 0 to 100. Higher is worse.',
    mechanism: 'A base score for the failure, scaled by station size, plus a penalty for an old reading.',
  },
  'usable slots': {
    plain:
      'Docks the station actually reports working right now — not what its nameplate claims. Hundreds of stations disagree with their own nameplate.',
    mechanism: 'Bikes available plus docks available. Used as the fill denominator.',
  },
  'network fill': {
    plain:
      'How much of the city is holding a bike. Around half is healthy — many more and docks get scarce, many fewer and bikes do.',
    mechanism: 'Bikes available divided by usable slots, across every reporting station.',
  },
  outage: {
    plain: 'The station is switched off or refusing rentals. A vehicle full of bikes cannot help.',
    mechanism: 'Operator flags say not renting, not returning, or no usable slots.',
  },
  unusable: {
    plain: 'The station reports itself as out of service. It needs a mechanic, not a delivery.',
  },

  'realization rate': {
    plain:
      'How much of what you ordered actually moved. Ask for 37 bikes, get 34 collected, and the realization rate is 92%.',
    mechanism:
      'Bikes moved divided by bikes ordered, across completed runs. A crew that reliably delivers 60% of an order is not one you can plan around.',
  },
  'recovery rate': {
    plain: 'How often sending a vehicle actually pushed the station back under the threshold.',
    mechanism: 'Recovered runs divided by completed runs. The only evidence a dispatch was the right call.',
  },
  cleared: {
    plain:
      'Of the stations that have gone bad since you opened the board, how many are back to normal — whether or not anyone was sent.',
    mechanism:
      'Shown as a count of a running list: every station that crosses the dispatch line this session is added, and it never shrinks. Counts stations rather than trips, so a station riders happened to even out counts the same as one a vehicle fixed. That is what separates it from the recovery rate, which divides recovered runs by completed runs and is strictly about whether our own vehicles worked.',
  },

  /* --- The two crews, and the words for what they drive and fix ---------- */

  vehicle: {
    plain:
      'Takes bikes from somewhere too full and delivers them somewhere too empty. It does not repair anything.',
  },
  rebalancing: {
    plain:
      'Moving bikes around the city so they are where riders want them. Most of a morning’s bikes end up downhill and somebody has to carry them back.',
  },
  mechanic: {
    plain:
      'A technician who repairs broken hardware — a jammed dock, a frozen kiosk, a station that will not accept rentals. Sending a vehicle to these is a wasted trip.',
    mechanism: 'Handles the outage and unusable lanes, which are routed off the queue.',
  },
  station: {
    plain: 'One whole installation: the kiosk plus its rack of docks.',
  },
  dock: {
    plain:
      'A single slot that holds one bike. A station with 40 docks can hold 40 bikes; "0 open docks" means a rider arriving has nowhere to leave theirs.',
  },
  idle: {
    plain: 'Parked at a depot with no job assigned. The driver is available and the vehicle is doing nothing.',
    mechanism: 'The state that costs you — a vehicle sitting still while stations are over the threshold.',
  },
  'en route': {
    plain: 'Driving between two points, either carrying bikes to a drop-off or heading to collect some.',
  },
  loading: {
    plain:
      'Physically moving bikes on or off the vehicle — taking stock on at a depot, or collecting from a station that is too full. Not travelling.',
    mechanism: 'Worth its own state because it takes real time; a vehicle loading cannot be redirected.',
  },
};

/** Longest first, so "low stock" matches before "stock" ever could. */
const TERMS = Object.keys(DEFINITIONS).sort((a, b) => b.length - a.length);

const PATTERN = new RegExp(
  `\\b(${TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi',
);

/* -------------------------------------------------------------------------- */

/** A term with its definition one hover away. */
export function Term({ term, children }: { term: string; children?: ReactNode }) {
  const def = DEFINITIONS[term.toLowerCase()];
  if (!def) return <>{children ?? term}</>;

  return (
    <Tooltip
      help
      width={270}
      content={
        <>
          <TipTitle>{term.charAt(0).toUpperCase() + term.slice(1)}</TipTitle>
          <TipBody>{def.plain}</TipBody>
          {def.mechanism && (
            <p className="mt-1.5 border-t border-[var(--color-line-soft)] pt-1.5 text-[10px] leading-relaxed text-[var(--color-ink-3)]">
              {def.mechanism}
            </p>
          )}
        </>
      }
    >
      <span className="underline decoration-dotted decoration-[var(--color-ink-3)] underline-offset-2">
        {children ?? term}
      </span>
    </Tooltip>
  );
}

/**
 * Wraps every known term in a string, so prose explains itself.
 *
 * Hand-wrapping each occurrence would mean every new sentence is a chance to
 * forget one, and the callouts are rewritten often. This runs over the text
 * instead.
 */
export function linkifyText(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  PATTERN.lastIndex = 0;
  while ((match = PATTERN.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(
      <Term key={`${match.index}-${match[0]}`} term={match[0].toLowerCase()}>
        {match[0]}
      </Term>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));

  return out;
}

/**
 * The same, over a whole tree.
 *
 * Callouts are JSX with interpolated counts, not flat strings, so linkifying
 * them means walking the node and treating each string leaf. Elements already
 * carrying a definition are left alone — nesting a Term inside a Term would
 * recurse forever and produce a tooltip inside a tooltip.
 */
export function linkifyNode(node: ReactNode, depth = 0): ReactNode {
  if (depth > 6) return node;
  if (typeof node === 'string') return <>{linkifyText(node)}</>;

  if (Array.isArray(node)) {
    return Children.map(node, (child) => linkifyNode(child, depth + 1));
  }

  if (isValidElement(node)) {
    if (node.type === Term || node.type === Tooltip) return node;
    const props = node.props as { children?: ReactNode };
    if (props.children === undefined) return node;
    return cloneElement(node, undefined, linkifyNode(props.children, depth + 1));
  }

  return node;
}
