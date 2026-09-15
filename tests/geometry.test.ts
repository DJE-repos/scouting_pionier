import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  beamEndpoints,
  closestPointsBetweenSegments,
  contactPoint,
  isPointInScreenBox,
  isSegmentInScreenBox,
  projectToScreen,
  quaternionFromDirection,
  resizedCenter,
  toQuat,
  type ScreenBox,
} from '../src/model/geometry';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import type { Beam } from '../src/model/types';

const beam = (overrides: Partial<Beam> = {}): Beam => ({
  id: 'b',
  lengthM: 4,
  diameterMm: 80,
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  stepIndex: 0,
  ...overrides,
});

describe('beamEndpoints', () => {
  it('legt de eindpunten langs de lokale Y-as', () => {
    const [a, b] = beamEndpoints(beam());
    expect(a.toArray()).toEqual([0, -2, 0]);
    expect(b.toArray()).toEqual([0, 2, 0]);
  });

  it('volgt de rotatie', () => {
    const q = toQuat(quaternionFromDirection(new Vector3(1, 0, 0)));
    const [a, b] = beamEndpoints(beam({ quaternion: q }));
    expect(a.x).toBeCloseTo(-2);
    expect(b.x).toBeCloseTo(2);
  });
});

describe('resizedCenter', () => {
  it('houdt het midden vast', () => {
    expect(resizedCenter(beam(), 8, 'center')).toEqual([0, 0, 0]);
  });

  it('houdt het beginpunt vast', () => {
    const center = resizedCenter(beam(), 8, 'start');
    expect(center[1]).toBeCloseTo(2);
  });

  it('houdt het eindpunt vast', () => {
    const center = resizedCenter(beam(), 8, 'end');
    expect(center[1]).toBeCloseTo(-2);
  });
});

describe('closestPointsBetweenSegments', () => {
  it('vindt de kruisende afstand tussen twee loodrechte lijnstukken', () => {
    const result = closestPointsBetweenSegments(
      new Vector3(-1, 0, 0),
      new Vector3(1, 0, 0),
      new Vector3(0, 1, -1),
      new Vector3(0, 1, 1),
    );
    expect(result.distance).toBeCloseTo(1);
    expect(result.a.toArray()).toEqual([0, 0, 0]);
  });
});

describe('contactPoint', () => {
  it('ligt op het snijpunt van twee kruisende balken', () => {
    const horizontal = beam({
      id: 'h',
      quaternion: toQuat(quaternionFromDirection(new Vector3(1, 0, 0))),
    });
    const vertical = beam({ id: 'v', position: [0, 1, 0] });
    const p = contactPoint([horizontal, vertical]);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);
  });

  it('ligt midden tussen twee balken die elkaar niet raken', () => {
    const lower = beam({
      id: 'l',
      quaternion: toQuat(quaternionFromDirection(new Vector3(1, 0, 0))),
    });
    const upper = beam({
      id: 'u',
      position: [0, 1, 0],
      quaternion: toQuat(quaternionFromDirection(new Vector3(0, 0, 1))),
    });
    expect(contactPoint([lower, upper]).y).toBeCloseTo(0.5);
  });
});

describe('screenBox and drag select helpers', () => {
  const box: ScreenBox = { minX: 100, maxX: 300, minY: 100, maxY: 300 };

  it('detecteert punten binnen en buiten het selectiekader', () => {
    expect(isPointInScreenBox(200, 200, box)).toBe(true);
    expect(isPointInScreenBox(50, 200, box)).toBe(false);
    expect(isPointInScreenBox(200, 350, box)).toBe(false);
  });

  it('detecteert lijnstukken die het selectiekader doorkruisen', () => {
    // Lijnstuk dwars door de box van links naar rechts
    expect(isSegmentInScreenBox(50, 200, 350, 200, box)).toBe(true);
    // Lijnstuk volledig binnen de box
    expect(isSegmentInScreenBox(120, 120, 250, 250, box)).toBe(true);
    // Lijnstuk volledig buiten de box
    expect(isSegmentInScreenBox(10, 10, 50, 50, box)).toBe(false);
  });

  it('projecteert 3D-coordinaten naar 2D-schermcoordinaten', () => {
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const screenPos = projectToScreen(new Vector3(0, 0, 0), camera, 800, 600);
    expect(screenPos.x).toBeCloseTo(400);
    expect(screenPos.y).toBeCloseTo(300);
    expect(screenPos.inFront).toBe(true);
  });

  it('houdt rekening met de perspectiefdeling bij off-center punten', () => {
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const point = new Vector3(2, 0, 0);
    const screenPos = projectToScreen(point, camera, 800, 600);
    const expected = point.clone().project(camera);
    const expectedX = ((expected.x + 1) / 2) * 800;
    const expectedY = ((-expected.y + 1) / 2) * 600;

    expect(screenPos.x).toBeCloseTo(expectedX);
    expect(screenPos.y).toBeCloseTo(expectedY);
    expect(screenPos.inFront).toBe(true);
  });
});
