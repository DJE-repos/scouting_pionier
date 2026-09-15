import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store/projectStore';
import { resolveModel } from '../model/resolve';
import { buildIfc } from '../export/ifc/ifcExport';
import { generateManual } from '../export/pdf/manual';
import { downloadBlob, pickFile } from '../persistence/download';
import { deserialize, serialize } from '../persistence/storage';
import { KnotDialog } from './KnotDialog';
import { HelpDialog } from './HelpDialog';

export function Toolbar() {
  const project = useEditor((s) => s.project);
  const library = useEditor((s) => s.library);
  const settings = project.settings;
  const selectedBeamIds = useEditor((s) => s.selectedBeamIds);
  const selectedLashingIds = useEditor((s) => s.selectedLashingIds);
  const selectedRopeIds = useEditor((s) => s.selectedRopeIds);
  const transformMode = useEditor((s) => s.transformMode);
  const boxSelectMode = useEditor((s) => s.boxSelectMode);
  const cameraProjection = useEditor((s) => s.cameraProjection);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const previewStep = useEditor((s) => s.previewStep);
  const activeStepIndex = previewStep ?? Math.max(0, project.steps.length - 1);
  const activeStep = project.steps.find((step) => step.index === activeStepIndex);

  const [knotDialogOpen, setKnotDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleOpenKnot = () => {
      const { selectedBeamIds, selectedRopeIds } = useEditor.getState();
      if (selectedBeamIds.length >= 1 || selectedRopeIds.length >= 1) {
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

      <div className="active-step" aria-live="polite">
        <span className="active-step__label">Actieve stap</span>
        <strong>
          {activeStep
            ? activeStep.index === 0
              ? activeStep.title
              : `${activeStep.index}. ${activeStep.title}`
            : 'Geen stap'}
        </strong>
        {previewStep === null && <span className="active-step__mode">laatste stap</span>}
      </div>

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
          title="Selectiekader (beta) (B) of houd Shift ingedrukt tijdens slepen"
        >
          Selectiekader (beta)
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
          disabled={selectedBeamIds.length === 0 && selectedRopeIds.length === 0}
          onClick={() => setKnotDialogOpen(true)}
          title={
            selectedBeamIds.length + selectedRopeIds.length <= 1
              ? 'Knoop maken op balk of touw (K)'
              : 'Knoop maken tussen geselecteerde elementen (K)'
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
        <button className="btn" onClick={() => useEditor.getState().selectAll()}>
          Selecteer alles
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
        <button
          ref={helpButtonRef}
          className="btn btn--help"
          onClick={() => setHelpOpen(true)}
          aria-label="Help openen"
          title="Help en uitleg openen"
        >
          ?
        </button>
      </div>

      <HelpDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        triggerRef={helpButtonRef}
      />

      <KnotDialog
        open={knotDialogOpen}
        beamCount={selectedBeamIds.length}
        ropeCount={selectedRopeIds.length}
        onCancel={() => setKnotDialogOpen(false)}
        onConfirm={(name) => {
          useEditor.getState().createLashing(name);
          setKnotDialogOpen(false);
        }}
      />
    </header>
  );
}
