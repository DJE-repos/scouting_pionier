import { get, set } from 'idb-keyval';
import type { AssemblyLibrary, ContextObject, Project } from '../model/types';
import { defaultSettings, newProject } from '../model/defaults';

const PROJECT_KEY = 'pionier.project';
const LIBRARY_KEY = 'pionier.library';

export const FILE_VERSION = 1;

export interface PionierFile {
  version: number;
  project: Project;
  library: AssemblyLibrary;
}

export async function saveToStorage(project: Project, library: AssemblyLibrary) {
  await set(PROJECT_KEY, project);
  await set(LIBRARY_KEY, library);
}

export async function loadFromStorage(): Promise<{ project: Project; library: AssemblyLibrary } | null> {
  const project = await get<Project>(PROJECT_KEY);
  const library = await get<AssemblyLibrary>(LIBRARY_KEY);
  if (!project) return null;
  return { project: migrateProject(project), library: library ?? { defs: [] } };
}

export function serialize(project: Project, library: AssemblyLibrary): string {
  const file: PionierFile = { version: FILE_VERSION, project, library };
  return JSON.stringify(file, null, 2);
}

export function deserialize(json: string): { project: Project; library: AssemblyLibrary } {
  const parsed = JSON.parse(json) as Partial<PionierFile>;
  if (!parsed.project) throw new Error('Ongeldig pionierbestand: project ontbreekt.');
  return {
    project: migrateProject(parsed.project),
    library: parsed.library ?? { defs: [] },
  };
}

/** Vult ontbrekende velden aan zodat oudere bestanden blijven werken. */
function migrateProject(project: Project): Project {
  const base = newProject();
  const projectSteps = project.steps?.length ? project.steps : base.steps;
  const hasDeparturePoint = projectSteps.some((step) => step.title.trim().toLowerCase() === 'vertrekpunt');
  const steps = hasDeparturePoint
    ? projectSteps.map((step, index) => ({
        ...step,
        index,
        includeContext: index === 0 || (step.includeContext ?? false),
        temporary: index === 0 ? false : step.temporary,
      }))
    : [
        { ...base.steps[0] },
        ...projectSteps.map((step, index) => ({
          ...step,
          index: index + 1,
          includeContext: step.includeContext ?? false,
        })),
      ];
  const stepOffset = hasDeparturePoint ? 0 : 1;
  const remapStepIndex = (index: number) => index + stepOffset;
  const remapItem = <T extends { stepIndex: number; removedAtStep?: number; stepTransforms?: { stepIndex: number }[] }>(
    item: T,
  ): T => ({
    ...item,
    stepIndex: remapStepIndex(item.stepIndex),
    removedAtStep:
      item.removedAtStep === undefined ? undefined : remapStepIndex(item.removedAtStep),
    stepTransforms: item.stepTransforms?.map((transform) => ({
      ...transform,
      stepIndex: remapStepIndex(transform.stepIndex),
    })),
  });
  return {
    ...base,
    ...project,
    beams: (project.beams ?? []).map((item) => remapItem(item)),
    lashings: (project.lashings ?? []).map((item) => remapItem(item)),
    ropes: (project.ropes ?? []).map((item) => remapItem(item)),
    measurements: (project.measurements ?? []).map((item) => ({
      ...item,
      stepIndex: remapStepIndex(item.stepIndex),
    })),
    assemblyInstances: (project.assemblyInstances ?? []).map((item) => remapItem(item)),
    contextObjects: (project.contextObjects ?? []).map((object) => ({
      ...object,
      quaternion: object.quaternion ?? [0, 0, 0, 1],
    })) as ContextObject[],
    steps,
    settings: { ...defaultSettings(), ...project.settings },
  };
}
