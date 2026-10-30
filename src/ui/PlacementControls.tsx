import { useState } from 'react';
import { useEditor } from '../store/projectStore';
import { resolveModel } from '../model/resolve';
import { solveBeamPlacement } from '../model/beamPlacement';
import type { LengthAnchor } from '../model/types';

export function PlacementControls() {
  const state = useEditor();
  const [name, setName] = useState('');
  const [height, setHeight] = useState('2');
  const levels = state.project.referenceLevels ?? [];
  const model = resolveModel(state.project, state.library, state.previewStep);
  const draft = state.placementDraft;
  const level = levels.find((item) => item.id === state.activeLevelId);
  const radius = state.project.settings.defaultDiameterMm / 2000;
  const levelCenterY = level ? level.elevationM + (state.levelAlignment === 'bottom' ? radius : state.levelAlignment === 'top' ? -radius : 0) : undefined;
  const ready = draft.picks.length === 2 || (draft.picks.length === 1 && draft.target);
  const result = state.pendingLengthM !== null && ready
    ? solveBeamPlacement(state.pendingLengthM, state.project.settings.defaultDiameterMm, draft, model.beams, levelCenterY) : null;
  return (
    <section className="placement-controls">
      <label className="field">
        <span>Plaatsing</span>
        <select value={state.placementMode} onChange={(event) => state.setPlacementMode(event.target.value as 'ground' | 'supports')}>
          <option value="ground">Op niveau</option>
          <option value="supports">Aan steunbalken</option>
        </select>
      </label>
      <label className="field">
        <span>Referentieniveau</span>
        <select value={state.activeLevelId ?? ''} onChange={(event) => state.setActiveLevel(event.target.value || null)}>
          <option value="">Maaiveld · 0 m</option>
          {levels.map((level) => <option key={level.id} value={level.id}>{level.name} · {level.elevationM} m</option>)}
        </select>
      </label>
      <label className="field">
        <span>Uitlijning op niveau</span>
        <select value={state.levelAlignment} onChange={(event) => state.setLevelAlignment(event.target.value as typeof state.levelAlignment)}>
          <option value="bottom">Onderkant</option>
          <option value="center">Hartlijn</option>
          <option value="top">Bovenkant</option>
        </select>
      </label>
      {state.placementMode === 'supports' && <>
        <label className="field"><span>Zijwaartse offset (m)</span>
          <input type="number" step="0.01" value={draft.offsetM} onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value)) state.updatePlacementDraft({ offsetM: value }, true);
          }} />
        </label>
        <label className="field"><span>Overstek</span>
          <select value={draft.anchor} onChange={(event) => state.updatePlacementDraft({ anchor: event.target.value as LengthAnchor }, true)}>
            <option value="center">Gelijk verdeeld</option>
            <option value="start">Vanaf eerste steun</option>
            <option value="end">Tot tweede steun</option>
          </select>
        </label>
        <label className="toggle"><input type="checkbox" checked={draft.linked} onChange={(event) => state.updatePlacementDraft({ linked: event.target.checked }, true)} />Koppelen aan elementen</label>
        {draft.picks.map((pick, index) => <div className="placement-reference" key={pick.beamId}>
          <span>Steun {index + 1}: {model.beams.find((beam) => beam.id === pick.beamId)?.name || pick.beamId.slice(0, 8)}</span>
          <button className="btn btn--ghost" onClick={() => state.updatePlacementDraft({
            picks: draft.picks.map((item, itemIndex) => itemIndex === index ? {
              ...item, localNormal: [-item.localNormal[0], -item.localNormal[1], -item.localNormal[2]],
            } : item),
          }, true)}>Andere zijde</button>
        </div>)}
        {state.pendingLengthM !== null && <div className="placement-status" role="status" aria-live="polite">
          {draft.picks.length === 0 ? 'Eerste steun' : !ready ? 'Tweede steun of richting' : result?.error ?? `${result?.contacts.length} raakcontacten`}
        </div>}
        {result && !result.error && <div className="placement-knots">{result.contacts.map((contact, index) => <div key={contact.beamId}>Steun {index + 1}: {contact.name}</div>)}</div>}
        {state.pendingLengthM !== null && draft.picks.length > 0 && <div className="placement-actions">
          <button className="btn btn--ghost" onClick={() => state.updatePlacementDraft({ picks: [], target: undefined })}>Opnieuw kiezen</button>
        </div>}
      </>}
      <h2>Referentieniveaus</h2>
      <label className="toggle"><input type="checkbox" checked={state.showLevels} onChange={(event) => state.setShowLevels(event.target.checked)} />Niveau tonen</label>
      {levels.map((level) => <div className="level-row" key={level.id}>
        <label className="field"><span>Naam</span><input aria-label="Niveaunaam" value={level.name} onChange={(event) => state.updateReferenceLevel(level.id, { name: event.target.value })} /></label>
        <label className="field"><span>Hoogte (m)</span><input aria-label={`${level.name} hoogte`} type="number" step="0.1" value={level.elevationM} onChange={(event) => state.updateReferenceLevel(level.id, { elevationM: Number(event.target.value) })} /></label>
        <button className="btn btn--ghost" onClick={() => state.removeReferenceLevel(level.id)}>Niveau verwijderen</button>
      </div>)}
      <form className="level-form" onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || height.trim() === '' || !Number.isFinite(Number(height))) return;
        state.addReferenceLevel(name, Number(height));
        setName('');
      }}>
        <label className="field"><span>Nieuw niveau</span><input required value={name} placeholder="Naam" onChange={(event) => setName(event.target.value)} /></label>
        <label className="field"><span>Hoogte (m)</span><input required type="number" step="0.1" value={height} onChange={(event) => setHeight(event.target.value)} /></label>
        <button className="btn" type="submit">Niveau toevoegen</button>
      </form>
    </section>
  );
}