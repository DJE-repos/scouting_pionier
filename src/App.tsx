import { useEffect, useState } from 'react';
import { Viewport } from './scene/Viewport';
import { Toolbar } from './ui/Toolbar';
import { BeamPalette } from './ui/BeamPalette';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { MaterialPanel } from './ui/MaterialPanel';
import { StepsPanel } from './ui/StepsPanel';
import { AssemblyPanel } from './ui/AssemblyPanel';
import { useEditor } from './store/projectStore';
import { loadFromStorage, saveToStorage } from './persistence/storage';

const TABS = ['Eigenschappen', 'Materiaal', 'Stappen', 'Assemblies'] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [tab, setTab] = useState<Tab>('Eigenschappen');
  const project = useEditor((s) => s.project);
  const library = useEditor((s) => s.library);

  useEffect(() => {
    loadFromStorage().then((saved) => {
      if (!saved) return;
      useEditor.getState().loadProject(saved.project);
      useEditor.getState().loadLibrary(saved.library);
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void saveToStorage(project, library), 800);
    return () => clearTimeout(timer);
  }, [project, library]);

  useKeyboardShortcuts();

  return (
    <div className="app">
      <Toolbar />
      <main className="app__body">
        <BeamPalette />
        <div className="viewport">
          <Viewport />
        </div>
        <aside className="panel panel--right">
          <nav className="tabs">
            {TABS.map((t) => (
              <button
                key={t}
                className={tab === t ? 'tab tab--active' : 'tab'}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
          {tab === 'Eigenschappen' && <PropertiesPanel />}
          {tab === 'Materiaal' && <MaterialPanel />}
          {tab === 'Stappen' && <StepsPanel />}
          {tab === 'Assemblies' && <AssemblyPanel />}
        </aside>
      </main>
    </div>
  );
}

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable) return;
      const store = useEditor.getState();

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? store.redo() : store.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'g':
          store.setTransformMode('translate');
          break;
        case 'r':
          store.setTransformMode('rotate');
          break;
        case 'b':
          store.toggleBoxSelect();
          break;
        case 'l':
          store.updateSettings({ showLabels: !store.project.settings.showLabels });
          break;
        case 'k':
          if (store.selectedBeamIds.length >= 1) {
            window.dispatchEvent(new CustomEvent('pionier:open-knot-dialog'));
          }
          break;
        case 't':
          if (store.selectedLashingIds.length === 2) {
            window.dispatchEvent(new CustomEvent('pionier:span-rope'));
          }
          break;
        case 'delete':
        case 'backspace':
          store.deleteSelected();
          break;
        case 'escape':
          store.setPendingLength(null);
          store.clearSelection();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
