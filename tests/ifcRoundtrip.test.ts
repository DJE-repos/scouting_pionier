import { describe, expect, it } from 'vitest';
import { IfcAPI } from 'web-ifc';
import { buildIfc } from '../src/export/ifc/ifcExport';
import { newProject } from '../src/model/defaults';
import type { ResolvedModel } from '../src/model/resolve';

const model: ResolvedModel = {
  beams: [
    { id: 'beam-1', lengthM: 4, diameterMm: 80, position: [0, 1, 0], quaternion: [0, 0, 0, 1], stepIndex: 0 },
    { id: 'beam-2', lengthM: 3, diameterMm: 80, position: [1, 1, 0], quaternion: [0.7071, 0, 0, 0.7071], stepIndex: 0 },
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

describe('IFC roundtrip', () => {
  it('kan door web-ifc ingelezen worden en levert geometrie op', async () => {
    const ifc = buildIfc(newProject('Roundtrip'), model);
    const api = new IfcAPI();
    await api.Init();
    const modelID = api.OpenModel(new TextEncoder().encode(ifc));

    const beams = api.GetLineIDsWithType(modelID, /* IFCBEAM */ 753842376);
    expect(beams.size()).toBe(2);

    let meshCount = 0;
    api.StreamAllMeshes(modelID, () => {
      meshCount++;
    });
    // twee balken plus de knoop: de sjorring moet zichtbaar zijn, niet alleen data
    expect(meshCount).toBe(3);

    api.CloseModel(modelID);
  }, 30_000);
});
