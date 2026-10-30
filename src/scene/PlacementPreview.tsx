import { Html, Line } from '@react-three/drei';
import { Vector3 } from 'three';
import { solveBeamPlacement } from '../model/beamPlacement';
import { beamLocalToWorld } from '../model/geometry';
import type { Beam, BeamPlacement } from '../model/types';

export function PlacementPreview({ lengthM, diameterMm, placement, beams, levelCenterY }: {
  lengthM: number; diameterMm: number; placement: BeamPlacement; beams: Beam[]; levelCenterY?: number;
}) {
  const result = solveBeamPlacement(lengthM, diameterMm, placement, beams, levelCenterY);
  const color = result.error ? '#dc2626' : '#0f9f74';
  const hasPose = !result.error || result.contacts.length > 0 || result.position.some((value) => value !== 0);
  const points = placement.picks.flatMap((pick) => {
    const source = beams.find((beam) => beam.id === pick.beamId);
    return source ? [beamLocalToWorld(source, pick.localPoint)] : [];
  });
  if (placement.target && points.length === 1) points.push(new Vector3(...placement.target));
  const direction = points.length > 1 ? points[1].clone().sub(points[0]) : new Vector3(1, 0, 0);
  const sideways = new Vector3(-direction.z, 0, direction.x);
  if (sideways.lengthSq() < 1e-8) sideways.set(1, 0, 0);
  sideways.normalize().multiplyScalar(0.5);
  return <group name="editor-helper">
    {hasPose && <mesh position={result.position} quaternion={result.quaternion} raycast={() => null}>
      <cylinderGeometry args={[diameterMm / 2000, diameterMm / 2000, lengthM, 16]} />
      <meshStandardMaterial color={color} transparent opacity={0.55} depthWrite={false} />
    </mesh>}
    {points.length === 2 && <Line points={points} color={color} dashed dashSize={0.08} gapSize={0.04} raycast={() => null} />}
    {points.map((point, index) => <mesh key={index} position={point} raycast={() => null}>
      <sphereGeometry args={[0.07, 12, 8]} /><meshBasicMaterial color="#0284c7" depthTest={false} />
    </mesh>)}
    {result.contacts.map((contact) => <mesh key={contact.beamId} position={contact.position} raycast={() => null}>
      <sphereGeometry args={[0.055, 12, 8]} /><meshBasicMaterial color={color} depthTest={false} />
    </mesh>)}
    {points[0] && <>
      <arrowHelper args={[sideways.clone().normalize(), points[0], 0.5, '#0284c7', 0.12, 0.08]} />
      <Html position={points[0].clone().add(sideways)} style={{ pointerEvents: 'none' }}><span className="level-label">+ offset</span></Html>
    </>}
  </group>;
}