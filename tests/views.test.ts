import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  anglesForStep,
  anglesFromDirection,
  viewOrientation,
  VIEW_NAMES,
} from '../src/model/views';
import { defaultSettings } from '../src/model/defaults';

const angles = { azimuthDeg: 0, elevationDeg: 30 };

describe('viewOrientation', () => {
  it('kijkt bij het vooraanzicht horizontaal, niet van onderaf', () => {
    for (const azimuthDeg of [0, 45, 90, 180, -120]) {
      const { direction, up } = viewOrientation('Vooraanzicht', { azimuthDeg, elevationDeg: 30 });
      expect(direction.y).toBeCloseTo(0);
      expect(direction.length()).toBeCloseTo(1);
      expect(up.toArray()).toEqual([0, 1, 0]);
    }
  });

  it('kijkt bij het bovenaanzicht recht naar beneden', () => {
    const { direction, up } = viewOrientation('Bovenaanzicht', angles);
    expect(direction.toArray()).toEqual([0, 1, 0]);
    // schermonder wijst naar de kijker van het vooraanzicht
    expect(up.y).toBeCloseTo(0);
    expect(up.dot(viewOrientation('Vooraanzicht', angles).direction)).toBeCloseTo(-1);
  });

  it('volgt de azimut in alle aanzichten', () => {
    const a = { azimuthDeg: 90, elevationDeg: 20 };
    const iso = viewOrientation('Isometrisch', a).direction;
    expect(Math.atan2(iso.x, iso.z) * (180 / Math.PI)).toBeCloseTo(90);

    // boven- en vooraanzicht staan een kwartslag van het isometrische beeld af
    const front = viewOrientation('Vooraanzicht', a).direction;
    expect(Math.atan2(front.x, front.z) * (180 / Math.PI)).toBeCloseTo(45);
  });

  it('kijkt bij de standaardhoek recht langs de assen', () => {
    const front = viewOrientation('Vooraanzicht', { azimuthDeg: 45, elevationDeg: 30 }).direction;
    expect(front.x).toBeCloseTo(0);
    expect(front.z).toBeCloseTo(1);

    const top = viewOrientation('Bovenaanzicht', { azimuthDeg: 45, elevationDeg: 30 });
    expect(top.up.z).toBeCloseTo(-1);
    expect(top.up.x).toBeCloseTo(0);
  });

  it('zet de opgegeven hoogte om in het isometrische beeld', () => {
    const { direction } = viewOrientation('Isometrisch', { azimuthDeg: 30, elevationDeg: 45 });
    expect((Math.asin(direction.y) * 180) / Math.PI).toBeCloseTo(45);
  });

  it('geeft voor elk aanzicht een eenheidsrichting met een loodrechte up', () => {
    for (const view of VIEW_NAMES) {
      const { direction, up } = viewOrientation(view, { azimuthDeg: 37, elevationDeg: 25 });
      expect(direction.length()).toBeCloseTo(1);
      expect(up.length()).toBeCloseTo(1);
      expect(Math.abs(direction.dot(up))).toBeLessThan(0.999);
    }
  });
});

describe('anglesFromDirection', () => {
  it('is het omgekeerde van viewOrientation', () => {
    for (const input of [
      { azimuthDeg: 0, elevationDeg: 0 },
      { azimuthDeg: 45, elevationDeg: 30 },
      { azimuthDeg: -120, elevationDeg: 60 },
    ]) {
      const { direction } = viewOrientation('Isometrisch', input);
      expect(anglesFromDirection(direction)).toEqual(input);
    }
  });

  it('normaliseert een willekeurige vector', () => {
    expect(anglesFromDirection(new Vector3(0, 5, 0))).toEqual({
      azimuthDeg: 0,
      elevationDeg: 90,
    });
  });
});

describe('anglesForStep', () => {
  const settings = defaultSettings();

  it('valt terug op de projectinstelling', () => {
    expect(anglesForStep({ index: 0, title: 'x' }, settings)).toEqual({
      azimuthDeg: settings.viewAzimuthDeg,
      elevationDeg: settings.viewElevationDeg,
    });
  });

  it('gebruikt de eigen hoek van de stap als die er is', () => {
    const step = { index: 0, title: 'x', viewAzimuthDeg: 90, viewElevationDeg: 10 };
    expect(anglesForStep(step, settings)).toEqual({ azimuthDeg: 90, elevationDeg: 10 });
  });
});
