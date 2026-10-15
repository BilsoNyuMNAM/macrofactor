import { executeMacroFactorPipeline, DailyLogInput } from '../src/services/algorithm.js';
import { execSync } from 'child_process';

const pyScript = `
import openpyxl, json
wb = openpyxl.load_workbook('/Users/bilsonyumnam/Downloads/MacroFactor-20261014193702.xlsx')
sheet_cals = wb['Calories & Macros']
sheet_weights = wb['Scale Weight']
sheet_trend = wb['Weight Trend']
sheet_exp = wb['Expenditure']

cals = {sheet_cals.cell(r, 1).value.strftime('%Y-%m-%d'): sheet_cals.cell(r, 2).value for r in range(2, sheet_cals.max_row + 1)}
weights = {sheet_weights.cell(r, 1).value.strftime('%Y-%m-%d'): sheet_weights.cell(r, 2).value for r in range(2, sheet_weights.max_row + 1)}
trend_gt = {sheet_trend.cell(r, 1).value.strftime('%Y-%m-%d'): sheet_trend.cell(r, 2).value for r in range(2, sheet_trend.max_row + 1)}
exp_gt = {sheet_exp.cell(r, 1).value.strftime('%Y-%m-%d'): sheet_exp.cell(r, 2).value for r in range(2, sheet_exp.max_row + 1)}

all_dates = sorted(list(exp_gt.keys()))
out = []
for d in all_dates:
    out.append({
        'date': d,
        'cals': cals.get(d, None),
        'scale': weights.get(d, None),
        'trend_gt': trend_gt.get(d, None),
        'exp_gt': exp_gt.get(d, None)
    })
print(json.dumps(out))
`;

const data = JSON.parse(execSync(`python3 -c "${pyScript}"`).toString());

const logs: DailyLogInput[] = data.map((d: any) => ({
  date: d.date,
  scaleWeight: d.scale,
  calories: d.cals
}));

// Baseline TDEE 2353, initial anchor weight 80.8
const results = executeMacroFactorPipeline(logs, 2353, 80.8);

console.log('Date       | Scale | Cals | TrendAlgo | TrendGT | DiffTr | VelAlgo | ExpAlgo | ExpGT | DiffExp | Strat');
console.log('------------------------------------------------------------------------------------------------------');
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const gt = data[i];
  const diffTr = (r.trendWeight - gt.trend_gt).toFixed(2);
  const diffExp = r.tdee - gt.exp_gt;
  console.log(`${r.date} | ${String(r.rawWeight ?? ' - ').padStart(5)} | ${String(r.rawIntake ?? ' - ').padStart(4)} | ${r.trendWeight.toFixed(2).padStart(9)} | ${gt.trend_gt.toFixed(2).padStart(7)} | ${diffTr.padStart(6)} | ${r.weightVelocityKgPerDay.toFixed(3).padStart(7)} | ${String(r.tdee).padStart(7)} | ${String(gt.exp_gt).padStart(5)} | ${String(diffExp).padStart(7)} | ${r.strategy}`);
}
