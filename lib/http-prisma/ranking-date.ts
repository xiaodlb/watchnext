/** Convert Prisma's DateTime values to the canonical instant used by ranking. */
export function rankingCreatedAt(value: unknown): string {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  if (typeof value !== "string") return "";
  const canonical = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  if (canonical.test(value)) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? value : "";
  }

  const postgres = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?([+-]\d{2}(?::?\d{2})?|Z)$/;
  const match = postgres.exec(value);
  if (!match) return "";
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  const wallClock = new Date(0);
  wallClock.setUTCFullYear(year, month - 1, day);
  wallClock.setUTCHours(hour, minute, second, 0);
  if (wallClock.getUTCFullYear() !== year || wallClock.getUTCMonth() !== month - 1 || wallClock.getUTCDate() !== day ||
      wallClock.getUTCHours() !== hour || wallClock.getUTCMinutes() !== minute || wallClock.getUTCSeconds() !== second) return "";
  if (zone !== "Z") {
    const offset = /[+-](\d{2})(?::?(\d{2}))?$/.exec(zone);
    if (!offset || Number(offset[1]) > 14 || Number(offset[2] ?? 0) > 59 || (Number(offset[1]) === 14 && Number(offset[2] ?? 0) !== 0)) return "";
  }
  const isoInput = value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const parsed = new Date(isoInput);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}
