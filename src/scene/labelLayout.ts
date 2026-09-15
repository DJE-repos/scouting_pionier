export interface ScreenPoint {
  x: number;
  y: number;
}

export interface LabelLayoutInput {
  id: string;
  anchor: ScreenPoint;
  width: number;
  height: number;
}

export interface ScreenSegment {
  from: ScreenPoint;
  to: ScreenPoint;
}

export interface LabelLayoutOptions {
  width: number;
  height: number;
  gap?: number;
  anchorGap?: number;
  obstacles?: ScreenSegment[];
}

export interface LabelLayoutResult extends LabelLayoutInput {
  x: number;
  y: number;
  leader: ScreenPoint;
}

interface Candidate {
  x: number;
  y: number;
  side: 'top' | 'right' | 'bottom' | 'left';
  distance: number;
}

const DIRECTIONS = [
  { side: 'top' as const, dx: 0, dy: -1, tx: 1, ty: 0 },
  { side: 'right' as const, dx: 1, dy: 0, tx: 0, ty: 1 },
  { side: 'bottom' as const, dx: 0, dy: 1, tx: 1, ty: 0 },
  { side: 'left' as const, dx: -1, dy: 0, tx: 0, ty: 1 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

function rectsOverlap(a: LabelLayoutResult, b: LabelLayoutResult, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

function pointInRect(point: ScreenPoint, x: number, y: number, width: number, height: number): boolean {
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

function orientation(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: ScreenPoint, b: ScreenPoint, point: ScreenPoint): boolean {
  return (
    point.x >= Math.min(a.x, b.x) &&
    point.x <= Math.max(a.x, b.x) &&
    point.y >= Math.min(a.y, b.y) &&
    point.y <= Math.max(a.y, b.y)
  );
}

function segmentsCross(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint, d: ScreenPoint): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC === 0 && onSegment(a, b, c)) return true;
  if (abD === 0 && onSegment(a, b, d)) return true;
  if (cdA === 0 && onSegment(c, d, a)) return true;
  if (cdB === 0 && onSegment(c, d, b)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function segmentCrossesRect(segment: ScreenSegment, x: number, y: number, width: number, height: number): boolean {
  if (pointInRect(segment.from, x, y, width, height) || pointInRect(segment.to, x, y, width, height)) {
    return true;
  }
  const corners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
  return corners.some((corner, index) => segmentsCross(segment.from, segment.to, corner, corners[(index + 1) % 4]));
}

function leaderEndpoint(candidate: Candidate, input: LabelLayoutInput): ScreenPoint {
  return {
    x: clamp(input.anchor.x, candidate.x, candidate.x + input.width),
    y: clamp(input.anchor.y, candidate.y, candidate.y + input.height),
  };
}

function candidatesFor(input: LabelLayoutInput, options: Required<Pick<LabelLayoutOptions, 'gap' | 'anchorGap'>>): Candidate[] {
  const tangentOffsets = [0, 0.7, -0.7, 1.4, -1.4];
  return DIRECTIONS.flatMap(({ side, dx, dy, tx, ty }) =>
    tangentOffsets.map((offset) => {
      const x = input.anchor.x + dx * options.anchorGap - (dx < 0 ? input.width : dx === 0 ? input.width / 2 : 0) + tx * offset * input.width;
      const y = input.anchor.y + dy * options.anchorGap - (dy < 0 ? input.height : dy === 0 ? input.height / 2 : 0) + ty * offset * input.height;
      return { side, x, y, distance: Math.hypot(x - input.anchor.x, y - input.anchor.y) };
    }),
  );
}

function candidateScore(
  candidate: Candidate,
  input: LabelLayoutInput,
  placed: LabelLayoutResult[],
  options: Required<Pick<LabelLayoutOptions, 'width' | 'height' | 'gap' | 'anchorGap'>> & { obstacles: ScreenSegment[] },
): number {
  const result = { ...input, x: candidate.x, y: candidate.y, leader: leaderEndpoint(candidate, input) };
  let score = candidate.distance * 0.05;
  const overflow = Math.max(0, -candidate.x) + Math.max(0, -candidate.y) + Math.max(0, candidate.x + input.width - options.width) + Math.max(0, candidate.y + input.height - options.height);
  score += overflow * 10000;
  score += options.obstacles.filter((obstacle) => segmentCrossesRect(obstacle, candidate.x, candidate.y, input.width, input.height)).length * 5000;
  score += options.obstacles.filter((obstacle) => segmentsCross(result.leader, input.anchor, obstacle.from, obstacle.to)).length * 2500;
  score += placed.filter((other) => rectsOverlap(result, other, options.gap)).length * 100000;
  return score;
}

export function layoutLabels(inputs: LabelLayoutInput[], rawOptions: LabelLayoutOptions): LabelLayoutResult[] {
  const options = {
    width: rawOptions.width,
    height: rawOptions.height,
    gap: rawOptions.gap ?? 6,
    anchorGap: rawOptions.anchorGap ?? 28,
    obstacles: rawOptions.obstacles ?? [],
  };
  const placed: LabelLayoutResult[] = [];

  for (const input of [...inputs].sort((a, b) => a.id.localeCompare(b.id))) {
    const candidates = candidatesFor(input, options);
    const candidate = candidates.reduce((best, current) =>
      candidateScore(current, input, placed, options) < candidateScore(best, input, placed, options) ? current : best,
    );
    const result = { ...input, x: candidate.x, y: candidate.y, leader: leaderEndpoint(candidate, input) };
    result.x = clamp(result.x, 2, Math.max(2, options.width - result.width - 2));
    result.y = clamp(result.y, 2, Math.max(2, options.height - result.height - 2));
    result.leader = {
      x: clamp(input.anchor.x, result.x, result.x + result.width),
      y: clamp(input.anchor.y, result.y, result.y + result.height),
    };
    placed.push(result);
  }
  return placed;
}
