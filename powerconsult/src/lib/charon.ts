/**
 * Utilities to encode/decode Itau "x-charon-params" values.
 *
 * decodeCharonParams(base64: string, opts?) -> object
 * encodeCharonParams(obj) -> base64 string
 */

export function decodeCharonParams(
  base64: string,
  { coerce = true }: { coerce?: boolean } = {}
) {
  if (!base64) return null;
  // Standard Base64 (with padding '='). Not base64url.
  let txt: string;
  try {
    txt = Buffer.from(base64, "base64").toString("utf8");
  } catch (e) {
    throw new Error("invalid_base64");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(txt);
  } catch (e) {
    throw new Error("invalid_json");
  }

  if (coerce) return coerceTypes(parsed);
  return parsed;
}

export function encodeCharonParams(obj: unknown) {
  const txt = JSON.stringify(obj);
  return btoa(txt);
}

function coerceTypes(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const v = value.trim();
    if (/^(true|false)$/i.test(v)) return v.toLowerCase() === "true";
    if (/^-?\d+$/.test(v)) {
      // integer
      const n = Number(v);
      if (Number.isSafeInteger(n)) return n;
    }
    if (/^-?\d*\.\d+$/.test(v)) {
      const f = Number(v);
      if (!Number.isNaN(f)) return f;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(coerceTypes);
  if (typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = coerceTypes(v);
    return out;
  }
  return value;
}

export default { decodeCharonParams, encodeCharonParams };
