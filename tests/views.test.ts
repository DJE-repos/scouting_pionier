import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  anglesForStep,
  animationTimelineFrameAtTime,
  anglesAtTimeStep,
  cameraPoseAtTimeStep,
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

  it('kijkt bij het bovenaanzicht recht naar beneden in het Y-up-assenstelsel', () => {
    const { direction, up } = viewOrientation('Bovenaanzicht', angles);
    expect(direction.toArray()).toEqual([0, 1, 0]);
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

  it('normaliseert een willekeurige vector in het Y-up-assenstelsel', () => {
    expect(anglesFromDirection(new Vector3(0, 5, 0))).toEqual({
      azimuthDeg: 0,
      elevationDeg: 90,
    });
    expect(anglesFromDirection(new Vector3(0, 0, 5))).toEqual({
      azimuthDeg: 0,
      elevationDeg: 0,
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

describe('anglesAtTimeStep', () => {
  const settings = defaultSettings();

  it('interpoleert staphoeken en draait azimut langs de kortste kant', () => {
    const steps = [
      { index: 0, title: 'Start', viewAzimuthDeg: 170, viewElevationDeg: 10 },
      { index: 1, title: 'Eind', viewAzimuthDeg: -170, viewElevationDeg: 50 },
    ];

    expect(anglesAtTimeStep(steps, settings, 0.5)).toEqual({
      azimuthDeg: 180,
      elevationDeg: 30,
    });
  });

  it('gebruikt de projecthoeken waar een stap geen eigen aanzicht heeft', () => {
    const steps = [
      { index: 0, title: 'Start', viewAzimuthDeg: 20, viewElevationDeg: 10 },
      { index: 1, title: 'Eind' },
    ];

    expect(anglesAtTimeStep(steps, settings, 0)).toEqual({
      azimuthDeg: 20,
      elevationDeg: 10,
    });
    expect(anglesAtTimeStep(steps, settings, 1)).toEqual({
      azimuthDeg: settings.viewAzimuthDeg,
      elevationDeg: settings.viewElevationDeg,
    });
  });
});

describe('cameraPoseAtTimeStep', () => {
  const settings = defaultSettings();
  const fallback = {
    position: [0, 2, 10] as [number, number, number],
    target: [0, 0, 0] as [number, number, number],
    up: [0, 1, 0] as [number, number, number],
  };

  it('interpola opgeslagen camera-XYZ, kijkdoel en up-richting', () => {
    const steps = [
      {
        index: 0,
        title: 'Start',
        cameraPosition: [10, 5, 3] as [number, number, number],
        cameraTarget: [1, 0, 0] as [number, number, number],
        cameraUp: [0, 1, 0] as [number, number, number],
      },
      {
        index: 1,
        title: 'Eind',
        cameraPosition: [2, 5, 9] as [number, number, number],
        cameraTarget: [1, 1, 0] as [number, number, number],
        cameraUp: [0, 1, 0] as [number, number, number],
      },
    ];

    expect(cameraPoseAtTimeStep(steps, settings, 0.5, fallback)).toEqual({
      position: [6, 5, 6],
      target: [1, 0.5, 0],
      up: [0, 1, 0],
    });
  });

  it('behoudt de laatste XYZ-camera-override in volgende stappen zonder override', () => {
    const steps = [
      {
        index: 0,
        title: 'Start',
        cameraPosition: [8, 5, -3] as [number, number, number],
        cameraTarget: [1, 2, 0] as [number, number, number],
        cameraUp: [0, 0.8, 0.6] as [number, number, number],
      },
      { index: 1, title: 'Volgende stap' },
    ];

    expect(cameraPoseAtTimeStep(steps, settings, 1, fallback)).toEqual({
      position: [8, 5, -3],
      target: [1, 2, 0],
      up: [0, 0.8, 0.6],
    });
  });

  it('leidt een camera af uit de staphoeken als er geen XYZ-override is', () => {
    const steps = [{ index: 0, title: 'Legacy', viewAzimuthDeg: 90, viewElevationDeg: 0 }];

    const position = cameraPoseAtTimeStep(steps, settings, 0, fallback).position;
    expect(position[0]).toBeCloseTo(Math.sqrt(104));
    expect(position[1]).toBeCloseTo(0);
    expect(position[2]).toBeCloseTo(0);
  });
});

describe('animationTimelineFrameAtTime', () => {
  const steps = [
    { index: 0, title: 'Start' },
    { index: 1, title: 'Midden' },
    { index: 2, title: 'Eind' },
  ];

  it('houdt de huidige stap eerst stil voordat de transitie begint', () => {
    expect(animationTimelineFrameAtTime(steps, 0.49)).toMatchObject({
      modelTimeStep: 0,
      bannerStepIndex: 0,
      phase: 'hold',
      transitionProgress: 0,
    });
  });

  it('toont bij de start van de transitie de volgende titel terwijl het model nog start', () => {
    expect(animationTimelineFrameAtTime(steps, 0.5)).toMatchObject({
      modelTimeStep: 0,
      bannerStepIndex: 1,
      phase: 'transition',
      transitionProgress: 0,
    });
  });

  it('eindigt de transitie precies op de stilstaande volgende stap', () => {
    expect(animationTimelineFrameAtTime(steps, 1)).toMatchObject({
      modelTimeStep: 1,
      bannerStepIndex: 1,
      phase: 'hold',
      transitionProgress: 0,
    });
    expect(animationTimelineFrameAtTime(steps, 0.75)).toMatchObject({
      modelTimeStep: 0.5,
      bannerStepIndex: 1,
      phase: 'transition',
      transitionProgress: 0.5,
    });
  });
});
