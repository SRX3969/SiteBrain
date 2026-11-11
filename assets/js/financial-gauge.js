/**
 * ═══════════════════════════════════════════════════════════════════
 * SITEBRAIN — DETERMINISTIC FINANCIAL ENGINE & VIABILITY GAUGE
 *
 * UNDERWRITING MODEL (all formulas explicit — zero LLM arithmetic):
 *
 *   effectiveDemand = (footTrafficIndex / 8.0)          ← corridor demand multiplier
 *                     × saturationIndex                  ← incumbent cannibalization composite
 *                     × ((5 + 2·weekendRatio) / 7)       ← 5 weekday + 2 weekend blend
 *
 *   Revenue (capacity-driven, category-specific):
 *     covers       → dailyCovers = seats × turns/day × baseUtilization × effectiveDemand
 *     members      → activeMembers = membersBase × effectiveDemand
 *     appointments → dailyAppts = operatories × appts/day × baseUtilization × effectiveDemand
 *
 *   monthlyOpEx   = rent×(1 + 0.18 marketing + 0.08 maintenance) + payroll + utilities
 *   netMonthly    = achievedRevenue × (1 − cogs%) − monthlyOpEx
 *   survivalVolume= monthlyOpEx / contributionMargin        (break-even volume)
 *   capitalAtRisk = deposit + fit-out + equipment + licensing (recoverable deposit included)
 *   breakEven     = capitalAtRisk / netMonthly                (∞ if net ≤ 0)
 * ═══════════════════════════════════════════════════════════════════
 */

window.financialGauge = (function () {
  'use strict';

  const U = () => window.SiteBrainUtils;

  /* ── Deterministic metric computation ─────────────────────────── */

  function calculateMetrics(locId, catId, customBudget) {
    const loc = window.SITEBRAIN_DATA.locations[locId];
    const cat = window.SITEBRAIN_DATA.categories[catId];
    if (!loc || !cat) return null;

    // Space & rent
    const sqft = cat.typicalSqft;
    const rentPerSqft = loc.avgRentSqft;
    const monthlyRent = rentPerSqft * sqft;
    const securityDeposit = monthlyRent * loc.depositNormMonths;

    // CapEx itemization
    const fitoutCost = sqft * cat.fitoutCostSqft;
    const equipmentCost = cat.equipmentBudget;
    const licensingCost = cat.licensingLegal;

    // Monthly OpEx itemization
    const staffPayroll = cat.staffCount * cat.avgStaffSalary;
    const utilities = cat.monthlyUtilities;
    const marketingReserve = Math.round(monthlyRent * 0.18);
    const maintenance = Math.round(monthlyRent * 0.08);
    const fixedMonthlyBurn = monthlyRent + staffPayroll + utilities + marketingReserve + maintenance;

    // Working capital & capital at risk
    const workingCapitalReserve = fixedMonthlyBurn * 3;
    const capitalAtRisk = securityDeposit + fitoutCost + equipmentCost + licensingCost;
    const totalSetupCapEx = capitalAtRisk + workingCapitalReserve;

    const budget = customBudget || cat.defaultBudget;
    const fundingGap = totalSetupCapEx - budget;

    // Capacity-driven revenue projection
    const demandMultiplier = loc.footTrafficIndex / 8.0;
    const weeklyDemandFactor = (5 + 2 * loc.weekendWeekdayRatio) / 7;
    const effectiveDemand = demandMultiplier * loc.saturationIndex * weeklyDemandFactor;

    const grossMarginRatio = 1 - (cat.cogsPercent / 100);
    const ticketSize = cat.defaultTicket;
    const contributionMargin = ticketSize * grossMarginRatio;

    let achievedRevenue = 0;
    let achievedVolume = 0;      // covers/day | members | appointments/day
    let survivalVolume = 0;      // break-even volume required
    let volumeLabel = '';

    if (cat.revenueModel === 'members') {
      achievedVolume = Math.round(cat.activeMembersBase * effectiveDemand);
      achievedRevenue = achievedVolume * ticketSize;
      survivalVolume = Math.ceil(fixedMonthlyBurn / contributionMargin);
      volumeLabel = 'active members';
    } else if (cat.revenueModel === 'appointments') {
      achievedVolume = Math.round(cat.seatingCapacity * cat.turnsPerDay * cat.baseUtilization * effectiveDemand);
      achievedRevenue = achievedVolume * ticketSize * 30;
      survivalVolume = Math.ceil((fixedMonthlyBurn / 30) / contributionMargin);
      volumeLabel = 'appointments/day';
    } else { // covers
      achievedVolume = Math.round(cat.seatingCapacity * cat.turnsPerDay * cat.baseUtilization * effectiveDemand);
      achievedRevenue = achievedVolume * ticketSize * 30;
      survivalVolume = Math.ceil((fixedMonthlyBurn / 30) / contributionMargin);
      volumeLabel = 'covers/day';
    }

    // Profitability
    const netMonthlyProfit = achievedRevenue * grossMarginRatio - fixedMonthlyBurn;
    const monthlyCogs = achievedRevenue * (cat.cogsPercent / 100);
    const rentToRevenueRatio = (monthlyRent / achievedRevenue) * 100;
    const isBelowSurvival = achievedVolume < survivalVolume;

    const breakEvenMonths = netMonthlyProfit > 0 ? (capitalAtRisk / netMonthlyProfit) : Infinity;

    // Viability score (deterministic weighted adjustments on the corridor base)
    let viabilityScore = loc.baseViabilityScore;
    if (rentToRevenueRatio < 18) viabilityScore += 6;
    else if (rentToRevenueRatio > 24) viabilityScore -= 10;

    if (breakEvenMonths === Infinity) viabilityScore -= 20;
    else if (breakEvenMonths <= 18) viabilityScore += 4;
    else if (breakEvenMonths > 30) viabilityScore -= 8;

    if (isBelowSurvival) viabilityScore -= 20;
    viabilityScore = Math.max(12, Math.min(96, Math.round(viabilityScore)));

    let riskTier = 'low';
    let riskTierLabel = 'High Feasibility / Low Risk';
    let riskColor = '#34C759';
    if (viabilityScore < 45) {
      riskTier = 'high';
      riskTierLabel = 'Severe Risk / Capital Exposure';
      riskColor = '#FF3B30';
    } else if (viabilityScore < 72) {
      riskTier = 'medium';
      riskTierLabel = 'Moderate Caution / Rent Negotiation Needed';
      riskColor = '#FF9500';
    }

    return {
      loc, cat, locId, catId,
      sqft, rentPerSqft, monthlyRent, securityDeposit,
      fitoutCost, equipmentCost, licensingCost,
      staffPayroll, utilities, marketingReserve, maintenance, fixedMonthlyBurn,
      workingCapitalReserve, capitalAtRisk, totalSetupCapEx,
      budget, fundingGap,
      achievedVolume, achievedRevenue, survivalVolume, volumeLabel,
      ticketSize, contributionMargin, grossMarginRatio,
      netMonthlyProfit, monthlyCogs,
      rentToRevenueRatio, breakEvenMonths, isBelowSurvival,
      seatingCapacity: cat.seatingCapacity || null,
      capacityLabel: cat.capacityLabel || '',
      viabilityScore, riskTier, riskTierLabel, riskColor
    };
  }

  /* ── SVG Speedometer (graded zones: Crimson 0–40 / Amber 41–69 / Emerald 70–100) ── */

  function renderSpeedometer(score, riskColor) {
    const needle = U().el('speedoNeedle');
    const scoreVal = U().el('speedoScoreVal');
    const arcFill = U().el('speedoArcFill');

    const angle = (score / 100) * 180 - 90;

    if (needle) needle.style.transform = `rotate(${angle}deg)`;

    if (arcFill) {
      const halfCircumference = 235.6; // π × 75
      arcFill.style.strokeDasharray = halfCircumference;
      arcFill.style.strokeDashoffset = halfCircumference - (score / 100) * halfCircumference;
      arcFill.style.stroke = riskColor;
    }

    if (scoreVal) {
      U().animateValue(scoreVal, score, v => Math.round(v), 900);
    }
  }

  /* ── Full financial panel render with count-up values ─────────── */

  function render(locId, catId, customBudget) {
    const m = calculateMetrics(locId, catId, customBudget);
    if (!m) return null;

    const u = U();
    const set = (id, value, formatter) => {
      const node = u.el(id);
      if (node) u.animateValue(node, value, formatter, 650);
    };

    // Verdict gauge
    renderSpeedometer(m.viabilityScore, m.riskColor);

    const riskBadge = u.el('speedoRiskBadge');
    if (riskBadge) {
      riskBadge.textContent = m.riskTierLabel;
      riskBadge.style.color = m.riskColor;
      riskBadge.style.borderColor = m.riskColor + '40';
      riskBadge.style.backgroundColor = m.riskColor + '12';
    }

    // CapEx block
    set('fg-rent-sqft', m.rentPerSqft, v => '₹' + Math.round(v) + '/sq.ft');
    set('fg-monthly-rent', m.monthlyRent, u.formatINR);
    set('fg-deposit', m.securityDeposit, u.formatINR);
    set('fg-fitout', m.fitoutCost, u.formatINR);
    set('fg-equipment', m.equipmentCost, u.formatINR);
    set('fg-licensing', m.licensingCost, u.formatINR);
    set('fg-working-capital', m.workingCapitalReserve, u.formatINR);
    set('fg-total-capex', m.totalSetupCapEx, u.formatINR);

    const gapEl = u.el('fg-budget-gap');
    if (gapEl) {
      if (m.fundingGap > 0) {
        gapEl.textContent = '− ' + u.formatLakh(m.fundingGap) + ' vs budget';
        gapEl.className = 'text-[10px] font-mono font-semibold text-risk-high';
      } else {
        gapEl.textContent = '+ ' + u.formatLakh(-m.fundingGap) + ' headroom vs budget';
        gapEl.className = 'text-[10px] font-mono font-semibold text-risk-low';
      }
    }

    // OpEx block
    set('fg-payroll', m.staffPayroll, u.formatINR);
    set('fg-utilities', m.utilities, u.formatINR);
    set('fg-marketing', m.marketingReserve + m.maintenance, u.formatINR);
    set('fg-cogs', m.monthlyCogs, u.formatINR);
    set('fg-fixed-burn', m.fixedMonthlyBurn, u.formatLakhMonthly);

    const licEl = u.el('fg-licensing');
    if (licEl) licEl.textContent = 'incl. ' + u.formatINR(m.licensingCost) + ' licensing';

    const netEl = u.el('fg-net-monthly');
    if (netEl) {
      netEl.textContent = (m.netMonthlyProfit >= 0 ? '' : '− ') + u.formatLakh(Math.abs(m.netMonthlyProfit));
      netEl.style.color = m.netMonthlyProfit >= 0 ? '#1D1D1F' : '#FF3B30';
    }

    // Break-even & survival
    const beEl = u.el('fg-breakeven-months');
    if (beEl) {
      beEl.textContent = m.breakEvenMonths === Infinity
        ? 'Not Achievable'
        : 'Month ' + m.breakEvenMonths.toFixed(1);
      beEl.className = 'font-mono font-semibold text-base ' +
        (m.breakEvenMonths === Infinity || m.breakEvenMonths > 30 ? 'text-risk-high'
          : m.breakEvenMonths > 18 ? 'text-risk-medium' : 'text-risk-low');
    }

    set('fg-daily-covers', m.achievedVolume, v => Math.round(v));
    set('fg-covers-required', m.survivalVolume, v => Math.round(v));
    const volEl = u.el('fg-volume-label');
    if (volEl) volEl.textContent = m.volumeLabel;

    // Achieved vs required utilization bar
    const barEl = u.el('fg-achieved-bar');
    const barLabel = u.el('fg-achieved-label');
    if (barEl && barLabel) {
      const ratio = m.survivalVolume > 0 ? (m.achievedVolume / m.survivalVolume) * 100 : 0;
      barEl.style.width = Math.max(4, Math.min(100, ratio)) + '%';
      barEl.style.background = ratio >= 115 ? '#34C759' : ratio >= 100 ? '#FF9500' : '#FF3B30';
      barLabel.textContent = `${m.achievedVolume} projected vs ${m.survivalVolume} required ${m.volumeLabel} · ${ratio.toFixed(0)}% of break-even volume`;
      barLabel.style.color = ratio >= 115 ? '#34C759' : ratio >= 100 ? '#FF9500' : '#FF3B30';
    }

    // Rent-to-revenue
    const rtrEl = u.el('fg-rtr');
    if (rtrEl) {
      rtrEl.textContent = m.rentToRevenueRatio.toFixed(1) + '%';
      rtrEl.style.color = m.rentToRevenueRatio < 18 ? '#34C759'
        : (m.rentToRevenueRatio < 23 ? '#FF9500' : '#FF3B30');
    }

    // Risk factors vs reward drivers
    const riskContainer = u.el('fg-risk-factors');
    if (riskContainer && m.loc.riskFactors) {
      riskContainer.innerHTML = m.loc.riskFactors.map(rf => `
        <li class="flex items-start gap-2 text-xs text-apple-body leading-relaxed mb-2">
          <span class="w-1.5 h-1.5 rounded-full bg-risk-high mt-1.5 flex-shrink-0"></span>
          <span>${rf}</span>
        </li>`).join('');
    }
    const rewardContainer = u.el('fg-reward-drivers');
    if (rewardContainer && m.loc.rewardDrivers) {
      rewardContainer.innerHTML = m.loc.rewardDrivers.map(rd => `
        <li class="flex items-start gap-2 text-xs text-apple-body leading-relaxed mb-2">
          <span class="w-1.5 h-1.5 rounded-full bg-risk-low mt-1.5 flex-shrink-0"></span>
          <span>${rd}</span>
        </li>`).join('');
    }

    return m;
  }

  /* ── Landing-page quick simulator (same engine, generic assumptions) ── */

  function simulateQuick(invest, rent, ticket) {
    const COGS_RATIO = 0.28;          // specialty coffee-class gross margin (72%)
    const OTHER_OPEX = 162000;        // payroll + utilities benchmark
    const OPEX_FACTOR = 1.26;         // rent + 18% marketing + 8% maintenance
    const VOLUME_HEADROOM = 1.30;     // healthy steady-state above survival volume

    const monthlyOpEx = rent * OPEX_FACTOR + OTHER_OPEX;
    const contribution = ticket * (1 - COGS_RATIO);
    const dailyCovers = Math.ceil((monthlyOpEx * VOLUME_HEADROOM / 30) / contribution);
    const monthlyRevenue = dailyCovers * ticket * 30;
    const netMonthly = monthlyRevenue * (1 - COGS_RATIO) - monthlyOpEx;
    const breakEvenMonths = netMonthly > 0 ? invest / netMonthly : Infinity;
    const rtrRatio = (rent / monthlyRevenue) * 100;

    return { dailyCovers, monthlyRevenue, netMonthly, breakEvenMonths, rtrRatio };
  }

  return {
    calculateMetrics,
    render,
    renderSpeedometer,
    simulateQuick
  };
})();
