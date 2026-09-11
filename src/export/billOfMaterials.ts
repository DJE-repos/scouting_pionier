import type { ResolvedModel } from '../model/resolve';

export interface BeamRow {
  lengthM: number;
  diameterMm: number;
  count: number;
  totalLengthM: number;
}

export interface KnotRow {
  name: string;
  count: number;
  totalRopeM: number;
}

export interface RopeRow {
  name: string;
  count: number;
  totalSpanM: number;
  totalRopeM: number;
}

export interface BillOfMaterials {
  beams: BeamRow[];
  knots: KnotRow[];
  ropes: RopeRow[];
  /** Materiaal uit tussenstappen; staat elders al in het model en telt niet mee. */
  temporaryBeams: BeamRow[];
  temporaryKnots: KnotRow[];
  temporaryRopes: RopeRow[];
  totalBeams: number;
  totalBeamLengthM: number;
  totalKnots: number;
  totalRopes: number;
  totalRopeM: number;
  totalTemporaryBeams: number;
  totalTemporaryKnots: number;
  totalTemporaryRopes: number;
}

function groupBeams(beams: ResolvedModel['beams']): BeamRow[] {
  const map = new Map<string, BeamRow>();
  for (const beam of beams) {
    const key = `${beam.lengthM}|${beam.diameterMm}`;
    const row = map.get(key) ?? {
      lengthM: beam.lengthM,
      diameterMm: beam.diameterMm,
      count: 0,
      totalLengthM: 0,
    };
    row.count += 1;
    row.totalLengthM += beam.lengthM;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.diameterMm - b.diameterMm || a.lengthM - b.lengthM);
}

function groupKnots(lashings: ResolvedModel['lashings']): KnotRow[] {
  const map = new Map<string, KnotRow>();
  for (const lashing of lashings) {
    const name = lashing.name.trim() || '(naamloos)';
    const key = name.toLowerCase();
    const row = map.get(key) ?? { name, count: 0, totalRopeM: 0 };
    row.count += 1;
    row.totalRopeM += lashing.ropeLengthM;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

function groupRopes(ropes: ResolvedModel['ropes'] = []): RopeRow[] {
  const map = new Map<string, RopeRow>();
  for (const rope of ropes) {
    const name = (rope.name ?? 'Spantouw').trim() || 'Spantouw';
    const key = name.toLowerCase();
    const row = map.get(key) ?? { name, count: 0, totalSpanM: 0, totalRopeM: 0 };
    row.count += 1;
    row.totalSpanM += rope.lengthM;
    row.totalRopeM += rope.totalRopeM;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

export function computeBillOfMaterials(model: ResolvedModel): BillOfMaterials {
  const beams = groupBeams(model.beams.filter((b) => !b.temporary));
  const knots = groupKnots(model.lashings.filter((l) => !l.temporary));
  const ropes = groupRopes((model.ropes ?? []).filter((r) => !r.temporary));

  const temporaryBeams = groupBeams(model.beams.filter((b) => b.temporary));
  const temporaryKnots = groupKnots(model.lashings.filter((l) => l.temporary));
  const temporaryRopes = groupRopes((model.ropes ?? []).filter((r) => r.temporary));

  const knotRopeM = knots.reduce((n, r) => n + r.totalRopeM, 0);
  const spanRopeM = ropes.reduce((n, r) => n + r.totalRopeM, 0);

  return {
    beams,
    knots,
    ropes,
    temporaryBeams,
    temporaryKnots,
    temporaryRopes,
    totalBeams: beams.reduce((n, r) => n + r.count, 0),
    totalBeamLengthM: round2(beams.reduce((n, r) => n + r.totalLengthM, 0)),
    totalKnots: knots.reduce((n, r) => n + r.count, 0),
    totalRopes: ropes.reduce((n, r) => n + r.count, 0),
    totalRopeM: round2(knotRopeM + spanRopeM),
    totalTemporaryBeams: temporaryBeams.reduce((n, r) => n + r.count, 0),
    totalTemporaryKnots: temporaryKnots.reduce((n, r) => n + r.count, 0),
    totalTemporaryRopes: temporaryRopes.reduce((n, r) => n + r.count, 0),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function billOfMaterialsToCsv(bom: BillOfMaterials): string {
  const lines = ['Soort;Omschrijving;Aantal;Totaal'];
  for (const row of bom.beams) {
    lines.push(`Balk;${row.lengthM} m / ${row.diameterMm} mm;${row.count};${round2(row.totalLengthM)} m`);
  }
  for (const row of bom.knots) {
    lines.push(`Knoop;${row.name};${row.count};${round2(row.totalRopeM)} m touw`);
  }
  for (const row of bom.ropes) {
    lines.push(`Touw;${row.name};${row.count};${round2(row.totalRopeM)} m touw`);
  }
  lines.push(`Totaal;Balken;${bom.totalBeams};${bom.totalBeamLengthM} m`);
  lines.push(`Totaal;Knopen;${bom.totalKnots};${bom.totalRopeM} m touw`);
  for (const row of bom.temporaryBeams) {
    lines.push(
      `Tijdelijk (al meegeteld);Balk ${row.lengthM} m / ${row.diameterMm} mm;${row.count};${round2(row.totalLengthM)} m`,
    );
  }
  for (const row of bom.temporaryKnots) {
    lines.push(`Tijdelijk (al meegeteld);Knoop ${row.name};${row.count};${round2(row.totalRopeM)} m touw`);
  }
  for (const row of bom.temporaryRopes) {
    lines.push(`Tijdelijk (al meegeteld);Touw ${row.name};${row.count};${round2(row.totalRopeM)} m touw`);
  }
  return lines.join('\n');
}
