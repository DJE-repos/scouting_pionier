import { describe, expect, it } from 'vitest';
import { layoutLabels, type LabelLayoutResult } from '../src/scene/labelLayout';

const input = (id: string, x = 200, y = 150) => ({
  id,
  anchor: { x, y },
  width: 60,
  height: 20,
});

function overlaps(a: LabelLayoutResult, b: LabelLayoutResult): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe('layoutLabels', () => {
  it('verdeelt labels over meerdere zijden bij een druk ankerpunt', () => {
    const result = layoutLabels(['a', 'b', 'c', 'd'].map((id) => input(id)), {
      width: 500,
      height: 400,
    });

    expect(new Set(result.map((label) => label.x < 200 ? 'left' : label.x > 200 ? 'right' : 'center')).size).toBeGreaterThan(1);
    expect(result.some((label) => label.y < 150)).toBe(true);
    expect(result.every((label, index) => result.every((other, otherIndex) => index === otherIndex || !overlaps(label, other)))).toBe(true);
  });

  it('kiest een vrije zijde wanneer een constructiesegment een kandidaat blokkeert', () => {
    const result = layoutLabels([input('a')], {
      width: 500,
      height: 400,
      obstacles: [{ from: { x: 120, y: 140 }, to: { x: 280, y: 140 } }],
    });

    expect(result[0].y).toBeGreaterThanOrEqual(140);
  });

  it('houdt labels binnen de viewport en verbindt de leader met de labelrand', () => {
    const result = layoutLabels([input('a', 4, 4), input('b', 496, 396)], {
      width: 500,
      height: 400,
    });

    for (const label of result) {
      expect(label.x).toBeGreaterThanOrEqual(2);
      expect(label.y).toBeGreaterThanOrEqual(2);
      expect(label.x + label.width).toBeLessThanOrEqual(498);
      expect(label.y + label.height).toBeLessThanOrEqual(398);
      expect(label.leader.x).toBeGreaterThanOrEqual(label.x);
      expect(label.leader.x).toBeLessThanOrEqual(label.x + label.width);
      expect(label.leader.y).toBeGreaterThanOrEqual(label.y);
      expect(label.leader.y).toBeLessThanOrEqual(label.y + label.height);
    }
  });

  it('geeft dezelfde layout bij dezelfde input terug', () => {
    const inputs = ['a', 'b', 'c'].map((id) => input(id));
    expect(layoutLabels(inputs, { width: 500, height: 400 })).toEqual(layoutLabels(inputs, { width: 500, height: 400 }));
  });
});
