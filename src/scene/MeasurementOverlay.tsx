import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { Vector3 } from 'three';
import { useEditor } from '../store/projectStore';
import type { Measurement, MeasurementType, Vec3 } from '../model/types';

const COLOR = '#0f766e';

function formatDistance(value: number) {
  return `${value.toFixed(2).replace('.', ',')} m`;
}

function pointsFor(measurement: Measurement) {
  const points = measurement.points.map((point) => new Vector3(...point));
  if (measurement.type !== 'height') return { lines: [points], label: points[0].clone().lerp(points[1], 0.5) };

  const base = points[0].clone();
  const top = points[1].clone();
  const projectedTop = new Vector3(top.x, base.y, top.z);
  return {
    lines: [[base, projectedTop], [top, projectedTop]],
    label: projectedTop.clone().lerp(top, 0.5).add(new Vector3(0.12, 0, 0)),
  };
}

function measureLabel(type: MeasurementType, points: Vector3[]) {
  if (type === 'angle') {
    const first = points[0].clone().sub(points[1]).normalize();
    const second = points[2].clone().sub(points[1]).normalize();
    return `${(Math.acos(Math.max(-1, Math.min(1, first.dot(second)))) * 180 / Math.PI).toFixed(1)}°`;
  }
  return formatDistance(
    type === 'height'
      ? Math.abs(points[1].y - points[0].y)
      : points[0].distanceTo(points[1]),
  );
}

function AngleMeasurement({ measurement }: { measurement: Measurement }) {
  const points = measurement.points.map((point) => new Vector3(...point));
  const vertex = points[1];
  const first = points[0].clone().sub(vertex).normalize();
  const second = points[2].clone().sub(vertex).normalize();
  const angle = Math.acos(Math.max(-1, Math.min(1, first.dot(second))));
  const radius = Math.min(points[0].distanceTo(vertex), points[2].distanceTo(vertex), 0.7) * 0.55;
  const arc = Array.from({ length: 17 }, (_, index) =>
    vertex.clone().add(first.clone().applyAxisAngle(first.clone().cross(second).normalize(), angle * index / 16).multiplyScalar(radius)),
  );
  return (
    <>
      <Line points={arc} color={COLOR} lineWidth={2} />
      <Line points={points} color={COLOR} lineWidth={1.5} />
      <Html position={vertex.clone().add(first.clone().add(second).normalize().multiplyScalar(radius + 0.16))} center>
        <span className="measurement-label">{measureLabel('angle', points)}</span>
      </Html>
    </>
  );
}

function MeasurementItem({ measurement }: { measurement: Measurement }) {
  if (measurement.type === 'angle') return <AngleMeasurement measurement={measurement} />;
  const points = measurement.points.map((point) => new Vector3(...point));
  const geometry = pointsFor(measurement);
  return (
    <>
      {geometry.lines.map((line, index) => <Line key={index} points={line} color={COLOR} lineWidth={2} />)}
      <Html position={geometry.label} center>
        <span className="measurement-label">{measureLabel(measurement.type, points)}</span>
      </Html>
    </>
  );
}

export function MeasurementOverlay() {
  const project = useEditor((state) => state.project);
  const previewStep = useEditor((state) => state.previewStep);
  const measurementPoints = useEditor((state) => state.measurementPoints);
  const measurementMode = useEditor((state) => state.measurementMode);
  const activeStep = previewStep ?? Math.max(0, project.steps.length - 1);
  const measurements = useMemo(
    () => project.measurements.filter((measurement) => measurement.stepIndex === activeStep),
    [project.measurements, activeStep],
  );
  return (
    <group name="measurement-overlay">
      {measurements.map((measurement) => <MeasurementItem key={measurement.id} measurement={measurement} />)}
      {measurementMode && measurementPoints.length > 0 && (
        <Line points={measurementPoints.map((point: Vec3) => new Vector3(...point))} color="#f59e0b" lineWidth={2} dashed />
      )}
    </group>
  );
}