import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function findEnvFile(startDir: string): string | undefined {
  let directory = startDir;
  while (true) {
    const candidate = resolve(directory, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

export function loadLocalEnv(envFilePath = findEnvFile(process.cwd()), env: NodeJS.ProcessEnv = process.env): void {
  if (!envFilePath || !existsSync(envFilePath)) {
    return;
  }

  for (const line of readFileSync(envFilePath, "utf8").split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = normalizeEnvValue(trimmedLine.slice(separatorIndex + 1).trim());
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}

function normalizeEnvValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
