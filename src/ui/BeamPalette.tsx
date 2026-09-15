import { useEditor } from '../store/projectStore';
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { STANDARD_DIAMETERS_MM, STANDARD_LENGTHS } from '../model/types';
import { beamColorHex } from '../model/beamColors';
import { imageryUrl, placeLabelsUrl } from '../scene/GeoContext';

function GeoMiniMap({ x, y, size, onPick }: { x: number; y: number; size: number; onPick: (x: number, y: number) => void }) {
  const [zoom, setZoom] = useState(1);
  const [imageError, setImageError] = useState(false);
  const [labelError, setLabelError] = useState(false);
  const [drag, setDrag] = useState<{ pointerId: number; startX: number; startY: number; deltaX: number; deltaY: number } | null>(null);
  const mapSize = Math.max(size * 4, 400) / zoom;
  const labelSize = Math.min(mapSize, 40000);
  const labelScale = labelSize / mapSize;
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setImageError(false);
    setLabelError(false);
  }, [x, y, mapSize]);

  const coordinateAt = (event: PointerEvent<HTMLDivElement>, deltaX = 0, deltaY = 0) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const worldX = x - ((event.clientX - bounds.left - deltaX) / bounds.width - 0.5) * mapSize;
    const worldY = y + (0.5 - (event.clientY - bounds.top - deltaY) / bounds.height) * mapSize;
    return [Math.round(worldX), Math.round(worldY)] as const;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, deltaX: 0, deltaY: 0 });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDrag({ ...drag, deltaX: event.clientX - drag.startX, deltaY: event.clientY - drag.startY });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (Math.hypot(drag.deltaX, drag.deltaY) < 5) {
      onPick(...coordinateAt(event));
    } else {
      const bounds = event.currentTarget.getBoundingClientRect();
      const nextX = Math.round(x - (drag.deltaX / bounds.width) * mapSize);
      const nextY = Math.round(y + (drag.deltaY / bounds.height) * mapSize);
      onPick(nextX, nextY);
    }
    setDrag(null);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) => Math.min(8, Math.max(0.001, current * (event.deltaY < 0 ? 1.25 : 1 / 1.25))));
  };
  const changeZoom = (factor: number) => setZoom((current) => Math.min(8, Math.max(0.001, current * factor)));
  return (
    <div
      ref={mapRef}
      className={drag ? 'geo-minimap geo-minimap--dragging' : 'geo-minimap'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDrag(null)}
      onWheel={handleWheel}
      role="application"
      aria-label="Mini-map voor RD-middelpunt"
    >
      {!imageError && <img src={imageryUrl(x, y, mapSize)} alt="Satellietfoto voor locatiekeuze" onError={() => setImageError(true)} draggable={false} style={{ transform: drag ? `translate(${drag.deltaX}px, ${drag.deltaY}px)` : undefined }} />}
      {imageError && <span className="geo-minimap__fallback">Satellietfoto tijdelijk niet beschikbaar. Klik om het RD-middelpunt te kiezen.</span>}
      {!labelError && <img className="geo-minimap__labels" src={placeLabelsUrl(x, y, labelSize)} alt="Plaatsnamen" onError={() => setLabelError(true)} draggable={false} style={{ width: `${labelScale * 100}%`, height: `${labelScale * 100}%`, left: `${(1 - labelScale) * 50}%`, top: `${(1 - labelScale) * 50}%`, transform: drag ? `translate(${drag.deltaX}px, ${drag.deltaY}px)` : undefined }} />}
      <span className="geo-minimap__pin" aria-hidden="true" />
      <span className="geo-minimap__hint" aria-hidden="true">Scroll: zoom · Sleep: pan</span>
      <span className="geo-minimap__zoom" aria-label="Mini-map zoom">
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => changeZoom(1.5)} aria-label="Inzoomen">+</button>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => changeZoom(1 / 1.5)} aria-label="Uitzoomen">−</button>
      </span>
    </div>
  );
}

export function BeamPalette() {
  const pendingLengthM = useEditor((s) => s.pendingLengthM);
  const pendingContextObjectType = useEditor((s) => s.pendingContextObjectType);
  const setPendingLength = useEditor((s) => s.setPendingLength);
  const setPendingContextObjectType = useEditor((s) => s.setPendingContextObjectType);
  const settings = useEditor((s) => s.project.settings);
  const updateSettings = useEditor((s) => s.updateSettings);
  const [miniMapOpen, setMiniMapOpen] = useState(false);

  useEffect(() => {
    if (!miniMapOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMiniMapOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [miniMapOpen]);

  return (
    <aside className="panel panel--left">
      <h2>Balken plaatsen</h2>
      <p className="hint">Kies een lengte en klik in de grond.</p>
      <div className="length-grid">
        {STANDARD_LENGTHS.map((len) => (
          <button
            key={len}
            className={pendingLengthM === len ? 'chip chip--active' : 'chip'}
            onClick={() => setPendingLength(pendingLengthM === len ? null : len)}
          >
            <span className="chip__dot" style={{ background: beamColorHex(len) }} />
            {len} m
          </button>
        ))}
      </div>
      {pendingLengthM !== null && (
        <button className="btn btn--ghost" onClick={() => setPendingLength(null)}>
          Plaatsen annuleren
        </button>
      )}

      <h2>Context plaatsen</h2>
      <p className="hint">Kies een object en klik in de grond.</p>
      <div className="context-add-grid">
        {[
          ['building', 'Gebouw'],
          ['tree', 'Boom'],
          ['adult', 'Volwassene'],
          ['child', 'Kind'],
        ].map(([type, label]) => (
          <button
            key={type}
            className={pendingContextObjectType === type ? 'btn btn--active' : 'btn'}
            onClick={() => setPendingContextObjectType(pendingContextObjectType === type ? null : type as 'building' | 'tree' | 'adult' | 'child')}
          >
            {label}
          </button>
        ))}
      </div>
      {pendingContextObjectType !== null && (
        <button className="btn btn--ghost" onClick={() => setPendingContextObjectType(null)}>
          Plaatsen annuleren
        </button>
      )}

      <h2>Instellingen</h2>
      <label className="field">
        <span>Diameter</span>
        <select
          value={settings.defaultDiameterMm}
          onChange={(e) => updateSettings({ defaultDiameterMm: Number(e.target.value) })}
        >
          {STANDARD_DIAMETERS_MM.map((d) => (
            <option key={d} value={d}>
              {d} mm
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Rastersnap</span>
        <select
          value={settings.gridSnapM}
          onChange={(e) => updateSettings({ gridSnapM: Number(e.target.value) })}
        >
          {[0, 0.05, 0.1, 0.25, 0.5, 1].map((v) => (
            <option key={v} value={v}>
              {v === 0 ? 'uit' : `${v} m`}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Hoeksnap</span>
        <select
          value={settings.angleSnapDeg}
          onChange={(e) => updateSettings({ angleSnapDeg: Number(e.target.value) })}
        >
          {[0, 5, 15, 30, 45, 90].map((v) => (
            <option key={v} value={v}>
              {v === 0 ? 'uit' : `${v}°`}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Maaiveld (m × m)</span>
        <input
          type="number"
          min={20}
          step={5}
          value={settings.groundSizeM}
          onChange={(e) => updateSettings({ groundSizeM: Math.max(20, Number(e.target.value) || 20) })}
        />
      </label>

      <h2>Georeferentie</h2>
      <p className="hint">RD New (EPSG:28992). De tile gebruikt de maaiveldmaat hierboven.</p>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.georeferenceEnabled}
          onChange={(e) => updateSettings({ georeferenceEnabled: e.target.checked })}
        />
        Omgeving laden
      </label>
      {settings.georeferenceEnabled && (
        <>
          <button className="btn btn--active geo-minimap-open" type="button" onClick={() => setMiniMapOpen(true)}>
            Mini-map openen
          </button>
          <div className="geo-coordinate-readout">
            RD {settings.georeferenceX} / {settings.georeferenceY}
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.georeferenceBuildings}
              onChange={(e) => updateSettings({ georeferenceBuildings: e.target.checked })}
            />
            Context: 3D BAG-gebouwen
          </label>
          <p className="hint">Gebouwen worden lokaal op y = 0 gezet; hoogte blijft behouden.</p>
        </>
      )}
      {miniMapOpen && settings.georeferenceEnabled && (
        <div className="geo-minimap-modal" role="presentation" onPointerDown={() => setMiniMapOpen(false)}>
          <section className="geo-minimap-dialog" role="dialog" aria-modal="true" aria-labelledby="geo-minimap-title" onPointerDown={(event) => event.stopPropagation()}>
            <div className="geo-minimap-dialog__header">
              <h2 id="geo-minimap-title">RD-middelpunt kiezen</h2>
              <button className="btn btn--icon" type="button" onClick={() => setMiniMapOpen(false)} aria-label="Mini-map sluiten">×</button>
            </div>
            <GeoMiniMap
              x={settings.georeferenceX}
              y={settings.georeferenceY}
              size={settings.groundSizeM}
              onPick={(x, y) => updateSettings({ georeferenceX: x, georeferenceY: y })}
            />
            <p className="hint">Klik om te kiezen, sleep om te pannen, scroll om te zoomen.</p>
          </section>
        </div>
      )}
    </aside>
  );
}
