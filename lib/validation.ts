export interface VResult { ok: boolean; msg?: string; }

export function vInteger(raw: string, label = "Value"): VResult {
  if (raw.trim() === "") return { ok: false, msg: `${label} is required` };
  if (!/^-?\d+$/.test(raw.trim())) return { ok: false, msg: `${label} must be a whole number` };
  return { ok: true };
}

export function vRange(raw: string, label = "Value", min = -9999, max = 9999): VResult {
  const base = vInteger(raw, label);
  if (!base.ok) return base;
  const n = parseInt(raw, 10);
  if (n < min || n > max) return { ok: false, msg: `${label} must be ${min}-${max}` };
  return { ok: true };
}

export function vLabel(raw: string, label = "Label"): VResult {
  if (raw.trim() === "") return { ok: false, msg: `${label} is required` };
  if (raw.trim().length > 12) return { ok: false, msg: `${label} max 12 chars` };
  if (!/^[A-Za-z0-9-]+$/.test(raw.trim())) return { ok: false, msg: `${label}: letters/digits/hyphen only` };
  return { ok: true };
}

export function vIPv4(raw: string, label = "IP address"): VResult {
  const parts = raw.trim().split(".");
  if (parts.length !== 4) return { ok: false, msg: `${label} must be in a.b.c.d form` };
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return { ok: false, msg: `${label}: each octet must be a number` };
    const n = parseInt(p, 10);
    if (n < 0 || n > 255) return { ok: false, msg: `${label}: each octet must be 0-255` };
  }
  return { ok: true };
}

export function vCIDR(raw: string, label = "CIDR"): VResult {
  const [ip, prefix] = raw.trim().split("/");
  if (!ip || prefix === undefined) return { ok: false, msg: `${label} must be like 192.168.1.0/24` };
  const ipCheck = vIPv4(ip, label);
  if (!ipCheck.ok) return ipCheck;
  if (!/^\d+$/.test(prefix) || +prefix < 0 || +prefix > 32) return { ok: false, msg: `${label}: prefix must be 0-32` };
  return { ok: true };
}

export function hasErrors(errs: Record<string, string | undefined>): boolean {
  return Object.values(errs).some(Boolean);
}
