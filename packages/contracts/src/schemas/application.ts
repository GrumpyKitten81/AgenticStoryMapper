export const capabilityKinds = ["read", "write", "human-only"] as const;
export type CapabilityKind = (typeof capabilityKinds)[number];

export interface CapabilityDescriptor {
  name: string;
  kind: CapabilityKind;
  tool?: string;
  route?: string;
}
