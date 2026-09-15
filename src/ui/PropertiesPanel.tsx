import { useMemo, useState } from 'react';
import { useEditor } from '../store/projectStore';
import { STANDARD_DIAMETERS_MM, STANDARD_LENGTHS, type ContextObject, type LengthAnchor, type Vec3 } from '../model/types';
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
  const selectedContextObjectIds = useEditor((s) => s.selectedContextObjectIds);
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
  const updateContextObject = useEditor((s) => s.updateContextObject);

  const [knotDialogOpen, setKnotDialogOpen] = useState(false);

  const model = useMemo(() => resolveModel(project, library), [project, library]);
  const selectedBeams = model.beams.filter((b) => selectedBeamIds.includes(b.id));
  const looseBeams = project.beams.filter((b) => selectedBeamIds.includes(b.id));
  const selectedLooseLashings = project.lashings.filter((l) => selectedLashingIds.includes(l.id));
  const selectedLooseRopes = (project.ropes ?? []).filter((r) => selectedRopeIds.includes(r.id));
  const lashings = model.lashings.filter((l) => selectedLashingIds.includes(l.id));
  const ropes = model.ropes.filter((r) => selectedRopeIds.includes(r.id));
  const selectedContextObjects = project.contextObjects.filter((item) => selectedContextObjectIds.includes(item.id));

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
    ropes.length === 0 &&
    selectedContextObjects.length === 0
  ) {
    return (
      <div className="panel__body">
        <p className="hint">Selecteer een balk, knoop, touw, contextobject of assembly om eigenschappen te zien.</p>
        <p className="hint">Shift+klik om meerdere balken (voor een knoop) of 2 knopen (voor een touwverbinding) te selecteren.</p>
      </div>
    );
  }

  const applyLength = (value: number) => looseBeams.forEach((b) => setBeamLength(b.id, value));

  return (
    <div className="panel__body">
      {selectedContextObjects.length === 1 && (
        <ContextObjectProperties object={selectedContextObjects[0]} update={updateContextObject} />
      )}
      {selectedContextObjects.length > 1 && (
        <section>
          <h3>{selectedContextObjects.length} contextobjecten</h3>
          <p className="hint">Gebruik de gizmo om de selectie samen te verplaatsen of draaien.</p>
        </section>
      )}
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

      {(looseBeams.length > 0 || selectedLooseLashings.length > 0 || selectedLooseRopes.length > 0) && (
        <section>
          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={[
                ...looseBeams,
                ...selectedLooseLashings,
                ...selectedLooseRopes,
              ].every((item) => item.temporaryMeasure)}
              onChange={(e) => {
                const value = e.target.checked;
                looseBeams.forEach((beam) => updateBeam(beam.id, { temporaryMeasure: value }));
                selectedLooseLashings.forEach((lashing) =>
                  updateLashing(lashing.id, { temporaryMeasure: value }),
                );
                selectedLooseRopes.forEach((rope) => updateRope(rope.id, { temporaryMeasure: value }));
              }}
            />
            <span>Tijdelijke maatregel (apart in materiaalstaat)</span>
          </label>
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
            {lashing.beamIds.length === 1 && (!lashing.ropeIds || lashing.ropeIds.length === 0)
              ? 'Knoop op 1 balk (verplaatsbaar over de balk).'
              : lashing.beamIds.length === 0 && lashing.ropeIds?.length === 1
                ? 'Knoop op 1 touw (verplaatsbaar over het touw).'
                : `Verbindt ${lashing.beamIds.length + (lashing.ropeIds?.length ?? 0)} elementen.`}
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
            <div style={{ marginTop: 12, marginBottom: 12 }}>
              <button className="btn btn--primary" onClick={() => setKnotDialogOpen(true)}>
                Knoop maken op dit touw
              </button>
            </div>
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
        ropeCount={selectedLooseRopes.length}
        onConfirm={(name) => {
          createLashing(name);
          setKnotDialogOpen(false);
        }}
        onCancel={() => setKnotDialogOpen(false)}
      />
    </div>
  );
}

function ContextObjectProperties({
  object,
  update,
}: {
  object: ContextObject;
  update: (id: string, patch: Partial<ContextObject>) => void;
}) {
  const setNumber = (key: string, value: number) => update(object.id, { [key]: value } as Partial<ContextObject>);
  const setPosition = (axis: 0 | 2, value: number) => {
    const position: Vec3 = [...object.position] as Vec3;
    position[axis] = value;
    update(object.id, { position });
  };
  const label = object.type === 'building' ? 'Gebouw' : object.type === 'tree' ? 'Boom' : object.type === 'adult' ? 'Volwassene' : 'Kind';

  return (
    <section>
      <h3>{label}</h3>
      <div className="context-position">
        <NumberField label="X-positie (m)" value={object.position[0]} onChange={(value) => setPosition(0, value)} />
        <NumberField label="Z-positie (m)" value={object.position[2]} onChange={(value) => setPosition(2, value)} />
      </div>
      {object.type === 'building' && <>
        <NumberField label="Breedte (m)" value={object.widthM} min={0.5} onChange={(value) => setNumber('widthM', value)} />
        <NumberField label="Diepte (m)" value={object.depthM} min={0.5} onChange={(value) => setNumber('depthM', value)} />
        <NumberField label="Muurhoogte (m)" value={object.wallHeightM} min={0.5} onChange={(value) => setNumber('wallHeightM', value)} />
        <NumberField label="Nokhoogte (m)" value={object.roofHeightM} min={0.1} onChange={(value) => setNumber('roofHeightM', value)} />
      </>}
      {object.type === 'tree' && <>
        <NumberField label="Stamdiameter (m)" value={object.trunkDiameterM} min={0.05} onChange={(value) => setNumber('trunkDiameterM', value)} />
        <NumberField label="Hoogte (m)" value={object.heightM} min={0.5} onChange={(value) => setNumber('heightM', value)} />
        <NumberField label="Kroondiameter (m)" value={object.crownDiameterM} min={0.5} onChange={(value) => setNumber('crownDiameterM', value)} />
      </>}
      {(object.type === 'adult' || object.type === 'child') && <NumberField label="Hoogte (m)" value={object.heightM} min={0.3} onChange={(value) => setNumber('heightM', value)} />}
    </section>
  );
}

function NumberField({ label, value, min = 0, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><input type="number" min={min} step={0.1} value={value} onChange={(event) => { const nextValue = Number(event.target.value); if (nextValue >= min) onChange(nextValue); }} /></label>;
}
