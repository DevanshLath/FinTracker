export interface DCFAssumptions {
  wacc: number;
  terminalGrowth: number;
  revenueGrowth: number[];
  ebitmMargin: number;
  taxRate: number;
  capexPctRevenue: number;
  nwcPctRevenue: number;
  shares: number;
  netDebt: number;
}

export interface DCFResults {
  projectedFCF: number[];
  terminalValue: number;
  valuePerShare: number;
  equityValue: number;
  enterpriseValue: number;
  sensitivity: {
    wacc: number[];
    terminalGrowth: number[];
    values: number[][];
  };
}

export function calculateDCF(
  baseRevenue: number,
  assumptions: DCFAssumptions
): DCFResults {
  const projectedFCF: number[] = [];
  let revenue = baseRevenue;

  // Project 5 years
  for (let year = 0; year < assumptions.revenueGrowth.length; year++) {
    revenue *= (1 + assumptions.revenueGrowth[year]);

    const ebit = revenue * assumptions.ebitmMargin;
    const nopat = ebit * (1 - assumptions.taxRate);
    const da = revenue * 0.03;
    const capex = revenue * assumptions.capexPctRevenue;
    const nwcChange = revenue * assumptions.nwcPctRevenue * 0.05;

    const fcf = nopat + da - capex - nwcChange;
    projectedFCF.push(fcf);
  }

  // Terminal value
  const terminalFCF = projectedFCF[projectedFCF.length - 1];
  let terminalValue = 0;
  
  if (assumptions.wacc > assumptions.terminalGrowth) {
    terminalValue =
      (terminalFCF * (1 + assumptions.terminalGrowth)) /
      (assumptions.wacc - assumptions.terminalGrowth);
  }

  // Discount everything
  let pvFCF = 0;
  for (let year = 0; year < projectedFCF.length; year++) {
    pvFCF += projectedFCF[year] / Math.pow(1 + assumptions.wacc, year + 1);
  }
  const pvTerminalValue = terminalValue / Math.pow(1 + assumptions.wacc, projectedFCF.length);
  const enterpriseValue = pvFCF + pvTerminalValue;

  const equityValue = enterpriseValue - assumptions.netDebt;
  const valuePerShare = assumptions.shares > 0 ? equityValue / assumptions.shares : 0;

  // Sensitivity matrix: WACC (5% - 9%) vs Terminal Growth (1% - 3%)
  const waccValues = [0.05, 0.06, 0.07, 0.08, 0.09];
  const tgValues = [0.01, 0.015, 0.02, 0.025, 0.03];
  const sensitivity: number[][] = [];

  for (const w of waccValues) {
    const row: number[] = [];
    for (const tg of tgValues) {
      if (w <= tg) {
        row.push(0);
      } else {
        let pvTemp = 0;
        for (let i = 0; i < projectedFCF.length; i++) {
          pvTemp += projectedFCF[i] / Math.pow(1 + w, i + 1);
        }
        const tvTemp = (terminalFCF * (1 + tg)) / (w - tg);
        const pvTvTemp = tvTemp / Math.pow(1 + w, projectedFCF.length);
        const evTemp = pvTemp + pvTvTemp;
        const eqValTemp = evTemp - assumptions.netDebt;
        row.push(assumptions.shares > 0 ? eqValTemp / assumptions.shares : 0);
      }
    }
    sensitivity.push(row);
  }

  return {
    projectedFCF,
    terminalValue,
    valuePerShare,
    equityValue,
    enterpriseValue,
    sensitivity: {
      wacc: waccValues,
      terminalGrowth: tgValues,
      values: sensitivity,
    },
  };
}
