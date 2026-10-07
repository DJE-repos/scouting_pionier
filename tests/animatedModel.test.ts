import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { newProject } from '../src/model/defaults';
import { resolveAnimatedModel, resolveModel } from '../src/model/resolve';
import { toQuat } from '../src/model/geometry';

const library = { defs: [] };

function projectWithMovedBeam() {
  const project = newProject('Animation');
  project.steps.push({ index: 1, title: 'Verplaatsen' });
  project.beams.push({
    id: 'beam-1',
    lengthM: 4,
    diameterMm: 80,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    stepIndex: 0,
    stepTransforms: [{ stepIndex: 1, position: [4, 2, 0] }],
  });
  return project;
}

describe('resolveAnimatedModel', () => {
  it('interpoleert balkposities tussen bouwstappen', () => {
    const model = resolveAnimatedModel(projectWithMovedBeam(), library, 0.5);

    expect(model.beams[0].position).toEqual([2, 1, 0]);
  });

  it('interpoleert rotaties langs de kortste quaternionboog', () => {
    const project = projectWithMovedBeam();
    const halfTurn = toQuat(
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
    );
    project.beams[0].stepTransforms![0].quaternion = halfTurn;

    const model = resolveAnimatedModel(project, library, 0.5);
    const halfway = new Quaternion(...model.beams[0].quaternion);
    const expected = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);

    expect(Math.abs(halfway.dot(expected))).toBeCloseTo(1);
  });

  it('fadet nieuwe onderdelen in en verwijderde onderdelen uit', () => {
    const project = projectWithMovedBeam();
    project.beams.push({
      id: 'beam-2',
      lengthM: 3,
      diameterMm: 80,
      position: [0, 0, 1],
      quaternion: [0, 0, 0, 1],
      stepIndex: 1,
    });
    project.beams[0].removedAtStep = 1;

    const model = resolveAnimatedModel(project, library, 0.5);

    expect(model.beams.find((beam) => beam.id === 'beam-1')?.animationOpacity).toBeCloseTo(0.5);
    expect(model.beams.find((beam) => beam.id === 'beam-2')?.animationOpacity).toBeCloseTo(0.5);
  });

  it('clamps animatietijd en behoudt stapgewijze zichtbaarheid', () => {
    const project = projectWithMovedBeam();
    project.beams[0].removedAtStep = 1;

    expect(resolveAnimatedModel(project, library, -1).beams).toHaveLength(1);
    expect(resolveAnimatedModel(project, library, 1).beams).toHaveLength(0);
    project.steps.push({ index: 2, title: 'Verder bouwen' });
    expect(resolveModel(project, library, 2).beams).toHaveLength(0);
  });

  it('houdt balken en knopen zichtbaar in hun verwijderstap', () => {
    const project = projectWithMovedBeam();
    project.beams[0].removedAtStep = 1;
    project.lashings.push({
      id: 'knot-1',
      name: 'kruissjorring',
      beamIds: ['beam-1'],
      localOffset: [0, 0, 0],
      ropeLengthM: 1,
      color: '#16a34a',
      stepIndex: 0,
      removedAtStep: 1,
    });

    const removalStep = resolveModel(project, library, 1, true);

    expect(removalStep.beams.map((beam) => beam.id)).toContain('beam-1');
    expect(removalStep.lashings.map((lashing) => lashing.id)).toContain('knot-1');
    expect(resolveModel(project, library, 1).beams).toHaveLength(0);
    expect(resolveModel(project, library, 1).lashings).toHaveLength(0);
    expect(resolveModel(project, library, 2).lashings).toHaveLength(0);
  });
});
