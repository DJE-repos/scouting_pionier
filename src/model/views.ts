import { Vector3 } from 'three';
import type { BuildStep, CameraPose, ProjectSettings, Vec3 } from './types';

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
const STEP_HOLD_FRACTION = 0.5;

export interface AnimationTimelineFrame {
  modelTimeStep: number;
  bannerStepIndex: number;
  phase: 'hold' | 'transition';
  transitionProgress: number;
}

/** Each step interval is split into a one-second hold and a one-second transition. */
export function animationTimelineFrameAtTime(
  steps: BuildStep[],
  timeStep: number,
): AnimationTimelineFrame {
  const lastIndex = Math.max(0, ...steps.map((step) => step.index));
  const time = Math.max(0, Math.min(lastIndex, Number.isFinite(timeStep) ? timeStep : 0));
  const fromIndex = Math.floor(time);
  const toIndex = Math.min(lastIndex, fromIndex + 1);
  const intervalProgress = time - fromIndex;

  if (fromIndex === toIndex || intervalProgress < STEP_HOLD_FRACTION) {
    return {
      modelTimeStep: fromIndex,
      bannerStepIndex: fromIndex,
      phase: 'hold',
      transitionProgress: 0,
    };
  }

  const transitionProgress = (intervalProgress - STEP_HOLD_FRACTION) / (1 - STEP_HOLD_FRACTION);
  return {
    modelTimeStep: fromIndex + transitionProgress,
    bannerStepIndex: toIndex,
    phase: 'transition',
    transitionProgress,
  };
}

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

/** Interpoleert de stapaanzichten op een fractionele plek in de animatietijdlijn. */
export function anglesAtTimeStep(
  steps: BuildStep[],
  settings: ProjectSettings,
  timeStep: number,
): ViewAngles {
  const lastIndex = Math.max(0, ...steps.map((step) => step.index));
  const time = Math.max(0, Math.min(lastIndex, Number.isFinite(timeStep) ? timeStep : 0));
  const fromIndex = Math.floor(time);
  const toIndex = Math.min(lastIndex, fromIndex + 1);
  const progress = time - fromIndex;
  const from = anglesForStep(steps.find((step) => step.index === fromIndex), settings);
  const to = anglesForStep(steps.find((step) => step.index === toIndex), settings);
  const azimuthDelta = ((to.azimuthDeg - from.azimuthDeg + 540) % 360) - 180;

  return {
    azimuthDeg: from.azimuthDeg + azimuthDelta * progress,
    elevationDeg: from.elevationDeg + (to.elevationDeg - from.elevationDeg) * progress,
  };
}

/** Geeft de camera-pose op een fractionele tijd, met legacy-hoeken als terugval. */
export function cameraPoseAtTimeStep(
  steps: BuildStep[],
  settings: ProjectSettings,
  timeStep: number,
  fallback: CameraPose,
): CameraPose {
  const lastIndex = Math.max(0, ...steps.map((step) => step.index));
  const time = Math.max(0, Math.min(lastIndex, Number.isFinite(timeStep) ? timeStep : 0));
  const fromIndex = Math.floor(time);
  const toIndex = Math.min(lastIndex, fromIndex + 1);
  const progress = time - fromIndex;
  const distance = new Vector3(...fallback.position).distanceTo(new Vector3(...fallback.target));

  const poseFor = (index: number): CameraPose => {
    const step = steps.find((item) => item.index === index);
    const storedPoseStep = steps
      .filter((item) => item.index <= index && item.cameraPosition && item.cameraTarget)
      .sort((a, b) => b.index - a.index)[0];
    if (storedPoseStep?.cameraPosition && storedPoseStep.cameraTarget) {
      return {
        position: storedPoseStep.cameraPosition,
        target: storedPoseStep.cameraTarget,
        up: storedPoseStep.cameraUp ?? fallback.up,
      };
    }

    const orientation = viewOrientation('Isometrisch', anglesForStep(step, settings));
    const target = new Vector3(...fallback.target);
    return {
      position: target
        .addScaledVector(orientation.direction, distance)
        .toArray() as Vec3,
      target: fallback.target,
      up: orientation.up.toArray() as Vec3,
    };
  };

  const from = poseFor(fromIndex);
  const to = poseFor(toIndex);
  const interpolate = (start: Vec3, end: Vec3): Vec3 =>
    new Vector3(...start).lerp(new Vector3(...end), progress).toArray() as Vec3;

  return {
    position: interpolate(from.position, to.position),
    target: interpolate(from.target, to.target),
    up: new Vector3(...interpolate(from.up, to.up)).normalize().toArray() as Vec3,
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
