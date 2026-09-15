import { useMemo } from 'react';
import { Vector3 } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { beamLocalToWorld, ropeLocalToWorld } from '../model/geometry';
import type { ResolvedBeam, ResolvedLashing, ResolvedRope } from '../model/resolve';

interface Props {
  lashing: ResolvedLashing;
  beams: ResolvedBeam[];
  ropes?: ResolvedRope[];
  selected: boolean;
  /** Wordt in de actieve bouwstap gelegd. */
  highlighted?: boolean;
  dimmed?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

export function LashingMarker({
  lashing,
  beams,
  ropes = [],
  selected,
  highlighted = false,
  dimmed = false,
  onPointerDown,
}: Props) {
  const position = useMemo(() => {
    const anchorBeam = lashing.beamIds?.length
      ? beams.find((b) => b.id === lashing.beamIds[0])
      : undefined;
    if (anchorBeam) {
      return beamLocalToWorld(anchorBeam, lashing.localOffset);
    }
    const anchorRope = lashing.ropeIds?.length
      ? ropes.find((r) => r.id === lashing.ropeIds![0])
      : undefined;
    if (anchorRope) {
      return ropeLocalToWorld(
        new Vector3(...anchorRope.fromPosition),
        new Vector3(...anchorRope.toPosition),
        lashing.localOffset,
      );
    }
    return null;
  }, [lashing, beams, ropes]);

  if (!position) return null;

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
