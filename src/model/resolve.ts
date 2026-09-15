import { Quaternion, Vector3 } from 'three';
import type {
  AssemblyDef,
  AssemblyInstance,
  AssemblyLibrary,
  Beam,
  Lashing,
  Project,
  Rope,
  StepTransform,
} from './types';
import {
  beamLocalToWorld,
  ropeLocalToWorld,
  toQuat,
  toVec3,
  worldToBeamLocal,
  worldToRopeLocal,
} from './geometry';

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
  const ropeIdMap = new Map<string, string>();
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

  const rawRopes = (def.ropes ?? []).map((r) => {
    const id = `${instance.id}:${r.id}`;
    ropeIdMap.set(r.id, id);
    return {
      ...r,
      id,
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
      ropeIds: l.ropeIds?.map((rid) => ropeIdMap.get(rid) ?? rid),
      stepIndex: instance.stepIndex,
    };
  });

  const ropes = rawRopes.map((r) => ({
    ...r,
    fromKnotId: knotIdMap.get(r.fromKnotId) ?? r.fromKnotId,
    toKnotId: knotIdMap.get(r.toKnotId) ?? r.toKnotId,
  }));

  return { beams, lashings, ropes };
}

export function temporarySteps(project: Project): Set<number> {
  return new Set(project.steps.filter((s) => s.temporary).map((s) => s.index));
}

function latestTransform(transforms: StepTransform[] | undefined, upToStep: number | null) {
  if (!transforms?.length) return undefined;
  return transforms
    .filter((transform) => upToStep === null || transform.stepIndex <= upToStep)
    .sort((a, b) => b.stepIndex - a.stepIndex)[0];
}

export function resolveStepTransform<
  T extends {
    position: [number, number, number];
    quaternion: [number, number, number, number];
    stepTransforms?: StepTransform[];
  },
>(
  item: T,
  upToStep: number | null,
): T {
  const transform = latestTransform(item.stepTransforms, upToStep);
  if (!transform) return item;
  return {
    ...item,
    position: transform.position ?? item.position,
    quaternion: transform.quaternion ?? item.quaternion,
  };
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

  const beams: ResolvedBeam[] = project.beams.map((beam) => mark(resolveStepTransform(beam, upToStep)));
  const lashings: ResolvedLashing[] = project.lashings.map(mark);
  const rawRopes: (Rope & { instanceId?: string; temporary: boolean })[] = (project.ropes ?? []).map(
    mark,
  );

  for (const instance of project.assemblyInstances) {
    const def = library.defs.find((d) => d.id === instance.defId);
    if (!def) continue;
    const expanded = instantiate(def, resolveStepTransform(instance, upToStep));
    beams.push(
      ...expanded.beams.map((b) => ({
        ...mark(b),
        temporaryMeasure: def.temporaryMeasure || b.temporaryMeasure,
        instanceId: instance.id,
        assemblyName: def.name,
      })),
    );
    lashings.push(...expanded.lashings.map((l) => ({ ...mark(l), temporaryMeasure: def.temporaryMeasure || l.temporaryMeasure, instanceId: instance.id })));
    rawRopes.push(...expanded.ropes.map((r) => ({ ...mark(r), temporaryMeasure: def.temporaryMeasure || r.temporaryMeasure, instanceId: instance.id })));
  }

  const knotPositionMap = new Map<string, Vector3>();
  const ropes: ResolvedRope[] = [];
  const resolvedRopeMap = new Map<string, ResolvedRope>();

  let progress = true;
  while (progress) {
    progress = false;

    for (const l of lashings) {
      if (knotPositionMap.has(l.id)) continue;

      let pos: Vector3 | null = null;
      if (l.beamIds && l.beamIds.length > 0) {
        const anchor = beams.find((b) => b.id === l.beamIds[0]);
        if (anchor) {
          const transform = latestTransform(l.stepTransforms, upToStep);
          const localOffset = transform?.position
            ? worldToBeamLocal(anchor, new Vector3(...transform.position))
            : l.localOffset;
          l.localOffset = localOffset;
          pos = beamLocalToWorld(anchor, localOffset);
        }
      } else if (l.ropeIds && l.ropeIds.length > 0) {
        const anchorRope = resolvedRopeMap.get(l.ropeIds[0]);
        if (anchorRope) {
          const transform = latestTransform(l.stepTransforms, upToStep);
          const p1 = new Vector3(...anchorRope.fromPosition);
          const p2 = new Vector3(...anchorRope.toPosition);
          const localOffset = transform?.position
            ? worldToRopeLocal(p1, p2, new Vector3(...transform.position))
            : l.localOffset;
          l.localOffset = localOffset;
          pos = ropeLocalToWorld(p1, p2, localOffset);
        }
      }

      if (pos) {
        knotPositionMap.set(l.id, pos);
        progress = true;
      }
    }

    for (const r of rawRopes) {
      if (resolvedRopeMap.has(r.id)) continue;

      const p1 = knotPositionMap.get(r.fromKnotId);
      const p2 = knotPositionMap.get(r.toKnotId);
      if (p1 && p2) {
        const lengthM = Math.round(p1.distanceTo(p2) * 100) / 100;
        const extra = r.extraLengthM ?? 1;
        const totalRopeM = Math.round((lengthM + extra) * 100) / 100;
        const resolvedRope: ResolvedRope = {
          ...r,
          lengthM,
          totalRopeM,
          fromPosition: toVec3(p1),
          toPosition: toVec3(p2),
        };
        ropes.push(resolvedRope);
        resolvedRopeMap.set(r.id, resolvedRope);
        progress = true;
      }
    }
  }

  if (upToStep === null) return { beams, lashings, ropes };

  // Voorgebouwde onderdelen horen alleen bij hun eigen stap; daarna staat het echte werk er.
  const visible = <T extends { stepIndex: number; temporary: boolean; removedAtStep?: number }>(item: T) =>
    item.removedAtStep !== undefined && item.removedAtStep <= upToStep
      ? false
      : item.temporary
        ? item.stepIndex === upToStep
        : item.stepIndex <= upToStep;

  return {
    beams: beams.filter(visible),
    lashings: lashings.filter(visible),
    ropes: ropes.filter(visible),
  };
}
