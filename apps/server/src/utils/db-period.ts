/**
 * Formats a period read back from Postgres as YYYY-MM.
 *
 * node-pg parses DATE columns into Date objects at local midnight, so the
 * local getters return the stored calendar month whatever the server timezone.
 * Stringifying the Date instead yields "Sat Jul 01 2023 ...", not a period.
 */
export function dbPeriod(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  }
  const raw = String(value);
  return raw.length >= 7 ? raw.slice(0, 7) : raw;
}
