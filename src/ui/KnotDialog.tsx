import { useEffect, useRef, useState } from 'react';
import { KNOT_SUGGESTIONS } from '../model/defaults';

interface Props {
  open: boolean;
  initialName?: string;
  beamCount: number;
  ropeCount?: number;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function KnotDialog({
  open,
  initialName = '',
  beamCount,
  ropeCount = 0,
  onConfirm,
  onCancel,
}: Props) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      inputRef.current?.focus();
    }
  }, [open, initialName]);

  if (!open) return null;

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed);
  };

  const totalCount = beamCount + ropeCount;
  const isSingleRope = beamCount === 0 && ropeCount === 1;
  const isSingleBeam = beamCount === 1 && ropeCount === 0;

  const hintText = isSingleRope
    ? 'Knoop op 1 touw (verplaatsbaar over het touw).'
    : isSingleBeam
      ? 'Knoop op 1 balk (verplaatsbaar over de balk).'
      : `${totalCount} elementen worden verbonden.`;

  const placeholderText = isSingleRope
    ? 'bijv. mastworp, achtknoop of vlinderknoop'
    : isSingleBeam
      ? 'bijv. mastworp of achtknoop'
      : 'bijv. kruissjorring, schootsteek of platte knoop';

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Knoop maken</h2>
        <p className="hint">{hintText}</p>
        <label className="field">
          <span>Knoopnaam</span>
          <input
            ref={inputRef}
            list="knot-suggestions"
            value={name}
            placeholder={placeholderText}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') onCancel();
            }}
          />
        </label>
        <datalist id="knot-suggestions">
          {KNOT_SUGGESTIONS.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onCancel}>
            Annuleren
          </button>
          <button className="btn btn--primary" onClick={submit} disabled={!name.trim()}>
            Knoop maken
          </button>
        </div>
      </div>
    </div>
  );
}
