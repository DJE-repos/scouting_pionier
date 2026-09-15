import { useEditor } from '../store/projectStore';
import type { MeasurementType } from '../model/types';

const TOOLS: { type: MeasurementType; label: string; hint: string }[] = [
  { type: 'distance', label: 'Afstand', hint: '2 punten' },
  { type: 'height', label: 'Hoogte', hint: 'basis + top' },
  { type: 'angle', label: 'Hoek', hint: '3 punten' },
];

export function MeasurementToolbar() {
  const project = useEditor((state) => state.project);
  const previewStep = useEditor((state) => state.previewStep);
  const mode = useEditor((state) => state.measurementMode);
  const points = useEditor((state) => state.measurementPoints);
  const setMode = useEditor((state) => state.setMeasurementMode);
  const clearStep = useEditor((state) => state.clearMeasurementsForStep);
  const activeStep = previewStep ?? Math.max(0, project.steps.length - 1);
  const stepMeasurements = project.measurements.filter((measurement) => measurement.stepIndex === activeStep);
  const activeTitle = project.steps.find((step) => step.index === activeStep)?.title ?? 'huidige stap';

  return (
    <div className="measurement-toolbar" aria-label="3D maatvoering">
      <div className="measurement-toolbar__title">
        <span className="measurement-toolbar__eyebrow">Maatvoering</span>
        <strong>{activeTitle}</strong>
      </div>
      <div className="measurement-toolbar__tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.type}
            className={`measurement-tool${mode === tool.type ? ' measurement-tool--active' : ''}`}
            onClick={() => setMode(mode === tool.type ? null : tool.type)}
            title={`${tool.label}: ${tool.hint}`}
          >
            <span className="measurement-tool__icon">{tool.type === 'distance' ? '↔' : tool.type === 'height' ? '↕' : '∠'}</span>
            <span>{tool.label}</span>
          </button>
        ))}
      </div>
      <span className="measurement-toolbar__status">
        {mode ? `${points.length} punt${points.length === 1 ? '' : 'en'} gezet` : `${stepMeasurements.length} maat${stepMeasurements.length === 1 ? '' : 'voeringen'}`}
      </span>
      {mode && <button className="measurement-toolbar__cancel" onClick={() => setMode(null)}>Annuleren</button>}
      <button
        className="measurement-toolbar__clear"
        disabled={stepMeasurements.length === 0}
        onClick={() => clearStep(activeStep)}
        title="Maatvoering van deze stap verwijderen"
      >
        Wis stap
      </button>
    </div>
  );
}
