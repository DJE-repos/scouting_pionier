import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Beam, BeamPlacement } from '../src/model/types';
import { pickBeam, solveBeamPlacement } from '../src/model/beamPlacement';
import { beamEndpoints, closestPointsBetweenSegments, quaternionFromDirection, toQuat } from '../src/model/geometry';

const post = (id: string, x: number): Beam => ({
  id, lengthM: 4, diameterMm: 80, position: [x, 2, 0],
  quaternion: toQuat(quaternionFromDirection(new Vector3(0, 1, 0))), stepIndex: 0,
});
const supports = [post('a', 0), post('b', 3)];
const recipe = (): BeamPlacement => ({
  picks: supports.map((beam) => pickBeam(beam, [beam.position[0], 2, -0.04])),
  offsetM: 0, anchor: 'center', linked: false,
});

describe('beam placement', () => {
  it('keeps stock length and creates two radius-aware contacts', () => {
    const result = solveBeamPlacement(4, 80, recipe(), supports);
    expect(result.error).toBeUndefined();
    expect(result.position[0]).toBeCloseTo(1.5);
    expect(result.position[2]).toBeCloseTo(-0.08);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].name).toBe('kruissjorring');
    const ends = beamEndpoints({ ...supports[0], lengthM: 4, ...result });
    expect(ends[0].distanceTo(ends[1])).toBeCloseTo(4);
  });
  it('rejects a stock beam shorter than the span', () => {
    expect(solveBeamPlacement(2, 80, recipe(), supports).error).toContain('langer');
  });
  it('places excess length at either end', () => {
    expect(solveBeamPlacement(4, 80, { ...recipe(), anchor: 'start' }, supports).position[0]).toBeCloseTo(2);
    expect(solveBeamPlacement(4, 80, { ...recipe(), anchor: 'end' }, supports).position[0]).toBeCloseTo(1);
  });
  it('rejects offsets that would lash across a gap', () => {
    expect(solveBeamPlacement(4, 80, { ...recipe(), offsetM: -0.5 }, supports).error).toBeTruthy();
  });
  it('rejects missing and duplicate references', () => {
    expect(solveBeamPlacement(4, 80, recipe(), []).error).toBeTruthy();
    const duplicate = recipe();
    duplicate.picks[1] = duplicate.picks[0];
    expect(solveBeamPlacement(4, 80, duplicate, supports).error).toBeTruthy();
  });
  it('supports a single beam and a fixed-length heading', () => {
    const placement = { ...recipe(), picks: recipe().picks.slice(0, 1), target: [3, 2, 0] as [number, number, number] };
    const result = solveBeamPlacement(4, 80, placement, supports);
    expect(result.error).toBeUndefined();
    expect(result.contacts).toHaveLength(1);
    expect(result.position[0]).toBeCloseTo(2);
  });
  it('allows flipping the contact side without intersecting the support', () => {
    const placement = recipe();
    for (const pick of placement.picks) pick.localNormal = [0, 0, 1];
    const result = solveBeamPlacement(4, 80, placement, supports);
    expect(result.error).toBeUndefined();
    expect(result.position[2]).toBeCloseTo(0.08);
  });
  it('accounts for the new beam diameter', () => {
    const result = solveBeamPlacement(4, 120, recipe(), supports);
    expect(result.error).toBeUndefined();
    expect(result.position[2]).toBeCloseTo(-0.1);
    expect(result.contacts[0].position[2]).toBeCloseTo(-0.04);
  });
  it('converges to tangency for unequal supporting diameters', () => {
    const unequal = [supports[0], { ...supports[1], diameterMm: 120 }];
    const result = solveBeamPlacement(4, 80, recipe(), unequal);
    expect(result.error).toBeUndefined();
    const placed = { ...supports[0], lengthM: 4, diameterMm: 80, ...result };
    for (const support of unequal) {
      const contact = closestPointsBetweenSegments(...beamEndpoints(placed), ...beamEndpoints(support));
      expect(contact.distance).toBeCloseTo((support.diameterMm + 80) / 2000, 6);
    }
  });
  it('allows a shared horizontal offset along finite horizontal supports', () => {
    const beams = supports.map((beam) => ({
      ...beam, position: [beam.position[0], 2, 0] as [number, number, number],
      quaternion: toQuat(quaternionFromDirection(new Vector3(0, 0, 1))),
    }));
    const placement = { ...recipe(), picks: beams.map((beam) => pickBeam(beam, [beam.position[0], 2.04, 0])), offsetM: 0.5 };
    const result = solveBeamPlacement(4, 80, placement, beams);
    expect(result.error).toBeUndefined();
    expect(result.position[2]).toBeCloseTo(0.5);
    expect(result.position[1]).toBeCloseTo(2.08);
  });
  it('places at a reference height and saves adjusted local support points', () => {
    const result = solveBeamPlacement(4, 80, recipe(), supports, 2.04);
    expect(result.error).toBeUndefined();
    expect(result.position[1]).toBeCloseTo(2.04);
    expect(result.picks![0].localPoint[1]).toBeCloseTo(0.04);
    const refitted = solveBeamPlacement(4, 80, { ...recipe(), picks: result.picks! }, supports);
    expect(refitted.position).toEqual(result.position);
  });
  it('rejects a level that is beyond the finite supports', () => {
    expect(solveBeamPlacement(4, 80, recipe(), supports, 5).error).toContain('buiten');
  });
  it('rejects points beyond a shortened support and non-finite inputs', () => {
    const placement = recipe();
    placement.picks[0].localPoint[1] = 3;
    expect(solveBeamPlacement(4, 80, placement, supports).error).toContain('buiten');
    expect(solveBeamPlacement(NaN, 80, recipe(), supports).error).toBeTruthy();
    expect(solveBeamPlacement(4, 80, { ...recipe(), offsetM: Infinity }, supports).error).toBeTruthy();
  });
});