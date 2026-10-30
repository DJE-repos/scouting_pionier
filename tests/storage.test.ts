import { describe, expect, it } from 'vitest';
import { newProject } from '../src/model/defaults';
import { deserialize, serialize } from '../src/persistence/storage';

function importedProjectWithoutDeparturePoint() {
  const project = newProject('Oud project');
  project.steps = [
    { index: 0, title: 'Stap 1', includeContext: false },
    { index: 1, title: 'Fundering', temporary: true },
  ];
  project.beams = [
    {
      id: 'beam-1',
      lengthM: 4,
      diameterMm: 80,
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      stepIndex: 1,
      removedAtStep: 1,
      stepTransforms: [{ stepIndex: 1, position: [1, 0, 0] }],
    },
  ];
  project.assemblyInstances = [
    {
      id: 'instance-1',
      defId: 'assembly-1',
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      stepIndex: 1,
      stepTransforms: [{ stepIndex: 1, position: [2, 0, 0] }],
    },
  ];
  return project;
}

describe('projectmigratie', () => {
  it('round-trips levels and optional beam link recipes', () => {
    const project = importedProjectWithoutDeparturePoint();
    project.referenceLevels = [{ id: 'deck', name: 'Deck', elevationM: 2 }];
    project.beams[0].placement = {
      picks: [{ beamId: 'support', localPoint: [0, 1, 0], localNormal: [1, 0, 0] }],
      target: [3, 2, 0], offsetM: 0.1, anchor: 'start', linked: true,
    };
    project.beams[0].stepTransforms![0].placement = null;
    const imported = deserialize(serialize(project, { defs: [] })).project;
    expect(imported.referenceLevels).toEqual(project.referenceLevels);
    expect(imported.beams[0].placement).toEqual(project.beams[0].placement);
    expect(imported.beams[0].stepTransforms![0]).toMatchObject({ stepIndex: 2, placement: null });
  });

  it('defaults legacy levels and rejects non-finite elevations', () => {
    const project = newProject();
    delete project.referenceLevels;
    expect(deserialize(serialize(project, { defs: [] })).project.referenceLevels).toEqual([]);
    project.referenceLevels = [{ id: 'bad', name: 'Bad', elevationM: NaN }];
    expect(deserialize(serialize(project, { defs: [] })).project.referenceLevels).toEqual([]);
  });
  it('bewaart volledige camera-overrides per stap in het pionierbestand', () => {
    const project = newProject('Camera override');
    project.steps.push({
      index: 1,
      title: 'Camera test',
      viewAzimuthDeg: 90,
      viewElevationDeg: 25,
      cameraPosition: [8, 5, -3],
      cameraTarget: [1, 2, 0],
      cameraUp: [0, 1, 0],
    });

    const imported = deserialize(serialize(project, { defs: [] })).project.steps[1];

    expect(imported).toMatchObject({
      cameraPosition: [8, 5, -3],
      cameraTarget: [1, 2, 0],
      cameraUp: [0, 1, 0],
    });
  });

  it('voegt een vertrekpunt toe en schuift stapverwijzingen op', () => {
    const { project } = deserialize(serialize(importedProjectWithoutDeparturePoint(), { defs: [] }));

    expect(project.steps.map((step) => step.title)).toEqual(['Vertrekpunt', 'Stap 1', 'Fundering']);
    expect(project.steps[0].includeContext).toBe(true);
    expect(project.beams[0].stepIndex).toBe(2);
    expect(project.beams[0].removedAtStep).toBe(2);
    expect(project.beams[0].stepTransforms?.[0].stepIndex).toBe(2);
    expect(project.assemblyInstances[0].stepIndex).toBe(2);
    expect(project.assemblyInstances[0].stepTransforms?.[0].stepIndex).toBe(2);
  });

  it('maakt een bestaand vertrekpunt vast aan de importregels', () => {
    const project = newProject('Project met vertrekpunt');
    project.steps[0].includeContext = false;
    project.steps[0].temporary = true;

    const migrated = deserialize(serialize(project, { defs: [] })).project;

    expect(migrated.steps).toHaveLength(1);
    expect(migrated.steps[0].title).toBe('Vertrekpunt');
    expect(migrated.steps[0].includeContext).toBe(true);
    expect(migrated.steps[0].temporary).toBe(false);
  });
});
