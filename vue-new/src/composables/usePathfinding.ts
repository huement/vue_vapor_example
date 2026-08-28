import { ref, shallowRef, computed, triggerRef } from "vue";
export type PresetKey = keyof typeof PRESETS;

// Inside usePathfinding():

export interface Point {
  x: number;
  y: number;
}

export const PRESETS = {
  lshape: {
    name: "L-Shaped Room",
    points: [
      { x: 150, y: 120 },
      { x: 450, y: 120 },
      { x: 450, y: 280 },
      { x: 620, y: 280 },
      { x: 620, y: 480 },
      { x: 150, y: 480 },
    ],
  },
  concave: {
    name: "Concave Star",
    points: [
      { x: 400, y: 100 },
      { x: 480, y: 240 },
      { x: 640, y: 260 },
      { x: 520, y: 360 },
      { x: 560, y: 520 },
      { x: 400, y: 430 },
      { x: 240, y: 520 },
      { x: 280, y: 360 },
      { x: 160, y: 260 },
      { x: 320, y: 240 },
    ],
  },
  convex: {
    name: "Irregular Lawn",
    points: [
      { x: 200, y: 150 },
      { x: 550, y: 120 },
      { x: 680, y: 320 },
      { x: 580, y: 490 },
      { x: 250, y: 460 },
      { x: 140, y: 300 },
    ],
  },
  rectangle: {
    name: "Simple Box",
    points: [
      { x: 200, y: 150 },
      { x: 600, y: 150 },
      { x: 600, y: 450 },
      { x: 200, y: 450 },
    ],
  },
};

export const toRad = (deg: number) => (deg * Math.PI) / 180;
export const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function rotatePoint(p: Point, rad: number): Point {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  };
}

export function polygonArea(pts: Point[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area / 2);
}

export function usePathfinding() {
  const lineSpacing = ref(30);
  const angleDegrees = ref(45);
  const insetPadding = ref(0);
  const turnStyle = ref<"sharp" | "curved" | "square">("sharp");
  const patternMode = ref<"zigzag" | "oneway">("zigzag");
  const selectedPreset = ref<keyof typeof PRESETS>("lshape");

  const polygonPoints = shallowRef<Point[]>([...PRESETS.lshape.points]);

  const activeInsetPolygonPoints = computed(() => {
    if (insetPadding.value <= 0) return polygonPoints.value;
    const pts = polygonPoints.value;
    const n = pts.length;
    const lines = [];
    for (let i = 0; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const nx = -dy / len;
      const ny = dx / len;
      lines.push({
        x1: p1.x + nx * insetPadding.value,
        y1: p1.y + ny * insetPadding.value,
        x2: p2.x + nx * insetPadding.value,
        y2: p2.y + ny * insetPadding.value,
      });
    }
    const insetPts: Point[] = [];
    for (let i = 0; i < lines.length; i++) {
      const l1 = lines[i];
      const l2 = lines[(i + 1) % lines.length];
      const d =
        (l1.x1 - l1.x2) * (l2.y1 - l2.y2) - (l1.y1 - l1.y2) * (l2.x1 - l2.x2);
      if (Math.abs(d) < 0.001) {
        insetPts.push({ x: l1.x2, y: l1.y2 });
      } else {
        const ix =
          ((l1.x1 * l1.y2 - l1.y1 * l1.x2) * (l2.x1 - l2.x2) -
            (l1.x1 - l1.x2) * (l2.x1 * l2.y2 - l2.y1 * l2.x2)) /
          d;
        const iy =
          ((l1.x1 * l1.y2 - l1.y1 * l1.x2) * (l2.y1 - l2.y2) -
            (l1.y1 - l1.y2) * (l2.x1 * l2.y2 - l2.y1 * l2.x2)) /
          d;
        insetPts.push({ x: ix, y: iy });
      }
    }
    return insetPts.length >= 3 ? insetPts : polygonPoints.value;
  });

  const pathPoints = computed(() => {
    const poly = activeInsetPolygonPoints.value;
    if (poly.length < 3) return [];

    const rad = toRad(angleDegrees.value);
    const spacing = Math.max(8, lineSpacing.value);
    const rotatedPoly = poly.map((p) => rotatePoint(p, -rad));

    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of rotatedPoly) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const rawPath: Point[] = [];
    let reverseDirection = false;

    for (let y = minY + spacing / 2; y < maxY; y += spacing) {
      const intersections: number[] = [];
      for (let i = 0; i < rotatedPoly.length; i++) {
        const p1 = rotatedPoly[i];
        const p2 = rotatedPoly[(i + 1) % rotatedPoly.length];
        if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
          const t = (y - p1.y) / (p2.y - p1.y);
          intersections.push(p1.x + t * (p2.x - p1.x));
        }
      }
      if (intersections.length < 2) continue;
      intersections.sort((a, b) => a - b);

      const lineSegments: Point[][] = [];
      for (let i = 0; i < intersections.length - 1; i += 2) {
        lineSegments.push([
          { x: intersections[i], y },
          { x: intersections[i + 1], y },
        ]);
      }

      if (patternMode.value === "zigzag" && reverseDirection) {
        lineSegments.reverse();
        for (const seg of lineSegments) rawPath.push(seg[1], seg[0]);
      } else {
        for (const seg of lineSegments) rawPath.push(seg[0], seg[1]);
      }
      reverseDirection = !reverseDirection;
    }

    return rawPath.map((p) => rotatePoint(p, rad));
  });

  const pathDString = computed(() => {
    const pts = pathPoints.value;
    if (!pts || pts.length === 0) return "";
    if (turnStyle.value === "sharp") {
      return pts
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
        )
        .join(" ");
    }
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i += 2) {
      d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
      if (i + 1 < pts.length) {
        const nextPt = pts[i + 1];
        if (turnStyle.value === "curved") {
          d += ` Q ${pts[i].x.toFixed(1)} ${nextPt.y.toFixed(1)}, ${nextPt.x.toFixed(1)} ${nextPt.y.toFixed(1)}`;
        } else if (turnStyle.value === "square") {
          const dx = nextPt.x - pts[i].x;
          const dy = nextPt.y - pts[i].y;
          d += ` L ${pts[i].x + dx / 2} ${pts[i].y + dy / 2} L ${nextPt.x} ${nextPt.y}`;
        }
      }
    }
    return d;
  });

  const stats = computed(() => {
    const pts = pathPoints.value;
    let dist = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      dist += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    return {
      totalDistance: Math.round(dist),
      passesCount: Math.floor(pts.length / 2),
      waypointCount: pts.length,
      area: Math.round(polygonArea(polygonPoints.value)),
    };
  });

  const svgOuterPolygonPoints = computed(() =>
    polygonPoints.value.map((p) => `${p.x},${p.y}`).join(" "),
  );
  const svgInsetPolygonPoints = computed(() =>
    activeInsetPolygonPoints.value.map((p) => `${p.x},${p.y}`).join(" "),
  );

  const loadPreset = (key: PropertyKey) => {
    const strKey = String(key);
    if (strKey in PRESETS) {
      selectedPreset.value = strKey as keyof typeof PRESETS;
      polygonPoints.value = [...PRESETS[strKey as keyof typeof PRESETS].points];
      triggerRef(polygonPoints);
    }
  };

  const updateVertexPosition = (idx: number, x: number, y: number) => {
    const pts = [...polygonPoints.value];
    pts[idx] = {
      x: Math.min(780, Math.max(20, x)),
      y: Math.min(580, Math.max(20, y)),
    };
    polygonPoints.value = pts;
    triggerRef(polygonPoints);
  };

  const removeVertexAt = (idx: number) => {
    if (polygonPoints.value.length > 3) {
      const pts = [...polygonPoints.value];
      pts.splice(idx, 1);
      polygonPoints.value = pts;
      triggerRef(polygonPoints);
    }
  };

  return {
    lineSpacing,
    angleDegrees,
    insetPadding,
    turnStyle,
    patternMode,
    selectedPreset,
    polygonPoints,
    pathPoints,
    pathDString,
    stats,
    activeInsetPolygonPoints,
    svgOuterPolygonPoints,
    svgInsetPolygonPoints,
    loadPreset,
    updateVertexPosition,
    removeVertexAt,
    presets: PRESETS,
  };
}
