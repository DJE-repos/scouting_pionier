import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import type { BuildStep } from '../model/types';

const BANNER_WIDTH = 1200;
const BANNER_HEIGHT = 184;

interface Props {
  step: BuildStep | undefined;
  visible: boolean;
}

export function StepBanner({ step, visible }: Props) {
  const { camera } = useThree();
  const meshRef = useRef<Mesh>(null);
  const resources = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = BANNER_WIDTH;
    canvas.height = BANNER_HEIGHT;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({
      map: texture,
      side: DoubleSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new Mesh(new PlaneGeometry(1, 1), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10_000;
    return { canvas, texture, material, mesh };
  }, []);

  useEffect(() => {
    meshRef.current = resources.mesh;
    return () => {
      resources.mesh.geometry.dispose();
      resources.material.dispose();
      resources.texture.dispose();
      meshRef.current = null;
    };
  }, [resources]);

  useEffect(() => {
    const context = resources.canvas.getContext('2d');
    if (!context) return;

    context.clearRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    if (!visible || !step) {
      resources.texture.needsUpdate = true;
      return;
    }

    context.fillStyle = 'rgba(20, 43, 40, 0.94)';
    context.beginPath();
    context.roundRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT, 20);
    context.fill();
    context.fillStyle = '#78d7bd';
    context.fillRect(0, 24, 7, BANNER_HEIGHT - 48);

    const title = step.index === 0 ? step.title : `${step.index}. ${step.title}`;
    context.fillStyle = '#f4faf7';
    context.font = '700 42px Segoe UI, sans-serif';
    context.textBaseline = 'middle';
    context.fillText(title, 40, step.description?.trim() ? 66 : 92, BANNER_WIDTH - 80);

    const description = step.description?.trim();
    if (description) {
      context.fillStyle = '#d2e1dc';
      context.font = '400 25px Segoe UI, sans-serif';
      drawWrappedText(context, description, 42, 124, BANNER_WIDTH - 84, 30, 2);
    }

    resources.texture.needsUpdate = true;
  }, [resources, step, visible]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.visible = visible && step !== undefined;

    const distance = 1.2;
    let visibleWidth: number;
    let visibleHeight: number;
    if (camera instanceof PerspectiveCamera) {
      const viewSize = camera.getViewSize(distance, new Vector2());
      visibleWidth = viewSize.x;
      visibleHeight = viewSize.y;
    } else if (camera instanceof OrthographicCamera) {
      visibleWidth = (camera.right - camera.left) / camera.zoom;
      visibleHeight = (camera.top - camera.bottom) / camera.zoom;
    } else {
      return;
    }

    const width = visibleWidth * 0.68;
    const height = width * (BANNER_HEIGHT / BANNER_WIDTH);
    mesh.scale.set(width, height, 1);
    camera.updateMatrixWorld();
    const localPosition = new Vector3(
      0,
      visibleHeight / 2 - height / 2 - visibleHeight * 0.03,
      -distance,
    );
    mesh.position.copy(camera.localToWorld(localPosition));
    mesh.quaternion.copy(camera.getWorldQuaternion(new Quaternion()));
  });

  return <primitive object={resources.mesh} />;
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (line && context.measureText(nextLine).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  }
  if (line) lines.push(line);

  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let lastLine = visibleLines[maxLines - 1];
    while (lastLine.length > 0 && context.measureText(`${lastLine}...`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1);
    }
    visibleLines[maxLines - 1] = `${lastLine.trimEnd()}...`;
  }

  visibleLines.forEach((lineText, index) => {
    context.fillText(lineText, x, y + index * lineHeight, maxWidth);
  });
}