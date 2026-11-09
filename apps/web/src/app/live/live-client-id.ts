let clientId: string | undefined;

export function getLiveClientId(): string {
  clientId ??= crypto.randomUUID();
  return clientId;
}
