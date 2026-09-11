import { Quaternion, Vector3 } from 'three';
import type {
  AssemblyDef,
  AssemblyInstance,
  AssemblyLibrary,
  Beam,
  Lashing,
  Project,
  Rope,
} from './types';
import { beamLocalToWorld, toQuat, toVec3 } from './geometry';

export interface ResolvedBeam extends Beam {
  /** Gezet wanneer de balk uit een assembly-instantie komt (niet los bewerkbaar). */
  instanceId?: string;
  assemblyName?: string;
  /** Hoort bij een tussenstap; telt niet mee in de totale materiaalstaat. */
  temporary: boolean;
}

export interface ResolvedLashing extends Lashing {
  instanceId?: string;
  temporary: boolean;
}

export interface ResolvedRope extends Rope {
  instanceId?: string;
  temporary: boolean;
  lengthM: number;
  totalRopeM: number;
  fromPosition: [number, number, number];
  toPosition: [number, number, number];
}

export interface ResolvedModel {
  beams: ResolvedBeam[];
  lashings: ResolvedLashing[];
  ropes: ResolvedRope[];
}

/** Zet een assembly-definitie om in losse balken/knopen/touwen op de plek van de instantie met stabiele IDs. */
export function instantiate(
  def: AssemblyDef,
  instance: AssemblyInstance,
): { beams: Beam[]; lashings: Lashing[]; ropes: Rope[] } {
  const idMap = new Map<string, string>();
  const knotIdMap = new Map<string, string>();
  const offset = new Vector3(...instance.position);
  const rotation = new Quaternion(...instance.quaternion);

  const beams = def.beams.map((b) => {
    const id = `${instance.id}:${b.id}`;
    idMap.set(b.id, id);
    return {
      ...b,
      id,
      position: toVec3(new Vector3(...b.position).applyQuaternion(rotation).add(offset)),
      quaternion: toQuat(rotation.clone().multiply(new Quaternion(...b.quaternion))),
      stepIndex: instance.stepIndex,
    };
  });

  const lashings = def.lashings.map((l) => {
    const id = `${instance.id}:${l.id}`;
    knotIdMap.set(l.id, id);
    return {
      ...l,
      id,
      beamIds: l.beamIds.map((bid) => idMap.get(bid) ?? bid),
      stepIndex: instance.stepIndex,
    };
  });

  const ropes = (def.ropes ?? []).map((r) => ({
    ...r,
    id: `${instance.id}:${r.id}`,
    fromKnotId: knotIdMap.get(r.fromKnotId) ?? r.fromKnotId,
    toKnotId: knotIdMap.get(r.toKnotId) ?? r.toKnotId,
    stepIndex: instance.stepIndex,
  }));

  return { beams, lashings, ropes };
}

export function temporarySteps(project: Project): Set<number> {
  return new Set(project.steps.filter((s) => s.temporary).map((s) => s.index));
}

/** Vlakke lijst van alles in het project, met assembly-instanties uitgeklapt. */
export function resolveModel(
  project: Project,
  library: AssemblyLibrary,
  upToStep: number | null = null,
): ResolvedModel {
  const temp = temporarySteps(project);
  const mark = <T extends { stepIndex: number }>(item: T) => ({
    ...item,
    temporary: temp.has(item.stepIndex),
  });

  const beams: ResolvedBeam[] = project.beams.map(mark);
  const lashings: ResolvedLashing[] = project.lashings.map(mark);
  const rawRopes: (Rope & { instanceId?: string; temporary: boolean })[] = (project.ropes ?? []).map(
    mark,
  );

  for (const instance of project.assemblyInstances) {
    const def = library.defs.find((d) => d.id === instance.defId);
    if (!def) continue;
    const expanded = instantiate(def, instance);
    beams.push(
      ...expanded.beams.map((b) => ({
        ...mark(b),
        instanceId: instance.id,
        assemblyName: def.name,
      })),
    );
    lashings.push(...expanded.lashings.map((l) => ({ ...mark(l), instanceId: instance.id })));
    rawRopes.push(...expanded.ropes.map((r) => ({ ...mark(r), instanceId: instance.id })));
  }

  const knotPositionMap = new Map<string, Vector3>();
  for (const l of lashings) {
    const anchor = beams.find((b) => b.id === l.beamIds[0]);
    if (anchor) {
      knotPositionMap.set(l.id, beamLocalToWorld(anchor, l.localOffset));
    }
  }

  const ropes: ResolvedRope[] = [];
  for (const r of rawRopes) {
    const p1 = knotPositionMap.get(r.fromKnotId);
    const p2 = knotPositionMap.get(r.toKnotId);
    if (!p1 || !p2) continue;
    const lengthM = Math.round(p1.distanceTo(p2) * 100) / 100;
    const extra = r.extraLengthM ?? 1;
    const totalRopeM = Math.round((lengthM + extra) * 100) / 100;
    ropes.push({
      ...r,
      lengthM,
      totalRopeM,
      fromPosition: toVec3(p1),
      toPosition: toVec3(p2),
    });
  }

  if (upToStep === null) return { beams, lashings, ropes };

  // Voorgebouwde onderdelen horen alleen bij hun eigen stap; daarna staat het echte werk er.
  const visible = <T extends { stepIndex: number; temporary: boolean }>(item: T) =>
    item.temporary ? item.stepIndex === upToStep : item.stepIndex <= upToStep;

  return {
    beams: beams.filter(visible),
    lashings: lashings.filter(visible),
    ropes: ropes.filter(visible),
  };
}
