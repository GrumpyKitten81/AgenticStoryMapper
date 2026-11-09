import { expect, it } from "vitest";
import { isoDateMilliseconds, millisecondsIsoDate } from "@storymapper/core/reports/iso-date";

it.each(["0000-01-01", "0000-02-29", "0001-01-01", "1600-02-29", "1900-03-01", "1969-12-31", "1970-01-01", "2000-02-29", "2026-10-11", "2100-03-01", "9999-12-31"])("preserves UTC Gregorian date conversion for %s", (value) => {
  const milliseconds = isoDateMilliseconds(value);
  expect(milliseconds).toBe(Date.parse(`${value}T00:00:00.000Z`));
  expect(millisecondsIsoDate(milliseconds)).toBe(value);
  expect(millisecondsIsoDate(milliseconds + 86_399_999)).toBe(value);
});

it.each(["2026-02-29", "1900-02-29", "2026-00-01", "2026-13-01", "2026-04-31", "not-a-date"])("refuses invalid ISO date %s", (value) => {
  expect(isoDateMilliseconds(value)).toBeNaN();
});
