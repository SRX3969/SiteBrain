/**
 * ═══════════════════════════════════════════════════════════════════
 * SITEBRAIN — LANDING PAGE INTERACTIVITY (LANDING.JS)
 * Navbar scroll state · mobile drawer · hotspot quick-launch ·
 * ROI simulator on the shared deterministic engine · scroll reveals
 * ═══════════════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const u = () => window.SiteBrainUtils;

  /* ── Navbar Scroll State (floating capsule intensifies on scroll) ── */
  const navCapsule = document.getElementById('navCapsule');
  function onNavScroll() {
    if (navCapsule) navCapsule.classList.toggle('nav-scrolled', window.scrollY > 25);
  }
  window.addEventListener('scroll', onNavScroll, { passive: true });
  onNavScroll();

  /* ── Mobile Menu Drawer ── */
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      const isOpen = !mobileMenu.classList.toggle('hidden');
      mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
    });
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ── Hotspot Quick-Launch Chips → pre-calibrated survey deep links ── */
  document.querySelectorAll('.hotspot-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const loc = chip.getAttribute('data-location') || 'indiranagar';
      const cat = chip.getAttribute('data-category') || 'coffee';
      window.location.href = `survey.html?location=${encodeURIComponent(loc)}&category=${encodeURIComponent(cat)}`;
    });
  });

  /* ── Interactive Quick ROI Simulator ────────────────────────────────
   * Runs on the SAME deterministic engine as the full survey
   * (window.financialGauge.simulateQuick) — zero LLM arithmetic.
   */

  const sliderInvest = document.getElementById('landSimInvest');
  const sliderRent = document.getElementById('landSimRent');
  const sliderTicket = document.getElementById('landSimTicket');

  const RISK_TIERS = {
    low: {
      label: 'LOW RISK',
      pill: 'Zone Safe (<18% Rent)',
      color: '#34C759',
      pillClasses: 'bg-risk-low-bg text-risk-low border border-risk-low-border'
    },
    medium: {
      label: 'MODERATE CAUTION',
      pill: 'Rent Negotiation Advised',
      color: '#FF9500',
      pillClasses: 'bg-risk-medium-bg text-risk-medium border border-risk-medium-border'
    },
    high: {
      label: 'HIGH RISK',
      pill: 'Capital Risk (>24% Rent)',
      color: '#FF3B30',
      pillClasses: 'bg-risk-high-bg text-risk-high border border-risk-high-border'
    }
  };

  /**
   * Lease-stress tier mirroring the full engine's viability adjustments
   * on a neutral base of 72 (rent-stress and payback-horizon terms only —
   * volume headroom is fixed at 130% by the quick-sim assumptions).
   */
  function classifyLeaseStress(m) {
    let score = 72;
    if (m.rtrRatio < 18) score += 6;
    else if (m.rtrRatio > 24) score -= 10;

    if (m.breakEvenMonths === Infinity) score -= 20;
    else if (m.breakEvenMonths <= 18) score += 4;
    else if (m.breakEvenMonths > 30) score -= 8;

    score = Math.max(12, Math.min(96, score));
    if (score < 45) return 'high';
    if (score < 72) return 'medium';
    return 'low';
  }

  function updateLandingSimulator(animate) {
    if (!sliderInvest || !sliderRent || !sliderTicket || !window.financialGauge) return;

    const invest = parseInt(sliderInvest.value, 10);
    const rent = parseInt(sliderRent.value, 10);
    const ticket = parseInt(sliderTicket.value, 10);
    const m = window.financialGauge.simulateQuick(invest, rent, ticket);
    const utils = u();

    // Slider value labels
    const lblInvest = document.getElementById('landInvestVal');
    const lblRent = document.getElementById('landRentVal');
    const lblTicket = document.getElementById('landTicketVal');
    if (lblInvest) lblInvest.textContent = utils ? utils.formatLakh(invest) : '₹' + (invest / 100000).toFixed(1) + 'L';
    if (lblRent) lblRent.textContent = '₹' + Math.round(rent / 1000) + 'k/mo';
    if (lblTicket) lblTicket.textContent = '₹' + ticket.toLocaleString('en-IN');

    // Output cards
    const outBreakeven = document.getElementById('landOutBreakeven');
    const outCovers = document.getElementById('landOutCovers');
    const outRtr = document.getElementById('landOutRtr');
    const outRisk = document.getElementById('landOutRisk');
    const outRiskPill = document.getElementById('landOutRiskPill');

    if (outBreakeven) {
      if (m.breakEvenMonths === Infinity) {
        outBreakeven.textContent = 'Not Achievable';
      } else if (animate && utils) {
        utils.animateValue(outBreakeven, m.breakEvenMonths, v => 'Month ' + v.toFixed(1), 700);
      } else {
        outBreakeven.textContent = 'Month ' + m.breakEvenMonths.toFixed(1);
      }
      outBreakeven.style.color = m.breakEvenMonths === Infinity || m.breakEvenMonths > 30 ? '#FF3B30'
        : m.breakEvenMonths > 18 ? '#FF9500' : '#34C759';
    }

    if (outCovers) {
      const coversText = v => Math.round(v) + ' covers/day';
      if (animate && utils) utils.animateValue(outCovers, m.dailyCovers, coversText, 700);
      else outCovers.textContent = coversText(m.dailyCovers);
    }

    if (outRtr) {
      const rtrText = v => v.toFixed(1) + '%';
      if (animate && utils) utils.animateValue(outRtr, m.rtrRatio, rtrText, 700);
      else outRtr.textContent = rtrText(m.rtrRatio);
      outRtr.style.color = m.rtrRatio < 18 ? '#34C759' : m.rtrRatio < 23 ? '#FF9500' : '#FF3B30';
    }

    const tier = classifyLeaseStress(m);
    const style = RISK_TIERS[tier];
    if (outRisk) {
      outRisk.textContent = style.label;
      outRisk.style.color = style.color;
    }
    if (outRiskPill) {
      outRiskPill.textContent = style.pill;
      outRiskPill.className = 'text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ' + style.pillClasses;
    }
  }

  if (sliderInvest && sliderRent && sliderTicket) {
    sliderInvest.addEventListener('input', () => updateLandingSimulator(false));
    sliderRent.addEventListener('input', () => updateLandingSimulator(false));
    sliderTicket.addEventListener('input', () => updateLandingSimulator(false));
    updateLandingSimulator(true);
  }

  /* ── Landlord Registry Interest Toggle ── */
  const landlordCtaBtn = document.getElementById('landlordCtaBtn');
  const landlordNote = document.getElementById('landlordNote');
  if (landlordCtaBtn && landlordNote) {
    landlordCtaBtn.addEventListener('click', () => {
      landlordNote.classList.toggle('hidden');
    });
  }

  /* ── Scroll Reveal System ── */
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -25px 0px' });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  }
});
