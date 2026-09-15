import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useEditor } from '../store/projectStore';
import { resolveModel } from '../model/resolve';
import { beamEndpoints, beamLocalToWorld, projectToScreen, ropeLocalToWorld } from '../model/geometry';
import { contrastTextHex } from '../model/beamColors';
import { layoutLabels, type ScreenSegment } from './labelLayout';

interface LabelEntry {
  id: string;
  anchor: Vector3;
  el: HTMLDivElement | null;
  line: SVGLineElement | null;
  width: number;
  height: number;
}

/** Gedeeld tussen de DOM-laag en de projector in de canvas. */
const registry = new Map<string, LabelEntry>();

const GAP_PX = 4;

interface LabelItem {
  id: string;
  text: string;
  color: string;
  anchor: Vector3;
  selected: boolean;
  highlighted: boolean;
}

interface LabelData {
  items: LabelItem[];
  obstacles: [Vector3, Vector3][];
}

function useLabelItems(): LabelData {
  const project = useEditor((s) => s.project);
  const library = useEditor((s) => s.library);
  const previewStep = useEditor((s) => s.previewStep);
  const selectedBeamIds = useEditor((s) => s.selectedBeamIds);
  const selectedLashingIds = useEditor((s) => s.selectedLashingIds);
  const selectedRopeIds = useEditor((s) => s.selectedRopeIds);
  const settings = project.settings;

  return useMemo(() => {
    if (!settings.showLabels) return { items: [], obstacles: [] };
    const model = resolveModel(project, library, previewStep);
    const items: LabelItem[] = [];

    // Knopen die als begin- of eindpunt horen bij geselecteerde touwen
    const endpointKnotIds = new Set<string>();
    if (selectedRopeIds.length > 0) {
      for (const rope of model.ropes) {
        if (selectedRopeIds.includes(rope.id)) {
          if (rope.fromKnotId) endpointKnotIds.add(rope.fromKnotId);
          if (rope.toKnotId) endpointKnotIds.add(rope.toKnotId);
        }
      }
    }

    for (const lashing of model.lashings) {
      if (previewStep === null) {
        if (lashing.temporary) continue;
      } else if (lashing.temporary) {
        if (lashing.stepIndex !== previewStep) continue;
      } else if (lashing.stepIndex > previewStep) {
        continue;
      }
      const selected = selectedLashingIds.includes(lashing.id);
      const isAttachedToSelectedBeam = lashing.beamIds.some((id) => selectedBeamIds.includes(id));
      const isAnchorOfSelectedRope = Boolean(
        lashing.ropeIds && lashing.ropeIds.some((id) => selectedRopeIds.includes(id)),
      );
      const isEndpointOfSelectedRope = endpointKnotIds.has(lashing.id);

      if (
        settings.labelsForSelectionOnly &&
        !selected &&
        !isAttachedToSelectedBeam &&
        !isAnchorOfSelectedRope &&
        !isEndpointOfSelectedRope
      )
        continue;

      let anchorPos: Vector3 | null = null;
      const anchorBeam = lashing.beamIds?.length
        ? model.beams.find((b) => b.id === lashing.beamIds[0])
        : undefined;
      if (anchorBeam) {
        anchorPos = beamLocalToWorld(anchorBeam, lashing.localOffset);
      } else if (lashing.ropeIds && lashing.ropeIds.length > 0) {
        const anchorRope = model.ropes.find((r) => r.id === lashing.ropeIds![0]);
        if (anchorRope) {
          anchorPos = ropeLocalToWorld(
            new Vector3(...anchorRope.fromPosition),
            new Vector3(...anchorRope.toPosition),
            lashing.localOffset,
          );
        }
      }
      if (!anchorPos) continue;

      items.push({
        id: lashing.id,
        text: lashing.name,
        color: lashing.color,
        anchor: anchorPos,
        selected,
        highlighted: previewStep !== null && lashing.stepIndex === previewStep,
      });
    }
    const obstacles: [Vector3, Vector3][] = [
      ...model.beams
        .filter((b) => !b.temporary || b.stepIndex === previewStep)
        .map((beam) => beamEndpoints(beam)),
      ...model.ropes
        .filter((r) => !r.temporary || r.stepIndex === previewStep)
        .map(
          (rope) => [new Vector3(...rope.fromPosition), new Vector3(...rope.toPosition)] as [Vector3, Vector3],
        ),
    ];
    return { items, obstacles };
  }, [project, library, previewStep, selectedBeamIds, selectedLashingIds, selectedRopeIds, settings]);
}

/** DOM-laag over de canvas; staat buiten de Canvas zodat tekst scherp blijft. */
export function KnotLabelLayer() {
  const { items } = useLabelItems();
  const labelScale = useEditor((s) => s.project.settings.labelScale);

  useLayoutEffect(() => {
    const ids = new Set(items.map((i) => i.id));
    for (const id of registry.keys()) if (!ids.has(id)) registry.delete(id);
    for (const entry of registry.values()) {
      if (!entry.el) continue;
      entry.width = entry.el.offsetWidth;
      entry.height = entry.el.offsetHeight;
    }
  }, [items, labelScale]);

  const bind = (item: LabelItem) => (el: HTMLDivElement | null) => {
    const entry = registry.get(item.id) ?? {
      id: item.id,
      anchor: item.anchor,
      el: null,
      line: null,
      width: 0,
      height: 0,
    };
    entry.el = el;
    entry.anchor = item.anchor;
    registry.set(item.id, entry);
  };

  const bindLine = (item: LabelItem) => (line: SVGLineElement | null) => {
    const entry = registry.get(item.id);
    if (entry) entry.line = line;
  };

  return (
    <div className="knot-label-layer" style={{ fontSize: `${12 * labelScale}px` }}>
      <svg className="knot-label-leaders">
        {items.map((item) => (
          <line key={item.id} ref={bindLine(item)} stroke={item.color} strokeWidth={1.5} />
        ))}
      </svg>
      {items.map((item) => (
        <div
          key={item.id}
          ref={bind(item)}
          className={`knot-label${item.selected ? ' knot-label--selected' : ''}${
            item.highlighted ? ' knot-label--new' : ''
          }`}
          style={{ background: item.color, color: contrastTextHex(item.color) }}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
}

/** Projecteert de knopen en schuift labels uit elkaar; hoort binnen de Canvas. */
export function KnotLabelProjector() {
  const { camera, size } = useThree();
  const scratch = useRef(new Vector3());
  const { obstacles } = useLabelItems();

  useFrame(() => {
    const obstacleSegments: ScreenSegment[] = obstacles.flatMap(([from, to]) => {
      const start = projectToScreen(from, camera, size.width, size.height);
      const end = projectToScreen(to, camera, size.width, size.height);
      return start.inFront || end.inFront ? [{ from: { x: start.x, y: start.y }, to: { x: end.x, y: end.y } }] : [];
    });
    const inputs: { id: string; anchor: { x: number; y: number }; width: number; height: number; entry: LabelEntry }[] = [];

    for (const entry of registry.values()) {
      if (!entry.el) continue;
      const ndc = scratch.current.copy(entry.anchor).project(camera);
      if (ndc.z > 1) {
        entry.el.style.visibility = 'hidden';
        if (entry.line) entry.line.style.visibility = 'hidden';
        continue;
      }
      entry.el.style.visibility = 'visible';
      if (entry.line) entry.line.style.visibility = 'visible';

      const anchorX = (ndc.x * 0.5 + 0.5) * size.width;
      const anchorY = (-ndc.y * 0.5 + 0.5) * size.height;
      inputs.push({ id: entry.id, anchor: { x: anchorX, y: anchorY }, width: entry.width, height: entry.height, entry });
    }

    const placements = layoutLabels(inputs, { width: size.width, height: size.height, gap: GAP_PX, obstacles: obstacleSegments });
    for (const item of placements) {
      const entry = registry.get(item.id);
      if (!entry?.el) continue;
      entry.el.style.transform = `translate(${Math.round(item.x)}px, ${Math.round(item.y)}px)`;
      if (entry.line) {
        entry.line.setAttribute('x1', `${item.anchor.x}`);
        entry.line.setAttribute('y1', `${item.anchor.y}`);
        entry.line.setAttribute('x2', `${item.leader.x}`);
        entry.line.setAttribute('y2', `${item.leader.y}`);
      }
    }
  });

  return null;
}
