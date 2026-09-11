import { describe, expect, it } from 'vitest';
import { billOfMaterialsToCsv, computeBillOfMaterials } from '../src/export/billOfMaterials';
import type { ResolvedModel } from '../src/model/resolve';

const model: ResolvedModel = {
  beams: [
    { id: '1', lengthM: 4, diameterMm: 80, position: [0, 0, 0], quaternion: [0, 0, 0, 1], stepIndex: 0, temporary: false },
    { id: '2', lengthM: 4, diameterMm: 80, position: [0, 0, 0], quaternion: [0, 0, 0, 1], stepIndex: 0, temporary: false },
    { id: '3', lengthM: 8, diameterMm: 100, position: [0, 0, 0], quaternion: [0, 0, 0, 1], stepIndex: 1, temporary: false },
  ],
  lashings: [
    { id: 'a', name: 'kruisbond', beamIds: ['1', '2'], localOffset: [0, 0, 0], ropeLengthM: 8, color: '#000', stepIndex: 0, temporary: false },
    { id: 'b', name: 'Kruisbond', beamIds: ['1', '3'], localOffset: [0, 0, 0], ropeLengthM: 8, color: '#000', stepIndex: 1, temporary: false },
    { id: 'c', name: 'mastworp', beamIds: ['2', '3'], localOffset: [0, 0, 0], ropeLengthM: 2, color: '#000', stepIndex: 1, temporary: false },
  ],
};

describe('computeBillOfMaterials', () => {
  const bom = computeBillOfMaterials(model);

  it('groepeert balken op lengte en diameter', () => {
    expect(bom.beams).toHaveLength(2);
    expect(bom.beams[0]).toMatchObject({ lengthM: 4, diameterMm: 80, count: 2, totalLengthM: 8 });
    expect(bom.totalBeams).toBe(3);
    expect(bom.totalBeamLengthM).toBe(16);
  });

  it('telt knoopnamen hoofdletterongevoelig bij elkaar op', () => {
    const kruisbond = bom.knots.find((k) => k.name.toLowerCase() === 'kruisbond');
    expect(kruisbond?.count).toBe(2);
    expect(kruisbond?.totalRopeM).toBe(16);
    expect(bom.totalKnots).toBe(3);
    expect(bom.totalRopeM).toBe(18);
  });

  it('schrijft een CSV met alle regels', () => {
    const csv = billOfMaterialsToCsv(bom);
    expect(csv.split('\n')).toHaveLength(1 + 2 + 2 + 2);
    expect(csv).toContain('Balk;4 m / 80 mm;2;8 m');
  });
});

describe('materiaal uit tussenstappen', () => {
  const metTussenstap: ResolvedModel = {
    beams: [
      ...model.beams,
      { id: 't1', lengthM: 4, diameterMm: 80, position: [0, 0, 0], quaternion: [0, 0, 0, 1], stepIndex: 2, temporary: true },
      { id: 't2', lengthM: 4, diameterMm: 80, position: [0, 0, 0], quaternion: [0, 0, 0, 1], stepIndex: 2, temporary: true },
    ],
    lashings: [
      ...model.lashings,
      { id: 'tk', name: 'kruisbond', beamIds: ['t1', 't2'], localOffset: [0, 0, 0], ropeLengthM: 8, color: '#000', stepIndex: 2, temporary: true },
    ],
  };
  const bom = computeBillOfMaterials(metTussenstap);

  it('telt voorgebouwd materiaal niet mee in het totaal', () => {
    expect(bom.totalBeams).toBe(3);
    expect(bom.totalBeamLengthM).toBe(16);
    expect(bom.totalKnots).toBe(3);
    expect(bom.totalRopeM).toBe(18);
  });

  it('houdt het wel apart zichtbaar', () => {
    expect(bom.totalTemporaryBeams).toBe(2);
    expect(bom.totalTemporaryKnots).toBe(1);
    expect(bom.temporaryBeams[0]).toMatchObject({ lengthM: 4, diameterMm: 80, count: 2 });
  });

  it('zet tijdelijke regels apart in de CSV', () => {
    const csv = billOfMaterialsToCsv(bom);
    expect(csv).toContain('Tijdelijk (al meegeteld);Balk 4 m / 80 mm;2;8 m');
    expect(csv).toContain('Totaal;Balken;3;16 m');
  });
});
