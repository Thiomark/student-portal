import { z } from "zod";

// An unticked checkbox sends nothing, so the key must be allowed to be absent.
// (In Zod 4 a union that includes z.undefined() still rejects a missing key
// once it is transformed.)
export const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");
