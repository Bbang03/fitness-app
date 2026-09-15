export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.ceil((ms - Date.now()) / 1000));
  return formatDuration(total);
}

export function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function formatDateFull(isoString: string): string {
  const d = new Date(isoString);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

/** Returns a calendar key from a Date using the browser's local timezone. */
export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** Date-only values must stay date-only; do not pass them through Date parsing. */
export function isDateOnlyKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Adds calendar days to a date-only key without converting it to a UTC date. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  if (!isDateOnlyKey(dateKey)) {
    return dateKey;
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  // Noon avoids crossing a local DST transition at midnight.
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() + days);

  return localDateKey(date);
}

/** Reads a date-only query value, falling back when the URL is absent or invalid. */
export function dateKeyFromSearch(
  search: string,
  fallback: string,
): string {
  const requestedDate = new URLSearchParams(search).get('date');

  return isDateOnlyKey(requestedDate) ? requestedDate : fallback;
}

/** Returns the browser-local calendar key for an ISO timestamp. */
export function timestampToLocalDateKey(timestamp: string): string {
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? '' : localDateKey(date);
}

/** Uses the persisted workout date, falling back to a timestamp only for legacy rows. */
export function workoutDateKey(
  dateOnly: string | null | undefined,
  startedAt: string,
): string {
  return isDateOnlyKey(dateOnly)
    ? dateOnly
    : timestampToLocalDateKey(startedAt);
}

/** @deprecated Use timestampToLocalDateKey for timestamps and keep date-only keys unchanged. */
export function isoToDateKey(isoString: string): string {
  return timestampToLocalDateKey(isoString);
}

export function calcTotalVolume(sets: { weight_kg: number; reps: number }[]): number {
  return sets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0);
}

export function elapsedSeconds(startIso: string): number {
  return Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
}

export function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // AudioContext not supported
  }
}

export function sendNotification(title: string, body: string) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icon-192.png' });
  }
}

export async function requestNotificationPermission() {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}
