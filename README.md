# Pionier 3D

Web-app om scoutingconstructies in 3D te pionieren: balken plaatsen, met benoemde knopen
verbinden, assemblies hergebruiken, materiaalstaat aflezen en exporteren naar IFC en PDF.

## Starten

```powershell
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # productiebuild in dist/
```

## Bediening

| Actie | Hoe |
| --- | --- |
| Balk plaatsen | Kies een lengte (1–8 m) links en klik op de grond |
| Selecteren | Klik op een balk; shift+klik voor meerdere |
| Verplaatsen / draaien | `G` / `R`, daarna de gizmo slepen (snapt op raster en hoek) |
| Lengte wijzigen | Rechterpaneel → kies maat of vrije lengte; het *lengte-anker* bepaalt welk uiteinde blijft staan |
| Knoop maken | Selecteer 2+ balken → **Knoop maken** → vrije naam invullen |
| Labels tonen/verbergen | `L` of de **Labels**-checkbox; **Alleen selectie** toont alleen de labels bij de selectie |
| Verwijderen | `Delete` |
| Ongedaan maken | `Ctrl+Z` / `Ctrl+Shift+Z` |

## Panelen rechts

- **Eigenschappen** — maten, diameter, knoopnaam, touwlengte, kleur
- **Materiaal** — automatische materiaalstaat (balken per maat, touw per knoopsoort), tijdelijke maatregelen als losse categorie + CSV-export
- **Stappen** — bouwstappen beheren; nieuwe elementen krijgen de actieve stap. Vink **Tussenstap**
  aan voor een onderdeel dat je eerst op de grond voorbouwt: dat materiaal staat elders al in het
  model, telt dus niet mee in de materiaalstaat en is alleen in die ene stap zichtbaar. Markeer een
  geselecteerde balk, knoop of touw als **Tijdelijke maatregel** wanneer deze wel nodig is maar apart
  in de materiaalstaat moet staan. De geselecteerde **Bewerk- en voorbeeldstap** staat in de toolbar
  en bepaalt waar verplaatsen en draaien wordt opgeslagen: eerdere stappen blijven ongewijzigd en
  latere stappen erven de nieuwe positie. Met
  **Camera vastleggen** bepaal je per stap vanuit welke kant de drie aanzichten in de handleiding
  kijken; zonder eigen hoek geldt de projectstandaard
- **Assemblies** — selectie opslaan als herbruikbare assembly, plaatsen en weer uit elkaar halen

## Exports

- **IFC** — IFC4 (`IfcBeam` met rond geëxtrudeerd profiel, knopen als `IfcMechanicalFastener` +
  `IfcRelConnectsElements`, assemblies als `IfcElementAssembly`, eigen `Pset_Pionier_*` property sets)
- **Handleiding (PDF)** — voorblad met materiaalstaat en per bouwstap drie aanzichten
  (isometrisch, boven, voor) met de balken en knopen die in die stap bijkomen
- **Opslaan / Openen** — `.pionier.json`; het project wordt daarnaast automatisch in de browser bewaard

Voorbeeldmodellen staan in [examples/testbrug.pionier.json](examples/testbrug.pionier.json),
[examples/uitkijktoren.pionier.json](examples/uitkijktoren.pionier.json) (vier bouwstappen) en
[examples/schraagbrug.pionier.json](examples/schraagbrug.pionier.json) (met een tussenstap).

## Structuur

```
src/model/       datamodel, geometrie (contactpunten, lengte-ankers), defaults
src/store/       zustand-store met undo/redo en alle bewerkingen
src/scene/       three.js-viewport, balken, knooplabels, snapshots
src/ui/          toolbar en panelen
src/export/      materiaalstaat, IFC4-writer, PDF-handleiding
src/persistence/ IndexedDB-autosave en JSON-import/-export
```

## Nog niet geïmplementeerd

Fysica en stabiliteitsberekening; het model is puur geometrisch. Diameter en lengte worden wel
opgeslagen zodat dit later toegevoegd kan worden.
