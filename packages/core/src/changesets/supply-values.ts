export function ownValue<T>(values: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return values && Object.hasOwn(values, key) ? values[key] : undefined;
}

export function ownString(values: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = ownValue(values, key);
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
