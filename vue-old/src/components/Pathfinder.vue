
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';

// --- State Variables ---
const lineSpacing = ref(30);
const angleDegrees = ref(45);
const insetPadding = ref(0);
const turnStyle = ref('sharp'); // 'sharp', 'curved', 'square'
const patternMode = ref('zigzag'); // 'zigzag', 'oneway'

const selectedPreset = ref('lshape');
const showExportModal = ref(false);
const exportFormat = ref('JSON');
const copiedToast = ref(false);

const svgCanvas = ref<SVGElement | null>(null);
const draggingIdx = ref<number | null>(null);

// Polygon presets coordinates
const presets = {
  lshape: {
    name: 'L-Shaped Room',
    points: [
      { x: 150, y: 120 },
      { x: 450, y: 120 },
      { x: 450, y: 280 },
      { x: 620, y: 280 },
      { x: 620, y: 480 },
      { x: 150, y: 480 }
    ]
  },
  concave: {
    name: 'Concave Star',
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
      { x: 320, y: 240 }
    ]
  },
  convex: {
    name: 'Irregular Lawn',
    points: [
      { x: 200, y: 150 },
      { x: 550, y: 120 },
      { x: 680, y: 320 },
      { x: 580, y: 490 },
      { x: 250, y: 460 },
      { x: 140, y: 300 }
    ]
  },
  rectangle: {
    name: 'Simple Box',
    points: [
      { x: 200, y: 150 },
      { x: 600, y: 150 },
      { x: 600, y: 450 },
      { x: 200, y: 450 }
    ]
  }
};

const polygonPoints = ref([...presets.lshape.points]);

// Simulation parameters
const isSimulating = ref(false);
const simSpeed = ref(6);
const simProgress = ref(0); // 0 to 1 along overall path distance
let simAnimFrame: number | null = null;

// --- Math Helpers ---
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

function rotatePoint(p: { x: number, y: number }, rad: number) {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos
  };
}

// Polygon Area calculation
const polygonArea = (pts: { x: number, y: number }[]) => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area / 2);
};

// Center of polygon
const centerPoint = computed(() => {
  let sx = 0, sy = 0;
  polygonPoints.value.forEach(p => { sx += p.x; sy += p.y; });
  return { x: sx / polygonPoints.value.length, y: sy / polygonPoints.value.length };
});

// Compute inward inset polygon if padding is requested
const activeInsetPolygonPoints = computed(() => {
  if (insetPadding.value <= 0) return polygonPoints.value;

  const pts = polygonPoints.value;
  const n = pts.length;
  const insetPts = [];

  // Calculate offset lines for each edge
  const lines: { x1: number, y1: number, x2: number, y2: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;

    // Inward normal (assuming CCW/CW ordering)
    const nx = -dy / len;
    const ny = dx / len;

    // Offset line
    lines.push({
      x1: p1.x + nx * insetPadding.value,
      y1: p1.y + ny * insetPadding.value,
      x2: p2.x + nx * insetPadding.value,
      y2: p2.y + ny * insetPadding.value
    });
  }

  // Compute line-line intersections for corners
  for (let i = 0; i < lines.length; i++) {
    const l1 = lines[i];
    const l2 = lines[(i + 1) % lines.length];

    const d = (l1.x1 - l1.x2) * (l2.y1 - l2.y2) - (l1.y1 - l1.y2) * (l2.x1 - l2.x2);
    if (Math.abs(d) < 0.001) {
      insetPts.push({ x: l1.x2, y: l1.y2 });
    } else {
      const ix = ((l1.x1 * l1.y2 - l1.y1 * l1.x2) * (l2.x1 - l2.x2) - (l1.x1 - l1.x2) * (l2.x1 * l2.y2 - l2.y1 * l2.x2)) / d;
      const iy = ((l1.x1 * l1.y2 - l1.y1 * l1.x2) * (l2.y1 - l2.y2) - (l1.y1 - l1.y2) * (l2.x1 * l2.y2 - l2.y1 * l2.x2)) / d;
      insetPts.push({ x: ix, y: iy });
    }
  }

  return insetPts.length >= 3 ? insetPts : polygonPoints.value;
});

// Core Lawnmower Boustrophedon Sweep Algorithm
const pathPoints = computed(() => {
  const poly = activeInsetPolygonPoints.value;
  if (poly.length < 3) return [];

  const rad = toRad(angleDegrees.value);
  const spacing = Math.max(8, lineSpacing.value);

  // 1. Rotate polygon into aligned space (-rad)
  const rotatedPoly = poly.map(p => rotatePoint(p, -rad));

  // 2. Find Y bounds in rotated space
  let minY = Infinity, maxY = -Infinity;
  for (const p of rotatedPoly) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const rawPath: { x: number, y: number }[] = [];
  let reverseDirection = false;

  // 3. Sweep across y lines
  for (let y = minY + spacing / 2; y < maxY; y += spacing) {
    const intersections: number[] = [];

    // Find edge crossings
    for (let i = 0; i < rotatedPoly.length; i++) {
      const p1 = rotatedPoly[i];
      const p2 = rotatedPoly[(i + 1) % rotatedPoly.length];

      if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
        const t = (y - p1.y) / (p2.y - p1.y);
        const xIntersect = p1.x + t * (p2.x - p1.x);
        intersections.push(xIntersect);
      }
    }

    if (intersections.length < 2) continue;

    // Sort intersection X points left to right
    intersections.sort((a, b) => a - b);

    // Group into pairs (handles concave shapes with multiple entry/exits!)
    const lineSegments: { x: number, y: number }[][] = [];
    for (let i = 0; i < intersections.length - 1; i += 2) {
      lineSegments.push([
        { x: intersections[i], y },
        { x: intersections[i + 1], y }
      ]);
    }

    // Reverse or keep pattern
    if (patternMode.value === 'zigzag' && reverseDirection) {
      lineSegments.reverse();
      for (const seg of lineSegments) {
        rawPath.push(seg[1], seg[0]);
      }
    } else {
      for (const seg of lineSegments) {
        rawPath.push(seg[0], seg[1]);
      }
    }

    reverseDirection = !reverseDirection;
  }

  // 4. Rotate generated path back to world coordinate space (+rad)
  return rawPath.map(p => rotatePoint(p, rad));
});

// Path SVG 'd' Attribute with support for Turn Styles
const pathDString = computed(() => {
  const pts = pathPoints.value;
  if (!pts || pts.length === 0) return '';

  if (turnStyle.value === 'sharp') {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i += 2) {
    // Draw scan line segment
    d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;

    // Draw transition turn to next segment start if available
    if (i + 1 < pts.length) {
      const nextPt = pts[i + 1];
      if (turnStyle.value === 'curved') {
        const midX = (pts[i].x + nextPt.x) / 2;
        const midY = (pts[i].y + nextPt.y) / 2;
        d += ` Q ${pts[i].x.toFixed(1)} ${nextPt.y.toFixed(1)}, ${nextPt.x.toFixed(1)} ${nextPt.y.toFixed(1)}`;
      } else if (turnStyle.value === 'square') {
        // Extended loop turn
        const dx = nextPt.x - pts[i].x;
        const dy = nextPt.y - pts[i].y;
        d += ` L ${pts[i].x + dx/2} ${pts[i].y + dy/2} L ${nextPt.x} ${nextPt.y}`;
      }
    }
  }
  return d;
});

// Computed Stats
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
    area: Math.round(polygonArea(polygonPoints.value))
  };
});

// Formatted SVG helper strings
const svgOuterPolygonPoints = computed(() =>
  polygonPoints.value.map(p => `${p.x},${p.y}`).join(' ')
);

const svgInsetPolygonPoints = computed(() =>
  activeInsetPolygonPoints.value.map(p => `${p.x},${p.y}`).join(' ')
);

// Interaction Handlers
const getSvgCoords = (e: MouseEvent | TouchEvent) => {
  if (!svgCanvas.value) return { x: 0, y: 0 };
  const rect = svgCanvas.value.getBoundingClientRect();
  const clientX = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
  const clientY = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
  
  const scaleX = 800 / rect.width;
  const scaleY = 600 / rect.height;

  return {
    x: Math.round((clientX - rect.left) * scaleX),
    y: Math.round((clientY - rect.top) * scaleY)
  };
};

const startDrag = (idx: number, e: MouseEvent) => {
  e.stopPropagation();
  draggingIdx.value = idx;
};

const startTouchDrag = (idx: number, e: TouchEvent) => {
  draggingIdx.value = idx;
};

const onDrag = (e: MouseEvent) => {
  if (draggingIdx.value === null) return;
  const { x, y } = getSvgCoords(e);
  polygonPoints.value[draggingIdx.value] = {
    x: Math.min(780, Math.max(20, x)),
    y: Math.min(580, Math.max(20, y))
  };
};

const onTouchDrag = (e: TouchEvent) => {
  if (draggingIdx.value === null) return;
  onDrag(e as any);
};

const endDrag = () => {
  draggingIdx.value = null;
};

const addVertex = () => {
  const pts = polygonPoints.value;
  const last = pts[pts.length - 1];
  const first = pts[0];
  polygonPoints.value.push({
    x: Math.round((last.x + first.x) / 2 + 30),
    y: Math.round((last.y + first.y) / 2 + 30)
  });
};

const removeLastVertex = () => {
  if (polygonPoints.value.length > 3) {
    polygonPoints.value.pop();
  }
};

const removeVertexAt = (idx: number) => {
  if (polygonPoints.value.length > 3) {
    polygonPoints.value.splice(idx, 1);
  }
};

const loadPreset = (key: string) => {
  selectedPreset.value = key;
  polygonPoints.value = JSON.parse(JSON.stringify(presets[key as keyof typeof presets].points));
  resetSimulation();
};

// Simulation Vehicle Tracker
const simPos = ref({ x: 0, y: 0 });
const simAngle = ref(0);

const updateSimPosition = () => {
  const pts = pathPoints.value;
  if (!pts || pts.length < 2) return;

  // Calculate total path segment lengths
  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y);
    segLengths.push(len);
    totalLen += len;
  }

  if (totalLen === 0) return;

  const targetDist = simProgress.value * totalLen;
  let accum = 0;

  for (let i = 0; i < segLengths.length; i++) {
    if (accum + segLengths[i] >= targetDist || i === segLengths.length - 1) {
      const segDist = targetDist - accum;
      const ratio = segLengths[i] > 0 ? Math.min(1, segDist / segLengths[i]) : 0;
      
      const p1 = pts[i];
      const p2 = pts[i + 1];

      simPos.value = {
        x: p1.x + (p2.x - p1.x) * ratio,
        y: p1.y + (p2.y - p1.y) * ratio
      };

      const rad = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      simAngle.value = toDeg(rad);
      break;
    }
    accum += segLengths[i];
  }
};

const toggleSimulation = () => {
  isSimulating.value = !isSimulating.value;
};

const resetSimulation = () => {
  isSimulating.value = false;
  simProgress.value = 0;
  if (pathPoints.value.length) {
    simPos.value = { ...pathPoints.value[0] };
  }
};

// Animation Frame Loop
const simStep = () => {
  if (isSimulating.value) {
    simProgress.value += (0.0005 * simSpeed.value);
    if (simProgress.value >= 1) {
      simProgress.value = 0; // Loop simulation
    }
    updateSimPosition();
  }
  simAnimFrame = requestAnimationFrame(simStep);
};

watch([pathPoints, simProgress], () => {
  updateSimPosition();
});

onMounted(() => {
  resetSimulation();
  simAnimFrame = requestAnimationFrame(simStep);
});

onUnmounted(() => {
  if (simAnimFrame) cancelAnimationFrame(simAnimFrame);
});

// Export Data Generator
const formattedExportData = computed(() => {
  const pts = pathPoints.value;
  if (exportFormat.value === 'JSON') {
    return JSON.stringify({
      angleDegrees: angleDegrees.value,
      lineSpacing: lineSpacing.value,
      totalDistance: stats.value.totalDistance,
      waypoints: pts
    }, null, 2);
  } else if (exportFormat.value === 'CSV') {
    let csv = "Index,X,Y\n";
    pts.forEach((p, i) => { csv += `${i + 1},${p.x.toFixed(2)},${p.y.toFixed(2)}\n`; });
    return csv;
  } else if (exportFormat.value === 'SVG') {
    return `<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">\n  <path d="${pathDString.value}" fill="none" stroke="#dc2626" stroke-width="2" />\n</svg>`;
  } else if (exportFormat.value === 'G-Code') {
    let gcode = "; Boustrophedon Lawnmower Path\nG21 ; Millimeters\nG90 ; Absolute positioning\nG0 Z5.000 ; Lift\n";
    pts.forEach((p, i) => {
      if (i === 0) {
        gcode += `G0 X${p.x.toFixed(3)} Y${p.y.toFixed(3)}\nG1 Z0.000 F1000\n`;
      } else {
        gcode += `G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} F2000\n`;
      }
    });
    gcode += "G0 Z5.000 ; Retract\nM30 ; End Program";
    return gcode;
  }
  return '';
});

const copyExportData = () => {
  const text = formattedExportData.value;
  navigator.clipboard.writeText(text).then(() => {
    copiedToast.value = true;
    setTimeout(() => copiedToast.value = false, 2000);
  });
};

const downloadExportFile = () => {
  const text = formattedExportData.value;
  const extMap: { [key: string]: string } = { 'JSON': 'json', 'CSV': 'csv', 'SVG': 'svg', 'G-Code': 'gcode' };
  const ext = extMap[exportFormat.value] || 'txt';
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `coverage-path.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
};
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <!-- Top Header Navigation -->
    <header class="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between shrink-0 shadow-lg">
      <div class="flex items-center space-x-3">
        <div class="p-2 bg-sky-500/10 text-sky-400 rounded-lg border border-sky-500/20">
          <i class="fa-solid fa-route text-xl"></i>
        </div>
        <div>
          <h1 class="font-bold text-lg leading-none tracking-wide text-white">Coverage Path Generator</h1>
          <p class="text-xs text-slate-400 mt-1">Boustrophedon Cellular Decomposition & Waypoint Engine</p>
        </div>
      </div>

      <!-- Quick Actions / Simulation Toolbar -->
      <div class="flex items-center space-x-4">
        <!-- Play / Pause Simulation -->
        <button 
          @click="toggleSimulation" 
          :class="isSimulating ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'"
          class="flex items-center space-x-2 px-4 py-2 rounded-lg border font-medium text-sm transition-all hover:brightness-125">
          <i :class="isSimulating ? 'fa-solid fa-pause' : 'fa-solid fa-play'"></i>
          <span>{{ isSimulating ? 'Pause Rover' : 'Start Simulation' }}</span>
        </button>

        <button 
          @click="resetSimulation"
          class="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition">
          <i class="fa-solid fa-rotate-left"></i>
        </button>

        <div class="h-6 w-px bg-slate-800"></div>

        <!-- Export Data Modal Toggle -->
        <button 
          @click="showExportModal = true"
          class="flex items-center space-x-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition shadow-sm">
          <i class="fa-solid fa-download"></i>
          <span>Export Path</span>
        </button>
      </div>
    </header>

    <!-- Main Workspace -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar Controls -->
      <aside class="w-80 md:w-96 bg-slate-900/90 border-r border-slate-800 flex flex-col h-full shrink-0 overflow-y-auto">
        <div class="p-5 space-y-6">

          <!-- Polygon Presets -->
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              <i class="fa-solid fa-shapes mr-1.5 text-sky-400"></i> Polygon Presets
            </label>
            <div class="grid grid-cols-2 gap-2">
              <button 
                v-for="(preset, key) in presets" 
                :key="key"
                @click="loadPreset(key as string)"
                :class="selectedPreset === key ? 'bg-sky-500/20 border-sky-500 text-sky-300' : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'"
                class="px-3 py-2 text-xs font-medium rounded-lg border transition text-left flex items-center justify-between">
                <span>{{ preset.name }}</span>
                <i class="fa-solid fa-angle-right text-[10px] opacity-60"></i>
              </button>
            </div>
          </div>

          <hr class="border-slate-800" />

          <!-- Path Parameters -->
          <div class="space-y-5">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">
              <i class="fa-solid fa-sliders mr-1.5 text-sky-400"></i> Sweep Parameters
            </h3>

            <!-- Angle Control -->
            <div>
              <div class="flex justify-between text-xs mb-1.5">
                <span class="text-slate-300 font-medium">Sweep Angle</span>
                <span class="font-mono text-sky-400 font-semibold">{{ angleDegrees }}°</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="360" 
                step="1"
                v-model.number="angleDegrees" 
                class="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
              
              <!-- Quick Angle Snap Buttons -->
              <div class="flex justify-between gap-1 mt-2">
                <button 
                  v-for="deg in [0, 45, 90, 135, 180]" 
                  :key="deg"
                  @click="angleDegrees = deg"
                  class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-mono rounded text-slate-400 hover:text-white transition">
                  {{ deg }}°
                </button>
              </div>
            </div>

            <!-- Line Spacing / Density -->
            <div>
              <div class="flex justify-between text-xs mb-1.5">
                <span class="text-slate-300 font-medium">Line Spacing / Density</span>
                <span class="font-mono text-sky-400 font-semibold">{{ lineSpacing }} px</span>
              </div>
              <input 
                type="range" 
                min="12" 
                max="90" 
                step="2"
                v-model.number="lineSpacing" 
                class="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
            </div>

            <!-- Boundary Padding / Inset -->
            <div>
              <div class="flex justify-between text-xs mb-1.5">
                <span class="text-slate-300 font-medium">Boundary Inset</span>
                <span class="font-mono text-sky-400 font-semibold">{{ insetPadding }} px</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="40" 
                step="2"
                v-model.number="insetPadding" 
                class="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
            </div>

            <!-- Turn Type Selection -->
            <div>
              <label class="text-xs font-medium text-slate-300 block mb-2">Turn Style</label>
              <div class="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button 
                  @click="turnStyle = 'sharp'"
                  :class="turnStyle === 'sharp' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'"
                  class="py-1.5 text-xs font-medium rounded transition text-center">
                  Sharp 90°
                </button>
                <button 
                  @click="turnStyle = 'curved'"
                  :class="turnStyle === 'curved' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'"
                  class="py-1.5 text-xs font-medium rounded transition text-center">
                  Smooth Arc
                </button>
                <button 
                  @click="turnStyle = 'square'"
                  :class="turnStyle === 'square' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'"
                  class="py-1.5 text-xs font-medium rounded transition text-center">
                  Square Loop
                </button>
              </div>
            </div>

            <!-- Path Pattern Mode -->
            <div>
              <label class="text-xs font-medium text-slate-300 block mb-2">Traversing Order</label>
              <div class="grid grid-cols-2 gap-2">
                <button 
                  @click="patternMode = 'zigzag'"
                  :class="patternMode === 'zigzag' ? 'bg-sky-500/20 border-sky-500 text-sky-300' : 'bg-slate-800/80 border-slate-700 text-slate-400'"
                  class="p-2 border rounded-lg text-xs font-medium flex items-center justify-center space-x-2 transition">
                  <i class="fa-solid fa-[#]"></i>
                  <span>Boustrophedon (Zigzag)</span>
                </button>
                <button 
                  @click="patternMode = 'oneway'"
                  :class="patternMode === 'oneway' ? 'bg-sky-500/20 border-sky-500 text-sky-300' : 'bg-slate-800/80 border-slate-700 text-slate-400'"
                  class="p-2 border rounded-lg text-xs font-medium flex items-center justify-center space-x-2 transition">
                  <i class="fa-solid fa-bars font-bold"></i>
                  <span>Unidirectional</span>
                </button>
              </div>
            </div>
          </div>

          <hr class="border-slate-800" />

          <!-- Canvas Tools & Shape Editing -->
          <div>
            <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              <i class="fa-solid fa-pen-ruler mr-1.5 text-sky-400"></i> Shape Controls
            </h3>
            <div class="space-y-2">
              <div class="flex items-center justify-between bg-slate-800/50 p-2.5 rounded-lg border border-slate-800">
                <span class="text-xs text-slate-300">Vertices Count</span>
                <span class="text-xs font-mono font-bold text-sky-400">{{ polygonPoints.length }} points</span>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <button 
                  @click="addVertex"
                  class="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center justify-center space-x-1.5">
                  <i class="fa-solid fa-plus text-sky-400"></i>
                  <span>Add Point</span>
                </button>
                <button 
                  @click="removeLastVertex"
                  :disabled="polygonPoints.length <= 3"
                  class="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center justify-center space-x-1.5">
                  <i class="fa-solid fa-minus text-rose-400"></i>
                  <span>Remove Point</span>
                </button>
              </div>

              <p class="text-[11px] text-slate-500 italic mt-1">
                <i class="fa-solid fa-circle-info mr-1"></i> Drag vertex nodes on the map to resize shape. Double-click a vertex to delete it.
              </p>
            </div>
          </div>

          <hr class="border-slate-800" />

          <!-- Simulation Settings -->
          <div>
            <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              <i class="fa-solid fa-gauge-high mr-1.5 text-sky-400"></i> Rover Simulation Speed
            </h3>
            <div class="flex items-center space-x-3">
              <input 
                type="range" 
                min="1" 
                max="20" 
                v-model.number="simSpeed" 
                class="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
              <span class="font-mono text-xs font-bold text-sky-400 w-8">{{ simSpeed }}x</span>
            </div>
          </div>

        </div>
      </aside>

      <!-- Center Canvas / Interactive Map Area -->
      <main class="flex-1 bg-slate-950 grid-bg relative overflow-hidden flex flex-col">
        <!-- Overlay Stats Bar -->
        <div class="absolute top-4 left-4 right-4 z-10 flex flex-wrap gap-3 pointer-events-none">
          <div class="bg-slate-900/90 backdrop-blur-md border border-slate-800 px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-3 pointer-events-auto">
            <div class="text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
              <i class="fa-solid fa-ruler-horizontal"></i>
            </div>
            <div>
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Total Distance</div>
              <div class="text-sm font-mono font-bold text-white">{{ stats.totalDistance }} <span class="text-xs text-slate-400 font-normal">units</span></div>
            </div>
          </div>

          <div class="bg-slate-900/90 backdrop-blur-md border border-slate-800 px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-3 pointer-events-auto">
            <div class="text-sky-400 bg-sky-500/10 p-2 rounded-lg border border-sky-500/20">
              <i class="fa-solid fa-arrows-split-up-and-left"></i>
            </div>
            <div>
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Total Passes</div>
              <div class="text-sm font-mono font-bold text-white">{{ stats.passesCount }} <span class="text-xs text-slate-400 font-normal">lines</span></div>
            </div>
          </div>

          <div class="bg-slate-900/90 backdrop-blur-md border border-slate-800 px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-3 pointer-events-auto">
            <div class="text-amber-400 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
              <i class="fa-solid fa-location-dot"></i>
            </div>
            <div>
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Waypoints</div>
              <div class="text-sm font-mono font-bold text-white">{{ stats.waypointCount }} <span class="text-xs text-slate-400 font-normal">pts</span></div>
            </div>
          </div>

          <div class="bg-slate-900/90 backdrop-blur-md border border-slate-800 px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-3 pointer-events-auto">
            <div class="text-indigo-400 bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
              <i class="fa-solid fa-chart-pie"></i>
            </div>
            <div>
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Coverage Area</div>
              <div class="text-sm font-mono font-bold text-white">{{ stats.area }} <span class="text-xs text-slate-400 font-normal">px²</span></div>
            </div>
          </div>
        </div>

        <!-- Interactive SVG Viewport -->
        <div class="w-full h-full flex items-center justify-center p-6">
          <svg 
            ref="svgCanvas"
            viewBox="0 0 800 600" 
            class="w-full h-full max-w-5xl max-h-[750px] bg-slate-900/60 rounded-2xl border border-slate-800/80 shadow-2xl select-none"
            @mousemove="onDrag"
            @mouseup="endDrag"
            @mouseleave="endDrag"
            @touchmove="onTouchDrag"
            @touchend="endDrag">

            <!-- Background Grid Pattern -->
            <defs>
              <pattern id="canvas-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.04)" stroke-width="1"/>
              </pattern>
              
              <!-- Rover / Drone Marker Graphic -->
              <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#0ea5e9" />
              </marker>
            </defs>

            <rect width="100%" height="100%" fill="url(#canvas-grid)" />

            <!-- Original Outer Polygon -->
            <polygon 
              :points="svgOuterPolygonPoints" 
              class="fill-sky-500/10 stroke-sky-500/40 stroke-2" />

            <!-- Inset Offset Polygon (if inset padding > 0) -->
            <polygon 
              v-if="insetPadding > 0 && activeInsetPolygonPoints.length >= 3" 
              :points="svgInsetPolygonPoints" 
              class="fill-transparent stroke-amber-500/30 stroke-1 stroke-dasharray-[4,4]" />

            <!-- Sweeping Ray Direction Visualizer -->
            <g opacity="0.15">
              <line 
                :x1="centerPoint.x - Math.cos(toRad(angleDegrees))*1000" 
                :y1="centerPoint.y - Math.sin(toRad(angleDegrees))*1000" 
                :x2="centerPoint.x + Math.cos(toRad(angleDegrees))*1000" 
                :y2="centerPoint.y + Math.sin(toRad(angleDegrees))*1000" 
                stroke="#0ea5e9" 
                stroke-width="1.5" 
                stroke-dasharray="6,6" />
            </g>

            <!-- Render Coverage Path Line -->
            <path 
              :d="pathDString" 
              fill="none" 
              class="stroke-rose-500 stroke-[2.5]" 
              stroke-linecap="round" 
              stroke-linejoin="round" />

            <!-- Directional Waypoint Dots -->
            <g v-if="pathPoints.length < 150">
              <circle 
                v-for="(pt, idx) in pathPoints" 
                :key="'wpt-'+idx"
                :cx="pt.x" 
                :cy="pt.y" 
                r="3" 
                class="fill-rose-400 opacity-60" />
            </g>

            <!-- Start Point Indicator -->
            <g v-if="pathPoints.length">
              <circle :cx="pathPoints[0].x" :cy="pathPoints[0].y" r="8" class="fill-emerald-500/30 animate-ping" />
              <circle :cx="pathPoints[0].x" :cy="pathPoints[0].y" r="6" class="fill-emerald-500 stroke-2 stroke-slate-900" />
              <text :x="pathPoints[0].x + 10" :y="pathPoints[0].y + 4" class="fill-emerald-400 font-mono text-[10px] font-bold">START</text>
            </g>

            <!-- End Point Indicator -->
            <g v-if="pathPoints.length > 1">
              <circle :cx="pathPoints[pathPoints.length - 1].x" :cy="pathPoints[pathPoints.length - 1].y" r="6" class="fill-rose-500 stroke-2 stroke-slate-900" />
              <text :x="pathPoints[pathPoints.length - 1].x + 10" :y="pathPoints[pathPoints.length - 1].y + 4" class="fill-rose-400 font-mono text-[10px] font-bold">END</text>
            </g>

            <!-- Draggable Vertex Nodes -->
            <g v-for="(p, idx) in polygonPoints" :key="'vert-'+idx">
              <circle 
                :cx="p.x" 
                :cy="p.y" 
                r="10" 
                class="fill-sky-500/20 stroke-sky-400 stroke-2 cursor-grab active:cursor-grabbing hover:fill-sky-400/40 transition-colors"
                @mousedown="startDrag(idx, $event)"
                @touchstart="startTouchDrag(idx, $event)"
                @dblclick="removeVertexAt(idx)" />
              <text 
                :x="p.x" 
                :y="p.y - 14" 
                text-anchor="middle" 
                class="fill-slate-300 font-mono text-[10px] font-semibold pointer-events-none select-none">
                P{{ idx + 1 }}
              </text>
            </g>

            <!-- Animated Rover / Robot Simulation Element -->
            <g v-if="pathPoints.length > 1" :transform="`translate(${simPos.x}, ${simPos.y}) rotate(${simAngle})`">
              <!-- Vehicle Body -->
              <rect x="-12" y="-9" width="24" height="18" rx="4" class="fill-slate-900 stroke-sky-400 stroke-2 shadow-lg" />
              <!-- Vehicle Wheels -->
              <rect x="-10" y="-12" width="6" height="3" rx="1" fill="#0ea5e9" />
              <rect x="4" y="-12" width="6" height="3" rx="1" fill="#0ea5e9" />
              <rect x="-10" y="9" width="6" height="3" rx="1" fill="#0ea5e9" />
              <rect x="4" y="9" width="6" height="3" rx="1" fill="#0ea5e9" />
              <!-- Direction Nose Light -->
              <polygon points="8,-4 14,0 8,4" fill="#10b981" />
            </g>
          </svg>
        </div>

        <!-- Footer / Shortcut Hint bar -->
        <footer class="bg-slate-900/80 border-t border-slate-800 px-6 py-2.5 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div class="flex items-center space-x-4">
            <span class="flex items-center"><i class="fa-solid fa-mouse-pointer text-sky-400 mr-1.5"></i> Drag vertex nodes to reshape</span>
            <span class="flex items-center"><i class="fa-solid fa-arrows-rotate text-amber-400 mr-1.5"></i> Adjust angle slider for rotation</span>
          </div>
          <div class="font-mono text-[11px] text-slate-500">
            Path Engine: Lawnmower Boustrophedon Scanline
          </div>
        </footer>
      </main>
    </div>

    <!-- Export Modal Dialog -->
    <div 
      v-if="showExportModal" 
      class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      @click.self="showExportModal = false">
      <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <!-- Modal Header -->
        <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <i class="fa-solid fa-code text-sky-400"></i>
            <h2 class="font-bold text-white">Export Waypoint Path Data</h2>
          </div>
          <button @click="showExportModal = false" class="text-slate-400 hover:text-white text-lg">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Format Selector Tabs -->
        <div class="px-6 pt-4 flex space-x-2 border-b border-slate-800">
          <button 
            v-for="fmt in ['JSON', 'CSV', 'SVG', 'G-Code']" 
            :key="fmt"
            @click="exportFormat = fmt"
            :class="exportFormat === fmt ? 'border-sky-500 text-sky-400 bg-sky-500/10' : 'border-transparent text-slate-400 hover:text-slate-200'"
            class="px-4 py-2 text-xs font-semibold border-b-2 rounded-t-lg transition">
            {{ fmt }}
          </button>
        </div>

        <!-- Modal Body Content -->
        <div class="p-6 flex-1 overflow-y-auto">
          <pre class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto select-all max-h-80">{{ formattedExportData }}</pre>
        </div>

        <!-- Modal Footer Actions -->
        <div class="px-6 py-4 border-t border-slate-800 flex justify-between items-center bg-slate-900/50">
          <span class="text-xs text-slate-400 font-mono">{{ pathPoints.length }} total points generated</span>
          <div class="flex space-x-3">
            <button 
              @click="copyExportData" 
              class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center space-x-1.5">
              <i class="fa-solid" :class="copiedToast ? 'fa-check text-emerald-400' : 'fa-copy'"></i>
              <span>{{ copiedToast ? 'Copied to Clipboard!' : 'Copy Code' }}</span>
            </button>
            <button 
              @click="downloadExportFile" 
              class="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg transition flex items-center space-x-1.5">
              <i class="fa-solid fa-file-arrow-down"></i>
              <span>Download File</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
    body {
      font-family: 'Inter', sans-serif;
      user-select: none;
    }
    .grid-bg {
      background-size: 20px 20px;
      background-image: 
        linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
    }
    /* Custom scrollbars */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #1e293b;
    }
    ::-webkit-scrollbar-thumb {
      background: #475569;
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #64748b;
    }
</style>
