import { useMemo, useState } from 'react';
import { useEditor } from '../store/projectStore';
import { STANDARD_DIAMETERS_MM, STANDARD_LENGTHS, type LengthAnchor } from '../model/types';
import { KNOT_SUGGESTIONS } from '../model/defaults';
import { beamColorHex } from '../model/beamColors';
import { resolveModel } from '../model/resolve';
import { KnotDialog } from './KnotDialog';

const ANCHOR_LABELS: Record<LengthAnchor, string> = {
  start: 'begin vast',
  center: 'midden vast',
  end: 'eind vast',
};

export function PropertiesPanel() {
  const selectedBeamIds = useEditor((s) => s.selectedBeamIds);
  const selectedLashingIds = useEditor((s) => s.selectedLashingIds);
  const selectedInstanceIds = useEditor((s) => s.selectedInstanceIds);
  const selectedRopeIds = useEditor((s) => s.selectedRopeIds);
  const project = useEditor((s) => s.project);
  const library = useEditor((s) => s.library);
  const lengthAnchor = useEditor((s) => s.lengthAnchor);
  const setLengthAnchor = useEditor((s) => s.setLengthAnchor);
  const setBeamLength = useEditor((s) => s.setBeamLength);
  const updateBeam = useEditor((s) => s.updateBeam);
  const updateLashing = useEditor((s) => s.updateLashing);
  const updateRope = useEditor((s) => s.updateRope);
  const explodeInstance = useEditor((s) => s.explodeInstance);
  const createLashing = useEditor((s) => s.createLashing);
  const createRope = useEditor((s) => s.createRope);

  const [knotDialogOpen, setKnotDialogOpen] = useState(false);

  const model = useMemo(() => resolveModel(project, library), [project, library]);
  const selectedBeams = model.beams.filter((b) => selectedBeamIds.includes(b.id));
  const looseBeams = project.beams.filter((b) => selectedBeamIds.includes(b.id));
  const lashings = model.lashings.filter((l) => selectedLashingIds.includes(l.id));
  const ropes = model.ropes.filter((r) => selectedRopeIds.includes(r.id));

  // Verzamel relevante assembly-instanties: direct geselecteerd of via geselecteerde balken
  const instanceIdsToShow = useMemo(() => {
    const ids = new Set(selectedInstanceIds);
    for (const b of selectedBeams) {
      if (b.instanceId) ids.add(b.instanceId);
    }
    return [...ids];
  }, [selectedInstanceIds, selectedBeams]);

  const instances = project.assemblyInstances.filter((i) => instanceIdsToShow.includes(i.id));

  if (
    selectedBeams.length === 0 &&
    lashings.length === 0 &&
    instances.length === 0 &&
    ropes.length === 0
  ) {
    return (
      <div className="panel__body">
        <p className="hint">Selecteer een balk, knoop, touw of assembly om eigenschappen te zien.</p>
        <p className="hint">Shift+klik om meerdere balken (voor een knoop) of 2 knopen (voor een touwverbinding) te selecteren.</p>
      </div>
    );
  }

  const applyLength = (value: number) => looseBeams.forEach((b) => setBeamLength(b.id, value));

  return (
    <div className="panel__body">
      {selectedBeams.length > 0 && (
        <section>
          <h3>{selectedBeams.length === 1 ? 'Balk' : `${selectedBeams.length} balken`}</h3>

          <div style={{ marginBottom: 12 }}>
            <button className="btn btn--primary" onClick={() => setKnotDialogOpen(true)}>
              {selectedBeams.length === 1
                ? 'Knoop maken op balk'
                : `Knoop maken tussen selectie (${selectedBeams.length})`}
            </button>
          </div>

          {selectedBeams.length === 1 && selectedBeams[0].instanceId && (
            <p className="hint">
              Onderdeel van assembly: <strong>{selectedBeams[0].assemblyName ?? 'Assembly'}</strong>
              <br />
              Lengte: {selectedBeams[0].lengthM} m · Diameter: {selectedBeams[0].diameterMm} mm
            </p>
          )}

          {looseBeams.length > 0 && (
            <>
              <label className="field">
                <span>Lengte-anker</span>
                <select
                  value={lengthAnchor}
                  onChange={(e) => setLengthAnchor(e.target.value as LengthAnchor)}
                >
                  {(Object.keys(ANCHOR_LABELS) as LengthAnchor[]).map((a) => (
                    <option key={a} value={a}>
                      {ANCHOR_LABELS[a]}
                    </option>
                  ))}
                </select>
              </label>

              <div className="length-grid">
                {STANDARD_LENGTHS.map((len) => (
                  <button
                    key={len}
                    className={
                      looseBeams.every((b) => b.lengthM === len) ? 'chip chip--active' : 'chip'
                    }
                    onClick={() => applyLength(len)}
                  >
                    <span className="chip__dot" style={{ background: beamColorHex(len) }} />
                    {len} m
                  </button>
                ))}
              </div>

              <label className="field">
                <span>Vrije lengte (m)</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={looseBeams.length === 1 ? looseBeams[0].lengthM : ''}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0) applyLength(v);
                  }}
                />
              </label>

              <label className="field">
                <span>Diameter</span>
                <select
                  value={looseBeams[0].diameterMm}
                  onChange={(e) =>
                    looseBeams.forEach((b) => updateBeam(b.id, { diameterMm: Number(e.target.value) }))
                  }
                >
                  {STANDARD_DIAMETERS_MM.map((d) => (
                    <option key={d} value={d}>
                      {d} mm
                    </option>
                  ))}
                </select>
              </label>

              {looseBeams.length === 1 && (
                <label className="field">
                  <span>Naam</span>
                  <input
                    value={looseBeams[0].name ?? ''}
                    placeholder="optioneel"
                    onChange={(e) => updateBeam(looseBeams[0].id, { name: e.target.value })}
                  />
                </label>
              )}
            </>
          )}
        </section>
      )}

      {lashings.length === 2 && (
        <section style={{ marginBottom: 12 }}>
          <button className="btn btn--primary" onClick={() => createRope()}>
            Touw spannen tussen deze 2 knopen
          </button>
        </section>
      )}

      {lashings.map((lashing) => (
        <section key={lashing.id}>
          <h3>Knoop: {lashing.name}</h3>
          <label className="field">
            <span>Naam</span>
            <input
              list="knot-suggestions"
              value={lashing.name}
              onChange={(e) => updateLashing(lashing.id, { name: e.target.value })}
            />
          </label>
          <datalist id="knot-suggestions">
            {KNOT_SUGGESTIONS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <label className="field">
            <span>Touwlengte (m)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={lashing.ropeLengthM}
              onChange={(e) => updateLashing(lashing.id, { ropeLengthM: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Kleur</span>
            <input
              type="color"
              value={lashing.color}
              onChange={(e) => updateLashing(lashing.id, { color: e.target.value })}
            />
          </label>
          <p className="hint">
            {lashing.beamIds.length === 1
              ? 'Knoop op 1 balk (verplaatsbaar over de balk).'
              : `Verbindt ${lashing.beamIds.length} balken.`}
          </p>
        </section>
      ))}

      {ropes.map((rope) => {
        const k1 = model.lashings.find((l) => l.id === rope.fromKnotId);
        const k2 = model.lashings.find((l) => l.id === rope.toKnotId);
        return (
          <section key={rope.id}>
            <h3>Touwverbinding</h3>
            <label className="field">
              <span>Naam</span>
              <input
                value={rope.name ?? 'Spantouw'}
                placeholder="bijv. Spantouw of Hangtouw"
                onChange={(e) => updateRope(rope.id, { name: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Diameter</span>
              <select
                value={rope.diameterMm ?? 12}
                onChange={(e) => updateRope(rope.id, { diameterMm: Number(e.target.value) })}
              >
                {[6, 8, 10, 12, 14, 16, 20].map((d) => (
                  <option key={d} value={d}>
                    {d} mm
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Extra lengte (m)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={rope.extraLengthM ?? 1}
                onChange={(e) => updateRope(rope.id, { extraLengthM: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Kleur</span>
              <input
                type="color"
                value={rope.color ?? '#d97706'}
                onChange={(e) => updateRope(rope.id, { color: e.target.value })}
              />
            </label>
            <p className="hint">
              Overspanning: <strong>{rope.lengthM} m</strong>
              <br />
              Totale touwlengte: <strong>{rope.totalRopeM} m</strong> (incl. {rope.extraLengthM ?? 1} m extra)
              <br />
              Tussen knopen: {k1?.name ?? 'Knoop 1'} ↔ {k2?.name ?? 'Knoop 2'}
            </p>
          </section>
        );
      })}

      {instances.map((instance) => {
        const def = library.defs.find((d) => d.id === instance.defId);
        return (
          <section key={instance.id}>
            <h3>Assembly: {def?.name ?? 'onbekend'}</h3>
            <p className="hint">
              {def?.beams.length ?? 0} balken, {def?.lashings.length ?? 0} knopen
            </p>
            <button className="btn btn--ghost" onClick={() => explodeInstance(instance.id)}>
              Uit elkaar halen
            </button>
          </section>
        );
      })}

      <KnotDialog
        open={knotDialogOpen}
        beamCount={selectedBeams.length}
        onConfirm={(name) => {
          createLashing(name);
          setKnotDialogOpen(false);
        }}
        onCancel={() => setKnotDialogOpen(false)}
      />
    </div>
  );
}
