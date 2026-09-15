import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Grid, OrbitControls, TransformControls } from '@react-three/drei';
import { Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { useEditor } from '../store/projectStore';
import { resolveModel, resolveStepTransform } from '../model/resolve';
import {
  beamEndpoints,
  beamLocalToWorld,
  isPointInScreenBox,
  isSegmentInScreenBox,
  projectToScreen,
  quaternionFromDirection,
  ropeLocalToWorld,
  snapVector,
  toQuat,
  toVec3,
  type ScreenBox,
} from '../model/geometry';
import { BeamMesh } from './BeamMesh';
import { LashingMarker } from './LashingMarker';
import { RopeMesh } from './RopeMesh';
import { KnotLabelLayer, KnotLabelProjector } from './KnotLabels';
import { MeasurementOverlay } from './MeasurementOverlay';
import { registerCanvas } from './snapshot';
import { MeasurementToolbar } from '../ui/MeasurementToolbar';
import { ContextObjects } from './ContextObjects';
import { GeoContext } from './GeoContext';

export interface DragRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function Viewport() {
  const cameraProjection = useEditor((s) => s.cameraProjection);
  const [dragRect, setDragRect] = useState<DragRect | null>(null);

  return (
    <div className="viewport-stack">
      <Canvas
        key={cameraProjection}
        orthographic={cameraProjection === 'orthographic'}
        shadows
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={
          cameraProjection === 'orthographic'
            ? { position: [8, 8, 8], up: [0, 1, 0], zoom: 65, near: -500, far: 500 }
            : { position: [8, 8, 8], up: [0, 1, 0], fov: 45, near: 0.05, far: 500 }
        }
      >
        <color attach="background" args={['#eef2f6']} />
        <Scene onDragRectChange={setDragRect} />
        <KnotLabelProjector />
      </Canvas>
      <KnotLabelLayer />
      <MeasurementToolbar />
      {dragRect && (
        <div
          className="selection-box"
          style={{
            left: dragRect.left,
            top: dragRect.top,
            width: dragRect.width,
            height: dragRect.height,
          }}
        />
      )}
    </div>
  );
}

function Scene({ onDragRectChange }: { onDragRectChange: (rect: DragRect | null) => void }) {
  const { gl, camera, size, scene } = useThree();
  useEffect(() => registerCanvas(gl, camera, scene), [gl, camera, scene]);

  const project = useEditor((s) => s.project);
  const library = useEditor((s) => s.library);
  const previewStep = useEditor((s) => s.previewStep);
  const selectedBeamIds = useEditor((s) => s.selectedBeamIds);
  const selectedLashingIds = useEditor((s) => s.selectedLashingIds);
  const selectedInstanceIds = useEditor((s) => s.selectedInstanceIds);
  const selectedRopeIds = useEditor((s) => s.selectedRopeIds);
  const selectedContextObjectIds = useEditor((s) => s.selectedContextObjectIds);
  const pendingLengthM = useEditor((s) => s.pendingLengthM);
  const pendingContextObjectType = useEditor((s) => s.pendingContextObjectType);
  const settings = project.settings;

  const model = useMemo(
    () => resolveModel(project, library, previewStep),
    [project, library, previewStep],
  );
  const [gizmoProxy] = useState(() => new Object3D());
  const gizmoControls = useRef<GizmoControls | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);

  const select = useEditor((s) => s.select);
  const clearSelection = useEditor((s) => s.clearSelection);
  const addBeam = useEditor((s) => s.addBeam);
  const addContextObject = useEditor((s) => s.addContextObject);
  const setPendingLength = useEditor((s) => s.setPendingLength);
  const setPendingContextObjectType = useEditor((s) => s.setPendingContextObjectType);
  const addMeasurementPoint = useEditor((s) => s.addMeasurementPoint);

  const handleMeasurementPoint = useCallback((point: Vector3) => {
    if (!useEditor.getState().measurementMode) return false;
    addMeasurementPoint(toVec3(point));
    return true;
  }, [addMeasurementPoint]);

  /** De gizmo luistert rechtstreeks op de canvas; die kliks mogen de scene niet bereiken. */
  const gizmoHasPointer = useCallback(
    () => Boolean(gizmoControls.current?.dragging || gizmoControls.current?.axis),
    [],
  );

  useEffect(() => {
    const canvas = gl.domElement;
    let isDown = false;
    let startX = 0;
    let startY = 0;
    let isAdditive = false;
    let dragStarted = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (gizmoHasPointer()) return;
      if (useEditor.getState().pendingLengthM !== null) return;

      const isBoxMode = useEditor.getState().boxSelectMode;
      const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;

      if (!isModifier && !isBoxMode) return;

      isDown = true;
      dragStarted = false;
      isAdditive = e.shiftKey || e.ctrlKey || e.metaKey;
      const rect = canvas.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDown) return;
      const rect = canvas.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;
      const dx = Math.abs(curX - startX);
      const dy = Math.abs(curY - startY);

      if (!dragStarted && (dx > 4 || dy > 4)) {
        dragStarted = true;
        setIsDragSelecting(true);
      }

      if (dragStarted) {
        onDragRectChange({
          left: Math.min(startX, curX),
          top: Math.min(startY, curY),
          width: Math.abs(curX - startX),
          height: Math.abs(curY - startY),
        });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDown) return;
      isDown = false;

      if (dragStarted) {
        const rect = canvas.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;

        const box: ScreenBox = {
          minX: Math.min(startX, endX),
          maxX: Math.max(startX, endX),
          minY: Math.min(startY, endY),
          maxY: Math.max(startY, endY),
        };

        const store = useEditor.getState();
        const currentModel = resolveModel(store.project, store.library);
        const curPreviewStep = store.previewStep;

        const isItemHidden = (item: { stepIndex: number; temporary: boolean }) =>
          item.temporary ? item.stepIndex !== curPreviewStep : false;

        const matchedBeamIds: string[] = [];
        const matchedLashingIds: string[] = [];
        const matchedRopeIds: string[] = [];

        // 1. Check beams
        for (const beam of currentModel.beams) {
          if (isItemHidden(beam)) continue;
          const [p1, p2] = beamEndpoints(beam);
          const s1 = projectToScreen(p1, camera, size.width, size.height);
          const s2 = projectToScreen(p2, camera, size.width, size.height);

          let inside = false;
          if (s1.inFront && isPointInScreenBox(s1.x, s1.y, box)) inside = true;
          else if (s2.inFront && isPointInScreenBox(s2.x, s2.y, box)) inside = true;
          else if (s1.inFront && s2.inFront && isSegmentInScreenBox(s1.x, s1.y, s2.x, s2.y, box)) {
            inside = true;
          } else {
            for (let t = 0.25; t <= 0.75; t += 0.25) {
              const mid = p1.clone().lerp(p2, t);
              const sm = projectToScreen(mid, camera, size.width, size.height);
              if (sm.inFront && isPointInScreenBox(sm.x, sm.y, box)) {
                inside = true;
                break;
              }
            }
          }

          if (inside) {
            matchedBeamIds.push(beam.id);
          }
        }

        // 2. Check lashings
        for (const lashing of currentModel.lashings) {
          if (isItemHidden(lashing)) continue;
          let worldPos: Vector3 | null = null;
          const anchorBeam = currentModel.beams.find((b) => b.id === lashing.beamIds[0]);
          if (anchorBeam) {
            worldPos = beamLocalToWorld(anchorBeam, lashing.localOffset);
          } else if (lashing.ropeIds && lashing.ropeIds.length > 0) {
            const anchorRope = currentModel.ropes.find((r) => r.id === lashing.ropeIds![0]);
            if (anchorRope) {
              worldPos = ropeLocalToWorld(
                new Vector3(...anchorRope.fromPosition),
                new Vector3(...anchorRope.toPosition),
                lashing.localOffset,
              );
            }
          }
          if (!worldPos) continue;
          const s = projectToScreen(worldPos, camera, size.width, size.height);
          if (s.inFront && isPointInScreenBox(s.x, s.y, box)) {
            matchedLashingIds.push(lashing.id);
          }
        }

        // 3. Check ropes
        for (const rope of currentModel.ropes ?? []) {
          if (isItemHidden(rope)) continue;
          const p1 = new Vector3(...rope.fromPosition);
          const p2 = new Vector3(...rope.toPosition);
          const s1 = projectToScreen(p1, camera, size.width, size.height);
          const s2 = projectToScreen(p2, camera, size.width, size.height);

          let inside = false;
          if (s1.inFront && isPointInScreenBox(s1.x, s1.y, box)) inside = true;
          else if (s2.inFront && isPointInScreenBox(s2.x, s2.y, box)) inside = true;
          else if (s1.inFront && s2.inFront && isSegmentInScreenBox(s1.x, s1.y, s2.x, s2.y, box)) {
            inside = true;
          }

          if (inside) {
            matchedRopeIds.push(rope.id);
          }
        }

        store.selectMultiple(
          {
            beamIds: matchedBeamIds,
            lashingIds: matchedLashingIds,
            ropeIds: matchedRopeIds,
          },
          isAdditive,
        );

        onDragRectChange(null);
        setIsDragSelecting(false);
        dragStarted = false;
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [gl, camera, size, onDragRectChange, gizmoHasPointer]);

  const handleGroundDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (gizmoHasPointer()) return;
      if (handleMeasurementPoint(e.point)) {
        e.stopPropagation();
        return;
      }
      if (pendingLengthM === null && pendingContextObjectType === null) {
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !useEditor.getState().boxSelectMode) {
          clearSelection();
        }
        return;
      }
      e.stopPropagation();
      const p = snapVector(e.point, settings.gridSnapM);
      if (pendingContextObjectType !== null) {
        p.z = 0;
        addContextObject(pendingContextObjectType, toVec3(p));
        setPendingContextObjectType(null);
        return;
      }
      if (pendingLengthM === null) return;
      // Nieuwe balk ligt horizontaal in het maaiveld, rustend op de grond.
      const q = quaternionFromDirection(new Vector3(1, 0, 0));
      p.z = settings.defaultDiameterMm / 2000;
      addBeam(pendingLengthM, toVec3(p), toQuat(q));
      setPendingLength(null);
    },
    [pendingLengthM, pendingContextObjectType, settings.gridSnapM, settings.defaultDiameterMm, addBeam, addContextObject, setPendingLength, setPendingContextObjectType, clearSelection, gizmoHasPointer, handleMeasurementPoint],
  );

  // Voorgebouwde onderdelen (tussenstappen) horen alleen bij hun eigen stap en zijn daarbuiten verborgen.
  const isHidden = (item: { stepIndex: number; temporary: boolean }) =>
    item.temporary ? item.stepIndex !== previewStep : false;
  const isDimmed = (item: { stepIndex: number; temporary: boolean }) =>
    previewStep !== null && item.stepIndex > previewStep;
  const isNew = (stepIndex: number) => previewStep !== null && stepIndex === previewStep;

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[10, 16, 8]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />

      <Grid
        name="grid"
        args={[80, 80]}
        rotation={[0, 0, 0]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#c3ccd6"
        sectionSize={5}
        sectionThickness={1.2}
        sectionColor="#94a3b8"
        infiniteGrid
        fadeDistance={90}
        followCamera={false}
      />

      <GeoContext />

      <mesh
        name="ground"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.001, 0]}
        receiveShadow
        onPointerDown={handleGroundDown}
      >
        <planeGeometry args={[settings.groundSizeM, settings.groundSizeM]} />
        <meshStandardMaterial
          color="#6f9f58"
          roughness={1}
          metalness={0}
          transparent={settings.georeferenceEnabled && settings.georeferenceImagery}
          opacity={settings.georeferenceEnabled && settings.georeferenceImagery ? 0 : 1}
          depthWrite={!(settings.georeferenceEnabled && settings.georeferenceImagery)}
        />
      </mesh>

      <ContextObjects
        objects={project.contextObjects}
        selectedIds={selectedContextObjectIds}
        onPointerDown={(object, event) => {
          if (pendingLengthM !== null || pendingContextObjectType !== null || gizmoHasPointer()) return;
          if (useEditor.getState().boxSelectMode) return;
          event.stopPropagation();
          select('contextObject', object.id, event.shiftKey);
        }}
      />

      {model.beams.map((beam) =>
        isHidden(beam) ? null : (
          <BeamMesh
            key={beam.id}
            beam={beam}
            selected={
              selectedBeamIds.includes(beam.id) ||
              (beam.instanceId ? selectedInstanceIds.includes(beam.instanceId) : false)
            }
            dimmed={isDimmed(beam)}
            highlighted={isNew(beam.stepIndex)}
            muted={previewStep !== null && beam.stepIndex < previewStep}
            onPointerDown={(e) => {
              if (handleMeasurementPoint(e.point)) { e.stopPropagation(); return; }
              if (pendingLengthM !== null || gizmoHasPointer()) return;
              if (useEditor.getState().boxSelectMode) return;
              e.stopPropagation();
              select('beam', beam.id, e.shiftKey);
            }}
          />
        ),
      )}

      {model.lashings.map((lashing) =>
        isHidden(lashing) ? null : (
          <LashingMarker
            key={lashing.id}
            lashing={lashing}
            beams={model.beams}
            ropes={model.ropes}
            selected={selectedLashingIds.includes(lashing.id)}
            dimmed={isDimmed(lashing)}
            highlighted={isNew(lashing.stepIndex)}
            onPointerDown={(e) => {
              if (handleMeasurementPoint(e.point)) { e.stopPropagation(); return; }
              if (gizmoHasPointer()) return;
              if (useEditor.getState().boxSelectMode) return;
              e.stopPropagation();
              select('lashing', lashing.id, e.shiftKey);
            }}
          />
        ),
      )}

      {model.ropes.map((rope) =>
        isHidden(rope) ? null : (
          <RopeMesh
            key={rope.id}
            rope={rope}
            selected={selectedRopeIds.includes(rope.id)}
            dimmed={isDimmed(rope)}
            highlighted={isNew(rope.stepIndex)}
            onPointerDown={(e) => {
              if (handleMeasurementPoint(e.point)) { e.stopPropagation(); return; }
              if (gizmoHasPointer()) return;
              if (useEditor.getState().boxSelectMode) return;
              e.stopPropagation();
              select('rope', rope.id, e.shiftKey);
            }}
          />
        ),
      )}

      <TransformGizmo proxy={gizmoProxy} controlsRef={gizmoControls} />
      <primitive object={gizmoProxy} />
      <MeasurementOverlay />

      <OrbitControls
        enabled={!isDragSelecting}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        maxPolarAngle={Math.PI / 2.02}
      />
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport labelColor="white" axisHeadScale={1} />
      </GizmoHelper>
    </>
  );
}

/** Losse velden van TransformControls die verraden of de gizmo de muis heeft. */
interface GizmoControls {
  dragging: boolean;
  axis: string | null;
}

/**
 * Verplaats-/rotatiegizmo voor een geselecteerde balk of assembly, of een losse knoop.
 * De gizmo hangt aan een hulpobject dat wél in de scene-graph zit; TransformControls
 * vereist een object met een parent, anders breekt updateMatrixWorld.
 */
function TransformGizmo({
  proxy,
  controlsRef,
}: {
  proxy: Object3D;
  controlsRef: RefObject<GizmoControls | null>;
}) {
  const transformMode = useEditor((s) => s.transformMode);
  const boxSelectMode = useEditor((s) => s.boxSelectMode);
  const settings = useEditor((s) => s.project.settings);
  const project = useEditor((s) => s.project);
  const library = useEditor((s) => s.library);
  const selectedBeamIds = useEditor((s) => s.selectedBeamIds);
  const selectedInstanceIds = useEditor((s) => s.selectedInstanceIds);
  const selectedLashingIds = useEditor((s) => s.selectedLashingIds);
  const selectedRopeIds = useEditor((s) => s.selectedRopeIds);
  const selectedContextObjectIds = useEditor((s) => s.selectedContextObjectIds);
  const previewStep = useEditor((s) => s.previewStep);

  const model = useMemo(
    () => resolveModel(project, library, previewStep),
    [project, library, previewStep],
  );

  const beamId =
    selectedBeamIds.length === 1 &&
    selectedInstanceIds.length === 0 &&
    selectedLashingIds.length === 0 &&
    selectedRopeIds.length === 0 &&
    selectedContextObjectIds.length === 0
      ? selectedBeamIds[0]
      : null;

  const resolvedBeam = beamId ? model.beams.find((b) => b.id === beamId) : null;
  const looseBeam =
    resolvedBeam && !resolvedBeam.instanceId
      ? resolvedBeam
      : null;

  const instanceId =
    selectedInstanceIds.length === 1 &&
    selectedBeamIds.length === 0 &&
    selectedLashingIds.length === 0 &&
    selectedRopeIds.length === 0 &&
    selectedContextObjectIds.length === 0
      ? selectedInstanceIds[0]
      : resolvedBeam?.instanceId ?? null;

  const instance = instanceId ? project.assemblyInstances.find((i) => i.id === instanceId) : null;
  const resolvedInstance = instance ? resolveStepTransform(instance, previewStep) : null;

  const lashingId =
    selectedLashingIds.length === 1 &&
    selectedBeamIds.length === 0 &&
    selectedInstanceIds.length === 0 &&
    selectedRopeIds.length === 0 &&
    selectedContextObjectIds.length === 0
      ? selectedLashingIds[0]
      : null;

  const lashing = lashingId ? model.lashings.find((l) => l.id === lashingId) : null;
  const contextObjectId =
    selectedContextObjectIds.length === 1 &&
    selectedBeamIds.length === 0 &&
    selectedInstanceIds.length === 0 &&
    selectedLashingIds.length === 0 &&
    selectedRopeIds.length === 0
      ? selectedContextObjectIds[0]
      : null;
  const contextObject = contextObjectId
    ? project.contextObjects.find((item) => item.id === contextObjectId)
    : null;
  let lashingPosition: Vector3 | null = null;
  if (lashing) {
    const lashingAnchorBeam = model.beams.find((b) => b.id === lashing.beamIds[0]);
    if (lashingAnchorBeam) {
      lashingPosition = beamLocalToWorld(lashingAnchorBeam, lashing.localOffset);
    } else if (lashing.ropeIds && lashing.ropeIds.length > 0) {
      const lashingAnchorRope = model.ropes.find((r) => r.id === lashing.ropeIds![0]);
      if (lashingAnchorRope) {
        lashingPosition = ropeLocalToWorld(
          new Vector3(...lashingAnchorRope.fromPosition),
          new Vector3(...lashingAnchorRope.toPosition),
          lashing.localOffset,
        );
      }
    }
  }

  const dragging = useRef(false);
  const startProxyMatrix = useRef(new Matrix4());
  const startTargets = useRef<
    { type: 'beam' | 'instance'; id: string; position: Vector3; quaternion: Quaternion }[]
  >([]);

  const selectedInstanceIdSet = new Set(selectedInstanceIds);
  for (const id of selectedBeamIds) {
    const colonIndex = id.indexOf(':');
    if (colonIndex !== -1) selectedInstanceIdSet.add(id.slice(0, colonIndex));
  }
  const groupInstances = project.assemblyInstances
    .filter((item) => selectedInstanceIdSet.has(item.id))
    .map((item) => resolveStepTransform(item, previewStep));
  const groupBeams = model.beams.filter(
    (beam) => !beam.instanceId && selectedBeamIds.includes(beam.id),
  );
  const groupTargets = [...groupBeams, ...groupInstances];
  const selectionCount =
    selectedBeamIds.length +
    selectedLashingIds.length +
    selectedInstanceIds.length +
    selectedRopeIds.length;
  const isGroup = groupTargets.length > 1 || (groupTargets.length > 0 && selectionCount > 1);

  const targetItem = looseBeam ?? resolvedInstance ?? contextObject;

  if (boxSelectMode || (!isGroup && !targetItem && !lashingPosition)) return null;

  if (!dragging.current) {
    if (isGroup) {
      const center = groupTargets
        .reduce((sum, item) => sum.add(new Vector3(...item.position)), new Vector3())
        .divideScalar(groupTargets.length);
      proxy.position.copy(center);
      proxy.quaternion.identity();
    } else if (targetItem) {
      proxy.position.set(...targetItem.position);
      proxy.quaternion.set(...targetItem.quaternion);
    } else if (lashingPosition) {
      proxy.position.copy(lashingPosition);
      proxy.quaternion.identity();
    }
    proxy.updateMatrixWorld();
  }

  return (
    <TransformControls
      ref={controlsRef as never}
      object={proxy}
      mode={lashing ? 'translate' : transformMode}
      translationSnap={settings.gridSnapM || null}
      rotationSnap={settings.angleSnapDeg ? (settings.angleSnapDeg * Math.PI) / 180 : null}
      onMouseDown={() => {
        dragging.current = true;
        useEditor.getState().commit();
        if (isGroup) {
          startProxyMatrix.current.copy(proxy.matrixWorld);
          startTargets.current = [
            ...groupBeams.map((item) => ({
              type: 'beam' as const,
              id: item.id,
              position: new Vector3(...item.position),
              quaternion: new Quaternion(...item.quaternion),
            })),
            ...groupInstances.map((item) => ({
              type: 'instance' as const,
              id: item.id,
              position: new Vector3(...item.position),
              quaternion: new Quaternion(...item.quaternion),
            })),
          ];
        }
      }}
      onMouseUp={() => {
        dragging.current = false;
      }}
      onObjectChange={() => {
        const position = toVec3(proxy.position);
        const quaternion = toQuat(proxy.quaternion);
        const store = useEditor.getState();
        if (isGroup) {
          const delta = proxy.matrixWorld.clone().multiply(startProxyMatrix.current.clone().invert());
          for (const target of startTargets.current) {
            const nextPosition = target.position.clone().applyMatrix4(delta);
            const nextQuaternion = new Quaternion()
              .setFromRotationMatrix(delta)
              .multiply(target.quaternion);
            if (target.type === 'beam') {
              store.transformBeam(target.id, toVec3(nextPosition), toQuat(nextQuaternion));
            } else {
              store.transformInstance(target.id, toVec3(nextPosition), toQuat(nextQuaternion));
            }
          }
        } else if (looseBeam) store.transformBeam(looseBeam.id, position, quaternion);
        else if (instance) store.transformInstance(instance.id, position, quaternion);
        else if (lashing) store.transformLashing(lashing.id, position);
        else if (contextObject) store.transformContextObject(contextObject.id, position, quaternion);
      }}
    />
  );
}
