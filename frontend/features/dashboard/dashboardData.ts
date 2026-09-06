import { Inspection } from '@/types/database';

export interface ActivityPoint {
  key: string;
  count: number;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Buckets real inspection records by day for the last `days` days (oldest first).
 * Used to render the "Inspection Activity" trend chart without fake data.
 */
export function buildActivitySeries(items: Inspection[], days = 30): ActivityPoint[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const d = new Date(item.created_at || Date.now());
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const now = new Date();
  const series: ActivityPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    series.push({
      key,
      count: counts.get(key) || 0,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }
  return series;
}

/**
 * Percentage change of inspection volume in the last 7 days vs the previous 7 days.
 * Returns null when there is no prior window to compare against.
 */
export function weeklyChangePercent(items: Inspection[]): number | null {
  const now = Date.now();
  let last = 0;
  let prev = 0;
  for (const item of items) {
    const t = new Date(item.created_at || Date.now()).getTime();
    if (t >= now - 7 * DAY_MS) last += 1;
    else if (t >= now - 14 * DAY_MS) prev += 1;
  }
  if (prev === 0) {
    return last > 0 ? null : 0;
  }
  return Math.round(((last - prev) / prev) * 100);
}

export function firstName(name?: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return parts[0] || 'Officer';
}