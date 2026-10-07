import { useEffect, useRef, useState } from 'react';
import { Vector2 } from 'three';
import { useEditor } from '../store/projectStore';
import { resolveModel } from '../model/resolve';
import { buildIfc } from '../export/ifc/ifcExport';
import { generateManual } from '../export/pdf/manual';
import { downloadBlob, pickFile } from '../persistence/download';
import { deserialize, serialize } from '../persistence/storage';
import { getCanvasHandle } from '../scene/snapshot';
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
  const animationTimeStep = useEditor((s) => s.animationTimeStep);
  const setAnimationTimeStep = useEditor((s) => s.setAnimationTimeStep);
  const activeStepIndex = previewStep ?? Math.max(0, project.steps.length - 1);
  const activeStep = project.steps.find((step) => step.index === activeStepIndex);
  const lastStep = Math.max(0, project.steps.length - 1);

  const [knotDialogOpen, setKnotDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoError, setVideoError] = useState('');
  const cancelVideoRef = useRef(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!playing) return;
    let frameId = 0;
    let previousTime: number | null = null;
    const advance = (now: number) => {
      const current = useEditor.getState().animationTimeStep ?? 0;
      const delta = previousTime === null ? 0 : (now - previousTime) / 2000;
      previousTime = now;
      const next = current + delta;
      if (next >= lastStep) {
        setAnimationTimeStep(lastStep);
        setPlaying(false);
        return;
      }
      setAnimationTimeStep(next);
      frameId = requestAnimationFrame(advance);
    };
    frameId = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frameId);
  }, [playing, lastStep, setAnimationTimeStep]);

  useEffect(() => {
    if (animationTimeStep !== null && animationTimeStep > lastStep) {
      setAnimationTimeStep(lastStep);
      setPlaying(false);
    }
  }, [animationTimeStep, lastStep, setAnimationTimeStep]);

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

  const exportVideo = async () => {
    const canvasHandle = getCanvasHandle();
    const canvas = canvasHandle?.gl.domElement;
    if (!canvas || !('captureStream' in canvas) || typeof MediaRecorder === 'undefined') {
      setVideoError('Video-opname wordt niet ondersteund door deze browser.');
      return;
    }

    const mimeTypes = [
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ].filter((type) => MediaRecorder.isTypeSupported(type));
    if (mimeTypes.length === 0) {
      setVideoError('Deze browser ondersteunt geen MP4- of WebM-video-opname.');
      return;
    }

    const originalTime = useEditor.getState().animationTimeStep;
    const savedSize = canvasHandle.gl.getSize(new Vector2());
    const savedPixelRatio = canvasHandle.gl.getPixelRatio();
    const largestSourceDimension = Math.max(canvas.width, canvas.height);
    const resolutionScale = Math.max(1, 1920 / largestSourceDimension);
    const videoWidth = Math.round(canvas.width * resolutionScale);
    const videoHeight = Math.round(canvas.height * resolutionScale);
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let mimeType = '';
    cancelVideoRef.current = false;
    setVideoError('');
    setVideoBusy(true);
    try {
      canvasHandle.gl.setPixelRatio(1);
      canvasHandle.gl.setSize(videoWidth, videoHeight, false);
      setAnimationTimeStep(0);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      stream = canvas.captureStream(30);
      for (const candidate of mimeTypes) {
        try {
          recorder = new MediaRecorder(stream, { mimeType: candidate });
          mimeType = recorder.mimeType || candidate;
          break;
        } catch {
          recorder = null;
        }
      }
      if (!recorder) throw new Error('Opnemen als MP4 of WebM is niet gelukt.');
      const chunks: BlobPart[] = [];
      const recorded = new Promise<Blob>((resolve, reject) => {
        recorder!.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder!.onerror = () => reject(new Error('Opnemen van de video is mislukt.'));
        recorder!.onstop = () =>
          resolve(new Blob(chunks, { type: recorder!.mimeType || mimeType }));
      });

      recorder.start(250);
      await new Promise<void>((resolve) => {
        const start = performance.now();
        const durationMs = lastStep * 2000 + 1000;
        const advance = (now: number) => {
          const elapsed = now - start;
          if (cancelVideoRef.current || elapsed >= durationMs) {
            if (!cancelVideoRef.current) setAnimationTimeStep(lastStep);
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            return;
          }
          setAnimationTimeStep(Math.min(lastStep, elapsed / 2000));
          requestAnimationFrame(advance);
        };
        requestAnimationFrame(advance);
      });

      if (recorder.state !== 'inactive') recorder.stop();
      const blob = await recorded;
      if (!cancelVideoRef.current) {
        const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
        downloadBlob(blob, `${project.name}-bouwstappen.${extension}`);
      }
    } catch (error) {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      setVideoError(error instanceof Error ? error.message : 'Video-opname is mislukt.');
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      canvasHandle.gl.setPixelRatio(savedPixelRatio);
      canvasHandle.gl.setSize(savedSize.x, savedSize.y, false);
      setAnimationTimeStep(originalTime);
      setVideoBusy(false);
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

      <div className="toolbar__group toolbar__timeline" aria-label="Bouwstappen afspelen">
        <button
          className="btn btn--icon"
          disabled={lastStep === 0 || videoBusy}
          onClick={() => {
            if (playing) {
              setPlaying(false);
              return;
            }
            const current = useEditor.getState().animationTimeStep;
            setAnimationTimeStep(current === null || current >= lastStep ? 0 : current);
            setPlaying(true);
          }}
          aria-label={playing ? 'Pauzeren' : 'Animatie afspelen'}
          title={playing ? 'Pauzeren' : 'Animatie afspelen'}
        >
          <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>
        </button>
        <input
          className="timeline-slider"
          type="range"
          min={0}
          max={lastStep}
          step={0.01}
          value={animationTimeStep ?? lastStep}
          aria-label="Animatiepositie"
          onChange={(event) => {
            setPlaying(false);
            setAnimationTimeStep(Number(event.target.value));
          }}
        />
        <span className="timeline-position">
          {((animationTimeStep ?? lastStep) + 1).toFixed(1)} / {project.steps.length}
        </span>
        <button
          className="btn"
          disabled={videoBusy || lastStep === 0}
          onClick={() => void exportVideo()}
          title="Neem alle bouwstappen op in hoge resolutie (maximaal 1920 px)"
        >
          Video
        </button>
        {videoBusy && (
          <button
            className="btn"
            onClick={() => {
              cancelVideoRef.current = true;
            }}
          >
            Annuleren
          </button>
        )}
        {videoError && <span className="toolbar__error" role="alert">{videoError}</span>}
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
