import { useMemo } from 'react';
import { useEditor } from '../store/projectStore';
import { resolveModel } from '../model/resolve';
import { anglesForStep, anglesFromDirection, formatAngles } from '../model/views';
import { currentViewDirection } from '../scene/snapshot';

export function StepsPanel() {
  const project = useEditor((s) => s.project);
  const library = useEditor((s) => s.library);
  const previewStep = useEditor((s) => s.previewStep);
  const setPreviewStep = useEditor((s) => s.setPreviewStep);
  const addStep = useEditor((s) => s.addStep);
  const renameStep = useEditor((s) => s.renameStep);
  const setStepTemporary = useEditor((s) => s.setStepTemporary);
  const setStepView = useEditor((s) => s.setStepView);
  const updateSettings = useEditor((s) => s.updateSettings);
  const assignSelectionToStep = useEditor((s) => s.assignSelectionToStep);
  const setSelection = useEditor((s) => s.setSelection);

  const model = useMemo(() => resolveModel(project, library), [project, library]);

  const countsFor = (index: number) => ({
    beams: model.beams.filter((b) => b.stepIndex === index).length,
    knots: model.lashings.filter((l) => l.stepIndex === index).length,
  });

  const captureAngles = () => {
    const direction = currentViewDirection();
    return direction ? anglesFromDirection(direction) : null;
  };

  return (
    <div className="panel__body">
      <p className="hint">
        Elementen krijgen automatisch de actieve stap. Selecteer elementen en klik op
        &ldquo;Hierheen&rdquo; om ze te verplaatsen.
      </p>

      <label className="field">
        <span>Voorbeeld</span>
        <select
          value={previewStep ?? ''}
          onChange={(e) => setPreviewStep(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">alles tonen</option>
          {project.steps.map((s) => (
            <option key={s.index} value={s.index}>
              t/m {s.title}
            </option>
          ))}
        </select>
      </label>

      <h3>Aanzichten in de handleiding</h3>
      <p className="hint">
        Draai het model in beeld zoals je het in het boekje wilt en leg het standpunt vast. Het
        vooraanzicht kijkt vanuit dezelfde kant, het bovenaanzicht draait mee.
      </p>
      <div className="step__actions">
        <span className="hint">
          Standaard: {formatAngles(anglesForStep(undefined, project.settings))}
        </span>
        <button
          className="btn btn--tiny"
          onClick={() => {
            const angles = captureAngles();
            if (angles)
              updateSettings({
                viewAzimuthDeg: angles.azimuthDeg,
                viewElevationDeg: angles.elevationDeg,
              });
          }}
        >
          Leg huidige camera vast
        </button>
      </div>

      <ul className="step-list">
        {project.steps.map((step) => {
          const counts = countsFor(step.index);
          return (
            <li
              key={step.index}
              className={`step${previewStep === step.index ? ' step--active' : ''}${
                step.temporary ? ' step--temporary' : ''
              }`}
            >
              <input value={step.title} onChange={(e) => renameStep(step.index, e.target.value)} />
              <span className="hint">
                {counts.beams} balken · {counts.knots} knopen
                {step.temporary ? ' · telt niet mee' : ''}
              </span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={step.temporary ?? false}
                  onChange={(e) => setStepTemporary(step.index, e.target.checked)}
                />
                Tussenstap
              </label>
              <div className="step__actions">
                <span className="hint">
                  Aanzicht {formatAngles(anglesForStep(step, project.settings))}
                  {step.viewAzimuthDeg === undefined ? ' (standaard)' : ''}
                </span>
                <button
                  className="btn btn--tiny"
                  onClick={() => {
                    const angles = captureAngles();
                    if (angles) setStepView(step.index, angles);
                  }}
                >
                  Camera vastleggen
                </button>
                {step.viewAzimuthDeg !== undefined && (
                  <button className="btn btn--tiny" onClick={() => setStepView(step.index, null)}>
                    Standaard
                  </button>
                )}
              </div>
              <div className="step__actions">
                <button className="btn btn--tiny" onClick={() => setPreviewStep(step.index)}>
                  Toon
                </button>
                <button className="btn btn--tiny" onClick={() => assignSelectionToStep(step.index)}>
                  Hierheen
                </button>
                <button
                  className="btn btn--tiny"
                  onClick={() =>
                    setSelection(
                      model.beams.filter((b) => b.stepIndex === step.index).map((b) => b.id),
                    )
                  }
                >
                  Selecteer
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <button className="btn btn--ghost" onClick={() => addStep()}>
        Stap toevoegen
      </button>
      <p className="hint">
        Een tussenstap toont hoe je een onderdeel op de grond voorbouwt. Dat materiaal telt niet mee
        in de materiaalstaat en verdwijnt zodra je een volgende stap bekijkt.
      </p>
    </div>
  );
}
