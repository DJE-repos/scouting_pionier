import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { Vector3 } from 'three';
import type {
  AssemblyDef,
  AssemblyInstance,
  AssemblyLibrary,
  Beam,
  Lashing,
  LengthAnchor,
  Project,
  ProjectSettings,
  Quat,
  Rope,
  Vec3,
} from '../model/types';
import { newProject, ropeLengthFor } from '../model/defaults';
import { contactPoint, resizedCenter, toVec3, worldToBeamLocal } from '../model/geometry';
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
}

interface EditorState {
  project: Project;
  library: AssemblyLibrary;

  selectedBeamIds: string[];
  selectedLashingIds: string[];
  selectedInstanceIds: string[];
  selectedRopeIds: string[];

  /** Lengte gekozen in het palet; zolang gezet plaatst een klik een nieuwe balk. */
  pendingLengthM: number | null;
  lengthAnchor: LengthAnchor;
  transformMode: TransformMode;
  boxSelectMode: boolean;
  cameraProjection: CameraProjection;
  /** Toon alleen elementen t/m deze stap; null = alles. */
  previewStep: number | null;
  /** Id van de assembly die in de assembly-editor bewerkt wordt. */
  editingAssemblyId: string | null;

  past: Snapshot[];
  future: Snapshot[];

  // --- acties ---
  addBeam: (lengthM: number, position: Vec3, quaternion?: Quat) => string;
  updateBeam: (id: string, patch: Partial<Beam>) => void;
  setBeamLength: (id: string, lengthM: number) => void;
  transformBeam: (id: string, position: Vec3, quaternion: Quat) => void;

  createLashing: (name: string, beamIds?: string[]) => string | null;
  updateLashing: (id: string, patch: Partial<Lashing>) => void;
  transformLashing: (id: string, position: Vec3) => void;

  createRope: (fromKnotId?: string, toKnotId?: string, name?: string) => string | null;
  updateRope: (id: string, patch: Partial<Rope>) => void;

  addAssemblyInstance: (defId: string, position: Vec3) => void;
  transformInstance: (id: string, position: Vec3, quaternion: Quat) => void;
  explodeInstance: (id: string) => void;
  saveSelectionAsAssembly: (name: string) => void;
  deleteAssemblyDef: (id: string) => void;

  deleteSelected: () => void;
  select: (kind: 'beam' | 'lashing' | 'instance' | 'rope', id: string, additive: boolean) => void;
  selectMultiple: (selection: MultiSelection, additive?: boolean) => void;
  selectAll: () => void;
  setSelection: (beamIds: string[]) => void;
  clearSelection: () => void;

  setPendingLength: (lengthM: number | null) => void;
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
  renameStep: (index: number, title: string) => void;
  setStepTemporary: (index: number, temporary: boolean) => void;
  setStepView: (index: number, angles: { azimuthDeg: number; elevationDeg: number } | null) => void;
  assignSelectionToStep: (index: number) => void;

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

export const useEditor = create<EditorState>()(
  immer((set, get) => ({
    project: newProject(),
    library: { defs: [] },

    selectedBeamIds: [],
    selectedLashingIds: [],
    selectedInstanceIds: [],
    selectedRopeIds: [],

    pendingLengthM: null,
    lengthAnchor: 'center',
    transformMode: 'translate',
    boxSelectMode: false,
    cameraProjection: 'perspective',
    previewStep: null,
    editingAssemblyId: null,

    past: [],
    future: [],

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
        beam.position = position;
        beam.quaternion = quaternion;
      }),

    createLashing: (name, beamIds) => {
      const state = get();
      const ids = beamIds ?? state.selectedBeamIds;
      if (ids.length < 1) return null;
      const model = resolveModel(state.project, state.library);
      const beams = ids
        .map((id) => model.beams.find((b) => b.id === id))
        .filter((b): b is NonNullable<typeof b> => Boolean(b));
      if (beams.length < 1) return null;

      const world = contactPoint(beams);
      const id = crypto.randomUUID();
      state.commit();
      set((s) => {
        s.project.lashings.push({
          id,
          name,
          beamIds: beams.map((b) => b.id),
          localOffset: worldToBeamLocal(beams[0], world),
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
        const model = resolveModel(s.project, s.library);
        const anchor = lashing && model.beams.find((b) => b.id === lashing.beamIds[0]);
        if (!lashing || !anchor) return;
        lashing.localOffset = worldToBeamLocal(anchor, new Vector3(...position));
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
        instance.position = position;
        instance.quaternion = quaternion;
      }),

    explodeInstance: (id) => {
      const state = get();
      const instance = state.project.assemblyInstances.find((i) => i.id === id);
      const def = instance && state.library.defs.find((d) => d.id === instance.defId);
      if (!instance || !def) return;
      state.commit();
      set((s) => {
        const { beams, lashings, ropes } = instantiate(def, instance);
        s.project.beams.push(...beams);
        s.project.lashings.push(...lashings);
        if (!s.project.ropes) s.project.ropes = [];
        s.project.ropes.push(...ropes);
        s.project.assemblyInstances = s.project.assemblyInstances.filter((i) => i.id !== id);
        s.selectedInstanceIds = [];
        s.selectedBeamIds = beams.map((b) => b.id);
        s.selectedLashingIds = [];
        s.selectedRopeIds = [];
      });
    },

    saveSelectionAsAssembly: (name) => {
      const state = get();
      const model = resolveModel(state.project, state.library);
      const beams = model.beams.filter((b) => state.selectedBeamIds.includes(b.id));
      if (beams.length === 0) return;
      const ids = new Set(beams.map((b) => b.id));
      const lashings = model.lashings.filter((l) => l.beamIds.every((bid) => ids.has(bid)));
      const knotIds = new Set(lashings.map((l) => l.id));
      const ropes = (model.ropes ?? []).filter(
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
          localOffset: l.localOffset,
          ropeLengthM: l.ropeLengthM,
          color: l.color,
          stepIndex: 0,
        };
      });

      const newRopes: Rope[] = ropes.map((r) => ({
        id: crypto.randomUUID(),
        name: r.name,
        fromKnotId: knotIdMap.get(r.fromKnotId) ?? r.fromKnotId,
        toKnotId: knotIdMap.get(r.toKnotId) ?? r.toKnotId,
        diameterMm: r.diameterMm,
        color: r.color,
        extraLengthM: r.extraLengthM,
        stepIndex: 0,
      }));

      state.commit();
      set((s) => {
        const def: AssemblyDef = {
          id: crypto.randomUUID(),
          name,
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
        state.selectedRopeIds.length === 0
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
          return true;
        });

        const selectedRopeIds = new Set(s.selectedRopeIds);
        s.project.ropes = s.project.ropes.filter((r) => {
          if (selectedRopeIds.has(r.id)) return false;
          if (removedKnotIds.has(r.fromKnotId) || removedKnotIds.has(r.toKnotId)) return false;
          const fromCol = r.fromKnotId.indexOf(':');
          if (fromCol !== -1 && instanceIds.has(r.fromKnotId.slice(0, fromCol))) return false;
          const toCol = r.toKnotId.indexOf(':');
          if (toCol !== -1 && instanceIds.has(r.toKnotId.slice(0, toCol))) return false;
          return true;
        });

        s.selectedBeamIds = [];
        s.selectedLashingIds = [];
        s.selectedInstanceIds = [];
        s.selectedRopeIds = [];
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
                : 'selectedRopeIds';
        if (!additive) {
          s.selectedBeamIds = [];
          s.selectedLashingIds = [];
          s.selectedInstanceIds = [];
          s.selectedRopeIds = [];
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
      }),

    selectAll: () => {
      const state = get();
      const model = resolveModel(state.project, state.library);
      set((s) => {
        s.selectedBeamIds = model.beams.map((beam) => beam.id);
        s.selectedLashingIds = model.lashings.map((lashing) => lashing.id);
        s.selectedInstanceIds = state.project.assemblyInstances.map((instance) => instance.id);
        s.selectedRopeIds = model.ropes.map((rope) => rope.id);
      });
    },

    setSelection: (beamIds) =>
      set((s) => {
        s.selectedBeamIds = beamIds;
        s.selectedLashingIds = [];
        s.selectedInstanceIds = [];
        s.selectedRopeIds = [];
      }),

    clearSelection: () =>
      set((s) => {
        s.selectedBeamIds = [];
        s.selectedLashingIds = [];
        s.selectedInstanceIds = [];
        s.selectedRopeIds = [];
      }),

    setPendingLength: (lengthM) =>
      set((s) => {
        s.pendingLengthM = lengthM;
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
      }),

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
        s.project.steps.push({ index, title: title ?? `Stap ${index + 1}` });
        s.previewStep = index;
      });
    },

    renameStep: (index, title) =>
      set((s) => {
        const step = s.project.steps.find((st) => st.index === index);
        if (step) step.title = title;
      }),

    setStepTemporary: (index, temporary) => {
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

    loadProject: (project) =>
      set((s) => {
        s.project = project;
        s.past = [];
        s.future = [];
        s.selectedBeamIds = [];
        s.selectedLashingIds = [];
        s.selectedInstanceIds = [];
        s.selectedRopeIds = [];
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
  const instanceIds = new Set(s.project.assemblyInstances.map((i) => i.id));
  s.selectedInstanceIds = s.selectedInstanceIds.filter((id) => instanceIds.has(id));
  const ropeIds = new Set((model.ropes ?? []).map((r) => r.id));
  s.selectedRopeIds = (s.selectedRopeIds ?? []).filter((id) => ropeIds.has(id));
}
