import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Shape } from 'three';
import type { ContextObject } from '../model/types';

export function ContextObjects({
  objects,
  selectedIds,
  onPointerDown,
}: {
  objects: ContextObject[];
  selectedIds: string[];
  onPointerDown: (object: ContextObject, event: ThreeEvent<PointerEvent>) => void;
}) {
  return objects.map((object) => {
    switch (object.type) {
      case 'building':
        return <Building key={object.id} object={object} selected={selectedIds.includes(object.id)} onPointerDown={onPointerDown} />;
      case 'tree':
        return <Tree key={object.id} object={object} selected={selectedIds.includes(object.id)} onPointerDown={onPointerDown} />;
      default:
        return <Person key={object.id} object={object} selected={selectedIds.includes(object.id)} onPointerDown={onPointerDown} />;
    }
  });
}

type ContextMeshProps<T extends ContextObject> = { object: T; selected: boolean; onPointerDown: (object: ContextObject, event: ThreeEvent<PointerEvent>) => void };

function Building({ object, selected, onPointerDown }: ContextMeshProps<Extract<ContextObject, { type: 'building' }>>) {
  const roofShape = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-object.widthM / 2, 0);
    shape.lineTo(-object.widthM / 2, object.wallHeightM);
    shape.lineTo(0, object.wallHeightM + object.roofHeightM);
    shape.lineTo(object.widthM / 2, object.wallHeightM);
    shape.lineTo(object.widthM / 2, 0);
    shape.closePath();
    return shape;
  }, [object.widthM, object.wallHeightM, object.roofHeightM]);

  return (
    <group name="context-object" position={object.position} quaternion={object.quaternion} onPointerDown={(event) => onPointerDown(object, event)}>
      <mesh castShadow receiveShadow position={[0, object.wallHeightM / 2, 0]}>
        <boxGeometry args={[object.widthM, object.wallHeightM, object.depthM]} />
        <meshStandardMaterial color={selected ? '#f4d37d' : '#ddd4c4'} roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0, -object.depthM / 2]} rotation={[0, 0, 0]}>
        <extrudeGeometry args={[roofShape, { depth: object.depthM, bevelEnabled: false }]} />
        <meshStandardMaterial color="#a64632" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Tree({ object, selected, onPointerDown }: ContextMeshProps<Extract<ContextObject, { type: 'tree' }>>) {
  const crownHeight = Math.max(object.crownDiameterM * 0.8, 1);
  const crownCenterY = object.heightM - crownHeight / 2;
  return (
    <group name="context-object" position={object.position} quaternion={object.quaternion} onPointerDown={(event) => onPointerDown(object, event)}>
      <mesh castShadow receiveShadow position={[0, object.heightM * 0.35, 0]}>
        <cylinderGeometry args={[object.trunkDiameterM / 2, object.trunkDiameterM / 2.5, object.heightM * 0.7, 12]} />
        <meshStandardMaterial color="#73513b" roughness={1} />
      </mesh>
      <mesh castShadow position={[0, crownCenterY, 0]} scale={[1, crownHeight / object.crownDiameterM, 1]}>
        <sphereGeometry args={[object.crownDiameterM / 2, 16, 12]} />
        <meshStandardMaterial color={selected ? '#78a83f' : '#3e7b45'} roughness={0.95} />
      </mesh>
    </group>
  );
}

function Person({ object, selected, onPointerDown }: ContextMeshProps<Extract<ContextObject, { type: 'adult' | 'child' }>>) {
  const headRadius = object.heightM * 0.115;
  const bodyHeight = object.heightM - headRadius * 2;
  const bodyRadius = object.heightM * 0.1;
  const bodyColor = object.type === 'adult' ? '#2867a4' : '#e19a2f';
  return (
    <group name="context-object" position={object.position} quaternion={object.quaternion} onPointerDown={(event) => onPointerDown(object, event)}>
      <mesh castShadow position={[0, bodyHeight / 2, 0]}>
        <cylinderGeometry args={[bodyRadius * 0.75, bodyRadius, bodyHeight, 10]} />
        <meshStandardMaterial color={selected ? '#d1495b' : bodyColor} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, object.heightM - headRadius, 0]}>
        <sphereGeometry args={[headRadius, 12, 10]} />
        <meshStandardMaterial color="#e2ad83" roughness={0.9} />
      </mesh>
    </group>
  );
}