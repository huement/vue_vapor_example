<script setup vapor lang="ts">
import type { Point } from '../composables/usePathfinding'

defineProps<{
  outerPoints: string
  insetPoints: string
  insetPadding: number
  pathDString: string
  polygonPoints: Point[]
  pathPoints: Point[]
  simPos: Point
  simAngle: number
  angleDegrees: number
  centerPoint: Point
}>()

const emit = defineEmits<{
  (e: 'start-drag', index: number, event: MouseEvent): void
  (e: 'remove-vertex', index: number): void
}>()

const toRad = (deg: number) => (deg * Math.PI) / 180
</script>

<template>
  <svg viewBox="0 0 800 600"
    class="w-full h-full max-w-5xl max-h-[750px] bg-slate-900/60 rounded-2xl border border-slate-800/80 shadow-2xl select-none">

    <!-- Background Grid Pattern -->
    <defs>
      <pattern id="canvas-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.04)" stroke-width="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#canvas-grid)" />

    <!-- Outer Polygon -->
    <polygon :points="outerPoints" fill="rgba(14, 165, 233, 0.1)" stroke="rgba(14, 165, 233, 0.4)" stroke-width="2"
      class="fill-sky-500/10 stroke-sky-500/40 stroke-2" />

    <!-- Inset Offset Polygon -->
    <polygon v-if="insetPadding > 0 && insetPoints" :points="insetPoints" fill="none" stroke="rgba(245, 158, 11, 0.3)"
      stroke-width="1" stroke-dasharray="4,4"
      class="fill-transparent stroke-amber-500/30 stroke-1 stroke-dasharray-[4,4]" />

    <!-- Sweeping Ray Direction Visualizer -->
    <g opacity="0.15">
      <line :x1="centerPoint.x - Math.cos(toRad(angleDegrees)) * 1000"
        :y1="centerPoint.y - Math.sin(toRad(angleDegrees)) * 1000"
        :x2="centerPoint.x + Math.cos(toRad(angleDegrees)) * 1000"
        :y2="centerPoint.y + Math.sin(toRad(angleDegrees)) * 1000" stroke="#0ea5e9" stroke-width="1.5"
        stroke-dasharray="6,6" />
    </g>

    <!-- Red Sweeping Path String -->
    <path :d="pathDString" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round"
      stroke-linejoin="round" class="stroke-rose-500 stroke-[2.5]" />

    <!-- Waypoint Dots -->
    <g v-if="pathPoints.length < 150">
      <circle v-for="(pt, idx) in pathPoints" :key="'wpt-' + idx" :cx="pt.x" :cy="pt.y" r="3" fill="#fb7185"
        opacity="0.6" class="fill-rose-400 opacity-60" />
    </g>

    <!-- Start Point Indicator -->
    <g v-if="pathPoints.length">
      <circle :cx="pathPoints[0].x" :cy="pathPoints[0].y" r="8" fill="rgba(16, 185, 129, 0.3)" class="animate-ping" />
      <circle :cx="pathPoints[0].x" :cy="pathPoints[0].y" r="6" fill="#10b981" stroke="#0f172a" stroke-width="2" />
      <text :x="pathPoints[0].x + 10" :y="pathPoints[0].y + 4" fill="#34d399" font-family="monospace" font-size="10"
        font-weight="bold">START</text>
    </g>

    <!-- End Point Indicator -->
    <g v-if="pathPoints.length > 1">
      <circle :cx="pathPoints[pathPoints.length - 1].x" :cy="pathPoints[pathPoints.length - 1].y" r="6" fill="#f43f5e"
        stroke="#0f172a" stroke-width="2" />
      <text :x="pathPoints[pathPoints.length - 1].x + 10" :y="pathPoints[pathPoints.length - 1].y + 4" fill="#fb7185"
        font-family="monospace" font-size="10" font-weight="bold">END</text>
    </g>

    <!-- Draggable Vertex Nodes & P1/P2 Text Labels -->
    <g v-for="(p, idx) in polygonPoints" :key="'vert-' + idx">
      <circle :cx="p.x" :cy="p.y" r="10" fill="rgba(14, 165, 233, 0.2)" stroke="#38bdf8" stroke-width="2"
        class="cursor-grab active:cursor-grabbing hover:fill-sky-400/40 transition-colors"
        @mousedown="emit('start-drag', idx, $event)" @dblclick="emit('remove-vertex', idx)" />
      <text :x="p.x" :y="p.y - 14" text-anchor="middle" fill="#cbd5e1" font-family="monospace" font-size="10"
        font-weight="600" class="pointer-events-none select-none">
        P{{ idx + 1 }}
      </text>
    </g>

    <!-- Animated Rover Vehicle -->
    <g v-if="pathPoints.length > 1" :transform="`translate(${simPos.x}, ${simPos.y}) rotate(${simAngle})`">
      <rect x="-12" y="-9" width="24" height="18" rx="4" fill="#0f172a" stroke="#38bdf8" stroke-width="2" />
      <rect x="-10" y="-12" width="6" height="3" rx="1" fill="#0ea5e9" />
      <rect x="4" y="-12" width="6" height="3" rx="1" fill="#0ea5e9" />
      <rect x="-10" y="9" width="6" height="3" rx="1" fill="#0ea5e9" />
      <rect x="4" y="9" width="6" height="3" rx="1" fill="#0ea5e9" />
      <polygon points="8,-4 14,0 8,4" fill="#10b981" />
    </g>
  </svg>
</template>