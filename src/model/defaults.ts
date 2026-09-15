import type { Project, ProjectSettings } from './types';

export const KNOT_SUGGESTIONS = [
  'kruissjorring',
  'diagonaalsjorring',
  'schoorsteek',
  'driepootsjorring',
  'steigersjorring',
  'mastworp',
  'timmersteek',
  'platte knoop',
  'achtknoop',
];

/** Richtwaarden voor touwverbruik per knoopsoort (meter). */
export const DEFAULT_ROPE_LENGTHS: Record<string, number> = {
  kruissjorring: 8,
  diagonaalbond: 8,
  schoorbond: 6,
  driepootbond: 12,
  steigerbond: 8,
  mastworp: 2,
  schootslijn: 2,
  timmersteek: 2,
  'platte knoop': 1,
  achtknoop: 1,
};

export const DEFAULT_ROPE_LENGTH_M = 6;

export const defaultSettings = (): ProjectSettings => ({
  showLabels: true,
  labelScale: 1,
  labelsForSelectionOnly: false,
  gridSnapM: 0.25,
  angleSnapDeg: 15,
  defaultDiameterMm: 80,
  groundSizeM: 20,
  ropeLengthByKnot: { ...DEFAULT_ROPE_LENGTHS },
  viewAzimuthDeg: 45,
  viewElevationDeg: 30,
  georeferenceEnabled: false,
  georeferenceX: 93274,
  georeferenceY: 393183,
  georeferenceImagery: true,
  georeferenceBuildings: true,
});

export const newProject = (name = 'Nieuw pionierproject'): Project => ({
  id: crypto.randomUUID(),
  name,
  beams: [],
  lashings: [],
  ropes: [],
  assemblyInstances: [],
  measurements: [],
  contextObjects: [],
  steps: [{ index: 0, title: 'Vertrekpunt', includeContext: true }],
  settings: defaultSettings(),
});

export function ropeLengthFor(name: string, settings: ProjectSettings): number {
  return settings.ropeLengthByKnot[name.trim().toLowerCase()] ?? DEFAULT_ROPE_LENGTH_M;
}
