import { useMemo } from 'react';
import { Vector3 } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { beamLocalToWorld } from '../model/geometry';
import type { ResolvedBeam, ResolvedLashing } from '../model/resolve';

interface Props {
  lashing: ResolvedLashing;
  beams: ResolvedBeam[];
  selected: boolean;
  /** Wordt in de actieve bouwstap gelegd. */
  highlighted?: boolean;
  dimmed?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

export function LashingMarker({
  lashing,
  beams,
  selected,
  highlighted = false,
  dimmed = false,
  onPointerDown,
}: Props) {
  const anchor = beams.find((b) => b.id === lashing.beamIds[0]);
  const position = useMemo(
    () => (anchor ? beamLocalToWorld(anchor, lashing.localOffset) : new Vector3()),
    [anchor, lashing.localOffset],
  );

  if (!anchor) return null;

  return (
    <mesh name={`lashing:${lashing.id}`} position={position} onPointerDown={onPointerDown}>
      <sphereGeometry args={[highlighted ? 0.13 : 0.09, 16, 16]} />
      <meshStandardMaterial
        key={dimmed ? 'dim' : 'solid'}
        color={selected ? '#38bdf8' : lashing.color}
        transparent={dimmed}
        opacity={dimmed ? 0.12 : 1}
        depthWrite={!dimmed}
      />
    </mesh>
  );
}
