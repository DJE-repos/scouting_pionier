export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

/** Standaard pionierbalklengtes in meter. */
export const STANDARD_LENGTHS = [1, 2, 3, 4, 5, 6, 8] as const;
export const STANDARD_DIAMETERS_MM = [60, 80, 100, 120] as const;

/** Anker bij het wijzigen van een balklengte: welk punt blijft staan. */
export type LengthAnchor = 'start' | 'center' | 'end';

export interface Beam {
  id: string;
  name?: string;
  /** Lengte in meter (lokale Y-as). */
  lengthM: number;
  diameterMm: number;
  /** Middelpunt van de balk in wereldcoordinaten. */
  position: Vec3;
  /** Rotatie als quaternion [x, y, z, w]; de balkas is lokaal +Y. */
  quaternion: Quat;
  stepIndex: number;
}

export interface Lashing {
  id: string;
  /** Vrije knoopnaam, bijv. "kruisbond". */
  name: string;
  beamIds: string[];
  /** Positie in het lokale assenstelsel van beamIds[0], zodat de knoop meebeweegt. */
  localOffset: Vec3;
  ropeLengthM: number;
  color: string;
  stepIndex: number;
}

export interface Rope {
  id: string;
  /** Vrije naam voor de touwverbinding, bijv. "Spantouw", "Hangtouw". */
  name?: string;
  fromKnotId: string;
  toKnotId: string;
  diameterMm?: number;
  color?: string;
  /** Extra touwlengte in meter voor knopen/afwerking (bovenop de overspanning). */
  extraLengthM?: number;
  stepIndex: number;
}

export interface AssemblyDef {
  id: string;
  name: string;
  beams: Beam[];
  lashings: Lashing[];
  ropes?: Rope[];
}

export interface AssemblyInstance {
  id: string;
  defId: string;
  position: Vec3;
  quaternion: Quat;
  stepIndex: number;
}

export interface BuildStep {
  index: number;
  title: string;
  /**
   * Tussenstap: laat zien hoe een onderdeel op de grond wordt voorgebouwd. Dat materiaal
   * staat elders al in het model en telt daarom niet mee in de totale materiaalstaat.
   */
  temporary?: boolean;
  /** Eigen kijkrichting voor de aanzichten van deze stap; leeg = projectinstelling. */
  viewAzimuthDeg?: number;
  viewElevationDeg?: number;
}

export interface ProjectSettings {
  showLabels: boolean;
  labelScale: number;
  labelsForSelectionOnly: boolean;
  gridSnapM: number;
  angleSnapDeg: number;
  defaultDiameterMm: number;
  /** Zijde van het zichtbare maaiveld in meter. */
  groundSizeM: number;
  /** Standaard touwlengte per knoopnaam (lowercase key), in meter. */
  ropeLengthByKnot: Record<string, number>;
  /** Standaard kijkrichting voor de aanzichten in de handleiding. */
  viewAzimuthDeg: number;
  viewElevationDeg: number;
}

export interface Project {
  id: string;
  name: string;
  beams: Beam[];
  lashings: Lashing[];
  ropes?: Rope[];
  assemblyInstances: AssemblyInstance[];
  steps: BuildStep[];
  settings: ProjectSettings;
}

export interface AssemblyLibrary {
  defs: AssemblyDef[];
}

export type SelectionKind = 'beam' | 'lashing' | 'instance' | 'rope';

export interface Selection {
  kind: SelectionKind;
  id: string;
}
