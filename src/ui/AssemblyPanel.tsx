import { useState } from 'react';
import { useEditor } from '../store/projectStore';

export function AssemblyPanel() {
  const library = useEditor((s) => s.library);
  const selectedBeamIds = useEditor((s) => s.selectedBeamIds);
  const saveSelectionAsAssembly = useEditor((s) => s.saveSelectionAsAssembly);
  const addAssemblyInstance = useEditor((s) => s.addAssemblyInstance);
  const deleteAssemblyDef = useEditor((s) => s.deleteAssemblyDef);
  const [name, setName] = useState('');
  const [temporaryMeasure, setTemporaryMeasure] = useState(false);

  return (
    <div className="panel__body">
      <h3>Nieuwe assembly</h3>
      <p className="hint">
        Selecteer balken in het model en sla ze op als herbruikbare assembly. Knopen tussen de
        geselecteerde balken gaan mee.
      </p>
      <label className="field">
        <span>Naam</span>
        <input
          value={name}
          placeholder="bijv. driepoot"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field field--check">
        <input
          type="checkbox"
          checked={temporaryMeasure}
          onChange={(e) => setTemporaryMeasure(e.target.checked)}
        />
        <span>Tijdelijke maatregel</span>
      </label>
      <button
        className="btn btn--primary"
        disabled={!name.trim() || selectedBeamIds.length === 0}
        onClick={() => {
          saveSelectionAsAssembly(name.trim(), temporaryMeasure);
          setName('');
          setTemporaryMeasure(false);
        }}
      >
        Opslaan uit selectie ({selectedBeamIds.length})
      </button>

      <h3>Bibliotheek</h3>
      {library.defs.length === 0 && <p className="hint">Nog geen assemblies opgeslagen.</p>}
      <ul className="assembly-list">
        {library.defs.map((def) => (
          <li key={def.id}>
            <div>
              <strong>{def.name}</strong>
              <span className="hint">
                {def.beams.length} balken · {def.lashings.length} knopen
                {def.temporaryMeasure && ' · tijdelijke maatregel'}
              </span>
            </div>
            <div className="step__actions">
              <button
                className="btn btn--tiny"
                onClick={() => addAssemblyInstance(def.id, [0, 0, 0])}
              >
                Plaatsen
              </button>
              <button className="btn btn--tiny" onClick={() => deleteAssemblyDef(def.id)}>
                Verwijderen
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
