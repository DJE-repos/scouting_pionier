import { useEffect, useRef, useState } from 'react';
import { KNOT_SUGGESTIONS } from '../model/defaults';

interface Props {
  open: boolean;
  initialName?: string;
  beamCount: number;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function KnotDialog({ open, initialName = '', beamCount, onConfirm, onCancel }: Props) {
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

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Knoop maken</h2>
        <p className="hint">
          {beamCount === 1
            ? 'Knoop op 1 balk (verplaatsbaar over de balk).'
            : `${beamCount} balken worden verbonden.`}
        </p>
        <label className="field">
          <span>Knoopnaam</span>
          <input
            ref={inputRef}
            list="knot-suggestions"
            value={name}
            placeholder={beamCount === 1 ? 'bijv. mastworp of achtknoop' : 'bijv. kruissjorring'}
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
