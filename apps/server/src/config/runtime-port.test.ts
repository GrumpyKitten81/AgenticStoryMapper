import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readRuntimePort } from "@storymapper/server/config/runtime-port";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function portFile(record: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-runtime-port-"));
  directories.push(directory);
  writeFileSync(join(directory, ".port"), JSON.stringify(record));
  return directory;
}

it("accepts only complete loopback runtime port records", () => {
  for (const host of ["127.0.0.1", "localhost", "::1"]) {
    const directory = portFile({ host, port: 4317, owner: "runtime-owner" });
    expect(readRuntimePort(directory)).toEqual({ host, port: 4317, owner: "runtime-owner" });
  }
  for (const record of [
    { host: "0.0.0.0", port: 4317, owner: "owner" },
    { host: "127.0.0.1", port: 0, owner: "owner" },
    { host: "127.0.0.1", port: 4317.5, owner: "owner" },
    { host: "127.0.0.1", port: 4317, owner: "" },
    { host: "127.0.0.1", port: "4317", owner: "owner" }
  ]) expect(() => readRuntimePort(portFile(record))).toThrow("Invalid Agentic Story Mapper runtime .port file.");
});

it("refuses malformed runtime discovery JSON", () => {
  const directory = mkdtempSync(join(tmpdir(), "storymapper-runtime-port-invalid-"));
  directories.push(directory);
  writeFileSync(join(directory, ".port"), "{ invalid");
  expect(() => readRuntimePort(directory)).toThrow(SyntaxError);
});
