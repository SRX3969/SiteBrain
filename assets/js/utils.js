/**
 * ═══════════════════════════════════════════════════════════════════
 * SITEBRAIN — SHARED UTILITIES
 * Indian currency formatters, DOM helpers, value count-up animation
 * ═══════════════════════════════════════════════════════════════════
 */

window.SiteBrainUtils = (function () {
  'use strict';

  function el(id) {
    return document.getElementById(id);
  }

  /** ₹1,98,000 full Indian-grouping format */
  function formatINR(amount) {
    if (isNaN(amount) || !isFinite(amount)) return '₹0';
    return '₹' + Math.round(amount).toLocaleString('en-IN');
  }

  /** ₹45.0L compact lakh format */
  function formatLakh(amount) {
    if (isNaN(amount) || !isFinite(amount)) return '₹0';
    if (amount >= 10000000) return '₹' + (amount / 10000000).toFixed(2) + ' Cr';
    return '₹' + (amount / 100000).toFixed(1) + 'L';
  }

  /** ₹1.98L/mo style for monthly burn */
  function formatLakhMonthly(amount) {
    return formatLakh(amount) + '/mo';
  }

  /**
   * Animate a numeric value into an element with a formatter callback.
   * Respects prefers-reduced-motion by jumping straight to the target.
   */
  function animateValue(targetEl, to, formatter, duration) {
    if (!targetEl) return;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduceMotion ? 0 : (duration || 700);

    if (dur === 0 || !formatter) {
      targetEl.textContent = formatter ? formatter(to) : to;
      return;
    }

    const startTime = performance.now();
    const from = 0;

    function tick(now) {
      const progress = Math.min((now - startTime) / dur, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      targetEl.textContent = formatter(current);
      if (progress < 1) requestAnimationFrame(tick);
      else targetEl.textContent = formatter(to);
    }
    requestAnimationFrame(tick);
  }

  function debounce(fn, wait) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait || 120);
    };
  }

  /** Basic HTML escaping for any user-derived text rendered into templates */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Extract meaningful keyword signals from free-form concept text */
  function extractConceptKeywords(text, maxKeywords) {
    if (!text) return [];
    const stop = new Set(['want', 'would', 'like', 'open', 'start', 'launch', 'build', 'with', 'that', 'this', 'from', 'into', 'near', 'around', 'about', 'target', 'targeting', 'people', 'area', 'square', 'feet', 'sqft', 'looking', 'planning', 'make', 'have', 'your', 'their', 'them', 'will', 'also', 'very', 'well', 'based', 'concept', 'store', 'shop', 'place']);
    const words = String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stop.has(w) && !/^\d+$/.test(w));
    const seen = new Set();
    const keywords = [];
    for (const w of words) {
      if (!seen.has(w)) {
        seen.add(w);
        keywords.push(w);
      }
      if (keywords.length >= (maxKeywords || 6)) break;
    }
    return keywords;
  }

  return {
    el,
    formatINR,
    formatLakh,
    formatLakhMonthly,
    animateValue,
    debounce,
    escapeHtml,
    extractConceptKeywords
  };
})();
