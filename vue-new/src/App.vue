<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePathfinding } from './composables/usePathfinding'
import { useSimulation } from './composables/useSimulation'
import CanvasRenderer from './components/CanvasRenderer.vue'

const pathfinding = usePathfinding()
const simulation = useSimulation(pathfinding.pathPoints)

const svgCanvasRef = ref<HTMLElement | null>(null)
const draggingIdx = ref<number | null>(null)
const showExportModal = ref(false)
const exportFormat = ref<'JSON' | 'CSV' | 'SVG' | 'G-Code'>('JSON')
const copiedToast = ref(false)

const centerPoint = computed(() => {
  let sx = 0, sy = 0
  pathfinding.polygonPoints.value.forEach(p => { sx += p.x; sy += p.y })
  return { x: sx / pathfinding.polygonPoints.value.length, y: sy / pathfinding.polygonPoints.value.length }
})

const getSvgCoords = (e: MouseEvent | TouchEvent) => {
  if (!svgCanvasRef.value) return { x: 0, y: 0 }
  const rect = svgCanvasRef.value.getBoundingClientRect()
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
  return {
    x: Math.round((clientX - rect.left) * (800 / rect.width)),
    y: Math.round((clientY - rect.top) * (600 / rect.height))
  }
}

const startDrag = (idx: number, e: MouseEvent) => {
  e.stopPropagation()
  draggingIdx.value = idx
}

const onDrag = (e: MouseEvent) => {
  if (draggingIdx.value === null) return
  const { x, y } = getSvgCoords(e)
  pathfinding.updateVertexPosition(draggingIdx.value, x, y)
}

const endDrag = () => {
  draggingIdx.value = null
}

const formattedExportData = computed(() => {
  const pts = pathfinding.pathPoints.value
  if (exportFormat.value === 'JSON') {
    return JSON.stringify({
      angleDegrees: pathfinding.angleDegrees.value,
      lineSpacing: pathfinding.lineSpacing.value,
      totalDistance: pathfinding.stats.value.totalDistance,
      waypoints: pts
    }, null, 2)
  } else if (exportFormat.value === 'CSV') {
    let csv = "Index,X,Y\n"
    pts.forEach((p, i) => { csv += `${i + 1},${p.x.toFixed(2)},${p.y.toFixed(2)}\n` })
    return csv
  } else if (exportFormat.value === 'SVG') {
    return `<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">\n  <path d="${pathfinding.pathDString.value}" fill="none" stroke="#dc2626" stroke-width="2" />\n</svg>`
  } else if (exportFormat.value === 'G-Code') {
    let gcode = "; Boustrophedon Lawnmower Path\nG21 ; Millimeters\nG90 ; Absolute positioning\nG0 Z5.000 ; Lift\n"
    pts.forEach((p, i) => {
      gcode += i === 0
        ? `G0 X${p.x.toFixed(3)} Y${p.y.toFixed(3)}\nG1 Z0.000 F1000\n`
        : `G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} F2000\n`
    })
    gcode += "G0 Z5.000 ; Retract\nM30 ; End Program"
    return gcode
  }
  return ''
})

const copyExportData = () => {
  navigator.clipboard.writeText(formattedExportData.value).then(() => {
    copiedToast.value = true
    setTimeout(() => copiedToast.value = false, 2000)
  })
}
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <!-- Top Bar Navigation -->
    <header
      class="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between shrink-0 shadow-lg">
      <div class="flex items-center space-x-3">
        <div class="p-2 bg-sky-500/10 text-sky-400 rounded-lg border border-sky-500/20">
          <i class="fa-solid fa-route text-xl"></i>
        </div>
        <div>
          <h1 class="font-bold text-lg leading-none tracking-wide text-white">Coverage Path Generator</h1>
          <p class="text-xs text-slate-400 mt-1">Vue 3.6 Vapor Mode Hybrid Architecture</p>
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <button @click="simulation.toggleSimulation"
          :class="simulation.isSimulating.value ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'"
          class="flex items-center space-x-2 px-4 py-2 rounded-lg border font-medium text-sm transition-all hover:brightness-125">
          <i :class="simulation.isSimulating.value ? 'fa-solid fa-pause' : 'fa-solid fa-play'"></i>
          <span>{{ simulation.isSimulating.value ? 'Pause Rover' : 'Start Simulation' }}</span>
        </button>
        <button @click="simulation.resetSimulation"
          class="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition">
          <i class="fa-solid fa-rotate-left"></i>
        </button>

        <div class="h-6 w-px bg-slate-800"></div>

        <button @click="showExportModal = true"
          class="flex items-center space-x-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition shadow-sm">
          <i class="fa-solid fa-download"></i>
          <span>Export Path</span>
        </button>
      </div>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <!-- Standard VDOM Sidebar Controls -->
      <aside
        class="w-80 md:w-96 bg-slate-900/90 border-r border-slate-800 flex flex-col h-full shrink-0 overflow-y-auto p-5 space-y-6">
        <div>
          <label class="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">Polygon
            Presets</label>
          <div class="grid grid-cols-2 gap-2">
            <button v-for="(preset, key) in pathfinding.presets" :key="key" @click="pathfinding.loadPreset(key)"
              :class="pathfinding.selectedPreset.value === key ? 'bg-sky-500/20 border-sky-500 text-sky-300' : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'"
              class="px-3 py-2 text-xs font-medium rounded-lg border transition text-left flex items-center justify-between">
              <span>{{ preset.name }}</span>
            </button>
          </div>
        </div>

        <hr class="border-slate-800" />

        <div class="space-y-4">
          <div>
            <div class="flex justify-between text-xs mb-1.5">
              <span class="text-slate-300 font-medium">Sweep Angle</span>
              <span class="font-mono text-sky-400 font-semibold">{{ pathfinding.angleDegrees }}°</span>
            </div>
            <input type="range" min="0" max="360" step="1" v-model.number="pathfinding.angleDegrees.value"
              class="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
          </div>

          <div>
            <div class="flex justify-between text-xs mb-1.5">
              <span class="text-slate-300 font-medium">Line Spacing</span>
              <span class="font-mono text-sky-400 font-semibold">{{ pathfinding.lineSpacing }} px</span>
            </div>
            <input type="range" min="12" max="90" step="2" v-model.number="pathfinding.lineSpacing.value"
              class="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
          </div>
        </div>
      </aside>

      <!-- Center Map Area -->
      <main class="flex-1 bg-slate-950 grid-bg relative overflow-hidden flex flex-col">
        <!-- Floating Stats Bar Overlay -->
        <div class="absolute top-4 left-4 right-4 z-10 flex flex-wrap gap-3 pointer-events-none">
          <div
            class="bg-slate-900/90 backdrop-blur-md border border-slate-800 px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-3 pointer-events-auto">
            <div class="text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
              <i class="fa-solid fa-ruler-horizontal"></i>
            </div>
            <div>
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Total Distance</div>
              <div class="text-sm font-mono font-bold text-white">{{ pathfinding.stats.value.totalDistance }} <span
                  class="text-xs text-slate-400 font-normal">units</span></div>
            </div>
          </div>

          <div
            class="bg-slate-900/90 backdrop-blur-md border border-slate-800 px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-3 pointer-events-auto">
            <div class="text-sky-400 bg-sky-500/10 p-2 rounded-lg border border-sky-500/20">
              <i class="fa-solid fa-arrows-split-up-and-left"></i>
            </div>
            <div>
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Total Passes</div>
              <div class="text-sm font-mono font-bold text-white">{{ pathfinding.stats.value.passesCount }} <span
                  class="text-xs text-slate-400 font-normal">lines</span></div>
            </div>
          </div>

          <div
            class="bg-slate-900/90 backdrop-blur-md border border-slate-800 px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-3 pointer-events-auto">
            <div class="text-amber-400 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
              <i class="fa-solid fa-location-dot"></i>
            </div>
            <div>
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Waypoints</div>
              <div class="text-sm font-mono font-bold text-white">{{ pathfinding.stats.value.waypointCount }} <span
                  class="text-xs text-slate-400 font-normal">pts</span></div>
            </div>
          </div>
        </div>

        <!-- Canvas Container -->
        <div ref="svgCanvasRef" class="w-full h-full flex items-center justify-center p-6" @mousemove="onDrag"
          @mouseup="endDrag" @mouseleave="endDrag">

          <CanvasRenderer :outer-points="pathfinding.svgOuterPolygonPoints.value"
            :inset-points="pathfinding.svgInsetPolygonPoints.value" :inset-padding="pathfinding.insetPadding.value"
            :path-d-string="pathfinding.pathDString.value" :polygon-points="pathfinding.polygonPoints.value"
            :path-points="pathfinding.pathPoints.value" :sim-pos="simulation.simPos.value"
            :sim-angle="simulation.simAngle.value" :angle-degrees="pathfinding.angleDegrees.value"
            :center-point="centerPoint" @start-drag="startDrag" @remove-vertex="pathfinding.removeVertexAt" />
        </div>

        <!-- Shortcut Hint Footer Bar -->
        <footer
          class="bg-slate-900/80 border-t border-slate-800 px-6 py-2.5 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div class="flex items-center space-x-4">
            <span class="flex items-center"><i class="fa-solid fa-mouse-pointer text-sky-400 mr-1.5"></i> Drag vertex
              nodes to reshape</span>
            <span class="flex items-center"><i class="fa-solid fa-arrows-rotate text-amber-400 mr-1.5"></i> Adjust angle
              slider for rotation</span>
          </div>
          <div class="font-mono text-[11px] text-slate-500">
            Path Engine: Lawnmower Boustrophedon Scanline (Vue 3.6 Vapor Mode)
          </div>
        </footer>
      </main>
    </div>

    <!-- Export Modal Dialog -->
    <div v-if="showExportModal"
      class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      @click.self="showExportModal = false">
      <div
        class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <i class="fa-solid fa-code text-sky-400"></i>
            <h2 class="font-bold text-white">Export Waypoint Path Data</h2>
          </div>
          <button @click="showExportModal = false" class="text-slate-400 hover:text-white text-lg">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="px-6 pt-4 flex space-x-2 border-b border-slate-800">
          <button v-for="fmt in ['JSON', 'CSV', 'SVG', 'G-Code']" :key="fmt" @click="exportFormat = fmt as any"
            :class="exportFormat === fmt ? 'border-sky-500 text-sky-400 bg-sky-500/10' : 'border-transparent text-slate-400 hover:text-slate-200'"
            class="px-4 py-2 text-xs font-semibold border-b-2 rounded-t-lg transition">
            {{ fmt }}
          </button>
        </div>

        <div class="p-6 flex-1 overflow-y-auto">
          <pre
            class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto select-all max-h-80">{{ formattedExportData }}</pre>
        </div>

        <div class="px-6 py-4 border-t border-slate-800 flex justify-between items-center bg-slate-900/50">
          <span class="text-xs text-slate-400 font-mono">{{ pathfinding.pathPoints.value.length }} total points
            generated</span>
          <button @click="copyExportData"
            class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center space-x-1.5">
            <i class="fa-solid" :class="copiedToast ? 'fa-check text-emerald-400' : 'fa-copy'"></i>
            <span>{{ copiedToast ? 'Copied to Clipboard!' : 'Copy Code' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>