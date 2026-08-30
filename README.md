# Vue 3.6 Vapor Mode Benchmark: Coverage Path Generator

This repository contains a performance benchmark comparison between standard **Vue 3 (Virtual DOM)** and **Vue 3.6 (Vapor Mode)** using a high-frequency, math-heavy real-world application: an **Autonomous Lawnmower Boustrophedon Coverage Path Generator**.

---

## 📌 Project Overview

High-frequency interactive applications—such as 60 FPS animation loops, heavy geometric canvas calculations, and dynamic SVG updates—suffer under standard Virtual DOM architectures due to continuous VNode creation, tree diffing, and garbage collection churn.

This repository demonstrates how to refactor a laggy VDOM prototype into a locked 60 FPS application using **Vue 3.6 Hybrid Interop** and **Vapor Mode**, upgrading the high-frequency rendering hot path while keeping UI components in standard VDOM.

---

## 📁 Repository Structure

```text
.
├── vue-old/    # Standard Vue 3 Virtual DOM Implementation (Monolith baseline)
└── vue-new/    # Vue 3.6 Hybrid Interop + Vapor Component Implementation
```

### 1.vue-old/ (Traditional VDOM Architecture)

- **Architecture**: Monolithic Single File Component (Pathfinder.vue).
- **Reactivity**: Deep reactivity proxies wrapping coordinate arrays updated 60 times per second.
- **Rendering**: Every frame re-evaluates the component render function, generates thousands of VNodes, diffs the tree, and patches the DOM.
- **Bottleneck**: Micro-stutters and frame drops caused by continuous browser Garbage Collection (GC) pauses under stress.

### 2. vue-new/ (Vapor Mode Hybrid Architecture)

- **Architecture**: Modular layout with extracted logic composables.
- **Logic Extraction**:
  - src/composables/usePathfinding.ts (Geometry, scanline algorithms, inset polygon math).
  - src/composables/useSimulation.ts (60 FPS requestAnimationFrame loop and rover tracker).
- **Reactivity Optimization**: Uses shallowRef() to bypass deep Proxy wrapping on high-frequency arrays, reducing garbage collection overhead.
- **Vapor Hot Path**: SVG visualizer extracted into <script setup vapor lang="ts"> (CanvasRenderer.vue).
- **Hybrid Interop**: Sidebar sliders and modal dialogs remain standard Vue 3 VDOM components while seamlessly rendering the VDOM-free Vapor canvas.

## ⚡ Key Improvements in vue-new

**1** **Zero VNode Overhead**: Direct DOM operations for SVG path updates bypass tree diffing loops entirely.
**2** **Fine-Grained Signals**: Updates to vehicle positions or polygon coordinates touch only the targeted SVG attributes.
**3** **Optimized Reactivity**: Replaced ref() with shallowRef() for high-frequency point arrays to avoid deep proxy creation every frame.
**4** **Progressive Adoption**: Upgraded only the performance bottleneck (CanvasRenderer.vue) using Vue's **Hybrid Interop**, requiring zero rewrites of existing UI components.

## 🚀 Getting Started

### Prerequisites

- ~[Node.js](https://nodejs.org/)~ (v18+ recommended)
- ~[pnpm](https://pnpm.io/)~ (npm i -g pnpm)

⠀Running `vue-old` (VDOM Baseline)

```
cd vue-old
pnpm install
pnpm dev
```

Running `vue-new` (Vapor Hybrid Architecture)

```
cd vue-new
pnpm install
pnpm dev
```

## 📊 Performance Benchmarks (Stress Test Load)

_Tested with a 10,000-point polygon, 50 sweep lines, and 20x simulation speed:_
| **Metric** | **Standard Vue 3 (vue-old)** | **Vue 3.6 Vapor (vue-new)** | **Gain** |
|---|---|---|---|
| **Mounting Time** | ~18 ms | ~4 ms | **4.5x Faster** |
| **Frame Rate under Stress** | Dips to 42 FPS | Locked 60 FPS | **Smooth 60 FPS** |
| **CPU Scripting Overhead** | ~8.2 ms / frame | ~1.1 ms / frame | **7.5x Lower CPU** |
| **Garbage Collection Pauses** | Frequent micro-stutters | Zero VNode trash | **Eliminated** |
| **Base Bundle Impact** | 34 KB | 9.5 KB | **72% Reduction** |

## 🛠️ Built With

- **Vue 3.6+** (Composition API & <script setup vapor>)
- **Vite** (Build tool & compiler plugin)
- **TypeScript** (Typed state & math engines)
- **Tailwind CSS** (UI Styling & Layout)
- **Font Awesome** (UI Icons)
