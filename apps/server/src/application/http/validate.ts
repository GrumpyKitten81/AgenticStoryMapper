import type { ZodType } from "zod";
import { DomainError } from "@storymapper/contracts";

export function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new DomainError("validation", "Request validation failed.", { issues: parsed.error.issues });
  return parsed.data;
}
