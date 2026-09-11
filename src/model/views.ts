import { Vector3 } from 'three';
import type { BuildStep, ProjectSettings } from './types';

export type ViewName = 'Isometrisch' | 'Bovenaanzicht' | 'Vooraanzicht';
export const VIEW_NAMES: ViewName[] = ['Isometrisch', 'Bovenaanzicht', 'Vooraanzicht'];

export interface ViewAngles {
  azimuthDeg: number;
  elevationDeg: number;
}

export interface ViewOrientation {
  /** Richting van het model naar de camera. */
  direction: Vector3;
  up: Vector3;
}

const deg = (d: number) => (d * Math.PI) / 180;

/**
 * De azimut is die van het isometrische beeld. Het boven- en vooraanzicht staan daar een
 * kwartslag vanaf, zodat ze recht op de constructie kijken terwijl het isometrische beeld
 * er schuin op staat. Bij de standaard van 45° zijn beide aanzichten dus assenparallel.
 */
const ORTHO_AZIMUTH_OFFSET = -45;

export function viewOrientation(view: ViewName, angles: ViewAngles): ViewOrientation {
  if (view === 'Isometrisch') {
    const a = deg(angles.azimuthDeg);
    const e = deg(Math.max(-85, Math.min(85, angles.elevationDeg)));
    const direction = new Vector3(Math.sin(a), 0, Math.cos(a))
      .multiplyScalar(Math.cos(e))
      .setY(Math.sin(e))
      .normalize();
    return { direction, up: new Vector3(0, 1, 0) };
  }

  const a = deg(angles.azimuthDeg + ORTHO_AZIMUTH_OFFSET);
  const horizontal = new Vector3(Math.sin(a), 0, Math.cos(a));

  if (view === 'Bovenaanzicht') {
    // Schermonder wijst naar de kijker van het vooraanzicht.
    return { direction: new Vector3(0, 1, 0), up: horizontal.clone().negate() };
  }
  return { direction: horizontal, up: new Vector3(0, 1, 0) };
}

/** Hoeken van een stap, met terugval op de projectinstelling. */
export function anglesForStep(step: BuildStep | undefined, settings: ProjectSettings): ViewAngles {
  return {
    azimuthDeg: step?.viewAzimuthDeg ?? settings.viewAzimuthDeg,
    elevationDeg: step?.viewElevationDeg ?? settings.viewElevationDeg,
  };
}

/** Leidt azimut en hoogte af uit een kijkrichting (van model naar camera). */
export function anglesFromDirection(direction: Vector3): ViewAngles {
  const d = direction.clone().normalize();
  return {
    azimuthDeg: Math.round((Math.atan2(d.x, d.z) * 180) / Math.PI),
    elevationDeg: Math.round((Math.asin(Math.max(-1, Math.min(1, d.y))) * 180) / Math.PI),
  };
}

export function formatAngles(angles: ViewAngles): string {
  return `${angles.azimuthDeg}° / ${angles.elevationDeg}°`;
}
