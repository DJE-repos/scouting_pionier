import { useEffect, useState } from 'react';
import { useEditor } from '../store/projectStore';
import { resolveModel } from '../model/resolve';
import { buildIfc } from '../export/ifc/ifcExport';
import { generateManual } from '../export/pdf/manual';
import { downloadBlob, pickFile } from '../persistence/download';
import { deserialize, serialize } from '../persistence/storage';
import { KnotDialog } from './KnotDialog';

export function Toolbar() {
  const project = useEditor((s) => s.project);
  const library = useEditor((s) => s.library);
  const settings = project.settings;
  const selectedBeamIds = useEditor((s) => s.selectedBeamIds);
  const selectedLashingIds = useEditor((s) => s.selectedLashingIds);
  const transformMode = useEditor((s) => s.transformMode);
  const boxSelectMode = useEditor((s) => s.boxSelectMode);
  const cameraProjection = useEditor((s) => s.cameraProjection);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);

  const [knotDialogOpen, setKnotDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handleOpenKnot = () => {
      if (useEditor.getState().selectedBeamIds.length >= 1) {
        setKnotDialogOpen(true);
      }
    };
    const handleSpanRope = () => {
      if (useEditor.getState().selectedLashingIds.length === 2) {
        useEditor.getState().createRope();
      }
    };
    window.addEventListener('pionier:open-knot-dialog', handleOpenKnot);
    window.addEventListener('pionier:span-rope', handleSpanRope);
    return () => {
      window.removeEventListener('pionier:open-knot-dialog', handleOpenKnot);
      window.removeEventListener('pionier:span-rope', handleSpanRope);
    };
  }, []);

  const exportIfc = () => {
    const ifc = buildIfc(project, resolveModel(project, library));
    downloadBlob(new Blob([ifc], { type: 'application/x-step' }), `${project.name}.ifc`);
  };

  const exportManual = async () => {
    setBusy(true);
    try {
      const { previewStep, setPreviewStep } = useEditor.getState();
      const blob = await generateManual(project, library, {
        setPreviewStep,
        restorePreviewStep: previewStep,
      });
      downloadBlob(blob, `${project.name}-handleiding.pdf`);
    } finally {
      setBusy(false);
    }
  };

  const saveJson = () => {
    downloadBlob(
      new Blob([serialize(project, library)], { type: 'application/json' }),
      `${project.name}.pionier.json`,
    );
  };

  const openJson = async () => {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    const { project: p, library: l } = deserialize(await file.text());
    useEditor.getState().loadProject(p);
    useEditor.getState().loadLibrary(l);
  };

  return (
    <header className="toolbar">
      <input
        className="toolbar__title"
        value={project.name}
        onChange={(e) => useEditor.getState().renameProject(e.target.value)}
      />

      <div className="toolbar__group">
        <button className="btn" disabled={!canUndo} onClick={() => useEditor.getState().undo()}>
          Ongedaan
        </button>
        <button className="btn" disabled={!canRedo} onClick={() => useEditor.getState().redo()}>
          Opnieuw
        </button>
      </div>

      <div className="toolbar__group">
        <button
          className={!boxSelectMode && transformMode === 'translate' ? 'btn btn--active' : 'btn'}
          onClick={() => useEditor.getState().setTransformMode('translate')}
          title="Verplaatsen (G)"
        >
          Verplaatsen
        </button>
        <button
          className={!boxSelectMode && transformMode === 'rotate' ? 'btn btn--active' : 'btn'}
          onClick={() => useEditor.getState().setTransformMode('rotate')}
          title="Draaien (R)"
        >
          Draaien
        </button>
        <button
          className={boxSelectMode ? 'btn btn--active' : 'btn'}
          onClick={() => useEditor.getState().toggleBoxSelect()}
          title="Selectiekader (B) of houd Shift ingedrukt tijdens slepen"
        >
          Selectiekader
        </button>
      </div>

      <div className="toolbar__group" aria-label="Cameraperspectief">
        <button
          className={cameraProjection === 'perspective' ? 'btn btn--active' : 'btn'}
          onClick={() => useEditor.getState().setCameraProjection('perspective')}
          title="Perspectivisch zicht"
        >
          Perspectief
        </button>
        <button
          className={cameraProjection === 'orthographic' ? 'btn btn--active' : 'btn'}
          onClick={() => useEditor.getState().setCameraProjection('orthographic')}
          title="Orthografisch zicht"
        >
          Orthografisch
        </button>
      </div>

      <div className="toolbar__group">
        <button
          className="btn btn--primary"
          disabled={selectedBeamIds.length < 1}
          onClick={() => setKnotDialogOpen(true)}
          title={
            selectedBeamIds.length <= 1
              ? 'Knoop maken op balk (K)'
              : 'Knoop maken tussen geselecteerde balken (K)'
          }
        >
          Knoop maken
        </button>
        <button
          className={selectedLashingIds.length === 2 ? 'btn btn--primary' : 'btn'}
          disabled={selectedLashingIds.length !== 2}
          onClick={() => useEditor.getState().createRope()}
          title="Touw spannen tussen 2 geselecteerde knopen (T)"
        >
          Touw spannen
        </button>
        <button
          className="btn"
          onClick={() => useEditor.getState().deleteSelected()}
          title="Verwijderen (Delete)"
        >
          Verwijderen
        </button>
      </div>

      <div className="toolbar__group">
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.showLabels}
            onChange={(e) => useEditor.getState().updateSettings({ showLabels: e.target.checked })}
          />
          Labels
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.labelsForSelectionOnly}
            disabled={!settings.showLabels}
            onChange={(e) =>
              useEditor.getState().updateSettings({ labelsForSelectionOnly: e.target.checked })
            }
          />
          Alleen selectie
        </label>
      </div>

      <div className="toolbar__group toolbar__group--end">
        <button className="btn" onClick={openJson}>
          Openen
        </button>
        <button className="btn" onClick={saveJson}>
          Opslaan
        </button>
        <button className="btn" onClick={exportIfc}>
          IFC
        </button>
        <button className="btn btn--primary" disabled={busy} onClick={exportManual}>
          {busy ? 'Bezig…' : 'Handleiding (PDF)'}
        </button>
      </div>

      <KnotDialog
        open={knotDialogOpen}
        beamCount={selectedBeamIds.length}
        onCancel={() => setKnotDialogOpen(false)}
        onConfirm={(name) => {
          useEditor.getState().createLashing(name);
          setKnotDialogOpen(false);
        }}
      />
    </header>
  );
}
