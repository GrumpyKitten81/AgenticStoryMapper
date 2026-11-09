export function sameJsonValue(left: unknown, right: unknown): boolean {
  const serialize = (value: unknown): string | undefined => JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : entry);
  return serialize(left) === serialize(right);
}
