let payload = { rows: [], models: [] };
let rows = [];
let models = [];

let selectedTab = "tests";
let selectedGroup = "demand_model";
let selectedWithinGroup = "demand_model";
let selectedDensityCutoff = "2";
let selectedTestFilters = {};
let selectedWithinTestModels = [];
let selectedWithinTestField = "role";
let selectedWithinTestLevelA = "";
let selectedWithinTestLevelB = "";

const MODEL_META = {
  "GPT-5 mini": { colorClass: "model-gpt", short: "GPT" },
  "Gemini 2.5 Flash": { colorClass: "model-gemini", short: "Gemini" },
  "Claude Haiku 4.5": { colorClass: "model-claude", short: "Claude" },
  "Heuristic": { colorClass: "model-heuristic", short: "Heuristic" },
};

const HEURISTIC_LABEL = "Heuristic";
const ACROSS_CHART_ORDER = ["Gemini 2.5 Flash", "Claude Haiku 4.5", "GPT-5 mini", HEURISTIC_LABEL];

const PAIR_META = [
  { colorClass: "pair-one" },
  { colorClass: "pair-two" },
  { colorClass: "pair-three" },
];

const GROUP_OPTIONS = {
  scenario_subtype: "Scenario",
  demand_model: "Demand model",
  history_length: "History length",
  sigma: "Noise sigma",
  parameter_set: "Parameter set",
  has_environment: "Has environment",
  next_env: "Next environment",
  mc: "Marginal cost",
  p_c_current: "Competitor price",
  role: "Expert role",
  product_context: "Product context",
  dist_hint: "Distribution hint",
  dist_hint_applied: "Distribution hint (applied)",
  env_hint: "Environment hint",
};

const TEST_FILTER_FIELDS = [
  "scenario_subtype",
  "demand_model",
  "sigma",
  "history_length",
  "next_env",
  "mc",
  "p_c_current",
  "role",
  "product_context",
  "dist_hint",
  "dist_hint_applied",
  "env_hint",
];

const WITHIN_ALL_LEVEL = "__all_levels__";
const WITHIN_ALL_COMPARISONS = "__all_comparisons__";
const WITHIN_ALL_LEVEL_LABELS = {
  scenario_subtype: "All scenarios",
  demand_model: "All demand models",
  history_length: "All history lengths",
  sigma: "All noise levels",
  parameter_set: "All parameter sets",
  has_environment: "All environment settings",
  next_env: "All next environments",
  mc: "All marginal costs",
  p_c_current: "All competitor prices",
  role: "All expert roles",
  product_context: "All product contexts",
  dist_hint: "All distribution hints",
  dist_hint_applied: "All applied hint modes",
  env_hint: "All environment hints",
};
const WITHIN_ALL_COMPARISONS_LABEL = "Each level once (vs rest)";

const fmtInt = value => new Intl.NumberFormat("en-US").format(value || 0);
const fmtNum = value => Number.isFinite(value) ? value.toFixed(3) : "-";
const fmtPct = value => Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "-";
const fmtLoss = value => Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "-";
const fmtP = value => {
  if (!Number.isFinite(value)) return "-";
  if (value < 0.0001) return "<0.0001";
  return value.toFixed(4);
};
const fmtSignedLoss = value => {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${fmtLoss(value)}`;
};
const sigClass = pValue => Number.isFinite(pValue) && pValue < 0.05 ? "significant-cell" : "";
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(values, q) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function variance(values) {
  if (values.length < 2) return NaN;
  const avg = mean(values);
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
}

function stddev(values) {
  const value = variance(values);
  return Number.isFinite(value) ? Math.sqrt(value) : NaN;
}

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(value) {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function modelPairs() {
  const pairs = [];
  for (let i = 0; i < models.length; i += 1) {
    for (let j = i + 1; j < models.length; j += 1) {
      pairs.push([models[i], models[j]]);
    }
  }
  return pairs;
}

function pairLabel(modelA, modelB) {
  return `${modelMeta(modelA).short} - ${modelMeta(modelB).short}`;
}

function pairedDiffs(caseRows, modelA, modelB) {
  return caseRows
    .map(row => row[modelA].rel_rev_loss - row[modelB].rel_rev_loss)
    .filter(Number.isFinite);
}

function heuristicLoss(caseRows) {
  const sourceRow = Object.values(caseRows).find(row => Number.isFinite(row?.heuristic_rel_rev_loss));
  return sourceRow ? sourceRow.heuristic_rel_rev_loss : NaN;
}

function benchmarkLoss(caseRows, method) {
  if (method === HEURISTIC_LABEL) return heuristicLoss(caseRows);
  return caseRows[method]?.rel_rev_loss;
}

function benchmarkLosses(cases, method) {
  return cases.map(caseRows => benchmarkLoss(caseRows, method)).filter(Number.isFinite);
}

function pairedBenchmarkDiffs(caseRows, methodA, methodB) {
  return caseRows
    .map(row => benchmarkLoss(row, methodA) - benchmarkLoss(row, methodB))
    .filter(Number.isFinite);
}

function pairedBenchmarkEvidence(caseRows, methodA, methodB, seed) {
  return pairedDifferenceEvidenceFromDiffs(pairedBenchmarkDiffs(caseRows, methodA, methodB), seed);
}

function levelValue(value) {
  if (value === true) return "TRUE";
  if (value === false) return "FALSE";
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  return String(value);
}

function displayLevel(value) {
  const text = levelValue(value);
  if (text === "None") return "No value";
  if (text === "TRUE") return "Yes";
  if (text === "FALSE") return "No";
  return text.replaceAll("_", " ");
}

function withinAllLabel(field) {
  return WITHIN_ALL_LEVEL_LABELS[field] || `All ${GROUP_OPTIONS[field]}`;
}

function withinLevelLabel(field, value) {
  if (value === WITHIN_ALL_COMPARISONS) return WITHIN_ALL_COMPARISONS_LABEL;
  return value === WITHIN_ALL_LEVEL ? withinAllLabel(field) : displayLevel(value);
}

function modelMeta(model) {
  return MODEL_META[model] || { colorClass: "model-fallback", short: model };
}

function kpi(label, value, note) {
  return `
    <article class="kpi card">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-note">${note}</div>
    </article>`;
}

function bars(items, formatter, scaleMax = null) {
  if (!items.length) return `<p class="quiet">No comparable observations in this filter.</p>`;
  const finite = items.map(item => item.value).filter(Number.isFinite);
  const max = scaleMax ?? Math.max(...finite, 0.000001);
  return items.map(item => `
    <div class="bar-row">
      <div class="bar-label" title="${item.label}">${item.label}</div>
      <div class="bar-track">
        <div class="bar-fill ${item.className || ""}" style="width:${Number.isFinite(item.value) ? Math.max(2, Math.min(100, item.value / max * 100)) : 0}%"></div>
      </div>
      <div class="bar-value">${formatter(item.value)}</div>
    </div>`).join("");
}

function priceDirection(row) {
  if (!row || !row.answered || !Number.isFinite(row.ai_answer) || !Number.isFinite(row.p_star)) {
    return null;
  }
  if (row.p_star === 0) return null;
  const relativeDeviation = (row.ai_answer - row.p_star) / row.p_star;
  if (relativeDeviation < -0.05) return "under";
  if (relativeDeviation > 0.05) return "over";
  return "similar";
}

function directionSummary(sourceRows) {
  const counts = { under: 0, similar: 0, over: 0 };
  sourceRows.forEach(row => {
    const direction = priceDirection(row);
    if (direction) counts[direction] += 1;
  });
  const total = counts.under + counts.similar + counts.over;
  return { ...counts, total };
}

function renderDirectionBars(items) {
  if (!items.length) return `<p class="quiet">No answered price rows available.</p>`;
  const summaries = items.map(item => ({ ...item, summary: directionSummary(item.rows) }));
  const shares = summaries.flatMap(item => ["under", "similar", "over"].map(key =>
    item.summary.total ? item.summary[key] / item.summary.total : 0
  ));
  const yMax = Math.max(...shares, 0.001) * 1.18;
  const width = Math.max(390, summaries.length * 185 + 90);
  const height = 310;
  const margin = { top: 38, right: 18, bottom: 52, left: 130 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const groupWidth = plotWidth / summaries.length;
  const barWidth = Math.min(24, groupWidth * 0.13);
  const gap = Math.min(25, groupWidth * 0.14);
  const y = value => margin.top + plotHeight - (value / yMax) * plotHeight;
  const yTicks = [0, yMax / 2, yMax];
  const axis = yTicks.map(tick => {
    const ty = y(tick);
    return `
      <g>
        <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${ty.toFixed(2)}" y2="${ty.toFixed(2)}" class="grid-line"></line>
        <text x="${margin.left - 10}" y="${(ty + 4).toFixed(2)}" text-anchor="end">${fmtPct(tick)}</text>
      </g>`;
  }).join("");
  const groups = summaries.map((item, index) => {
    const center = margin.left + groupWidth * (index + 0.5);
    const totalWidth = 3 * barWidth + 2 * gap;
    const startX = center - totalWidth / 2;
    const specs = [
      { key: "under", label: "Under", className: "direction-under" },
      { key: "similar", label: "Similar", className: "direction-similar" },
      { key: "over", label: "Over", className: "direction-over" },
    ];
    const barsHtml = specs.map((spec, specIndex) => {
      const share = item.summary.total ? item.summary[spec.key] / item.summary.total : 0;
      const x = startX + specIndex * (barWidth + gap);
      const barY = y(share);
      return `
        <rect class="${spec.className}" x="${x.toFixed(2)}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(margin.top + plotHeight - barY).toFixed(2)}"></rect>
        <text x="${(x + barWidth / 2).toFixed(2)}" y="${height - 28}" text-anchor="middle">${spec.label}</text>
        <text x="${(x + barWidth / 2).toFixed(2)}" y="${(barY - 5).toFixed(2)}" text-anchor="middle" class="direction-value-label">${fmtPct(share)}</text>`;
    }).join("");
    return `
      <g>
        ${barsHtml}
        <text x="${center.toFixed(2)}" y="${height - 5}" text-anchor="middle" class="axis-title">${item.label}</text>
      </g>`;
  }).join("");
  const legend = [
    ["direction-under", "Under"],
    ["direction-similar", "Similar"],
    ["direction-over", "Over"],
  ].map(([className, label], index) => {
    const x = margin.left + index * 88;
    return `
      <g>
        <rect class="${className}" x="${x}" y="8" width="12" height="12"></rect>
        <text x="${x + 18}" y="19">${label}</text>
      </g>`;
  }).join("");

  return `
    <svg class="direction-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Under similar over pricing bar chart using a five percent threshold">
      <g class="direction-legend">${legend}</g>
      <g class="hist-axis">${axis}</g>
      <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <g>${groups}</g>
      <text x="28" y="${margin.top + plotHeight / 2}" text-anchor="middle" class="axis-title" transform="rotate(-90 28 ${margin.top + plotHeight / 2})">Share of answered prices</text>
    </svg>`;
}

function renderPairMeanCards(items, options = {}) {
  if (!items.length) return `<p class="quiet">No pairwise means available.</p>`;
  const fixedAxis = options.fixedAxis === true;
  const showPValues = options.showPValues !== false;
  const showValues = options.showValues === true;
  const finite = items.flatMap(item => [item.leftMean, item.rightMean]).filter(Number.isFinite);
  const maxValue = Math.max(...finite, 0.000001);
  const yMax = fixedAxis ? 0.06 : maxValue * 1.22;
  const width = Math.max(360, items.length * 185 + 90);
  const height = 300;
  const margin = { top: 34, right: 18, bottom: 58, left: fixedAxis ? 112 : 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const groupWidth = plotWidth / items.length;
  const barWidth = Math.min(30, groupWidth * 0.18);
  const y = value => margin.top + plotHeight - (value / yMax) * plotHeight;
  const yTicks = fixedAxis ? [0, 0.03, 0.06] : [0, yMax / 2, yMax];
  const axis = yTicks.map(tick => {
    const ty = y(tick);
    return `
      <g>
        <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${ty.toFixed(2)}" y2="${ty.toFixed(2)}" class="grid-line"></line>
        <text x="${margin.left - 10}" y="${(ty + 4).toFixed(2)}" text-anchor="end">${fmtLoss(tick)}</text>
      </g>`;
  }).join("");
  const groups = items.map((item, index) => {
    const center = margin.left + groupWidth * (index + 0.5);
    const gap = Math.min(16, groupWidth * 0.08);
    const leftX = center - barWidth - gap / 2;
    const rightX = center + gap / 2;
    const leftY = y(item.leftMean);
    const rightY = y(item.rightMean);
    const pY = Math.min(leftY, rightY) - 10;
    return `
      <g>
        <rect class="${item.leftClass}" x="${leftX.toFixed(2)}" y="${leftY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(margin.top + plotHeight - leftY).toFixed(2)}"></rect>
        <rect class="${item.rightClass}" x="${rightX.toFixed(2)}" y="${rightY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(margin.top + plotHeight - rightY).toFixed(2)}"></rect>
        ${showValues ? `<text x="${(leftX + barWidth / 2).toFixed(2)}" y="${Math.max(margin.top + 12, leftY - 7).toFixed(2)}" text-anchor="middle" class="pair-value-label">${fmtLoss(item.leftMean)}</text>
        <text x="${(rightX + barWidth / 2).toFixed(2)}" y="${Math.max(margin.top + 12, rightY - 7).toFixed(2)}" text-anchor="middle" class="pair-value-label">${fmtLoss(item.rightMean)}</text>` : ""}
        <text x="${(leftX + barWidth / 2).toFixed(2)}" y="${height - 34}" text-anchor="middle">${item.leftLabel}</text>
        <text x="${(rightX + barWidth / 2).toFixed(2)}" y="${height - 34}" text-anchor="middle">${item.rightLabel}</text>
        <text x="${center.toFixed(2)}" y="${height - 14}" text-anchor="middle" class="axis-title">${item.title}</text>
        ${showPValues ? `<text x="${center.toFixed(2)}" y="${Math.max(margin.top + 10, pY).toFixed(2)}" text-anchor="middle" class="${sigClass(item.pValue)}">p=${fmtP(item.pValue)}</text>` : ""}
      </g>`;
  }).join("");

  return `
    <svg class="pair-mean-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pairwise mean relative revenue loss bars">
      <g class="hist-axis">${axis}</g>
      <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <g class="pair-mean-bars">${groups}</g>
      <text x="${fixedAxis ? 28 : 16}" y="${margin.top + plotHeight / 2}" text-anchor="middle" class="axis-title" transform="rotate(-90 ${fixedAxis ? 28 : 16} ${margin.top + plotHeight / 2})">Mean relative revenue loss</text>
    </svg>`;
}

function renderAcrossMeanChart(modelItems, options = {}) {
  if (!modelItems.length) return `<p class="quiet">No complete matched cases available.</p>`;
  const finiteMeans = modelItems.map(item => item.meanLoss).filter(Number.isFinite);
  if (!finiteMeans.length) return `<p class="quiet">No numeric mean losses available.</p>`;

  const yMax = options.yMax || 0.06;
  const compact = options.compact === true;
  const width = compact ? 285 : 600;
  const height = compact ? 270 : 330;
  const margin = compact
    ? { top: 28, right: 14, bottom: 54, left: 56 }
    : { top: 32, right: 34, bottom: 62, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const slotWidth = plotWidth / modelItems.length;
  const barWidth = Math.min(54, slotWidth * 0.34);
  const y = value => margin.top + plotHeight - (value / yMax) * plotHeight;
  const centers = modelItems.map((_, index) => margin.left + slotWidth * (index + 0.5));
  const yTicks = [0, yMax / 2, yMax];
  const axis = yTicks.map(tick => {
    const ty = y(tick);
    return `
      <g>
        <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${ty.toFixed(2)}" y2="${ty.toFixed(2)}" class="grid-line"></line>
        <text x="${margin.left - 10}" y="${(ty + 4).toFixed(2)}" text-anchor="end">${fmtLoss(tick)}</text>
      </g>`;
  }).join("");

  const barsHtml = modelItems.map((item, index) => {
    const x = centers[index] - barWidth / 2;
    const barY = y(item.meanLoss);
    return `
      <g>
        <rect class="${modelMeta(item.model).colorClass}" x="${x.toFixed(2)}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(margin.top + plotHeight - barY).toFixed(2)}"></rect>
        <text x="${centers[index].toFixed(2)}" y="${(barY - 7).toFixed(2)}" text-anchor="middle" class="pair-value-label">${fmtLoss(item.meanLoss)}</text>
        <text x="${centers[index].toFixed(2)}" y="${height - 22}" text-anchor="middle" class="axis-title">${modelMeta(item.model).short}</text>
      </g>`;
  }).join("");

  return `
    <svg class="pair-mean-chart across-mean-chart ${compact ? "compact-across-mean-chart" : ""}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Across-method mean relative revenue loss bars">
      <g class="hist-axis">${axis}</g>
      <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <g class="pair-mean-bars">${barsHtml}</g>
      <text x="16" y="${margin.top + plotHeight / 2}" text-anchor="middle" class="axis-title" transform="rotate(-90 16 ${margin.top + plotHeight / 2})">Mean relative revenue loss</text>
    </svg>`;
}

function sharedPercentAxisMax(values, minimum = 0.10) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return minimum;
  const paddedMax = Math.max(minimum, Math.max(...finite) * 1.08);
  return Math.ceil(paddedMax / 0.05) * 0.05;
}

function renderAcrossDistributionMeanPanels(caseRows) {
  const levels = [...new Set(caseRows.map(caseRows => levelValue(caseRows[models[0]]?.demand_model)))].sort((a, b) =>
    displayLevel(a).localeCompare(displayLevel(b))
  );
  if (!levels.length) return `<p class="quiet">No complete matched cases available.</p>`;

  return levels.map(level => {
    const cases = caseRows.filter(caseRows => levelValue(caseRows[models[0]]?.demand_model) === level)
      .filter(caseRows => Number.isFinite(heuristicLoss(caseRows)));
    const items = ACROSS_CHART_ORDER.map(model => ({
      model,
      n: cases.length,
      meanLoss: mean(benchmarkLosses(cases, model)),
    }));
    const yMax = level === "empirical_rf"
      ? sharedPercentAxisMax(items.map(item => item.meanLoss), 0.10)
      : 0.10;
    return `<section class="distribution-mean-panel">
      <h3>${displayLevel(level)}</h3>
      ${renderAcrossMeanChart(items, { yMax, compact: true })}
    </section>`;
  }).join("");
}

function uniqueSorted(field, sourceRows = rows) {
  const values = [...new Set(sourceRows.map(row => levelValue(row[field])))];
  return values.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return displayLevel(a).localeCompare(displayLevel(b));
  });
}

function setSelectOptions(selector, values, selected, label = "All") {
  const select = document.querySelector(selector);
  select.innerHTML = [
    `<option value="all">${label}</option>`,
    ...values.map(value => `<option value="${value}">${displayLevel(value)}</option>`),
  ].join("");
  select.value = values.includes(selected) ? selected : "all";
  return select.value;
}

function populateControls() {
  const groupPicker = document.querySelector("#groupPicker");
  groupPicker.innerHTML = Object.entries(GROUP_OPTIONS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  groupPicker.value = selectedGroup;
}

function populateWithinControls() {
  const groupPicker = document.querySelector("#withinGroupPicker");
  groupPicker.innerHTML = Object.entries(GROUP_OPTIONS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  groupPicker.value = selectedWithinGroup;
}

function populateTestFilterControls() {
  document.querySelectorAll("[data-test-filter]").forEach(select => {
    const field = select.dataset.testFilter;
    const current = selectedTestFilters[field] || "all";
    const label = `All ${GROUP_OPTIONS[field].toLowerCase()}s`;
    const selected = setSelectOptions(`[data-test-filter="${field}"]`, uniqueSorted(field), current, label);
    if (selected === "all") delete selectedTestFilters[field];
    else selectedTestFilters[field] = selected;
  });
}

function populateWithinTestControls() {
  selectedWithinTestModels = selectedWithinTestModels.filter(model => models.includes(model));
  if (!selectedWithinTestModels.length) {
    selectedWithinTestModels = [...models];
  }

  const modelPicker = document.querySelector("#withinTestModels");
  modelPicker.innerHTML = models
    .map(model => `<option value="${model}" ${selectedWithinTestModels.includes(model) ? "selected" : ""}>${model}</option>`)
    .join("");

  const fieldPicker = document.querySelector("#withinTestField");
  const validFields = Object.keys(GROUP_OPTIONS).filter(field =>
    validWithinComparisons(selectedWithinTestModels, field).length
  );
  if (!validFields.includes(selectedWithinTestField)) selectedWithinTestField = validFields[0] || "";
  fieldPicker.innerHTML = validFields
    .map(value => `<option value="${value}">${GROUP_OPTIONS[value]}</option>`)
    .join("") || `<option value="">No paired fields</option>`;
  fieldPicker.value = selectedWithinTestField;

  const validPairs = validWithinComparisons(selectedWithinTestModels, selectedWithinTestField);
  const hasAllOption = validPairs.some(pair => pair.a === WITHIN_ALL_LEVEL);
  const selectionIsValid = selectedWithinTestLevelA === WITHIN_ALL_LEVEL
    ? hasAllOption
    : validPairs.some(pair => pair.a === selectedWithinTestLevelA && pair.b === selectedWithinTestLevelB);
  if (!selectionIsValid) {
    const preferredPair = selectedWithinTestField === "dist_hint_applied"
      ? validPairs.find(pair => pair.a === "none" && pair.b === "family")
      : null;
    const defaultPair = validPairs.find(pair => pair.a !== WITHIN_ALL_LEVEL) || validPairs[0];
    selectedWithinTestLevelA = preferredPair?.a || defaultPair?.a || "";
    selectedWithinTestLevelB = preferredPair?.b || defaultPair?.b || "";
  } else if (selectedWithinTestLevelA === WITHIN_ALL_LEVEL) {
    selectedWithinTestLevelB = WITHIN_ALL_COMPARISONS;
  }

  const levelA = document.querySelector("#withinTestLevelA");
  const levelB = document.querySelector("#withinTestLevelB");
  const levelAOptions = [...new Set(validPairs.map(pair => pair.a))]
    .sort((left, right) => {
      if (left === WITHIN_ALL_LEVEL) return -1;
      if (right === WITHIN_ALL_LEVEL) return 1;
      return withinLevelLabel(selectedWithinTestField, left).localeCompare(withinLevelLabel(selectedWithinTestField, right));
    });
  const levelBOptions = selectedWithinTestLevelA === WITHIN_ALL_LEVEL
    ? [WITHIN_ALL_COMPARISONS]
    : validPairs
      .filter(pair => pair.a === selectedWithinTestLevelA)
      .map(pair => pair.b);
  levelA.innerHTML = levelAOptions
    .map(level => `<option value="${level}">${withinLevelLabel(selectedWithinTestField, level)}</option>`)
    .join("");
  levelB.innerHTML = levelBOptions
    .map(level => `<option value="${level}">${withinLevelLabel(selectedWithinTestField, level)}</option>`)
    .join("");
  levelA.value = selectedWithinTestLevelA;
  if (!levelBOptions.includes(selectedWithinTestLevelB)) selectedWithinTestLevelB = levelBOptions[0] || "";
  levelB.value = selectedWithinTestLevelB;
  levelB.disabled = selectedWithinTestLevelA === WITHIN_ALL_LEVEL;
}

function passesFilters(row) {
  return true;
}

function passesTestFilters(row) {
  return TEST_FILTER_FIELDS.every(field => {
    const selected = selectedTestFilters[field];
    return !selected || selected === "all" || levelValue(row[field]) === selected;
  });
}

function activeTestFilterLabels() {
  return TEST_FILTER_FIELDS
    .filter(field => selectedTestFilters[field] && selectedTestFilters[field] !== "all")
    .map(field => `${GROUP_OPTIONS[field]}: ${displayLevel(selectedTestFilters[field])}`);
}

function benchmarkInputColumns() {
  return payload.input_columns || Object.keys(GROUP_OPTIONS);
}

function withinMatchKey(row, varyingField) {
  const linkedFields = varyingField === "dist_hint_applied" ? ["dist_hint"] : [];
  return benchmarkInputColumns()
    .filter(field => field !== varyingField && !linkedFields.includes(field) && field !== "variant" && field !== "instance_id")
    .map(field => levelValue(row[field]))
    .join("|");
}

function withinMatchedPairsFor(model, field, levelA, levelB) {
  if (!model || !field || !levelA || !levelB) {
    return [];
  }
  if (levelA === WITHIN_ALL_LEVEL) {
    const groups = new Map();
    rows.forEach(row => {
      if (row.model !== model || !row.answered) return;
      const level = levelValue(row[field]);
      const key = withinMatchKey(row, field);
      const group = groups.get(key) || { aRows: [] };
      if (level === levelB) group.b = row;
      else group.aRows.push(row);
      groups.set(key, group);
    });
    return [...groups.values()]
      .filter(group => group.b && group.aRows.length)
      .flatMap(group => group.aRows.map(aRow => ({ a: aRow, b: group.b })));
  }
  const groups = new Map();
  rows.forEach(row => {
    if (row.model !== model || !row.answered) return;
    const level = levelValue(row[field]);
    if (level !== levelA && level !== levelB) return;
    const key = withinMatchKey(row, field);
    const group = groups.get(key) || {};
    if (level === levelA) group.a = row;
    if (level === levelB) group.b = row;
    groups.set(key, group);
  });
  return [...groups.values()].filter(group => group.a && group.b);
}

function withinMatchedPairs(model) {
  return withinMatchedPairsFor(
    model,
    selectedWithinTestField,
    selectedWithinTestLevelA,
    selectedWithinTestLevelB
  );
}

function concreteWithinAllSelections(selectedModels, field) {
  if (!selectedModels.length || !field) return [];
  const levels = [...new Set(
    selectedModels.flatMap(model => uniqueSorted(field, rows.filter(row => row.model === model)))
  )].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return withinLevelLabel(field, a).localeCompare(withinLevelLabel(field, b));
  });
  return levels.map(level => {
    const minCount = Math.min(...selectedModels.map(model =>
      withinMatchedPairsFor(model, field, WITHIN_ALL_LEVEL, level).length
    ));
    return { a: WITHIN_ALL_LEVEL, b: level, count: minCount };
  }).filter(item => item.count).sort((left, right) =>
    right.count - left.count || withinLevelLabel(field, left.b).localeCompare(withinLevelLabel(field, right.b))
  );
}

function concreteWithinComparisons(selectedModels, field) {
  if (!selectedModels.length || !field) return [];
  const levels = [...new Set(
    selectedModels.flatMap(model => uniqueSorted(field, rows.filter(row => row.model === model)))
  )].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return withinLevelLabel(field, a).localeCompare(withinLevelLabel(field, b));
  });
  const comparisons = [];
  for (let i = 0; i < levels.length; i += 1) {
    for (let j = i + 1; j < levels.length; j += 1) {
      const a = levels[i];
      const b = levels[j];
      const minCount = Math.min(...selectedModels.map(model =>
        withinMatchedPairsFor(model, field, a, b).length
      ));
      if (minCount) comparisons.push({ a, b, count: minCount });
    }
  }
  return comparisons.sort((left, right) =>
    right.count - left.count
      || withinLevelLabel(field, left.a).localeCompare(withinLevelLabel(field, right.a))
      || withinLevelLabel(field, left.b).localeCompare(withinLevelLabel(field, right.b))
  );
}

function validWithinComparisons(selectedModels, field) {
  if (!selectedModels.length || !field) return [];
  const perModel = selectedModels.map(model => {
    const levels = uniqueSorted(field, rows.filter(row => row.model === model));
    const pairs = [];
    for (let i = 0; i < levels.length; i += 1) {
      for (let j = 0; j < levels.length; j += 1) {
        if (i === j) continue;
        const a = levels[i];
        const b = levels[j];
        const count = withinMatchedPairsFor(model, field, a, b).length;
        if (count) pairs.push({ a, b, count });
      }
    }
    return pairs;
  });
  const commonKeys = new Set(perModel[0].map(pair => `${pair.a}|||${pair.b}`));
  perModel.slice(1).forEach(pairs => {
    const keys = new Set(pairs.map(pair => `${pair.a}|||${pair.b}`));
    [...commonKeys].forEach(key => {
      if (!keys.has(key)) commonKeys.delete(key);
    });
  });
  return [...commonKeys].map(key => {
    const [a, b] = key.split("|||");
    const minCount = Math.min(...perModel.map(pairs =>
      pairs.find(pair => pair.a === a && pair.b === b)?.count || 0
    ));
    return { a, b, count: minCount };
  }).concat(
    concreteWithinAllSelections(selectedModels, field).length
      ? [{ a: WITHIN_ALL_LEVEL, b: WITHIN_ALL_COMPARISONS, count: concreteWithinAllSelections(selectedModels, field).reduce((sum, pair) => sum + pair.count, 0) }]
      : []
  ).sort((left, right) => {
    if (left.a === WITHIN_ALL_LEVEL) return -1;
    if (right.a === WITHIN_ALL_LEVEL) return 1;
    return right.count - left.count || withinLevelLabel(field, left.a).localeCompare(withinLevelLabel(field, right.a));
  });
}

function comparableCases(filterFn = passesFilters) {
  const caseMap = new Map();
  rows.forEach(row => {
    if (!filterFn(row)) return;
    const modelRows = caseMap.get(row.case_key) || {};
    modelRows[row.model] = row;
    caseMap.set(row.case_key, modelRows);
  });
  return [...caseMap.values()].filter(caseRows => models.every(model => caseRows[model]));
}

function completeCases(cases) {
  return cases.filter(caseRows => models.every(model => caseRows[model].answered));
}

function modelLosses(cases, model) {
  return cases.map(caseRows => caseRows[model].rel_rev_loss).filter(Number.isFinite);
}

function caseWinner(caseRows) {
  const losses = models.map(model => ({ model, loss: caseRows[model].rel_rev_loss }));
  const best = Math.min(...losses.map(item => item.loss));
  const winners = losses.filter(item => Math.abs(item.loss - best) < 1e-12);
  return winners.length === 1 ? winners[0].model : "Tie";
}

function modelSummary(cases) {
  const completed = completeCases(cases);
  return models.map(model => {
    const allRows = cases.map(caseRows => caseRows[model]);
    const losses = modelLosses(completed, model);
    return {
      model,
      answered: allRows.filter(row => row.answered).length,
      answerRate: cases.length ? allRows.filter(row => row.answered).length / cases.length : NaN,
      meanLoss: mean(losses),
      medianLoss: median(losses),
      p75Loss: quantile(losses, 0.75),
      p90Loss: quantile(losses, 0.90),
    };
  });
}

function renderHistogram(completed) {
  const allLosses = models.flatMap(model => modelLosses(completed, model));
  const host = document.querySelector("#lossHistogram");
  if (!allLosses.length) {
    host.innerHTML = `<p class="quiet">No complete matched cases in this filter.</p>`;
    return;
  }

  const width = 920;
  const height = 320;
  const margin = { top: 42, right: 22, bottom: 42, left: 68 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const bins = 28;
  const rawDomainMax = Math.max(quantile(allLosses, 0.99), 0.001);
  const domainMax = Math.ceil(rawDomainMax * 100 / 2) * 2 / 100;
  const binWidth = domainMax / bins;

  const modelBins = models.map(model => {
    const counts = Array.from({ length: bins }, () => 0);
    modelLosses(completed, model).forEach(loss => {
      const index = Math.min(bins - 1, Math.max(0, Math.floor(loss / binWidth)));
      counts[index] += 1;
    });
    const total = counts.reduce((sum, count) => sum + count, 0) || 1;
    return { model, shares: counts.map(count => count / total) };
  });
  const maxShare = Math.max(...modelBins.flatMap(item => item.shares), 0.01);
  const x = index => margin.left + (index / bins) * plotWidth;
  const y = share => margin.top + plotHeight - (share / maxShare) * plotHeight;
  const barWidth = plotWidth / bins;
  const axisTicks = [0, domainMax / 4, domainMax / 2, domainMax * 3 / 4, domainMax];
  const yTicks = [0, maxShare / 2, maxShare];

  const rects = modelBins.map(item => item.shares.map((share, index) => {
    const meta = modelMeta(item.model);
    const barX = x(index);
    const barY = y(share);
    return `<rect class="${meta.colorClass}" x="${barX.toFixed(2)}" y="${barY.toFixed(2)}" width="${Math.max(1, barWidth - 1).toFixed(2)}" height="${(margin.top + plotHeight - barY).toFixed(2)}"></rect>`;
  }).join("")).join("");

  const xAxis = axisTicks.map(tick => {
    const tx = margin.left + (tick / domainMax) * plotWidth;
    return `
      <g>
        <line x1="${tx.toFixed(2)}" x2="${tx.toFixed(2)}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="grid-line"></line>
        <text x="${tx.toFixed(2)}" y="${height - 16}" text-anchor="middle">${fmtLoss(tick)}</text>
      </g>`;
  }).join("");
  const yAxis = yTicks.map(tick => {
    const ty = y(tick);
    return `
      <g>
        <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${ty.toFixed(2)}" y2="${ty.toFixed(2)}" class="grid-line"></line>
        <text x="${margin.left - 10}" y="${(ty + 4).toFixed(2)}" text-anchor="end">${fmtPct(tick)}</text>
      </g>`;
  }).join("");
  const legend = models.map((model, index) => {
    const meta = modelMeta(model);
    const lx = margin.left + index * 168;
    return `
      <g>
        <rect class="${meta.colorClass}" x="${lx}" y="6" width="12" height="12"></rect>
        <text x="${lx + 18}" y="17">${model}</text>
      </g>`;
  }).join("");

  host.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Histogram of relative revenue loss across models">
      <g class="hist-legend">${legend}</g>
      <g class="hist-axis">${xAxis}${yAxis}</g>
      <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <g class="hist-bars">${rects}</g>
      <text x="${margin.left + plotWidth / 2}" y="${height - 2}" text-anchor="middle" class="axis-title">Relative revenue loss</text>
      <text x="16" y="${margin.top + plotHeight / 2}" text-anchor="middle" class="axis-title" transform="rotate(-90 16 ${margin.top + plotHeight / 2})">Share of cases</text>
    </svg>`;
}

function lossPlotDomain(allLosses) {
  const globalMean = mean(allLosses);
  const globalSd = stddev(allLosses);
  const observedMax = Math.max(...allLosses);
  const cutoffSd = selectedDensityCutoff === "full" ? NaN : Number(selectedDensityCutoff);
  const cutoffMax = Number.isFinite(cutoffSd) ? globalMean + cutoffSd * globalSd : observedMax;
  const domainMax = Math.max(0.001, Math.min(observedMax, cutoffMax));
  const cutoffText = Number.isFinite(cutoffSd) ? `Right cut: mean + ${cutoffSd} SD` : "Right cut: full range";
  return { domainMax, cutoffText };
}

function renderDensityPlot(completed) {
  const densityMethods = ACROSS_CHART_ORDER.filter(method => method === HEURISTIC_LABEL || models.includes(method));
  const allLosses = densityMethods.flatMap(method => benchmarkLosses(completed, method));
  const host = document.querySelector("#lossDensity");
  if (!allLosses.length) {
    host.innerHTML = `<p class="quiet">No complete matched cases available for density tests.</p>`;
    return;
  }
  document.querySelector("#densityCutoffLabel").textContent = "Kernel density over 0-15% relative revenue loss";

  const width = 920;
  const height = 330;
  const margin = { top: 42, right: 24, bottom: 44, left: 68 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const domainMax = 0.15;
  const points = 180;
  const grid = Array.from({ length: points }, (_, index) => index / (points - 1) * domainMax);
  const pooledSd = stddev(allLosses);
  const pooledN = allLosses.length;
  const silverman = Number.isFinite(pooledSd) && pooledN > 1 ? 1.06 * pooledSd * pooledN ** -0.2 : domainMax / 20;
  const bandwidth = Math.max(silverman, domainMax / 120, 0.0005);

  const densities = densityMethods.map(model => {
    const values = benchmarkLosses(completed, model).filter(value => value >= 0);
    const normalizer = values.length * bandwidth * Math.sqrt(2 * Math.PI);
    const curve = grid.map(xValue => {
      const sum = values.reduce((acc, value) => {
        const direct = (xValue - value) / bandwidth;
        const reflected = (xValue + value) / bandwidth;
        return acc + Math.exp(-0.5 * direct * direct) + Math.exp(-0.5 * reflected * reflected);
      }, 0);
      return normalizer ? sum / normalizer : 0;
    });
    return { model, curve };
  });
  const quartiles = densityMethods.map(model => {
    const values = benchmarkLosses(completed, model);
    return {
      model,
      q25: quantile(values, 0.25),
      q50: quantile(values, 0.5),
      q75: quantile(values, 0.75),
    };
  });

  const observedDensityMax = Math.max(...densities.flatMap(item => item.curve), 1);
  const yStep = observedDensityMax <= 80 ? 20 : Math.ceil(observedDensityMax / 80) * 20;
  const yMax = Math.max(40, Math.ceil(observedDensityMax / yStep) * yStep);
  const x = value => margin.left + (value / domainMax) * plotWidth;
  const y = value => margin.top + plotHeight - (value / yMax) * plotHeight;
  const xTicks = [0, 0.05, 0.10, 0.15];
  const yTicks = Array.from({ length: Math.round(yMax / yStep) + 1 }, (_, index) => index * yStep);
  const paths = densities.map(item => {
    const meta = modelMeta(item.model);
    const d = item.curve.map((density, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${x(grid[index]).toFixed(2)},${y(density).toFixed(2)}`;
    }).join(" ");
    return `<path class="density-line ${meta.colorClass}" d="${d}"></path>`;
  }).join("");
  const xAxis = xTicks.map(tick => {
    const tx = x(tick);
    return `
      <g>
        <line x1="${tx.toFixed(2)}" x2="${tx.toFixed(2)}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="grid-line"></line>
        <text x="${tx.toFixed(2)}" y="${height - 16}" text-anchor="middle">${fmtLoss(tick)}</text>
      </g>`;
  }).join("");
  const yAxis = yTicks.map(tick => {
    const ty = y(tick);
    return `
      <g>
        <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${ty.toFixed(2)}" y2="${ty.toFixed(2)}" class="grid-line"></line>
        <text x="${margin.left - 10}" y="${(ty + 4).toFixed(2)}" text-anchor="end">${tick.toFixed(0)}</text>
      </g>`;
  }).join("");
  const legend = densityMethods.map((model, index) => {
    const meta = modelMeta(model);
    const lx = margin.left + index * 128;
    return `
      <g>
        <line class="density-legend ${meta.colorClass}" x1="${lx}" x2="${lx + 18}" y1="13" y2="13"></line>
        <text x="${lx + 25}" y="17">${meta.short}</text>
      </g>`;
  }).join("");
  const insetWidth = 304;
  const insetX = width - margin.right - insetWidth - 8;
  const insetY = margin.top + 10;
  const rowHeight = 23;
  const headerHeight = 49;
  const insetHeight = headerHeight + quartiles.length * rowHeight + 7;
  const quartileRows = quartiles.map((item, index) => {
    const rowTop = insetY + headerHeight + index * rowHeight;
    const rowY = rowTop + 16;
    const meta = modelMeta(item.model);
    return `
      <g class="quartile-row ${index % 2 ? "quartile-row-alt" : ""}">
        <rect x="${insetX + 1}" y="${rowTop}" width="${insetWidth - 2}" height="${rowHeight}"></rect>
        <line x1="${insetX + 10}" x2="${insetX + insetWidth - 10}" y1="${rowTop}" y2="${rowTop}" class="quartile-rule"></line>
        <circle class="quartile-marker ${meta.colorClass}" cx="${insetX + 14}" cy="${rowY - 4}" r="4"></circle>
        <text x="${insetX + 24}" y="${rowY}" text-anchor="start" class="quartile-model">${meta.short}</text>
        <text x="${insetX + 171}" y="${rowY}" text-anchor="end">${fmtLoss(item.q25)}</text>
        <text x="${insetX + 231}" y="${rowY}" text-anchor="end" class="quartile-median">${fmtLoss(item.q50)}</text>
        <text x="${insetX + 293}" y="${rowY}" text-anchor="end">${fmtLoss(item.q75)}</text>
      </g>`;
  }).join("");
  const quartileInset = `
    <g class="quartile-inset">
      <rect x="${insetX}" y="${insetY}" width="${insetWidth}" height="${insetHeight}" rx="10"></rect>
      <text x="${insetX + 10}" y="${insetY + 18}" text-anchor="start" class="quartile-title">Loss distribution quartiles</text>
      <text x="${insetX + 24}" y="${insetY + 40}" text-anchor="start" class="quartile-header">Method</text>
      <text x="${insetX + 171}" y="${insetY + 40}" text-anchor="end" class="quartile-header">25th</text>
      <text x="${insetX + 231}" y="${insetY + 40}" text-anchor="end" class="quartile-header">Median</text>
      <text x="${insetX + 293}" y="${insetY + 40}" text-anchor="end" class="quartile-header">75th</text>
      ${quartileRows}
    </g>`;

  host.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Kernel density plot of relative revenue loss by method">
      <g class="hist-legend">${legend}</g>
      <g class="hist-axis">${xAxis}${yAxis}</g>
      <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <g>${paths}</g>
      ${quartileInset}
      <text x="${margin.left + plotWidth / 2}" y="${height - 2}" text-anchor="middle" class="axis-title">Relative revenue loss</text>
      <text x="16" y="${margin.top + plotHeight / 2}" text-anchor="middle" class="axis-title" transform="rotate(-90 16 ${margin.top + plotHeight / 2})">Probability density</text>
    </svg>`;
}

function renderCdfPlot(completed) {
  const allLosses = models.flatMap(model => modelLosses(completed, model));
  const host = document.querySelector("#lossCdf");
  if (!allLosses.length) {
    host.innerHTML = `<p class="quiet">No complete matched cases available for CDF comparison.</p>`;
    return;
  }

  const width = 920;
  const height = 330;
  const margin = { top: 42, right: 24, bottom: 44, left: 68 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const { domainMax } = lossPlotDomain(allLosses);
  const points = 150;
  const grid = Array.from({ length: points }, (_, index) => index / (points - 1) * domainMax);
  const x = value => margin.left + (value / domainMax) * plotWidth;
  const y = value => margin.top + plotHeight - value * plotHeight;
  const xTicks = [0, domainMax / 4, domainMax / 2, domainMax * 3 / 4, domainMax];
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  const paths = models.map(model => {
    const values = modelLosses(completed, model).sort((a, b) => a - b);
    let pointer = 0;
    const curve = grid.map(xValue => {
      while (pointer < values.length && values[pointer] <= xValue) pointer += 1;
      return values.length ? pointer / values.length : 0;
    });
    const d = curve.map((share, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${x(grid[index]).toFixed(2)},${y(share).toFixed(2)}`;
    }).join(" ");
    return `<path class="density-line ${modelMeta(model).colorClass}" d="${d}"></path>`;
  }).join("");

  const xAxis = xTicks.map(tick => {
    const tx = x(tick);
    return `
      <g>
        <line x1="${tx.toFixed(2)}" x2="${tx.toFixed(2)}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="grid-line"></line>
        <text x="${tx.toFixed(2)}" y="${height - 16}" text-anchor="middle">${fmtLoss(tick)}</text>
      </g>`;
  }).join("");
  const yAxis = yTicks.map(tick => {
    const ty = y(tick);
    return `
      <g>
        <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${ty.toFixed(2)}" y2="${ty.toFixed(2)}" class="grid-line"></line>
        <text x="${margin.left - 10}" y="${(ty + 4).toFixed(2)}" text-anchor="end">${fmtPct(tick)}</text>
      </g>`;
  }).join("");
  const legend = models.map((model, index) => {
    const meta = modelMeta(model);
    const lx = margin.left + index * 168;
    return `
      <g>
        <line class="density-legend ${meta.colorClass}" x1="${lx}" x2="${lx + 18}" y1="13" y2="13"></line>
        <text x="${lx + 25}" y="17">${model}</text>
      </g>`;
  }).join("");

  host.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="CDF plot of relative revenue loss by model">
      <g class="hist-legend">${legend}</g>
      <g class="hist-axis">${xAxis}${yAxis}</g>
      <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <g>${paths}</g>
      <text x="${margin.left + plotWidth / 2}" y="${height - 2}" text-anchor="middle" class="axis-title">Relative revenue loss</text>
      <text x="16" y="${margin.top + plotHeight / 2}" text-anchor="middle" class="axis-title" transform="rotate(-90 16 ${margin.top + plotHeight / 2})">Share at or below loss</text>
    </svg>`;
}

function renderDifferenceDensityPlot(completed) {
  const pairs = [
    { modelA: "Gemini 2.5 Flash", modelB: "Claude Haiku 4.5", colorClass: "pair-three" },
    { modelA: "Gemini 2.5 Flash", modelB: "GPT-5 mini", colorClass: "pair-one" },
  ];
  const pairDiffSets = pairs.map(pair => pairedDiffs(completed, pair.modelA, pair.modelB));
  const allDiffs = pairDiffSets.flat();
  const host = document.querySelector("#diffDensity");
  if (!allDiffs.length) {
    host.innerHTML = `<p class="quiet">No paired differences available for the selected cases.</p>`;
    return;
  }

  const width = 920;
  const height = 330;
  const margin = { top: 42, right: 24, bottom: 44, left: 68 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const domainMin = -0.10;
  const domainMax = 0.10;
  const points = 160;
  const grid = Array.from({ length: points }, (_, index) => domainMin + index / (points - 1) * (domainMax - domainMin));

  const densitySets = pairDiffSets.map((values, index) => {
    const sd = stddev(values);
    const silverman = Number.isFinite(sd) && values.length > 1 ? 1.06 * sd * values.length ** -0.2 : (domainMax - domainMin) / 20;
    const bandwidth = Math.max(silverman, (domainMax - domainMin) / 100, 0.0005);
    const normalizer = values.length * bandwidth * Math.sqrt(2 * Math.PI);
    const curve = grid.map(xValue => {
      const sum = values.reduce((acc, value) => {
        const z = (xValue - value) / bandwidth;
        return acc + Math.exp(-0.5 * z * z);
      }, 0);
      return normalizer ? sum / normalizer : 0;
    });
    return { index, curve, colorClass: pairs[index].colorClass };
  });

  const maxDensity = Math.max(...densitySets.flatMap(item => item.curve), 0.01);
  const x = value => margin.left + ((value - domainMin) / (domainMax - domainMin)) * plotWidth;
  const y = value => margin.top + plotHeight - (value / maxDensity) * plotHeight;
  const xTicks = [-0.10, -0.05, 0, 0.05, 0.10];
  const yTicks = [0, maxDensity / 2, maxDensity];
  const paths = densitySets.map(item => {
    const d = item.curve.map((density, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${x(grid[index]).toFixed(2)},${y(density).toFixed(2)}`;
    }).join(" ");
    return `<path class="density-line ${item.colorClass}" d="${d}"></path>`;
  }).join("");
  const xAxis = xTicks.map(tick => {
    const tx = x(tick);
    return `
      <g>
        <line x1="${tx.toFixed(2)}" x2="${tx.toFixed(2)}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="${tick === 0 ? "zero-line" : "grid-line"}"></line>
        <text x="${tx.toFixed(2)}" y="${height - 16}" text-anchor="middle">${fmtSignedLoss(tick)}</text>
      </g>`;
  }).join("");
  const yAxis = yTicks.map(tick => {
    const ty = y(tick);
    return `
      <g>
        <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${ty.toFixed(2)}" y2="${ty.toFixed(2)}" class="grid-line"></line>
        <text x="${margin.left - 10}" y="${(ty + 4).toFixed(2)}" text-anchor="end">${tick.toFixed(1)}</text>
      </g>`;
  }).join("");
  const legend = pairs.map((pair, index) => {
    const lx = margin.left + index * 168;
    return `
      <g>
        <line class="density-legend ${pair.colorClass}" x1="${lx}" x2="${lx + 18}" y1="13" y2="13"></line>
        <text x="${lx + 25}" y="17">${pairLabel(pair.modelA, pair.modelB)}</text>
      </g>`;
  }).join("");

  host.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Density plot of Gemini paired relative revenue loss differences from minus ten to plus ten percent">
      <g class="hist-legend">${legend}</g>
      <g class="hist-axis">${xAxis}${yAxis}</g>
      <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <g>${paths}</g>
      <text x="${margin.left + plotWidth / 2}" y="${height - 2}" text-anchor="middle" class="axis-title">Paired difference in relative revenue loss</text>
      <text x="16" y="${margin.top + plotHeight / 2}" text-anchor="middle" class="axis-title" transform="rotate(-90 16 ${margin.top + plotHeight / 2})">Density</text>
    </svg>`;
}

function renderWithinDifferenceDensityPlot(diffs, label) {
  const host = document.querySelector("#withinDiffDensity");
  if (!diffs.length) {
    host.innerHTML = `<p class="quiet">No matched within-LLM pairs for this selection.</p>`;
    return;
  }

  const width = 920;
  const height = 330;
  const margin = { top: 42, right: 24, bottom: 44, left: 68 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const qLow = quantile(diffs, 0.01);
  const qHigh = quantile(diffs, 0.99);
  const spread = Math.max(qHigh - qLow, 0.001);
  const domainMin = Math.min(0, qLow - spread * 0.08);
  const domainMax = Math.max(0.001, qHigh + spread * 0.08);
  const points = 160;
  const grid = Array.from({ length: points }, (_, index) => domainMin + index / (points - 1) * (domainMax - domainMin));
  const sd = stddev(diffs);
  const silverman = Number.isFinite(sd) && diffs.length > 1 ? 1.06 * sd * diffs.length ** -0.2 : (domainMax - domainMin) / 20;
  const bandwidth = Math.max(silverman, (domainMax - domainMin) / 100, 0.0005);
  const normalizer = diffs.length * bandwidth * Math.sqrt(2 * Math.PI);
  const curve = grid.map(xValue => {
    const sum = diffs.reduce((acc, value) => {
      const z = (xValue - value) / bandwidth;
      return acc + Math.exp(-0.5 * z * z);
    }, 0);
    return normalizer ? sum / normalizer : 0;
  });
  const maxDensity = Math.max(...curve, 0.01);
  const x = value => margin.left + ((value - domainMin) / (domainMax - domainMin)) * plotWidth;
  const y = value => margin.top + plotHeight - (value / maxDensity) * plotHeight;
  const rawTicks = [domainMin, domainMin / 2, 0, domainMax / 2, domainMax];
  const xTicks = [...new Set(rawTicks.map(tick => Number(tick.toFixed(6))))].sort((a, b) => a - b);
  const yTicks = [0, maxDensity / 2, maxDensity];
  const path = curve.map((density, index) => {
    const command = index === 0 ? "M" : "L";
    return `${command}${x(grid[index]).toFixed(2)},${y(density).toFixed(2)}`;
  }).join(" ");
  const xAxis = xTicks.map(tick => {
    const tx = x(tick);
    return `
      <g>
        <line x1="${tx.toFixed(2)}" x2="${tx.toFixed(2)}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="${tick === 0 ? "zero-line" : "grid-line"}"></line>
        <text x="${tx.toFixed(2)}" y="${height - 16}" text-anchor="middle">${fmtSignedLoss(tick)}</text>
      </g>`;
  }).join("");
  const yAxis = yTicks.map(tick => {
    const ty = y(tick);
    return `
      <g>
        <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${ty.toFixed(2)}" y2="${ty.toFixed(2)}" class="grid-line"></line>
        <text x="${margin.left - 10}" y="${(ty + 4).toFixed(2)}" text-anchor="end">${tick.toFixed(1)}</text>
      </g>`;
  }).join("");

  host.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Density plot of within-model paired differences">
      <g class="hist-legend">
        <line class="density-legend pair-one" x1="${margin.left}" x2="${margin.left + 18}" y1="13" y2="13"></line>
        <text x="${margin.left + 25}" y="17">${label}</text>
      </g>
      <g class="hist-axis">${xAxis}${yAxis}</g>
      <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <path class="density-line pair-one" d="${path}"></path>
      <text x="${margin.left + plotWidth / 2}" y="${height - 2}" text-anchor="middle" class="axis-title">Paired difference in relative revenue loss</text>
      <text x="16" y="${margin.top + plotHeight / 2}" text-anchor="middle" class="axis-title" transform="rotate(-90 16 ${margin.top + plotHeight / 2})">Density</text>
    </svg>`;
}

function signTestPValue(winsA, winsB) {
  const n = winsA + winsB;
  if (!n) return NaN;
  const z = (Math.abs(winsA - n / 2) - 0.5) / Math.sqrt(n / 4);
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.max(0, z)))));
}

function pairedDifferenceEvidenceFromDiffs(diffs, seed) {
  const n = diffs.length;
  const avg = mean(diffs);
  const sd = stddev(diffs);
  const se = Number.isFinite(sd) && n ? sd / Math.sqrt(n) : NaN;
  const t = Number.isFinite(se) && se > 0 ? avg / se : NaN;
  const tP = Number.isFinite(t) ? 2 * (1 - normalCdf(Math.abs(t))) : NaN;
  const random = seededRandom(seed);
  const reps = 1500;
  const bootMeans = [];
  if (n) {
    for (let rep = 0; rep < reps; rep += 1) {
      let total = 0;
      for (let i = 0; i < n; i += 1) {
        total += diffs[Math.floor(random() * n)];
      }
      bootMeans.push(total / n);
    }
  }
  bootMeans.sort((a, b) => a - b);
  const winsA = diffs.filter(value => value < 0).length;
  const winsB = diffs.filter(value => value > 0).length;
  const ties = diffs.filter(value => value === 0).length;
  return {
    n,
    meanDiff: avg,
    medianDiff: median(diffs),
    p25Diff: quantile(diffs, 0.25),
    p75Diff: quantile(diffs, 0.75),
    winsA,
    winsB,
    ties,
    winRateA: n ? winsA / n : NaN,
    winRateB: n ? winsB / n : NaN,
    tieRate: n ? ties / n : NaN,
    tP,
    bootLow: bootMeans.length ? bootMeans[Math.floor(0.025 * (bootMeans.length - 1))] : NaN,
    bootHigh: bootMeans.length ? bootMeans[Math.floor(0.975 * (bootMeans.length - 1))] : NaN,
    signP: signTestPValue(winsA, winsB),
  };
}

function pairedDifferenceEvidence(caseRows, modelA, modelB, seed) {
  return pairedDifferenceEvidenceFromDiffs(pairedDiffs(caseRows, modelA, modelB), seed);
}

function ksTest(valuesA, valuesB) {
  const a = [...valuesA].filter(Number.isFinite).sort((x, y) => x - y);
  const b = [...valuesB].filter(Number.isFinite).sort((x, y) => x - y);
  const nA = a.length;
  const nB = b.length;
  let i = 0;
  let j = 0;
  let d = 0;
  while (i < nA || j < nB) {
    const nextA = i < nA ? a[i] : Infinity;
    const nextB = j < nB ? b[j] : Infinity;
    const value = Math.min(nextA, nextB);
    while (i < nA && a[i] <= value) i += 1;
    while (j < nB && b[j] <= value) j += 1;
    d = Math.max(d, Math.abs(i / nA - j / nB));
  }
  const effectiveN = nA && nB ? (nA * nB) / (nA + nB) : NaN;
  const lambda = Number.isFinite(effectiveN) ? (Math.sqrt(effectiveN) + 0.12 + 0.11 / Math.sqrt(effectiveN)) * d : NaN;
  let p = NaN;
  if (Number.isFinite(lambda)) {
    let sum = 0;
    for (let k = 1; k <= 100; k += 1) {
      const term = 2 * (-1) ** (k - 1) * Math.exp(-2 * k * k * lambda * lambda);
      sum += term;
      if (Math.abs(term) < 1e-8) break;
    }
    p = Math.max(0, Math.min(1, sum));
  }
  return { n: Math.min(nA, nB), d, p };
}

function renderTests() {
  populateTestFilterControls();
  const cases = comparableCases(passesTestFilters);
  const completed = completeCases(cases);
  const benchmarkCases = completed.filter(caseRows => Number.isFinite(heuristicLoss(caseRows)));
  const activeFilters = activeTestFilterLabels();
  document.querySelector("#caseCount").textContent = fmtInt(cases.length);
  document.querySelector("#completeCount").textContent = fmtInt(completed.length);
  document.querySelector("#sourceCount").textContent = fmtInt(rows.length);
  document.querySelector("#testsNote").innerHTML =
    `<strong>${fmtInt(completed.length)} complete paired LLM cases</strong><span>${activeFilters.length ? activeFilters.join(" · ") : "All scenarios selected"}. Heuristic mean loss uses ${fmtInt(benchmarkCases.length)} of those same cases with a valid heuristic benchmark. Mean differences are first method minus second method; negative values favor the first method.</span>`;

  renderDensityPlot(completed);
  renderCdfPlot(completed);
  renderDifferenceDensityPlot(completed);

  const modelPairResults = modelPairs().map(([modelA, modelB], index) => ({
    modelA,
    modelB,
    result: pairedDifferenceEvidence(completed, modelA, modelB, 92821 + index * 101),
  }));

  const heuristicPairResults = models.map((model, index) => ({
    modelA: model,
    modelB: HEURISTIC_LABEL,
    result: pairedBenchmarkEvidence(benchmarkCases, model, HEURISTIC_LABEL, 94421 + index * 101),
  }));
  const pairResults = [...modelPairResults, ...heuristicPairResults];

  const benchmarkMethods = [...models, HEURISTIC_LABEL];
  const modelQuantiles = benchmarkMethods.map(model => {
    const losses = benchmarkLosses(model === HEURISTIC_LABEL ? benchmarkCases : completed, model);
    return {
      model,
      n: losses.length,
      meanLoss: mean(losses),
      q25: quantile(losses, 0.25),
      q50: quantile(losses, 0.5),
      q75: quantile(losses, 0.75),
    };
  });
  const bestMean = [...modelQuantiles]
    .filter(item => Number.isFinite(item.meanLoss))
    .sort((a, b) => a.meanLoss - b.meanLoss)[0]?.model;

  document.querySelector("#acrossPairMeanBars").innerHTML = renderAcrossMeanChart(
    ACROSS_CHART_ORDER
      .map(method => modelQuantiles.find(item => item.model === method))
      .filter(Boolean)
      .map(item => ({
        model: item.model,
        n: item.n,
        meanLoss: item.meanLoss,
      }))
  );

  document.querySelector("#acrossDistributionMeanBars").innerHTML = renderAcrossDistributionMeanPanels(completed);

  document.querySelector("#acrossDirectionAll").innerHTML = renderDirectionBars(models.map(model => ({
    label: model,
    rows: cases.map(caseRows => caseRows[model]).filter(row => row.answered),
  })));

  document.querySelector("#acrossDirectionMatched").innerHTML = renderDirectionBars(models.map(model => ({
    label: model,
    rows: completed.map(caseRows => caseRows[model]),
  })));

  document.querySelector("#acrossMeanTable tbody").innerHTML = modelQuantiles.map(item => `
    <tr>
      <th>${item.model}</th>
      <td>${fmtInt(item.n)}</td>
      <td class="${item.model === bestMean ? "winner-cell" : ""}">${fmtLoss(item.meanLoss)}</td>
    </tr>`).join("");

  document.querySelector("#acrossPairTestsTable tbody").innerHTML = pairResults.map(({ modelA, modelB, result }) => {
    return `
      <tr>
        <th>${pairLabel(modelA, modelB)}</th>
        <td>${fmtInt(result.n)}</td>
        <td class="${sigClass(result.tP)}">${fmtSignedLoss(result.meanDiff)}</td>
        <td class="${sigClass(result.tP)}">${fmtP(result.tP)}</td>
        <td>${fmtSignedLoss(result.bootLow)} to ${fmtSignedLoss(result.bootHigh)}</td>
      </tr>`;
  }).join("");

  document.querySelector("#pairedDiffTable tbody").innerHTML = pairResults.map(({ modelA, modelB, result }) => `
    <tr>
      <th>${pairLabel(modelA, modelB)}</th>
      <td>${fmtInt(result.n)}</td>
      <td class="${sigClass(result.tP)}">${fmtSignedLoss(result.meanDiff)}</td>
      <td>${fmtSignedLoss(result.medianDiff)}</td>
      <td>${fmtSignedLoss(result.p25Diff)}</td>
      <td>${fmtSignedLoss(result.p75Diff)}</td>
      <td class="${sigClass(result.tP)}">${fmtP(result.tP)}</td>
      <td>${fmtSignedLoss(result.bootLow)} to ${fmtSignedLoss(result.bootHigh)}</td>
    </tr>`).join("");

  const bestQ25 = [...modelQuantiles].filter(item => Number.isFinite(item.q25)).sort((a, b) => a.q25 - b.q25)[0]?.model;
  const bestQ50 = [...modelQuantiles].filter(item => Number.isFinite(item.q50)).sort((a, b) => a.q50 - b.q50)[0]?.model;
  const bestQ75 = [...modelQuantiles].filter(item => Number.isFinite(item.q75)).sort((a, b) => a.q75 - b.q75)[0]?.model;
  document.querySelector("#quantileTable tbody").innerHTML = modelQuantiles.map(item => `
    <tr>
      <th>${item.model}</th>
      <td class="${item.model === bestQ25 ? "winner-cell" : ""}">${fmtLoss(item.q25)}</td>
      <td class="${item.model === bestQ50 ? "winner-cell" : ""}">${fmtLoss(item.q50)}</td>
      <td class="${item.model === bestQ75 ? "winner-cell" : ""}">${fmtLoss(item.q75)}</td>
    </tr>`).join("");
}

function renderWithinTests() {
  populateWithinTestControls();
  const allMode = selectedWithinTestLevelA === WITHIN_ALL_LEVEL;
  const labelA = withinLevelLabel(selectedWithinTestField, selectedWithinTestLevelA);
  const labelB = withinLevelLabel(selectedWithinTestField, selectedWithinTestLevelB);
  const comparison = `${labelA} - ${labelB}`;
  const comparisons = allMode
    ? concreteWithinAllSelections(selectedWithinTestModels, selectedWithinTestField)
    : [{ a: selectedWithinTestLevelA, b: selectedWithinTestLevelB }];
  const panelData = comparisons.flatMap((comparisonItem, comparisonIndex) =>
    selectedWithinTestModels.map((model, modelIndex) => {
      const pairs = withinMatchedPairsFor(model, selectedWithinTestField, comparisonItem.a, comparisonItem.b);
      const diffs = pairs.map(pair => pair.a.rel_rev_loss - pair.b.rel_rev_loss).filter(Number.isFinite);
      return {
        model,
        comparison: comparisonItem,
        comparisonLabel: `${withinLevelLabel(selectedWithinTestField, comparisonItem.a)} - ${withinLevelLabel(selectedWithinTestField, comparisonItem.b)}`,
        pairs,
        diffs,
        evidence: pairedDifferenceEvidenceFromDiffs(diffs, 38177 + comparisonIndex * 997 + modelIndex * 97),
      };
    })
  );
  const totalPairs = panelData.reduce((sum, item) => sum + item.pairs.length, 0);

  document.querySelector("#caseCount").textContent = fmtInt(totalPairs);
  document.querySelector("#completeCount").textContent = fmtInt(totalPairs);
  document.querySelector("#sourceCount").textContent = fmtInt(rows.length);
  const pooledNote = allMode
    ? `${labelA} shows each concrete ${GROUP_OPTIONS[selectedWithinTestField].toLowerCase()} level once, with that level compared against the pool of the remaining matched levels.`
    : "The controls only show level pairs that have exact matches for the selected LLMs.";
  document.querySelector("#withinTestsNote").innerHTML =
    `<strong>${fmtInt(totalPairs)} matched within-model pairs</strong><span>${allMode ? `Comparing <strong>${GROUP_OPTIONS[selectedWithinTestField]}</strong> across all available levels.` : `Comparing <strong>${GROUP_OPTIONS[selectedWithinTestField]}</strong> levels ${labelA} and ${labelB}.`} ${pooledNote} Each pair is identical on every benchmark input column except ${GROUP_OPTIONS[selectedWithinTestField]}; <code>variant</code> is ignored because it labels the condition.</span>`;

  const combinedItems = panelData.map(({ model, pairs, evidence, comparison: comparisonItem, comparisonLabel }) => ({
    title: allMode ? `${modelMeta(model).short} · ${comparisonLabel}` : modelMeta(model).short,
    leftLabel: withinLevelLabel(selectedWithinTestField, comparisonItem.a),
    rightLabel: withinLevelLabel(selectedWithinTestField, comparisonItem.b),
    leftMean: mean(pairs.map(pair => pair.a.rel_rev_loss).filter(Number.isFinite)),
    rightMean: mean(pairs.map(pair => pair.b.rel_rev_loss).filter(Number.isFinite)),
    leftClass: "pair-one",
    rightClass: "pair-two",
    pValue: evidence.tP,
  }));
  document.querySelector("#withinTestCombinedTitle").textContent = allMode
    ? `${GROUP_OPTIONS[selectedWithinTestField]}: each level once against the rest`
    : `${GROUP_OPTIONS[selectedWithinTestField]}: matched mean loss`;
  document.querySelector("#withinTestCombinedNote").textContent = allMode
    ? `${fmtInt(comparisons.length)} concrete levels shown once across the selected LLMs${selectedWithinTestField === "env_hint" ? "; seasonal cases only" : ""}`
    : selectedWithinTestField === "env_hint"
      ? `${labelA} and ${labelB} shown side by side for each LLM; seasonal cases only`
      : `${labelA} and ${labelB} shown side by side for each LLM`;
  document.querySelector("#withinTestCombinedChart").innerHTML = renderPairMeanCards(combinedItems, {
    fixedAxis: ["role", "product_context", "history_length", "sigma", "env_hint", "dist_hint_applied"].includes(selectedWithinTestField),
    showPValues: false,
    showValues: true,
  });

  document.querySelector("#withinTestPanels").innerHTML = panelData.map(({ model, pairs, evidence, comparisonLabel, comparison: comparisonItem }) => {
    const levelRows = [
      { level: withinLevelLabel(selectedWithinTestField, comparisonItem.a), rows: pairs.map(pair => pair.a) },
      { level: withinLevelLabel(selectedWithinTestField, comparisonItem.b), rows: pairs.map(pair => pair.b) },
    ].map(item => {
      const losses = item.rows.map(row => row.rel_rev_loss).filter(Number.isFinite);
      return {
        level: item.level,
        n: losses.length,
        meanLoss: mean(losses),
        q25: quantile(losses, 0.25),
        q50: quantile(losses, 0.5),
        q75: quantile(losses, 0.75),
      };
    });
    const bestMean = [...levelRows].filter(item => Number.isFinite(item.meanLoss)).sort((a, b) => a.meanLoss - b.meanLoss)[0]?.level;
    const bestQ25 = [...levelRows].filter(item => Number.isFinite(item.q25)).sort((a, b) => a.q25 - b.q25)[0]?.level;
    const bestQ50 = [...levelRows].filter(item => Number.isFinite(item.q50)).sort((a, b) => a.q50 - b.q50)[0]?.level;
    const bestQ75 = [...levelRows].filter(item => Number.isFinite(item.q75)).sort((a, b) => a.q75 - b.q75)[0]?.level;
    const meta = modelMeta(model);

    return `
      <article class="card within-test-card">
        <div class="model-card-top">
          <span class="model-dot ${meta.colorClass}"></span>
          <div>
            <h2>${model}</h2>
            <p>${fmtInt(pairs.length)} matched pairs · ${comparisonLabel}</p>
          </div>
        </div>
        <div class="table-wrap compact-table">
          <table>
            <thead>
              <tr>
                <th>Level</th>
                <th>N</th>
                <th>Mean</th>
              </tr>
            </thead>
            <tbody>
              ${levelRows.map(item => `
                <tr>
                  <th>${item.level}</th>
                  <td>${fmtInt(item.n)}</td>
                  <td class="${item.level === bestMean ? "winner-cell" : ""}">${fmtLoss(item.meanLoss)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="card-heading compact-heading">
          <h2>Mean-loss bars</h2>
          <span>p = ${fmtP(evidence.tP)}</span>
        </div>
        <div class="pair-mean-grid single">
          ${renderPairMeanCards([{
            title: comparisonLabel,
            leftLabel: levelRows[0]?.level,
            rightLabel: levelRows[1]?.level,
            leftMean: levelRows[0]?.meanLoss,
            rightMean: levelRows[1]?.meanLoss,
            leftClass: "pair-one",
            rightClass: "pair-two",
            pValue: evidence.tP,
          }], {
            fixedAxis: ["role", "product_context", "history_length", "sigma", "env_hint", "dist_hint_applied"].includes(selectedWithinTestField),
            showPValues: false,
            showValues: true,
          })}
        </div>
        <div class="card-heading compact-heading">
          <h2>Under / equal / over pricing</h2>
          <span>Matched pairs only</span>
        </div>
        <div class="direction-list compact-direction">
          ${renderDirectionBars([
            { label: labelA, rows: pairs.map(pair => pair.a) },
            { label: labelB, rows: pairs.map(pair => pair.b) },
          ])}
        </div>
        <div class="table-wrap compact-table">
          <table>
            <thead>
              <tr>
                <th>Pairwise test</th>
                <th>Mean diff</th>
                <th>First wins</th>
                <th>T p-value</th>
                <th>Bootstrap 95% CI</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>${comparisonLabel}</th>
                <td class="${sigClass(evidence.tP)}">${fmtSignedLoss(evidence.meanDiff)}</td>
                <td>${fmtPct(evidence.winRateA)}</td>
                <td class="${sigClass(evidence.tP)}">${fmtP(evidence.tP)}</td>
                <td>${fmtSignedLoss(evidence.bootLow)} to ${fmtSignedLoss(evidence.bootHigh)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="table-wrap compact-table">
          <table>
            <thead>
              <tr>
                <th>Level</th>
                <th>Q1</th>
                <th>Median</th>
                <th>Q3</th>
              </tr>
            </thead>
            <tbody>
              ${levelRows.map(item => `
                <tr>
                  <th>${item.level}</th>
                  <td class="${item.level === bestQ25 ? "winner-cell" : ""}">${fmtLoss(item.q25)}</td>
                  <td class="${item.level === bestQ50 ? "winner-cell" : ""}">${fmtLoss(item.q50)}</td>
                  <td class="${item.level === bestQ75 ? "winner-cell" : ""}">${fmtLoss(item.q75)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </article>`;
  }).join("");
}

function renderAcross() {
  populateControls();
  const cases = comparableCases();
  const completed = completeCases(cases);
  const summaries = modelSummary(cases);
  const bestMean = [...summaries].filter(item => Number.isFinite(item.meanLoss)).sort((a, b) => a.meanLoss - b.meanLoss)[0];
  const bestMedian = [...summaries].filter(item => Number.isFinite(item.medianLoss)).sort((a, b) => a.medianLoss - b.medianLoss)[0];
  const winners = new Map(models.map(model => [model, 0]));
  let ties = 0;
  completed.forEach(caseRows => {
    const winner = caseWinner(caseRows);
    if (winner === "Tie") ties += 1;
    else winners.set(winner, winners.get(winner) + 1);
  });

  document.querySelector("#caseCount").textContent = fmtInt(cases.length);
  document.querySelector("#completeCount").textContent = fmtInt(completed.length);
  document.querySelector("#sourceCount").textContent = fmtInt(rows.length);
  document.querySelector("#acrossNote").innerHTML =
    `<strong>${fmtInt(cases.length)} matched inputs</strong><span>Each row is matched by the normalized benchmark-input key. Mean loss and wins use only the ${fmtInt(completed.length)} cases where every model has a numeric answer and relative revenue loss.</span>`;

  document.querySelector("#acrossKpis").innerHTML = [
    kpi("Matched cases", fmtInt(cases.length), "Same input rows across all models"),
    kpi("Complete cases", fmtInt(completed.length), `${fmtPct(cases.length ? completed.length / cases.length : NaN)} of matched cases`),
    kpi("Best mean loss", bestMean ? `${modelMeta(bestMean.model).short} · ${fmtLoss(bestMean.meanLoss)}` : "-", "Lower is better"),
    kpi("Best median loss", bestMedian ? `${modelMeta(bestMedian.model).short} · ${fmtLoss(bestMedian.medianLoss)}` : "-", "Lower is better"),
  ].join("");

  const maxLoss = Math.max(...summaries.map(item => item.meanLoss).filter(Number.isFinite), 0.000001);
  document.querySelector("#meanLossBars").innerHTML = bars(summaries.map(item => ({
    label: item.model,
    value: item.meanLoss,
    className: modelMeta(item.model).colorClass,
  })), fmtLoss, maxLoss);

  document.querySelector("#medianLossBars").innerHTML = bars(summaries.map(item => ({
    label: item.model,
    value: item.medianLoss,
    className: modelMeta(item.model).colorClass,
  })), fmtLoss);

  document.querySelector("#answerBars").innerHTML = bars(summaries.map(item => ({
    label: item.model,
    value: item.answerRate,
    className: modelMeta(item.model).colorClass,
  })), fmtPct, 1);

  const winItems = [
    ...models.map(model => ({
      label: model,
      value: completed.length ? winners.get(model) / completed.length : NaN,
      className: modelMeta(model).colorClass,
    })),
    { label: "Ties", value: completed.length ? ties / completed.length : NaN, className: "model-tie" },
  ];
  document.querySelector("#winBars").innerHTML = bars(winItems, fmtPct, 1);

  document.querySelector("#summaryTable tbody").innerHTML = summaries.map(item => `
    <tr>
      <th>${item.model}</th>
      <td>${fmtInt(item.answered)}</td>
      <td>${fmtPct(item.answerRate)}</td>
      <td>${fmtLoss(item.meanLoss)}</td>
      <td>${fmtLoss(item.medianLoss)}</td>
      <td>${fmtLoss(item.p75Loss)}</td>
      <td>${fmtLoss(item.p90Loss)}</td>
      <td>${fmtPct(completed.length ? winners.get(item.model) / completed.length : NaN)}</td>
    </tr>`).join("");

  renderHistogram(completed);
  renderGroupedTable(completed);
}

function renderGroupedTable(completed) {
  const groups = new Map();
  completed.forEach(caseRows => {
    const representative = caseRows[models[0]];
    const level = levelValue(representative[selectedGroup]);
    const groupCases = groups.get(level) || [];
    groupCases.push(caseRows);
    groups.set(level, groupCases);
  });

  const rowsHtml = [...groups.entries()].map(([level, groupCases]) => {
    const losses = models.map(model => ({
      model,
      value: mean(modelLosses(groupCases, model)),
    }));
    const best = [...losses].filter(item => Number.isFinite(item.value)).sort((a, b) => a.value - b.value)[0];
    return `
      <tr>
        <th>${displayLevel(level)}</th>
        <td>${fmtInt(groupCases.length)}</td>
        ${losses.map(item => `<td>${fmtLoss(item.value)}</td>`).join("")}
        <td>${best ? modelMeta(best.model).short : "-"}</td>
      </tr>`;
  }).join("");

  document.querySelector("#groupTitle").textContent = GROUP_OPTIONS[selectedGroup];
  document.querySelector("#groupTable thead").innerHTML = `
    <tr>
      <th>${GROUP_OPTIONS[selectedGroup]}</th>
      <th>Complete cases</th>
      ${models.map(model => `<th>${modelMeta(model).short} mean loss</th>`).join("")}
      <th>Best</th>
    </tr>`;
  document.querySelector("#groupTable tbody").innerHTML = rowsHtml || `
    <tr><td colspan="${models.length + 3}">No complete cases in this filter.</td></tr>`;
}

function withinGroupSummaries(model) {
  const modelRows = rows.filter(row => row.model === model);
  const groups = new Map();
  modelRows.forEach(row => {
    const level = levelValue(row[selectedWithinGroup]);
    const groupRows = groups.get(level) || [];
    groupRows.push(row);
    groups.set(level, groupRows);
  });

  return [...groups.entries()].map(([level, groupRows]) => {
    const answeredRows = groupRows.filter(row => row.answered);
    const losses = answeredRows.map(row => row.rel_rev_loss).filter(Number.isFinite);
    return {
      level,
      rows: groupRows.length,
      answered: answeredRows.length,
      answerRate: groupRows.length ? answeredRows.length / groupRows.length : NaN,
      meanLoss: mean(losses),
      medianLoss: median(losses),
      p75Loss: quantile(losses, 0.75),
      p90Loss: quantile(losses, 0.90),
    };
  }).sort((a, b) => {
    const na = Number(a.level);
    const nb = Number(b.level);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return displayLevel(a.level).localeCompare(displayLevel(b.level));
  });
}

function renderWithinModelPanel(model) {
  const summaries = withinGroupSummaries(model);
  const modelRows = rows.filter(row => row.model === model);
  const answeredRows = modelRows.filter(row => row.answered);
  const finiteSummaries = summaries.filter(item => Number.isFinite(item.meanLoss));
  const best = [...finiteSummaries].sort((a, b) => a.meanLoss - b.meanLoss)[0];
  const worst = [...finiteSummaries].sort((a, b) => b.meanLoss - a.meanLoss)[0];
  const gap = best && worst ? worst.meanLoss - best.meanLoss : NaN;
  const maxMean = Math.max(...summaries.map(item => item.meanLoss).filter(Number.isFinite), 0.000001);
  const meta = modelMeta(model);
  const tableRows = summaries.map(item => `
    <tr>
      <th>${displayLevel(item.level)}</th>
      <td>${fmtInt(item.rows)}</td>
      <td>${fmtLoss(item.meanLoss)}</td>
      <td>${fmtLoss(item.medianLoss)}</td>
      <td>${fmtPct(item.answerRate)}</td>
    </tr>`).join("");

  return `
    <article class="card within-model-card">
      <div class="model-card-top">
        <span class="model-dot ${meta.colorClass}"></span>
        <div>
          <h2>${model}</h2>
          <p>${fmtInt(answeredRows.length)} answered · ${fmtPct(modelRows.length ? answeredRows.length / modelRows.length : NaN)}</p>
        </div>
      </div>
      <div class="mini-kpi-row">
        <div><span>Best group</span><strong>${best ? displayLevel(best.level) : "-"}</strong><em>${best ? fmtLoss(best.meanLoss) : "-"}</em></div>
        <div><span>Mean gap</span><strong>${fmtLoss(gap)}</strong><em>worst-best</em></div>
      </div>
      <div class="card-heading compact-heading">
        <h2>Group mean loss</h2>
        <span>${GROUP_OPTIONS[selectedWithinGroup]}</span>
      </div>
      <div class="bar-list compact-bars">
        ${bars(summaries.map(item => ({
    label: displayLevel(item.level),
    value: item.meanLoss,
    className: meta.colorClass,
  })), fmtLoss, maxMean)}
      </div>
      <div class="table-wrap compact-table">
        <table>
          <thead>
            <tr>
              <th>${GROUP_OPTIONS[selectedWithinGroup]}</th>
              <th>Rows</th>
              <th>Mean</th>
              <th>Median</th>
              <th>Answered</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </article>`;
}

function renderWithin() {
  populateWithinControls();
  document.querySelector("#withinNote").innerHTML =
    `<strong>${GROUP_OPTIONS[selectedWithinGroup]}</strong><span>Each LLM panel compares case groups within that model. Bars and table values show the mean relative revenue loss for each group level.</span>`;
  document.querySelector("#withinModelPanels").innerHTML = models.map(model =>
    renderWithinModelPanel(model)
  ).join("");
}

function render() {
  if (selectedTab === "across") renderAcross();
  if (selectedTab === "tests") renderTests();
  if (selectedTab === "withinTests") renderWithinTests();
  if (selectedTab === "within") renderWithin();
}

document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => {
  selectedTab = button.dataset.tab;
  document.querySelectorAll(".tab, .panel").forEach(el => el.classList.remove("active"));
  button.classList.add("active");
  document.querySelector(`#${selectedTab}`).classList.add("active");
  render();
}));

document.querySelector("#groupPicker").addEventListener("change", event => {
  selectedGroup = event.target.value;
  renderAcross();
});

document.querySelector("#withinGroupPicker").addEventListener("change", event => {
  selectedWithinGroup = event.target.value;
  renderWithin();
});

document.querySelectorAll("[data-test-filter]").forEach(select => {
  select.addEventListener("change", event => {
    const field = event.target.dataset.testFilter;
    if (event.target.value === "all") delete selectedTestFilters[field];
    else selectedTestFilters[field] = event.target.value;
    renderTests();
  });
});

document.querySelector("#resetTestFilters").addEventListener("click", () => {
  selectedTestFilters = {};
  renderTests();
});

document.querySelector("#withinTestModels").addEventListener("change", event => {
  selectedWithinTestModels = [...event.target.selectedOptions].map(option => option.value);
  selectedWithinTestLevelA = "";
  selectedWithinTestLevelB = "";
  renderWithinTests();
});

document.querySelector("#withinTestField").addEventListener("change", event => {
  selectedWithinTestField = event.target.value;
  selectedWithinTestLevelA = "";
  selectedWithinTestLevelB = "";
  renderWithinTests();
});

document.querySelector("#withinTestLevelA").addEventListener("change", event => {
  selectedWithinTestLevelA = event.target.value;
  if (selectedWithinTestLevelB === selectedWithinTestLevelA) selectedWithinTestLevelB = "";
  renderWithinTests();
});

document.querySelector("#withinTestLevelB").addEventListener("change", event => {
  selectedWithinTestLevelB = event.target.value;
  if (selectedWithinTestLevelA === selectedWithinTestLevelB) selectedWithinTestLevelA = "";
  renderWithinTests();
});

async function loadPayload() {
  const response = await fetch("data.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load data.json (${response.status})`);
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return { rows: data, models: [...new Set(data.map(row => row.model))] };
  }

  if (Array.isArray(data.rows)) {
    return data;
  }

  if (Array.isArray(data.parts) && data.parts.length) {
    const partPayloads = await Promise.all(
      data.parts.map(async part => {
        const partResponse = await fetch(part, { cache: "no-store" });
        if (!partResponse.ok) {
          throw new Error(`Could not load ${part} (${partResponse.status})`);
        }
        return partResponse.json();
      })
    );
    const chunkRows = partPayloads.flatMap(part => Array.isArray(part) ? part : (part.rows || []));
    return {
      ...data,
      rows: chunkRows,
      models: data.models || [...new Set(chunkRows.map(row => row.model))],
    };
  }

  return data;
}

loadPayload()
  .then(data => {
    payload = data;
    rows = payload.rows || [];
    models = payload.models || [...new Set(rows.map(row => row.model))];
    render();
  })
  .catch(error => {
    const isFileProtocol = window.location.protocol === "file:";
    const launchHint = isFileProtocol
      ? `<p>This page was opened directly from Finder, so the browser blocked access to <code>data.json</code>.</p>
         <p>Open the included <code>Open AI Pricing App.command</code> file in this folder, and keep that Terminal window open while you use the app.</p>`
      : `<p>Could not load app data: ${error.message}</p>`;
    document.querySelector("main").innerHTML = `
      <article class="card error">
        <h2>App data could not be loaded</h2>
        ${launchHint}
      </article>`;
  });
