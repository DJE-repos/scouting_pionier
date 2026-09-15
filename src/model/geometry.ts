import { Euler, Matrix4, Quaternion, Vector3, Vector4 } from 'three';
import type { Beam, LengthAnchor, Quat, Vec3 } from './types';

export const v3 = (v: Vec3) => new Vector3(v[0], v[1], v[2]);
export const toVec3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];
export const quat = (q: Quat) => new Quaternion(q[0], q[1], q[2], q[3]);
export const toQuat = (q: Quaternion): Quat => [q.x, q.y, q.z, q.w];

/** Richting van de balkas in wereldcoordinaten (lokale +Y). */
export function beamAxis(beam: Beam): Vector3 {
  return new Vector3(0, 1, 0).applyQuaternion(quat(beam.quaternion)).normalize();
}

export function beamEndpoints(beam: Beam): [Vector3, Vector3] {
  const c = v3(beam.position);
  const half = beamAxis(beam).multiplyScalar(beam.lengthM / 2);
  return [c.clone().sub(half), c.clone().add(half)];
}

export function beamMatrix(beam: Beam): Matrix4 {
  return new Matrix4().compose(v3(beam.position), quat(beam.quaternion), new Vector3(1, 1, 1));
}

/** Quaternion die lokale +Y op de gegeven richting legt. */
export function quaternionFromDirection(dir: Vector3): Quaternion {
  return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
}

/** Nieuw middelpunt na een lengtewijziging, waarbij het ankerpunt op zijn plaats blijft. */
export function resizedCenter(beam: Beam, newLengthM: number, anchor: LengthAnchor): Vec3 {
  if (anchor === 'center') return beam.position;
  const [start, end] = beamEndpoints(beam);
  const axis = beamAxis(beam);
  const half = newLengthM / 2;
  const center =
    anchor === 'start'
      ? start.clone().add(axis.clone().multiplyScalar(half))
      : end.clone().sub(axis.clone().multiplyScalar(half));
  return toVec3(center);
}

/**
 * Kortste verbinding tussen twee lijnstukken.
 * Retourneert de twee dichtstbijzijnde punten en hun afstand.
 */
export function closestPointsBetweenSegments(
  p1: Vector3,
  q1: Vector3,
  p2: Vector3,
  q2: Vector3,
): { a: Vector3; b: Vector3; distance: number } {
  const d1 = q1.clone().sub(p1);
  const d2 = q2.clone().sub(p2);
  const r = p1.clone().sub(p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  const EPS = 1e-9;

  let s = 0;
  let t = 0;

  if (a <= EPS && e <= EPS) {
    // Beide "lijnstukken" zijn punten.
  } else if (a <= EPS) {
    t = clamp01(f / e);
  } else {
    const c = d1.dot(r);
    if (e <= EPS) {
      s = clamp01(-c / a);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }

  const ca = p1.clone().add(d1.multiplyScalar(s));
  const cb = p2.clone().add(d2.multiplyScalar(t));
  return { a: ca, b: cb, distance: ca.distanceTo(cb) };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Contactpunt voor een knoop tussen meerdere balken: het gemiddelde van de
 * middens van de kortste verbindingen tussen elk balkenpaar.
 */
export function contactPointForSegments(segments: [Vector3, Vector3][]): Vector3 {
  if (segments.length === 0) return new Vector3();
  if (segments.length === 1) {
    return segments[0][0].clone().add(segments[0][1]).multiplyScalar(0.5);
  }

  const points: Vector3[] = [];
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const { a, b } = closestPointsBetweenSegments(
        segments[i][0],
        segments[i][1],
        segments[j][0],
        segments[j][1],
      );
      points.push(a.add(b).multiplyScalar(0.5));
    }
  }
  const sum = points.reduce((acc, p) => acc.add(p), new Vector3());
  return sum.divideScalar(points.length);
}

export function contactPoint(beams: Beam[]): Vector3 {
  if (beams.length === 0) return new Vector3();
  if (beams.length === 1) return v3(beams[0].position);
  return contactPointForSegments(beams.map((b) => beamEndpoints(b)));
}

export function contactPointForItems(
  beams: Beam[],
  ropes: { fromPosition: Vec3; toPosition: Vec3 }[] = [],
): Vector3 {
  const segments: [Vector3, Vector3][] = [
    ...beams.map((b) => beamEndpoints(b)),
    ...ropes.map(
      (r) => [new Vector3(...r.fromPosition), new Vector3(...r.toPosition)] as [Vector3, Vector3],
    ),
  ];
  return contactPointForSegments(segments);
}

export function worldToBeamLocal(beam: Beam, world: Vector3): Vec3 {
  const inv = beamMatrix(beam).invert();
  return toVec3(world.clone().applyMatrix4(inv));
}

export function beamLocalToWorld(beam: Beam, local: Vec3): Vector3 {
  return v3(local).applyMatrix4(beamMatrix(beam));
}

export function ropeMatrix(fromPosition: Vector3, toPosition: Vector3): Matrix4 {
  const diff = toPosition.clone().sub(fromPosition);
  const len = diff.length();
  if (len < 0.001) {
    return new Matrix4().compose(fromPosition, new Quaternion(), new Vector3(1, 1, 1));
  }
  const q = quaternionFromDirection(diff);
  return new Matrix4().compose(fromPosition, q, new Vector3(1, 1, 1));
}

export function worldToRopeLocal(fromPosition: Vector3, toPosition: Vector3, world: Vector3): Vec3 {
  const inv = ropeMatrix(fromPosition, toPosition).invert();
  return toVec3(world.clone().applyMatrix4(inv));
}

export function ropeLocalToWorld(fromPosition: Vector3, toPosition: Vector3, local: Vec3): Vector3 {
  return v3(local).applyMatrix4(ropeMatrix(fromPosition, toPosition));
}

export interface ScreenBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function isPointInScreenBox(x: number, y: number, box: ScreenBox): boolean {
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
}

function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
}

function segmentsIntersect(
  a1x: number, a1y: number, a2x: number, a2y: number,
  b1x: number, b1y: number, b2x: number, b2y: number,
): boolean {
  return (
    ccw(a1x, a1y, b1x, b1y, b2x, b2y) !== ccw(a2x, a2y, b1x, b1y, b2x, b2y) &&
    ccw(a1x, a1y, a2x, a2y, b1x, b1y) !== ccw(a1x, a1y, a2x, a2y, b2x, b2y)
  );
}

export function isSegmentInScreenBox(
  x1: number, y1: number,
  x2: number, y2: number,
  box: ScreenBox,
): boolean {
  if (isPointInScreenBox(x1, y1, box) || isPointInScreenBox(x2, y2, box)) {
    return true;
  }
  const { minX, maxX, minY, maxY } = box;
  if (segmentsIntersect(x1, y1, x2, y2, minX, minY, maxX, minY)) return true;
  if (segmentsIntersect(x1, y1, x2, y2, minX, maxY, maxX, maxY)) return true;
  if (segmentsIntersect(x1, y1, x2, y2, minX, minY, minX, maxY)) return true;
  if (segmentsIntersect(x1, y1, x2, y2, maxX, minY, maxX, maxY)) return true;
  return false;
}

export function projectToScreen(
  point: Vector3,
  camera: { matrixWorldInverse: Matrix4; projectionMatrix: Matrix4 },
  width: number,
  height: number,
): { x: number; y: number; inFront: boolean } {
  const p = new Vector4(point.x, point.y, point.z, 1)
    .applyMatrix4(camera.matrixWorldInverse)
    .applyMatrix4(camera.projectionMatrix);

  const w = Math.abs(p.w) > Number.EPSILON ? p.w : 1;
  const ndcX = p.x / w;
  const ndcY = p.y / w;
  const x = ((ndcX + 1) / 2) * width;
  const y = ((-ndcY + 1) / 2) * height;
  const inFront = p.z <= w && p.z >= -w;
  return { x, y, inFront };
}

export function snapValue(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value;
}

export function snapVector(v: Vector3, step: number): Vector3 {
  return step > 0
    ? new Vector3(snapValue(v.x, step), snapValue(v.y, step), snapValue(v.z, step))
    : v.clone();
}

/** Rond een quaternion af op een raster van hoekstappen (per euler-as). */
export function snapQuaternion(q: Quaternion, stepDeg: number): Quaternion {
  if (stepDeg <= 0) return q.clone();
  const stepRad = (stepDeg * Math.PI) / 180;
  const euler = new Euler().setFromQuaternion(q, 'XYZ');
  euler.x = snapValue(euler.x, stepRad);
  euler.y = snapValue(euler.y, stepRad);
  euler.z = snapValue(euler.z, stepRad);
  return new Quaternion().setFromEuler(euler);
}
