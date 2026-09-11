import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useEditor } from '../store/projectStore';
import { resolveModel } from '../model/resolve';
import { beamLocalToWorld } from '../model/geometry';
import { contrastTextHex } from '../model/beamColors';

interface LabelEntry {
  anchor: Vector3;
  el: HTMLDivElement | null;
  line: SVGLineElement | null;
  width: number;
  height: number;
}

/** Gedeeld tussen de DOM-laag en de projector in de canvas. */
const registry = new Map<string, LabelEntry>();

const BASE_OFFSET_PX = 26;
const GAP_PX = 4;

interface LabelItem {
  id: string;
  text: string;
  color: string;
  anchor: Vector3;
  selected: boolean;
  highlighted: boolean;
}

function useLabelItems(): LabelItem[] {
  const project = useEditor((s) => s.project);
  const library = useEditor((s) => s.library);
  const previewStep = useEditor((s) => s.previewStep);
  const selectedBeamIds = useEditor((s) => s.selectedBeamIds);
  const selectedLashingIds = useEditor((s) => s.selectedLashingIds);
  const settings = project.settings;

  return useMemo(() => {
    if (!settings.showLabels) return [];
    const model = resolveModel(project, library);
    const items: LabelItem[] = [];

    for (const lashing of model.lashings) {
      if (previewStep === null) {
        if (lashing.temporary) continue;
      } else if (lashing.temporary) {
        if (lashing.stepIndex !== previewStep) continue;
      } else if (lashing.stepIndex > previewStep) {
        continue;
      }
      const selected = selectedLashingIds.includes(lashing.id);
      if (
        settings.labelsForSelectionOnly &&
        !selected &&
        !lashing.beamIds.some((id) => selectedBeamIds.includes(id))
      )
        continue;

      const anchorBeam = model.beams.find((b) => b.id === lashing.beamIds[0]);
      if (!anchorBeam) continue;

      items.push({
        id: lashing.id,
        text: lashing.name,
        color: lashing.color,
        anchor: beamLocalToWorld(anchorBeam, lashing.localOffset),
        selected,
        highlighted: previewStep !== null && lashing.stepIndex === previewStep,
      });
    }
    return items;
  }, [project, library, previewStep, selectedBeamIds, selectedLashingIds, settings]);
}

/** DOM-laag over de canvas; staat buiten de Canvas zodat tekst scherp blijft. */
export function KnotLabelLayer() {
  const items = useLabelItems();
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

  useFrame(() => {
    type Placed = { entry: LabelEntry; x: number; y: number; anchorX: number; anchorY: number };
    const placed: Placed[] = [];

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
      placed.push({
        entry,
        x: anchorX - entry.width / 2,
        y: anchorY - BASE_OFFSET_PX - entry.height,
        anchorX,
        anchorY,
      });
    }

    // Van boven naar beneden plaatsen en botsende labels omhoog duwen.
    placed.sort((a, b) => a.y - b.y);
    const done: Placed[] = [];
    for (const item of placed) {
      for (let guard = 0; guard < 40; guard++) {
        const clash = done.find(
          (o) =>
            item.x < o.x + o.entry.width + GAP_PX &&
            item.x + item.entry.width + GAP_PX > o.x &&
            item.y < o.y + o.entry.height + GAP_PX &&
            item.y + item.entry.height + GAP_PX > o.y,
        );
        if (!clash) break;
        item.y = clash.y - item.entry.height - GAP_PX;
      }
      item.x = Math.max(2, Math.min(item.x, size.width - item.entry.width - 2));
      item.y = Math.max(2, Math.min(item.y, size.height - item.entry.height - 2));
      done.push(item);

      item.entry.el!.style.transform = `translate(${Math.round(item.x)}px, ${Math.round(item.y)}px)`;
      if (item.entry.line) {
        const cx = Math.max(item.x, Math.min(item.anchorX, item.x + item.entry.width));
        const cy = item.anchorY > item.y ? item.y + item.entry.height : item.y;
        item.entry.line.setAttribute('x1', `${item.anchorX}`);
        item.entry.line.setAttribute('y1', `${item.anchorY}`);
        item.entry.line.setAttribute('x2', `${cx}`);
        item.entry.line.setAttribute('y2', `${cy}`);
      }
    }
  });

  return null;
}
