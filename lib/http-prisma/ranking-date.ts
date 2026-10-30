/** Convert Prisma's DateTime values to the canonical instant used by ranking. */
export function rankingCreatedAt(value: unknown): string {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  return typeof value === "string" ? value : "";
}
