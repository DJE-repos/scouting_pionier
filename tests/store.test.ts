import { beforeEach, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { useEditor } from '../src/store/projectStore';
import { newProject } from '../src/model/defaults';
import { beamEndpoints, beamLocalToWorld, quaternionFromDirection, toQuat } from '../src/model/geometry';
import { resolveModel } from '../src/model/resolve';
import { computeBillOfMaterials } from '../src/export/billOfMaterials';

const store = () => useEditor.getState();
const alongX = toQuat(quaternionFromDirection(new Vector3(1, 0, 0)));

beforeEach(() => {
  store().loadProject(newProject('Test'));
  store().loadLibrary({ defs: [] });
});

describe('balken', () => {
  it('plaatst een balk met de gekozen lengte en selecteert hem', () => {
    const id = store().addBeam(4, [0, 0, 0], alongX);
    expect(store().project.beams).toHaveLength(1);
    expect(store().project.beams[0].lengthM).toBe(4);
    expect(store().selectedBeamIds).toEqual([id]);
  });

  it('houdt bij het verlengen het gekozen ankerpunt vast', () => {
    const id = store().addBeam(4, [0, 0, 0], alongX);
    store().setLengthAnchor('start');
    store().setBeamLength(id, 8);

    const beam = store().project.beams[0];
    expect(beam.lengthM).toBe(8);
    expect(beamEndpoints(beam)[0].x).toBeCloseTo(-2);
  });
});

describe('knopen', () => {
  it('maakt geen knoop zonder balken', () => {
    expect(store().createLashing('mastworp')).toBeNull();
  });

  it('maakt een knoop op 1 balk', () => {
    const a = store().addBeam(4, [0, 0, 0], alongX);
    store().setSelection([a]);
    const id = store().createLashing('mastworp');

    expect(id).not.toBeNull();
    const lashing = store().project.lashings[0];
    expect(lashing.name).toBe('mastworp');
    expect(lashing.beamIds).toEqual([a]);

    const anchor = store().project.beams.find((x) => x.id === a)!;
    expect(beamLocalToWorld(anchor, lashing.localOffset).x).toBeCloseTo(0);
  });

  it('maakt een knoop op het contactpunt van de selectie', () => {
    const a = store().addBeam(4, [0, 0, 0], alongX);
    const b = store().addBeam(4, [0, 0.5, 0]);
    store().setSelection([a, b]);
    const id = store().createLashing('kruissjorring');

    expect(id).not.toBeNull();
    const lashing = store().project.lashings[0];
    expect(lashing.name).toBe('kruissjorring');
    expect(lashing.ropeLengthM).toBe(8);

    const anchor = store().project.beams.find((x) => x.id === lashing.beamIds[0])!;
    expect(beamLocalToWorld(anchor, lashing.localOffset).y).toBeCloseTo(0);
  });

  it('laat de knoop meebewegen met de ankerbalk', () => {
    const a = store().addBeam(4, [0, 0, 0], alongX);
    const b = store().addBeam(4, [0, 0.5, 0]);
    store().setSelection([a, b]);
    store().createLashing('kruissjorring');

    store().transformBeam(a, [5, 0, 0], alongX);
    const lashing = store().project.lashings[0];
    const anchor = store().project.beams.find((x) => x.id === lashing.beamIds[0])!;
    expect(beamLocalToWorld(anchor, lashing.localOffset).x).toBeCloseTo(5);
  });

  it('verwijdert knopen waarvan een balk verdwijnt', () => {
    const a = store().addBeam(4, [0, 0, 0], alongX);
    const b = store().addBeam(4, [0, 0.5, 0]);
    store().setSelection([a, b]);
    store().createLashing('kruissjorring');

    store().setSelection([a]);
    store().deleteSelected();
    expect(store().project.lashings).toHaveLength(0);
  });
});

describe('undo/redo', () => {
  it('draait een lengtewijziging terug en weer vooruit', () => {
    const id = store().addBeam(4, [0, 0, 0], alongX);
    store().setBeamLength(id, 8);
    expect(store().project.beams[0].lengthM).toBe(8);

    store().undo();
    expect(store().project.beams[0].lengthM).toBe(4);

    store().redo();
    expect(store().project.beams[0].lengthM).toBe(8);
  });
});

describe('assemblies', () => {
  it('slaat een selectie op en plaatst hem opnieuw met knopen en al', () => {
    const a = store().addBeam(4, [1, 0, 0], alongX);
    const b = store().addBeam(4, [1, 0.5, 0]);
    store().setSelection([a, b]);
    store().createLashing('kruissjorring');
    store().setSelection([a, b]);
    store().saveSelectionAsAssembly('driepoot');

    const def = store().library.defs[0];
    expect(def.name).toBe('driepoot');
    expect(def.beams).toHaveLength(2);
    expect(def.lashings).toHaveLength(1);

    store().addAssemblyInstance(def.id, [10, 0, 0]);
    const model = resolveModel(store().project, store().library);
    expect(model.beams).toHaveLength(4);
    expect(model.lashings).toHaveLength(2);

    const placed = model.beams.filter((x) => x.instanceId);
    expect(placed.every((x) => x.position[0] > 9)).toBe(true);
  });

  it('haalt een instantie uit elkaar tot losse balken', () => {
    const a = store().addBeam(4, [0, 0, 0], alongX);
    store().setSelection([a]);
    store().saveSelectionAsAssembly('paal');
    store().addAssemblyInstance(store().library.defs[0].id, [5, 0, 0]);

    const instanceId = store().project.assemblyInstances[0].id;
    store().explodeInstance(instanceId);

    expect(store().project.assemblyInstances).toHaveLength(0);
    expect(store().project.beams).toHaveLength(2);
  });

  it('verplaatst en draait een instantie als geheel', () => {
    const a = store().addBeam(4, [1, 0, 0], alongX);
    const b = store().addBeam(4, [-1, 0, 0], alongX);
    store().setSelection([a, b]);
    store().saveSelectionAsAssembly('schraag');
    store().addAssemblyInstance(store().library.defs[0].id, [0, 0, 0]);

    const instanceId = store().project.assemblyInstances[0].id;
    const kwartslag = toQuat(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2));
    store().transformInstance(instanceId, [10, 0, 0], kwartslag);

    const instance = store().project.assemblyInstances[0];
    expect(instance.position).toEqual([10, 0, 0]);

    // een kwartslag om Y verplaatst de balken van de X- naar de Z-as
    const placed = resolveModel(store().project, store().library).beams.filter((x) => x.instanceId);
    expect(placed).toHaveLength(2);
    for (const beam of placed) {
      expect(beam.position[0]).toBeCloseTo(10);
      expect(Math.abs(beam.position[2])).toBeCloseTo(1);
    }
  });

  it('verbindt een balk uit een assembly met een losse balk', () => {
    const a = store().addBeam(4, [0, 0, 0], alongX);
    store().setSelection([a]);
    store().saveSelectionAsAssembly('ligger');
    store().deleteSelected();

    store().addAssemblyInstance(store().library.defs[0].id, [0, 0, 0]);
    const loose = store().addBeam(4, [0, 0.5, 0]);

    const model = resolveModel(store().project, store().library);
    const assemblyBeam = model.beams.find((b) => b.instanceId)!;
    expect(assemblyBeam).toBeDefined();

    store().setSelection([assemblyBeam.id, loose]);
    const lashingId = store().createLashing('kruissjorring');
    expect(lashingId).not.toBeNull();

    const updatedModel = resolveModel(store().project, store().library);
    expect(updatedModel.lashings).toHaveLength(1);
    expect(updatedModel.lashings[0].beamIds).toContain(assemblyBeam.id);
    expect(updatedModel.lashings[0].beamIds).toContain(loose);
  });

  it('verbindt balken uit twee verschillende assembly-instanties', () => {
    const a = store().addBeam(4, [0, 0, 0], alongX);
    store().setSelection([a]);
    store().saveSelectionAsAssembly('staander');
    store().deleteSelected();

    const defId = store().library.defs[0].id;
    store().addAssemblyInstance(defId, [0, 0, 0]);
    store().addAssemblyInstance(defId, [0, 0.5, 0]);

    const model = resolveModel(store().project, store().library);
    const instBeams = model.beams.filter((b) => b.instanceId);
    expect(instBeams).toHaveLength(2);

    store().setSelection([instBeams[0].id, instBeams[1].id]);
    const lashingId = store().createLashing('kruissjorring');
    expect(lashingId).not.toBeNull();

    const updatedModel = resolveModel(store().project, store().library);
    expect(updatedModel.lashings).toHaveLength(1);
    expect(updatedModel.lashings[0].beamIds).toEqual([instBeams[0].id, instBeams[1].id]);

    // Beweeg de eerste instantie; de knoop die daaraan geankerd is beweegt mee
    const originalAnchor = model.beams.find((b) => b.id === updatedModel.lashings[0].beamIds[0])!;
    const originalPos = beamLocalToWorld(originalAnchor, updatedModel.lashings[0].localOffset);

    const firstInstId = store().project.assemblyInstances[0].id;
    store().transformInstance(firstInstId, [5, 0, 0], [0, 0, 0, 1]);

    const resolvedAfterMove = resolveModel(store().project, store().library);
    const knotAnchor = resolvedAfterMove.beams.find((b) => b.id === updatedModel.lashings[0].beamIds[0])!;
    const knotPos = beamLocalToWorld(knotAnchor, updatedModel.lashings[0].localOffset);
    expect(knotPos.x - originalPos.x).toBeCloseTo(5);
  });

  it('behoudt knopen tussen balken na explodeInstance', () => {
    const a = store().addBeam(4, [0, 0, 0], alongX);
    store().setSelection([a]);
    store().saveSelectionAsAssembly('staander');
    store().deleteSelected();

    const defId = store().library.defs[0].id;
    store().addAssemblyInstance(defId, [0, 0, 0]);
    const loose = store().addBeam(4, [0, 0.5, 0]);

    const model = resolveModel(store().project, store().library);
    const assemblyBeam = model.beams.find((b) => b.instanceId)!;

    store().setSelection([assemblyBeam.id, loose]);
    store().createLashing('kruissjorring');

    const instId = store().project.assemblyInstances[0].id;
    store().explodeInstance(instId);

    expect(store().project.assemblyInstances).toHaveLength(0);
    expect(store().project.beams).toHaveLength(2);
    expect(store().project.lashings).toHaveLength(1);
    expect(store().project.lashings[0].beamIds).toEqual([assemblyBeam.id, loose]);
  });
});

describe('touwen', () => {
  it('spant een touw tussen twee knopen', () => {
    const a = store().addBeam(4, [0, 0, 0], alongX);
    const b = store().addBeam(4, [0, 5, 0], alongX);

    store().setSelection([a]);
    const knot1 = store().createLashing('mastworp')!;

    store().setSelection([b]);
    const knot2 = store().createLashing('mastworp')!;

    store().select('lashing', knot1, false);
    store().select('lashing', knot2, true);

    const ropeId = store().createRope()!;
    expect(ropeId).not.toBeNull();

    const model = resolveModel(store().project, store().library);
    expect(model.ropes).toHaveLength(1);
    expect(model.ropes[0].lengthM).toBeCloseTo(5);
    expect(model.ropes[0].totalRopeM).toBeCloseTo(6); // 5m + 1m extra
  });

  it('spant een touw tussen knopen van assemblies', () => {
    const a = store().addBeam(4, [0, 0, 0], alongX);
    store().setSelection([a]);
    const knot1 = store().createLashing('mastworp')!;
    store().setSelection([a]);
    store().saveSelectionAsAssembly('paal');
    store().deleteSelected();

    const defId = store().library.defs[0].id;
    store().addAssemblyInstance(defId, [0, 0, 0]);
    store().addAssemblyInstance(defId, [0, 8, 0]);

    const model = resolveModel(store().project, store().library);
    expect(model.lashings).toHaveLength(2);

    const ropeId = store().createRope(model.lashings[0].id, model.lashings[1].id, 'Hangtouw');
    expect(ropeId).not.toBeNull();

    const updated = resolveModel(store().project, store().library);
    expect(updated.ropes).toHaveLength(1);
    expect(updated.ropes[0].name).toBe('Hangtouw');
    expect(updated.ropes[0].lengthM).toBeCloseTo(8);
  });

  it('verwijdert touwen als een van de verbonden knopen/balken verdwijnt', () => {
    const a = store().addBeam(4, [0, 0, 0], alongX);
    const b = store().addBeam(4, [0, 3, 0], alongX);

    store().setSelection([a]);
    const knot1 = store().createLashing('mastworp')!;

    store().setSelection([b]);
    const knot2 = store().createLashing('mastworp')!;

    store().createRope(knot1, knot2);
    expect(store().project.ropes).toHaveLength(1);

    store().setSelection([a]);
    store().deleteSelected();

    expect(store().project.ropes).toHaveLength(0);
  });
});

describe('drag-selectie en meervoudige selectie', () => {
  it('selecteert meerdere elementen tegelijk via selectMultiple', () => {
    const a = store().addBeam(4, [0, 0, 0], alongX);
    const b = store().addBeam(4, [0, 2, 0], alongX);

    store().selectMultiple({ beamIds: [a, b] });
    expect(store().selectedBeamIds).toEqual([a, b]);
    expect(store().selectedLashingIds).toEqual([]);
  });

  it('voegt elementen toe bij additive selection', () => {
    const a = store().addBeam(4, [0, 0, 0], alongX);
    const b = store().addBeam(4, [0, 2, 0], alongX);
    const c = store().addBeam(4, [0, 4, 0], alongX);

    store().selectMultiple({ beamIds: [a] });
    expect(store().selectedBeamIds).toEqual([a]);

    store().selectMultiple({ beamIds: [b, c] }, true);
    expect(store().selectedBeamIds).toEqual([a, b, c]);
  });

  it('kan boxSelectMode aan- en uitzetten', () => {
    expect(store().boxSelectMode).toBe(false);
    store().toggleBoxSelect();
    expect(store().boxSelectMode).toBe(true);
    store().setTransformMode('translate');
    expect(store().boxSelectMode).toBe(false);
  });
});

describe('bouwstappen', () => {
  it('filtert het model op de gekozen stap', () => {
    store().addBeam(4, [0, 0, 0], alongX);
    store().addStep();
    const second = store().addBeam(2, [0, 2, 0], alongX);

    expect(store().project.beams.find((x) => x.id === second)?.stepIndex).toBe(1);
    expect(resolveModel(store().project, store().library, 0).beams).toHaveLength(1);
    expect(resolveModel(store().project, store().library, 1).beams).toHaveLength(2);
  });
});

describe('tussenstappen', () => {
  /** Stap 0 is het echte werk, stap 1 bouwt iets voor, stap 2 gaat verder. */
  const bouwOp = () => {
    store().addBeam(4, [0, 0, 0], alongX);
    store().addStep();
    store().setStepTemporary(1, true);
    store().addBeam(2, [0, 2, 0], alongX);
    store().addStep();
    store().addBeam(3, [0, 4, 0], alongX);
  };

  it('toont voorgebouwd materiaal alleen in de eigen stap', () => {
    bouwOp();
    const perStap = [0, 1, 2].map(
      (i) => resolveModel(store().project, store().library, i).beams.length,
    );
    expect(perStap).toEqual([1, 2, 2]);
  });

  it('markeert de elementen van een tussenstap als tijdelijk', () => {
    bouwOp();
    const model = resolveModel(store().project, store().library);
    expect(model.beams.filter((b) => b.temporary)).toHaveLength(1);
  });

  it('laat voorgebouwd materiaal buiten het totaal', () => {
    bouwOp();
    const bom = computeBillOfMaterials(resolveModel(store().project, store().library));
    expect(bom.totalBeams).toBe(2);
    expect(bom.totalTemporaryBeams).toBe(1);
  });

  it('telt het materiaal weer mee zodra de stap geen tussenstap meer is', () => {
    bouwOp();
    store().setStepTemporary(1, false);
    const bom = computeBillOfMaterials(resolveModel(store().project, store().library));
    expect(bom.totalBeams).toBe(3);
    expect(bom.totalTemporaryBeams).toBe(0);
  });
});
