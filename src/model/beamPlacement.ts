import { Quaternion, Vector3 } from 'three';
import type { Beam, BeamPick, BeamPlacement, Quat, Vec3 } from './types';
import {
  beamAxis, beamEndpoints, beamLocalToWorld, closestPointsBetweenSegments,
  quaternionFromDirection, toQuat, toVec3, worldToBeamLocal,
} from './geometry';

export interface PlacementResult {
  position: Vec3;
  quaternion: Quat;
  contacts: { beamId: string; position: Vec3; name: string }[];
  picks?: BeamPick[];
  error?: string;
}

export function pickBeam(beam: Beam, point: Vec3): BeamPick {
  const local = new Vector3(...worldToBeamLocal(beam, new Vector3(...point)));
  const half = beam.lengthM / 2;
  local.y = Math.max(-half, Math.min(half, local.y));
  for (const candidate of [-half, 0, half]) {
    if (Math.abs(local.y - candidate) < 0.08) local.y = candidate;
  }
  const normal = new Vector3(local.x, 0, local.z);
  if (normal.lengthSq() < 1e-8) normal.set(1, 0, 0);
  return { beamId: beam.id, localPoint: [0, local.y, 0], localNormal: toVec3(normal.normalize()) };
}

export function suggestedLashing(first: Beam, second: Beam): string {
  const cosine = Math.abs(beamAxis(first).dot(beamAxis(second)));
  return cosine > 0.94 ? 'steigersjorring' : cosine < 0.26 ? 'kruissjorring' : 'diagonaalsjorring';
}

export function solveBeamPlacement(
  lengthM: number, diameterMm: number, placement: BeamPlacement, beams: Beam[], levelCenterY?: number,
): PlacementResult {
  const invalid = (error: string): PlacementResult => ({
    position: [0, 0, 0], quaternion: [0, 0, 0, 1], contacts: [], error,
  });
  if (!Number.isFinite(lengthM) || lengthM <= 0 || !Number.isFinite(diameterMm) || diameterMm <= 0 ||
      !Number.isFinite(placement.offsetM) || (levelCenterY !== undefined && !Number.isFinite(levelCenterY))) return invalid('Ongeldige afmetingen.');
  if (placement.picks.length < 1 || placement.picks.length > 2) return invalid('Kies een of twee steunbalken.');
  if (new Set(placement.picks.map((pick) => pick.beamId)).size !== placement.picks.length) {
    return invalid('Kies twee verschillende steunbalken.');
  }
  const supports = placement.picks.map((pick) => beams.find((beam) => beam.id === pick.beamId));
  if (supports.some((beam) => !beam)) return invalid('Steunbalk ontbreekt.');
  if (placement.picks.some((pick, index) => ![...pick.localPoint, ...pick.localNormal].every(Number.isFinite) ||
      Math.abs(pick.localPoint[1]) > supports[index]!.lengthM / 2 + 1e-6)) {
    return invalid('Contactpunt ligt buiten de steunbalk.');
  }
  const points = placement.picks.map((pick, index) => beamLocalToWorld(supports[index]!, pick.localPoint));
  if (points.length === 1) {
    if (!placement.target) return invalid('Kies een richting.');
    points.push(new Vector3(...placement.target));
    if (levelCenterY !== undefined) points[1].y = levelCenterY;
  }
  if (points.some((point) => !point.toArray().every(Number.isFinite))) return invalid('Ongeldig plaatsingspunt.');
  const direction = points[1].clone().sub(points[0]);
  if (levelCenterY !== undefined) direction.y = 0;
  if (direction.length() < 0.001) return invalid('De plaatsingspunten vallen samen.');
  direction.normalize();
  const sideways = new Vector3(-direction.z, 0, direction.x);
  if (sideways.lengthSq() < 1e-8) sideways.set(1, 0, 0);
  sideways.normalize();
  const shifted = points.map((point) => point.clone());
  const adjusted = points.map((point) => point.clone());
  for (let iteration = 0; iteration < 16; iteration++) {
    for (let index = 0; index < placement.picks.length; index++) {
      const support = supports[index]!;
      const axis = beamAxis(support);
      const normal = new Vector3().crossVectors(direction, axis);
      const pickedNormal = new Vector3(...placement.picks[index].localNormal)
        .applyQuaternion(new Quaternion(...support.quaternion));
      if (normal.lengthSq() < 1e-8) {
        normal.copy(pickedNormal).addScaledVector(direction, -pickedNormal.dot(direction));
      }
      if (normal.lengthSq() < 1e-8) return invalid('Geen geldige contactzijde.');
      normal.normalize();
      if (normal.dot(pickedNormal) < 0) normal.negate();
      const clearance = normal.multiplyScalar((support.diameterMm + diameterMm) / 2000);
      adjusted[index].copy(points[index]);
      if (levelCenterY !== undefined) {
        const heightDelta = levelCenterY - points[index].y - clearance.y;
        if (Math.abs(axis.y) < 1e-8) {
          if (Math.abs(heightDelta) > 0.005) return invalid('Het niveau past niet bij de contactzijde van de steunbalk.');
        } else {
          adjusted[index].addScaledVector(axis, heightDelta / axis.y);
          if (Math.abs(worldToBeamLocal(support, adjusted[index])[1]) > support.lengthM / 2 + 1e-6) {
            return invalid('Het niveau ligt buiten de steunbalk.');
          }
        }
      }
      shifted[index].copy(adjusted[index]).addScaledVector(sideways, placement.offsetM).add(clearance);
    }
    if (placement.picks.length === 1) {
      shifted[1].copy(shifted[0]).addScaledVector(direction, lengthM);
      break;
    }
    const next = shifted[1].clone().sub(shifted[0]);
    if (next.lengthSq() < 1e-8) return invalid('De plaatsingspunten vallen samen.');
    next.normalize();
    const change = next.distanceTo(direction);
    direction.copy(next);
    if (change < 1e-9) break;
  }
  const delta = shifted[1].clone().sub(shifted[0]);
  const span = delta.length();
  if (span < 0.001) return invalid('De plaatsingspunten vallen samen.');
  delta.normalize();
  const along = placement.anchor === 'start' ? lengthM / 2
    : placement.anchor === 'end' ? span - lengthM / 2 : span / 2;
  const position = toVec3(shifted[0].clone().addScaledVector(delta, along));
  const quaternion = toQuat(quaternionFromDirection(delta));
  if (span > lengthM + 1e-6) return {
    position, quaternion, contacts: [], error: `Overspanning ${span.toFixed(2)} m is langer dan de balk (${lengthM} m).`,
  };
  const candidate: Beam = { id: 'preview', position, quaternion, lengthM, diameterMm, stepIndex: 0 };
  const contacts: PlacementResult['contacts'] = [];
  for (const support of supports as Beam[]) {
    const closest = closestPointsBetweenSegments(...beamEndpoints(candidate), ...beamEndpoints(support));
    const required = (support.diameterMm + diameterMm) / 2000;
    if (Math.abs(closest.distance - required) > 0.005) {
      return { position, quaternion, contacts, error: 'De offset of contactzijde geeft geen raakcontact. Kies een andere zijde of offset.' };
    }
    const contact = closest.b.clone().lerp(closest.a, support.diameterMm / (support.diameterMm + diameterMm));
    contacts.push({ beamId: support.id, position: toVec3(contact), name: suggestedLashing(candidate, support) });
  }
  const picks = placement.picks.map((pick, index) => ({
    ...pick, localPoint: worldToBeamLocal(supports[index]!, adjusted[index]),
  }));
  return { position, quaternion, contacts, picks };
}