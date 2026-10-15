import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  PauseCircle,
  Calendar,
  ChevronDown,
  GraduationCap,
  ChevronsUpDown,
  X,
} from 'lucide-react';
import { ExpenditureResponse, TdeePoint } from '../types';
import { api } from '../api';
import {
  getIsDemoUser,
  getUserOnboarding,
  getUserLogs,
  buildUserExpenditureData,
} from '../utils/userContext';

interface ExpenditureViewProps {
  data?: ExpenditureResponse | null;
  onRefresh?: () => void;
  onShowToast: (msg: string) => void;
  userEmail?: string;
}

// Catmull-Rom smooth spline helper for canvas and SVG
function getSplinePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// Shaded Wedge Sparkline for Expenditure Changes (Matches Image 2 exactly)
const ExpenditureAreaSparkline: React.FC<{
  points?: number[];
  width?: number;
  height?: number;
}> = ({ points, width = 85, height = 22 }) => {
  if (!points || points.length < 2) {
    return (
      <svg width={width} height={height} className="overflow-visible">
        <path
          d={`M 0,${height - 6} L ${width * 0.65},${height - 6} L ${width * 0.8},${height - 1} L ${width},${height - 1} L ${width},${height} L 0,${height} Z`}
          fill="rgba(246, 128, 91, 0.08)"
          stroke="#4B4E5A"
          strokeWidth="1.2"
        />
      </svg>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min === 0 ? 1 : max - min;
  const pad = 2;

  const pts = points.map((val, idx) => {
    const x = pad + (idx / (points.length - 1)) * (width - pad * 2);
    const y = pad + ((max - val) / range) * (height - pad * 2 - 4);
    return { x, y };
  });

  const lineD = getSplinePath(pts);
  const areaD = `${lineD} L ${pts[pts.length - 1].x.toFixed(1)},${height} L ${pts[0].x.toFixed(1)},${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`expAreaGrad-${pts.length}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FA6B4A" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#FA6B4A" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#expAreaGrad-${pts.length})`} stroke="none" />
      <path
        d={lineD}
        fill="none"
        stroke="#FA6B4A"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

interface Point2D {
  x: number;
  y: number;
}

interface BezierSegment {
  p0: Point2D;
  cp1: Point2D;
  cp2: Point2D;
  p1: Point2D;
}

/**
 * Smooth natural / Catmull-Rom spline interpolation (SplineType.natural).
 * Generates continuous smooth Bezier curves matching MacroFactor's expenditure chart.
 */
function computeMonotonicSegments(pts: Point2D[]): BezierSegment[] {
  const n = pts.length;
  if (n < 2) return [];

  if (n === 2) {
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return [
      {
        p0: pts[0],
        cp1: { x: pts[0].x + dx / 3, y: pts[0].y + dy / 3 },
        cp2: { x: pts[1].x - dx / 3, y: pts[1].y - dy / 3 },
        p1: pts[1],
      },
    ];
  }

  const segments: BezierSegment[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i < n - 2 ? pts[i + 2] : p2;

    // Catmull-Rom control points
    let cp1x = p1.x + (p2.x - p0.x) / 6;
    let cp1y = p1.y + (p2.y - p0.y) / 6;
    let cp2x = p2.x - (p3.x - p1.x) / 6;
    let cp2y = p2.y - (p3.y - p1.y) / 6;

    // Prevent overshoot on flat horizontal segments (e.g. holding plateau)
    if (Math.abs(p2.y - p1.y) < 0.001) {
      if (Math.abs(p1.y - p0.y) < 0.001) cp1y = p1.y;
      if (Math.abs(p3.y - p2.y) < 0.001) cp2y = p2.y;
    }

    segments.push({
      p0: p1,
      cp1: { x: cp1x, y: cp1y },
      cp2: { x: cp2x, y: cp2y },
      p1: p2,
    });
  }

  return segments;
}

/**
 * Series 1: Flux Range (Shaded Envelope)
 * Type: SplineRangeAreaSeries<DataExperienceChartPoint, DateTime>
 * borderDrawMode: RangeAreaBorderMode.excludeSides (draws upper/lower boundary curves, excludes vertical closing edges)
 * splineType: SplineType.monotonic (prevents overshoot/unnatural loops)
 * Color: Coral #FA6B4A at 0.18 opacity (dark) or 0.10 (light)
 */
function drawFluxRangeEnvelope(
  ctx: CanvasRenderingContext2D,
  upperPts: Point2D[],
  lowerPts: Point2D[],
  isDark: boolean = true
) {
  if (upperPts.length < 2 || lowerPts.length < 2) return;

  const upperSegs = computeMonotonicSegments(upperPts);
  const lowerSegs = computeMonotonicSegments(lowerPts);

  // 1. Shaded area envelope fill
  ctx.beginPath();
  ctx.moveTo(upperPts[0].x, upperPts[0].y);

  // Forward along upper monotonic spline
  for (const seg of upperSegs) {
    ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p1.x, seg.p1.y);
  }

  // Connect to end of lower spline
  const lastLower = lowerPts[lowerPts.length - 1];
  ctx.lineTo(lastLower.x, lastLower.y);

  // Backward along lower monotonic spline
  for (let i = lowerSegs.length - 1; i >= 0; i--) {
    const seg = lowerSegs[i];
    ctx.bezierCurveTo(seg.cp2.x, seg.cp2.y, seg.cp1.x, seg.cp1.y, seg.p0.x, seg.p0.y);
  }

  ctx.closePath();
  ctx.fillStyle = isDark ? 'rgba(250, 107, 74, 0.18)' : 'rgba(250, 107, 74, 0.10)';
  ctx.fill();

  // 2. borderDrawMode: RangeAreaBorderMode.excludeSides
  // (draws upper/lower boundary curves, excludes vertical closing edges)
  const boundaryColor = isDark ? 'rgba(250, 107, 74, 0.40)' : 'rgba(250, 107, 74, 0.28)';
  ctx.lineWidth = 1.0;
  ctx.strokeStyle = boundaryColor;
  ctx.setLineDash([]);

  // Draw upper boundary curve only
  ctx.beginPath();
  ctx.moveTo(upperPts[0].x, upperPts[0].y);
  for (const seg of upperSegs) {
    ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p1.x, seg.p1.y);
  }
  ctx.stroke();

  // Draw lower boundary curve only
  ctx.beginPath();
  ctx.moveTo(lowerPts[0].x, lowerPts[0].y);
  for (const seg of lowerSegs) {
    ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p1.x, seg.p1.y);
  }
  ctx.stroke();
}

// Typographic delta formatter
function formatDelta(delta: number | string | undefined): string {
  if (delta === undefined || delta === null) return '-- kcal';
  const str = String(delta).trim();
  if (str === '--' || str === '-- kcal') return '-- kcal';
  const numMatch = str.match(/([+-]?\d+)/);
  if (!numMatch) return str;
  const num = parseInt(numMatch[1], 10);
  if (num === 0) return '0 kcal';
  if (num > 0) return `${num} kcal`;
  return `\u2212${Math.abs(num)} kcal`;
}

// Auto-scale bounds calculator based strictly upon daily expenditure values (strictly max 4 y-axis numbers)
function computeExpenditureYTicks(
  expMin: number,
  expMax: number,
  isTight: boolean = true
): { yMin: number; yMax: number; step: number; count: number; ticks: number[] } {
  if (!isFinite(expMin) || !isFinite(expMax) || expMin >= expMax) {
    const center = isFinite(expMin) ? Math.round(expMin) : 2400;
    const step = 50;
    const base = Math.floor(center / step) * step;
    return {
      yMin: base - 50,
      yMax: base + 50,
      step: 50,
      count: 3,
      ticks: [base - 50, base, base + 50],
    };
  }

  // Margin around daily expenditure range
  const margin = isTight ? 2 : 8;
  const targetMin = expMin - margin;
  const targetMax = expMax + margin;
  const span = targetMax - targetMin;

  // Nice human step values
  const candidateSteps = [
    10, 20, 25, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 750, 1000, 1500, 2000,
  ];

  const validOptions: { yMin: number; yMax: number; step: number; count: number; ticks: number[] }[] = [];

  for (const step of candidateSteps) {
    // Strictly max 4 ticks on y-axis ([4, 3])
    for (const count of [4, 3]) {
      const intervals = count - 1;
      const totalSpan = intervals * step;
      if (totalSpan < span) continue;

      const maxYMin = Math.floor(targetMin / step) * step;
      const minYMin = Math.ceil((targetMax - totalSpan) / step) * step;

      if (maxYMin >= minYMin) {
        let bestYMin = maxYMin;
        let bestDiff = Infinity;
        for (let candidateYMin = minYMin; candidateYMin <= maxYMin; candidateYMin += step) {
          const center = candidateYMin + totalSpan / 2;
          const dataCenter = (expMin + expMax) / 2;
          const diff = Math.abs(center - dataCenter);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestYMin = candidateYMin;
          }
        }

        const ticks: number[] = [];
        for (let i = 0; i < count; i++) {
          ticks.push(bestYMin + i * step);
        }

        validOptions.push({
          yMin: bestYMin,
          yMax: bestYMin + totalSpan,
          step,
          count,
          ticks: ticks.slice(0, 4), // Guarantee not more than 4 values on Y-axis
        });
      }
    }
  }

  if (validOptions.length > 0) {
    // Prefer smallest step that accommodates data within max 4 ticks
    validOptions.sort((a, b) => {
      if (a.step !== b.step) return a.step - b.step;
      return b.count - a.count; // prefer 4 over 3 for same step
    });
    const best = validOptions[0];
    return {
      ...best,
      ticks: best.ticks.slice(0, 4),
    };
  }

  // Fallback strictly with 4 ticks
  const fallbackStep = Math.max(50, Math.ceil(span / 3 / 50) * 50);
  const yMin = Math.floor(targetMin / fallbackStep) * fallbackStep;
  return {
    yMin,
    yMax: yMin + fallbackStep * 3,
    step: fallbackStep,
    count: 4,
    ticks: [yMin, yMin + fallbackStep, yMin + fallbackStep * 2, yMin + fallbackStep * 3],
  };
}

export const ExpenditureView: React.FC<ExpenditureViewProps> = ({
  data: initialData,
  onShowToast: _onShowToast,
  userEmail,
}) => {
  const [expData, setExpData] = useState<ExpenditureResponse | null>(initialData || null);
  const [_loading, setLoading] = useState<boolean>(!initialData);
  const [timeframe, setTimeframe] = useState<'1W' | '1M' | '3M' | '6M' | '1Y' | 'All'>('1M');
  const [showLearnModal, setShowLearnModal] = useState(false);
  const [isTightScale, setIsTightScale] = useState(true);

  const fetchExpenditureData = useCallback(async (tf: '1W' | '1M' | '3M' | '6M' | '1Y' | 'All') => {
    try {
      setLoading(true);
      const email = userEmail || localStorage.getItem('mf_user_email');
      if (email && !getIsDemoUser(email)) {
        const onboarding = getUserOnboarding(email);
        const logs = getUserLogs(email, onboarding);
        const userExpData = buildUserExpenditureData(email, onboarding, logs, tf);
        setExpData(userExpData);
        return;
      }
      const res = await api.getExpenditure(tf);
      setExpData(res);
    } catch (err) {
      console.error('Failed to load expenditure data:', err);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  // Sync when initialData changes
  useEffect(() => {
    if (initialData) {
      setExpData(initialData);
    }
  }, [initialData]);

  // Self-fetch fresh data on mount and whenever timeframe changes
  useEffect(() => {
    fetchExpenditureData(timeframe);
  }, [timeframe, fetchExpenditureData]);

  const handleTimeframeChange = async (tf: '1W' | '1M' | '3M' | '6M' | '1Y' | 'All') => {
    setTimeframe(tf);
  };

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{
    pt: TdeePoint;
    x: number;
    y: number;
  } | null>(null);

  const filteredEntries = useMemo(() => {
    const entries = expData?.entries;
    if (!entries || entries.length === 0) return [];
    if (timeframe === 'All') return entries;

    const daysMap = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };
    const days = daysMap[timeframe] || 30;

    const latestDate = new Date(entries[entries.length - 1].date + 'T00:00:00Z');
    const cutoff = new Date(latestDate);
    cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));

    const res = entries.filter((item) => new Date(item.date + 'T00:00:00Z') >= cutoff);
    return res.length > 0 ? res : entries;
  }, [expData?.entries, timeframe]);

  // Header metrics: average + difference over the VISIBLE window (spec: mean over
  // visible window, difference = TDEE_end - TDEE_start). Falls back to server
  // header when it matches the visible window; otherwise computed client-side
  // for display only (no data/logic change).
  const headerMetrics = useMemo(() => {
    const entries = filteredEntries;
    if (entries.length === 0) {
      return { averageKcal: '—', differenceKcal: '—', dateRangeStr: 'No Data in Timeframe' };
    }

    const sum = entries.reduce((acc, curr) => acc + (curr.tdee || 0), 0);
    const avg = Math.round(sum / entries.length);

    const first = entries[0];
    const last = entries[entries.length - 1];
    const rawDiff = (last.tdee || 0) - (first.tdee || 0);
    const diffFormatted = rawDiff > 0 ? `+${rawDiff}` : rawDiff < 0 ? `−${Math.abs(rawDiff)}` : '0';

    const d1 = new Date(first.date + 'T00:00:00Z');
    const d2 = new Date(last.date + 'T00:00:00Z');
    const m1 = d1.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    const m2 = d2.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    const y2 = d2.getUTCFullYear();

    const dateRangeStr =
      m1 === m2
        ? `${d1.getUTCDate()} – ${d2.getUTCDate()} ${m2} ${y2}`
        : `${d1.getUTCDate()} ${m1} – ${d2.getUTCDate()} ${m2} ${y2}`;

    return {
      averageKcal: avg.toLocaleString(),
      differenceKcal: diffFormatted,
      dateRangeStr,
    };
  }, [filteredEntries]);

  // Interactive Chart Canvas Renderer (on-demand render; no rAF loop)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvasContainerRef.current;
    if (!canvas || !container) return;

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const w = rect.width || container.clientWidth || 800;
      const h = rect.height || container.clientHeight || 320;

      if (w <= 0 || h <= 0) return;

      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pad = { top: 25, right: 54, bottom: 42, left: 16 };

      // Dark canvas background
      ctx.fillStyle = '#16171B';
      ctx.fillRect(0, 0, w, h);

      if (filteredEntries.length === 0) {
        // Draw subtle placeholder horizontal grid lines (3 lines)
        ctx.lineWidth = 1;
        const placeholderYs = [
          h - pad.bottom,
          pad.top + (h - pad.top - pad.bottom) / 2,
          pad.top,
        ];
        placeholderYs.forEach((y, idx) => {
          if (idx === 0) {
            ctx.setLineDash([]);
            ctx.strokeStyle = '#272932';
          } else {
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = '#23252E';
          }
          ctx.beginPath();
          ctx.moveTo(pad.left, y);
          ctx.lineTo(w - pad.right, y);
          ctx.stroke();
        });
        ctx.setLineDash([]);
        return;
      }

      let expMin = Infinity;
      let expMax = -Infinity;
      filteredEntries.forEach((d) => {
        if (d.tdee != null && isFinite(d.tdee)) {
          expMin = Math.min(expMin, d.tdee);
          expMax = Math.max(expMax, d.tdee);
        }
      });

      if (!isFinite(expMin)) expMin = 2200;
      if (!isFinite(expMax)) expMax = 2500;

      // Auto-scale bounds strictly based upon daily expenditure values (difference between ticks ~20)
      const { yMin, yMax, ticks } = computeExpenditureYTicks(expMin, expMax, isTightScale);

      const getX = (i: number) =>
        pad.left + (i / Math.max(1, filteredEntries.length - 1)) * (w - pad.left - pad.right);

      const getY = (val: number) =>
        pad.top + (1 - (val - yMin) / (yMax - yMin || 1)) * (h - pad.top - pad.bottom);

      const yBaseline = getY(yMin);

      // Y-Axis: NumericAxis, opposedPosition: true (labels on right),
      // majorGridLines: MajorGridLines(width: 1, color: Color(0xFF23252E), dashArray: <double>[4, 4])
      // Strictly not more than 4 values on Y-axis
      ctx.lineWidth = 1;
      ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
      ctx.textAlign = 'right';

      ticks.forEach((gVal) => {
        const y = getY(gVal);

        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#23252E';

        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#8B8E99';
        ctx.fillText(Math.round(gVal).toString(), w - 8, y + 4);
      });

      // X-Axis baseline
      ctx.strokeStyle = '#272932';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, yBaseline);
      ctx.lineTo(w - pad.right, yBaseline);
      ctx.stroke();

      // X-Axis: DateTimeAxis, majorGridLines: MajorGridLines(width: 0), tick lines point inward.
      ctx.fillStyle = '#8B8E99';
      ctx.textAlign = 'center';
      const labelInterval = Math.max(1, Math.floor(filteredEntries.length / 6));

      filteredEntries.forEach((d, i) => {
        if (i % labelInterval === 0 || i === filteredEntries.length - 1) {
          const x = getX(i);

          // Inward-pointing tick line (points inside canvas towards plot area)
          ctx.strokeStyle = '#434653';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x, yBaseline);
          ctx.lineTo(x, yBaseline - 5);
          ctx.stroke();

          const dateObj = new Date(d.date + 'T00:00:00Z');
          const dateLabel = dateObj.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          });
          ctx.fillText(dateLabel, x, yBaseline + 18);
        }
      });

      // Layer 1: Flux Range (Shaded Envelope)
      // Type: SplineRangeAreaSeries<DataExperienceChartPoint, DateTime>
      // Name: 'Flux Range'
      // highValueMapper: (point, _) => point.fluxHigh
      // lowValueMapper: (point, _) => point.fluxLow
      // borderDrawMode: RangeAreaBorderMode.excludeSides
      // splineType: SplineType.monotonic
      // Color: Coral #FA6B4A at 0.18 opacity (dark) or 0.10 (light)
      const upperPts: Point2D[] = [];
      const lowerPts: Point2D[] = [];
      filteredEntries.forEach((d, i) => {
        const tdee = d.tdee != null && isFinite(d.tdee) ? d.tdee : 2350;
        const u = d.fluxHigh != null && isFinite(d.fluxHigh)
          ? d.fluxHigh
          : (d.fluxUpper != null && isFinite(d.fluxUpper) ? d.fluxUpper : tdee + 35);
        const l = d.fluxLow != null && isFinite(d.fluxLow)
          ? d.fluxLow
          : (d.fluxLower != null && isFinite(d.fluxLower) ? d.fluxLower : tdee - 35);

        upperPts.push({ x: getX(i), y: getY(u) });
        lowerPts.push({ x: getX(i), y: getY(l) });
      });

      // Data points for Updating and Holding series
      const tdeePts = filteredEntries
        .map((d, origIdx) => ({ d, origIdx }))
        .filter(({ d }) => d.tdee != null && isFinite(d.tdee))
        .map(({ d, origIdx }) => ({
          x: getX(origIdx),
          y: getY(d.tdee),
          isHolding: !!d.isHolding || d.strategy === 'holding',
          origIdx,
        }));

      // Clip chart drawing to plot area so curves and envelope never overflow axes or baseline
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad.left, pad.top, w - pad.left - pad.right, yBaseline - pad.top);
      ctx.clip();

      // Render Layer 1: Flux Range (SplineRangeAreaSeries with monotonic spline & excludeSides border)
      if (upperPts.length >= 2) {
        drawFluxRangeEnvelope(ctx, upperPts, lowerPts, true);
      }

      // Layer 2: Updating Series (Solid Line with Nodes)
      // Type: SplineSeries<DataExperienceChartPoint, DateTime>
      // Name: 'Updating', color: Color(0xFFFA6B4A), width: 2.4, splineType: SplineType.monotonic
      // Layer 3: Holding Series (Dashed Line)
      // Symbol: splineSeriesWithDashArray, dashArray: <double>[6, 4]
      if (tdeePts.length === 1) {
        ctx.strokeStyle = '#FA6B4A';
        ctx.lineWidth = 2.4;
        if (tdeePts[0].isHolding) {
          ctx.setLineDash([6, 4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(pad.left, tdeePts[0].y);
        ctx.lineTo(w - pad.right, tdeePts[0].y);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (tdeePts.length >= 2) {
        const tdeeSegs = computeMonotonicSegments(tdeePts);
        ctx.lineWidth = 2.4;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        tdeeSegs.forEach((seg, i) => {
          const targetPt = tdeePts[i + 1];
          const isHoldingSegment = targetPt.isHolding;

          ctx.beginPath();
          ctx.moveTo(seg.p0.x, seg.p0.y);
          ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p1.x, seg.p1.y);

          ctx.strokeStyle = '#FA6B4A';
          if (isHoldingSegment) {
            // Holding Series: dashArray [6, 4]
            ctx.setLineDash([6, 4]);
          } else {
            // Updating Series: Solid Line
            ctx.setLineDash([]);
          }
          ctx.stroke();
        });
        ctx.setLineDash([]);
      }

      ctx.restore();

      // Markers Configuration:
      // Updating Series: shape: circle, width: 6, height: 6, borderWidth: 1.8, borderColor: #FA6B4A, color: #16171B
      // Holding Series: Hollow square (LegendHoldingSquareIcon), width: 6, height: 6, borderWidth: 1.8, borderColor: #FA6B4A, color: #16171B
      const nodeStep = filteredEntries.length > 50 ? Math.ceil(filteredEntries.length / 35) : 1;
      tdeePts.forEach((pt) => {
        if (pt.origIdx % nodeStep === 0 || pt.origIdx === filteredEntries.length - 1) {
          ctx.fillStyle = '#16171B'; // isDark ? Color(0xFF16171B) : Colors.white
          ctx.strokeStyle = '#FA6B4A';
          ctx.lineWidth = 1.8;

          if (pt.isHolding) {
            // Holding Series: Hollow square (LegendHoldingSquareIcon)
            ctx.beginPath();
            ctx.rect(pt.x - 3, pt.y - 3, 6, 6);
            ctx.fill();
            ctx.stroke();
          } else {
            // Updating Series: Solid Line with Circle Nodes
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
      });

      // 4. Hover Trackball Overlay
      if (hoveredPoint) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hoveredPoint.x, pad.top);
        ctx.lineTo(hoveredPoint.x, yBaseline);
        ctx.stroke();
        ctx.setLineDash([]);

        const ptY = getY(hoveredPoint.pt.tdee);
        ctx.fillStyle = '#FA6B4A';
        ctx.strokeStyle = '#16171B';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        if (hoveredPoint.pt.isHolding || hoveredPoint.pt.strategy === 'holding') {
          ctx.rect(hoveredPoint.x - 4, ptY - 4, 8, 8);
        } else {
          ctx.arc(hoveredPoint.x, ptY, 4, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
      }
    };

    render();

    const resizeObserver = new ResizeObserver(() => {
      render();
    });
    resizeObserver.observe(container);

    window.addEventListener('resize', render);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', render);
    };
  }, [filteredEntries, isTightScale, hoveredPoint]);

  // Trackball scrub: snap to nearest date index (mouse + touch)
  const updateHoveredFromClientX = (clientX: number, canvas: HTMLCanvasElement) => {
    if (filteredEntries.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const pad = { left: 16, right: 54 };
    const chartW = rect.width - pad.left - pad.right;

    let closestIdx = 0;
    let minDiff = Infinity;
    filteredEntries.forEach((_, i) => {
      const curX = pad.left + (i / Math.max(1, filteredEntries.length - 1)) * chartW;
      const diff = Math.abs(x - curX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });

    const pt = filteredEntries[closestIdx];
    const hoverX = pad.left + (closestIdx / Math.max(1, filteredEntries.length - 1)) * chartW;
    setHoveredPoint((prev) => {
      if (prev && prev.pt.date === pt.date) return prev;
      return { pt, x: hoverX, y: 85 };
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    updateHoveredFromClientX(e.clientX, canvas);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length === 0) return;
    updateHoveredFromClientX(e.touches[0].clientX, canvas);
  };

  // Status Badge for Expenditure Changes (Matches Image 2 exactly)
  const renderStatusBadge = (change?: { delta: number | string; status: string }) => {
    if (!change || change.status === 'Waiting') {
      return (
        <div className="flex items-center gap-1.5 text-[#868686] w-24 justify-end font-medium">
          <PauseCircle className="w-4 h-4 text-[#FA6B4A]" />
          <span>Waiting</span>
        </div>
      );
    }
    if (change.status === 'Increase') {
      return (
        <div className="flex items-center gap-1.5 text-[#868686] w-24 justify-end font-semibold">
          <ArrowUpRight className="w-4 h-4 text-[#FA6B4A] stroke-[2.2]" />
          <span>Increase</span>
        </div>
      );
    }
    if (change.status === 'Decrease') {
      return (
        <div className="flex items-center gap-1.5 text-[#868686] w-24 justify-end font-semibold">
          <ArrowDownRight className="w-4 h-4 text-[#FA6B4A] stroke-[2.2]" />
          <span>Decrease</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-[#868686] w-24 justify-end font-semibold">
        <ArrowRight className="w-4 h-4 text-[#FA6B4A] stroke-[2.2]" />
        <span>No Change</span>
      </div>
    );
  };

  const horizonRows = [
    { label: '3-day', data: expData?.changes?.threeDay },
    { label: '7-day', data: expData?.changes?.sevenDay },
    { label: '14-day', data: expData?.changes?.fourteenDay },
    { label: '30-day', data: expData?.changes?.thirtyDay },
    { label: '90-day', data: expData?.changes?.ninetyDay },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <section className="bg-[#16171B] border border-[#272930] rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Left: KPIs (static during scrub; tooltip shows inspected values) */}
          <div className="flex items-baseline gap-8">
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-400 font-bold">
                Average
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-4xl font-black tracking-tight text-white font-mono tabular-nums">
                  {headerMetrics.averageKcal === '—'
                    ? '—'
                    : isNaN(Number(headerMetrics.averageKcal))
                    ? headerMetrics.averageKcal
                    : Number(headerMetrics.averageKcal).toLocaleString()}
                </span>
                <span className="text-base font-bold text-gray-400">kcal</span>
              </div>
              <div className="text-xs text-gray-400 mt-1 flex items-center gap-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span>{headerMetrics.dateRangeStr}</span>
              </div>
            </div>

            <div className="border-l border-[#272930] pl-8">
              <div className="text-xs uppercase tracking-wider text-gray-400 font-bold">
                Difference
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-4xl font-black tracking-tight text-white font-mono tabular-nums">
                  {headerMetrics.differenceKcal}
                </span>
                <span className="text-base font-bold text-gray-400">kcal</span>
              </div>

            </div>
          </div>

          {/* Right: Legend & Controls */}
          <div className="flex items-center gap-6 text-xs">
            

            <div className="flex items-center gap-2 border-l border-[#272930] pl-4">
              <button
                onClick={() => setIsTightScale(!isTightScale)}
                title={isTightScale ? 'Switch to Standard Scale' : 'Switch to Tight Auto Scale'}
                className={`p-2 rounded-full border transition-all ${
                  isTightScale
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-[#1C1D22] border-[#2E303A] text-gray-400 hover:text-white'
                }`}
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowLearnModal(true)}
                title="What is Expenditure?"
                className="p-2 rounded-full border bg-[#1C1D22] border-[#2E303A] text-gray-400 hover:text-white transition-all"
              >
                <GraduationCap className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Wide Canvas Chart Section with Timeframe Capsule */}
      <section className="bg-[#16171B] border border-[#272930] rounded-2xl p-6 shadow-sm relative">
        <div ref={canvasContainerRef} className="relative w-full h-80">
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredPoint(null)}
            onTouchStart={handleTouchMove}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => setHoveredPoint(null)}
            className="w-full h-full block cursor-crosshair rounded-xl touch-none"
          />

          {filteredEntries.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
              <div className="px-5 py-3 rounded-2xl bg-[#1C1D22]/90 border border-[#2D2F38] text-center shadow-xl backdrop-blur-md">
                <p className="text-sm font-semibold text-gray-200">No Expenditure Data in This Timeframe</p>
                <p className="text-xs text-gray-400 mt-1">Log nutrition and weight to calculate energy expenditure</p>
              </div>
            </div>
          )}

          {hoveredPoint && (
            <div
              style={{
                left: `${hoveredPoint.x}px`,
                top: `${hoveredPoint.y}px`,
              }}
              className="absolute pointer-events-none bg-[#1C1D22]/95 border border-[#3A3D47] backdrop-blur-md rounded-xl p-3 shadow-2xl text-xs space-y-1.5 transform -translate-x-1/2 -translate-y-full transition-all z-20"
            >
              <div className="text-[11px] text-gray-400 font-semibold">
                {new Date(hoveredPoint.pt.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                })}
              </div>
              <div className="flex items-center justify-between gap-4 text-white">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border-[1.8px] border-[#FA6B4A] bg-[#16171B]" />
                  Expenditure:
                </span>
                <span className="font-bold font-mono tabular-nums">
                  {hoveredPoint.pt.tdee.toLocaleString()} kcal
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-orange-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-1.5 rounded-sm bg-[#FA6B4A]/18 border-y border-[#FA6B4A]/40" />
                  Flux Range:
                </span>
                <span className="font-bold font-mono">
                  {hoveredPoint.pt.fluxLow ?? hoveredPoint.pt.fluxLower ?? hoveredPoint.pt.tdee - 35} –{' '}
                  {hoveredPoint.pt.fluxHigh ?? hoveredPoint.pt.fluxUpper ?? hoveredPoint.pt.tdee + 35} kcal
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-gray-300">
                <span>Day change:</span>
                <span className="font-bold font-mono">
                  {hoveredPoint.pt.tdeeDelta > 0
                    ? `+${hoveredPoint.pt.tdeeDelta} kcal`
                    : hoveredPoint.pt.tdeeDelta < 0
                    ? `−${Math.abs(hoveredPoint.pt.tdeeDelta)} kcal`
                    : '0 kcal'}
                </span>
              </div>
              <div className="text-[10px] text-gray-400 font-medium pt-1 border-t border-gray-800 flex justify-between">
                <span>Status:</span>
                <span
                  className={
                    hoveredPoint.pt.isHolding ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'
                  }
                >
                  {hoveredPoint.pt.isHolding ? 'Holding □' : 'Updating ○'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Timeframe Pill Capsule */}
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-[#23252E]">
          <div className="flex items-center p-1 bg-[#1F2026] border border-[#2D2F38] rounded-full">
            {(['1W', '1M', '3M', '6M', '1Y', 'All'] as const).map((tf) => {
              const isActive = timeframe === tf;
              return (
                <button
                  key={tf}
                  onClick={() => handleTimeframeChange(tf)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-white text-[#121316] shadow-md font-extrabold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              );
            })}

            {/* D dropdown pill from MacroFactor */}
            <button className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white border-l border-[#2D2F38] ml-1">
              <span>D</span>
              <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

          <div className="hidden sm:block text-xs text-gray-500 font-medium">
            Noise dampening filters out daily metabolic fluctuations
          </div>
        </div>
      </section>

      {/* Dedicated Legend Pill Card (MacroFactor visual specification) */}
      <div className="flex items-center justify-center text-xs gap-6 py-2 px-4 bg-[#18191E] border border-[#26272F] rounded-2xl shadow-sm">
        <div className="flex items-center gap-2">
          <span className="w-4 h-2 rounded-sm bg-[#FA6B4A]/18 border-y border-[#FA6B4A]/40" />
          <span className="text-gray-300 font-medium">Flux Range</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <span className="w-2.5 h-[2.4px] bg-[#FA6B4A]" />
            <span className="w-2.5 h-2.5 rounded-full border-[1.8px] border-[#FA6B4A] bg-[#16171B]" />
            <span className="w-2.5 h-[2.4px] bg-[#FA6B4A]" />
          </div>
          <span className="text-gray-300 font-medium">Updating</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <span className="w-2 h-[2.4px] border-t-2 border-dashed border-[#FA6B4A] mr-0.5" />
            <span className="w-2.5 h-2.5 border-[1.8px] border-[#FA6B4A] bg-[#16171B] rounded-[1px]" />
            <span className="w-2 h-[2.4px] border-t-2 border-dashed border-[#FA6B4A] ml-0.5" />
          </div>
          <span className="text-gray-300 font-medium">Holding</span>
        </div>
      </div>

      {/* Insights & Data Section (Matches Image 2) */}
      <section className="space-y-4">
        <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight px-0.5">
          Insights & Data
        </h3>

        <div className="space-y-4">
          {/* Card 1: Expenditure Changes */}
          <div className="bg-[#18191E] border border-[#26272F] rounded-2xl p-5 sm:p-6 shadow-sm">
            <h4 className="text-base font-semibold text-white mb-4">Expenditure Changes</h4>

            <div className="space-y-4">
              {horizonRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-gray-300 font-medium w-16">{row.label}</span>

                  {/* Filled Wedge SVG Sparkline */}
                  <div className="flex items-center justify-center px-2">
                    <ExpenditureAreaSparkline
                      points={row.data?.sparklinePoints}
                      width={85}
                      height={22}
                    />
                  </div>

                  {/* Delta */}
                  <span className="font-bold text-white font-mono text-xs w-20 text-right tabular-nums">
                    {row.data?.status === 'Waiting'
                      ? '-- kcal'
                      : formatDelta(row.data?.delta)}
                  </span>

                  {/* Status Badge */}
                  {renderStatusBadge(row.data)}
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Core Metric Rows (Image 2) */}
          <div className="bg-[#18191E] border border-[#26272F] rounded-2xl p-5 sm:p-6 shadow-sm divide-y divide-[#23252B]">
            {/* Row 1: Current Expenditure */}
            <div className="flex items-center gap-4 sm:gap-5 pb-4 first:pt-0">
              <div className="bg-[#22242B] border border-[#2D2F38] rounded-xl w-24 sm:w-28 h-20 flex flex-col items-center justify-center shrink-0 shadow-inner">
                <span className="text-2xl font-bold font-mono text-white tracking-tight">
                  {expData?.currentExpenditure != null ? expData.currentExpenditure.toLocaleString() : (filteredEntries.length > 0 ? filteredEntries[filteredEntries.length - 1].tdee.toLocaleString() : '—')}
                </span>
                {(expData?.currentExpenditure != null || filteredEntries.length > 0) && (
                  <span className="text-xs text-gray-400 font-medium mt-0.5">kcal</span>
                )}
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">Current Expenditure</h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  The latest estimate of your daily energy expenditure based on your weight trend and nutrition data.
                </p>
              </div>
            </div>

            {/* Row 2: Current Strategy */}
            <div className="flex items-center gap-4 sm:gap-5 pt-4 last:pb-0">
              <div className="bg-[#22242B] border border-[#2D2F38] rounded-xl w-24 sm:w-28 h-20 flex flex-col items-center justify-center shrink-0 shadow-inner">
                <span className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  {expData?.currentStrategy || 'Holding'}
                </span>
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">Current Strategy</h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Holding safeguards your expenditure estimate against insufficient data. Updating requires at least 4 days of food logging and 1 day of weight logging per 7-day period.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Daily Expenditure History by Month (Matches Image 1) */}
      <section className="space-y-4">
        {expData?.historyGroups && expData.historyGroups.length > 0 ? (
          expData.historyGroups.map((group) => {
            const title = group.monthYear || group.monthName || '';
            const items = group.entries || group.items || [];
            return (
              <div key={title} className="space-y-3">
                <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight px-0.5">
                  {title}
                </h3>

                <div className="bg-[#18191E] border border-[#26272F] rounded-2xl divide-y divide-[#23252B] overflow-hidden shadow-sm">
                  {items.map((item) => {
                    const dObj = new Date(item.date + 'T00:00:00Z');
                    const dayStr = dObj.toLocaleDateString('en-US', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'UTC',
                    });

                  return (
                    <div
                      key={item.date}
                      className="p-4 sm:px-6 flex items-center justify-between text-xs hover:bg-white/[0.02] transition-colors"
                    >
                      <div>
                        <div className="font-bold text-white font-mono text-[15px] sm:text-base tabular-nums">
                          {item.tdee.toLocaleString()} kcal
                        </div>
                        <div className="text-gray-400 text-xs mt-0.5">{dayStr}</div>
                      </div>

                      <div>
                        {item.isHolding ? (
                          <div className="flex items-center gap-2 text-gray-400 font-medium text-xs">
                            <span className="w-3.5 h-3.5 border border-[#8C4B37] rounded-sm bg-transparent" />
                            <span>Holding</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-gray-400 font-mono text-xs tabular-nums">
                            <span className="w-3.5 h-3.5 rounded-full border border-[#FA6B4A] bg-transparent" />
                            <span>
                              {item.tdeeDelta > 0
                                ? `+${item.tdeeDelta} kcal`
                                : item.tdeeDelta < 0
                                ? `\u2212${Math.abs(item.tdeeDelta)} kcal`
                                : '0 kcal'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
        ) : (
          <div className="text-center py-8 text-gray-500 text-xs">
            No expenditure history recorded yet.
          </div>
        )}
      </section>

      {/* MacroFactor Educational Guidance Modal */}
      {showLearnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#1C1D22] border border-[#2F313D] rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between border-b border-[#2B2D38] pb-4">
              <div className="flex items-center gap-2.5 text-white">
                <GraduationCap className="w-5 h-5 text-orange-400" />
                <h3 className="text-base font-bold">Understanding Expenditure</h3>
              </div>
              <button
                onClick={() => setShowLearnModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs leading-relaxed text-gray-300">
              <div>
                <h4 className="font-bold text-white text-sm mb-1">What is Expenditure?</h4>
                <p className="text-gray-400">
                  Expenditure is our running estimate of the total number of calories you burn each day. MacroFactor calculates your true daily energy expenditure from continuous caloric intake and smoothed trend weight flux.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-white text-sm mb-1">What is an expenditure hold?</h4>
                <p className="text-gray-400">
                  When you stop logging, your expenditure estimate stops updating. The hold guards your expenditure from insufficient data and preserves the latest estimate. Updating requires at least 4 days of food logging and 1 day of weight logging per 7-day period.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-white text-sm mb-1">When expenditure starts calculating</h4>
                <p className="text-gray-400">
                  Log your food and weight for 3 days to get your first expenditure update. On Day 3, MacroFactor will pinpoint a more precise expenditure and adapt accordingly.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-[#2B2D38] flex justify-end">
              <button
                onClick={() => setShowLearnModal(false)}
                className="px-4 py-2 bg-white text-[#121316] font-bold text-xs rounded-xl hover:bg-gray-200 transition-all shadow"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
