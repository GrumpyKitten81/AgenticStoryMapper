import { describe, expect, it } from "vitest";
import { formatRestorePointSize, restorePointCause } from "@storymapper/web/features/restore-points/restore-point-presentation";

describe("readable restore point presentation", () => {
  it.each([
    ["manual", "Manually created"],
    ["pre-migration", "Before database migration"],
    ["pre-restore", "Before restoring"],
    ["pre-apply", "Before applying changes"]
  ] as const)("describes the %s cause without inferring associations", (pointClass, expected) => {
    expect(restorePointCause(pointClass)).toBe(expected);
  });

  it.each([
    [0, "0 bytes"], [1023, "1,023 bytes"], [1024, "1 KiB"], [4096, "4 KiB"],
    [1536, "1.5 KiB"], [1024 ** 2, "1 MiB"], [1024 ** 3, "1 GiB"]
  ])("formats %i bytes as %s", (size, expected) => {
    expect(formatRestorePointSize(size)).toBe(expected);
  });
});
