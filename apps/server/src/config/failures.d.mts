export function redact(value: unknown, env?: NodeJS.ProcessEnv): string;
export function failure(message: string, fix: string, cause?: unknown): Error;
export function nativeFailure(cause: unknown): Error;
export function portFailure(port: number, holder?: string, cause?: unknown): Error;
export function renderFailure(error: Error, debug?: boolean, env?: NodeJS.ProcessEnv): string;
