# Pionier 3D

Web-app om scoutingconstructies in 3D te pionieren: balken plaatsen, met benoemde knopen
verbinden, assemblies hergebruiken, materiaalstaat aflezen en exporteren naar IFC en PDF.

Use the tool at https://dje-repos.github.io/scouting_pionier/

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
| Aan balken plaatsen | Kies **Aan steunbalken** en een voorraadlengte; stel vooraf offset en overstek in. Na het tweede geldige steunpunt worden balk en sjorringen direct geplaatst |
| Aan een balk plaatsen | Kies een steunbalk en daarna een richting op het referentieniveau; na het tweede geldige punt wordt de balk direct geplaatst |
| Elementen koppelen | Vink **Koppelen aan elementen** aan bij plaatsing; alleen de afhankelijke balk volgt wijzigingen van zijn steunen |
| Ontkoppelen | Selecteer de gekoppelde balk en kies **Ontkoppelen** in Eigenschappen; positie en knopen blijven behouden |
| Niveaus | Voeg een naam en hoogte toe bij **Referentieniveaus**, selecteer het niveau en kies onderkant, hartlijn of bovenkant |
| Selecteren | Klik op een balk; shift+klik voor meerdere |
| Verplaatsen / draaien | `G` / `R`, daarna de gizmo slepen (snapt op raster en hoek) |
| Lengte wijzigen | Rechterpaneel → kies maat of vrije lengte; het *lengte-anker* bepaalt welk uiteinde blijft staan |
| Knoop maken | Selecteer 2+ balken → **Knoop maken** → vrije naam invullen |
| Labels tonen/verbergen | `L` of de **Labels**-checkbox; **Alleen selectie** toont alleen de labels bij de selectie |
| Verwijderen | `Delete` |
| Ongedaan maken | `Ctrl+Z` / `Ctrl+Shift+Z` |

## Panelen rechts

Bij plaatsing aan steunbalken worden sjorringen automatisch op echte raakcontacten gemaakt.
De geometrie bepaalt een eerste keuze (kruis-, diagonaal- of steigersjorring); naam en touwlengte
blijven bewerkbaar. Dit is geen constructieve veiligheidsbeoordeling. Een offset die een spleet
of doorsnijding veroorzaakt, of een overspanning groter dan de voorraadlengte, blokkeert plaatsing.
Een later ongeldige koppeling wordt in Eigenschappen gemeld zonder de balk te verlengen.
De zijwaartse offset geldt voor beide plaatsingspunten, loodrecht op hun horizontale richting;
de pijl in de preview toont de positieve richting. Niveaus zijn uitsluitend plaatsingsreferenties:
wijzigen of verwijderen van een niveau verplaatst bestaande balken niet. Niveaus en koppelingen
worden samen met het project opgeslagen; niveaus tellen niet mee als materiaal.

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
