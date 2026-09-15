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
