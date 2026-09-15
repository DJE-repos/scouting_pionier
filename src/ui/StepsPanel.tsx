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
  const moveStep = useEditor((s) => s.moveStep);
  const renameStep = useEditor((s) => s.renameStep);
  const setStepDescription = useEditor((s) => s.setStepDescription);
  const setStepIncludeContext = useEditor((s) => s.setStepIncludeContext);
  const setStepTemporary = useEditor((s) => s.setStepTemporary);
  const setStepView = useEditor((s) => s.setStepView);
  const removeStep = useEditor((s) => s.removeStep);
  const updateSettings = useEditor((s) => s.updateSettings);
  const assignSelectionToStep = useEditor((s) => s.assignSelectionToStep);
  const removeSelectedTemporaryMeasures = useEditor((s) => s.removeSelectedTemporaryMeasures);
  const setSelection = useEditor((s) => s.setSelection);

  const model = useMemo(() => resolveModel(project, library), [project, library]);
  const activeStepIndex = previewStep ?? Math.max(0, project.steps.length - 1);
  const activeStep = project.steps.find((step) => step.index === activeStepIndex);
  const stepLabel = (step: (typeof project.steps)[number]) =>
    step.index === 0 ? step.title : `${step.index}. ${step.title}`;

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
        <span>Bewerk- en voorbeeldstap</span>
        <select
          value={previewStep ?? ''}
          onChange={(e) => setPreviewStep(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">alles tonen</option>
          {project.steps.map((s) => (
            <option key={s.index} value={s.index}>
                t/m {stepLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <div className="step-context">
        <strong>
          Actieve stap: {activeStep ? stepLabel(activeStep) : 'Geen stap'}
        </strong>
        <span>
          Verplaatsen en draaien worden opgeslagen in de actieve stap en gelden vanaf deze stap.
        </span>
      </div>

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
              className={`step${activeStepIndex === step.index ? ' step--active' : ''}${
                step.temporary ? ' step--temporary' : ''
              }`}
            >
              <div className="step__header">
                <input
                  value={step.title}
                  disabled={step.index === 0}
                  onChange={(e) => renameStep(step.index, e.target.value)}
                />
                <div className="step__tags">
                  <span className="step__tag">{counts.beams} balken</span>
                  <span className="step__tag">{counts.knots} knopen</span>
                  {step.temporary && <span className="step__tag step__tag--warning">tussenstap</span>}
                </div>
                <div className="step__controls">
                  <button
                    className="btn btn--tiny btn--icon"
                    disabled={step.index <= 1}
                    aria-label={`Verplaats ${step.title} omhoog`}
                    title="Stap omhoog"
                    onClick={() => moveStep(step.index, 'up')}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    className="btn btn--tiny btn--icon"
                    disabled={step.index === 0 || step.index === project.steps.length - 1}
                    aria-label={`Verplaats ${step.title} omlaag`}
                    title="Stap omlaag"
                    onClick={() => moveStep(step.index, 'down')}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                  <button
                    className="btn btn--tiny btn--icon"
                    disabled={step.index === 0}
                    aria-label={`Verwijder ${step.title}`}
                    title={step.index === 0 ? 'De eerste stap kan niet worden verwijderd' : 'Stap verwijderen'}
                    onClick={() => removeStep(step.index)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              </div>

              <textarea
                className="step__description"
                value={step.description ?? ''}
                placeholder="Typ hier je toelichting"
                rows={1}
                onChange={(e) => setStepDescription(step.index, e.target.value)}
              />

              <div className="step__meta">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={step.index === 0 ? false : step.temporary ?? false}
                    disabled={step.index === 0}
                    onChange={(e) => setStepTemporary(step.index, e.target.checked)}
                  />
                  Tussenstap
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={step.index === 0 || (step.includeContext ?? false)}
                    disabled={step.index === 0}
                    onChange={(e) => setStepIncludeContext(step.index, e.target.checked)}
                  />
                  Context 
                </label>
                <span className="hint step__view">
                  Aanzicht {formatAngles(anglesForStep(step, project.settings))}
                  {step.viewAzimuthDeg === undefined ? ' (standaard)' : ''}
                </span>
              </div>

              <div className="step__actions">
                <button
                  className="btn btn--tiny"
                  onClick={() => {
                    const angles = captureAngles();
                    if (angles) setStepView(step.index, angles);
                  }}
                >
                  Camera
                </button>
                {step.viewAzimuthDeg !== undefined && (
                  <button className="btn btn--tiny" onClick={() => setStepView(step.index, null)}>
                    Standaard
                  </button>
                )}
                <button className="btn btn--tiny" onClick={() => setPreviewStep(step.index)}>
                  Toon
                </button>
                <button className="btn btn--tiny" onClick={() => assignSelectionToStep(step.index)}>
                  Hierheen
                </button>
              </div>

              <div className="step__actions step__actions--secondary">
                <button
                  className="btn btn--tiny"
                  onClick={() => removeSelectedTemporaryMeasures(step.index)}
                >
                  Verwijder voorziening
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
        in de materiaalstaat en verdwijnt zodra je een volgende stap bekijkt. Selecteer een
        tijdelijke maatregel en klik bij de gewenste stap op &ldquo;Voorziening verwijderen&rdquo;.
      </p>
    </div>
  );
}
