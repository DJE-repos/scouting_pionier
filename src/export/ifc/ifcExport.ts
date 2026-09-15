import { Vector3 } from 'three';
import type { Project } from '../../model/types';
import type { ResolvedModel } from '../../model/resolve';
import { beamAxis, beamEndpoints, beamLocalToWorld, ropeLocalToWorld } from '../../model/geometry';
import { ifcGuidFrom, newIfcGuid } from './ifcGuid';

/** Minimale STEP-schrijver: verzamelt regels en geeft referenties (#n) terug. */
class StepFile {
  private lines: string[] = [];
  private nextId = 1;

  add(type: string, args: string[]): string {
    const id = this.nextId++;
    this.lines.push(`#${id}=${type}(${args.join(',')});`);
    return `#${id}`;
  }

  get body(): string {
    return this.lines.join('\n');
  }
}

const str = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
const num = (n: number) => {
  const r = Math.round(n * 1e6) / 1e6;
  return Number.isInteger(r) ? `${r}.` : `${r}`;
};
const list = (items: string[]) => `(${items.join(',')})`;

export interface IfcExportOptions {
  author?: string;
  organization?: string;
}

export function buildIfc(
  project: Project,
  model: ResolvedModel,
  options: IfcExportOptions = {},
): string {
  const f = new StepFile();

  const person = f.add('IFCPERSON', ['$', '$', str(options.author ?? 'Pionier'), '$', '$', '$', '$', '$']);
  const org = f.add('IFCORGANIZATION', ['$', str(options.organization ?? 'Scouting'), '$', '$', '$']);
  const personOrg = f.add('IFCPERSONANDORGANIZATION', [person, org, '$']);
  const appOrg = f.add('IFCORGANIZATION', ['$', str('Pionier 3D'), '$', '$', '$']);
  const application = f.add('IFCAPPLICATION', [appOrg, str('0.1.0'), str('Pionier 3D'), str('PIONIER3D')]);
  const timestamp = Math.floor(Date.now() / 1000);
  const ownerHistory = f.add('IFCOWNERHISTORY', [
    personOrg,
    application,
    '$',
    '.ADDED.',
    `${timestamp}`,
    personOrg,
    application,
    `${timestamp}`,
  ]);

  const origin = f.add('IFCCARTESIANPOINT', [list([num(0), num(0), num(0)])]);
  const axisZ = f.add('IFCDIRECTION', [list([num(0), num(0), num(1)])]);
  const axisX = f.add('IFCDIRECTION', [list([num(1), num(0), num(0)])]);
  const worldPlacement = f.add('IFCAXIS2PLACEMENT3D', [origin, axisZ, axisX]);
  const trueNorth = f.add('IFCDIRECTION', [list([num(0), num(1)])]);

  const context = f.add('IFCGEOMETRICREPRESENTATIONCONTEXT', [
    '$',
    str('Model'),
    '3',
    '1.E-05',
    worldPlacement,
    trueNorth,
  ]);
  const bodyContext = f.add('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', [
    str('Body'),
    str('Model'),
    '*',
    '*',
    '*',
    '*',
    context,
    '$',
    '.MODEL_VIEW.',
    '$',
  ]);

  const metre = f.add('IFCSIUNIT', ['*', '.LENGTHUNIT.', '$', '.METRE.']);
  const squareMetre = f.add('IFCSIUNIT', ['*', '.AREAUNIT.', '$', '.SQUARE_METRE.']);
  const cubicMetre = f.add('IFCSIUNIT', ['*', '.VOLUMEUNIT.', '$', '.CUBIC_METRE.']);
  const radian = f.add('IFCSIUNIT', ['*', '.PLANEANGLEUNIT.', '$', '.RADIAN.']);
  const units = f.add('IFCUNITASSIGNMENT', [list([metre, squareMetre, cubicMetre, radian])]);

  const ifcProject = f.add('IFCPROJECT', [
    str(ifcGuidFrom(project.id)),
    ownerHistory,
    str(project.name),
    '$',
    '$',
    '$',
    '$',
    list([context]),
    units,
  ]);

  const sitePlacement = f.add('IFCLOCALPLACEMENT', ['$', worldPlacement]);
  const site = f.add('IFCSITE', [
    str(newIfcGuid()),
    ownerHistory,
    str('Terrein'),
    '$',
    '$',
    sitePlacement,
    '$',
    '$',
    '.ELEMENT.',
    '$',
    '$',
    '$',
    '$',
    '$',
  ]);

  const buildingPlacement = f.add('IFCLOCALPLACEMENT', [sitePlacement, worldPlacement]);
  const building = f.add('IFCBUILDING', [
    str(newIfcGuid()),
    ownerHistory,
    str('Constructie'),
    '$',
    '$',
    buildingPlacement,
    '$',
    '$',
    '.ELEMENT.',
    '$',
    '$',
    '$',
  ]);

  const storeyPlacement = f.add('IFCLOCALPLACEMENT', [buildingPlacement, worldPlacement]);
  const storey = f.add('IFCBUILDINGSTOREY', [
    str(newIfcGuid()),
    ownerHistory,
    str('Maaiveld'),
    '$',
    '$',
    storeyPlacement,
    '$',
    '$',
    '.ELEMENT.',
    num(0),
  ]);

  f.add('IFCRELAGGREGATES', [str(newIfcGuid()), ownerHistory, str('Project'), '$', ifcProject, list([site])]);
  f.add('IFCRELAGGREGATES', [str(newIfcGuid()), ownerHistory, str('Site'), '$', site, list([building])]);
  f.add('IFCRELAGGREGATES', [str(newIfcGuid()), ownerHistory, str('Building'), '$', building, list([storey])]);

  // --- balken ---
  const beamRefs = new Map<string, string>();
  const profileCache = new Map<number, string>();

  for (const beam of model.beams) {
    const [start] = beamEndpoints(beam);
    const axis = beamAxis(beam);
    const ref = perpendicular(axis);

    const location = f.add('IFCCARTESIANPOINT', [list([num(start.x), num(start.y), num(start.z)])]);
    const dirAxis = f.add('IFCDIRECTION', [list([num(axis.x), num(axis.y), num(axis.z)])]);
    const dirRef = f.add('IFCDIRECTION', [list([num(ref.x), num(ref.y), num(ref.z)])]);
    const placement3d = f.add('IFCAXIS2PLACEMENT3D', [location, dirAxis, dirRef]);
    const placement = f.add('IFCLOCALPLACEMENT', [storeyPlacement, placement3d]);

    let profile = profileCache.get(beam.diameterMm);
    if (!profile) {
      const origin2d = f.add('IFCCARTESIANPOINT', [list([num(0), num(0)])]);
      const place2d = f.add('IFCAXIS2PLACEMENT2D', [origin2d, '$']);
      profile = f.add('IFCCIRCLEPROFILEDEF', [
        '.AREA.',
        str(`Rondhout D${beam.diameterMm}`),
        place2d,
        num(beam.diameterMm / 2000),
      ]);
      profileCache.set(beam.diameterMm, profile);
    }

    const solid = f.add('IFCEXTRUDEDAREASOLID', [profile, worldPlacement, axisZ, num(beam.lengthM)]);
    const shape = f.add('IFCSHAPEREPRESENTATION', [
      bodyContext,
      str('Body'),
      str('SweptSolid'),
      list([solid]),
    ]);
    const productShape = f.add('IFCPRODUCTDEFINITIONSHAPE', ['$', '$', list([shape])]);

    const ifcBeam = f.add('IFCBEAM', [
      str(ifcGuidFrom(beam.id)),
      ownerHistory,
      str(beam.name ?? `Balk ${beam.lengthM} m`),
      str(`Rondhout ${beam.lengthM} m, D${beam.diameterMm} mm`),
      '$',
      placement,
      productShape,
      '$',
      '.NOTDEFINED.',
    ]);
    beamRefs.set(beam.id, ifcBeam);

    addPropertySet(f, ownerHistory, ifcBeam, 'Pset_Pionier_Balk', [
      ['Lengte', `${beam.lengthM} m`],
      ['Diameter', `${beam.diameterMm} mm`],
      ['Bouwstap', `${beam.stepIndex + 1}`],
      ['Assembly', beam.assemblyName ?? ''],
    ]);
  }

  // --- knopen als mechanische bevestigingen ---
  const fastenerRefs: string[] = [];
  for (const lashing of model.lashings) {
    let world: Vector3 | null = null;
    const anchorBeam = model.beams.find((b) => b.id === lashing.beamIds[0]);
    if (anchorBeam) {
      world = beamLocalToWorld(anchorBeam, lashing.localOffset);
    } else if (lashing.ropeIds && lashing.ropeIds.length > 0) {
      const anchorRope = model.ropes.find((r) => r.id === lashing.ropeIds![0]);
      if (anchorRope) {
        world = ropeLocalToWorld(
          new Vector3(...anchorRope.fromPosition),
          new Vector3(...anchorRope.toPosition),
          lashing.localOffset,
        );
      }
    }
    if (!world) continue;

    const location = f.add('IFCCARTESIANPOINT', [list([num(world.x), num(world.y), num(world.z)])]);
    const placement3d = f.add('IFCAXIS2PLACEMENT3D', [location, axisZ, axisX]);
    const placement = f.add('IFCLOCALPLACEMENT', [storeyPlacement, placement3d]);

    // Zonder geometrie blijft de knoop in viewers onzichtbaar: een korte dikke
    // cilinder om het knooppunt geeft de sjorring weer.
    const boundDiameter = Math.max(
      ...lashing.beamIds.map((id) => model.beams.find((b) => b.id === id)?.diameterMm ?? 80),
    );
    const knotRadius = boundDiameter / 2000 + 0.03;
    const knotLength = boundDiameter / 1000 + 0.06;

    const origin2d = f.add('IFCCARTESIANPOINT', [list([num(0), num(0)])]);
    const place2d = f.add('IFCAXIS2PLACEMENT2D', [origin2d, '$']);
    const knotProfile = f.add('IFCCIRCLEPROFILEDEF', [
      '.AREA.',
      str(`Knoop ${lashing.name}`),
      place2d,
      num(knotRadius),
    ]);
    const solidOrigin = f.add('IFCCARTESIANPOINT', [
      list([num(0), num(0), num(-knotLength / 2)]),
    ]);
    const solidPlacement = f.add('IFCAXIS2PLACEMENT3D', [solidOrigin, axisZ, axisX]);
    const knotSolid = f.add('IFCEXTRUDEDAREASOLID', [
      knotProfile,
      solidPlacement,
      axisZ,
      num(knotLength),
    ]);
    const knotColour = f.add('IFCCOLOURRGB', ['$', num(0.88), num(0.11), num(0.28)]);
    const knotRendering = f.add('IFCSURFACESTYLERENDERING', [
      knotColour,
      '$',
      '$',
      '$',
      '$',
      '$',
      '$',
      '$',
      '.NOTDEFINED.',
    ]);
    const knotSurfaceStyle = f.add('IFCSURFACESTYLE', [
      str('Sjorring'),
      '.BOTH.',
      list([knotRendering]),
    ]);
    f.add('IFCSTYLEDITEM', [knotSolid, list([knotSurfaceStyle]), '$']);

    const knotShape = f.add('IFCSHAPEREPRESENTATION', [
      bodyContext,
      str('Body'),
      str('SweptSolid'),
      list([knotSolid]),
    ]);
    const knotProductShape = f.add('IFCPRODUCTDEFINITIONSHAPE', ['$', '$', list([knotShape])]);

    const fastener = f.add('IFCMECHANICALFASTENER', [
      str(ifcGuidFrom(lashing.id)),
      ownerHistory,
      str(lashing.name),
      str(`Knoop: ${lashing.name}`),
      str(lashing.name),
      placement,
      knotProductShape,
      '$',
      num(knotRadius * 2),
      num(lashing.ropeLengthM),
      '.USERDEFINED.',
    ]);
    fastenerRefs.push(fastener);

    addPropertySet(f, ownerHistory, fastener, 'Pset_Pionier_Knoop', [
      ['Knoopnaam', lashing.name],
      ['Touwlengte', `${lashing.ropeLengthM} m`],
      ['Bouwstap', `${lashing.stepIndex + 1}`],
      ['AantalBalken', `${lashing.beamIds.length}`],
    ]);

    for (let i = 0; i < lashing.beamIds.length; i++) {
      for (let j = i + 1; j < lashing.beamIds.length; j++) {
        const a = beamRefs.get(lashing.beamIds[i]);
        const b = beamRefs.get(lashing.beamIds[j]);
        if (!a || !b) continue;
        f.add('IFCRELCONNECTSELEMENTS', [
          str(newIfcGuid()),
          ownerHistory,
          str(lashing.name),
          '$',
          '$',
          a,
          b,
        ]);
      }
    }
  }

  // --- touwverbindingen ---
  const ropeRefs: string[] = [];
  for (const rope of model.ropes ?? []) {
    const from = new Vector3(...rope.fromPosition);
    const to = new Vector3(...rope.toPosition);
    const diff = to.clone().sub(from);
    const length = diff.length();
    if (length < 1e-4) continue;

    const dirZ = diff.clone().normalize();
    const up = Math.abs(dirZ.z) > 0.99 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
    const dirX = new Vector3().crossVectors(up, dirZ).normalize();

    const location = f.add('IFCCARTESIANPOINT', [list([num(from.x), num(from.y), num(from.z)])]);
    const axisDirZ = f.add('IFCDIRECTION', [list([num(dirZ.x), num(dirZ.y), num(dirZ.z)])]);
    const axisDirX = f.add('IFCDIRECTION', [list([num(dirX.x), num(dirX.y), num(dirX.z)])]);
    const placement3d = f.add('IFCAXIS2PLACEMENT3D', [location, axisDirZ, axisDirX]);
    const placement = f.add('IFCLOCALPLACEMENT', [storeyPlacement, placement3d]);

    const ropeRadius = (rope.diameterMm ?? 12) / 2000;
    const origin2d = f.add('IFCCARTESIANPOINT', [list([num(0), num(0)])]);
    const place2d = f.add('IFCAXIS2PLACEMENT2D', [origin2d, '$']);
    const ropeProfile = f.add('IFCCIRCLEPROFILEDEF', [
      '.AREA.',
      str(`Touw ${rope.name ?? 'Spantouw'}`),
      place2d,
      num(ropeRadius),
    ]);
    const solidOrigin = f.add('IFCCARTESIANPOINT', [list([num(0), num(0), num(0)])]);
    const solidPlacement = f.add('IFCAXIS2PLACEMENT3D', [solidOrigin, axisZ, axisX]);
    const ropeSolid = f.add('IFCEXTRUDEDAREASOLID', [
      ropeProfile,
      solidPlacement,
      axisZ,
      num(length),
    ]);
    const ropeColour = f.add('IFCCOLOURRGB', ['$', num(0.85), num(0.47), num(0.02)]);
    const ropeRendering = f.add('IFCSURFACESTYLERENDERING', [
      ropeColour,
      '$',
      '$',
      '$',
      '$',
      '$',
      '$',
      '$',
      '.NOTDEFINED.',
    ]);
    const ropeSurfaceStyle = f.add('IFCSURFACESTYLE', [
      str('Touw'),
      '.BOTH.',
      list([ropeRendering]),
    ]);
    f.add('IFCSTYLEDITEM', [ropeSolid, list([ropeSurfaceStyle]), '$']);

    const ropeShape = f.add('IFCSHAPEREPRESENTATION', [
      bodyContext,
      str('Body'),
      str('SweptSolid'),
      list([ropeSolid]),
    ]);
    const ropeProductShape = f.add('IFCPRODUCTDEFINITIONSHAPE', ['$', '$', list([ropeShape])]);

    const fastener = f.add('IFCMECHANICALFASTENER', [
      str(ifcGuidFrom(rope.id)),
      ownerHistory,
      str(rope.name ?? 'Spantouw'),
      str(`Touwverbinding: ${rope.name ?? 'Spantouw'}`),
      str('Touw'),
      placement,
      ropeProductShape,
      '$',
      num(ropeRadius * 2),
      num(rope.totalRopeM),
      '.USERDEFINED.',
    ]);
    ropeRefs.push(fastener);

    addPropertySet(f, ownerHistory, fastener, 'Pset_Pionier_Touw', [
      ['Naam', rope.name ?? 'Spantouw'],
      ['Overspanning', `${rope.lengthM} m`],
      ['TotaleLengte', `${rope.totalRopeM} m`],
      ['Diameter', `${rope.diameterMm ?? 12} mm`],
      ['Bouwstap', `${rope.stepIndex + 1}`],
    ]);
  }

  // --- assemblies ---
  const assemblyRefs: string[] = [];
  for (const instance of project.assemblyInstances) {
    const members = model.beams
      .filter((b) => b.instanceId === instance.id)
      .map((b) => beamRefs.get(b.id))
      .filter((r): r is string => Boolean(r));
    if (members.length === 0) continue;

    const name = model.beams.find((b) => b.instanceId === instance.id)?.assemblyName ?? 'Assembly';
    const location = f.add('IFCCARTESIANPOINT', [list(instance.position.map(num))]);
    const placement3d = f.add('IFCAXIS2PLACEMENT3D', [location, axisZ, axisX]);
    const placement = f.add('IFCLOCALPLACEMENT', [storeyPlacement, placement3d]);

    const assembly = f.add('IFCELEMENTASSEMBLY', [
      str(ifcGuidFrom(instance.id)),
      ownerHistory,
      str(name),
      '$',
      '$',
      placement,
      '$',
      '$',
      '$',
      '.NOTDEFINED.',
      '.USERDEFINED.',
    ]);
    assemblyRefs.push(assembly);
    f.add('IFCRELAGGREGATES', [
      str(newIfcGuid()),
      ownerHistory,
      str(name),
      '$',
      assembly,
      list(members),
    ]);
  }

  const contained = [...beamRefs.values(), ...fastenerRefs, ...ropeRefs, ...assemblyRefs];
  if (contained.length > 0) {
    f.add('IFCRELCONTAINEDINSPATIALSTRUCTURE', [
      str(newIfcGuid()),
      ownerHistory,
      str('Constructie'),
      '$',
      list(contained),
      storey,
    ]);
  }

  return header(project.name, options) + f.body + '\nENDSEC;\nEND-ISO-10303-21;\n';
}

function addPropertySet(
  f: StepFile,
  ownerHistory: string,
  target: string,
  psetName: string,
  props: [string, string][],
) {
  const refs = props
    .filter(([, value]) => value !== '')
    .map(([name, value]) =>
      f.add('IFCPROPERTYSINGLEVALUE', [str(name), '$', `IFCTEXT(${str(value)})`, '$']),
    );
  if (refs.length === 0) return;
  const pset = f.add('IFCPROPERTYSET', [
    str(newIfcGuid()),
    ownerHistory,
    str(psetName),
    '$',
    list(refs),
  ]);
  f.add('IFCRELDEFINESBYPROPERTIES', [
    str(newIfcGuid()),
    ownerHistory,
    '$',
    '$',
    list([target]),
    pset,
  ]);
}

function header(projectName: string, options: IfcExportOptions): string {
  const iso = new Date().toISOString().replace(/\.\d+Z$/, '');
  return [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');`,
    `FILE_NAME(${str(projectName + '.ifc')},'${iso}',(${str(options.author ?? 'Pionier')}),(${str(
      options.organization ?? 'Scouting',
    )}),'Pionier 3D','Pionier 3D','');`,
    `FILE_SCHEMA(('IFC4'));`,
    'ENDSEC;',
    'DATA;',
    '',
  ].join('\n');
}

/** Willekeurige eenheidsvector loodrecht op de gegeven as. */
function perpendicular(axis: Vector3): Vector3 {
  const helper = Math.abs(axis.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  return new Vector3().crossVectors(helper, axis).normalize();
}
