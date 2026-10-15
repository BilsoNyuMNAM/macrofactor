import { executeMacroFactorPipeline, DailyLogInput, KCAL_PER_KG_TISSUE_V3, V3_ADAPTIVE_GAIN_SMALL, V3_ADAPTIVE_GAIN_LARGE, isValidIntakeDay } from '../src/services/algorithm.js';
import { execSync } from 'child_process';

const pyScript = `
import openpyxl, json
wb = openpyxl.load_workbook('/Users/bilsonyumnam/Downloads/MacroFactor-20261014193702.xlsx')
cals = {wb['Calories & Macros'].cell(r, 1).value.strftime('%Y-%m-%d'): wb['Calories & Macros'].cell(r, 2).value for r in range(2, wb['Calories & Macros'].max_row + 1)}
weights = {wb['Scale Weight'].cell(r, 1).value.strftime('%Y-%m-%d'): wb['Scale Weight'].cell(r, 2).value for r in range(2, wb['Scale Weight'].max_row + 1)}
trend_gt = {wb['Weight Trend'].cell(r, 1).value.strftime('%Y-%m-%d'): wb['Weight Trend'].cell(r, 2).value for r in range(2, wb['Weight Trend'].max_row + 1)}
exp_gt = {wb['Expenditure'].cell(r, 1).value.strftime('%Y-%m-%d'): wb['Expenditure'].cell(r, 2).value for r in range(2, wb['Expenditure'].max_row + 1)}

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

const results = executeMacroFactorPipeline(logs, 2353, 80.80, 0.10);

console.log('| Date | Raw Scale | Trend Wt | GT Trend | Vel (kg/d) | Raw Intake | Imp Intake | Valid? | 7d Mean Int | Denom | Flux (kcal) | Raw TDEE | Prev TDEE | Gap | Gain K | New TDEE | GT TDEE | State |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');

let runningTdee = 2353;
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const gt = data[i];

  const windowStart = Math.max(0, i - 6);
  let sumIntake = 0;
  for (let k = windowStart; k <= i; k++) {
    if (isValidIntakeDay(results[k])) {
      sumIntake += results[k].isFasting ? 0 : (results[k].rawIntake ?? 0);
    } else {
      sumIntake += (results[k].imputedIntake ?? runningTdee);
    }
  }
  const windowDays = i - windowStart + 1;
  const avgIntake = Math.round((sumIntake / windowDays) * 10) / 10;
  const dailyFlux = Math.round(r.weightVelocityKgPerDay * 7700.0);
  const rawDemand = Math.round(avgIntake - dailyFlux);
  const prevT = i === 0 ? 2353 : results[i - 1].tdee;
  const gap = rawDemand - prevT;

  const absGap = Math.abs(gap);
  let kVal = 0.08;
  if (absGap > 250) kVal = 0.16;
  else if (absGap > 150) kVal = 0.08 + ((absGap - 150) / 100) * (0.16 - 0.08);

  const rawScale = r.rawWeight !== null ? r.rawWeight.toFixed(1) : 'null';
  const rawIn = r.rawIntake !== null ? String(r.rawIntake) : 'null';
  const impIn = r.imputedIntake !== null ? String(r.imputedIntake) : '-';

  console.log(`| ${r.date} | ${rawScale} | ${r.trendWeight.toFixed(2)} | ${gt.trend_gt.toFixed(2)} | ${r.weightVelocityKgPerDay.toFixed(4)} | ${rawIn} | ${impIn} | ${r.isValidIntake} | ${avgIntake.toFixed(0)} | ${windowDays} | ${dailyFlux} | ${rawDemand} | ${prevT} | ${gap} | ${kVal.toFixed(3)} | ${r.tdee} | ${gt.exp_gt.toFixed(0)} | ${r.strategy} |`);
  runningTdee = r.tdee;
}
