import { useMemo } from 'react';
import { Quaternion, Vector3 } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { quaternionFromDirection } from '../model/geometry';
import type { ResolvedRope } from '../model/resolve';

interface Props {
  rope: ResolvedRope;
  selected: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

export function RopeMesh({
  rope,
  selected,
  highlighted = false,
  dimmed = false,
  onPointerDown,
}: Props) {
  const { position, quaternion, length, radius } = useMemo(() => {
    const p1 = new Vector3(...rope.fromPosition);
    const p2 = new Vector3(...rope.toPosition);
    const diff = p2.clone().sub(p1);
    const len = diff.length();
    if (len < 0.001) {
      return { position: p1, quaternion: new Quaternion(), length: 0, radius: 0.006 };
    }
    const mid = p1.clone().add(p2).multiplyScalar(0.5);
    const q = quaternionFromDirection(diff);
    const rad = (rope.diameterMm ?? 12) / 2000;
    return { position: mid, quaternion: q, length: len, radius: rad };
  }, [rope.fromPosition, rope.toPosition, rope.diameterMm]);

  if (length < 0.001) return null;

  return (
    <mesh
      name={`rope:${rope.id}`}
      position={position}
      quaternion={quaternion}
      onPointerDown={onPointerDown}
    >
      <cylinderGeometry args={[radius * (highlighted ? 1.4 : 1), radius * (highlighted ? 1.4 : 1), length, 12]} />
      <meshStandardMaterial
        key={dimmed ? 'dim' : 'solid'}
        color={selected ? '#38bdf8' : rope.color ?? '#d97706'}
        roughness={0.7}
        metalness={0.05}
        transparent={dimmed}
        opacity={dimmed ? 0.15 : 1}
        depthWrite={!dimmed}
      />
    </mesh>
  );
}
