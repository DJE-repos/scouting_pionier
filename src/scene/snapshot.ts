import { Vector3, type Camera, type Scene, type WebGLRenderer } from 'three';
import type { CameraPose, Vec3 } from '../model/types';

interface CanvasHandle {
  gl: WebGLRenderer;
  camera: Camera;
  scene: Scene;
  getTarget: () => Vector3 | null;
}

let handle: CanvasHandle | null = null;

export function registerCanvas(
  gl: WebGLRenderer,
  camera: Camera,
  scene: Scene,
  getTarget: () => Vector3 | null,
) {
  handle = { gl, camera, scene, getTarget };
}

export function getCanvasHandle(): CanvasHandle | null {
  return handle;
}

/** Rendert de huidige scene opnieuw en geeft een PNG data-URL terug. */
export function captureView(): string | null {
  if (!handle) return null;
  handle.gl.render(handle.scene, handle.camera);
  return handle.gl.domElement.toDataURL('image/png');
}

/** Kijkrichting van de huidige camera, van het model naar de camera toe. */
export function currentViewDirection(): Vector3 | null {
  if (!handle) return null;
  return handle.camera.getWorldDirection(new Vector3()).negate();
}

export function currentCameraPose(): CameraPose | null {
  if (!handle) return null;
  const position = handle.camera.getWorldPosition(new Vector3());
  const target = handle.getTarget();
  if (!target) return null;
  return {
    position: position.toArray() as Vec3,
    target: target.toArray() as Vec3,
    up: handle.camera.up.toArray() as Vec3,
  };
}
