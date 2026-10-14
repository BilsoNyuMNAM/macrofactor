import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Pencil, ChevronDown, Plus } from 'lucide-react';
import {
  ScaleWeightResponse,
  ScaleWeightHistoryEntry
} from '../types';
import { api } from '../api';
import { ScaleWeightEditModal } from './ScaleWeightEditModal';
import {
  getIsDemoUser,
  getUserOnboarding,
  getUserLogs,
  saveUserLog,
  deleteUserLog,
  buildUserScaleWeightData,
} from '../utils/userContext';

interface ScaleWeightViewProps {
  onShowToast?: (msg: string, isSuccess?: boolean) => void;
  onRefreshAll?: () => Promise<void>;
  userEmail?: string;
}

// Authentic MacroFactor "MF" Logo Badge component
const MacroFactorBadge: React.FC = () => (
  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center p-1.5 shadow-sm border border-black/10 shrink-0">
    <svg viewBox="0 0 40 40" className="w-full h-full" fill="none">
      {/* Outer bounding stylized M and F strokes matching official MF typography */}
      <rect x="2" y="2" width="36" height="36" rx="6" fill="black" />
      {/* Stylized M */}
      <path
        d="M9 29V11H13.5L16.5 21L19.5 11H24V29H20.5V17.5L17.5 27.5H15.5L12.5 17.5V29H9Z"
        fill="white"
      />
      {/* Stylized F */}
      <path
        d="M26 11H33V14.5H29.5V18.5H32.5V22H29.5V29H26V11Z"
        fill="white"
      />
    </svg>
  </div>
);

// Autoscale Icon with top and bottom horizontal bars and vertical arrows
const AutoscaleIcon: React.FC<{ active?: boolean }> = ({ active }) => (
  <svg
    viewBox="0 0 24 24"
    className={`w-4 h-4 ${active ? 'text-[#4ADE80]' : 'text-gray-300'}`}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="4" y1="4" x2="20" y2="4" />
    <polyline points="9 8 12 5 15 8" />
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="9 16 12 19 15 16" />
    <line x1="4" y1="20" x2="20" y2="20" />
  </svg>
);

export const ScaleWeightView: React.FC<ScaleWeightViewProps> = ({
  onShowToast,
  onRefreshAll,
  userEmail,
}) => {
  const [timeframe, setTimeframe] = useState<'1W' | '1M' | '3M' | '6M' | '1Y' | 'All'>('1W');
  const [aggregation, setAggregation] = useState<'D' | 'W' | 'M'>('D');
  const [isAggregationMenuOpen, setIsAggregationMenuOpen] = useState<boolean>(false);
  const [autoscale, setAutoscale] = useState<boolean>(true);
  const [data, setData] = useState<ScaleWeightResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Edit / Log Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingEntry, setEditingEntry] = useState<ScaleWeightHistoryEntry | null>(null);

  // Hover / Trackball tooltip state
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartSvgRef = useRef<SVGSVGElement | null>(null);

  const fetchScaleWeight = async () => {
    try {
      setLoading(true);
      if (userEmail && !getIsDemoUser(userEmail)) {
        const onboarding = getUserOnboarding(userEmail);
        const logs = getUserLogs(userEmail, onboarding);
        const userScaleData = buildUserScaleWeightData(userEmail, onboarding, logs, timeframe, aggregation);
        setData(userScaleData);
      } else {
        const res = await api.getScaleWeight(timeframe, aggregation);
        setData(res);
      }
    } catch (err) {
      console.error('Failed to load scale weight data:', err);
      onShowToast?.('Failed to load scale weight', false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScaleWeight();
  }, [timeframe, aggregation, userEmail]);

  const handleOpenEdit = (entry: ScaleWeightHistoryEntry) => {
    setEditingEntry(entry);
    setIsEditModalOpen(true);
  };

  const handleOpenNew = () => {
    setEditingEntry(null);
    setIsEditModalOpen(true);
  };

  const handleSaveWeighIn = async (entryData: {
    entryId?: number;
    date: string;
    weightKg: number;
    notes?: string;
  }) => {
    if (userEmail && !getIsDemoUser(userEmail)) {
      saveUserLog(userEmail, {
        date: entryData.date,
        scaleWeight: entryData.weightKg,
        notes: entryData.notes,
      });
      onShowToast?.(`Logged scale weight of ${entryData.weightKg} kg`);
    } else {
      if (entryData.entryId) {
        await api.updateScaleWeight(entryData.entryId, {
          weightKg: entryData.weightKg,
          logDate: entryData.date,
          notes: entryData.notes
        });
        onShowToast?.(`Scale weight updated to ${entryData.weightKg} kg`);
      } else {
        await api.saveScaleWeight({
          date: entryData.date,
          weightKg: entryData.weightKg,
          notes: entryData.notes
        });
        onShowToast?.(`Logged scale weight of ${entryData.weightKg} kg`);
      }
    }
    await fetchScaleWeight();
    if (onRefreshAll) await onRefreshAll();
  };

  const handleDeleteWeighIn = async (entryId: number) => {
    if (userEmail && !getIsDemoUser(userEmail)) {
      const onboarding = getUserOnboarding(userEmail);
      const logs = getUserLogs(userEmail, onboarding);
      const match = logs.find((l) => Math.abs(new Date(l.date).getTime()) === entryId);
      if (match) {
        deleteUserLog(userEmail, match.date);
      }
      onShowToast?.('Scale weight entry deleted');
    } else {
      await api.deleteScaleWeight(entryId);
      onShowToast?.('Scale weight entry deleted');
    }
    await fetchScaleWeight();
    if (onRefreshAll) await onRefreshAll();
  };

  // Chart Coordinate Calculations
  const chartPoints = data?.chart.points || [];

  const { yTicks, getX, getY, pathD } = useMemo(() => {
    const width = 800;
    const height = 260;
    const padTop = 30;
    const padBottom = 40;
    const padLeft = 20;
    const padRight = 50;

    if (chartPoints.length === 0) {
      return {
        yTicks: [77, 77.5, 78],
        minY: 77,
        maxY: 78,
        getX: () => 0,
        getY: () => 0,
        pathD: ''
      };
    }

    let minVal = Infinity;
    let maxVal = -Infinity;
    chartPoints.forEach((p) => {
      const v = p.scaleWeight ?? p.interpolatedWeight;
      minVal = Math.min(minVal, v);
      maxVal = Math.max(maxVal, v);
    });

    let effectiveMin: number;
    let effectiveMax: number;

    if (autoscale) {
      // Auto-scale mode: tight span around data values
      effectiveMin = Math.floor(minVal * 2) / 2; // e.g. 77.0
      effectiveMax = Math.ceil(maxVal * 2) / 2;  // e.g. 78.0
      if (effectiveMax - effectiveMin < 1.0) {
        effectiveMin -= 0.5;
        effectiveMax += 0.5;
      }
    } else {
      // Padded view
      effectiveMin = Math.floor(minVal) - 1;
      effectiveMax = Math.ceil(maxVal) + 1;
    }

    // Generate nice step intervals for dotted grid lines (e.g. 0.5 kg increments)
    const span = effectiveMax - effectiveMin;
    const step = span <= 2 ? 0.5 : span <= 5 ? 1.0 : 2.0;

    const ticks: number[] = [];
    let curTick = Math.ceil(effectiveMin / step) * step;
    while (curTick <= effectiveMax + 0.001) {
      ticks.push(Math.round(curTick * 10) / 10);
      curTick += step;
    }

    const rangeY = effectiveMax - effectiveMin || 1;
    const usableHeight = height - padTop - padBottom;
    const usableWidth = width - padLeft - padRight;

    const calcY = (val: number) => {
      const normalized = (val - effectiveMin) / rangeY;
      return padTop + (1 - normalized) * usableHeight;
    };

    const calcX = (idx: number) => {
      if (chartPoints.length <= 1) return padLeft + usableWidth / 2;
      return padLeft + (idx / (chartPoints.length - 1)) * usableWidth;
    };

    // Build SVG Path string connecting the interpolated points
    let d = '';
    chartPoints.forEach((p, idx) => {
      const x = calcX(idx);
      const y = calcY(p.scaleWeight ?? p.interpolatedWeight);
      if (idx === 0) {
        // Start slightly off-canvas to left for visual continuity
        const startX = Math.max(0, x - 20);
        d += `M ${startX.toFixed(1)} ${y.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
      } else {
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
    });

    return {
      yTicks: ticks,
      minY: effectiveMin,
      maxY: effectiveMax,
      getX: calcX,
      getY: calcY,
      pathD: d
    };
  }, [chartPoints, autoscale]);

  // Handle Chart Hover/Touch Events
  const handleChartMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!chartSvgRef.current || chartPoints.length === 0) return;
    const rect = chartSvgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clientX / rect.width));
    const index = Math.round(ratio * (chartPoints.length - 1));
    setHoverIndex(index);
  };

  const handleChartMouseLeave = () => {
    setHoverIndex(null);
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-white space-y-3">
        <div className="w-8 h-8 border-2 border-[#4ADE80] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-gray-400 font-medium">Loading scale weight...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* =========================================================================
          TOP SECTION: Scale Weight Card & Interactive Chart (Matching Image 1)
         ========================================================================= */}
      <div className="bg-[#16171B] border border-[#26272F] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl relative">
        {/* Top Header Metrics Row */}
        <div className="flex items-start justify-between">
          {/* Column 1: Average */}
          <div>
            <div className="text-[13px] font-medium text-gray-400">Average</div>
            <div className="mt-0.5 flex items-baseline">
              <span className="text-[26px] sm:text-[30px] font-bold text-white tracking-tight font-sans">
                {data?.header.average ? data.header.average.toFixed(1) : '77.6'}
              </span>
              <span className="text-[14px] text-gray-400 font-normal ml-1">
                {data?.header.unit || 'kg'}
              </span>
            </div>
            <div className="text-[12px] font-medium text-gray-400 mt-0.5">
              {data?.header.dateRangeSubtitle || '8 - 14 Oct 2026'}
            </div>
          </div>

          {/* Column 2: Difference */}
          <div className="text-center">
            <div className="text-[13px] font-medium text-gray-400">Difference</div>
            <div className="mt-0.5 flex items-baseline justify-center">
              <span className="text-[26px] sm:text-[30px] font-bold text-white tracking-tight font-sans">
                {data?.header.differenceFormatted ? data.header.differenceFormatted.replace(' kg', '') : '+0.1'}
              </span>
              <span className="text-[14px] text-gray-400 font-normal ml-1">
                {data?.header.unit || 'kg'}
              </span>
            </div>
          </div>

          {/* Column 3: Auto-scale Zoom Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoscale(!autoscale)}
              className={`w-9 h-9 rounded-full bg-[#25272E] hover:bg-[#32353E] border border-white/5 flex items-center justify-center transition-all ${
                autoscale ? 'ring-1 ring-[#4ADE80]/50 text-[#4ADE80]' : 'text-gray-400'
              }`}
              title={autoscale ? 'Autoscale Enabled' : 'Fixed Range'}
            >
              <AutoscaleIcon active={autoscale} />
            </button>
          </div>
        </div>

        {/* Main Chart Area */}
        <div className="relative mt-4 sm:mt-6 select-none">
          <svg
            ref={chartSvgRef}
            viewBox="0 0 800 260"
            className="w-full h-[220px] sm:h-[260px] overflow-visible cursor-crosshair"
            onMouseMove={handleChartMouseMove}
            onMouseLeave={handleChartMouseLeave}
          >
            {/* Horizontal Dotted Reference Grid Lines & Y-Axis Labels */}
            {yTicks.map((tick) => {
              const y = getY(tick);
              return (
                <g key={tick}>
                  <line
                    x1="10"
                    y1={y}
                    x2="740"
                    y2={y}
                    stroke="#2D3039"
                    strokeWidth="1.2"
                    strokeDasharray="2 3"
                  />
                  <text
                    x="755"
                    y={y + 4}
                    fill="#9CA3AF"
                    fontSize="11"
                    fontFamily="monospace"
                    textAnchor="start"
                  >
                    {tick % 1 === 0 ? tick.toFixed(0) : tick.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* Connecting Green Scale Weight Trend Line */}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="#4ADE80"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Data Points: Hollow green circles on days with recorded weigh-in */}
            {chartPoints.map((pt, idx) => {
              if (!pt.hasEntry) return null;
              const x = getX(idx);
              const y = getY(pt.scaleWeight!);
              const isHovered = hoverIndex === idx;

              return (
                <g key={pt.date}>
                  {/* Subtle hover pulse */}
                  {isHovered && (
                    <circle
                      cx={x}
                      cy={y}
                      r="7.5"
                      fill="#4ADE80"
                      fillOpacity="0.25"
                      className="animate-pulse"
                    />
                  )}
                  {/* Outer green circle with dark interior */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? 4.5 : 3.8}
                    fill="#16171B"
                    stroke="#4ADE80"
                    strokeWidth="2.2"
                    className="transition-all"
                  />
                </g>
              );
            })}

            {/* Bottom X-Axis Labels (Day of week / dates) */}
            {chartPoints.map((pt, idx) => {
              // If many points (e.g. 1M or 1Y), skip every N labels to avoid overlap
              const total = chartPoints.length;
              const skip = total > 40 ? 6 : total > 14 ? 3 : 1;
              if (idx % skip !== 0 && idx !== total - 1) return null;

              const x = getX(idx);
              const isHovered = hoverIndex === idx;

              return (
                <text
                  key={pt.date}
                  x={x}
                  y="252"
                  fill={isHovered ? '#FFFFFF' : '#9CA3AF'}
                  fontSize="12"
                  fontWeight={isHovered ? 'bold' : 'normal'}
                  fontFamily="sans-serif"
                  textAnchor="middle"
                >
                  {timeframe === '1W' ? pt.dayLabel : `${pt.dayOfMonth}`}
                </text>
              );
            })}

            {/* Hover Vertical Guide Line & Active Tooltip */}
            {hoverIndex !== null && chartPoints[hoverIndex] && (
              <g>
                <line
                  x1={getX(hoverIndex)}
                  y1={25}
                  x2={getX(hoverIndex)}
                  y2={238}
                  stroke="#4ADE80"
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                  strokeOpacity="0.7"
                />
              </g>
            )}
          </svg>

          {/* Interactive Floating Tooltip Pill */}
          {hoverIndex !== null && chartPoints[hoverIndex] && (
            <div
              className="absolute pointer-events-none transform -translate-x-1/2 -top-2 bg-[#202229] border border-[#353842] shadow-xl rounded-xl px-3 py-1.5 text-center z-20"
              style={{
                left: `${(getX(hoverIndex) / 800) * 100}%`
              }}
            >
              <div className="text-[10px] text-gray-400 font-medium">
                {chartPoints[hoverIndex].date}
              </div>
              <div className="text-xs font-bold text-white flex items-center justify-center gap-1">
                {chartPoints[hoverIndex].hasEntry ? (
                  <>
                    <span className="text-[#4ADE80] font-mono">
                      {chartPoints[hoverIndex].scaleWeight?.toFixed(1)} kg
                    </span>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-normal">
                      Weighed
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-gray-300 font-mono">
                      ~{chartPoints[hoverIndex].interpolatedWeight.toFixed(1)} kg
                    </span>
                    <span className="text-[9px] text-gray-400 font-normal">
                      (No log)
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Timeframe Selector Pill Bar (Matching Image 1) */}
        <div className="mt-4 flex items-center justify-between bg-[#1C1D22] border border-[#272930] rounded-full p-1 text-xs">
          <div className="flex items-center space-x-1">
            {(['1W', '1M', '3M', '6M', '1Y', 'All'] as const).map((tf) => {
              const isActive = timeframe === tf;
              return (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3.5 sm:px-4 py-1.5 rounded-full font-bold transition-all ${
                    isActive
                      ? 'bg-white text-black shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tf}
                </button>
              );
            })}
          </div>

          {/* Aggregation Selector Dropdown Pill (D ▾) */}
          <div className="relative">
            <button
              onClick={() => setIsAggregationMenuOpen(!isAggregationMenuOpen)}
              className="px-3 py-1.5 rounded-full text-gray-300 hover:text-white hover:bg-white/5 font-semibold flex items-center gap-1 transition-colors"
            >
              <span>{aggregation}</span>
              <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>

            {isAggregationMenuOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-32 bg-[#202228] border border-[#2F313B] rounded-xl shadow-2xl py-1 z-30 animate-in fade-in">
                <button
                  onClick={() => {
                    setAggregation('D');
                    setIsAggregationMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-white/10 ${
                    aggregation === 'D' ? 'text-[#4ADE80] font-bold' : 'text-gray-300'
                  }`}
                >
                  Daily (D)
                </button>
                <button
                  onClick={() => {
                    setAggregation('W');
                    setIsAggregationMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-white/10 ${
                    aggregation === 'W' ? 'text-[#4ADE80] font-bold' : 'text-gray-300'
                  }`}
                >
                  Weekly (W)
                </button>
                <button
                  onClick={() => {
                    setAggregation('M');
                    setIsAggregationMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-white/10 ${
                    aggregation === 'M' ? 'text-[#4ADE80] font-bold' : 'text-gray-300'
                  }`}
                >
                  Monthly (M)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Legend / Category Indicator Bar (-o- Scale Weight) */}
        <div className="mt-3.5 bg-[#18191E] border border-[#26272F] rounded-xl py-3 flex items-center justify-center gap-2">
          {/* Green Line-Dot Icon */}
          <svg viewBox="0 0 32 16" className="w-6 h-3" fill="none">
            <line x1="2" y1="8" x2="30" y2="8" stroke="#4ADE80" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="16" cy="8" r="3.2" fill="#18191E" stroke="#4ADE80" strokeWidth="2" />
          </svg>
          <span className="text-sm font-semibold text-white tracking-tight">
            Scale Weight
          </span>
        </div>
      </div>

      {/* =========================================================================
          BOTTOM SECTION: Monthly Grouped History Cards (Matching Image 2)
         ========================================================================= */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Weigh-in History
          </h2>

          <button
            onClick={handleOpenNew}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#4ADE80] to-[#22C55E] hover:brightness-110 active:scale-95 text-[#0E0F12] text-xs font-bold shadow-md shadow-emerald-500/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Log Weight</span>
          </button>
        </div>

        {data?.history && data.history.length > 0 ? (
          data.history.map((group) => (
            <div key={group.monthKey} className="space-y-2.5">
              {/* Group Month Title (e.g. "October 2026") */}
              <h3 className="text-[17px] font-bold text-white tracking-tight px-1">
                {group.monthYear}
              </h3>

              {/* Entries Card Container */}
              <div className="bg-[#18191E] border border-[#26272F] rounded-2xl overflow-hidden shadow-lg divide-y divide-[#25272E]/60">
                {group.entries.map((entry) => (
                  <div
                    key={entry.entryId}
                    className="p-4 sm:px-5 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors group"
                  >
                    {/* Left: MF Logo Badge */}
                    <MacroFactorBadge />

                    {/* Middle: Weight & Formatted Date */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[16px] sm:text-[17px] font-bold text-white tracking-tight font-sans">
                        {entry.weightKg.toFixed(1)} kg
                      </div>
                      <div className="text-[13px] text-gray-400 font-medium mt-0.5">
                        {entry.formattedDate}
                      </div>
                    </div>

                    {/* Right: Pencil Edit Action Button */}
                    <button
                      onClick={() => handleOpenEdit(entry)}
                      className="w-9 h-9 rounded-full bg-[#25272E] hover:bg-[#343741] active:scale-90 flex items-center justify-center text-white transition-all shrink-0 shadow-sm"
                      title="Edit Entry"
                    >
                      <Pencil className="w-4 h-4 text-gray-200 group-hover:text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-[#18191E] border border-[#26272F] rounded-2xl p-8 text-center text-gray-400">
            No scale weight entries found. Tap "Log Weight" above to record your first weigh-in.
          </div>
        )}
      </div>

      {/* Scale Weight Edit / Create Modal */}
      <ScaleWeightEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        entry={editingEntry}
        onSave={handleSaveWeighIn}
        onDelete={handleDeleteWeighIn}
      />
    </div>
  );
};
