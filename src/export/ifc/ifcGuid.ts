const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/** Comprimeert een 32-cijferige hex-UUID naar de 22-tekens IFC GlobalId-codering. */
export function compressGuid(hex32: string): string {
  const clean = hex32.replace(/-/g, '').toLowerCase();
  let n = BigInt('0x' + clean);
  const out: string[] = new Array(22);
  for (let i = 21; i >= 1; i--) {
    out[i] = CHARS[Number(n & 63n)];
    n >>= 6n;
  }
  out[0] = CHARS[Number(n & 3n)];
  return out.join('');
}

export function newIfcGuid(): string {
  return compressGuid(crypto.randomUUID());
}

/** Stabiele IFC GlobalId afgeleid van een interne id, zodat exports reproduceerbaar zijn. */
export function ifcGuidFrom(id: string): string {
  const clean = id.replace(/-/g, '');
  if (/^[0-9a-f]{32}$/i.test(clean)) return compressGuid(clean);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < id.length; i++) {
    h1 = Math.imul(h1 ^ id.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + id.charCodeAt(i), 2246822519) >>> 0;
  }
  const hex = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(2);
  return compressGuid(hex.slice(0, 32));
}
