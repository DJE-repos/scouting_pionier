import { Vector3, type Camera, type Scene, type WebGLRenderer } from 'three';

interface CanvasHandle {
  gl: WebGLRenderer;
  camera: Camera;
  scene: Scene;
}

let handle: CanvasHandle | null = null;

export function registerCanvas(gl: WebGLRenderer, camera: Camera, scene: Scene) {
  handle = { gl, camera, scene };
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
