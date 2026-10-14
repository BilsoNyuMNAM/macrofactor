import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  TrendingDown,
  TrendingUp,
  Minus,
  PauseCircle,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import { TrendResponse, WeightTrendPoint } from '../types';
import { api } from '../api';

interface WeightTrendViewProps {
  data?: TrendResponse | null;
  onRefresh?: () => void;
  onShowToast: (msg: string) => void;
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

// Shaded Wedge Sparkline (Authentic MacroFactor Weight Changes Sparkline)
const TrendAreaSparkline: React.FC<{
  points?: number[];
  width?: number;
  height?: number;
}> = ({ points, width = 85, height = 22 }) => {
  if (!points || points.length < 2) {
    return (
      <svg width={width} height={height} className="overflow-visible">
        <path
          d={`M 0,${height - 6} L ${width * 0.65},${height - 6} L ${width * 0.8},${height - 1} L ${width},${height - 1} L ${width},${height} L 0,${height} Z`}
          fill="rgba(199, 184, 245, 0.08)"
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
        <linearGradient id={`areaGrad-${pts.length}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C7B8F5" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#C7B8F5" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#areaGrad-${pts.length})`} stroke="none" />
      <path
        d={lineD}
        fill="none"
        stroke="#C7B8F5"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// Canvas Catmull-Rom spline drawer
function drawSmoothSpline(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  tension: number = 0.25
) {
  if (pts.length < 2) return;
  if (pts.length === 2) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

    const cp1x = p1.x + ((p2.x - p0.x) / 6) * (1 - tension);
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * (1 - tension);
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * (1 - tension);
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * (1 - tension);

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.stroke();
}

export const WeightTrendView: React.FC<WeightTrendViewProps> = ({
  data: initialData,
  onShowToast: _onShowToast,
}) => {
  const [trendData, setTrendData] = useState<TrendResponse | null>(initialData || null);
  const [_loading, setLoading] = useState<boolean>(!initialData);
  const [timeframe, setTimeframe] = useState<'1W' | '1M' | '3M' | '6M' | '1Y' | 'All'>('1M');

  const fetchTrendData = useCallback(async (tf: '1W' | '1M' | '3M' | '6M' | '1Y' | 'All') => {
    try {
      setLoading(true);
      const res = await api.getTrend(tf);
      setTrendData(res);
    } catch (err) {
      console.error('Failed to load weight trend data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync if prop updates
  useEffect(() => {
    if (initialData) {
      setTrendData(initialData);
    }
  }, [initialData]);

  // Self-fetch fresh data on mount and whenever timeframe changes
  useEffect(() => {
    fetchTrendData(timeframe);
  }, [timeframe, fetchTrendData]);

  const handleTimeframeChange = async (tf: '1W' | '1M' | '3M' | '6M' | '1Y' | 'All') => {
    setTimeframe(tf);
  };

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{
    pt: WeightTrendPoint;
    x: number;
    y: number;
  } | null>(null);

  const filteredEntries = useMemo(() => {
    const entries = trendData?.entries;
    if (!entries || entries.length === 0) return [];
    if (timeframe === 'All') return entries;

    const daysMap = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };
    const days = daysMap[timeframe] || 30;

    const latestDate = new Date(entries[entries.length - 1].date + 'T00:00:00Z');
    const cutoff = new Date(latestDate);
    cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));

    const res = entries.filter((item) => new Date(item.date + 'T00:00:00Z') >= cutoff);
    return res.length > 0 ? res : entries;
  }, [trendData?.entries, timeframe]);

  // Top Hero Header Metrics (Dynamically bound to active timeframe window and scrubber)
  const headerMetrics = useMemo(() => {
    const entries = filteredEntries;
    if (entries.length === 0) {
      return {
        averageWeight: '—',
        differenceWeight: '—',
        dateRangeStr: 'No Data in Timeframe',
        averageLabel: 'Average',
        differenceLabel: 'Difference',
      };
    }

    // Dynamic Scrubber Inspection Mode
    if (hoveredPoint?.pt) {
      const idx = entries.findIndex((e) => e.date === hoveredPoint.pt.date);
      const targetPt = hoveredPoint.pt;
      const avg = targetPt.trendWeight.toFixed(1);

      let diffFormatted = '0.0';
      if (idx > 0) {
        const prevPt = entries[idx - 1];
        const rawDiff = targetPt.trendWeight - prevPt.trendWeight;
        const diffVal = Math.abs(rawDiff).toFixed(1);
        diffFormatted = Math.abs(rawDiff) < 0.05 ? '0.0' : rawDiff < 0 ? `−${diffVal}` : `+${diffVal}`;
      }

      const d = new Date(targetPt.date + 'T00:00:00Z');
      const dateStr = d.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });

      return {
        averageWeight: avg,
        differenceWeight: diffFormatted,
        dateRangeStr: dateStr,
        averageLabel: 'Trend Weight',
        differenceLabel: 'Day Change',
      };
    }

    const sum = entries.reduce((acc, curr) => acc + (curr.trendWeight || 0), 0);
    const avg = (sum / entries.length).toFixed(1);

    const first = entries[0];
    const last = entries[entries.length - 1];
    const rawDiff = (last.trendWeight || 0) - (first.trendWeight || 0);
    const diffVal = Math.abs(rawDiff).toFixed(1);
    const diffFormatted = Math.abs(rawDiff) < 0.05 ? '0.0' : rawDiff < 0 ? `−${diffVal}` : rawDiff > 0 ? `+${diffVal}` : '0.0';

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
      averageWeight: avg,
      differenceWeight: diffFormatted,
      dateRangeStr,
      averageLabel: 'Average',
      differenceLabel: 'Difference',
    };
  }, [filteredEntries, hoveredPoint]);

  // MacroFactor Authentic Canvas Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvasContainerRef.current;
    if (!canvas || !container) return;

    let animId: number;

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const w = rect.width || container.clientWidth || 800;
      const h = rect.height || container.clientHeight || 320;

      if (w <= 0 || h <= 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.resetTransform?.();
      ctx.scale(dpr, dpr);

      const pad = { top: 25, right: 48, bottom: 42, left: 16 };

      // Dark canvas background
      ctx.fillStyle = '#16171B';
      ctx.fillRect(0, 0, w, h);

      if (filteredEntries.length === 0) {
        // Draw subtle placeholder horizontal grid lines
        ctx.strokeStyle = '#23252E';
        ctx.lineWidth = 1;
        for (let y = pad.top; y <= h - pad.bottom; y += 45) {
          ctx.beginPath();
          ctx.moveTo(pad.left, y);
          ctx.lineTo(w - pad.right, y);
          ctx.stroke();
        }
        return;
      }

      let minVal = Infinity;
      let maxVal = -Infinity;
      filteredEntries.forEach((d) => {
        if (d.scaleWeight != null && isFinite(d.scaleWeight)) {
          minVal = Math.min(minVal, d.scaleWeight);
          maxVal = Math.max(maxVal, d.scaleWeight);
        }
        if (d.trendWeight != null && isFinite(d.trendWeight)) {
          minVal = Math.min(minVal, d.trendWeight);
          maxVal = Math.max(maxVal, d.trendWeight);
        }
      });

      if (!isFinite(minVal)) minVal = 77;
      if (!isFinite(maxVal)) maxVal = 81.5;

      let step = 0.5;
      if (maxVal - minVal > 6) step = 1.0;
      if (maxVal - minVal > 14) step = 2.0;

      let yMin = Math.floor(minVal / step) * step;
      let yMax = Math.ceil(maxVal / step) * step;

      if (yMax - yMin < step * 2) {
        yMin -= step;
        yMax += step;
      }

      const getX = (i: number) =>
        pad.left + (i / Math.max(1, filteredEntries.length - 1)) * (w - pad.left - pad.right);

      const getY = (val: number) =>
        pad.top + (1 - (val - yMin) / (yMax - yMin || 1)) * (h - pad.top - pad.bottom);

      // Horizontal subtle solid grid lines
      ctx.lineWidth = 1;
      ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
      ctx.textAlign = 'right';

      for (let gVal = yMin; gVal <= yMax + 0.001; gVal += step) {
        const y = getY(gVal);
        ctx.strokeStyle = '#23252E';
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();

        // Right axis labels (e.g. 81.5, 81.0, 80.5)
        ctx.fillStyle = '#8B8E99';
        ctx.fillText(gVal.toFixed(step < 1 ? 1 : 0), w - 6, y + 4);
      }

      // Bottom x-axis baseline
      ctx.strokeStyle = '#272932';
      ctx.beginPath();
      ctx.moveTo(pad.left, h - pad.bottom + 8);
      ctx.lineTo(w - pad.right, h - pad.bottom + 8);
      ctx.stroke();

      // Bottom x-axis date labels and ticks
      ctx.fillStyle = '#8B8E99';
      ctx.textAlign = 'center';
      const labelInterval = Math.max(1, Math.floor(filteredEntries.length / 6));

      filteredEntries.forEach((d, i) => {
        if (i % labelInterval === 0 || i === filteredEntries.length - 1) {
          const x = getX(i);
          const yTick = h - pad.bottom + 8;

          // Upward tick mark
          ctx.strokeStyle = '#434653';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x, yTick);
          ctx.lineTo(x, yTick - 5);
          ctx.stroke();

          // Date label (e.g. "5 Sept", "20 Sept")
          const dateObj = new Date(d.date + 'T00:00:00Z');
          const dateLabel = dateObj.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          });
          ctx.fillText(dateLabel, x, h - 12);
        }
      });

      // 1. SCALE WEIGHT LINE: Muted dark violet undulating spline
      const scalePts: { x: number; y: number }[] = [];
      filteredEntries.forEach((d, i) => {
        if (d.scaleWeight != null && isFinite(d.scaleWeight)) {
          scalePts.push({ x: getX(i), y: getY(d.scaleWeight) });
        }
      });

      if (scalePts.length === 1) {
        ctx.fillStyle = '#7D739B';
        ctx.beginPath();
        ctx.arc(scalePts[0].x, scalePts[0].y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (scalePts.length >= 2) {
        ctx.strokeStyle = '#7D739B';
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        drawSmoothSpline(ctx, scalePts, 0.05);
      }

      // 2. TREND WEIGHT LINE: Authentic MacroFactor lavender curve
      const trendPts: { x: number; y: number }[] = [];
      filteredEntries.forEach((d, i) => {
        if (d.trendWeight != null && isFinite(d.trendWeight)) {
          trendPts.push({ x: getX(i), y: getY(d.trendWeight) });
        }
      });

      if (trendPts.length === 1) {
        ctx.strokeStyle = '#C7B8F5';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.left, trendPts[0].y);
        ctx.lineTo(w - pad.right, trendPts[0].y);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (trendPts.length >= 2) {
        ctx.strokeStyle = '#C7B8F5';
        ctx.lineWidth = 2.4;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        drawSmoothSpline(ctx, trendPts, 0.15);
      }

      // 3. HOLLOW CIRCLE NODES / DONUT DOTS on Trend Weight
      const nodeStep = filteredEntries.length > 50 ? Math.ceil(filteredEntries.length / 35) : 1;

      trendPts.forEach((pt, i) => {
        if (i % nodeStep === 0 || i === trendPts.length - 1) {
          ctx.fillStyle = '#16171B';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#C7B8F5';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      // 4. ACTIVE TRACKBALL OVERLAY
      if (hoveredPoint) {
        // Vertical dashed guideline
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hoveredPoint.x, pad.top);
        ctx.lineTo(hoveredPoint.x, h - pad.bottom + 8);
        ctx.stroke();
        ctx.setLineDash([]);

        // Active Trend Weight Marker
        const trendY = getY(hoveredPoint.pt.trendWeight);
        ctx.fillStyle = '#C7B8F5';
        ctx.beginPath();
        ctx.arc(hoveredPoint.x, trendY, 5, 0, Math.PI * 2);
        ctx.fill();

        // Active Scale Weight Marker (if present)
        if (hoveredPoint.pt.scaleWeight !== null) {
          const scaleY = getY(hoveredPoint.pt.scaleWeight);
          ctx.fillStyle = '#7D739B';
          ctx.beginPath();
          ctx.arc(hoveredPoint.x, scaleY, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    animId = requestAnimationFrame(render);

    const resizeObserver = new ResizeObserver(() => {
      render();
    });
    resizeObserver.observe(container);

    window.addEventListener('resize', render);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', render);
    };
  }, [filteredEntries, hoveredPoint]);

  const updateHoveredFromClientX = (clientX: number, canvas: HTMLCanvasElement) => {
    if (filteredEntries.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const pad = { left: 16, right: 48 };
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
      return { pt, x: hoverX, y: 75 };
    });
  };

  // Mouse hover detection
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    updateHoveredFromClientX(e.clientX, canvas);
  };

  // Touch scrub detection
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length === 0) return;
    updateHoveredFromClientX(e.touches[0].clientX, canvas);
  };

  const renderStatusBadge = (change?: { delta: number | string; status: string }) => {
    if (!change || change.status === 'Waiting') {
      return (
        <div className="flex items-center gap-1.5 text-[#8B8E99] w-24 justify-end font-medium">
          <PauseCircle className="w-4 h-4 text-[#8B8E99]" />
          <span>Waiting</span>
        </div>
      );
    }
    if (change.status === 'Decrease') {
      return (
        <div className="flex items-center gap-1.5 text-[#868686] w-24 justify-end font-semibold">
          <TrendingDown className="w-4 h-4 text-[#C7B8F5] stroke-[2.2]" />
          <span>Decrease</span>
        </div>
      );
    }
    if (change.status === 'Increase') {
      return (
        <div className="flex items-center gap-1.5 text-[#868686] w-24 justify-end font-semibold">
          <TrendingUp className="w-4 h-4 stroke-[2.2]" />
          <span>Increase</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-gray-400 w-24 justify-end font-semibold">
        <Minus className="w-4 h-4 stroke-[2.5]" />
        <span>Plateau</span>
      </div>
    );
  };

  const horizonRows = [
    { label: '3-day', data: trendData?.changes?.threeDay },
    { label: '7-day', data: trendData?.changes?.sevenDay },
    { label: '14-day', data: trendData?.changes?.fourteenDay },
    { label: '30-day', data: trendData?.changes?.thirtyDay },
    { label: '90-day', data: trendData?.changes?.ninetyDay },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <section className="bg-[#16171B] border border-[#272930] rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Left: KPIs */}
          <div className="flex items-baseline gap-8">
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-400 font-bold">
                {headerMetrics.averageLabel}
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-4xl font-black tracking-tight text-white font-mono tabular-nums">
                  {headerMetrics.averageWeight}
                </span>
                <span className="text-base font-bold text-gray-400">kg</span>
              </div>
              <div className="text-xs text-gray-400 mt-1 flex items-center gap-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span>{headerMetrics.dateRangeStr}</span>
              </div>
            </div>

            <div className="border-l border-[#272930] pl-8">
              <div className="text-xs uppercase tracking-wider text-gray-400 font-bold">
                {headerMetrics.differenceLabel}
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-4xl font-black tracking-tight text-white font-mono tabular-nums">
                  {headerMetrics.differenceWeight}
                </span>
                <span className="text-base font-bold text-gray-400">kg</span>
              </div>
            </div>
          </div> 
        </div>
      </section>

      {/* Main Wide Canvas Chart Section with Bottom Capsule Switcher */}
      <section className="bg-[#16171B] border border-[#272930] rounded-2xl p-6 shadow-sm relative">
        <div ref={canvasContainerRef} className="relative w-full h-80">
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredPoint(null)}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => setHoveredPoint(null)}
            className="w-full h-full block cursor-crosshair rounded-xl touch-none"
          />

          {filteredEntries.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
              <div className="px-5 py-3 rounded-2xl bg-[#1C1D22]/90 border border-[#2D2F38] text-center shadow-xl backdrop-blur-md">
                <p className="text-sm font-semibold text-gray-200">No Weight Data in This Timeframe</p>
                <p className="text-xs text-gray-400 mt-1">Log a weigh-in to view your trend curve</p>
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
                  <span className="w-2.5 h-1 bg-[#5B507A] rounded-full" />
                  Scale Weight:
                </span>
                <span className="font-bold font-mono tabular-nums">
                  {hoveredPoint.pt.scaleWeight !== null
                    ? `${hoveredPoint.pt.scaleWeight.toFixed(1)} kg`
                    : 'No Weigh-in'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-[#c7b8f5]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border border-[#C7B8F5] bg-[#16171B]" />
                  Trend Weight:
                </span>
                <span className="font-bold font-mono tabular-nums">
                  {hoveredPoint.pt.trendWeight.toFixed(2)} kg
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Authentic MacroFactor Bottom Timeframe Pill Capsule */}
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

          <div className="text-xs text-gray-500 font-medium hidden sm:block">
            Noise dampening filters out daily fluid balance fluctuations
          </div>
        </div>
      </section>

      <div className="flex items-center gap-6 justify-center text-xs">
        <div className="flex items-center gap-2">
          <span className="w-5 h-0.5 bg-[#7D739B] rounded-full" />
          <span className="text-gray-300 font-medium">Scale Weight</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-[#C7B8F5] bg-[#16171B]" />
          <span className="text-[#C7B8F5] font-semibold">Weight Trend</span>
        </div>
      </div>

      {/* Insights & Data Section (Matches Image 2 exactly) */}
      <section className="space-y-4">
        <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight px-0.5">
          Insights & Data
        </h3>

        <div className="space-y-4">
          {/* Card 1: Weight Changes */}
          <div className="bg-[#18191E] border border-[#26272F] rounded-2xl p-5 sm:p-6 shadow-sm">
            <h4 className="text-base font-semibold text-white mb-4">Weight Changes</h4>

            <div className="space-y-4">
              {horizonRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-gray-300 font-medium w-16">{row.label}</span>

                  {/* Filled Wedge SVG Sparkline */}
                  <div className="flex items-center justify-center px-2">
                    <TrendAreaSparkline
                      points={row.data?.sparklinePoints}
                      width={85}
                      height={22}
                    />
                  </div>

                  {/* Delta */}
                  <span className="font-bold text-white font-mono text-xs w-20 text-right tabular-nums ">
                    {row.data?.status === 'Waiting'
                      ? '-- kg'
                      : String(row.data?.delta || '').includes('kg')
                        ? row.data?.delta
                        : `${row.data?.delta} kg`}
                  </span>

                  {/* Status Badge */}
                  {renderStatusBadge(row.data)}
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Core Metric Rows (Image 2) */}
          <div className="bg-[#18191E] border border-[#26272F] rounded-2xl p-5 sm:p-6 shadow-sm divide-y divide-[#23252B]">
            {/* Row 1: Current Weight */}
            <div className="flex items-center gap-4 sm:gap-5 pb-4 first:pt-0">
              <div className="bg-[#22242B] border border-[#2D2F38] rounded-xl w-24 sm:w-28 h-20 flex flex-col items-center justify-center shrink-0 shadow-inner">
                <span className="text-2xl font-bold font-mono text-white tracking-tight">
                  {trendData?.entries?.length && trendData?.analytics?.currentWeight
                    ? trendData.analytics.currentWeight.toFixed(1)
                    : '—'}
                </span>
                <span className="text-xs text-gray-400 font-medium mt-0.5">kg</span>
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">Current Weight</h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Our estimate of your true weight after smoothing out day-to-day fluctuations.
                </p>
              </div>
            </div>

            {/* Row 2: Weekly Weight Change */}
            <div className="flex items-center gap-4 sm:gap-5 py-4">
              <div className="bg-[#22242B] border border-[#2D2F38] rounded-xl w-24 sm:w-28 h-20 flex flex-col items-center justify-center shrink-0 shadow-inner">
                <span className="text-2xl font-bold font-mono text-white tracking-tight">
                  {trendData?.entries?.length && trendData?.analytics?.weeklyRateKg != null
                    ? trendData.analytics.weeklyRateKg > 0
                      ? `+${trendData.analytics.weeklyRateKg.toFixed(2)}`
                      : `${trendData.analytics.weeklyRateKg.toFixed(2).replace('-', '−')}`
                    : '—'}
                </span>
                <span className="text-[11px] text-gray-400 font-medium mt-0.5">kg per week</span>
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">Weekly Weight Change</h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Your typical weekly rate of weight loss over the past three weeks.
                </p>
              </div>
            </div>

            {/* Row 3: Energy Deficit */}
            <div className="flex items-center gap-4 sm:gap-5 py-4">
              <div className="bg-[#22242B] border border-[#2D2F38] rounded-xl w-24 sm:w-28 h-20 flex flex-col items-center justify-center shrink-0 shadow-inner">
                <span className="text-2xl font-bold font-mono text-white tracking-tight">
                  {trendData?.entries?.length && trendData?.analytics?.dailyDeficitKcal != null
                    ? trendData.analytics.dailyDeficitKcal > 0
                      ? `+${trendData.analytics.dailyDeficitKcal}`
                      : `${trendData.analytics.dailyDeficitKcal.toString().replace('-', '−')}`
                    : '—'}
                </span>
                <span className="text-[11px] text-gray-400 font-medium mt-0.5">kcal per day</span>
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">Energy Deficit</h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Our estimate of your average daily caloric deficit, based on your rate of weight loss over the past three weeks.
                </p>
              </div>
            </div>

            {/* Row 4: 30-Day Projection */}
            <div className="flex items-center gap-4 sm:gap-5 pt-4 last:pb-0">
              <div className="bg-[#22242B] border border-[#2D2F38] rounded-xl w-24 sm:w-28 h-20 flex flex-col items-center justify-center shrink-0 shadow-inner">
                <span className="text-2xl font-bold font-mono text-white tracking-tight">
                  {trendData?.entries?.length && trendData?.analytics?.projected30d != null
                    ? trendData.analytics.projected30d.toFixed(1)
                    : '—'}
                </span>
                <span className="text-xs text-gray-400 font-medium mt-0.5">kg</span>
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">30-Day Projection</h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Our estimate of your weight in 30 days based on your current rate of weight change.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
