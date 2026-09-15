import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

export function HelpDialog({ open, onClose, triggerRef }: HelpDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    return () => triggerRef.current?.focus();
  }, [open, triggerRef]);

  if (!open) return null;

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const elements = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!elements?.length) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop help-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="help-dialog__header">
          <div>
            <p className="help-dialog__eyebrow">Pionier 3D</p>
            <h2 id="help-dialog-title">Handleiding</h2>
          </div>
          <button ref={closeRef} className="btn btn--icon help-dialog__close" onClick={onClose} aria-label="Handleiding sluiten" title="Sluiten">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <div className="help-dialog__content">
          <p className="help-dialog__intro">
            Met Pionier 3D bouw je een pionierconstructie in een 3D-model. Plaats balken en context,
            leg knopen en touwen vast, werk stap voor stap en exporteer daarna een materiaalstaat,
            IFC-model of bouwinstructie.
          </p>

          <nav className="help-dialog__contents" aria-label="Inhoudsopgave">
            <strong>In deze handleiding</strong>
            <a href="#help-start">Beginnen</a>
            <a href="#help-model">Model opbouwen</a>
            <a href="#help-edit">Selecteren en bewerken</a>
            <a href="#help-steps">Bouwstappen</a>
            <a href="#help-output">Materiaal en export</a>
            <a href="#help-shortcuts">Sneltoetsen</a>
          </nav>

          <HelpSection id="help-start" title="Beginnen">
            <p>
              Links staan de gereedschappen om balken en contextobjecten te plaatsen. In het midden
              staat de 3D-viewport. Rechts vind je de tabs <strong>Eigenschappen</strong>,
              <strong>Materiaal</strong>, <strong>Stappen</strong> en <strong>Assemblies</strong>.
              Bovenin staan bewerken, camera, knopen, opslag en export.
            </p>
            <p>
              De projectnaam is linksboven direct te wijzigen. Je werk wordt automatisch in de
              browser opgeslagen. Gebruik <strong>Opslaan</strong> om ook een deelbaar
              <code>.pionier.json</code>-bestand te maken.
            </p>
          </HelpSection>

          <HelpSection id="help-model" title="Model opbouwen">
            <h4>Balken plaatsen</h4>
            <p>Kies links een standaardlengte en klik daarna op het maaiveld in de viewport. Klik opnieuw op de actieve lengte of op <strong>Plaatsen annuleren</strong> om de modus te stoppen.</p>
            <h4>Context plaatsen</h4>
            <p>Kies <strong>Gebouw</strong>, <strong>Boom</strong>, <strong>Volwassene</strong> of <strong>Kind</strong> en klik in de grond. Context maakt de omgeving en schaal zichtbaar; het is geen constructieonderdeel.</p>
            <h4>Instellingen</h4>
            <p><strong>Diameter</strong> bepaalt de standaarddiameter van nieuwe balken. Met <strong>Rastersnap</strong> zet je posities op vaste afstanden. <strong>Hoeksnap</strong> rondt draairichtingen af. <strong>Maaiveld</strong> bepaalt de afmeting van het zichtbare grondvlak.</p>
            <h4>Knopen en touwen</h4>
            <p>Selecteer een of meer balken of touwen en kies <strong>Knoop maken</strong>. Geef de knoop een naam, bijvoorbeeld mastworp of kruissjorring. Selecteer precies twee knopen en kies <strong>Touw spannen</strong> om een verbinding te maken.</p>
          </HelpSection>

          <HelpSection id="help-edit" title="Selecteren en bewerken">
            <p>Klik een balk, knoop, touw, contextobject of assembly aan. Houd <strong>Shift</strong> ingedrukt om elementen toe te voegen aan de selectie. Met <strong>Selectiekader (beta)</strong> sleep je een kader rond meerdere elementen.</p>
            <p>De gizmo verschijnt bij een selectie. Kies <strong>Verplaatsen</strong> of <strong>Draaien</strong> bovenin en sleep de pijlen, vlakken of ringen. Meerdere geselecteerde elementen bewegen samen. De actieve stap bepaalt vanaf welke bouwstap een verplaatsing of draaiing geldt.</p>
            <p>In <strong>Eigenschappen</strong> pas je onder andere balklengte, diameter en naam aan. Bij een knoop kun je de naam, touwlengte en kleur wijzigen. Bij een touwverbinding zijn naam, diameter, extra lengte en kleur beschikbaar. Contextobjecten hebben positie- en type-eigenschappen.</p>
            <p>Gebruik <strong>Verwijderen</strong> om de selectie te verwijderen. Met <strong>Selecteer alles</strong> selecteer je alle bewerkbare modelonderdelen.</p>
            <h4>Viewport en camera</h4>
            <p>Gebruik de muis om de camera rond het model te bewegen, in te zoomen en te verschuiven. Kies bovenin tussen <strong>Perspectief</strong> en <strong>Orthografisch</strong>. Onderaan vind je <strong>Maatvoering</strong> voor afstand, hoogte en hoek; klik de gevraagde punten in de viewport aan en gebruik <strong>Wis stap</strong> om maatvoeringen van de actieve stap te verwijderen.</p>
            <h4>Labels en tijdelijke maatregelen</h4>
            <p>Schakel <strong>Labels</strong> in om knoopnamen in beeld te tonen. Met <strong>Alleen selectie</strong> beperk je die labels tot geselecteerde onderdelen. Markeer een balk, knoop of touw als <strong>Tijdelijke maatregel</strong> wanneer het alleen tijdens de bouw nodig is; dit verschijnt apart in de materiaalstaat.</p>
          </HelpSection>

          <HelpSection id="help-steps" title="Bouwstappen">
            <p>Nieuwe balken, knopen en touwen krijgen automatisch de actieve stap. Open de tab <strong>Stappen</strong> om stappen toe te voegen, te hernoemen, te verplaatsen of te verwijderen. De eerste stap is het vertrekpunt en kan niet worden verwijderd.</p>
            <p>Met <strong>Bewerk- en voorbeeldstap</strong> kies je <strong>alles tonen</strong> of bekijk je het model tot en met een specifieke stap. Met <strong>Hierheen</strong> verplaats je de geselecteerde elementen naar die stap. <strong>Toon</strong> maakt een stap actief als voorbeeld.</p>
            <p>Een <strong>Tussenstap</strong> beschrijft tijdelijk voorbouwwerk. Vink <strong>Context</strong> uit wanneer de omgeving in die stap niet nodig is. Voeg per stap een toelichting toe en leg desgewenst de huidige camera vast. Die aanzichten worden gebruikt in de PDF-handleiding.</p>
            <p>Een tijdelijke voorziening in een tussenstap wordt automatisch meegenomen in de benodigde materialen, maar verdwijnt bij het bekijken van een volgende stap. Gebruik <strong>Verwijder voorziening</strong> om geselecteerde tijdelijke onderdelen uit die stap te halen.</p>
          </HelpSection>

          <HelpSection id="help-output" title="Materiaal en export">
            <h4>Materiaalstaat</h4>
            <p>De tab <strong>Materiaal</strong> telt balken per lengte en diameter, knopen en touw op. Tijdelijke maatregelen staan apart vermeld. Kies <strong>Exporteer CSV</strong> voor gebruik in een spreadsheet of bestellijst.</p>
            <h4>Assemblies</h4>
            <p>Selecteer balken en knopen en open de tab <strong>Assemblies</strong>. Geef de selectie een naam en kies <strong>Opslaan uit selectie</strong>. Plaats een opgeslagen assembly opnieuw met <strong>Plaatsen</strong>. Met <strong>Uit elkaar halen</strong> maak je een assembly-instance weer los.</p>
            <h4>Bestanden en exports</h4>
            <p><strong>Openen</strong> leest een eerder opgeslagen <code>.pionier.json</code>-bestand in, inclusief assemblybibliotheek. <strong>Opslaan</strong> downloadt het volledige project als JSON. <strong>IFC</strong> maakt een IFC-export van het opgeloste model. <strong>Handleiding (PDF)</strong> maakt een bouwboek met de stappen, toelichtingen en de vastgelegde aanzichten.</p>
            <p>De app is een ontwerphulpmiddel. Zij berekent geen draagkracht, fysica, veiligheid of stabiliteit. Controleer een constructie altijd zelf en bouw onder deskundige begeleiding.</p>
          </HelpSection>

          <HelpSection id="help-shortcuts" title="Sneltoetsen">
            <dl className="help-shortcuts">
              <Shortcut keys="G">Verplaatsen</Shortcut>
              <Shortcut keys="R">Draaien</Shortcut>
              <Shortcut keys="B">Selectiekader aan/uit</Shortcut>
              <Shortcut keys="L">Labels aan/uit</Shortcut>
              <Shortcut keys="K">Knoop maken</Shortcut>
              <Shortcut keys="T">Touw spannen tussen twee geselecteerde knopen</Shortcut>
              <Shortcut keys="Delete / Backspace">Geselecteerde elementen verwijderen</Shortcut>
              <Shortcut keys="Ctrl/Cmd + Z">Ongedaan maken</Shortcut>
              <Shortcut keys="Ctrl/Cmd + Y">Opnieuw</Shortcut>
              <Shortcut keys="Ctrl/Cmd + Shift + Z">Opnieuw</Shortcut>
              <Shortcut keys="Escape">Plaatsingsmodus stoppen en selectie wissen</Shortcut>
            </dl>
            <p className="hint">In invoervelden blijven deze toetsen onderdeel van de normale tekstbewerking.</p>
          </HelpSection>
        </div>
      </div>
    </div>
  );
}

function HelpSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="help-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Shortcut({ keys, children }: { keys: string; children: React.ReactNode }) {
  return (
    <div>
      <dt><kbd>{keys}</kbd></dt>
      <dd>{children}</dd>
    </div>
  );
}