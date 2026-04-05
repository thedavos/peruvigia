import { createHash } from "node:crypto";

import { stableStringify } from "./utils/object";

export function hashNormalizedPayload(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
