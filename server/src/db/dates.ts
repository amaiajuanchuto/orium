/**
 * Shared date and rounding helpers used across the tools (period math,
 * streak calculations, and formatting averages).
 */

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toISODate(date);
}

export function round(value: number): number;
export function round(value: number | null): number | null;
export function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}
