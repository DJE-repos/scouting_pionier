import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { Vector3 } from 'three';
import type {
  AssemblyDef,
  AssemblyInstance,
  AssemblyLibrary,
  Beam,
  ContextObject,
  Lashing,
  LengthAnchor,
  Project,
  ProjectSettings,
  Quat,
  Rope,
  StepTransform,
  Vec3,
  MeasurementType,
} from '../model/types';
import { newProject, ropeLengthFor } from '../model/defaults';
import {
  contactPointForItems,
  resizedCenter,
  toVec3,
  worldToBeamLocal,
  worldToRopeLocal,
} from '../model/geometry';
import { instantiate, resolveModel } from '../model/resolve';

export { instantiate } from '../model/resolve';

export type TransformMode = 'translate' | 'rotate';
export type CameraProjection = 'perspective' | 'orthographic';

interface Snapshot {
  project: Project;
  library: AssemblyLibrary;
}

export interface MultiSelection {
  beamIds?: string[];
  lashingIds?: string[];
  instanceIds?: string[];
  ropeIds?: string[];
  contextObjectIds?: string[];
}

interface EditorState {
  project: Project;
  library: AssemblyLibrary;

  selectedBeamIds: string[];
  selectedLashingIds: string[];
  selectedInstanceIds: string[];
  selectedRopeIds: string[];
  selectedContextObjectIds: string[];

  /** Lengte gekozen in het palet; zolang gezet plaatst een klik een nieuwe balk. */
  pendingLengthM: number | null;
  pendingContextObjectType: ContextObject['type'] | null;
  lengthAnchor: LengthAnchor;
  transformMode: TransformMode;
  boxSelectMode: boolean;
  cameraProjection: CameraProjection;
  /** Toon alleen elementen t/m deze stap; null = alles. */
  previewStep: number | null;
  measurementMode: MeasurementType | null;
  measurementPoints: Vec3[];
  /** Id van de assembly die in de assembly-editor bewerkt wordt. */
  editingAssemblyId: string | null;

  past: Snapshot[];
  future: Snapshot[];

  // --- acties ---
  addBeam: (lengthM: number, position: Vec3, quaternion?: Quat) => string;
  updateBeam: (id: string, patch: Partial<Beam>) => void;
  setBeamLength: (id: string, lengthM: number) => void;
  transformBeam: (id: string, position: Vec3, quaternion: Quat) => void;

  createLashing: (name: string, beamIds?: string[], ropeIds?: string[]) => string | null;
  updateLashing: (id: string, patch: Partial<Lashing>) => void;
  transformLashing: (id: string, position: Vec3) => void;

  createRope: (fromKnotId?: string, toKnotId?: string, name?: string) => string | null;
  updateRope: (id: string, patch: Partial<Rope>) => void;

  addAssemblyInstance: (defId: string, position: Vec3) => void;
  transformInstance: (id: string, position: Vec3, quaternion: Quat) => void;
  explodeInstance: (id: string) => void;
  saveSelectionAsAssembly: (name: string, temporaryMeasure?: boolean) => void;
  deleteAssemblyDef: (id: string) => void;

  deleteSelected: () => void;
  select: (kind: 'beam' | 'lashing' | 'instance' | 'rope' | 'contextObject', id: string, additive: boolean) => void;
  selectMultiple: (selection: MultiSelection, additive?: boolean) => void;
  selectAll: () => void;
  setSelection: (beamIds: string[]) => void;
  clearSelection: () => void;

  setPendingLength: (lengthM: number | null) => void;
  setPendingContextObjectType: (type: ContextObject['type'] | null) => void;
  setLengthAnchor: (anchor: LengthAnchor) => void;
  setTransformMode: (mode: TransformMode) => void;
  setBoxSelectMode: (active: boolean) => void;
  toggleBoxSelect: () => void;
  setCameraProjection: (projection: CameraProjection) => void;
  setPreviewStep: (step: number | null) => void;
  setEditingAssembly: (id: string | null) => void;

  updateSettings: (patch: Partial<ProjectSettings>) => void;
  renameProject: (name: string) => void;
  addStep: (title?: string) => void;
  removeStep: (index: number) => void;
  moveStep: (index: number, direction: 'up' | 'down') => void;
  renameStep: (index: number, title: string) => void;
  setStepDescription: (index: number, description: string) => void;
  setStepIncludeContext: (index: number, includeContext: boolean) => void;
  setStepTemporary: (index: number, temporary: boolean) => void;
  setStepView: (index: number, angles: { azimuthDeg: number; elevationDeg: number } | null) => void;
  assignSelectionToStep: (index: number) => void;
  removeSelectedTemporaryMeasures: (index: number) => void;
  setMeasurementMode: (mode: MeasurementType | null) => void;
  addMeasurementPoint: (point: Vec3) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurementsForStep: (index: number) => void;

  addContextObject: (type: ContextObject['type'], position: Vec3, quaternion?: Quat) => void;
  updateContextObject: (id: string, patch: Partial<ContextObject>) => void;
  transformContextObject: (id: string, position: Vec3, quaternion: Quat) => void;
  removeContextObject: (id: string) => void;

  loadProject: (project: Project) => void;
  loadLibrary: (library: AssemblyLibrary) => void;
  resetProject: () => void;

  commit: () => void;
  undo: () => void;
  redo: () => void;
}

const HISTORY_LIMIT = 100;
const clone = <T,>(value: T): T => structuredClone(value);
const IDENTITY_Q: Quat = [0, 0, 0, 1];

function setStepTransform<T extends { stepTransforms?: StepTransform[] }>(
  item: T,
  stepIndex: number,
  transform: Omit<StepTransform, 'stepIndex'>,
) {
  const existing = item.stepTransforms?.find((entry) => entry.stepIndex === stepIndex);
  if (existing) Object.assign(existing, transform);
  else (item.stepTransforms ??= []).push({ stepIndex, ...transform });
}
export const useEditor = create<EditorState>()(
  immer((set, get) => ({
    project: newProject(),
    library: { defs: [] },
    selectedBeamIds: [],
    selectedLashingIds: [],
    selectedInstanceIds: [],
    selectedRopeIds: [],
    selectedContextObjectIds: [],

    pendingLengthM: null,
    pendingContextObjectType: null,
    lengthAnchor: 'center',
    transformMode: 'translate',
    boxSelectMode: false,
    cameraProjection: 'perspective',
    previewStep: null,
    measurementMode: null,
    measurementPoints: [],
    editingAssemblyId: null,

    past: [],
    future: [],

    addContextObject: (type, position, quaternion = IDENTITY_Q) => {
      get().commit();
      set((s) => {
        const id = crypto.randomUUID();
        const contextObject: ContextObject =
          type === 'building'
            ? { id, type, position, quaternion, widthM: 6, depthM: 4, wallHeightM: 3, roofHeightM: 1.5 }
            : type === 'tree'
              ? { id, type, position, quaternion, trunkDiameterM: 0.3, heightM: 6, crownDiameterM: 4 }
              : { id, type, position, quaternion, heightM: type === 'adult' ? 1.75 : 1.2 };
        s.project.contextObjects.push(contextObject);
        s.selectedBeamIds = [];
        s.selectedLashingIds = [];
        s.selectedInstanceIds = [];
        s.selectedRopeIds = [];
        s.selectedContextObjectIds = [id];
      });
    },

    updateContextObject: (id, patch) => {
      get().commit();
      set((s) => {
        const contextObject = s.project.contextObjects.find((item) => item.id === id);
        if (contextObject) Object.assign(contextObject, patch);
      });
    },

    transformContextObject: (id, position, quaternion) =>
      set((s) => {
        const contextObject = s.project.contextObjects.find((item) => item.id === id);
        if (contextObject) {
          contextObject.position = position;
          contextObject.quaternion = quaternion;
        }
      }),

    removeContextObject: (id) => {
      get().commit();
      set((s) => {
        s.project.contextObjects = s.project.contextObjects.filter((item) => item.id !== id);
      });
    },

    commit: () => {
      const { project, library } = get();
      const snapshot: Snapshot = { project: clone(project), library: clone(library) };
      set((s) => {
        s.past.push(snapshot);
        if (s.past.length > HISTORY_LIMIT) s.past.shift();
        s.future = [];
      });
    },

    undo: () => {
      const { past, project, library } = get();
      if (past.length === 0) return;
      const snapshot: Snapshot = { project: clone(project), library: clone(library) };
      set((s) => {
        const prev = s.past.pop()!;
        s.future.push(snapshot);
        s.project = prev.project;
        s.library = prev.library;
        pruneSelection(s);
      });
    },

    redo: () => {
      const { future, project, library } = get();
      if (future.length === 0) return;
      const snapshot: Snapshot = { project: clone(project), library: clone(library) };
      set((s) => {
        const next = s.future.pop()!;
        s.past.push(snapshot);
        s.project = next.project;
        s.library = next.library;
        pruneSelection(s);
      });
    },

    addBeam: (lengthM, position, quaternion = IDENTITY_Q) => {
      const id = crypto.randomUUID();
      get().commit();
      set((s) => {
        s.project.beams.push({
          id,
          lengthM,
          diameterMm: s.project.settings.defaultDiameterMm,
          position,
          quaternion,
          stepIndex: currentStep(s),
        });
        s.selectedBeamIds = [id];
        s.selectedLashingIds = [];
        s.selectedInstanceIds = [];
        s.selectedRopeIds = [];
      });
      return id;
    },

    updateBeam: (id, patch) => {
      get().commit();
      set((s) => {
        const beam = s.project.beams.find((b) => b.id === id);
        if (beam) Object.assign(beam, patch);
      });
    },

    setBeamLength: (id, lengthM) => {
      get().commit();
      set((s) => {
        const beam = s.project.beams.find((b) => b.id === id);
        if (!beam || lengthM <= 0) return;
        beam.position = resizedCenter(beam, lengthM, s.lengthAnchor);
        beam.lengthM = lengthM;
      });
    },

    // Geen history-commit: wordt tijdens slepen continu aangeroepen.
    transformBeam: (id, position, quaternion) =>
      set((s) => {
        const beam = s.project.beams.find((b) => b.id === id);
        if (!beam) return;
        const stepIndex = currentStep(s);
        if (stepIndex === 0) {
          beam.position = position;
          beam.quaternion = quaternion;
        } else {
          setStepTransform(beam, stepIndex, { position, quaternion });
        }
      }),

    createLashing: (name, beamIds, ropeIds) => {
      const state = get();
      const bIds = beamIds ?? state.selectedBeamIds;
      const rIds = ropeIds ?? state.selectedRopeIds;
      if (bIds.length === 0 && rIds.length === 0) return null;

      const model = resolveModel(state.project, state.library);
      const beams = bIds
        .map((id) => model.beams.find((b) => b.id === id))
        .filter((b): b is NonNullable<typeof b> => Boolean(b));
      const ropes = rIds
        .map((id) => model.ropes.find((r) => r.id === id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));

      if (beams.length === 0 && ropes.length === 0) return null;

      const world = contactPointForItems(beams, ropes);
      const id = crypto.randomUUID();
      let localOffset: Vec3;

      if (beams.length > 0) {
        localOffset = worldToBeamLocal(beams[0], world);
      } else {
        const primaryRope = ropes[0];
        localOffset = worldToRopeLocal(
          new Vector3(...primaryRope.fromPosition),
          new Vector3(...primaryRope.toPosition),
          world,
        );
      }

      state.commit();
      set((s) => {
        s.project.lashings.push({
          id,
          name,
          beamIds: beams.map((b) => b.id),
          ropeIds: ropes.map((r) => r.id),
          localOffset,
          ropeLengthM: ropeLengthFor(name, s.project.settings),
          color: '#e11d48',
          stepIndex: currentStep(s),
        });
        s.selectedLashingIds = [id];
        s.selectedBeamIds = [];
        s.selectedInstanceIds = [];
        s.selectedRopeIds = [];
      });
      return id;
    },

    updateLashing: (id, patch) => {
      get().commit();
      set((s) => {
        const lashing = s.project.lashings.find((l) => l.id === id);
        if (lashing) Object.assign(lashing, patch);
      });
    },

    // Geen history-commit: wordt tijdens slepen continu aangeroepen.
    transformLashing: (id, position) =>
      set((s) => {
        const lashing = s.project.lashings.find((l) => l.id === id);
        if (!lashing) return;
        const model = resolveModel(s.project, s.library, s.previewStep);
        const anchorBeam = lashing.beamIds?.length
          ? model.beams.find((b) => b.id === lashing.beamIds[0])
          : undefined;

        const stepIndex = currentStep(s);
        if (anchorBeam) {
          if (stepIndex === 0) {
            lashing.localOffset = worldToBeamLocal(anchorBeam, new Vector3(...position));
          } else {
            setStepTransform(lashing, stepIndex, { position });
          }
          return;
        }

        const anchorRope = lashing.ropeIds?.length
          ? model.ropes.find((r) => r.id === lashing.ropeIds![0])
          : undefined;

        if (anchorRope) {
          if (stepIndex === 0) {
            lashing.localOffset = worldToRopeLocal(
              new Vector3(...anchorRope.fromPosition),
              new Vector3(...anchorRope.toPosition),
              new Vector3(...position),
            );
          } else {
            setStepTransform(lashing, stepIndex, { position });
          }
        }
      }),

    createRope: (fromKnotId, toKnotId, name = 'Spantouw') => {
      const state = get();
      const kIds =
        fromKnotId && toKnotId ? [fromKnotId, toKnotId] : state.selectedLashingIds;
      if (kIds.length < 2) return null;
      const model = resolveModel(state.project, state.library);
      const knot1 = model.lashings.find((l) => l.id === kIds[0]);
      const knot2 = model.lashings.find((l) => l.id === kIds[1]);
      if (!knot1 || !knot2 || knot1.id === knot2.id) return null;

      const id = crypto.randomUUID();
      state.commit();
      set((s) => {
        if (!s.project.ropes) s.project.ropes = [];
        s.project.ropes.push({
          id,
          name,
          fromKnotId: knot1.id,
          toKnotId: knot2.id,
          diameterMm: 12,
          color: '#d97706',
          extraLengthM: 1,
          stepIndex: currentStep(s),
        });
        s.selectedRopeIds = [id];
        s.selectedLashingIds = [];
        s.selectedBeamIds = [];
        s.selectedInstanceIds = [];
      });
      return id;
    },

    updateRope: (id, patch) => {
      get().commit();
      set((s) => {
        if (!s.project.ropes) s.project.ropes = [];
        const rope = s.project.ropes.find((r) => r.id === id);
        if (rope) Object.assign(rope, patch);
      });
    },

    addAssemblyInstance: (defId, position) => {
      get().commit();
      set((s) => {
        const instance: AssemblyInstance = {
          id: crypto.randomUUID(),
          defId,
          position,
          quaternion: IDENTITY_Q,
          stepIndex: currentStep(s),
        };
        s.project.assemblyInstances.push(instance);
        s.selectedInstanceIds = [instance.id];
        s.selectedBeamIds = [];
        s.selectedLashingIds = [];
        s.selectedRopeIds = [];
      });
    },

    // Geen history-commit: wordt tijdens slepen continu aangeroepen.
    transformInstance: (id, position, quaternion) =>
      set((s) => {
        const instance = s.project.assemblyInstances.find((i) => i.id === id);
        if (!instance) return;
        const stepIndex = currentStep(s);
        if (stepIndex === 0) {
          instance.position = position;
          instance.quaternion = quaternion;
        } else {
          setStepTransform(instance, stepIndex, { position, quaternion });
        }
      }),

    explodeInstance: (id) => {
      const state = get();
      const instance = state.project.assemblyInstances.find((i) => i.id === id);
      const def = instance && state.library.defs.find((d) => d.id === instance.defId);
      if (!instance || !def) return;
      state.commit();
      set((s) => {
        const { beams, lashings, ropes } = instantiate(def, instance);
        s.project.beams.push(...beams.map((beam) => ({ ...beam, temporaryMeasure: def.temporaryMeasure || beam.temporaryMeasure })));
        s.project.lashings.push(...lashings.map((lashing) => ({ ...lashing, temporaryMeasure: def.temporaryMeasure || lashing.temporaryMeasure })));
        if (!s.project.ropes) s.project.ropes = [];
        s.project.ropes.push(...ropes.map((rope) => ({ ...rope, temporaryMeasure: def.temporaryMeasure || rope.temporaryMeasure })));
        s.project.assemblyInstances = s.project.assemblyInstances.filter((i) => i.id !== id);
        s.selectedInstanceIds = [];
        s.selectedBeamIds = beams.map((b) => b.id);
        s.selectedLashingIds = [];
        s.selectedRopeIds = [];
      });
    },

    saveSelectionAsAssembly: (name, temporaryMeasure = false) => {
      const state = get();
      const model = resolveModel(state.project, state.library);
      const beams = model.beams.filter((b) => state.selectedBeamIds.includes(b.id));
      if (beams.length === 0) return;
      const ids = new Set(beams.map((b) => b.id));
      const modelRopes = model.ropes ?? [];
      const selectedRopeSet = new Set(state.selectedRopeIds);
      const lashings = model.lashings.filter(
        (l) =>
          (l.beamIds.length > 0 && l.beamIds.every((bid) => ids.has(bid))) ||
          (l.ropeIds && l.ropeIds.length > 0 && l.ropeIds.every((rid) => selectedRopeSet.has(rid))),
      );
      const knotIds = new Set(lashings.map((l) => l.id));
      const ropes = modelRopes.filter(
        (r) => knotIds.has(r.fromKnotId) && knotIds.has(r.toKnotId),
      );

      // Normaliseer rond het zwaartepunt zodat een instantie logisch geplaatst wordt.
      const center = beams
        .reduce((acc, b) => acc.add(new Vector3(...b.position)), new Vector3())
        .divideScalar(beams.length);

      const idMap = new Map<string, string>();
      const newBeams: Beam[] = beams.map((b) => {
        const newId = crypto.randomUUID();
        idMap.set(b.id, newId);
        return {
          id: newId,
          name: b.name,
          lengthM: b.lengthM,
          diameterMm: b.diameterMm,
          position: toVec3(new Vector3(...b.position).sub(center)),
          quaternion: b.quaternion,
          stepIndex: 0,
          temporaryMeasure: b.temporaryMeasure,
          removedAtStep: b.removedAtStep,
          stepTransforms: b.stepTransforms,
        };
      });

      const ropeIdMap = new Map<string, string>();
      const newRopes: Rope[] = ropes.map((r) => {
        const newRopeId = crypto.randomUUID();
        ropeIdMap.set(r.id, newRopeId);
        return {
          id: newRopeId,
          name: r.name,
          fromKnotId: '',
          toKnotId: '',
          diameterMm: r.diameterMm,
          color: r.color,
          extraLengthM: r.extraLengthM,
          temporaryMeasure: r.temporaryMeasure,
          removedAtStep: r.removedAtStep,
          stepIndex: 0,
        };
      });

      const knotIdMap = new Map<string, string>();
      const newLashings: Lashing[] = lashings.map((l) => {
        const newKnotId = crypto.randomUUID();
        knotIdMap.set(l.id, newKnotId);
        return {
          id: newKnotId,
          name: l.name,
          beamIds: l.beamIds.map((bid) => idMap.get(bid) ?? bid),
          ropeIds: l.ropeIds?.map((rid) => ropeIdMap.get(rid) ?? rid),
          localOffset: l.localOffset,
          ropeLengthM: l.ropeLengthM,
          color: l.color,
          stepIndex: 0,
          temporaryMeasure: l.temporaryMeasure,
          removedAtStep: l.removedAtStep,
          stepTransforms: l.stepTransforms,
        };
      });

      for (let i = 0; i < ropes.length; i++) {
        newRopes[i].fromKnotId = knotIdMap.get(ropes[i].fromKnotId) ?? ropes[i].fromKnotId;
        newRopes[i].toKnotId = knotIdMap.get(ropes[i].toKnotId) ?? ropes[i].toKnotId;
      }

      state.commit();
      set((s) => {
        const def: AssemblyDef = {
          id: crypto.randomUUID(),
          name,
          temporaryMeasure,
          beams: newBeams,
          lashings: newLashings,
          ropes: newRopes,
        };
        s.library.defs.push(def);
      });
    },

    deleteAssemblyDef: (id) => {
      get().commit();
      set((s) => {
        const removedInstanceIds = new Set(
          s.project.assemblyInstances.filter((i) => i.defId === id).map((i) => i.id),
        );
        s.library.defs = s.library.defs.filter((d) => d.id !== id);
        s.project.assemblyInstances = s.project.assemblyInstances.filter((i) => i.defId !== id);

        const removedKnotIds = new Set<string>();
        s.project.lashings = s.project.lashings.filter((l) => {
          const hasRemovedInstance = l.beamIds.some((bid) => {
            const colonIdx = bid.indexOf(':');
            return colonIdx !== -1 && removedInstanceIds.has(bid.slice(0, colonIdx));
          });
          if (hasRemovedInstance) {
            removedKnotIds.add(l.id);
            return false;
          }
          return true;
        });

        if (!s.project.ropes) s.project.ropes = [];
        s.project.ropes = s.project.ropes.filter((r) => {
          if (removedKnotIds.has(r.fromKnotId) || removedKnotIds.has(r.toKnotId)) return false;
          const fromCol = r.fromKnotId.indexOf(':');
          if (fromCol !== -1 && removedInstanceIds.has(r.fromKnotId.slice(0, fromCol))) return false;
          const toCol = r.toKnotId.indexOf(':');
          if (toCol !== -1 && removedInstanceIds.has(r.toKnotId.slice(0, toCol))) return false;
          return true;
        });
      });
    },

    deleteSelected: () => {
      const state = get();
      if (
        state.selectedBeamIds.length === 0 &&
        state.selectedLashingIds.length === 0 &&
        state.selectedInstanceIds.length === 0 &&
        state.selectedRopeIds.length === 0 &&
        state.selectedContextObjectIds.length === 0
      )
        return;
      state.commit();
      set((s) => {
        if (!s.project.ropes) s.project.ropes = [];
        const beamIds = new Set(s.selectedBeamIds);
        s.project.beams = s.project.beams.filter((b) => !beamIds.has(b.id));

        const instanceIds = new Set(s.selectedInstanceIds);
        for (const bId of s.selectedBeamIds) {
          const colonIdx = bId.indexOf(':');
          if (colonIdx !== -1) {
            instanceIds.add(bId.slice(0, colonIdx));
          }
        }

        s.project.assemblyInstances = s.project.assemblyInstances.filter(
          (i) => !instanceIds.has(i.id),
        );

        const selectedRopeIds = new Set(s.selectedRopeIds);
        const removedKnotIds = new Set(s.selectedLashingIds);
        s.project.lashings = s.project.lashings.filter((l) => {
          if (removedKnotIds.has(l.id)) return false;
          for (const bid of l.beamIds) {
            if (beamIds.has(bid)) {
              removedKnotIds.add(l.id);
              return false;
            }
            const colonIdx = bid.indexOf(':');
            if (colonIdx !== -1 && instanceIds.has(bid.slice(0, colonIdx))) {
              removedKnotIds.add(l.id);
              return false;
            }
          }
          for (const rid of l.ropeIds ?? []) {
            if (selectedRopeIds.has(rid)) {
              removedKnotIds.add(l.id);
              return false;
            }
            const colonIdx = rid.indexOf(':');
            if (colonIdx !== -1 && instanceIds.has(rid.slice(0, colonIdx))) {
              removedKnotIds.add(l.id);
              return false;
            }
          }
          return true;
        });

        s.project.ropes = s.project.ropes.filter((r) => {
          if (selectedRopeIds.has(r.id)) return false;
          if (removedKnotIds.has(r.fromKnotId) || removedKnotIds.has(r.toKnotId)) return false;
          const fromCol = r.fromKnotId.indexOf(':');
          if (fromCol !== -1 && instanceIds.has(r.fromKnotId.slice(0, fromCol))) return false;
          const toCol = r.toKnotId.indexOf(':');
          if (toCol !== -1 && instanceIds.has(r.toKnotId.slice(0, toCol))) return false;
          return true;
        });

        const contextObjectIds = new Set(s.selectedContextObjectIds);
        s.project.contextObjects = s.project.contextObjects.filter((item) => !contextObjectIds.has(item.id));

        s.selectedBeamIds = [];
        s.selectedLashingIds = [];
        s.selectedInstanceIds = [];
        s.selectedRopeIds = [];
        s.selectedContextObjectIds = [];
      });
    },

    select: (kind, id, additive) =>
      set((s) => {
        const key =
          kind === 'beam'
            ? 'selectedBeamIds'
            : kind === 'lashing'
              ? 'selectedLashingIds'
              : kind === 'instance'
                ? 'selectedInstanceIds'
                  : kind === 'rope'
                    ? 'selectedRopeIds'
                    : 'selectedContextObjectIds';
        if (!additive) {
          s.selectedBeamIds = [];
          s.selectedLashingIds = [];
          s.selectedInstanceIds = [];
          s.selectedRopeIds = [];
          s.selectedContextObjectIds = [];
          s[key] = [id];
          return;
        }
        s[key] = s[key].includes(id) ? s[key].filter((x) => x !== id) : [...s[key], id];
      }),

    selectMultiple: (selection, additive = false) =>
      set((s) => {
        if (!additive) {
          s.selectedBeamIds = selection.beamIds ?? [];
          s.selectedLashingIds = selection.lashingIds ?? [];
          s.selectedInstanceIds = selection.instanceIds ?? [];
          s.selectedRopeIds = selection.ropeIds ?? [];
          s.selectedContextObjectIds = selection.contextObjectIds ?? [];
          return;
        }
        const beamSet = new Set(s.selectedBeamIds);
        for (const id of selection.beamIds ?? []) beamSet.add(id);
        s.selectedBeamIds = [...beamSet];

        const lashingSet = new Set(s.selectedLashingIds);
        for (const id of selection.lashingIds ?? []) lashingSet.add(id);
        s.selectedLashingIds = [...lashingSet];

        const instanceSet = new Set(s.selectedInstanceIds);
        for (const id of selection.instanceIds ?? []) instanceSet.add(id);
        s.selectedInstanceIds = [...instanceSet];

        const ropeSet = new Set(s.selectedRopeIds);
        for (const id of selection.ropeIds ?? []) ropeSet.add(id);
        s.selectedRopeIds = [...ropeSet];

        const contextObjectSet = new Set(s.selectedContextObjectIds);
        for (const id of selection.contextObjectIds ?? []) contextObjectSet.add(id);
        s.selectedContextObjectIds = [...contextObjectSet];
      }),

    selectAll: () => {
      const state = get();
      const model = resolveModel(state.project, state.library);
      set((s) => {
        s.selectedBeamIds = model.beams.map((beam) => beam.id);
        s.selectedLashingIds = model.lashings.map((lashing) => lashing.id);
        s.selectedInstanceIds = state.project.assemblyInstances.map((instance) => instance.id);
        s.selectedRopeIds = model.ropes.map((rope) => rope.id);
        s.selectedContextObjectIds = state.project.contextObjects.map((item) => item.id);
      });
    },

    setSelection: (beamIds) =>
      set((s) => {
        s.selectedBeamIds = beamIds;
        s.selectedLashingIds = [];
        s.selectedInstanceIds = [];
        s.selectedRopeIds = [];
        s.selectedContextObjectIds = [];
      }),

    clearSelection: () =>
      set((s) => {
        s.selectedBeamIds = [];
        s.selectedLashingIds = [];
        s.selectedInstanceIds = [];
        s.selectedRopeIds = [];
        s.selectedContextObjectIds = [];
      }),

    setPendingLength: (lengthM) =>
      set((s) => {
        s.pendingLengthM = lengthM;
        if (lengthM !== null) s.pendingContextObjectType = null;
      }),

    setPendingContextObjectType: (type) =>
      set((s) => {
        s.pendingContextObjectType = type;
        if (type !== null) s.pendingLengthM = null;
      }),

    setLengthAnchor: (anchor) =>
      set((s) => {
        s.lengthAnchor = anchor;
      }),

    setTransformMode: (mode) =>
      set((s) => {
        s.transformMode = mode;
        s.boxSelectMode = false;
      }),

    setBoxSelectMode: (active) =>
      set((s) => {
        s.boxSelectMode = active;
      }),

    toggleBoxSelect: () =>
      set((s) => {
        s.boxSelectMode = !s.boxSelectMode;
      }),

    setCameraProjection: (projection) =>
      set((s) => {
        s.cameraProjection = projection;
      }),

    setPreviewStep: (step) =>
      set((s) => {
        s.previewStep = step;
        s.measurementMode = null;
        s.measurementPoints = [];
      }),
    setMeasurementMode: (mode) =>
      set((s) => {
        s.measurementMode = mode;
        s.measurementPoints = [];
      }),
    addMeasurementPoint: (point) => {
      const mode = get().measurementMode;
      if (!mode) return;
      get().commit();
      set((s) => {
        const requiredPoints = mode === 'angle' ? 3 : 2;
        s.measurementPoints.push(point);
        if (s.measurementPoints.length < requiredPoints) return;
        s.project.measurements.push({
          id: crypto.randomUUID(),
          type: mode,
          points: s.measurementPoints,
          stepIndex: currentStep(s),
        });
        s.measurementPoints = [];
      });
    },
    removeMeasurement: (id) => {
      get().commit();
      set((s) => {
        s.project.measurements = s.project.measurements.filter((measurement) => measurement.id !== id);
      });
    },
    clearMeasurementsForStep: (index) => {
      get().commit();
      set((s) => {
        s.project.measurements = s.project.measurements.filter((measurement) => measurement.stepIndex !== index);
      });
    },

    setEditingAssembly: (id) =>
      set((s) => {
        s.editingAssemblyId = id;
      }),

    updateSettings: (patch) =>
      set((s) => {
        Object.assign(s.project.settings, patch);
      }),

    renameProject: (name) =>
      set((s) => {
        s.project.name = name;
      }),

    addStep: (title) => {
      get().commit();
      set((s) => {
        const index = s.project.steps.length;
        s.project.steps.push({ index, title: title ?? `Stap ${index}`, includeContext: false });
        s.previewStep = index;
      });
    },

    removeStep: (index) => {
      const state = get();
      if (index <= 0 || index >= state.project.steps.length) return;

      state.commit();
      set((s) => {
        const remap = (stepIndex: number) =>
          stepIndex < index ? stepIndex : stepIndex === index ? index - 1 : stepIndex - 1;

        s.project.steps.splice(index, 1);
        s.project.steps.forEach((step, newIndex) => {
          step.index = newIndex;
        });

        const remapItem = (item: {
          stepIndex: number;
          removedAtStep?: number;
          stepTransforms?: StepTransform[];
        }) => {
          item.stepIndex = remap(item.stepIndex);
          if (item.removedAtStep !== undefined) item.removedAtStep = remap(item.removedAtStep);
          if (item.stepTransforms) {
            item.stepTransforms = item.stepTransforms
              .filter((transform) => transform.stepIndex !== index)
              .map((transform) => ({
                ...transform,
                stepIndex: remap(transform.stepIndex),
              }));
          }
        };

        s.project.beams.forEach(remapItem);
        s.project.lashings.forEach(remapItem);
        s.project.ropes?.forEach(remapItem);
        s.project.assemblyInstances.forEach(remapItem);
        s.project.measurements.forEach((measurement) => {
          measurement.stepIndex = remap(measurement.stepIndex);
        });
        if (s.previewStep !== null) s.previewStep = remap(s.previewStep);
      });
    },

    moveStep: (index, direction) => {
      const state = get();
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (
        index <= 0 ||
        index >= state.project.steps.length ||
        targetIndex <= 0 ||
        targetIndex >= state.project.steps.length
      )
        return;

      state.commit();
      set((s) => {
        const indexMap = new Map<number, number>([
          [index, targetIndex],
          [targetIndex, index],
        ]);
        const remap = (stepIndex: number) => indexMap.get(stepIndex) ?? stepIndex;

        const currentStep = s.project.steps[index];
        s.project.steps[index] = s.project.steps[targetIndex];
        s.project.steps[targetIndex] = currentStep;
        s.project.steps.forEach((step, newIndex) => {
          step.index = newIndex;
        });

        const remapItem = (item: {
          stepIndex: number;
          removedAtStep?: number;
          stepTransforms?: StepTransform[];
        }) => {
          item.stepIndex = remap(item.stepIndex);
          if (item.removedAtStep !== undefined) item.removedAtStep = remap(item.removedAtStep);
          item.stepTransforms?.forEach((transform) => {
            transform.stepIndex = remap(transform.stepIndex);
          });
        };

        s.project.beams.forEach(remapItem);
        s.project.lashings.forEach(remapItem);
        s.project.ropes?.forEach(remapItem);
        s.project.assemblyInstances.forEach(remapItem);
        s.project.measurements.forEach((measurement) => {
          measurement.stepIndex = remap(measurement.stepIndex);
        });
        if (s.previewStep !== null) s.previewStep = remap(s.previewStep);
      });
    },

    renameStep: (index, title) =>
      set((s) => {
        if (index === 0) return;
        const step = s.project.steps.find((st) => st.index === index);
        if (step) step.title = title;
      }),

    setStepDescription: (index, description) =>
      set((s) => {
        const step = s.project.steps.find((st) => st.index === index);
        if (step) step.description = description;
      }),

    setStepIncludeContext: (index, includeContext) => {
      if (index === 0) return;
      get().commit();
      set((s) => {
        const step = s.project.steps.find((st) => st.index === index);
        if (step) step.includeContext = includeContext;
      });
    },

    setStepTemporary: (index, temporary) => {
      if (index === 0) return;
      get().commit();
      set((s) => {
        const step = s.project.steps.find((st) => st.index === index);
        if (step) step.temporary = temporary;
      });
    },

    setStepView: (index, angles) =>
      set((s) => {
        const step = s.project.steps.find((st) => st.index === index);
        if (!step) return;
        step.viewAzimuthDeg = angles?.azimuthDeg;
        step.viewElevationDeg = angles?.elevationDeg;
      }),

    assignSelectionToStep: (index) => {
      get().commit();
      set((s) => {
        for (const beam of s.project.beams) {
          if (s.selectedBeamIds.includes(beam.id)) beam.stepIndex = index;
        }
        for (const lashing of s.project.lashings) {
          if (s.selectedLashingIds.includes(lashing.id)) lashing.stepIndex = index;
        }
        for (const instance of s.project.assemblyInstances) {
          if (s.selectedInstanceIds.includes(instance.id)) instance.stepIndex = index;
        }
        if (s.project.ropes) {
          for (const rope of s.project.ropes) {
            if (s.selectedRopeIds.includes(rope.id)) rope.stepIndex = index;
          }
        }
      });
    },

    removeSelectedTemporaryMeasures: (index) => {
      const state = get();
      const hasSelection =
        state.selectedBeamIds.length > 0 ||
        state.selectedLashingIds.length > 0 ||
        state.selectedRopeIds.length > 0;
      if (!hasSelection) return;
      state.commit();
      set((s) => {
        for (const beam of s.project.beams) {
          if (s.selectedBeamIds.includes(beam.id) && beam.temporaryMeasure) {
            beam.removedAtStep = index;
          }
        }
        for (const lashing of s.project.lashings) {
          if (s.selectedLashingIds.includes(lashing.id) && lashing.temporaryMeasure) {
            lashing.removedAtStep = index;
          }
        }
        for (const rope of s.project.ropes ?? []) {
          if (s.selectedRopeIds.includes(rope.id) && rope.temporaryMeasure) {
            rope.removedAtStep = index;
          }
        }
      });
    },

    loadProject: (project) =>
      set((s) => {
        s.project = project;
        s.past = [];
        s.future = [];
        s.selectedBeamIds = [];
        s.selectedLashingIds = [];
        s.selectedInstanceIds = [];
        s.selectedRopeIds = [];
        s.selectedContextObjectIds = [];
        s.pendingContextObjectType = null;
        s.previewStep = null;
      }),

    loadLibrary: (library) =>
      set((s) => {
        s.library = library;
      }),

    resetProject: () =>
      set((s) => {
        s.project = newProject();
        s.past = [];
        s.future = [];
        s.selectedBeamIds = [];
        s.selectedLashingIds = [];
        s.selectedInstanceIds = [];
        s.selectedRopeIds = [];
        s.selectedContextObjectIds = [];
        s.pendingContextObjectType = null;
      }),
  })),
);

function currentStep(s: EditorState): number {
  return s.previewStep ?? Math.max(0, s.project.steps.length - 1);
}

function pruneSelection(s: EditorState) {
  const model = resolveModel(s.project, s.library);
  const beamIds = new Set(model.beams.map((b) => b.id));
  s.selectedBeamIds = s.selectedBeamIds.filter((id) => beamIds.has(id));
  const lashingIds = new Set(model.lashings.map((l) => l.id));
  s.selectedLashingIds = s.selectedLashingIds.filter((id) => lashingIds.has(id));
  const contextObjectIds = new Set(s.project.contextObjects.map((item) => item.id));
  s.selectedContextObjectIds = s.selectedContextObjectIds.filter((id) => contextObjectIds.has(id));
  const instanceIds = new Set(s.project.assemblyInstances.map((i) => i.id));
  s.selectedInstanceIds = s.selectedInstanceIds.filter((id) => instanceIds.has(id));
  const ropeIds = new Set((model.ropes ?? []).map((r) => r.id));
  s.selectedRopeIds = (s.selectedRopeIds ?? []).filter((id) => ropeIds.has(id));
}
