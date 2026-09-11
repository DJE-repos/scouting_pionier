import { get, set } from 'idb-keyval';
import type { AssemblyLibrary, Project } from '../model/types';
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
  return {
    ...base,
    ...project,
    beams: project.beams ?? [],
    lashings: project.lashings ?? [],
    ropes: project.ropes ?? [],
    steps: project.steps?.length ? project.steps : base.steps,
    assemblyInstances: project.assemblyInstances ?? [],
    settings: { ...defaultSettings(), ...project.settings },
  };
}
