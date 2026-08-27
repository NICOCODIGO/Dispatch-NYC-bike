import { describe, expect, it } from 'vitest';
import {
  SLA_MINUTES,
  type WorkOrder,
  type WorkOrderType,
  ageMinutes,
  backlog,
  isOpen,
  slaState,
  sortByPressure,
  urgencyOf,
  wasLate,
} from './workOrder';

const NOW = Date.UTC(2026, 7, 27, 12, 0, 0);
const MIN = 60_000;

let seq = 0;
function order(over: Partial<WorkOrder> = {}): WorkOrder {
  const type: WorkOrderType = over.type ?? 'dock-repair';
  return {
    id: over.id ?? `wo-${seq++}`,
    type,
    target: over.target ?? { stationId: 's1', stationName: 'Grand Army Plaza', borough: 'Brooklyn' },
    priority: over.priority ?? null,
    status: over.status ?? 'open',
    assignee: over.assignee ?? null,
    openedAt: over.openedAt ?? NOW,
    closedAt: over.closedAt ?? null,
    detail: over.detail ?? 'Solenoid failure.',
    ...(over.faultCode ? { faultCode: over.faultCode } : {}),
    ...(over.runId ? { runId: over.runId } : {}),
  };
}

describe('work order clock', () => {
  it('ages an open order against now', () => {
    expect(ageMinutes(order({ openedAt: NOW - 90 * MIN }), NOW)).toBe(90);
  });

  it('freezes a closed order at the age it was closed', () => {
    const done = order({ openedAt: NOW - 300 * MIN, closedAt: NOW - 240 * MIN, status: 'done' });
    expect(ageMinutes(done, NOW)).toBe(60);
    // And keeps that answer an hour later.
    expect(ageMinutes(done, NOW + 60 * MIN)).toBe(60);
  });

  it('never reports a negative age for a clock skew', () => {
    expect(ageMinutes(order({ openedAt: NOW + 5 * MIN }), NOW)).toBe(0);
  });
});

describe('SLA state', () => {
  const target = SLA_MINUTES['dock-repair'];

  it('is ok well inside the target', () => {
    expect(slaState(order({ openedAt: NOW - 10 * MIN }), NOW)).toBe('ok');
  });

  it('warns at three quarters of the target', () => {
    const at = order({ openedAt: NOW - Math.ceil(target * 0.8) * MIN });
    expect(slaState(at, NOW)).toBe('due-soon');
  });

  it('breaches at the target', () => {
    expect(slaState(order({ openedAt: NOW - target * MIN }), NOW)).toBe('breached');
  });

  // A wall of finished-but-late work must not read as healthy, which is what
  // returning 'ok' for closed orders would do.
  it('reports closed orders as closed rather than ok', () => {
    const done = order({ status: 'done', closedAt: NOW, openedAt: NOW - 999 * MIN });
    expect(slaState(done, NOW)).toBe('closed');
    expect(wasLate(done)).toBe(true);
  });

  it('does not call a cancelled order late', () => {
    const cancelled = order({ status: 'cancelled', closedAt: NOW, openedAt: NOW - 999 * MIN });
    expect(wasLate(cancelled)).toBe(false);
  });

  it('does not call an order finished inside its target late', () => {
    const done = order({ status: 'done', openedAt: NOW - 30 * MIN, closedAt: NOW });
    expect(wasLate(done)).toBe(false);
  });

  it('gives rebalancing the tightest target of the five', () => {
    const others = (Object.keys(SLA_MINUTES) as WorkOrderType[])
      .filter((t) => t !== 'rebalance')
      .map((t) => SLA_MINUTES[t]);
    expect(SLA_MINUTES.rebalance).toBeLessThan(Math.min(...others));
  });
});

describe('urgency', () => {
  it('reads off the same thresholds the board ranks on', () => {
    expect(urgencyOf(order({ priority: 90 }))).toBe('critical');
    expect(urgencyOf(order({ priority: 70 }))).toBe('critical');
    expect(urgencyOf(order({ priority: 69 }))).toBe('high');
    expect(urgencyOf(order({ priority: 55 }))).toBe('high');
    expect(urgencyOf(order({ priority: 54 }))).toBe('routine');
  });

  it('treats an unscored order as routine rather than guessing', () => {
    expect(urgencyOf(order({ priority: null }))).toBe('routine');
  });
});

describe('backlog', () => {
  it('counts only live orders', () => {
    const stats = backlog(
      [
        order({ status: 'open' }),
        order({ status: 'assigned' }),
        order({ status: 'active' }),
        order({ status: 'done', closedAt: NOW }),
        order({ status: 'cancelled', closedAt: NOW }),
      ],
      NOW,
    );
    expect(stats.open).toBe(3);
    expect(stats.unassigned).toBe(1);
  });

  it('separates breached from merely due soon', () => {
    const target = SLA_MINUTES['dock-repair'];
    const stats = backlog(
      [
        order({ openedAt: NOW - (target + 10) * MIN }),
        order({ openedAt: NOW - Math.ceil(target * 0.8) * MIN }),
        order({ openedAt: NOW - 5 * MIN }),
      ],
      NOW,
    );
    expect(stats.breached).toBe(1);
    expect(stats.dueSoon).toBe(1);
  });

  it('finds the oldest open order and ignores older closed ones', () => {
    const stats = backlog(
      [
        order({ id: 'young', openedAt: NOW - 10 * MIN }),
        order({ id: 'old', openedAt: NOW - 500 * MIN }),
        order({ id: 'ancient', openedAt: NOW - 9999 * MIN, status: 'done', closedAt: NOW }),
      ],
      NOW,
    );
    expect(stats.oldest?.id).toBe('old');
  });

  it('reports no mean age for an empty backlog rather than zero', () => {
    const stats = backlog([order({ status: 'done', closedAt: NOW })], NOW);
    expect(stats.open).toBe(0);
    expect(stats.meanOpenAge).toBeNull();
    expect(stats.oldest).toBeNull();
  });

  it('buckets by type and adds up to the open count', () => {
    const stats = backlog(
      [
        order({ type: 'dock-repair' }),
        order({ type: 'dock-repair' }),
        order({ type: 'battery-swap' }),
        order({ type: 'rebalance', status: 'done', closedAt: NOW }),
      ],
      NOW,
    );
    expect(stats.byType['dock-repair']).toBe(2);
    expect(stats.byType['battery-swap']).toBe(1);
    expect(stats.byType.rebalance).toBe(0);
    const summed = Object.values(stats.byType).reduce((a, b) => a + b, 0);
    expect(summed).toBe(stats.open);
  });
});

describe('sortByPressure', () => {
  it('puts breached ahead of due-soon ahead of fine', () => {
    const target = SLA_MINUTES['dock-repair'];
    const fine = order({ id: 'fine', openedAt: NOW - MIN });
    const soon = order({ id: 'soon', openedAt: NOW - Math.ceil(target * 0.8) * MIN });
    const late = order({ id: 'late', openedAt: NOW - (target + 60) * MIN });

    expect(sortByPressure([fine, soon, late], NOW).map((o) => o.id)).toEqual([
      'late',
      'soon',
      'fine',
    ]);
  });

  // The interesting call: a fresh critical is genuinely less at risk than a
  // high that has already blown its target.
  it('ranks a breached high order above a brand-new critical one', () => {
    const target = SLA_MINUTES['dock-repair'];
    const freshCritical = order({ id: 'crit', priority: 95, openedAt: NOW - MIN });
    const lateHigh = order({ id: 'high', priority: 60, openedAt: NOW - (target + 5) * MIN });

    expect(sortByPressure([freshCritical, lateHigh], NOW)[0]?.id).toBe('high');
  });

  it('breaks ties within a band by urgency', () => {
    const a = order({ id: 'routine', priority: 10, openedAt: NOW - MIN });
    const b = order({ id: 'critical', priority: 95, openedAt: NOW - MIN });
    expect(sortByPressure([a, b], NOW).map((o) => o.id)).toEqual(['critical', 'routine']);
  });

  it('does not mutate the array it was given', () => {
    const list = [order({ id: 'a', openedAt: NOW - MIN }), order({ id: 'b', openedAt: NOW - 99 * MIN })];
    const before = list.map((o) => o.id);
    sortByPressure(list, NOW);
    expect(list.map((o) => o.id)).toEqual(before);
  });
});

describe('isOpen', () => {
  it('treats assigned and active as still open', () => {
    expect(isOpen(order({ status: 'open' }))).toBe(true);
    expect(isOpen(order({ status: 'assigned' }))).toBe(true);
    expect(isOpen(order({ status: 'active' }))).toBe(true);
    expect(isOpen(order({ status: 'done' }))).toBe(false);
    expect(isOpen(order({ status: 'cancelled' }))).toBe(false);
  });
});
