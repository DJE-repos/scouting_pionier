import { jsPDF } from 'jspdf';
import { Box3, Camera, Object3D, OrthographicCamera, PerspectiveCamera, Scene, Vector2, Vector3 } from 'three';
import type { AssemblyLibrary, Project } from '../../model/types';
import { resolveModel, type ResolvedModel } from '../../model/resolve';
import { beamEndpoints, beamLocalToWorld } from '../../model/geometry';
import { beamColorHex, formatLength, hexToRgb } from '../../model/beamColors';
import { anglesForStep, viewOrientation, type ViewAngles, type ViewName } from '../../model/views';
import { computeBillOfMaterials } from '../billOfMaterials';
import { getCanvasHandle } from '../../scene/snapshot';

/** Rendergroottes, afgestemd op de beeldverhouding van het vak in de PDF. */
const VIEW_SIZE = {
  wide: { width: 1600, height: 900 },
  half: { width: 1300, height: 900 },
};

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function modelBounds(model: ResolvedModel): Box3 {
  const box = new Box3();
  for (const beam of model.beams) {
    const [a, b] = beamEndpoints(beam);
    box.expandByPoint(a);
    box.expandByPoint(b);
  }
  if (box.isEmpty()) box.set(new Vector3(-2, 0, -2), new Vector3(2, 2, 2));
  return box;
}

interface KnotLabel {
  position: Vector3;
  text: string;
}

interface RenderedView {
  dataUrl: string;
  aspect: number;
}

function boxCorners(box: Box3): Vector3[] {
  const corners: Vector3[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) corners.push(new Vector3(x, y, z));
  return corners;
}

function aimCamera(camera: Camera, box: Box3, direction: Vector3, up: Vector3, distance: number) {
  const center = box.getCenter(new Vector3());
  camera.up.copy(up);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);
  camera.updateMatrixWorld();
}

/**
 * Zet een perspectiefcamera zo dicht op het model dat alle hoekpunten net in beeld
 * blijven. Convergeert snel omdat de projectie omgekeerd evenredig is met de afstand.
 */
function fitPerspective(
  camera: PerspectiveCamera,
  box: Box3,
  orientation: { direction: Vector3; up: Vector3 },
  fill: number,
) {
  const corners = boxCorners(box);
  const span = Math.max(box.getSize(new Vector3()).length(), 1);
  let distance = span * 2;

  for (let i = 0; i < 8; i++) {
    aimCamera(camera, box, orientation.direction, orientation.up, distance);
    camera.near = Math.max(0.05, distance - span);
    camera.far = distance + span * 2;
    camera.updateProjectionMatrix();

    let extent = 0;
    for (const corner of corners) {
      const p = corner.clone().project(camera);
      extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
    }
    if (extent <= 0) break;
    const factor = extent / fill;
    distance *= factor;
    if (Math.abs(factor - 1) < 0.004) break;
  }

  aimCamera(camera, box, orientation.direction, orientation.up, distance);
  camera.near = Math.max(0.05, distance - span);
  camera.far = distance + span * 2;
  camera.updateProjectionMatrix();
}

/** Uitsnede uit de werkelijke afmetingen in camerarichting, dus geldig voor elke hoek. */
function fitOrthographic(
  camera: OrthographicCamera,
  box: Box3,
  orientation: { direction: Vector3; up: Vector3 },
  aspect: number,
  fill: number,
) {
  const span = Math.max(box.getSize(new Vector3()).length(), 1);
  const distance = span * 2;
  aimCamera(camera, box, orientation.direction, orientation.up, distance);

  let halfWidth = 0;
  let halfHeight = 0;
  for (const corner of boxCorners(box)) {
    const local = corner.clone().applyMatrix4(camera.matrixWorldInverse);
    halfWidth = Math.max(halfWidth, Math.abs(local.x));
    halfHeight = Math.max(halfHeight, Math.abs(local.y));
  }

  const half = Math.max(halfHeight, halfWidth / aspect) / fill;
  camera.left = -half * aspect;
  camera.right = half * aspect;
  camera.top = half;
  camera.bottom = -half;
  camera.near = 0.01;
  camera.far = distance + span * 2;
  camera.updateProjectionMatrix();
}

/**
 * Eigen camera's voor de export; de camera van de app blijft daardoor onaangeroerd
 * en het maakt niet uit of die in perspectief of orthografisch staat.
 */
function cameraForView(view: ViewName, box: Box3, angles: ViewAngles, aspect: number): Camera {
  const orientation = viewOrientation(view, angles);
  if (view === 'Isometrisch') {
    const camera = new PerspectiveCamera(40, aspect, 0.05, 1000);
    fitPerspective(camera, box, orientation, 0.92);
    return camera;
  }
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  fitOrthographic(camera, box, orientation, aspect, 0.9);
  return camera;
}

/** Maaiveld en raster zijn hulpmiddelen in de app; in het boekje leiden ze alleen af. */
function withoutSceneHelpers<T>(scene: Scene, render: () => T): T {
  const hidden: Object3D[] = [];
  scene.traverse((object) => {
    if ((object.name === 'ground' || object.name === 'grid') && object.visible) {
      object.visible = false;
      hidden.push(object);
    }
  });
  try {
    return render();
  } finally {
    for (const object of hidden) object.visible = true;
  }
}

function renderView(
  view: ViewName,
  box: Box3,
  angles: ViewAngles,
  labels: KnotLabel[] = [],
  size: { width: number; height: number } = VIEW_SIZE.wide,
  labelZoom = 1,
  quality = 0.85,
): RenderedView | null {
  const handle = getCanvasHandle();
  if (!handle) return null;

  const aspect = size.width / size.height;
  const camera = cameraForView(view, box, angles, aspect);

  handle.gl.setSize(size.width, size.height, false);
  withoutSceneHelpers(handle.scene, () => handle.gl.render(handle.scene, camera));
  const source = handle.gl.domElement;
  if (labels.length === 0) return { dataUrl: source.toDataURL('image/jpeg', quality), aspect };

  // De labels in de app zijn HTML-overlays en komen niet mee in de WebGL-render.
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: source.toDataURL('image/jpeg', quality), aspect };
  ctx.drawImage(source, 0, 0);
  drawKnotLabels(ctx, canvas, camera, labels, labelZoom);
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), aspect };
}

/** Plaatst een afbeelding met behoud van beeldverhouding, gecentreerd in het vak. */
function placeImage(
  doc: jsPDF,
  image: RenderedView | null,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
): number {
  if (!image) return y;
  let w = boxW;
  let h = boxW / image.aspect;
  if (h > boxH) {
    h = boxH;
    w = boxH * image.aspect;
  }
  doc.addImage(image.dataUrl, 'JPEG', x + (boxW - w) / 2, y, w, h);
  return y + h;
}

function drawKnotLabels(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  labels: KnotLabel[],
  zoom: number,
) {
  const scale = canvas.width * zoom;
  const fontSize = Math.round(0.021 * scale);
  const radius = fontSize * 0.82;
  ctx.font = `700 ${fontSize}px Segoe UI, Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.lineWidth = Math.max(1, 0.0012 * scale);

  const placed: { x: number; y: number; r: number }[] = [];

  for (const label of labels) {
    const p = label.position.clone().project(camera);
    if (p.z > 1) continue;

    const anchorX = (p.x * 0.5 + 0.5) * canvas.width;
    const anchorY = (-p.y * 0.5 + 0.5) * canvas.height;
    let x = anchorX;
    let y = anchorY - radius * 2.4;

    // Wijk uit zolang de bol een eerder geplaatste bol zou raken.
    for (let guard = 0; guard < 24; guard++) {
      const clash = placed.find((c) => Math.hypot(c.x - x, c.y - y) < c.r + radius + 2);
      if (!clash) break;
      y = clash.y - (clash.r + radius + 3);
    }
    x = Math.max(radius + 1, Math.min(x, canvas.width - radius - 1));
    y = Math.max(radius + 1, Math.min(y, canvas.height - radius - 1));
    placed.push({ x, y, r: radius });

    ctx.strokeStyle = '#b45309';
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.lineTo(x, y + radius);
    ctx.stroke();

    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(anchorX, anchorY, ctx.lineWidth * 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(label.text, x, y + fontSize * 0.06);
  }

  ctx.textAlign = 'left';
}

export interface ManualOptions {
  setPreviewStep: (step: number | null) => void;
  restorePreviewStep: number | null;
}

/** A, B, ... Z, AA, AB, ... */
function letterFor(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * De knopen van deze stap krijgen een letter; dezelfde letter staat in de zichten
 * en voor de bijbehorende regel in de instructie.
 */
function knotLabels(model: ResolvedModel, knots: ResolvedModel['lashings']): KnotLabel[] {
  return knots.flatMap((lashing, i) => {
    const anchor = model.beams.find((b) => b.id === lashing.beamIds[0]);
    if (!anchor) return [];
    return [
      {
        position: beamLocalToWorld(anchor, lashing.localOffset),
        text: letterFor(i),
      },
    ];
  });
}

function usedLengths(model: ResolvedModel): number[] {
  return [...new Set(model.beams.map((b) => b.lengthM))].sort((a, b) => a - b);
}

/** Kleurlegenda van de gebruikte balklengtes; geeft de hoogte in mm terug. */
function drawLegend(doc: jsPDF, x: number, y: number, lengths: number[], maxW: number): number {
  const boxSize = 3.2;
  const gap = 2;
  const lineHeight = 5;
  doc.setFontSize(8);
  doc.setTextColor(40);

  let cx = x;
  let cy = y;
  for (const lengthM of lengths) {
    const text = formatLength(lengthM);
    const itemW = boxSize + 1.5 + doc.getTextWidth(text) + gap * 2;
    if (cx + itemW > x + maxW) {
      cx = x;
      cy += lineHeight;
    }
    const [r, g, b] = hexToRgb(beamColorHex(lengthM));
    doc.setFillColor(r, g, b);
    doc.rect(cx, cy - boxSize + 0.6, boxSize, boxSize, 'F');
    doc.text(text, cx + boxSize + 1.5, cy);
    cx += itemW;
  }
  return cy - y + lineHeight;
}

/** Genereert een stap-voor-stap bouwhandleiding als PDF-blob. */
export async function generateManual(
  project: Project,
  library: AssemblyLibrary,
  options: ManualOptions,
): Promise<Blob> {
  const handle = getCanvasHandle();
  const savedSize = handle?.gl.getSize(new Vector2());
  const savedPixelRatio = handle?.gl.getPixelRatio();
  handle?.gl.setPixelRatio(1);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;

  const fullModel = resolveModel(project, library);
  const fullBounds = modelBounds(fullModel);
  const bom = computeBillOfMaterials(fullModel);
  const defaultAngles = anglesForStep(undefined, project.settings);

  try {
    // --- voorblad ---
    options.setPreviewStep(null);
    await nextFrame();
    await nextFrame();

    doc.setFontSize(24);
    doc.text(project.name, margin, 30);
    doc.setFontSize(10);
    doc.text(`Bouwhandleiding · ${new Date().toLocaleDateString('nl-NL')}`, margin, 38);

    const cover = renderView('Isometrisch', fullBounds, defaultAngles);
    let y = placeImage(doc, cover, margin, 44, contentW, 110) + 8;

    doc.setFontSize(12);
    doc.text('Balklengtes', margin, y);
    y += 5;
    y += drawLegend(doc, margin, y, usedLengths(fullModel), contentW);
    y += 2;

    doc.setFontSize(14);
    doc.text('Materiaalstaat', margin, y);
    y += 7;
    doc.setFontSize(10);
    for (const row of bom.beams) {
      doc.text(`${row.count}× balk ${row.lengthM} m (Ø${row.diameterMm} mm)`, margin, y);
      y += 5;
    }
    doc.text(
      `Totaal: ${bom.totalBeams} balken, ${bom.totalBeamLengthM.toFixed(1)} m hout`,
      margin,
      y,
    );
    y += 8;
    doc.setFontSize(14);
    doc.text('Knopen', margin, y);
    y += 7;
    doc.setFontSize(10);
    for (const row of bom.knots) {
      doc.text(`${row.count}× ${row.name} - ${row.totalRopeM.toFixed(1)} m touw`, margin, y);
      y += 5;
    }
    doc.text(`Totaal touw: ${bom.totalRopeM.toFixed(1)} m`, margin, y);
    if (bom.totalTemporaryBeams > 0 || bom.totalTemporaryKnots > 0) {
      y += 8;
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(
        `Tussenstappen gebruiken ${bom.totalTemporaryBeams} balken en ${bom.totalTemporaryKnots} knopen die hierboven al meegeteld zijn.`,
        margin,
        y,
      );
      doc.setTextColor(0);
    }

    // --- stappen ---
    for (const step of project.steps) {
      const cumulative = resolveModel(project, library, step.index);
      const newBeams = cumulative.beams.filter((b) => b.stepIndex === step.index);
      const newKnots = cumulative.lashings.filter((l) => l.stepIndex === step.index);
      const newRopes = cumulative.ropes.filter((r) => r.stepIndex === step.index);
      if (newBeams.length === 0 && newKnots.length === 0 && newRopes.length === 0) continue;

      options.setPreviewStep(step.index);
      await nextFrame();
      await nextFrame();

      doc.addPage();
      doc.setFontSize(18);
      doc.text(`${step.index + 1}. ${step.title}${step.temporary ? ' (tussenstap)' : ''}`, margin, 20);

      let sy = 26;
      sy += drawLegend(doc, margin, sy, usedLengths(cumulative), contentW);

      const labels = knotLabels(cumulative, newKnots);
      const angles = anglesForStep(step, project.settings);
      const iso = renderView('Isometrisch', fullBounds, angles, labels);
      sy = placeImage(doc, iso, margin, sy, contentW, 100) + 5;

      const half = (contentW - 5) / 2;
      const top = renderView('Bovenaanzicht', fullBounds, angles, labels, VIEW_SIZE.half, 1.25, 0.8);
      const front = renderView('Vooraanzicht', fullBounds, angles, labels, VIEW_SIZE.half, 1.25, 0.8);
      const bottom = Math.max(
        placeImage(doc, top, margin, sy, half, 60),
        placeImage(doc, front, margin + half + 5, sy, half, 60),
      );
      doc.setFontSize(8);
      doc.setTextColor(90);
      doc.text('Bovenaanzicht', margin, bottom + 4);
      doc.text('Vooraanzicht', margin + half + 5, bottom + 4);
      doc.setTextColor(0);

      sy = bottom + 12;
      doc.setFontSize(12);
      doc.text('In deze stap', margin, sy);
      sy += 6;
      doc.setFontSize(10);

      const beamGroups = new Map<string, { count: number; lengthM: number; diameterMm: number }>();
      for (const b of newBeams) {
        const key = `${b.lengthM}|${b.diameterMm}`;
        const row = beamGroups.get(key) ?? { count: 0, lengthM: b.lengthM, diameterMm: b.diameterMm };
        row.count += 1;
        beamGroups.set(key, row);
      }
      for (const row of beamGroups.values()) {
        const [r, g, b] = hexToRgb(beamColorHex(row.lengthM));
        doc.setFillColor(r, g, b);
        doc.rect(margin, sy - 2.6, 3.2, 3.2, 'F');
        doc.text(
          `${row.count}× balk ${formatLength(row.lengthM)} (Ø${row.diameterMm} mm) plaatsen`,
          margin + 5,
          sy,
        );
        sy += 5;
      }

      const knotGroups = new Map<string, string[]>();
      newKnots.forEach((l, i) => {
        const letters = knotGroups.get(l.name) ?? [];
        letters.push(letterFor(i));
        knotGroups.set(l.name, letters);
      });
      for (const [name, letters] of knotGroups) {
        const prefix = letters.join(', ');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 83, 9);
        doc.text(prefix, margin + 5, sy);
        const prefixW = doc.getTextWidth(prefix);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0);
        doc.text(`${letters.length}× ${name} leggen`, margin + 5 + prefixW + 3, sy);
        sy += 5;
      }

      const ropeGroups = new Map<string, { count: number; totalLengthM: number }>();
      for (const rope of newRopes) {
        const name = rope.name ?? 'Touw';
        const row = ropeGroups.get(name) ?? { count: 0, totalLengthM: 0 };
        row.count += 1;
        row.totalLengthM += rope.totalRopeM;
        ropeGroups.set(name, row);
      }
      for (const [name, row] of ropeGroups) {
        doc.text(
          `${row.count}× ${name} spannen (${row.totalLengthM.toFixed(1)} m touw)`,
          margin + 5,
          sy,
        );
        sy += 5;
      }

      const cumulativeBom = computeBillOfMaterials(cumulative);
      sy += 3;
      doc.setFontSize(9);
      if (step.temporary) {
        doc.text(
          'Dit onderdeel bouw je los voor en zet je in een volgende stap op zijn plek.',
          margin,
          sy,
        );
        sy += 5;
        doc.text('Het hout en touw hierboven heb je al in de materiaalstaat staan.', margin, sy);
      } else {
        doc.text(
          `Tot en met deze stap: ${cumulativeBom.totalBeams} balken, ${cumulativeBom.totalKnots} knopen, ${cumulativeBom.totalRopeM.toFixed(1)} m touw`,
          margin,
          sy,
        );
      }
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        'Fel gekleurd = nieuw in deze stap, dof = al geplaatst, doorzichtig = volgt later',
        margin,
        sy + 5,
      );
      doc.setTextColor(0);
    }
  } finally {
    options.setPreviewStep(options.restorePreviewStep);
    if (handle && savedSize && savedPixelRatio !== undefined) {
      handle.gl.setPixelRatio(savedPixelRatio);
      handle.gl.setSize(savedSize.x, savedSize.y, false);
    }
  }

  return doc.output('blob');
}
