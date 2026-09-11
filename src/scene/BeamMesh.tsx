import { useMemo } from 'react';
import { Color, Quaternion, Vector3 } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { ResolvedBeam } from '../model/resolve';
import { beamColorHex } from '../model/beamColors';

interface Props {
  beam: ResolvedBeam;
  selected: boolean;
  /** Komt in de actieve bouwstap erbij. */
  highlighted?: boolean;
  /** Staat er al vanaf een eerdere bouwstap. */
  muted?: boolean;
  dimmed?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

const SELECTED = '#38bdf8';

export function BeamMesh({
  beam,
  selected,
  highlighted = false,
  muted = false,
  dimmed = false,
  onPointerDown,
}: Props) {
  const radius = beam.diameterMm / 2000;
  const position = useMemo(() => new Vector3(...beam.position), [beam.position]);
  const quaternion = useMemo(() => new Quaternion(...beam.quaternion), [beam.quaternion]);
  const color = useMemo(() => {
    if (selected) return new Color(SELECTED);
    const base = new Color(beamColorHex(beam.lengthM));
    return muted ? base.multiplyScalar(0.45) : base;
  }, [selected, muted, beam.lengthM]);

  return (
    <mesh
      name={`beam:${beam.id}`}
      position={position}
      quaternion={quaternion}
      castShadow={!dimmed}
      receiveShadow={!dimmed}
      onPointerDown={onPointerDown}
    >
      <cylinderGeometry args={[radius, radius, beam.lengthM, 16]} />
      {/* key forceert een nieuw materiaal; three hercompileert de shader niet als `transparent` wisselt. */}
      <meshStandardMaterial
        key={dimmed ? 'dim' : 'solid'}
        color={color}
        emissive={color}
        emissiveIntensity={highlighted ? 0.45 : 0}
        roughness={0.8}
        metalness={0}
        transparent={dimmed}
        opacity={dimmed ? 0.12 : 1}
        depthWrite={!dimmed}
      />
    </mesh>
  );
}
