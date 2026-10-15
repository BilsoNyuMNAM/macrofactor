import React from 'react';
import { ChevronRight, Check, Plus } from 'lucide-react';
import { DashboardResponse, TrendResponse, ExpenditureResponse } from '../types';

interface DashboardViewProps {
  data: DashboardResponse;
  trendData?: TrendResponse | null;
  expenditureData?: ExpenditureResponse | null;
  onNavigateToExpenditure: () => void;
  onNavigateToTrend: () => void;
  onNavigateToScale?: () => void;
  onOpenCheckInModal: () => void;
  onOpenOnboardingModal: () => void;
  onOpenLogModal?: () => void;
}

// Generate smooth cubic bezier path through 2D points
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

// Generate smooth enclosed corridor ribbon (upper curve forward, lower curve backward)
function getCorridorPath(
  upperPts: { x: number; y: number }[],
  lowerPts: { x: number; y: number }[]
): string {
  if (upperPts.length < 2 || lowerPts.length < 2) return '';
  let d = `M ${upperPts[0].x.toFixed(1)} ${upperPts[0].y.toFixed(1)}`;
  for (let i = 0; i < upperPts.length - 1; i++) {
    const p0 = i > 0 ? upperPts[i - 1] : upperPts[i];
    const p1 = upperPts[i];
    const p2 = upperPts[i + 1];
    const p3 = i < upperPts.length - 2 ? upperPts[i + 2] : p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  d += ` L ${lowerPts[lowerPts.length - 1].x.toFixed(1)} ${lowerPts[lowerPts.length - 1].y.toFixed(1)}`;
  for (let i = lowerPts.length - 1; i > 0; i--) {
    const p0 = i < lowerPts.length - 1 ? lowerPts[i + 1] : lowerPts[i];
    const p1 = lowerPts[i];
    const p2 = lowerPts[i - 1];
    const p3 = i > 1 ? lowerPts[i - 2] : p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  d += ' Z';
  return d;
}

// Sparkline for Expenditure (with shaded flux corridor)
const ExpenditureSparkline: React.FC<{
  entries: Array<{ tdee: number; fluxUpper?: number; fluxLower?: number }>;
  baselineTdee?: number;
}> = ({ entries, baselineTdee = 2340 }) => {
  const width = 280;
  const height = 48;
  const padX = 12;
  const padY = 8;

  const base = baselineTdee || 2340;
  const isBaselineOnly = entries.length === 0;

  // Use dynamic baseline if not enough points
  const points =
    entries.length >= 2
      ? entries
      : entries.length === 1
      ? [
          entries[0],
          {
            tdee: entries[0].tdee,
            fluxUpper: entries[0].fluxUpper ?? entries[0].tdee + 45,
            fluxLower: entries[0].fluxLower ?? entries[0].tdee - 45,
          },
        ]
      : [
          { tdee: base, fluxUpper: base + 45, fluxLower: base - 45 },
          { tdee: base, fluxUpper: base + 45, fluxLower: base - 45 },
        ];

  let minY = Infinity;
  let maxY = -Infinity;
  points.forEach((p) => {
    const u = p.fluxUpper ?? p.tdee + 45;
    const l = p.fluxLower ?? p.tdee - 45;
    minY = Math.min(minY, l);
    maxY = Math.max(maxY, u);
  });

  const rangeY = maxY - minY || 1;
  const getY = (val: number) => padY + (1 - (val - minY) / rangeY) * (height - padY * 2);
  const getX = (idx: number) => padX + (idx / (points.length - 1)) * (width - padX * 2);

  const mainPts = points.map((p, i) => ({ x: getX(i), y: getY(p.tdee) }));
  const upperPts = points.map((p, i) => ({ x: getX(i), y: getY(p.fluxUpper ?? p.tdee + 45) }));
  const lowerPts = points.map((p, i) => ({ x: getX(i), y: getY(p.fluxLower ?? p.tdee - 45) }));

  const corridorD = getCorridorPath(upperPts, lowerPts);
  const lineD = getSplinePath(mainPts);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      {corridorD && (
        <path
          d={corridorD}
          fill="rgba(246, 128, 91, 0.14)"
          stroke="rgba(246, 128, 91, 0.25)"
          strokeWidth="0.8"
        />
      )}
      {lineD && (
        <path
          d={lineD}
          fill="none"
          stroke="#F6805B"
          strokeWidth="2"
          strokeDasharray={isBaselineOnly ? '4 3' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {isBaselineOnly ? (
        <circle
          cx={width / 2}
          cy={getY(base)}
          r="3"
          fill="#F6805B"
          stroke="#18191E"
          strokeWidth="1.5"
        />
      ) : (
        mainPts.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r="2.5"
            fill="#18191E"
            stroke="#F6805B"
            strokeWidth="1.6"
          />
        ))
      )}
    </svg>
  );
};

// Sparkline for Weight Trend (smooth downward curve with nodes)
const WeightTrendSparkline: React.FC<{
  weights: number[];
  initialWeight?: number;
}> = ({ weights, initialWeight = 78.0 }) => {
  const width = 280;
  const height = 48;
  const padX = 12;
  const padY = 8;

  const baseW = initialWeight || 78.0;
  const isBaselineOnly = weights.length === 0;

  const points =
    weights.length >= 2
      ? weights
      : weights.length === 1
      ? [weights[0], weights[0]]
      : [baseW, baseW];
  const minY = Math.min(...points) - 0.2;
  const maxY = Math.max(...points) + 0.2;
  const rangeY = maxY - minY || 1;

  const getY = (val: number) => padY + (1 - (val - minY) / rangeY) * (height - padY * 2);
  const getX = (idx: number) => padX + (idx / (points.length - 1)) * (width - padX * 2);

  const pts = points.map((w, i) => ({ x: getX(i), y: getY(w) }));
  const lineD = getSplinePath(pts);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      {lineD && (
        <path
          d={lineD}
          fill="none"
          stroke="#A78BFA"
          strokeWidth="2"
          strokeDasharray={isBaselineOnly ? '4 3' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {isBaselineOnly ? (
        <circle
          cx={width / 2}
          cy={getY(baseW)}
          r="3"
          fill="#A78BFA"
          stroke="#18191E"
          strokeWidth="1.5"
        />
      ) : (
        pts.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r="2.5"
            fill="#18191E"
            stroke="#A78BFA"
            strokeWidth="1.6"
          />
        ))
      )}
    </svg>
  );
};

// Sparkline for Scale Weight (natural day-to-day fluctuations)
const ScaleWeightSparkline: React.FC<{
  weights: number[];
  initialWeight?: number;
}> = ({ weights, initialWeight = 78.0 }) => {
  const width = 280;
  const height = 48;
  const padX = 12;
  const padY = 8;

  const baseW = initialWeight || 78.0;
  const isBaselineOnly = weights.length === 0;

  const points =
    weights.length >= 2
      ? weights
      : weights.length === 1
      ? [weights[0], weights[0]]
      : [baseW, baseW];
  const minY = Math.min(...points) - 0.25;
  const maxY = Math.max(...points) + 0.25;
  const rangeY = maxY - minY || 1;

  const getY = (val: number) => padY + (1 - (val - minY) / rangeY) * (height - padY * 2);
  const getX = (idx: number) => padX + (idx / (points.length - 1)) * (width - padX * 2);

  const pts = points.map((w, i) => ({ x: getX(i), y: getY(w) }));
  const lineD = getSplinePath(pts);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      {lineD && (
        <path
          d={lineD}
          fill="none"
          stroke="#4ADE80"
          strokeWidth="2"
          strokeDasharray={isBaselineOnly ? '4 3' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {isBaselineOnly ? (
        <circle
          cx={width / 2}
          cy={getY(baseW)}
          r="3"
          fill="#4ADE80"
          stroke="#18191E"
          strokeWidth="1.5"
        />
      ) : (
        pts.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r="2.5"
            fill="#18191E"
            stroke="#4ADE80"
            strokeWidth="1.6"
          />
        ))
      )}
    </svg>
  );
};


export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  trendData,
  expenditureData,
  onNavigateToExpenditure,
  onNavigateToTrend,
  onNavigateToScale,
  onOpenCheckInModal,
  onOpenOnboardingModal: _onOpenOnboardingModal,
  onOpenLogModal,
}) => {
  // Extract recent 7 expenditure points
  const recentExpenditure = React.useMemo(() => {
    if (expenditureData?.entries && expenditureData.entries.length > 0) {
      return expenditureData.entries.slice(-7).map((e) => ({
        tdee: e.tdee,
        fluxUpper: e.fluxUpper,
        fluxLower: e.fluxLower,
      }));
    }
    if (data.recentTdee && data.recentTdee.length > 0) {
      return data.recentTdee.slice(-7).map((e) => ({
        tdee: e.tdee,
        fluxUpper: e.fluxUpper ?? e.tdee + 45,
        fluxLower: e.fluxLower ?? e.tdee - 45,
      }));
    }
    return [];
  }, [expenditureData, data.recentTdee]);

  // Extract recent 7 trend weights
  const recentTrendWeights = React.useMemo(() => {
    if (trendData?.entries && trendData.entries.length > 0) {
      return trendData.entries.slice(-7).map((e) => e.trendWeight);
    }
    if (data.recentTrend && data.recentTrend.length > 0) {
      return data.recentTrend.map((t) => t.weight);
    }
    return [];
  }, [trendData, data.recentTrend]);

  // Extract recent 7 scale weights (where recorded)
  const recentScaleWeights = React.useMemo(() => {
    if (trendData?.entries && trendData.entries.length > 0) {
      const withScale = trendData.entries
        .filter((e) => e.scaleWeight !== null && e.scaleWeight !== undefined)
        .map((e) => e.scaleWeight as number);
      if (withScale.length > 0) {
        return withScale.slice(-7);
      }
    }
    if (data.recentScale && data.recentScale.length > 0) {
      return data.recentScale.map((s) => s.weight);
    }
    return [];
  }, [trendData, data.recentScale]);

  const hasScaleWeight = recentScaleWeights.length > 0;
  const hasTrendWeight = recentTrendWeights.length > 0 || Boolean(trendData?.entries && trendData.entries.length > 0);
  const hasExpenditure = recentExpenditure.length > 0 || Boolean(expenditureData?.entries && expenditureData.entries.length > 0);

  // Expenditure metric value & subtitle
  const expNum =
    data.currentTdee ??
    (recentExpenditure.length > 0 ? recentExpenditure[recentExpenditure.length - 1].tdee : null) ??
    expenditureData?.currentExpenditure ??
    data.profile?.baselineTdee ??
    null;
  const expenditureVal = expNum != null ? Math.round(expNum).toString() : '—';
  const expenditureSubtitle = hasExpenditure
    ? 'Last 7 Days'
    : expNum != null
    ? 'Baseline Estimate'
    : 'No expenditure data';

  // Weight Trend metric value & subtitle
  const trendWNum =
    trendData?.analytics?.currentWeight ??
    data.currentWeight ??
    (recentTrendWeights.length > 0 ? recentTrendWeights[recentTrendWeights.length - 1] : null) ??
    data.profile?.initialWeightKg ??
    null;
  const trendWeightVal = trendWNum != null ? trendWNum.toFixed(1) : '—';
  const trendWeightSubtitle = hasTrendWeight
    ? 'Last 7 Days'
    : trendWNum != null
    ? 'Starting Weight Baseline'
    : 'No trend data';

  // Scale Weight metric value & subtitle
  const scaleWNum =
    (recentScaleWeights.length > 0 ? recentScaleWeights[recentScaleWeights.length - 1] : null) ??
    data.currentScaleWeight ??
    data.currentWeight ??
    data.profile?.initialWeightKg ??
    null;
  const scaleWeightVal = scaleWNum != null ? scaleWNum.toFixed(1) : '—';
  const scaleWeightSubtitle = hasScaleWeight
    ? 'Last 7 Entries'
    : 'Baseline • Not logged today';

  const schedule = data.schedule;
  const isCheckInActionable =
    schedule && (schedule.state === 'ready' || schedule.state === 'early_available' || schedule.state === 'overdue');

  return (
    <div className="max-w-4xl mx-auto space-y-6 pt-2 pb-12 animate-in fade-in duration-150">
      {/* Actionable Check-In Notice Banner (only displayed when check-in is ready/early) */}
      {isCheckInActionable && (
        <div
          onClick={onOpenCheckInModal}
          className="cursor-pointer bg-gradient-to-r from-orange-500/15 via-orange-500/5 to-transparent border border-orange-500/30 hover:border-orange-500/60 rounded-2xl p-4 flex items-center justify-between transition-all shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center font-bold shrink-0 shadow">
              <Check className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Weekly Check-In Available</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 font-semibold uppercase">
                  {schedule?.state === 'ready' ? 'Ready' : 'Early'}
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-0.5">
                Review expenditure trends and update your nutrition program.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-[#121316] font-bold text-xs hover:bg-gray-100 transition-transform active:scale-95 shrink-0">
            <span>Check In</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      )}

      {/* Section 1: Insights & Analytics */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <h3 className="text-[18px] font-bold text-white tracking-tight">Insights & Analytics</h3>
          <button
            onClick={onNavigateToExpenditure}
            className="text-[13px] font-semibold text-gray-400 hover:text-white transition-colors"
          >
            See All
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
          {/* Card 1: Expenditure */}
          <div
            onClick={onNavigateToExpenditure}
            className="bg-[#18191E] border border-[#26272F] hover:border-[#383A44] rounded-2xl p-4 sm:p-5 flex flex-col justify-between cursor-pointer transition-all group"
          >
            <div>
              <h4 className="text-[15px] font-semibold text-white tracking-tight">Expenditure</h4>
              <p className="text-[12px] text-gray-400 mt-0.5">
                {expenditureSubtitle}
              </p>
            </div>

            <div className="my-3 h-[58px] flex items-center">
              <ExpenditureSparkline
                entries={recentExpenditure}
                baselineTdee={expNum ?? data.profile?.baselineTdee ?? 2340}
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#23242B]">
              <div>
                <span className="text-[20px] font-bold text-white tracking-tight font-sans">
                  {expenditureVal}
                </span>
                {expNum != null && (
                  <span className="text-[13px] text-gray-400 ml-1 font-normal">kcal</span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
            </div>
          </div>

          {/* Card 2: Weight Trend */}
          <div
            onClick={onNavigateToTrend}
            className="bg-[#18191E] border border-[#26272F] hover:border-[#383A44] rounded-2xl p-4 sm:p-5 flex flex-col justify-between cursor-pointer transition-all group"
          >
            <div>
              <h4 className="text-[15px] font-semibold text-white tracking-tight">Weight Trend</h4>
              <p className="text-[12px] text-gray-400 mt-0.5">
                {trendWeightSubtitle}
              </p>
            </div>

            <div className="my-3 h-[58px] flex items-center">
              <WeightTrendSparkline
                weights={recentTrendWeights}
                initialWeight={trendWNum ?? data.profile?.initialWeightKg ?? 78.0}
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#23242B]">
              <div>
                <span className="text-[20px] font-bold text-white tracking-tight font-sans">
                  {trendWeightVal}
                </span>
                {trendWNum != null && (
                  <span className="text-[13px] text-gray-400 ml-1 font-normal">kg</span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Body Metrics */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <h3 className="text-[18px] font-bold text-white tracking-tight">Body Metrics</h3>
          <button
            onClick={onNavigateToScale || onNavigateToTrend}
            className="text-[13px] font-semibold text-gray-400 hover:text-white transition-colors"
          >
            See All
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
          {/* Card 1: Scale Weight */}
          <div
            onClick={onNavigateToScale || onNavigateToTrend}
            className="bg-[#18191E] border border-[#26272F] hover:border-[#383A44] rounded-2xl p-4 sm:p-5 flex flex-col justify-between cursor-pointer transition-all group"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-[15px] font-semibold text-white tracking-tight">Scale Weight</h4>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  {scaleWeightSubtitle}
                </p>
              </div>
              {!hasScaleWeight && onOpenLogModal && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLogModal();
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#4ADE80]/15 border border-[#4ADE80]/30 text-[#4ADE80] text-xs font-semibold hover:bg-[#4ADE80]/25 transition-all active:scale-95 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log Today</span>
                </button>
              )}
            </div>

            <div className="my-3 h-[58px] flex items-center">
              <ScaleWeightSparkline
                weights={recentScaleWeights}
                initialWeight={scaleWNum ?? data.profile?.initialWeightKg ?? 78.0}
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#23242B]">
              <div>
                <span className="text-[20px] font-bold text-white tracking-tight font-sans">
                  {scaleWeightVal}
                </span>
                {scaleWNum != null && (
                  <span className="text-[13px] text-gray-400 ml-1 font-normal">kg</span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
