import { useEffect, useMemo, useState } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, TextureLoader } from 'three';
import { useEditor } from '../store/projectStore';

const BAG_URL = 'https://api.3dbag.nl/collections/pand/items';
const PDOK_WMS = 'https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0/';
const TOP10_WMS = 'https://service.pdok.nl/brt/top10nl/wms/v1_0';
const BUILDING_LOD_PRIORITY = ['2.5', '2.2', '1.3', '1.2'] as const;

interface CityJsonFeature {
  CityObjects?: Record<string, { type: string; geometry?: { lod?: string; boundaries?: unknown }[] }>;
  vertices?: number[][];
  transform?: { scale: number[]; translate: number[] };
}

interface CityJsonTransform {
  scale: number[];
  translate: number[];
}

interface BagResponse {
  features?: CityJsonFeature[];
  metadata?: { transform?: CityJsonTransform };
}

interface BuildingMeshData {
  id: string;
  vertices: number[];
  indices: number[];
}

export function imageryUrl(x: number, y: number, size: number) {
  const half = size / 2;
  const params = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'Actueel_ortho25',
    STYLES: '', CRS: 'EPSG:28992', BBOX: `${x - half},${y - half},${x + half},${y + half}`,
    WIDTH: '1024', HEIGHT: '1024', FORMAT: 'image/jpeg',
  });
  return `${PDOK_WMS}?${params.toString()}`;
}

function bboxUrl(x: number, y: number, size: number) {
  const half = size / 2;
  return `${BAG_URL}?bbox=${x - half},${y - half},${x + half},${y + half}&limit=100`;
}

function ringsFromBoundaries(value: unknown): number[][] {
  if (!Array.isArray(value) || value.length === 0) return [];
  if (value.every((item) => typeof item === 'number')) return [value as number[]];
  return value.flatMap(ringsFromBoundaries);
}

function featureDistanceSquared(feature: CityJsonFeature, originX: number, originY: number, transform?: CityJsonTransform) {
  const vertices = feature.vertices ?? [];
  if (vertices.length === 0) return Number.POSITIVE_INFINITY;
  const scale = feature.transform?.scale ?? transform?.scale ?? [1, 1, 1];
  const translate = feature.transform?.translate ?? transform?.translate ?? [0, 0, 0];
  const center = vertices.reduce(
    (sum, vertex) => {
      sum[0] += vertex[0] * scale[0] + translate[0];
      sum[1] += vertex[1] * scale[1] + translate[1];
      return sum;
    },
    [0, 0],
  );
  const centerX = center[0] / vertices.length;
  const centerY = center[1] / vertices.length;
  return (centerX - originX) ** 2 + (centerY - originY) ** 2;
}

function parseBuildings(features: CityJsonFeature[], originX: number, originY: number, sharedTransform?: CityJsonTransform): BuildingMeshData[] {
  return features
    .slice()
    .sort((a, b) => featureDistanceSquared(a, originX, originY, sharedTransform) - featureDistanceSquared(b, originX, originY, sharedTransform))
    .slice(0, 100)
    .flatMap((feature, featureIndex) => {
    const vertices = feature.vertices ?? [];
    const scale = feature.transform?.scale ?? sharedTransform?.scale ?? [1, 1, 1];
    const translate = feature.transform?.translate ?? sharedTransform?.translate ?? [0, 0, 0];
    return Object.entries(feature.CityObjects ?? {})
      .filter(([, object]) => object.type === 'BuildingPart' || object.type === 'Building')
      .flatMap(([id, building], buildingIndex) => {
        const geometry = BUILDING_LOD_PRIORITY
          .map((lod) => building.geometry?.find((item) => item.lod === lod))
          .find((item) => item !== undefined);
        const rings = ringsFromBoundaries(geometry?.boundaries);
        if (rings.length === 0) return [];
        const used = new Map<number, number>();
        const positions: number[] = [];
        const indices: number[] = [];
        let minHeight = Number.POSITIVE_INFINITY;
        const addVertex = (sourceIndex: number) => {
          const existing = used.get(sourceIndex);
          if (existing !== undefined) return existing;
          const source = vertices[sourceIndex];
          if (!source) return -1;
          const rx = source[0] * scale[0] + translate[0];
          const ry = source[1] * scale[1] + translate[1];
          const rz = source[2] * scale[2] + translate[2];
          minHeight = Math.min(minHeight, rz);
          const index = positions.length / 3;
          positions.push(rx - originX, rz, -(ry - originY));
          used.set(sourceIndex, index);
          return index;
        };
        for (const ring of rings) {
          if (ring.length < 3) continue;
          const ringIndices = ring.map(addVertex).filter((index) => index >= 0);
          for (let i = 1; i < ringIndices.length - 1; i += 1) indices.push(ringIndices[0], ringIndices[i], ringIndices[i + 1]);
        }
        for (let i = 1; i < positions.length; i += 3) positions[i] -= minHeight;
        return indices.length === 0 ? [] : [{ id: `${featureIndex}-${buildingIndex}-${id}`, vertices: positions, indices }];
      });
  });
}

function GeoImage({ url, size, positionY = -0.004, opacity = 0.92 }: { url: string; size: number; positionY?: number; opacity?: number }) {
  const [texture, setTexture] = useState<import('three').Texture | null>(null);
  useEffect(() => {
    let active = true;
    const loader = new TextureLoader();
    loader.load(url, (loaded) => {
      if (!active) { loaded.dispose(); return; }
      loaded.colorSpace = 'srgb';
      setTexture(loaded);
    }, undefined, () => { if (active) setTexture(null); });
    return () => { active = false; };
  }, [url]);
  if (!texture) return null;
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, positionY, 0]}><planeGeometry args={[size, size]} /><meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} /></mesh>;
}

function GeoBuilding({ data }: { data: BuildingMeshData }) {
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute('position', new Float32BufferAttribute(data.vertices, 3));
    result.setIndex(data.indices);
    result.computeVertexNormals();
    return result;
  }, [data]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color="#b8b9b0" roughness={0.95} side={DoubleSide} transparent={false} opacity={1} depthWrite /></mesh>;
}

export function GeoContext() {
  const settings = useEditor((state) => state.project.settings);
  const [buildings, setBuildings] = useState<BuildingMeshData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const size = settings.groundSizeM;
  const bagOffset = Math.min(size * 0.5, 100);
  const bagExtent = size + bagOffset * 2;
  const imageUrl = useMemo(() => imageryUrl(settings.georeferenceX, settings.georeferenceY, size), [settings.georeferenceX, settings.georeferenceY, size]);
  const labelUrl = useMemo(() => placeLabelsUrl(settings.georeferenceX, settings.georeferenceY, size), [settings.georeferenceX, settings.georeferenceY, size]);

  useEffect(() => {
    if (!settings.georeferenceEnabled || !settings.georeferenceBuildings) { setBuildings([]); return; }
    const controller = new AbortController();
    setError(null);
    fetch(bboxUrl(settings.georeferenceX, settings.georeferenceY, bagExtent), { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(`3DBAG gaf HTTP ${response.status}`); return response.json() as Promise<BagResponse>; })
      .then((data) => setBuildings(parseBuildings(data.features ?? [], settings.georeferenceX, settings.georeferenceY, data.metadata?.transform)))
      .catch((reason: unknown) => { if ((reason as { name?: string }).name !== 'AbortError') setError('3DBAG kon niet worden geladen.'); });
    return () => controller.abort();
  }, [settings.georeferenceEnabled, settings.georeferenceBuildings, settings.georeferenceX, settings.georeferenceY, bagExtent]);

  if (!settings.georeferenceEnabled) return null;
  return <group name="georeference-context">
    {settings.georeferenceImagery && <GeoImage url={imageUrl} size={size} />}
    {settings.georeferenceImagery && <GeoImage url={labelUrl} size={size} positionY={-0.003} opacity={1} />}
    {buildings.map((building) => <GeoBuilding key={building.id} data={building} />)}
    {error && <mesh name="georeference-error-indicator" position={[0, 0.02, 0]}><boxGeometry args={[0.2, 0.04, 0.2]} /><meshBasicMaterial color="#c2410c" /></mesh>}
  </group>;
}

export function placeLabelsUrl(x: number, y: number, size: number) {
  const half = size / 2;
  const params = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'plaatslabelnl,wegdeelhartlijnlabel',
    STYLES: ',', CRS: 'EPSG:28992', BBOX: `${x - half},${y - half},${x + half},${y + half}`,
    WIDTH: '1024', HEIGHT: '1024', FORMAT: 'image/png', TRANSPARENT: 'TRUE',
  });
  return `${TOP10_WMS}?${params.toString()}`;
}