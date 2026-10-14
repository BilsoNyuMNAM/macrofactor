"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scaleWeightRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
const algorithm_js_1 = require("../services/algorithm.js");
exports.scaleWeightRouter = (0, express_1.Router)();
const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];
const FULL_MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];
const DAY_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Helper to format date string YYYY-MM-DD to "Wed, 14 Oct"
function formatDayLabel(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    const dow = DAY_OF_WEEK[d.getUTCDay()];
    const mon = MONTH_NAMES[d.getUTCMonth()];
    return `${dow}, ${day} ${mon}`;
}
// Format date range: "8 - 14 Oct 2026" or "15 Sep - 14 Oct 2026"
function formatDateRange(startDateStr, endDateStr) {
    const [sy, sm, sd] = startDateStr.split('-').map(Number);
    const [ey, em, ed] = endDateStr.split('-').map(Number);
    if (sy === ey && sm === em) {
        return `${sd} - ${ed} ${MONTH_NAMES[em - 1]} ${ey}`;
    }
    else if (sy === ey) {
        return `${sd} ${MONTH_NAMES[sm - 1]} - ${ed} ${MONTH_NAMES[em - 1]} ${ey}`;
    }
    else {
        return `${sd} ${MONTH_NAMES[sm - 1]} ${sy} - ${ed} ${MONTH_NAMES[em - 1]} ${ey}`;
    }
}
// GET /api/scale-weight
exports.scaleWeightRouter.get('/', async (req, res) => {
    try {
        const timeframe = req.query.timeframe || '1W';
        const aggregation = req.query.aggregation || 'D';
        // 1. Fetch all scale weight entries
        const scaleEntries = await db_js_1.prisma.scaleWeightEntry.findMany({
            orderBy: { logDate: 'asc' }
        });
        // 2. Fetch trend entries as fallback for missing interpolation
        const trendEntries = await db_js_1.prisma.weightTrendEntry.findMany({
            orderBy: { logDate: 'asc' }
        });
        const trendMap = new Map(trendEntries.map(t => [t.logDate, t.trendWeightKg]));
        if (scaleEntries.length === 0) {
            return res.json({
                header: {
                    average: null,
                    averageFormatted: '—',
                    differenceFormatted: '—',
                    rawDifference: 0,
                    dateRangeSubtitle: '—',
                    unit: 'kg'
                },
                chart: {
                    points: [],
                    minWeight: null,
                    maxWeight: null,
                    timeframe,
                    aggregation
                },
                history: []
            });
        }
        // 3. Map scale entries by date
        const scaleMap = new Map();
        for (const e of scaleEntries) {
            scaleMap.set(e.logDate, {
                entryId: e.entryId,
                weightKg: e.weightKg,
                source: e.source,
                notes: e.notes
            });
        }
        // 4. Determine timeline span
        const latestDateStr = scaleEntries[scaleEntries.length - 1].logDate;
        const [ly, lm, ld] = latestDateStr.split('-').map(Number);
        const latestDate = new Date(Date.UTC(ly, lm - 1, ld));
        const daysMap = {
            '1W': 7,
            '1M': 30,
            '3M': 90,
            '6M': 180,
            '1Y': 365,
            'All': 9999
        };
        const span = daysMap[timeframe] || 7;
        let startDate = new Date(latestDate);
        if (timeframe === 'All') {
            const firstDateStr = scaleEntries[0].logDate;
            const [fy, fm, fd] = firstDateStr.split('-').map(Number);
            startDate = new Date(Date.UTC(fy, fm - 1, fd));
        }
        else {
            startDate.setUTCDate(startDate.getUTCDate() - (span - 1));
        }
        // 5. Generate daily timeline points
        const chartPoints = [];
        const curDate = new Date(startDate);
        // Pre-calculate linear interpolation across the entire date span
        // Build a continuous array of known points
        const allDatesWithWeights = [];
        for (const s of scaleEntries) {
            allDatesWithWeights.push({ dateStr: s.logDate, weight: s.weightKg });
        }
        function getInterpolatedWeightForDate(targetDateStr) {
            if (scaleMap.has(targetDateStr)) {
                return scaleMap.get(targetDateStr).weightKg;
            }
            // Linear interpolation between previous known and next known
            let prev = null;
            let next = null;
            for (let i = 0; i < allDatesWithWeights.length; i++) {
                const item = allDatesWithWeights[i];
                if (item.dateStr < targetDateStr) {
                    prev = item;
                }
                else if (item.dateStr > targetDateStr && !next) {
                    next = item;
                    break;
                }
            }
            if (prev && next) {
                const tPrev = new Date(prev.dateStr + 'T00:00:00Z').getTime();
                const tNext = new Date(next.dateStr + 'T00:00:00Z').getTime();
                const tTarget = new Date(targetDateStr + 'T00:00:00Z').getTime();
                const frac = (tTarget - tPrev) / (tNext - tPrev);
                return Math.round((prev.weight + frac * (next.weight - prev.weight)) * 100) / 100;
            }
            else if (prev) {
                return prev.weight;
            }
            else if (next) {
                return next.weight;
            }
            return trendMap.get(targetDateStr) ?? 78.0;
        }
        while (curDate <= latestDate) {
            const y = curDate.getUTCFullYear();
            const m = String(curDate.getUTCMonth() + 1).padStart(2, '0');
            const d = String(curDate.getUTCDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;
            const entry = scaleMap.get(dateStr);
            const hasEntry = !!entry;
            const scaleWeight = entry ? entry.weightKg : null;
            const interpolatedWeight = getInterpolatedWeightForDate(dateStr);
            const dayLabel = DAY_OF_WEEK[curDate.getUTCDay()];
            chartPoints.push({
                date: dateStr,
                dayLabel,
                dayOfMonth: curDate.getUTCDate(),
                scaleWeight,
                interpolatedWeight,
                hasEntry,
                notes: entry?.notes ?? null
            });
            curDate.setUTCDate(curDate.getUTCDate() + 1);
        }
        // 6. Header calculation: Average & Difference in the window
        const actualWeighInsInWindow = chartPoints.filter(p => p.hasEntry && p.scaleWeight !== null);
        let avgWeight = null;
        let diffWeight = null;
        if (actualWeighInsInWindow.length > 0) {
            const sum = actualWeighInsInWindow.reduce((acc, p) => acc + (p.scaleWeight || 0), 0);
            avgWeight = Math.round((sum / actualWeighInsInWindow.length) * 10) / 10;
            // Difference = latest actual weigh-in in window - earliest actual weigh-in in window
            // (or difference from start of window to end)
            const firstEntry = actualWeighInsInWindow[0];
            const lastEntry = actualWeighInsInWindow[actualWeighInsInWindow.length - 1];
            diffWeight = Math.round((lastEntry.scaleWeight - firstEntry.scaleWeight) * 10) / 10;
        }
        else if (chartPoints.length > 0) {
            const sum = chartPoints.reduce((acc, p) => acc + p.interpolatedWeight, 0);
            avgWeight = Math.round((sum / chartPoints.length) * 10) / 10;
            diffWeight = Math.round((chartPoints[chartPoints.length - 1].interpolatedWeight - chartPoints[0].interpolatedWeight) * 10) / 10;
        }
        const diffFormatted = diffWeight === null
            ? '—'
            : diffWeight > 0
                ? `+${diffWeight.toFixed(1)} kg`
                : diffWeight < 0
                    ? `\u2212${Math.abs(diffWeight).toFixed(1)} kg`
                    : `0.0 kg`;
        const averageFormatted = avgWeight !== null ? `${avgWeight.toFixed(1)} kg` : '—';
        const startDateStr = chartPoints.length > 0 ? chartPoints[0].date : latestDateStr;
        const dateRangeSubtitle = formatDateRange(startDateStr, latestDateStr);
        // 7. Calculate min and max weights for chart Y-axis range
        let minW = Infinity;
        let maxW = -Infinity;
        chartPoints.forEach(p => {
            const val = p.scaleWeight ?? p.interpolatedWeight;
            minW = Math.min(minW, val);
            maxW = Math.max(maxW, val);
        });
        if (!isFinite(minW))
            minW = 77.0;
        if (!isFinite(maxW))
            maxW = 79.0;
        // 8. Group all history entries by Month in descending order
        const historyGroupsMap = new Map();
        const sortedScaleDesc = [...scaleEntries].reverse();
        for (const e of sortedScaleDesc) {
            const [year, month] = e.logDate.split('-').map(Number);
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            const monthYear = `${FULL_MONTH_NAMES[month - 1]} ${year}`;
            if (!historyGroupsMap.has(monthKey)) {
                historyGroupsMap.set(monthKey, {
                    monthYear,
                    monthKey,
                    entries: []
                });
            }
            historyGroupsMap.get(monthKey).entries.push({
                entryId: e.entryId,
                logDate: e.logDate,
                formattedDate: formatDayLabel(e.logDate),
                weightKg: e.weightKg,
                source: e.source,
                notes: e.notes
            });
        }
        const history = Array.from(historyGroupsMap.values());
        res.json({
            header: {
                average: avgWeight,
                averageFormatted,
                differenceFormatted: diffFormatted,
                rawDifference: diffWeight ?? 0,
                dateRangeSubtitle,
                unit: 'kg'
            },
            chart: {
                points: chartPoints,
                minWeight: minW,
                maxWeight: maxW,
                timeframe,
                aggregation
            },
            history
        });
    }
    catch (error) {
        console.error('Error fetching scale weight data:', error);
        res.status(500).json({ error: 'Failed to fetch scale weight data' });
    }
});
// POST /api/scale-weight: Log or update scale weight
exports.scaleWeightRouter.post('/', async (req, res) => {
    try {
        const { date, weightKg, notes } = req.body;
        if (!date) {
            return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
        }
        const weightNum = parseFloat(weightKg);
        if (isNaN(weightNum) || weightNum <= 0) {
            return res.status(400).json({ error: 'Valid positive weight in kg is required' });
        }
        const existing = await db_js_1.prisma.scaleWeightEntry.findFirst({
            where: { logDate: date }
        });
        if (existing) {
            await db_js_1.prisma.scaleWeightEntry.update({
                where: { entryId: existing.entryId },
                data: { weightKg: weightNum, notes: notes !== undefined ? notes : existing.notes }
            });
        }
        else {
            await db_js_1.prisma.scaleWeightEntry.create({
                data: {
                    logDate: date,
                    weightKg: weightNum,
                    source: 'manual',
                    notes: notes || null
                }
            });
        }
        // Run metabolic and trend recalculation pipeline
        await (0, algorithm_js_1.recalculatePipeline)();
        res.json({ success: true, message: `Scale weight ${weightNum.toFixed(1)} kg logged for ${date}` });
    }
    catch (error) {
        console.error('Error logging scale weight:', error);
        res.status(500).json({ error: 'Failed to log scale weight' });
    }
});
// PUT /api/scale-weight/:id: Update entry
exports.scaleWeightRouter.put('/:id', async (req, res) => {
    try {
        const entryId = parseInt(req.params.id, 10);
        if (isNaN(entryId)) {
            return res.status(400).json({ error: 'Invalid entry ID' });
        }
        const { weightKg, logDate, notes } = req.body;
        const weightNum = parseFloat(weightKg);
        if (isNaN(weightNum) || weightNum <= 0) {
            return res.status(400).json({ error: 'Valid weightKg is required' });
        }
        const entry = await db_js_1.prisma.scaleWeightEntry.findUnique({
            where: { entryId }
        });
        if (!entry) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        await db_js_1.prisma.scaleWeightEntry.update({
            where: { entryId },
            data: {
                weightKg: weightNum,
                logDate: logDate || entry.logDate,
                notes: notes !== undefined ? notes : entry.notes
            }
        });
        await (0, algorithm_js_1.recalculatePipeline)();
        res.json({ success: true, message: 'Scale weight entry updated' });
    }
    catch (error) {
        console.error('Error updating scale weight entry:', error);
        res.status(500).json({ error: 'Failed to update scale weight entry' });
    }
});
// DELETE /api/scale-weight/:id: Delete entry
exports.scaleWeightRouter.delete('/:id', async (req, res) => {
    try {
        const entryId = parseInt(req.params.id, 10);
        if (isNaN(entryId)) {
            return res.status(400).json({ error: 'Invalid entry ID' });
        }
        const entry = await db_js_1.prisma.scaleWeightEntry.findUnique({
            where: { entryId }
        });
        if (!entry) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        await db_js_1.prisma.scaleWeightEntry.delete({
            where: { entryId }
        });
        await (0, algorithm_js_1.recalculatePipeline)();
        res.json({ success: true, message: 'Scale weight entry deleted' });
    }
    catch (error) {
        console.error('Error deleting scale weight entry:', error);
        res.status(500).json({ error: 'Failed to delete scale weight entry' });
    }
});
