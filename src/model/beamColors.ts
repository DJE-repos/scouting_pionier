/** Vaste kleur per balklengte, zodat maten in het model en in de handleiding herkenbaar zijn. */
const LENGTH_COLORS: Record<number, string> = {
  1: '#dc2626',
  2: '#ea580c',
  3: '#ca8a04',
  4: '#16a34a',
  5: '#0891b2',
  6: '#2563eb',
  8: '#7c3aed',
};

const OTHER_LENGTH_COLOR = '#64748b';

export function beamColorHex(lengthM: number): string {
  return LENGTH_COLORS[lengthM] ?? OTHER_LENGTH_COLOR;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Zwarte of witte tekst, afhankelijk van welke het beste afsteekt tegen de achtergrond. */
export function contrastTextHex(background: string): string {
  const [r, g, b] = hexToRgb(background);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.45 ? '#0f172a' : '#ffffff';
}

export function formatLength(lengthM: number): string {
  return `${Number.isInteger(lengthM) ? lengthM : lengthM.toFixed(2)} m`;
}
