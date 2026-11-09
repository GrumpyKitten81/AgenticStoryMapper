import { z } from "zod";

export const uuidSchema = z.guid();
export const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);
