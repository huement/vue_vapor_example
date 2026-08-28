import { ref, shallowRef, watch, onMounted, onUnmounted, type Ref } from "vue";
import { toDeg, type Point } from "./usePathfinding";

export function useSimulation(pathPoints: Ref<Point[]>) {
  const isSimulating = ref(false);
  const simSpeed = ref(6);
  const simProgress = ref(0);
  const simPos = shallowRef<Point>({ x: 0, y: 0 });
  const simAngle = ref(0);
  let simAnimFrame: number | null = null;

  const updateSimPosition = () => {
    const pts = pathPoints.value;
    if (!pts || pts.length < 2) return;

    const segLengths: number[] = [];
    let totalLen = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      segLengths.push(len);
      totalLen += len;
    }
    if (totalLen === 0) return;

    const targetDist = simProgress.value * totalLen;
    let accum = 0;

    for (let i = 0; i < segLengths.length; i++) {
      if (accum + segLengths[i] >= targetDist || i === segLengths.length - 1) {
        const segDist = targetDist - accum;
        const ratio =
          segLengths[i] > 0 ? Math.min(1, segDist / segLengths[i]) : 0;
        const p1 = pts[i];
        const p2 = pts[i + 1];

        simPos.value = {
          x: p1.x + (p2.x - p1.x) * ratio,
          y: p1.y + (p2.y - p1.y) * ratio,
        };
        simAngle.value = toDeg(Math.atan2(p2.y - p1.y, p2.x - p1.x));
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

  const simStep = () => {
    if (isSimulating.value) {
      simProgress.value += 0.0005 * simSpeed.value;
      if (simProgress.value >= 1) simProgress.value = 0;
      updateSimPosition();
    }
    simAnimFrame = requestAnimationFrame(simStep);
  };

  watch([pathPoints, simProgress], updateSimPosition);

  onMounted(() => {
    resetSimulation();
    simAnimFrame = requestAnimationFrame(simStep);
  });

  onUnmounted(() => {
    if (simAnimFrame) cancelAnimationFrame(simAnimFrame);
  });

  return {
    isSimulating,
    simSpeed,
    simPos,
    simAngle,
    toggleSimulation,
    resetSimulation,
  };
}
