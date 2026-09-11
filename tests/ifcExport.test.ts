import { describe, expect, it } from 'vitest';
import { buildIfc } from '../src/export/ifc/ifcExport';
import { compressGuid } from '../src/export/ifc/ifcGuid';
import { newProject } from '../src/model/defaults';
import type { ResolvedModel } from '../src/model/resolve';

const model: ResolvedModel = {
  beams: [
    { id: 'beam-1', lengthM: 4, diameterMm: 80, position: [0, 1, 0], quaternion: [0, 0, 0, 1], stepIndex: 0 },
    { id: 'beam-2', lengthM: 3, diameterMm: 80, position: [1, 1, 0], quaternion: [0, 0, 0, 1], stepIndex: 0 },
  ],
  lashings: [
    {
      id: 'knot-1',
      name: 'kruisbond',
      beamIds: ['beam-1', 'beam-2'],
      localOffset: [0, 0, 0],
      ropeLengthM: 8,
      color: '#e11d48',
      stepIndex: 0,
    },
  ],
};

describe('compressGuid', () => {
  it('levert 22 tekens op', () => {
    const guid = compressGuid('3b0e3f5a1c2d4e5f60718293a4b5c6d7');
    expect(guid).toHaveLength(22);
    expect(guid).toMatch(/^[0-9A-Za-z_$]{22}$/);
  });
});

describe('buildIfc', () => {
  const ifc = buildIfc(newProject('Testbrug'), model);

  it('schrijft een geldige IFC4 header', () => {
    expect(ifc.startsWith('ISO-10303-21;')).toBe(true);
    expect(ifc).toContain("FILE_SCHEMA(('IFC4'));");
    expect(ifc.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
  });

  it('bevat de ruimtelijke structuur', () => {
    for (const type of ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCRELAGGREGATES']) {
      expect(ifc).toContain(type);
    }
  });

  it('schrijft elke balk als IFCBEAM met een geextrudeerd rondprofiel', () => {
    expect(ifc.match(/IFCBEAM\(/g)).toHaveLength(2);
    expect(ifc).toContain('IFCCIRCLEPROFILEDEF');
    expect(ifc).toContain('IFCEXTRUDEDAREASOLID');
  });

  it('schrijft de knoop als bevestiging met verbinding tussen de balken', () => {
    expect(ifc).toContain('IFCMECHANICALFASTENER');
    expect(ifc).toContain('IFCRELCONNECTSELEMENTS');
    expect(ifc).toContain("'kruisbond'");
    expect(ifc).toContain('Pset_Pionier_Knoop');
  });

  it('nummert de regels oplopend en uniek', () => {
    const ids = [...ifc.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1]));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});
