import { useMemo } from 'react';
import { useEditor } from '../store/projectStore';
import { resolveModel } from '../model/resolve';
import { billOfMaterialsToCsv, computeBillOfMaterials } from '../export/billOfMaterials';
import { downloadBlob } from '../persistence/download';

export function MaterialPanel() {
  const project = useEditor((s) => s.project);
  const library = useEditor((s) => s.library);

  const bom = useMemo(
    () => computeBillOfMaterials(resolveModel(project, library)),
    [project, library],
  );

  return (
    <div className="panel__body">
      <h3>Balken</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Lengte</th>
            <th>Ø</th>
            <th>Aantal</th>
            <th>Totaal</th>
          </tr>
        </thead>
        <tbody>
          {bom.beams.map((row) => (
            <tr key={`${row.lengthM}-${row.diameterMm}`}>
              <td>{row.lengthM} m</td>
              <td>{row.diameterMm} mm</td>
              <td>{row.count}</td>
              <td>{row.totalLengthM.toFixed(1)} m</td>
            </tr>
          ))}
          {bom.beams.length === 0 && (
            <tr>
              <td colSpan={4} className="hint">
                Nog geen balken.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Totaal</td>
            <td>{bom.totalBeams}</td>
            <td>{bom.totalBeamLengthM.toFixed(1)} m</td>
          </tr>
        </tfoot>
      </table>

      <h3>Knopen &amp; touw</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Knoop</th>
            <th>Aantal</th>
            <th>Touw</th>
          </tr>
        </thead>
        <tbody>
          {bom.knots.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{row.count}</td>
              <td>{row.totalRopeM.toFixed(1)} m</td>
            </tr>
          ))}
          {bom.knots.length === 0 && (
            <tr>
              <td colSpan={3} className="hint">
                Nog geen knopen.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td>Totaal</td>
            <td>{bom.totalKnots}</td>
            <td>{bom.totalRopeM.toFixed(1)} m</td>
          </tr>
        </tfoot>
      </table>

      <button
        className="btn btn--ghost"
        onClick={() =>
          downloadBlob(
            new Blob([billOfMaterialsToCsv(bom)], { type: 'text/csv;charset=utf-8' }),
            `${project.name}-materiaalstaat.csv`,
          )
        }
      >
        Exporteer CSV
      </button>

      {(bom.temporaryBeams.length > 0 || bom.temporaryKnots.length > 0) && (
        <>
          <h3>Tijdelijk in tussenstappen</h3>
          <p className="hint">Al meegeteld hierboven; niet extra nodig.</p>
          <table className="table table--muted">
            <tbody>
              {bom.temporaryBeams.map((row) => (
                <tr key={`${row.lengthM}-${row.diameterMm}`}>
                  <td>
                    balk {row.lengthM} m ({row.diameterMm} mm)
                  </td>
                  <td>{row.count}</td>
                </tr>
              ))}
              {bom.temporaryKnots.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
