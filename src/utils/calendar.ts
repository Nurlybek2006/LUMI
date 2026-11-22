import { addLocalDays, localDate } from './core.ts';

export type CalendarMode = 'week' | 'month';

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year ?? 2000, (month ?? 1) - 1 + delta, 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthGrid(monthKey: string): (string | null)[] {
  const [year, month] = monthKey.split('-').map(Number);
  const first = new Date(year ?? 2000, (month ?? 1) - 1, 1, 12);
  const count = new Date(year ?? 2000, month ?? 1, 0, 12).getDate();
  const offset = (first.getDay() + 6) % 7;
  return [...Array.from({ length: offset }, () => null), ...Array.from({ length: count }, (_, index) => `${monthKey}-${String(index + 1).padStart(2, '0')}`)];
}

export function weekStart(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  const offset = (date.getDay() + 6) % 7;
  return addLocalDays(dateKey, -offset);
}

export function visibleCalendarDates(mode: CalendarMode, selectedDate: string, monthKey: string): string[] {
  if (mode === 'week') return Array.from({ length: 7 }, (_, index) => addLocalDays(weekStart(selectedDate), index));
  return monthGrid(monthKey).filter((date): date is string => date !== null);
}

export function moveCalendarSelection(selectedDate: string, mode: CalendarMode, delta: -1 | 1): string {
  return addLocalDays(selectedDate, delta * (mode === 'week' ? 7 : 1));
}

export function currentMonthKey(): string { return localDate().slice(0, 7); }
