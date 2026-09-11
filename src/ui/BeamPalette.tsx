import { useEditor } from '../store/projectStore';
import { STANDARD_DIAMETERS_MM, STANDARD_LENGTHS } from '../model/types';
import { beamColorHex } from '../model/beamColors';

export function BeamPalette() {
  const pendingLengthM = useEditor((s) => s.pendingLengthM);
  const setPendingLength = useEditor((s) => s.setPendingLength);
  const settings = useEditor((s) => s.project.settings);
  const updateSettings = useEditor((s) => s.updateSettings);

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
    </aside>
  );
}
