let payload = { rows: [], models: [] };
let rows = [];
let models = [];
let rowsByModel = new Map();
let answeredRowsByModel = new Map();
let regressionResultsById = new Map();
const withinFieldCache = new Map();
const withinGroupSummaryCache = new Map();
const tTestRowCache = new Map();
const withinTTestRowCache = new Map();
const withinTTestPairSummaryCache = new Map();
const matchedLevelDiffCache = new Map();

let selectedTab = "tests";
let selectedGroup = "demand_model";
let selectedWithinGroup = "demand_model";
let selectedAcrossDemandModels = [];
let selectedDensityCutoff = "2";
let selectedOverviewFilters = {};
let selectedTestFilters = {};
let selectedWithinTestModels = [];
let selectedWithinTestField = "role";
let selectedWithinTestMode = "selected";
let selectedWithinTestLevelA = "";
let selectedWithinTestLevelB = "";
let selectedWithinTestIncludedLevels = [];
let selectedTTestMode = "models";
let selectedTTestModels = [];
let selectedTTestCompareField = "scenario_subtype";
let selectedTTestCompareLevels = [];
let selectedTTestField = "demand_model";
let selectedTTestLevels = [];
let selectedTTestWithinModels = [];
let selectedTTestWithinCompareField = "scenario_subtype";
let selectedTTestWithinCompareLevels = ["static", "seasonal"];
let selectedTTestWithinField = "demand_model";
let selectedTTestWithinLevels = [];
let selectedWithinTTestFilters = {
  scenario_subtype: ["static", "seasonal"],
};

const MODEL_META = {
  "GPT-5 mini": { colorClass: "model-gpt", short: "GPT" },
  "Gemini 2.5 Flash": { colorClass: "model-gemini", short: "Gemini" },
  "Claude Haiku 4.5": { colorClass: "model-claude", short: "Claude" },
  "Heuristic": { colorClass: "model-heuristic", short: "Heuristic" },
  "Regression Heuristic": { colorClass: "model-regression", short: "Regression Heuristic" },
};

const HEURISTIC_LABEL = "Heuristic";
const REGRESSION_LABEL = "Regression Heuristic";
const ACROSS_CHART_ORDER = ["Gemini 2.5 Flash", "Claude Haiku 4.5", "GPT-5 mini", HEURISTIC_LABEL];
const PRICE_DIRECTION_TOLERANCE = 0.05;
const NEAR_OPTIMAL_THRESHOLD = 0.05;
const SEVERE_LOSS_THRESHOLD = 0.25;

const PAIR_META = [
  { colorClass: "pair-one" },
  { colorClass: "pair-two" },
  { colorClass: "pair-three" },
];

const GROUP_OPTIONS = {
  scenario_subtype: "Scenario",
  demand_model: "Demand model",
  history_length: "History length",
  history_term: "History term",
  sigma: "Noise sigma",
  parameter_set: "Parameter set (A/B/C)",
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
  "history_term",
  "parameter_set",
  "next_env",
  "mc",
  "p_c_current",
  "role",
  "product_context",
  "dist_hint",
  "dist_hint_applied",
  "env_hint",
];
const WITHIN_TTEST_FILTER_FIELDS = Object.keys(GROUP_OPTIONS);

const WITHIN_ALL_LEVEL = "__all_levels__";
const WITHIN_ALL_COMPARISONS = "__all_comparisons__";
const WITHIN_ALL_LEVEL_LABELS = {
  scenario_subtype: "All scenarios",
  demand_model: "All demand models",
  history_length: "All history lengths",
  history_term: "All history terms",
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
const WITHIN_ALL_COMPARISONS_LABEL = "Show all levels together";
const FILTER_PLURAL_LABELS = {
  scenario_subtype: "scenarios",
  demand_model: "demand models",
  history_length: "history lengths",
  history_term: "history terms",
  sigma: "noise levels",
  parameter_set: "parameter sets",
  has_environment: "environment settings",
  next_env: "next environments",
  mc: "marginal costs",
  p_c_current: "competitor prices",
  role: "expert roles",
  product_context: "product contexts",
  dist_hint: "distribution hints",
  dist_hint_applied: "applied hint modes",
  env_hint: "environment hints",
};

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
const shareWhere = (values, predicate) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.filter(predicate).length / finite.length : NaN;
};

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

function regressionLoss(caseRows) {
  const sourceRow = Object.values(caseRows).find(row => row?.instance_id);
  const regression = sourceRow?.instance_id ? regressionResultsById.get(sourceRow.instance_id) : null;
  return regression?.fit_status !== "infeasible" && Number.isFinite(regression?.revenue_pct_gap)
    ? Math.abs(regression.revenue_pct_gap)
    : NaN;
}

function regressionIsEligible(item) {
  return item?.fit_status !== "infeasible";
}

function regressionStatus(item) {
  return regressionIsEligible(item)
    ? ""
    : `<span class="regression-status" title="${item.fit_status_reason || "Excluded from regression comparisons."}">Infeasible: excluded</span>`;
}

function benchmarkLoss(caseRows, method) {
  if (method === HEURISTIC_LABEL) return heuristicLoss(caseRows);
  if (method === REGRESSION_LABEL) return regressionLoss(caseRows);
  return caseRows[method]?.rel_rev_loss;
}

function benchmarkLosses(cases, method) {
  return cases.map(caseRows => benchmarkLoss(caseRows, method)).filter(Number.isFinite);
}

function cacheKeyPart(values) {
  return values.length ? values.join(",") : "*";
}

function dropdownStateKey(dropdown) {
  const key = dropdown?.dataset.testFilterDropdown
    || dropdown?.dataset.overviewFilterDropdown
    || dropdown?.dataset.withinTTestFilterDropdown
    || "";
  return dropdown?.closest("#tTestsAcross") && dropdown?.dataset.testFilterDropdown
    ? `t-tests-across:${key}`
    : key;
}

function captureOpenDropdownKeys() {
  return [...document.querySelectorAll(".multi-select[open]")]
    .map(dropdownStateKey)
    .filter(Boolean);
}

function restoreOpenDropdownKeys(keys) {
  if (!Array.isArray(keys) || !keys.length) return;
  keys.forEach(key => {
    const acrossTTestKey = key.startsWith("t-tests-across:")
      ? key.slice("t-tests-across:".length)
      : null;
    const dropdown = acrossTTestKey
      ? document.querySelector(`#tTestsAcross [data-test-filter-dropdown="${acrossTTestKey}"]`)
      : document.querySelector(
          `[data-test-filter-dropdown="${key}"], [data-overview-filter-dropdown="${key}"], [data-within-t-test-filter-dropdown="${key}"]`
        );
    if (dropdown) dropdown.open = true;
  });
}

function rerenderWithOpenDropdowns(renderer) {
  const openKeys = captureOpenDropdownKeys();
  renderer();
  restoreOpenDropdownKeys(openKeys);
}

function tTestFilterSignature(excludedFields = []) {
  return TEST_FILTER_FIELDS
    .filter(field => !excludedFields.includes(field))
    .map(field => `${field}=${cacheKeyPart(selectedTestFilters[field] || [])}`)
    .join("|");
}

function withinTTestFilterSignature(excludedFields = []) {
  return WITHIN_TTEST_FILTER_FIELDS
    .filter(field => !excludedFields.includes(field))
    .map(field => `${field}=${cacheKeyPart(selectedWithinTTestFilters[field] || [])}`)
    .join("|");
}

function caseRowIdentityKey(row) {
  return row.case_key || [
    ...benchmarkInputColumns().map(field => levelValue(row[field])),
    levelValue(row.variant),
    levelValue(row.instance_id),
  ].join("|");
}

function tTestRowLoss(row, method) {
  return method === HEURISTIC_LABEL ? row.heuristic_rel_rev_loss : row.rel_rev_loss;
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

function selectedWithinAllSelections(selectedModels, field) {
  const availableSelections = concreteWithinAllSelections(selectedModels, field);
  const availableLevels = availableSelections.map(item => item.b);
  selectedWithinTestIncludedLevels = selectedWithinTestIncludedLevels.filter(level => availableLevels.includes(level));
  if (!selectedWithinTestIncludedLevels.length) {
    selectedWithinTestIncludedLevels = [...availableLevels];
  }
  const selectedLevels = new Set(selectedWithinTestIncludedLevels);
  return availableSelections.filter(item => selectedLevels.has(item.b));
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

function verticalAxisTitleSvg(margin, plotHeight, label, options = {}) {
  const padding = options.padding ?? 58;
  const x = Math.max(8, margin.left - padding);
  const y = margin.top + plotHeight / 2;
  return `<text x="${x}" y="${y}" text-anchor="middle" class="axis-title" transform="rotate(-90 ${x} ${y})">${label}</text>`;
}

function truncateAxisLabel(label, maxLength = 14) {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

function renderLevelMeanBarChart(items, options = {}) {
  if (!items.length) return `<p class="quiet">No level means available.</p>`;
  const finiteMeans = items.map(item => item.value).filter(Number.isFinite);
  if (!finiteMeans.length) return `<p class="quiet">No numeric level means available.</p>`;

  const axis = percentAxisConfig(finiteMeans, {
    minimum: Math.min(0.01, Math.max(0.002, Math.max(...finiteMeans) * 0.9)),
  });
  const { yMax, yTicks } = axis;
  const width = Math.max(390, items.length * 185 + 90);
  const height = 310;
  const margin = { top: 38, right: 18, bottom: options.xAxisTitle ? 74 : 58, left: 130 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const slotWidth = plotWidth / items.length;
  const barWidth = Math.min(26, slotWidth * 0.22);
  const y = value => margin.top + plotHeight - (value / yMax) * plotHeight;
  const centers = items.map((_, index) => margin.left + slotWidth * (index + 0.5));

  const axisLines = yTicks.map(tick => {
    const ty = y(tick);
    return `
      <g>
        <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${ty.toFixed(2)}" y2="${ty.toFixed(2)}" class="grid-line"></line>
        <text x="${margin.left - 10}" y="${(ty + 4).toFixed(2)}" text-anchor="end">${fmtLoss(tick)}</text>
      </g>`;
  }).join("");

  const barsHtml = items.map((item, index) => {
    const x = centers[index] - barWidth / 2;
    const barY = y(item.value);
    const label = truncateAxisLabel(item.label, 16);
    return `
      <g>
        <title>${item.label}: ${fmtLoss(item.value)}</title>
        <rect class="${item.className || ""}" x="${x.toFixed(2)}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(margin.top + plotHeight - barY).toFixed(2)}"></rect>
        <text x="${centers[index].toFixed(2)}" y="${Math.max(margin.top + 12, barY - 7).toFixed(2)}" text-anchor="middle" class="pair-value-label">${fmtLoss(item.value)}</text>
        <text x="${centers[index].toFixed(2)}" y="${options.xAxisTitle ? height - 30 : height - 16}" text-anchor="middle" class="axis-title">${label}</text>
      </g>`;
  }).join("");

  return `
    <div class="level-mean-chart-wrap">
      <svg class="level-mean-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mean relative revenue loss by level">
        <g class="hist-axis">${axisLines}</g>
        <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis-line"></line>
        <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis-line"></line>
        <g>${barsHtml}</g>
        ${verticalAxisTitleSvg(margin, plotHeight, "Mean relative revenue loss", { padding: 76 })}
        ${options.xAxisTitle ? `<text x="${(margin.left + plotWidth / 2).toFixed(2)}" y="${height - 8}" text-anchor="middle" class="axis-title">${options.xAxisTitle}</text>` : ""}
      </svg>
    </div>`;
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
  if (relativeDeviation < -PRICE_DIRECTION_TOLERANCE) return "under";
  if (relativeDeviation > PRICE_DIRECTION_TOLERANCE) return "over";
  return "similar";
}

function benchmarkPriceDirection(caseRows, method) {
  if (method === REGRESSION_LABEL) {
    const sourceRow = Object.values(caseRows).find(row => row?.instance_id);
    const regression = sourceRow?.instance_id ? regressionResultsById.get(sourceRow.instance_id) : null;
    if (!regressionIsEligible(regression) || !Number.isFinite(regression?.p_hat) || !Number.isFinite(regression?.p_star) || regression.p_star === 0) {
      return null;
    }
    const relativeDeviation = (regression.p_hat - regression.p_star) / regression.p_star;
    if (relativeDeviation < -PRICE_DIRECTION_TOLERANCE) return "under";
    if (relativeDeviation > PRICE_DIRECTION_TOLERANCE) return "over";
    return "similar";
  }
  if (method === HEURISTIC_LABEL) {
    const sourceRow = Object.values(caseRows).find(row =>
      row?.answered && Number.isFinite(row?.heuristic_price) && Number.isFinite(row?.p_star)
    );
    if (!sourceRow || sourceRow.p_star === 0) return null;
    const relativeDeviation = (sourceRow.heuristic_price - sourceRow.p_star) / sourceRow.p_star;
    if (relativeDeviation < -PRICE_DIRECTION_TOLERANCE) return "under";
    if (relativeDeviation > PRICE_DIRECTION_TOLERANCE) return "over";
    return "similar";
  }
  return priceDirection(caseRows[method]);
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

function directionBreakdown(items) {
  return items.map(item => ({ ...item, summary: item.summary || directionSummary(item.rows || []) }));
}

function renderDirectionBars(items) {
  if (!items.length) return `<p class="quiet">No answered price rows available.</p>`;
  const summaries = directionBreakdown(items);
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
      ${verticalAxisTitleSvg(margin, plotHeight, "Share of answered prices", { padding: 70 })}
    </svg>`;
}

function renderDirectionTableRows(items) {
  const summaries = directionBreakdown(items);
  return summaries.map(item => {
    const { summary } = item;
    const share = key => summary.total ? fmtPct(summary[key] / summary.total) : "-";
    const losses = (item.losses || (item.rows || []).map(row => row.rel_rev_loss)).filter(Number.isFinite);
    const nearOptimal = losses.filter(loss => loss <= NEAR_OPTIMAL_THRESHOLD).length;
    const severeLoss = losses.filter(loss => loss >= SEVERE_LOSS_THRESHOLD).length;
    const lossShare = count => losses.length ? fmtPct(count / losses.length) : "-";
    return `
      <tr>
        <th>${item.label}</th>
        <td>${fmtInt(summary.total)}</td>
        <td>${fmtInt(summary.under)} <span class="quiet">(${share("under")})</span></td>
        <td>${fmtInt(summary.similar)} <span class="quiet">(${share("similar")})</span></td>
        <td>${fmtInt(summary.over)} <span class="quiet">(${share("over")})</span></td>
        <td>${fmtInt(nearOptimal)} <span class="quiet">(${lossShare(nearOptimal)})</span></td>
        <td>${fmtInt(severeLoss)} <span class="quiet">(${lossShare(severeLoss)})</span></td>
      </tr>`;
  }).join("");
}

function renderPairMeanCards(items, options = {}) {
  if (!items.length) return `<p class="quiet">No pairwise means available.</p>`;
  const showPValues = options.showPValues !== false;
  const showValues = options.showValues === true;
  const withinStyle = options.withinStyle === true;
  const finite = items.flatMap(item => [item.leftMean, item.rightMean]).filter(Number.isFinite);
  const maxValue = Math.max(...finite, 0.000001);
  const axis = options.yMax
    ? { yMax: options.yMax, yTicks: options.yTicks || [0, options.yMax / 2, options.yMax] }
    : percentAxisConfig(finite, { minimum: Math.min(0.01, Math.max(0.002, maxValue * 0.9)) });
  const { yMax, yTicks } = axis;
  const width = Math.max(withinStyle ? 390 : 360, items.length * 185 + 90);
  const height = withinStyle ? 310 : 300;
  const margin = withinStyle
    ? { top: 38, right: 18, bottom: 58, left: 130 }
    : { top: 34, right: 18, bottom: 58, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const groupWidth = plotWidth / items.length;
  const barWidth = withinStyle ? Math.min(24, groupWidth * 0.14) : Math.min(30, groupWidth * 0.18);
  const y = value => margin.top + plotHeight - (value / yMax) * plotHeight;
  const axisLines = yTicks.map(tick => {
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
        <text x="${(leftX + barWidth / 2).toFixed(2)}" y="${withinStyle ? height - 28 : height - 34}" text-anchor="middle">${item.leftLabel}</text>
        <text x="${(rightX + barWidth / 2).toFixed(2)}" y="${withinStyle ? height - 28 : height - 34}" text-anchor="middle">${item.rightLabel}</text>
        <text x="${center.toFixed(2)}" y="${withinStyle ? height - 5 : height - 14}" text-anchor="middle" class="axis-title">${item.title}</text>
        ${showPValues ? `<text x="${center.toFixed(2)}" y="${Math.max(margin.top + 10, pY).toFixed(2)}" text-anchor="middle" class="${sigClass(item.pValue)}">p=${fmtP(item.pValue)}</text>` : ""}
      </g>`;
  }).join("");

  return `
    <svg class="pair-mean-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pairwise mean relative revenue loss bars">
      <g class="hist-axis">${axisLines}</g>
      <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <g class="pair-mean-bars">${groups}</g>
      ${verticalAxisTitleSvg(margin, plotHeight, "Mean relative revenue loss", { padding: withinStyle ? 70 : 58 })}
    </svg>`;
}

function renderAcrossMeanChart(modelItems, options = {}) {
  if (!modelItems.length) return `<p class="quiet">No complete matched cases available.</p>`;
  const finiteMeans = modelItems.map(item => item.meanLoss).filter(Number.isFinite);
  if (!finiteMeans.length) return `<p class="quiet">No numeric mean losses available.</p>`;

  const axis = options.yMax
    ? { yMax: options.yMax, yTicks: options.yTicks || [0, options.yMax / 2, options.yMax] }
    : percentAxisConfig(finiteMeans, { minimum: Math.min(0.01, Math.max(0.002, Math.max(...finiteMeans) * 0.9)) });
  const { yMax, yTicks } = axis;
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
  const axisLines = yTicks.map(tick => {
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
      <g class="hist-axis">${axisLines}</g>
      <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <g class="pair-mean-bars">${barsHtml}</g>
      ${verticalAxisTitleSvg(margin, plotHeight, "Mean relative revenue loss")}
    </svg>`;
}

function renderAcrossRateChart(modelItems, options = {}) {
  if (!modelItems.length) return `<p class="quiet">No complete matched cases available.</p>`;
  const metricKey = options.metricKey || "rate";
  const metricLabel = options.metricLabel || "Rate";
  const finiteRates = modelItems.map(item => item[metricKey]).filter(Number.isFinite);
  if (!finiteRates.length) return `<p class="quiet">No numeric ${metricLabel.toLowerCase()} available.</p>`;

  const width = 600;
  const height = 330;
  const margin = { top: 32, right: 34, bottom: 62, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const slotWidth = plotWidth / modelItems.length;
  const barWidth = Math.min(54, slotWidth * 0.34);
  const yMax = 1;
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const y = value => margin.top + plotHeight - (value / yMax) * plotHeight;
  const centers = modelItems.map((_, index) => margin.left + slotWidth * (index + 0.5));

  const axisLines = yTicks.map(tick => {
    const ty = y(tick);
    return `
      <g>
        <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${ty.toFixed(2)}" y2="${ty.toFixed(2)}" class="grid-line"></line>
        <text x="${margin.left - 10}" y="${(ty + 4).toFixed(2)}" text-anchor="end">${fmtPct(tick)}</text>
      </g>`;
  }).join("");

  const barsHtml = modelItems.map((item, index) => {
    const value = item[metricKey];
    const x = centers[index] - barWidth / 2;
    const barY = y(value);
    return `
      <g>
        <rect class="${modelMeta(item.model).colorClass}" x="${x.toFixed(2)}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(margin.top + plotHeight - barY).toFixed(2)}"></rect>
        <text x="${centers[index].toFixed(2)}" y="${Math.max(margin.top + 12, barY - 7).toFixed(2)}" text-anchor="middle" class="pair-value-label">${fmtPct(value)}</text>
        <text x="${centers[index].toFixed(2)}" y="${height - 22}" text-anchor="middle" class="axis-title">${modelMeta(item.model).short}</text>
      </g>`;
  }).join("");

  return `
    <svg class="pair-mean-chart across-mean-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Across-method ${metricLabel.toLowerCase()} bars">
      <g class="hist-axis">${axisLines}</g>
      <line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis-line"></line>
      <g class="pair-mean-bars">${barsHtml}</g>
      ${verticalAxisTitleSvg(margin, plotHeight, metricLabel)}
    </svg>`;
}

function niceAxisStep(target) {
  if (!Number.isFinite(target) || target <= 0) return 0.001;
  const exponent = Math.floor(Math.log10(target));
  const base = 10 ** exponent;
  const multipliers = [1, 2, 2.5, 5, 10];
  for (const multiplier of multipliers) {
    const step = base * multiplier;
    if (step >= target) return step;
  }
  return base * 10;
}

function percentAxisConfig(values, options = {}) {
  const finite = values.filter(Number.isFinite).filter(value => value >= 0);
  const minimum = options.minimum ?? 0.002;
  const tickSteps = options.tickSteps ?? 3;
  const padding = options.padding ?? 1.15;
  const maxValue = finite.length ? Math.max(...finite) : 0;
  const paddedMax = Math.max(minimum, maxValue * padding);
  const step = niceAxisStep(paddedMax / tickSteps);
  const yMax = step * tickSteps;
  const yTicks = Array.from({ length: tickSteps + 1 }, (_, index) => index * step);
  return { yMax, yTicks };
}

function renderAcrossDistributionMeanPanels(caseRows, methods = ACROSS_CHART_ORDER) {
  const levels = [...new Set(caseRows.map(caseRows => levelValue(caseRows[models[0]]?.demand_model)))].sort((a, b) =>
    displayLevel(a).localeCompare(displayLevel(b))
  );
  if (!levels.length) return `<p class="quiet">No complete matched cases available.</p>`;

  return levels.map(level => {
    const cases = caseRows.filter(caseRows =>
      levelValue(caseRows[models[0]]?.demand_model) === level
      && methods.every(method => Number.isFinite(benchmarkLoss(caseRows, method)))
    );
    const items = methods.map(model => ({
      model,
      n: cases.length,
      meanLoss: mean(benchmarkLosses(cases, model)),
    }));
    return `<section class="distribution-mean-panel">
      <h3>${displayLevel(level)}</h3>
      ${renderAcrossMeanChart(items, { compact: true })}
    </section>`;
  }).join("");
}

function uniqueSorted(field, sourceRows = rows) {
  const values = [...new Set(sourceRows.map(row => levelValue(row[field])))];
  return sortLevelValues(values);
}

function sortLevelValues(values) {
  const orderedTerms = ["short_term", "medium_term", "long_term"];
  return [...values].sort((a, b) => {
    const termA = orderedTerms.indexOf(a);
    const termB = orderedTerms.indexOf(b);
    if (termA !== -1 && termB !== -1) return termA - termB;
    if (termA !== -1) return -1;
    if (termB !== -1) return 1;
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

function availableAcrossDemandModels() {
  return uniqueSorted("demand_model");
}

function syncAcrossDemandModelSelection() {
  const available = availableAcrossDemandModels();
  if (!available.length) {
    selectedAcrossDemandModels = [];
    return available;
  }

  const validSelected = selectedAcrossDemandModels.filter(value => available.includes(value));
  selectedAcrossDemandModels = validSelected.length ? validSelected : [...available];
  return available;
}

function populateAcrossDemandModelControls() {
  const available = syncAcrossDemandModelSelection();
  const host = document.querySelector("#acrossDemandModelList");
  const summary = document.querySelector("#acrossDemandModelSummary");

  if (!available.length) {
    host.innerHTML = `<p class="quiet">No demand models were found in the loaded data.</p>`;
    summary.textContent = "No demand models available";
    return;
  }

  host.innerHTML = available.map(value => `
    <label class="checkbox-chip">
      <input type="checkbox" value="${value}" ${selectedAcrossDemandModels.includes(value) ? "checked" : ""}>
      <span>${displayLevel(value)}</span>
    </label>
  `).join("");

  summary.textContent = selectedAcrossDemandModels.length === available.length
    ? `All ${fmtInt(available.length)} demand models selected`
    : `${fmtInt(selectedAcrossDemandModels.length)} of ${fmtInt(available.length)} demand models selected`;
}

function availableTestFilterValues(field) {
  return uniqueSorted(field);
}

function availableOverviewFilterValues(field) {
  return uniqueSorted(field);
}

function selectedTestFilterValues(field, available = availableTestFilterValues(field)) {
  const current = selectedTestFilters[field];
  if (!available.length) return [];
  if (!Array.isArray(current)) {
    selectedTestFilters[field] = [...available];
    return selectedTestFilters[field];
  }
  const validSelected = current.filter(value => available.includes(value));
  if (validSelected.length !== current.length) selectedTestFilters[field] = validSelected;
  return selectedTestFilters[field];
}

function selectedOverviewFilterValues(field, available = availableOverviewFilterValues(field)) {
  const current = selectedOverviewFilters[field];
  if (!available.length) return [];
  if (!Array.isArray(current)) {
    selectedOverviewFilters[field] = [...available];
    return selectedOverviewFilters[field];
  }
  const validSelected = current.filter(value => available.includes(value));
  if (validSelected.length !== current.length) selectedOverviewFilters[field] = validSelected;
  return selectedOverviewFilters[field];
}

function allFieldLabel(field) {
  return WITHIN_ALL_LEVEL_LABELS[field] || `All ${GROUP_OPTIONS[field]}`;
}

function formatTestFilterSummary(field, available, selected) {
  if (!available.length || !selected.length) return `No ${FILTER_PLURAL_LABELS[field] || GROUP_OPTIONS[field].toLowerCase()}`;
  if (selected.length === available.length) return allFieldLabel(field);
  if (selected.length === 1) return displayLevel(selected[0]);
  if (selected.length === 2) return selected.map(displayLevel).join(", ");
  return `${fmtInt(selected.length)} ${FILTER_PLURAL_LABELS[field] || "items"} selected`;
}

function populateTestFilterControl(field) {
  const available = availableTestFilterValues(field);
  const selected = selectedTestFilterValues(field, available);
  const hosts = document.querySelectorAll(`[data-test-filter-list="${field}"]`);
  const summaries = document.querySelectorAll(`[data-test-filter-summary="${field}"]`);
  const menuSummaries = document.querySelectorAll(`[data-test-filter-menu-summary="${field}"]`);

  hosts.forEach(host => {
    host.innerHTML = available.length
      ? available.map(value => `
          <label class="checkbox-chip">
            <input type="checkbox" value="${value}" ${selected.includes(value) ? "checked" : ""}>
            <span>${displayLevel(value)}</span>
          </label>
        `).join("")
      : `<p class="quiet">No ${FILTER_PLURAL_LABELS[field] || GROUP_OPTIONS[field].toLowerCase()} were found in the loaded data.</p>`;
  });
  summaries.forEach(summary => {
    summary.textContent = available.length
      ? formatTestFilterSummary(field, available, selected)
      : `No ${GROUP_OPTIONS[field].toLowerCase()}`;
  });
  menuSummaries.forEach(menuSummary => {
    menuSummary.textContent = available.length
      ? (selected.length === available.length
        ? `${allFieldLabel(field)} selected`
        : `${fmtInt(selected.length)} of ${fmtInt(available.length)} ${FILTER_PLURAL_LABELS[field] || "items"} selected`)
      : `No ${FILTER_PLURAL_LABELS[field] || GROUP_OPTIONS[field].toLowerCase()} available`;
  });
}

function setupAcrossTTestFilterPanel() {
  const panel = document.querySelector("#tTestAcrossFilterPanel");
  const source = document.querySelector("#tests .test-selection-toolbar");
  if (!panel || !source || panel.dataset.ready === "true") return;

  source.querySelectorAll(".multi-select-filter").forEach(filter => {
    panel.append(filter.cloneNode(true));
  });
  const reset = document.createElement("button");
  reset.id = "resetTTestAcrossFilters";
  reset.className = "secondary-button";
  reset.type = "button";
  reset.textContent = "Reset selection";
  panel.append(reset);
  panel.dataset.ready = "true";
}

function populateOverviewFilterControl(field) {
  const available = availableOverviewFilterValues(field);
  const selected = selectedOverviewFilterValues(field, available);
  const host = document.querySelector(`[data-overview-filter-list="${field}"]`);
  const summary = document.querySelector(`[data-overview-filter-summary="${field}"]`);
  const menuSummary = document.querySelector(`[data-overview-filter-menu-summary="${field}"]`);

  if (!host || !summary || !menuSummary) return;

  if (!available.length) {
    host.innerHTML = `<p class="quiet">No ${FILTER_PLURAL_LABELS[field] || GROUP_OPTIONS[field].toLowerCase()} were found in the loaded data.</p>`;
    summary.textContent = `No ${GROUP_OPTIONS[field].toLowerCase()}`;
    menuSummary.textContent = `No ${FILTER_PLURAL_LABELS[field] || GROUP_OPTIONS[field].toLowerCase()} available`;
    return;
  }

  host.innerHTML = available.map(value => `
    <label class="checkbox-chip">
      <input type="checkbox" value="${value}" ${selected.includes(value) ? "checked" : ""}>
      <span>${displayLevel(value)}</span>
    </label>
  `).join("");

  summary.textContent = formatTestFilterSummary(field, available, selected);
  menuSummary.textContent = selected.length === available.length
    ? `${allFieldLabel(field)} selected`
    : `${fmtInt(selected.length)} of ${fmtInt(available.length)} ${FILTER_PLURAL_LABELS[field] || "items"} selected`;
}

function populateControls() {
  const groupPicker = document.querySelector("#groupPicker");
  groupPicker.innerHTML = Object.entries(GROUP_OPTIONS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  groupPicker.value = selectedGroup;
  populateAcrossDemandModelControls();
}

function populateWithinControls() {
  const groupPicker = document.querySelector("#withinGroupPicker");
  groupPicker.innerHTML = Object.entries(GROUP_OPTIONS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  groupPicker.value = selectedWithinGroup;
}

function populateTestFilterControls() {
  TEST_FILTER_FIELDS.forEach(field => {
    populateTestFilterControl(field);
  });
}

function populateOverviewFilterControls() {
  const host = document.querySelector("#overviewFilterGrid");
  if (!host) return;
  host.innerHTML = TEST_FILTER_FIELDS.map(field => `
    <div class="multi-select-filter" data-overview-filter-wrap="${field}">
      <span class="multi-select-label">${GROUP_OPTIONS[field]}</span>
      <details class="multi-select" data-overview-filter-dropdown="${field}">
        <summary class="multi-select-trigger" data-overview-filter-summary="${field}">Loading…</summary>
        <div class="multi-select-menu">
          <div class="checkbox-filter-top">
            <span class="checkbox-filter-summary" data-overview-filter-menu-summary="${field}">Loading…</span>
            <button class="mini-button" data-overview-filter-reset="${field}" type="button">Select all</button>
          </div>
          <div class="checkbox-list multi-select-checkbox-list multi-select-option-list" data-overview-filter-list="${field}"></div>
        </div>
      </details>
    </div>
  `).join("");

  TEST_FILTER_FIELDS.forEach(field => {
    populateOverviewFilterControl(field);
  });

  const activeCount = TEST_FILTER_FIELDS.reduce((count, field) => {
    const available = availableOverviewFilterValues(field);
    const selected = selectedOverviewFilterValues(field, available);
    return count + (available.length && selected.length !== available.length ? 1 : 0);
  }, 0);
  document.querySelector("#overviewFilterSummary").textContent = activeCount
    ? `${fmtInt(activeCount)} filters applied`
    : "All filters selected";
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
  const pairComparisons = validPairs.filter(pair => pair.a !== WITHIN_ALL_LEVEL);
  const allSelections = concreteWithinAllSelections(selectedWithinTestModels, selectedWithinTestField);
  const modePicker = document.querySelector("#withinTestMode");
  const modeOptions = [];
  if (pairComparisons.length) modeOptions.push({ value: "pair", label: "Two specific levels" });
  if (allSelections.length >= 2) modeOptions.push({ value: "selected", label: "Choose multiple levels" });
  if (!modeOptions.some(option => option.value === selectedWithinTestMode)) {
    selectedWithinTestMode = modeOptions[0]?.value || "pair";
  }
  modePicker.innerHTML = modeOptions.length
    ? modeOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join("")
    : `<option value="pair">Two specific levels</option>`;
  modePicker.value = selectedWithinTestMode;

  const levelA = document.querySelector("#withinTestLevelA");
  const levelB = document.querySelector("#withinTestLevelB");
  const levelALabel = document.querySelector("#withinTestLevelALabel");
  const levelBLabel = document.querySelector("#withinTestLevelBLabel");
  if (selectedWithinTestMode === "pair") {
    const selectionIsValid = pairComparisons.some(pair =>
      pair.a === selectedWithinTestLevelA && pair.b === selectedWithinTestLevelB
    );
    if (!selectionIsValid) {
      const preferredPair = selectedWithinTestField === "dist_hint_applied"
        ? pairComparisons.find(pair => pair.a === "none" && pair.b === "family")
        : null;
      const defaultPair = preferredPair || pairComparisons[0];
      selectedWithinTestLevelA = defaultPair?.a || "";
      selectedWithinTestLevelB = defaultPair?.b || "";
    }
    const levelAOptions = [...new Set(pairComparisons.map(pair => pair.a))]
      .sort((left, right) =>
        withinLevelLabel(selectedWithinTestField, left).localeCompare(withinLevelLabel(selectedWithinTestField, right))
      );
    const levelBOptions = pairComparisons
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
    levelB.disabled = false;
    levelALabel.hidden = false;
    levelBLabel.hidden = false;
  } else {
    selectedWithinTestLevelA = WITHIN_ALL_LEVEL;
    selectedWithinTestLevelB = WITHIN_ALL_COMPARISONS;
    levelA.innerHTML = "";
    levelB.innerHTML = "";
    levelALabel.hidden = true;
    levelBLabel.hidden = true;
  }

  const includedLevelsWrap = document.querySelector("#withinTestIncludedLevelsWrap");
  const includedLevelsHost = document.querySelector("#withinTestIncludedLevels");
  const includedLevelsSummary = document.querySelector("#withinTestIncludedLevelsSummary");
  if (selectedWithinTestMode === "selected") {
    selectedWithinAllSelections(selectedWithinTestModels, selectedWithinTestField);
    includedLevelsWrap.hidden = false;
    includedLevelsHost.innerHTML = allSelections.length
      ? allSelections.map(item => `
          <label class="checkbox-chip">
            <input type="checkbox" value="${item.b}" ${selectedWithinTestIncludedLevels.includes(item.b) ? "checked" : ""}>
            <span>${withinLevelLabel(selectedWithinTestField, item.b)}<em>${fmtInt(item.count)} matched</em></span>
          </label>`
        ).join("")
      : `<p class="quiet">No matched multi-level cases are available for this selection.</p>`;
    includedLevelsSummary.textContent = selectedWithinTestIncludedLevels.length >= 2
      ? `${fmtInt(selectedWithinTestIncludedLevels.length)} of ${fmtInt(allSelections.length)} levels selected`
      : "Click 2 or more levels below";
  } else {
    includedLevelsWrap.hidden = true;
    includedLevelsHost.innerHTML = "";
    includedLevelsSummary.textContent = "Select 2 or more levels";
    selectedWithinTestIncludedLevels = [];
  }
}

function hasStaticOnlyTestFilter() {
  const scenarios = selectedTestFilterValues(
    "scenario_subtype",
    availableTestFilterValues("scenario_subtype")
  );
  return scenarios.length === 1 && scenarios[0] === "static";
}

function availableTTestMethods(includeRegression = false) {
  const hasHeuristic = rows.some(row => Number.isFinite(row.heuristic_rel_rev_loss));
  const methods = ACROSS_CHART_ORDER.filter(method =>
    method === HEURISTIC_LABEL ? hasHeuristic : models.includes(method)
  );
  return includeRegression && hasStaticOnlyTestFilter()
    ? [...methods, REGRESSION_LABEL]
    : methods;
}

function selectedTTestMethodValues(available = availableTTestMethods(), minimumCount = 2) {
  if (!available.length) {
    selectedTTestModels = [];
    return selectedTTestModels;
  }
  const validSelected = selectedTTestModels.filter(model => available.includes(model));
  selectedTTestModels = validSelected.length >= minimumCount ? validSelected : [...available];
  return selectedTTestModels;
}

function tTestCasesForMethods(methods) {
  const completed = completeCases(comparableCases(passesTestFilters));
  return completed.filter(caseRows => methods.every(method => Number.isFinite(benchmarkLoss(caseRows, method))));
}

function passesTTestRowFilters(row, excludedFields = []) {
  return TEST_FILTER_FIELDS.every(field => {
    if (excludedFields.includes(field)) return true;
    const selected = selectedTestFilters[field];
    if (!Array.isArray(selected)) return true;
    if (!selected.length) return false;
    return selected.includes(levelValue(row[field]));
  });
}

function tTestRowsForMethod(method, excludedFields = []) {
  const normalizedExcluded = [...excludedFields].sort();
  const cacheKey = [method, normalizedExcluded.join(","), tTestFilterSignature(normalizedExcluded)].join("||");
  if (tTestRowCache.has(cacheKey)) return tTestRowCache.get(cacheKey);

  let result;
  if (method === HEURISTIC_LABEL) {
    const uniqueRows = new Map();
    rows.forEach(row => {
      if (!row.answered || !Number.isFinite(row.heuristic_rel_rev_loss)) return;
      if (!passesTTestRowFilters(row, normalizedExcluded)) return;
      const key = caseRowIdentityKey(row);
      if (!uniqueRows.has(key)) uniqueRows.set(key, row);
    });
    result = [...uniqueRows.values()];
  } else {
    result = rows.filter(row =>
      row.model === method
      && row.answered
      && Number.isFinite(row.rel_rev_loss)
      && passesTTestRowFilters(row, normalizedExcluded)
    );
  }
  tTestRowCache.set(cacheKey, result);
  return result;
}

function withinTTestPairSummary(method, compareField) {
  const cacheKey = ["global", method, compareField, tTestFilterSignature([compareField])].join("||");
  if (withinTTestPairSummaryCache.has(cacheKey)) return withinTTestPairSummaryCache.get(cacheKey);

  const sourceRows = tTestRowsForMethod(method, [compareField]);
  const levelSet = new Set();

  sourceRows.forEach(row => {
    const compareLevel = levelValue(row[compareField]);
    levelSet.add(compareLevel);
  });

  const summary = {
    levels: sortLevelValues([...levelSet]),
  };
  withinTTestPairSummaryCache.set(cacheKey, summary);
  return summary;
}

function availableTTestCompareFields(methods) {
  return Object.keys(GROUP_OPTIONS).filter(field => {
    const summaries = methods.map(method => withinTTestPairSummary(method, field));
    return summaries.some(summary => summary.levels.length >= 2);
  });
}

function availableTTestCompareLevels(field, methods) {
  return sortLevelValues(
    [...new Set(methods.flatMap(method =>
      withinTTestPairSummary(method, field).levels
    ))]
  );
}

function selectedTTestCompareLevelValues(field, methods, available = availableTTestCompareLevels(field, methods)) {
  if (!available.length) {
    selectedTTestCompareLevels = [];
    return selectedTTestCompareLevels;
  }
  const validSelected = selectedTTestCompareLevels.filter(level => available.includes(level));
  selectedTTestCompareLevels = validSelected.length >= 2 ? validSelected : [...available];
  return selectedTTestCompareLevels;
}

function withinPanelTTestPairSummary(method, compareField) {
  const cacheKey = ["within", method, compareField, withinTTestFilterSignature([compareField])].join("||");
  if (withinTTestPairSummaryCache.has(cacheKey)) return withinTTestPairSummaryCache.get(cacheKey);

  const sourceRows = withinTTestRowsForMethod(method, [compareField]);
  const levelSet = new Set();

  sourceRows.forEach(row => {
    const compareLevel = levelValue(row[compareField]);
    levelSet.add(compareLevel);
  });

  const summary = {
    levels: sortLevelValues([...levelSet]),
  };
  withinTTestPairSummaryCache.set(cacheKey, summary);
  return summary;
}

function availableWithinTTestCompareFields(methods) {
  return Object.keys(GROUP_OPTIONS).filter(field => {
    const summaries = methods.map(method => withinPanelTTestPairSummary(method, field));
    return summaries.some(summary => summary.levels.length >= 2);
  });
}

function availableWithinTTestCompareLevels(field, methods) {
  return sortLevelValues(
    [...new Set(methods.flatMap(method =>
      withinPanelTTestPairSummary(method, field).levels
    ))]
  );
}

function syncWithinTTestComparedLevels(methods, availableLevels = availableWithinTTestCompareLevels(selectedTTestWithinCompareField, methods)) {
  if (!availableLevels.length) {
    selectedTTestWithinCompareLevels = [];
    delete selectedWithinTTestFilters[selectedTTestWithinCompareField];
    return selectedTTestWithinCompareLevels;
  }

  const currentFilter = selectedWithinTTestFilters[selectedTTestWithinCompareField];
  const filterLevels = Array.isArray(currentFilter)
    ? currentFilter.filter(level => availableLevels.includes(level))
    : [];
  if (!filterLevels.length && selectedTTestWithinCompareField === "scenario_subtype") {
    const defaultScenarioLevels = ["static", "seasonal"].filter(level => availableLevels.includes(level));
    if (defaultScenarioLevels.length >= 2) {
      selectedTTestWithinCompareLevels = defaultScenarioLevels;
      selectedWithinTTestFilters[selectedTTestWithinCompareField] = [...defaultScenarioLevels];
      return selectedTTestWithinCompareLevels;
    }
  }
  if (filterLevels.length) {
    selectedTTestWithinCompareLevels = [...filterLevels];
    selectedWithinTTestFilters[selectedTTestWithinCompareField] = [...filterLevels];
    return selectedTTestWithinCompareLevels;
  }

  const validSelected = selectedTTestWithinCompareLevels.filter(level => availableLevels.includes(level));
  selectedTTestWithinCompareLevels = validSelected.length ? validSelected : availableLevels.slice(0, Math.min(2, availableLevels.length));
  selectedWithinTTestFilters[selectedTTestWithinCompareField] = [...selectedTTestWithinCompareLevels];
  return selectedTTestWithinCompareLevels;
}

function syncWithinTTestSplitLevels(methods, compareField, splitField) {
  const availableLevels = splitField
    ? availableWithinTTestSplitLevels(splitField, methods, compareField)
    : [];
  if (!availableLevels.length) {
    selectedTTestWithinLevels = [];
    delete selectedWithinTTestFilters[splitField];
    return selectedTTestWithinLevels;
  }

  const currentFilter = selectedWithinTTestFilters[splitField];
  const filterLevels = Array.isArray(currentFilter)
    ? currentFilter.filter(level => availableLevels.includes(level))
    : [];
  selectedTTestWithinLevels = filterLevels.length ? [...filterLevels] : [...availableLevels];
  selectedWithinTTestFilters[splitField] = [...selectedTTestWithinLevels];
  return selectedTTestWithinLevels;
}

function availableTTestSplitFields(methods) {
  if (selectedTTestMode === "levels") {
    return Object.keys(GROUP_OPTIONS).filter(field =>
      field !== selectedTTestCompareField
      && availableTTestSplitLevels(field, methods).length
    );
  }
  return Object.keys(GROUP_OPTIONS).filter(field =>
    availableTTestSplitLevels(field, methods).length
  );
}

function availableTTestSplitLevels(field, methods) {
  if (selectedTTestMode === "levels") {
    return sortLevelValues(
      [...new Set(methods.flatMap(method =>
        tTestRowsForMethod(method, [selectedTTestCompareField]).map(row => levelValue(row[field]))
      ))]
    );
  }
  const caseRows = tTestCasesForMethods(methods);
  return sortLevelValues(
    [...new Set(caseRows.map(item => levelValue(item[models[0]]?.[field])))]
  );
}

function selectedTTestSplitLevels(field, methods, available = availableTTestSplitLevels(field, methods)) {
  if (!available.length) {
    selectedTTestLevels = [];
    return selectedTTestLevels;
  }
  const validSelected = selectedTTestLevels.filter(level => available.includes(level));
  selectedTTestLevels = validSelected.length ? validSelected : [...available];
  return selectedTTestLevels;
}

function populateTTestControls() {
  const availableMethods = availableTTestMethods();
  const modelMinimum = selectedTTestMode === "levels" ? 1 : 2;
  const selectedMethods = selectedTTestMethodValues(availableMethods, modelMinimum);

  const modelHost = document.querySelector("#tTestModelList");
  const modelSummary = document.querySelector("#tTestModelSummary");
  modelHost.innerHTML = availableMethods.length
    ? availableMethods.map(model => `
        <label class="checkbox-chip">
          <input type="checkbox" value="${model}" ${selectedMethods.includes(model) ? "checked" : ""}>
          <span>${model}</span>
        </label>
      `).join("")
    : `<p class="quiet">No models available.</p>`;
  modelSummary.textContent = availableMethods.length
    ? `${fmtInt(selectedMethods.length)} of ${fmtInt(availableMethods.length)} models selected`
    : "No models available";

  const modePicker = document.querySelector("#tTestMode");
  modePicker.value = selectedTTestMode;

  const compareFieldWrap = document.querySelector("#tTestCompareFieldWrap");
  const compareLevelWrap = document.querySelector("#tTestCompareLevelWrap");
  const compareFieldPicker = document.querySelector("#tTestCompareField");

  if (selectedTTestMode === "levels") {
    compareFieldWrap.hidden = false;
    compareLevelWrap.hidden = false;
    const validCompareFields = availableTTestCompareFields(selectedMethods);
    if (!validCompareFields.includes(selectedTTestCompareField)) {
      selectedTTestCompareField = validCompareFields[0] || "";
    }
    compareFieldPicker.innerHTML = validCompareFields.length
      ? validCompareFields.map(field => `<option value="${field}">${GROUP_OPTIONS[field]}</option>`).join("")
      : `<option value="">No variables available</option>`;
    compareFieldPicker.value = selectedTTestCompareField;

    const availableCompareLevels = selectedTTestCompareField
      ? availableTTestCompareLevels(selectedTTestCompareField, selectedMethods)
      : [];
    const selectedCompareLevels = selectedTTestCompareField
      ? selectedTTestCompareLevelValues(selectedTTestCompareField, selectedMethods, availableCompareLevels)
      : [];
    const compareLevelHost = document.querySelector("#tTestCompareLevelList");
    const compareLevelSummary = document.querySelector("#tTestCompareLevelSummary");
    compareLevelHost.innerHTML = availableCompareLevels.length
      ? availableCompareLevels.map(level => `
          <label class="checkbox-chip">
            <input type="checkbox" value="${level}" ${selectedCompareLevels.includes(level) ? "checked" : ""}>
            <span>${displayLevel(level)}</span>
          </label>
        `).join("")
      : `<p class="quiet">No levels available.</p>`;
    compareLevelSummary.textContent = availableCompareLevels.length
      ? `${fmtInt(selectedCompareLevels.length)} of ${fmtInt(availableCompareLevels.length)} levels selected`
      : "No levels available";
  } else {
    compareFieldWrap.hidden = true;
    compareLevelWrap.hidden = true;
  }

  const fieldPicker = document.querySelector("#tTestField");
  const validFields = availableTTestSplitFields(selectedMethods);
  if (!validFields.includes(selectedTTestField)) selectedTTestField = validFields[0] || "";
  fieldPicker.innerHTML = validFields.length
    ? validFields.map(field => `<option value="${field}">${GROUP_OPTIONS[field]}</option>`).join("")
    : `<option value="">No variables available</option>`;
  fieldPicker.value = selectedTTestField;

  const availableLevels = selectedTTestField ? availableTTestSplitLevels(selectedTTestField, selectedMethods) : [];
  const selectedLevels = selectedTTestField ? selectedTTestSplitLevels(selectedTTestField, selectedMethods, availableLevels) : [];
  const levelHost = document.querySelector("#tTestLevelList");
  const levelSummary = document.querySelector("#tTestLevelSummary");
  levelHost.innerHTML = availableLevels.length
    ? availableLevels.map(level => `
        <label class="checkbox-chip">
          <input type="checkbox" value="${level}" ${selectedLevels.includes(level) ? "checked" : ""}>
          <span>${displayLevel(level)}</span>
        </label>
      `).join("")
    : `<p class="quiet">No levels available.</p>`;
  levelSummary.textContent = availableLevels.length
    ? `${fmtInt(selectedLevels.length)} of ${fmtInt(availableLevels.length)} levels selected`
    : "No levels available";

  const levelLegend = document.querySelector("#tTestLevelLegend");
  levelLegend.textContent = selectedTTestMode === "levels" ? "Included split levels" : "Included levels";
}

function passesFilters(row) {
  if (!selectedAcrossDemandModels.length) return false;
  return selectedAcrossDemandModels.includes(levelValue(row.demand_model));
}

function passesOverviewFilters(row) {
  return TEST_FILTER_FIELDS.every(field => {
    const selected = selectedOverviewFilters[field];
    if (!Array.isArray(selected)) return true;
    if (!selected.length) return false;
    return selected.includes(levelValue(row[field]));
  });
}

function passesTestFilters(row) {
  return TEST_FILTER_FIELDS.every(field => {
    const selected = selectedTestFilters[field];
    if (!Array.isArray(selected)) return true;
    if (!selected.length) return false;
    return selected.includes(levelValue(row[field]));
  });
}

function activeTestFilterLabels() {
  return TEST_FILTER_FIELDS.flatMap(field => {
    const available = availableTestFilterValues(field);
    const selected = selectedTestFilterValues(field, available);
    if (selected.length === available.length) return [];
    return [`${GROUP_OPTIONS[field]}: ${formatTestFilterSummary(field, available, selected)}`];
  });
}

function activeOverviewFilterLabels() {
  return TEST_FILTER_FIELDS.flatMap(field => {
    const available = availableOverviewFilterValues(field);
    const selected = selectedOverviewFilterValues(field, available);
    if (selected.length === available.length) return [];
    return [`${GROUP_OPTIONS[field]}: ${formatTestFilterSummary(field, available, selected)}`];
  });
}

function passesWithinTTestRowFilters(row, excludedFields = []) {
  return WITHIN_TTEST_FILTER_FIELDS.every(field => {
    if (excludedFields.includes(field)) return true;
    const selected = selectedWithinTTestFilters[field];
    if (!Array.isArray(selected)) return true;
    if (!selected.length) return false;
    return selected.includes(levelValue(row[field]));
  });
}

function withinTTestRowsForMethod(method, excludedFields = []) {
  const normalizedExcluded = [...excludedFields].sort();
  const cacheKey = [method, normalizedExcluded.join(","), withinTTestFilterSignature(normalizedExcluded)].join("||");
  if (withinTTestRowCache.has(cacheKey)) return withinTTestRowCache.get(cacheKey);

  let result;
  if (method === HEURISTIC_LABEL) {
    const uniqueRows = new Map();
    rows.forEach(row => {
      if (!row.answered || !Number.isFinite(row.heuristic_rel_rev_loss)) return;
      if (!passesWithinTTestRowFilters(row, normalizedExcluded)) return;
      const key = caseRowIdentityKey(row);
      if (!uniqueRows.has(key)) uniqueRows.set(key, row);
    });
    result = [...uniqueRows.values()];
  } else {
    result = rows.filter(row =>
      row.model === method
      && row.answered
      && Number.isFinite(row.rel_rev_loss)
      && passesWithinTTestRowFilters(row, normalizedExcluded)
    );
  }
  withinTTestRowCache.set(cacheKey, result);
  return result;
}

function availableWithinTTestFilterFields() {
  return [...WITHIN_TTEST_FILTER_FIELDS];
}

function availableWithinTTestFilterValues(field, methods) {
  return sortLevelValues(
    [...new Set(methods.flatMap(method =>
      withinTTestRowsForMethod(method, [field]).map(row => levelValue(row[field]))
    ))]
  );
}

function selectedWithinTTestFilterValues(field, methods, available = availableWithinTTestFilterValues(field, methods)) {
  const current = selectedWithinTTestFilters[field];
  if (!available.length) {
    delete selectedWithinTTestFilters[field];
    return [];
  }
  if (!Array.isArray(current)) {
    selectedWithinTTestFilters[field] = [...available];
    return selectedWithinTTestFilters[field];
  }
  const validSelected = current.filter(value => available.includes(value));
  if (validSelected.length !== current.length) selectedWithinTTestFilters[field] = validSelected;
  return selectedWithinTTestFilters[field];
}

function activeWithinTTestFilterLabels(methods) {
  return availableWithinTTestFilterFields().flatMap(field => {
    if (field === selectedTTestWithinCompareField) return [];
    const available = availableWithinTTestFilterValues(field, methods);
    const selected = selectedWithinTTestFilterValues(field, methods, available);
    if (!available.length || selected.length === available.length) return [];
    return [`${GROUP_OPTIONS[field]}: ${formatTestFilterSummary(field, available, selected)}`];
  });
}

function benchmarkInputColumns() {
  return payload.input_columns || Object.keys(GROUP_OPTIONS);
}

function regressionResultsForOverview() {
  const staticRows = rows.filter(row =>
    levelValue(row.scenario_subtype) === "static"
    && passesOverviewFilters(row)
  );
  const rowsByInstance = new Map();
  staticRows.forEach(row => {
    if (row.instance_id && !rowsByInstance.has(row.instance_id)) {
      rowsByInstance.set(row.instance_id, row);
    }
  });

  return [...rowsByInstance.entries()].map(([instanceId, sourceRow]) => {
    const regression = regressionResultsById.get(instanceId);
    if (!regression) return null;
    return {
      ...regression,
      sigma: Number.isFinite(regression.noise_level) ? regression.noise_level : sourceRow.sigma,
      history_length: Number.isFinite(regression.history_length) ? regression.history_length : sourceRow.history_length,
      history_term: sourceRow.history_term,
      mc: Number.isFinite(regression.mc) ? regression.mc : sourceRow.mc,
      demand_model: regression.demand_model || sourceRow.demand_model,
      parameter_set: regression.parameter_set || sourceRow.parameter_set,
    };
  }).filter(Boolean);
}

function withinMatchKey(row, varyingField, ignoredFields = []) {
  const linkedFields = varyingField === "dist_hint_applied" ? ["dist_hint"] : [];
  const derivedFields = [
    ...(varyingField === "parameter_set" ? ["instance_type", "closing", "p_star"] : []),
    ...(varyingField === "history_term" ? ["history_length"] : []),
    ...(varyingField === "history_length" ? ["history_term"] : []),
  ];
  return benchmarkInputColumns()
    .filter(field =>
      field !== varyingField
      && !linkedFields.includes(field)
      && !derivedFields.includes(field)
      && !ignoredFields.includes(field)
      && field !== "variant"
      && field !== "instance_id"
    )
    .map(field => levelValue(row[field]))
    .join("|");
}

function withinTTestMatchConfig(compareField, levelA, levelB) {
  if (compareField !== "scenario_subtype") {
    return {
      ignoredFields: [],
    };
  }
  const pair = new Set([levelValue(levelA), levelValue(levelB)]);
  if (pair.size === 2 && pair.has("seasonal") && pair.has("static")) {
    return {
      ignoredFields: ["history_length", "has_environment", "next_env"],
    };
  }
  return {
    ignoredFields: [],
  };
}

function withinTTestUsesRelaxedScenarioMatch(compareField, levelA, levelB) {
  const config = withinTTestMatchConfig(compareField, levelA, levelB);
  return config.ignoredFields.length > 0;
}

function rebuildDerivedIndexes() {
  rowsByModel = new Map(
    models.map(model => [model, rows.filter(row => row.model === model)])
  );
  answeredRowsByModel = new Map(
    models.map(model => [model, rows.filter(row => row.model === model && row.answered)])
  );
  regressionResultsById = new Map(Object.entries(payload.regression_results || {}));
  withinFieldCache.clear();
  withinGroupSummaryCache.clear();
  tTestRowCache.clear();
  withinTTestRowCache.clear();
  withinTTestPairSummaryCache.clear();
  matchedLevelDiffCache.clear();
}

function getWithinFieldModelCache(model, field) {
  if (!model || !field) {
    return { orderedLevels: [], levelSet: new Set(), groups: [], pairsByKey: new Map() };
  }

  let fieldCache = withinFieldCache.get(field);
  if (!fieldCache) {
    fieldCache = new Map();
    withinFieldCache.set(field, fieldCache);
  }

  if (fieldCache.has(model)) {
    return fieldCache.get(model);
  }

  const sourceRows = answeredRowsByModel.get(model) || [];
  const levels = new Set();
  const groupsByKey = new Map();

  sourceRows.forEach(row => {
    const level = levelValue(row[field]);
    levels.add(level);
    const key = withinMatchKey(row, field);
    const group = groupsByKey.get(key) || new Map();
    group.set(level, row);
    groupsByKey.set(key, group);
  });

  const orderedLevels = sortLevelValues(levels);
  const groups = [...groupsByKey.values()];
  const pairsByKey = new Map();

  groups.forEach(group => {
    const presentLevels = orderedLevels.filter(level => group.has(level));
    for (let i = 0; i < presentLevels.length; i += 1) {
      for (let j = i + 1; j < presentLevels.length; j += 1) {
        const left = presentLevels[i];
        const right = presentLevels[j];
        const pairKey = `${left}|||${right}`;
        const pairs = pairsByKey.get(pairKey) || [];
        pairs.push({ a: group.get(left), b: group.get(right) });
        pairsByKey.set(pairKey, pairs);
      }
    }
  });

  const cache = {
    orderedLevels,
    levelSet: new Set(orderedLevels),
    groups,
    pairsByKey,
  };
  fieldCache.set(model, cache);
  return cache;
}

function withinMatchedPairsFor(model, field, levelA, levelB) {
  if (!model || !field || !levelA || !levelB) {
    return [];
  }
  const cache = getWithinFieldModelCache(model, field);
  if (levelA === WITHIN_ALL_LEVEL) {
    return cache.groups.flatMap(group => {
      const bRow = group.get(levelB);
      if (!bRow) return [];
      return [...group.entries()]
        .filter(([level]) => level !== levelB)
        .map(([, aRow]) => ({ a: aRow, b: bRow }));
    });
  }
  const forwardKey = `${levelA}|||${levelB}`;
  if (cache.pairsByKey.has(forwardKey)) {
    return cache.pairsByKey.get(forwardKey);
  }
  const reverseKey = `${levelB}|||${levelA}`;
  if (!cache.pairsByKey.has(reverseKey)) {
    return [];
  }
  return cache.pairsByKey.get(reverseKey).map(pair => ({ a: pair.b, b: pair.a }));
}

function withinMatchedPairs(model) {
  return withinMatchedPairsFor(
    model,
    selectedWithinTestField,
    selectedWithinTestLevelA,
    selectedWithinTestLevelB
  );
}

function sharedWithinLevels(selectedModels, field) {
  if (!selectedModels.length || !field) return [];
  const commonLevels = new Set(getWithinFieldModelCache(selectedModels[0], field).orderedLevels);
  selectedModels.slice(1).forEach(model => {
    const modelLevels = getWithinFieldModelCache(model, field).levelSet;
    [...commonLevels].forEach(level => {
      if (!modelLevels.has(level)) commonLevels.delete(level);
    });
  });
  return sortLevelValues(commonLevels);
}

function withinAllLevelRowsFor(model, field, levels) {
  const cache = getWithinFieldModelCache(model, field);
  const orderedLevels = levels?.length
    ? [...levels]
    : cache.orderedLevels;
  const allowedLevels = new Set(orderedLevels);
  const rowsByLevel = new Map(orderedLevels.map(level => [level, []]));

  let matchedKeys = 0;
  cache.groups.forEach(group => {
    const presentLevels = orderedLevels.filter(level => allowedLevels.has(level) && group.has(level));
    if (presentLevels.length < 2) return;
    matchedKeys += 1;
    presentLevels.forEach(level => {
      rowsByLevel.get(level).push(group.get(level));
    });
  });

  return { matchedKeys, rowsByLevel };
}

function concreteWithinAllSelections(selectedModels, field) {
  if (!selectedModels.length || !field) return [];
  const levels = sharedWithinLevels(selectedModels, field);
  const perModelRows = selectedModels.map(model => withinAllLevelRowsFor(model, field, levels));
  return levels.map(level => {
    const minCount = Math.min(...perModelRows.map(({ rowsByLevel }) =>
      rowsByLevel.get(level)?.length || 0
    ));
    return { a: WITHIN_ALL_LEVEL, b: level, count: minCount };
  }).filter(item => item.count);
}

function concreteWithinComparisons(selectedModels, field) {
  if (!selectedModels.length || !field) return [];
  const levels = sortLevelValues(
    new Set(selectedModels.flatMap(model => getWithinFieldModelCache(model, field).orderedLevels))
  );
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
    const levels = getWithinFieldModelCache(model, field).orderedLevels;
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
      ${verticalAxisTitleSvg(margin, plotHeight, "Share of cases")}
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
      ${verticalAxisTitleSvg(margin, plotHeight, "Probability density")}
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
      ${verticalAxisTitleSvg(margin, plotHeight, "Share at or below loss")}
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
      ${verticalAxisTitleSvg(margin, plotHeight, "Density")}
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
      ${verticalAxisTitleSvg(margin, plotHeight, "Density")}
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
  const showRegression = hasStaticOnlyTestFilter();
  const benchmarkCases = completed.filter(caseRows =>
    Number.isFinite(heuristicLoss(caseRows))
    && (!showRegression || Number.isFinite(regressionLoss(caseRows)))
  );
  const comparisonCases = showRegression ? benchmarkCases : completed;
  const benchmarkMethods = showRegression
    ? [...models, HEURISTIC_LABEL, REGRESSION_LABEL]
    : [...models, HEURISTIC_LABEL];
  const displayedMethods = showRegression
    ? [...ACROSS_CHART_ORDER, REGRESSION_LABEL]
    : ACROSS_CHART_ORDER;
  const activeFilters = activeTestFilterLabels();
  document.querySelector("#caseCount").textContent = fmtInt(cases.length);
  document.querySelector("#completeCount").textContent = fmtInt(completed.length);
  document.querySelector("#sourceCount").textContent = fmtInt(rows.length);
  document.querySelector("#testsNote").innerHTML =
    `<strong>${fmtInt(comparisonCases.length)} complete matched cases</strong><span>${activeFilters.length ? activeFilters.join(" · ") : "All scenarios selected"}.${showRegression ? ` Regression Heuristic is included for the ${fmtInt(benchmarkCases.length)} static cases with an eligible regression output.` : ` Heuristic mean loss uses ${fmtInt(benchmarkCases.length)} of those same cases with a valid heuristic benchmark.`} Mean differences are first method minus second method; negative values favor the first method.</span>`;

  renderDensityPlot(completed);
  renderCdfPlot(completed);
  renderDifferenceDensityPlot(completed);

  const pairResults = tTestPairs(benchmarkMethods).map(([modelA, modelB], index) => ({
    modelA,
    modelB,
    result: pairedEvidenceForMethods(comparisonCases, modelA, modelB, 92821 + index * 101),
  }));

  const benchmarkSummaries = benchmarkMethods.map(model => {
    const losses = benchmarkLosses(comparisonCases, model);
    return {
      model,
      n: losses.length,
      meanLoss: mean(losses),
      nearOptimalRate: shareWhere(losses, value => value <= NEAR_OPTIMAL_THRESHOLD),
      severeLossRate: shareWhere(losses, value => value >= SEVERE_LOSS_THRESHOLD),
      q25: quantile(losses, 0.25),
      q50: quantile(losses, 0.5),
      q75: quantile(losses, 0.75),
    };
  });
  const bestMean = [...benchmarkSummaries]
    .filter(item => Number.isFinite(item.meanLoss))
    .sort((a, b) => a.meanLoss - b.meanLoss)[0]?.model;
  const bestNearOptimal = [...benchmarkSummaries]
    .filter(item => Number.isFinite(item.nearOptimalRate))
    .sort((a, b) => b.nearOptimalRate - a.nearOptimalRate)[0]?.model;
  const bestSevereLoss = [...benchmarkSummaries]
    .filter(item => Number.isFinite(item.severeLossRate))
    .sort((a, b) => a.severeLossRate - b.severeLossRate)[0]?.model;

  document.querySelector("#acrossPairMeanBars").innerHTML = renderAcrossMeanChart(
    displayedMethods
      .map(method => benchmarkSummaries.find(item => item.model === method))
      .filter(Boolean)
      .map(item => ({
        model: item.model,
        n: item.n,
        meanLoss: item.meanLoss,
      }))
  );

  document.querySelector("#nearOptimalBars").innerHTML = renderAcrossRateChart(
    displayedMethods
      .map(method => benchmarkSummaries.find(item => item.model === method))
      .filter(Boolean),
    {
      metricKey: "nearOptimalRate",
      metricLabel: "Near-optimal rate",
    }
  );

  document.querySelector("#severeLossBars").innerHTML = renderAcrossRateChart(
    displayedMethods
      .map(method => benchmarkSummaries.find(item => item.model === method))
      .filter(Boolean),
    {
      metricKey: "severeLossRate",
      metricLabel: "Severe-loss rate",
    }
  );

  document.querySelector("#acrossDistributionMeanBars").innerHTML = renderAcrossDistributionMeanPanels(comparisonCases, displayedMethods);

  const matchedDirectionItems = benchmarkMethods.map(model => {
    const summary = comparisonCases.reduce((counts, caseRows) => {
      const direction = benchmarkPriceDirection(caseRows, model);
      if (direction) counts[direction] += 1;
      return counts;
    }, { under: 0, similar: 0, over: 0 });
    return {
      label: model,
      summary: { ...summary, total: summary.under + summary.similar + summary.over },
      losses: benchmarkLosses(comparisonCases, model),
    };
  });

  document.querySelector("#acrossDirectionMatched").innerHTML = renderDirectionBars(matchedDirectionItems);
  document.querySelector("#acrossDirectionMatchedTable tbody").innerHTML = renderDirectionTableRows(matchedDirectionItems);

  document.querySelector("#acrossMeanTable tbody").innerHTML = benchmarkSummaries.map(item => `
    <tr>
      <th>${item.model}</th>
      <td>${fmtInt(item.n)}</td>
      <td class="${item.model === bestMean ? "winner-cell" : ""}">${fmtLoss(item.meanLoss)}</td>
      <td class="${item.model === bestNearOptimal ? "winner-cell" : ""}">${fmtPct(item.nearOptimalRate)}</td>
      <td class="${item.model === bestSevereLoss ? "winner-cell" : ""}">${fmtPct(item.severeLossRate)}</td>
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

  const bestQ25 = [...benchmarkSummaries].filter(item => Number.isFinite(item.q25)).sort((a, b) => a.q25 - b.q25)[0]?.model;
  const bestQ50 = [...benchmarkSummaries].filter(item => Number.isFinite(item.q50)).sort((a, b) => a.q50 - b.q50)[0]?.model;
  const bestQ75 = [...benchmarkSummaries].filter(item => Number.isFinite(item.q75)).sort((a, b) => a.q75 - b.q75)[0]?.model;
  document.querySelector("#quantileTable tbody").innerHTML = benchmarkSummaries.map(item => `
    <tr>
      <th>${item.model}</th>
      <td class="${item.model === bestQ25 ? "winner-cell" : ""}">${fmtLoss(item.q25)}</td>
      <td class="${item.model === bestQ50 ? "winner-cell" : ""}">${fmtLoss(item.q50)}</td>
      <td class="${item.model === bestQ75 ? "winner-cell" : ""}">${fmtLoss(item.q75)}</td>
    </tr>`).join("");
}

function tTestPairs(methods) {
  const pairs = [];
  for (let i = 0; i < methods.length; i += 1) {
    for (let j = i + 1; j < methods.length; j += 1) {
      pairs.push([methods[i], methods[j]]);
    }
  }
  return pairs;
}

function pairedEvidenceForMethods(caseRows, modelA, modelB, seed) {
  return modelA === HEURISTIC_LABEL || modelB === HEURISTIC_LABEL || modelA === REGRESSION_LABEL || modelB === REGRESSION_LABEL
    ? pairedBenchmarkEvidence(caseRows, modelA, modelB, seed)
    : pairedDifferenceEvidence(caseRows, modelA, modelB, seed);
}

function matchedLevelDiffsForMethod(method, compareField, levelA, levelB, splitField = "", splitLevel = "") {
  const { ignoredFields } = withinTTestMatchConfig(compareField, levelA, levelB);
  const cacheKey = [
    method,
    compareField,
    levelA,
    levelB,
    splitField || "-",
    splitLevel || "-",
    ignoredFields.join(",") || "-",
    withinTTestFilterSignature([compareField]),
  ].join("||");
  if (matchedLevelDiffCache.has(cacheKey)) return matchedLevelDiffCache.get(cacheKey);

  const sourceRows = withinTTestRowsForMethod(method, [compareField]).filter(row => {
    const compareLevel = levelValue(row[compareField]);
    if (compareLevel !== levelA && compareLevel !== levelB) return false;
    if (splitField && splitLevel && levelValue(row[splitField]) !== splitLevel) return false;
    return Number.isFinite(tTestRowLoss(row, method));
  });

  const byKey = new Map();
  sourceRows.forEach(row => {
    const key = withinMatchKey(row, compareField, ignoredFields);
    const compareLevel = levelValue(row[compareField]);
    const bucket = byKey.get(key) || new Map();
    if (!bucket.has(compareLevel)) bucket.set(compareLevel, row);
    byKey.set(key, bucket);
  });

  const diffs = [...byKey.values()].flatMap(bucket => {
    const rowA = bucket.get(levelA);
    const rowB = bucket.get(levelB);
    if (!rowA || !rowB) return [];
    const diff = tTestRowLoss(rowA, method) - tTestRowLoss(rowB, method);
    return Number.isFinite(diff) ? [diff] : [];
  });
  matchedLevelDiffCache.set(cacheKey, diffs);
  return diffs;
}

function levelPairLabel(field, levelA, levelB) {
  return `${withinLevelLabel(field, levelA)} - ${withinLevelLabel(field, levelB)}`;
}

function selectedValuesOrAll(currentValues, availableValues, minimumCount = 1) {
  if (!availableValues.length) return [];
  const validSelected = currentValues.filter(value => availableValues.includes(value));
  return validSelected.length >= minimumCount ? validSelected : [...availableValues];
}

function availableAcrossTTestLevels(field, methods) {
  const caseRows = tTestCasesForMethods(methods);
  return sortLevelValues(
    [...new Set(caseRows.map(item => levelValue(item[models[0]]?.[field])))]
  );
}

function availableWithinTTestSplitLevels(field, methods, compareField) {
  return sortLevelValues(
    [...new Set(methods.flatMap(method =>
      withinTTestRowsForMethod(method, [compareField, field]).map(row => levelValue(row[field]))
    ))]
  );
}

function populateWithinTTestExtraFilterControls(methods) {
  const host = document.querySelector("#tTestWithinExtraFilters");
  const summary = document.querySelector("#tTestWithinExtraFilterSummary");
  const fields = availableWithinTTestFilterFields();
  const cards = [];
  let activeCount = 0;

  fields.forEach(field => {
    const available = availableWithinTTestFilterValues(field, methods);
    if (!available.length) {
      delete selectedWithinTTestFilters[field];
      return;
    }

    const selected = selectedWithinTTestFilterValues(field, methods, available);
    if (field !== selectedTTestWithinCompareField && selected.length !== available.length) activeCount += 1;

    const fieldFlags = [
      field === selectedTTestWithinCompareField ? "comparison" : "",
      field === selectedTTestWithinField ? "split" : "",
    ].filter(Boolean);
    const fieldSuffix = fieldFlags.length ? ` (${fieldFlags.join(" · ")})` : "";

    cards.push(`
      <div class="multi-select-filter" data-within-t-test-filter-wrap="${field}">
        <label class="multi-select-label" for="withinTTestFilter-${field}">${GROUP_OPTIONS[field]}${fieldSuffix}</label>
        <details class="multi-select" data-within-t-test-filter-dropdown="${field}">
          <summary class="multi-select-trigger" id="withinTTestFilter-${field}">
            <span data-within-t-test-filter-menu-summary="${field}">
              ${selected.length === available.length
                ? `${allFieldLabel(field)} selected`
                : `${fmtInt(selected.length)} of ${fmtInt(available.length)} ${FILTER_PLURAL_LABELS[field] || "items"} selected`}
            </span>
          </summary>
          <div class="multi-select-menu">
            <div class="multi-select-menu-head">
              <div class="multi-select-menu-title">${GROUP_OPTIONS[field]}${fieldSuffix}</div>
              <div class="multi-select-menu-actions">
                <button
                  class="mini-button ${field === selectedTTestWithinCompareField ? "is-active" : ""}"
                  type="button"
                  data-within-t-test-compare-field="${field}"
                >Comparison</button>
                <button
                  class="mini-button ${field === selectedTTestWithinField ? "is-active" : ""}"
                  type="button"
                  data-within-t-test-split-field="${field}"
                >Split</button>
                <button class="mini-button" type="button" data-within-t-test-filter-reset="${field}">Select all</button>
              </div>
            </div>
            <div class="multi-select-menu-summary" data-within-t-test-filter-summary="${field}">
              ${formatTestFilterSummary(field, available, selected)}
            </div>
            <div class="checkbox-list multi-select-checkbox-list" data-within-t-test-filter-list="${field}">
              ${available.map(value => `
                <label class="checkbox-chip">
                  <input type="checkbox" value="${value}" ${selected.includes(value) ? "checked" : ""}>
                  <span>${displayLevel(value)}</span>
                </label>
              `).join("")}
            </div>
          </div>
        </details>
      </div>
    `);
  });

  host.innerHTML = cards.length
    ? cards.join("")
    : `<p class="quiet">No filters are available for the current model selection.</p>`;
  summary.textContent = activeCount
    ? `${fmtInt(activeCount)} additional filter${activeCount === 1 ? "" : "s"} applied`
    : "All filters available";
}

function populateAcrossTTestControls() {
  setupAcrossTTestFilterPanel();
  populateTestFilterControls();
  const availableMethods = availableTTestMethods(true);
  selectedTTestModels = selectedValuesOrAll(selectedTTestModels, availableMethods, 2);

  const modelHost = document.querySelector("#tTestAcrossModelList");
  const modelSummary = document.querySelector("#tTestAcrossModelSummary");
  modelHost.innerHTML = availableMethods.length
    ? availableMethods.map(model => `
        <label class="checkbox-chip">
          <input type="checkbox" value="${model}" ${selectedTTestModels.includes(model) ? "checked" : ""}>
          <span>${model}</span>
        </label>
      `).join("")
    : `<p class="quiet">No models available.</p>`;
  modelSummary.textContent = availableMethods.length
    ? `${fmtInt(selectedTTestModels.length)} of ${fmtInt(availableMethods.length)} models selected${hasStaticOnlyTestFilter() ? "; Regression Heuristic is available for static only" : "; Regression Heuristic is available when Scenario is static only"}`
    : "No models available";

  const validFields = Object.keys(GROUP_OPTIONS).filter(field =>
    availableAcrossTTestLevels(field, selectedTTestModels).length
  );
  if (!validFields.includes(selectedTTestField)) selectedTTestField = validFields[0] || "";
  const fieldPicker = document.querySelector("#tTestAcrossField");
  fieldPicker.innerHTML = validFields.length
    ? validFields.map(field => `<option value="${field}">${GROUP_OPTIONS[field]}</option>`).join("")
    : `<option value="">No variables available</option>`;
  fieldPicker.value = selectedTTestField;

  const availableLevels = selectedTTestField ? availableAcrossTTestLevels(selectedTTestField, selectedTTestModels) : [];
  selectedTTestLevels = selectedValuesOrAll(selectedTTestLevels, availableLevels, 1);
  const levelHost = document.querySelector("#tTestAcrossLevelList");
  const levelSummary = document.querySelector("#tTestAcrossLevelSummary");
  levelHost.innerHTML = availableLevels.length
    ? availableLevels.map(level => `
        <label class="checkbox-chip">
          <input type="checkbox" value="${level}" ${selectedTTestLevels.includes(level) ? "checked" : ""}>
          <span>${displayLevel(level)}</span>
        </label>
      `).join("")
    : `<p class="quiet">No levels available.</p>`;
  levelSummary.textContent = availableLevels.length
    ? `${fmtInt(selectedTTestLevels.length)} of ${fmtInt(availableLevels.length)} levels selected`
    : "No levels available";
}

function populateWithinTTestControls() {
  const availableMethods = availableTTestMethods();
  selectedTTestWithinModels = selectedValuesOrAll(selectedTTestWithinModels, availableMethods, 1);

  const modelHost = document.querySelector("#tTestWithinModelList");
  const modelSummary = document.querySelector("#tTestWithinModelSummary");
  modelHost.innerHTML = availableMethods.length
    ? availableMethods.map(model => `
        <label class="checkbox-chip">
          <input type="checkbox" value="${model}" ${selectedTTestWithinModels.includes(model) ? "checked" : ""}>
          <span>${model}</span>
        </label>
      `).join("")
    : `<p class="quiet">No models available.</p>`;
  modelSummary.textContent = availableMethods.length
    ? `${fmtInt(selectedTTestWithinModels.length)} of ${fmtInt(availableMethods.length)} models selected`
    : "No models available";

  const validCompareFields = availableWithinTTestCompareFields(selectedTTestWithinModels)
    .filter(field => field !== selectedTTestWithinField);
  if (!validCompareFields.includes(selectedTTestWithinCompareField)) {
    selectedTTestWithinCompareField = validCompareFields.includes("scenario_subtype")
      ? "scenario_subtype"
      : (validCompareFields[0] || "");
  }

  const validSplitFields = Object.keys(GROUP_OPTIONS).filter(field =>
    field !== selectedTTestWithinCompareField
    && availableWithinTTestSplitLevels(field, selectedTTestWithinModels, selectedTTestWithinCompareField).length
  );
  if (!validSplitFields.includes(selectedTTestWithinField)) {
    selectedTTestWithinField = validSplitFields.includes("demand_model")
      ? "demand_model"
      : (validSplitFields[0] || "");
  }

  populateWithinTTestExtraFilterControls(selectedTTestWithinModels);

  const availableCompareLevels = selectedTTestWithinCompareField
    ? availableWithinTTestCompareLevels(selectedTTestWithinCompareField, selectedTTestWithinModels)
    : [];
  selectedTTestWithinCompareLevels = syncWithinTTestComparedLevels(selectedTTestWithinModels, availableCompareLevels);
  selectedTTestWithinLevels = syncWithinTTestSplitLevels(
    selectedTTestWithinModels,
    selectedTTestWithinCompareField,
    selectedTTestWithinField
  );
}

function renderAcrossTTests() {
  populateAcrossTTestControls();
  const selectedMethods = selectedTTestModels;
  const sourceCases = comparableCases(passesTestFilters);
  const completed = completeCases(sourceCases);
  const caseRows = tTestCasesForMethods(selectedMethods);
  const activeFilters = activeTestFilterLabels();

  document.querySelector("#caseCount").textContent = fmtInt(sourceCases.length);
  document.querySelector("#completeCount").textContent = fmtInt(completed.length);
  document.querySelector("#sourceCount").textContent = fmtInt(rows.length);

  if (selectedMethods.length < 2) {
    document.querySelector("#tTestsAcrossNote").innerHTML =
      `<strong>Select at least 2 models</strong><span>Choose two or more models to compute pairwise t tests.</span>`;
    document.querySelector("#tTestAcrossOverallTable tbody").innerHTML = `<tr><td colspan="5" class="quiet">No pairwise t tests are shown until at least two models are selected.</td></tr>`;
    document.querySelector("#tTestAcrossByLevelTable tbody").innerHTML = `<tr><td colspan="6" class="quiet">No level-based t tests are shown until at least two models are selected.</td></tr>`;
    return;
  }

  const pairs = tTestPairs(selectedMethods);
  const regressionBaseCaseCount = selectedMethods.includes(REGRESSION_LABEL)
    ? new Set(caseRows.map(caseRows => Object.values(caseRows).find(row => row?.instance_id)?.instance_id).filter(Boolean)).size
    : 0;
  document.querySelector("#tTestsAcrossNote").innerHTML =
    `<strong>${fmtInt(caseRows.length)} matched cases for t tests</strong><span>${activeFilters.length ? activeFilters.join(" · ") : "All scenarios selected"}. Comparing <strong>${fmtInt(selectedMethods.length)}</strong> models across <strong>${GROUP_OPTIONS[selectedTTestField] || "selected variable"}</strong>. Mean differences are first method minus second method; negative values favor the first method.${selectedMethods.includes(REGRESSION_LABEL) ? ` Regression Heuristic is available only for static and uses ${fmtInt(regressionBaseCaseCount)} unique regression instances repeated across the prompt variants.` : ""}</span>`;

  const overallRows = pairs.map(([modelA, modelB], index) => ({
    modelA,
    modelB,
    result: pairedEvidenceForMethods(caseRows, modelA, modelB, 55121 + index * 101),
  }));

  document.querySelector("#tTestAcrossOverallTable tbody").innerHTML = overallRows.length
    ? overallRows.map(({ modelA, modelB, result }) => `
        <tr>
          <th>${pairLabel(modelA, modelB)}</th>
          <td>${fmtInt(result.n)}</td>
          <td class="${sigClass(result.tP)}">${fmtSignedLoss(result.meanDiff)}</td>
          <td class="${sigClass(result.tP)}">${fmtP(result.tP)}</td>
          <td>${fmtSignedLoss(result.bootLow)} to ${fmtSignedLoss(result.bootHigh)}</td>
        </tr>`).join("")
    : `<tr><td colspan="5" class="quiet">No overall t tests are available.</td></tr>`;

  const levelRows = selectedTTestLevels.flatMap((level, levelIndex) => {
    const levelCases = caseRows.filter(item => levelValue(item[models[0]]?.[selectedTTestField]) === level);
    return pairs.map(([modelA, modelB], pairIndex) => ({
      level,
      modelA,
      modelB,
      result: pairedEvidenceForMethods(levelCases, modelA, modelB, 61721 + levelIndex * 1009 + pairIndex * 97),
    }));
  });

  document.querySelector("#tTestAcrossByLevelTable tbody").innerHTML = levelRows.length
    ? levelRows.map(({ level, modelA, modelB, result }) => `
        <tr>
          <th>${displayLevel(level)}</th>
          <td>${pairLabel(modelA, modelB)}</td>
          <td>${fmtInt(result.n)}</td>
          <td class="${sigClass(result.tP)}">${fmtSignedLoss(result.meanDiff)}</td>
          <td class="${sigClass(result.tP)}">${fmtP(result.tP)}</td>
          <td>${fmtSignedLoss(result.bootLow)} to ${fmtSignedLoss(result.bootHigh)}</td>
        </tr>`).join("")
    : `<tr><td colspan="6" class="quiet">No level-based t tests are available for the selected variable and levels.</td></tr>`;
}

function renderWithinTTests() {
  populateWithinTTestControls();
  const selectedMethods = selectedTTestWithinModels;
  const sourceCases = comparableCases(row => passesWithinTTestRowFilters(row));
  const completed = completeCases(sourceCases);
  const activeFilters = activeWithinTTestFilterLabels(selectedMethods);
  const compareLevels = selectedTTestWithinCompareLevels;
  const splitLevels = selectedTTestWithinLevels;
  const comparePairs = tTestPairs(compareLevels);
  const usesRelaxedScenarioMatch = comparePairs.some(([levelA, levelB]) =>
    withinTTestUsesRelaxedScenarioMatch(selectedTTestWithinCompareField, levelA, levelB)
  );

  document.querySelector("#caseCount").textContent = fmtInt(sourceCases.length);
  document.querySelector("#completeCount").textContent = fmtInt(completed.length);
  document.querySelector("#sourceCount").textContent = fmtInt(rows.length);

  if (!selectedMethods.length || compareLevels.length < 2) {
    document.querySelector("#tTestsWithinNote").innerHTML =
      `<strong>Select at least 1 model and 2 levels</strong><span>Choose one or more models, then select two or more levels inside <strong>${GROUP_OPTIONS[selectedTTestWithinCompareField] || "the comparison filter"}</strong> in <strong>All filters</strong> to compute matched level t tests.</span>`;
    document.querySelector("#tTestWithinOverallTable tbody").innerHTML = `<tr><td colspan="5" class="quiet">No matched level t tests are shown until at least one model and two compared levels are selected.</td></tr>`;
    document.querySelector("#tTestWithinByLevelTable tbody").innerHTML = `<tr><td colspan="6" class="quiet">No split matched level t tests are shown until at least one model and two compared levels are selected.</td></tr>`;
    return;
  }

  const overallRows = selectedMethods.flatMap((method, methodIndex) =>
    comparePairs.map(([levelA, levelB], pairIndex) => ({
      method,
      levelA,
      levelB,
      result: pairedDifferenceEvidenceFromDiffs(
        matchedLevelDiffsForMethod(method, selectedTTestWithinCompareField, levelA, levelB),
        70121 + methodIndex * 1009 + pairIndex * 97
      ),
    }))
  );
  const totalMatchedPairs = overallRows.reduce((sum, item) => sum + item.result.n, 0);

  if (!totalMatchedPairs) {
    document.querySelector("#tTestsWithinNote").innerHTML =
      `<strong>No exact matched pairs were found</strong><span>The selected <strong>${GROUP_OPTIONS[selectedTTestWithinCompareField] || "variable"}</strong> levels do not create exact within-model matches under the current filters.${activeFilters.length ? ` ${activeFilters.join(" · ")}.` : " No extra filters are applied."}${usesRelaxedScenarioMatch ? " For the <strong>seasonal vs static</strong> pair, the app now uses the shared <strong>history term</strong> field while ignoring raw <strong>history length</strong>, <strong>has environment</strong>, and <strong>next environment</strong>; if the count is still zero, the remaining filters or split selection remove the overlap." : " This happens for <strong>Scenario</strong> in the current dataset because the scenario types do not share the same full ingredient set. Try <strong>Parameter set</strong>, <strong>History term</strong>, <strong>Expert role</strong>, or <strong>Demand model</strong> instead."}</span>`;
    document.querySelector("#tTestWithinOverallTable tbody").innerHTML = `<tr><td colspan="5" class="quiet">No exact matched level pairs are available for the current variable, selected levels, and filters.</td></tr>`;
    document.querySelector("#tTestWithinByLevelTable tbody").innerHTML = `<tr><td colspan="6" class="quiet">No split matched level pairs are available for the current variable, selected levels, and filters.</td></tr>`;
    return;
  }

  document.querySelector("#tTestsWithinNote").innerHTML =
    `<strong>${fmtInt(totalMatchedPairs)} matched level pairs for t tests</strong><span>${activeFilters.length ? activeFilters.join(" · ") : "No additional filters applied"}. Comparing <strong>${GROUP_OPTIONS[selectedTTestWithinCompareField] || "selected variable"}</strong> within <strong>${fmtInt(selectedMethods.length)}</strong> selected models and splitting results by <strong>${GROUP_OPTIONS[selectedTTestWithinField] || "selected split"}</strong>. Mean differences are first level minus second level, so negative values favor the first level.${usesRelaxedScenarioMatch ? " For <strong>seasonal vs static</strong>, matching now uses <strong>history term</strong> and ignores raw <strong>history length</strong>, <strong>has environment</strong>, and <strong>next environment</strong> only." : ""}</span>`;

  document.querySelector("#tTestWithinOverallTable tbody").innerHTML = overallRows.length
    ? overallRows.map(({ method, levelA, levelB, result }) => `
        <tr>
          <th>${modelMeta(method).short} · ${levelPairLabel(selectedTTestWithinCompareField, levelA, levelB)}</th>
          <td>${fmtInt(result.n)}</td>
          <td class="${sigClass(result.tP)}">${fmtSignedLoss(result.meanDiff)}</td>
          <td class="${sigClass(result.tP)}">${fmtP(result.tP)}</td>
          <td>${fmtSignedLoss(result.bootLow)} to ${fmtSignedLoss(result.bootHigh)}</td>
        </tr>`).join("")
    : `<tr><td colspan="5" class="quiet">No overall matched level t tests are available.</td></tr>`;

  const splitRows = splitLevels.flatMap((splitLevel, splitIndex) =>
    selectedMethods.flatMap((method, methodIndex) =>
      comparePairs.map(([levelA, levelB], pairIndex) => ({
        splitLevel,
        method,
        levelA,
        levelB,
        result: pairedDifferenceEvidenceFromDiffs(
          matchedLevelDiffsForMethod(
            method,
            selectedTTestWithinCompareField,
            levelA,
            levelB,
            selectedTTestWithinField,
            splitLevel
          ),
          76121 + splitIndex * 4001 + methodIndex * 211 + pairIndex * 31
        ),
      }))
    )
  );

  document.querySelector("#tTestWithinByLevelTable tbody").innerHTML = splitRows.length
    ? splitRows.map(({ splitLevel, method, levelA, levelB, result }) => `
        <tr>
          <th>${displayLevel(splitLevel)}</th>
          <td>${modelMeta(method).short} · ${levelPairLabel(selectedTTestWithinCompareField, levelA, levelB)}</td>
          <td>${fmtInt(result.n)}</td>
          <td class="${sigClass(result.tP)}">${fmtSignedLoss(result.meanDiff)}</td>
          <td class="${sigClass(result.tP)}">${fmtP(result.tP)}</td>
          <td>${fmtSignedLoss(result.bootLow)} to ${fmtSignedLoss(result.bootHigh)}</td>
        </tr>`).join("")
    : `<tr><td colspan="6" class="quiet">No split matched level t tests are available for the selected variable and levels.</td></tr>`;
}

function renderTTests() {
  populateTTestControls();
  const selectedMethods = selectedTTestMethodValues(undefined, selectedTTestMode === "levels" ? 1 : 2);
  const activeFilters = activeTestFilterLabels();
  const sourceCases = comparableCases(passesTestFilters);
  const completed = completeCases(sourceCases);

  document.querySelector("#caseCount").textContent = fmtInt(sourceCases.length);
  document.querySelector("#completeCount").textContent = fmtInt(completed.length);
  document.querySelector("#sourceCount").textContent = fmtInt(rows.length);

  const overallTitle = document.querySelector("#tTestOverallTitle");
  const overallSubtitle = document.querySelector("#tTestOverallSubtitle");
  const byLevelTitle = document.querySelector("#tTestByLevelTitle");
  const byLevelSubtitle = document.querySelector("#tTestByLevelSubtitle");

  if (selectedTTestMode === "levels") {
    overallTitle.textContent = "Overall matched level t tests";
    overallSubtitle.textContent = "Selected models compared across matched level pairs";
    byLevelTitle.textContent = "Matched level t tests by split level";
    byLevelSubtitle.textContent = "Mean differences are first level minus second level within the same model";

    const compareLevels = selectedTTestCompareField
      ? selectedTTestCompareLevelValues(selectedTTestCompareField, selectedMethods)
      : [];
    const splitLevels = selectedTTestField
      ? selectedTTestSplitLevels(selectedTTestField, selectedMethods)
      : [];

    if (!selectedMethods.length || compareLevels.length < 2) {
      document.querySelector("#tTestsNote").innerHTML =
        `<strong>Select at least 1 model and 2 levels</strong><span>Choose one or more models, then select two or more compared levels to compute matched level t tests.</span>`;
      document.querySelector("#tTestOverallTable tbody").innerHTML = `<tr><td colspan="5" class="quiet">No matched level t tests are shown until at least one model and two compared levels are selected.</td></tr>`;
      document.querySelector("#tTestByLevelTable tbody").innerHTML = `<tr><td colspan="6" class="quiet">No split matched level t tests are shown until at least one model and two compared levels are selected.</td></tr>`;
      return;
    }

    const comparePairs = tTestPairs(compareLevels);
    const overallRows = selectedMethods.flatMap((method, methodIndex) =>
      comparePairs.map(([levelA, levelB], pairIndex) => ({
        method,
        levelA,
        levelB,
        result: pairedDifferenceEvidenceFromDiffs(
          matchedLevelDiffsForMethod(method, selectedTTestCompareField, levelA, levelB),
          70121 + methodIndex * 1009 + pairIndex * 97
        ),
      }))
    );

    document.querySelector("#tTestsNote").innerHTML =
      `<strong>${fmtInt(overallRows.reduce((sum, item) => sum + item.result.n, 0))} matched level pairs for t tests</strong><span>${activeFilters.length ? activeFilters.join(" · ") : "All scenarios selected"}. Comparing <strong>${GROUP_OPTIONS[selectedTTestCompareField] || "selected variable"}</strong> within <strong>${fmtInt(selectedMethods.length)}</strong> selected models. Mean differences are first level minus second level, so negative values favor the first level.</span>`;

    document.querySelector("#tTestOverallTable tbody").innerHTML = overallRows.length
      ? overallRows.map(({ method, levelA, levelB, result }) => `
          <tr>
            <th>${modelMeta(method).short} · ${levelPairLabel(selectedTTestCompareField, levelA, levelB)}</th>
            <td>${fmtInt(result.n)}</td>
            <td class="${sigClass(result.tP)}">${fmtSignedLoss(result.meanDiff)}</td>
            <td class="${sigClass(result.tP)}">${fmtP(result.tP)}</td>
            <td>${fmtSignedLoss(result.bootLow)} to ${fmtSignedLoss(result.bootHigh)}</td>
          </tr>`).join("")
      : `<tr><td colspan="5" class="quiet">No overall matched level t tests are available.</td></tr>`;

    const splitRows = splitLevels.flatMap((splitLevel, splitIndex) =>
      selectedMethods.flatMap((method, methodIndex) =>
        comparePairs.map(([levelA, levelB], pairIndex) => ({
          splitLevel,
          method,
          levelA,
          levelB,
          result: pairedDifferenceEvidenceFromDiffs(
            matchedLevelDiffsForMethod(method, selectedTTestCompareField, levelA, levelB, selectedTTestField, splitLevel),
            76121 + splitIndex * 4001 + methodIndex * 211 + pairIndex * 31
          ),
        }))
      )
    );

    document.querySelector("#tTestByLevelTable tbody").innerHTML = splitRows.length
      ? splitRows.map(({ splitLevel, method, levelA, levelB, result }) => `
          <tr>
            <th>${displayLevel(splitLevel)}</th>
            <td>${modelMeta(method).short} · ${levelPairLabel(selectedTTestCompareField, levelA, levelB)}</td>
            <td>${fmtInt(result.n)}</td>
            <td class="${sigClass(result.tP)}">${fmtSignedLoss(result.meanDiff)}</td>
            <td class="${sigClass(result.tP)}">${fmtP(result.tP)}</td>
            <td>${fmtSignedLoss(result.bootLow)} to ${fmtSignedLoss(result.bootHigh)}</td>
          </tr>`).join("")
      : `<tr><td colspan="6" class="quiet">No split matched level t tests are available for the selected variable and levels.</td></tr>`;
    return;
  }

  overallTitle.textContent = "Overall pairwise t tests";
  overallSubtitle.textContent = "Current across-model filters plus selected models";
  byLevelTitle.textContent = "Pairwise t tests by level";
  byLevelSubtitle.textContent = "Mean differences are first method minus second method";

  const caseRows = tTestCasesForMethods(selectedMethods);

  if (selectedMethods.length < 2) {
    document.querySelector("#tTestsNote").innerHTML =
      `<strong>Select at least 2 models</strong><span>Choose two or more models to compute pairwise t tests.</span>`;
    document.querySelector("#tTestOverallTable tbody").innerHTML = `<tr><td colspan="5" class="quiet">No pairwise t tests are shown until at least two models are selected.</td></tr>`;
    document.querySelector("#tTestByLevelTable tbody").innerHTML = `<tr><td colspan="6" class="quiet">No level-based t tests are shown until at least two models are selected.</td></tr>`;
    return;
  }

  const availableLevels = selectedTTestField ? availableTTestSplitLevels(selectedTTestField, selectedMethods) : [];
  const selectedLevels = selectedTTestField ? selectedTTestSplitLevels(selectedTTestField, selectedMethods, availableLevels) : [];
  const pairs = tTestPairs(selectedMethods);

  document.querySelector("#tTestsNote").innerHTML =
    `<strong>${fmtInt(caseRows.length)} matched cases for t tests</strong><span>${activeFilters.length ? activeFilters.join(" · ") : "All scenarios selected"}. Comparing <strong>${fmtInt(selectedMethods.length)}</strong> models across <strong>${GROUP_OPTIONS[selectedTTestField] || "selected variable"}</strong>. Mean differences are first method minus second method; negative values favor the first method.</span>`;

  const overallRows = pairs.map(([modelA, modelB], index) => ({
    modelA,
    modelB,
    result: pairedEvidenceForMethods(caseRows, modelA, modelB, 55121 + index * 101),
  }));

  document.querySelector("#tTestOverallTable tbody").innerHTML = overallRows.length
    ? overallRows.map(({ modelA, modelB, result }) => `
        <tr>
          <th>${pairLabel(modelA, modelB)}</th>
          <td>${fmtInt(result.n)}</td>
          <td class="${sigClass(result.tP)}">${fmtSignedLoss(result.meanDiff)}</td>
          <td class="${sigClass(result.tP)}">${fmtP(result.tP)}</td>
          <td>${fmtSignedLoss(result.bootLow)} to ${fmtSignedLoss(result.bootHigh)}</td>
        </tr>`).join("")
    : `<tr><td colspan="5" class="quiet">No overall t tests are available.</td></tr>`;

  const levelRows = selectedLevels.flatMap((level, levelIndex) => {
    const levelCases = caseRows.filter(item => levelValue(item[models[0]]?.[selectedTTestField]) === level);
    return pairs.map(([modelA, modelB], pairIndex) => ({
      level,
      modelA,
      modelB,
      result: pairedEvidenceForMethods(levelCases, modelA, modelB, 61721 + levelIndex * 1009 + pairIndex * 97),
    }));
  });

  document.querySelector("#tTestByLevelTable tbody").innerHTML = levelRows.length
    ? levelRows.map(({ level, modelA, modelB, result }) => `
        <tr>
          <th>${displayLevel(level)}</th>
          <td>${pairLabel(modelA, modelB)}</td>
          <td>${fmtInt(result.n)}</td>
          <td class="${sigClass(result.tP)}">${fmtSignedLoss(result.meanDiff)}</td>
          <td class="${sigClass(result.tP)}">${fmtP(result.tP)}</td>
          <td>${fmtSignedLoss(result.bootLow)} to ${fmtSignedLoss(result.bootHigh)}</td>
        </tr>`).join("")
    : `<tr><td colspan="6" class="quiet">No level-based t tests are available for the selected variable and levels.</td></tr>`;
}

function renderOverview() {
  populateOverviewFilterControls();
  const cases = comparableCases(passesOverviewFilters);
  const completed = completeCases(cases);
  const activeFilters = activeOverviewFilterLabels();
  const overviewScenarioValues = selectedOverviewFilterValues(
    "scenario_subtype",
    availableOverviewFilterValues("scenario_subtype")
  );
  const showRegression = overviewScenarioValues.length === 1 && overviewScenarioValues[0] === "static";
  const baseOverviewMethods = ACROSS_CHART_ORDER.filter(method => method === HEURISTIC_LABEL || models.includes(method));
  const overviewMethods = showRegression ? [...baseOverviewMethods, REGRESSION_LABEL] : baseOverviewMethods;
  const benchmarkCompleted = completed.filter(caseRows =>
    Number.isFinite(heuristicLoss(caseRows))
    && (!showRegression || Number.isFinite(regressionLoss(caseRows)))
  );
  const regressionItems = regressionResultsForOverview();
  const regressionTotal = regressionResultsById.size;
  const eligibleRegressionItems = regressionItems.filter(regressionIsEligible);
  const infeasibleRegressionItems = regressionItems.filter(item => !regressionIsEligible(item));
  const overviewSimilarPricingTableBody = document.querySelector("#overviewSimilarPricingTable tbody");
  const overviewOverPricingTableBody = document.querySelector("#overviewOverPricingTable tbody");
  const overviewUnderPricingTableBody = document.querySelector("#overviewUnderPricingTable tbody");
  const overviewStaticNoteEl = document.querySelector("#overviewStaticNote");
  const overviewStaticModelTableBody = document.querySelector("#overviewStaticModelTable tbody");
  const overviewStaticLeaderboardChartEl = document.querySelector("#overviewStaticLeaderboardChart");
  const regressionNoteEl = document.querySelector("#overviewRegressionNote");
  const regressionKpisEl = document.querySelector("#overviewRegressionKpis");
  const regressionWorstTableBody = document.querySelector("#overviewRegressionWorstTable tbody");
  const regressionBestTableBody = document.querySelector("#overviewRegressionBestTable tbody");
  const regressionPHatTableBody = document.querySelector("#overviewRegressionPHatTable tbody");
  const regressionRevenueTableBody = document.querySelector("#overviewRegressionRevenueTable tbody");
  const regressionSection = document.querySelector("#overviewRegressionSection");

  if (regressionSection) regressionSection.hidden = !showRegression;

  document.querySelector("#caseCount").textContent = fmtInt(cases.length);
  document.querySelector("#completeCount").textContent = fmtInt(completed.length);
  document.querySelector("#sourceCount").textContent = fmtInt(rows.length);

  const casePointCounts = new Map(overviewMethods.map(model => [model, 0]));
  benchmarkCompleted.forEach(caseRows => {
    const caseItems = overviewMethods.map(model => ({
      model,
      loss: benchmarkLoss(caseRows, model),
    })).filter(item => Number.isFinite(item.loss));
    if (!caseItems.length) return;
    const bestLoss = Math.min(...caseItems.map(item => item.loss));
    const winners = caseItems.filter(item => Math.abs(item.loss - bestLoss) < 1e-12);
    const pointShare = winners.length ? 1 / winners.length : 0;
    winners.forEach(item => {
      casePointCounts.set(item.model, (casePointCounts.get(item.model) || 0) + pointShare);
    });
  });
  const totalCasePoints = [...casePointCounts.values()].reduce((sum, value) => sum + value, 0);
  const caseLeaderboard = overviewMethods.map(model => {
    const losses = benchmarkLosses(benchmarkCompleted, model);
    return {
      model,
      comparedCases: losses.length,
      meanLoss: mean(losses),
      casePoints: casePointCounts.get(model) || 0,
    };
  }).filter(item => Number.isFinite(item.meanLoss));

  const rankedCaseLeaderboard = [...caseLeaderboard]
    .sort((a, b) =>
      b.casePoints - a.casePoints
        || a.meanLoss - b.meanLoss
        || a.model.localeCompare(b.model)
    );
  document.querySelector("#overviewNote").innerHTML =
    `<strong>${fmtInt(benchmarkCompleted.length)} complete paired cases for this leaderboard</strong><span>${activeFilters.length ? activeFilters.join(" · ") : "All overview filters selected"}. Overview comparisons include <strong>Heuristic</strong>${showRegression ? " and <strong>Regression Heuristic</strong>" : ""}. The case leaderboard below awards <strong>1 shared point per case</strong>, so a two-way tie gives <strong>0.5</strong> to each tied method.${showRegression ? " Regression Heuristic is included only for the eligible static fits." : ""}</span>`;

  document.querySelector("#overviewCaseLeaderboardTable tbody").innerHTML = rankedCaseLeaderboard.length
    ? rankedCaseLeaderboard.map((item, index) => `
        <tr>
          <th>${index + 1}</th>
          <td class="${index === 0 ? "winner-cell" : ""}">${item.model}</td>
          <td class="${index === 0 ? "winner-cell" : ""}">${fmtNum(item.casePoints)}</td>
          <td>${fmtPct(totalCasePoints ? item.casePoints / totalCasePoints : NaN)}</td>
          <td>${fmtLoss(item.meanLoss)}</td>
          <td>${fmtInt(item.comparedCases)}</td>
        </tr>`).join("")
    : `<tr><td colspan="6" class="quiet">No case leaderboard is available for the current filters.</td></tr>`;

  document.querySelector("#overviewLeaderboardChart").innerHTML = rankedCaseLeaderboard.length
    ? renderAcrossMeanChart(rankedCaseLeaderboard.map(item => ({
        model: item.model,
        n: item.comparedCases,
        meanLoss: item.meanLoss,
      })))
    : `<p class="quiet">No case mean-loss chart is available for the current filters.</p>`;

  const caseMetricSummaries = overviewMethods.map(model => {
    const losses = benchmarkLosses(benchmarkCompleted, model);
    const directions = benchmarkCompleted.reduce((counts, caseRows) => {
      const direction = benchmarkPriceDirection(caseRows, model);
      if (direction) counts[direction] += 1;
      return counts;
    }, { under: 0, similar: 0, over: 0 });
    const directionTotal = directions.under + directions.similar + directions.over;
    return {
      model,
      caseCount: losses.length,
      nearOptimalCount: losses.filter(value => value <= NEAR_OPTIMAL_THRESHOLD).length,
      nearOptimalRate: shareWhere(losses, value => value <= NEAR_OPTIMAL_THRESHOLD),
      severeLossCount: losses.filter(value => value >= SEVERE_LOSS_THRESHOLD).length,
      severeLossRate: shareWhere(losses, value => value >= SEVERE_LOSS_THRESHOLD),
      underPricingCount: directions.under,
      underPricingRate: directionTotal ? directions.under / directionTotal : NaN,
      similarPricingCount: directions.similar,
      similarPricingRate: directionTotal ? directions.similar / directionTotal : NaN,
      overPricingCount: directions.over,
      overPricingRate: directionTotal ? directions.over / directionTotal : NaN,
    };
  }).filter(item => item.caseCount);

  const nearOptimalRanked = [...caseMetricSummaries]
    .sort((a, b) =>
      b.nearOptimalCount - a.nearOptimalCount
        || b.nearOptimalRate - a.nearOptimalRate
        || a.model.localeCompare(b.model)
    );

  document.querySelector("#overviewNearOptimalTable tbody").innerHTML = nearOptimalRanked.length
    ? nearOptimalRanked.map((item, index) => `
        <tr>
          <th>${index + 1}</th>
          <td class="${index === 0 ? "winner-cell" : ""}">${item.model}</td>
          <td class="${index === 0 ? "winner-cell" : ""}">${fmtInt(item.nearOptimalCount)}</td>
          <td>${fmtPct(item.nearOptimalRate)}</td>
          <td>${fmtInt(item.caseCount)}</td>
        </tr>`).join("")
    : `<tr><td colspan="5" class="quiet">No near-optimal leaderboard is available for the current filters.</td></tr>`;

  const severeLossRanked = [...caseMetricSummaries]
    .sort((a, b) =>
      a.severeLossCount - b.severeLossCount
        || a.severeLossRate - b.severeLossRate
        || a.model.localeCompare(b.model)
    );

  document.querySelector("#overviewSevereLossTable tbody").innerHTML = severeLossRanked.length
    ? severeLossRanked.map((item, index) => `
        <tr>
          <th>${index + 1}</th>
          <td class="${index === 0 ? "winner-cell" : ""}">${item.model}</td>
          <td class="${index === 0 ? "winner-cell" : ""}">${fmtInt(item.severeLossCount)}</td>
          <td>${fmtPct(item.severeLossRate)}</td>
          <td>${fmtInt(item.caseCount)}</td>
        </tr>`).join("")
    : `<tr><td colspan="5" class="quiet">No severe-loss leaderboard is available for the current filters.</td></tr>`;

  const underPricingRanked = [...caseMetricSummaries]
    .sort((a, b) =>
      a.underPricingCount - b.underPricingCount
        || a.underPricingRate - b.underPricingRate
        || a.model.localeCompare(b.model)
    );

  if (overviewUnderPricingTableBody) {
    overviewUnderPricingTableBody.innerHTML = underPricingRanked.length
      ? underPricingRanked.map((item, index) => `
          <tr>
            <th>${index + 1}</th>
            <td class="${index === 0 ? "winner-cell" : ""}">${item.model}</td>
            <td class="${index === 0 ? "winner-cell" : ""}">${fmtInt(item.underPricingCount)}</td>
            <td>${fmtPct(item.underPricingRate)}</td>
            <td>${fmtInt(item.caseCount)}</td>
          </tr>`).join("")
      : `<tr><td colspan="5" class="quiet">No under-pricing leaderboard is available for the current filters.</td></tr>`;
  }

  const similarPricingRanked = [...caseMetricSummaries]
    .sort((a, b) =>
      b.similarPricingCount - a.similarPricingCount
        || b.similarPricingRate - a.similarPricingRate
        || a.model.localeCompare(b.model)
    );

  if (overviewSimilarPricingTableBody) {
    overviewSimilarPricingTableBody.innerHTML = similarPricingRanked.length
      ? similarPricingRanked.map((item, index) => `
          <tr>
            <th>${index + 1}</th>
            <td class="${index === 0 ? "winner-cell" : ""}">${item.model}</td>
            <td class="${index === 0 ? "winner-cell" : ""}">${fmtInt(item.similarPricingCount)}</td>
            <td>${fmtPct(item.similarPricingRate)}</td>
            <td>${fmtInt(item.caseCount)}</td>
          </tr>`).join("")
      : `<tr><td colspan="5" class="quiet">No similar-pricing leaderboard is available for the current filters.</td></tr>`;
  }

  const overPricingRanked = [...caseMetricSummaries]
    .sort((a, b) =>
      a.overPricingCount - b.overPricingCount
        || a.overPricingRate - b.overPricingRate
        || a.model.localeCompare(b.model)
    );

  if (overviewOverPricingTableBody) {
    overviewOverPricingTableBody.innerHTML = overPricingRanked.length
      ? overPricingRanked.map((item, index) => `
          <tr>
            <th>${index + 1}</th>
            <td class="${index === 0 ? "winner-cell" : ""}">${item.model}</td>
            <td class="${index === 0 ? "winner-cell" : ""}">${fmtInt(item.overPricingCount)}</td>
            <td>${fmtPct(item.overPricingRate)}</td>
            <td>${fmtInt(item.caseCount)}</td>
          </tr>`).join("")
      : `<tr><td colspan="5" class="quiet">No over-pricing leaderboard is available for the current filters.</td></tr>`;
  }

  const staticMethods = overviewMethods.includes(REGRESSION_LABEL)
    ? overviewMethods
    : [...overviewMethods, REGRESSION_LABEL];
  const staticBenchmarkCompleted = benchmarkCompleted.filter(caseRows =>
    levelValue(overviewMethods
      .filter(method => method !== HEURISTIC_LABEL)
      .map(method => caseRows[method])
      .find(Boolean)?.scenario_subtype) === "static"
    && Number.isFinite(regressionLoss(caseRows))
  );
  const staticPointCounts = new Map(staticMethods.map(model => [model, 0]));
  staticBenchmarkCompleted.forEach(caseRows => {
    const caseItems = staticMethods.map(model => ({
      model,
      loss: benchmarkLoss(caseRows, model),
    })).filter(item => Number.isFinite(item.loss));
    if (!caseItems.length) return;
    const bestLoss = Math.min(...caseItems.map(item => item.loss));
    const winners = caseItems.filter(item => Math.abs(item.loss - bestLoss) < 1e-12);
    const pointShare = winners.length ? 1 / winners.length : 0;
    winners.forEach(item => {
      staticPointCounts.set(item.model, (staticPointCounts.get(item.model) || 0) + pointShare);
    });
  });
  const staticPerformance = staticMethods.map(model => {
    const losses = benchmarkLosses(staticBenchmarkCompleted, model);
    return {
      model,
      comparedCases: losses.length,
      meanLoss: mean(losses),
      nearOptimalRate: shareWhere(losses, value => value <= NEAR_OPTIMAL_THRESHOLD),
      severeLossRate: shareWhere(losses, value => value >= SEVERE_LOSS_THRESHOLD),
      casePoints: staticPointCounts.get(model) || 0,
    };
  }).filter(item => item.comparedCases);
  const rankedStaticPerformance = [...staticPerformance]
    .sort((a, b) =>
      a.meanLoss - b.meanLoss
      || b.casePoints - a.casePoints
      || a.severeLossRate - b.severeLossRate
      || a.model.localeCompare(b.model)
    );
  const totalStaticPoints = [...staticPointCounts.values()].reduce((sum, value) => sum + value, 0);

  if (overviewStaticNoteEl) {
    overviewStaticNoteEl.innerHTML = staticBenchmarkCompleted.length
      ? `<strong>${fmtInt(staticBenchmarkCompleted.length)} filtered static benchmark cases with regression output</strong><span>${activeFilters.length ? activeFilters.join(" · ") : "All overview filters selected"}. This section keeps only the <strong>static</strong> cases from the current overview filter set and compares <strong>GPT</strong>, <strong>Gemini</strong>, <strong>Claude</strong>, <strong>Heuristic</strong>, and <strong>Regression Heuristic</strong> on the same case set. Regression Heuristic uses the absolute <strong>revenue gap</strong> from <strong>Revenue_hat</strong> to <strong>Revenue_star</strong> as its loss measure.</span>`
      : `<strong>No static benchmark cases with regression output for the current filters</strong><span>Try including <strong>static</strong> in the scenario filter or relaxing the current overview filters.</span>`;
  }

  if (overviewStaticModelTableBody) {
    overviewStaticModelTableBody.innerHTML = rankedStaticPerformance.length
      ? rankedStaticPerformance.map((item, index) => `
          <tr>
            <th>${index + 1}</th>
            <td class="${index === 0 ? "winner-cell" : ""}">${item.model}</td>
            <td class="${index === 0 ? "winner-cell" : ""}">${fmtLoss(item.meanLoss)}</td>
            <td>${fmtPct(item.nearOptimalRate)}</td>
            <td>${fmtPct(item.severeLossRate)}</td>
            <td>${fmtNum(item.casePoints)} <span class="quiet">(${fmtPct(totalStaticPoints ? item.casePoints / totalStaticPoints : NaN)})</span></td>
            <td>${fmtInt(item.comparedCases)}</td>
          </tr>`).join("")
      : `<tr><td colspan="7" class="quiet">No static across-method table is available for the current filters.</td></tr>`;
  }

  if (overviewStaticLeaderboardChartEl) {
    overviewStaticLeaderboardChartEl.innerHTML = rankedStaticPerformance.length
      ? renderAcrossMeanChart(rankedStaticPerformance.map(item => ({
          model: item.model,
          n: item.comparedCases,
          meanLoss: item.meanLoss,
        })))
      : `<p class="quiet">No static across-method chart is available for the current filters.</p>`;
  }

  const meanRSquared = mean(eligibleRegressionItems.map(item => item.r_squared).filter(Number.isFinite));
  const meanAbsPriceGap = mean(eligibleRegressionItems.map(item => Math.abs(item.price_pct_gap)).filter(Number.isFinite));
  const meanAbsRevenueGap = mean(eligibleRegressionItems.map(item => Math.abs(item.revenue_pct_gap)).filter(Number.isFinite));
  if (regressionNoteEl) {
    regressionNoteEl.innerHTML = regressionItems.length
      ? `<strong>${fmtInt(regressionItems.length)} filtered static instances with regression diagnostics</strong><span>${activeFilters.length ? activeFilters.join(" · ") : "All overview filters selected"}. Regression diagnostics are available only for <strong>static</strong> cases and summarize the underlying benchmark instances rather than any model's answer. Absolute percentage gaps compare the regression fit against the benchmark optimum.${infeasibleRegressionItems.length ? ` <strong>${fmtInt(infeasibleRegressionItems.length)} infeasible fit is shown below but excluded from averages and leaderboards.</strong>` : ""}</span>`
      : `<strong>No static regression diagnostics for the current filters</strong><span>Regression diagnostics are only available for the <strong>static</strong> instances. Try including static in the scenario filter or relaxing the current overview filters.</span>`;
  }

  if (regressionKpisEl) {
    regressionKpisEl.innerHTML = [
      kpi("Static instances", fmtInt(eligibleRegressionItems.length), `${fmtInt(regressionTotal)} total static instances have regression output${infeasibleRegressionItems.length ? `; ${fmtInt(infeasibleRegressionItems.length)} infeasible fit excluded` : ""}`),
      kpi("Mean R²", fmtNum(meanRSquared), "Higher indicates a tighter linear fit on the sampled price-demand points"),
      kpi("Mean |price gap|", fmtPct(meanAbsPriceGap), "Absolute percent gap between fitted price and optimal price"),
      kpi("Mean |revenue gap|", fmtPct(meanAbsRevenueGap), "Absolute percent gap between fitted revenue and optimal revenue"),
    ].join("");
  }

  const worstRegressionItems = [...regressionItems]
    .sort((a, b) =>
      Math.abs(b.revenue_pct_gap) - Math.abs(a.revenue_pct_gap)
      || Math.abs(b.price_pct_gap) - Math.abs(a.price_pct_gap)
      || a.instance_id.localeCompare(b.instance_id)
    )
    .slice(0, 12);

  if (regressionWorstTableBody) {
    regressionWorstTableBody.innerHTML = worstRegressionItems.length
      ? worstRegressionItems.map(item => `
          <tr>
            <th>${item.instance_id}</th>
            <td>${regressionStatus(item)}</td>
            <td>${displayLevel(item.demand_model)}</td>
            <td>${displayLevel(item.parameter_set)}</td>
            <td>${displayLevel(item.sigma)}</td>
            <td>${displayLevel(item.history_length)}${item.history_term ? ` (${displayLevel(item.history_term)})` : ""}</td>
            <td>${displayLevel(item.mc)}</td>
            <td>${fmtNum(item.r_squared)}</td>
            <td>${fmtPct(Math.abs(item.price_pct_gap))}</td>
            <td>${fmtPct(Math.abs(item.revenue_pct_gap))}</td>
          </tr>`).join("")
      : `<tr><td colspan="10" class="quiet">No static regression instances match the current overview filters.</td></tr>`;
  }

  const bestRegressionItems = [...eligibleRegressionItems]
    .sort((a, b) =>
      Math.abs(a.revenue_pct_gap) - Math.abs(b.revenue_pct_gap)
      || Math.abs(a.price_pct_gap) - Math.abs(b.price_pct_gap)
      || b.r_squared - a.r_squared
      || a.instance_id.localeCompare(b.instance_id)
    )
    .slice(0, 12);

  if (regressionBestTableBody) {
    regressionBestTableBody.innerHTML = bestRegressionItems.length
      ? bestRegressionItems.map(item => `
          <tr>
            <th>${item.instance_id}</th>
            <td>${regressionStatus(item)}</td>
            <td>${displayLevel(item.demand_model)}</td>
            <td>${displayLevel(item.parameter_set)}</td>
            <td>${displayLevel(item.sigma)}</td>
            <td>${displayLevel(item.history_length)}${item.history_term ? ` (${displayLevel(item.history_term)})` : ""}</td>
            <td>${displayLevel(item.mc)}</td>
            <td>${fmtNum(item.r_squared)}</td>
            <td>${fmtPct(Math.abs(item.price_pct_gap))}</td>
            <td>${fmtPct(Math.abs(item.revenue_pct_gap))}</td>
          </tr>`).join("")
      : `<tr><td colspan="10" class="quiet">No eligible static regression instances match the current overview filters.</td></tr>`;
  }

  const topPHatItems = [...eligibleRegressionItems]
    .filter(item => Number.isFinite(item.p_hat))
    .sort((a, b) =>
      Math.abs(a.price_gap) - Math.abs(b.price_gap)
      || Math.abs(a.price_pct_gap) - Math.abs(b.price_pct_gap)
      || a.instance_id.localeCompare(b.instance_id)
    )
    .slice(0, 12);

  if (regressionPHatTableBody) {
    regressionPHatTableBody.innerHTML = topPHatItems.length
      ? topPHatItems.map((item, index) => `
          <tr>
            <th>${index + 1}</th>
            <td>${item.instance_id}</td>
            <td>${displayLevel(item.demand_model)}</td>
            <td>${displayLevel(item.parameter_set)}</td>
            <td>${displayLevel(item.sigma)}</td>
            <td>${displayLevel(item.history_length)}${item.history_term ? ` (${displayLevel(item.history_term)})` : ""}</td>
            <td>${displayLevel(item.mc)}</td>
            <td>${fmtNum(item.p_hat)}</td>
            <td>${fmtNum(item.p_star)}</td>
            <td>${fmtSignedLoss(item.price_pct_gap)} <span class="quiet">(${fmtNum(item.price_gap)})</span></td>
          </tr>`).join("")
      : `<tr><td colspan="10" class="quiet">No static regression fitted prices match the current overview filters.</td></tr>`;
  }

  const topRevenueItems = [...eligibleRegressionItems]
    .filter(item => Number.isFinite(item.revenue_hat) && Number.isFinite(item.revenue_star))
    .sort((a, b) =>
      Math.abs(a.revenue_gap) - Math.abs(b.revenue_gap)
      || Math.abs(a.revenue_pct_gap) - Math.abs(b.revenue_pct_gap)
      || a.instance_id.localeCompare(b.instance_id)
    )
    .slice(0, 12);

  if (regressionRevenueTableBody) {
    regressionRevenueTableBody.innerHTML = topRevenueItems.length
      ? topRevenueItems.map((item, index) => `
          <tr>
            <th>${index + 1}</th>
            <td>${item.instance_id}</td>
            <td>${displayLevel(item.demand_model)}</td>
            <td>${displayLevel(item.parameter_set)}</td>
            <td>${displayLevel(item.sigma)}</td>
            <td>${displayLevel(item.history_length)}${item.history_term ? ` (${displayLevel(item.history_term)})` : ""}</td>
            <td>${displayLevel(item.mc)}</td>
            <td>${fmtNum(item.revenue_hat)}</td>
            <td>${fmtNum(item.revenue_star)}</td>
            <td>${fmtSignedLoss(item.revenue_pct_gap)} <span class="quiet">(${fmtNum(item.revenue_gap)})</span></td>
          </tr>`).join("")
      : `<tr><td colspan="10" class="quiet">No static regression fitted revenues match the current overview filters.</td></tr>`;
  }
}

function renderWithinTests() {
  populateWithinTestControls();
  const allMode = selectedWithinTestMode === "selected";
  const labelA = withinLevelLabel(selectedWithinTestField, selectedWithinTestLevelA);
  const labelB = withinLevelLabel(selectedWithinTestField, selectedWithinTestLevelB);
  if (allMode) {
    const selectedAllLevels = selectedWithinAllSelections(selectedWithinTestModels, selectedWithinTestField);
    const allLevels = selectedAllLevels.map(item => item.b);
    if (allLevels.length < 2) {
      document.querySelector("#caseCount").textContent = "0";
      document.querySelector("#completeCount").textContent = "0";
      document.querySelector("#sourceCount").textContent = fmtInt(rows.length);
      document.querySelector("#withinTestsNote").innerHTML =
        `<strong>Select at least 2 levels</strong><span>Click two or more <strong>${GROUP_OPTIONS[selectedWithinTestField].toLowerCase()}</strong> values in the included-levels list to build exact within-model matches.</span>`;
      document.querySelector("#withinTestCombinedTitle").textContent = `${GROUP_OPTIONS[selectedWithinTestField]}: one bar per level`;
      document.querySelector("#withinTestCombinedNote").textContent = "Click two or more levels to compare them together";
      document.querySelector("#withinTestCombinedChart").innerHTML = `<p class="quiet">No comparison is shown until at least two levels are selected.</p>`;
      document.querySelector("#withinTestPanels").innerHTML = "";
      return;
    }
    const panelData = selectedWithinTestModels.map(model => {
      const { matchedKeys, rowsByLevel } = withinAllLevelRowsFor(model, selectedWithinTestField, allLevels);
      const levelRows = allLevels.map(level => {
        const levelSourceRows = rowsByLevel.get(level) || [];
        const losses = levelSourceRows.map(row => row.rel_rev_loss).filter(Number.isFinite);
        return {
          level,
          rows: levelSourceRows,
          n: losses.length,
          meanLoss: mean(losses),
          q25: quantile(losses, 0.25),
          q50: quantile(losses, 0.5),
          q75: quantile(losses, 0.75),
        };
      }).filter(item => item.n);
      return { model, matchedKeys, levelRows };
    }).filter(item => item.levelRows.length);
    const totalMatchedKeys = panelData.reduce((sum, item) => sum + item.matchedKeys, 0);

    document.querySelector("#caseCount").textContent = fmtInt(totalMatchedKeys);
    document.querySelector("#completeCount").textContent = fmtInt(totalMatchedKeys);
    document.querySelector("#sourceCount").textContent = fmtInt(rows.length);
    document.querySelector("#withinTestsNote").innerHTML =
      `<strong>${fmtInt(totalMatchedKeys)} matched within-model cases</strong><span>Comparing <strong>${GROUP_OPTIONS[selectedWithinTestField]}</strong> across ${fmtInt(allLevels.length)} selected levels. Each bar shows one concrete level exactly once for each selected LLM. A case contributes when the same benchmark input appears for that LLM with at least one other selected level of ${GROUP_OPTIONS[selectedWithinTestField].toLowerCase()}; no pairwise expansion is shown.</span>`;

    document.querySelector("#withinTestCombinedTitle").textContent = `${GROUP_OPTIONS[selectedWithinTestField]}: one bar per level`;
    document.querySelector("#withinTestCombinedNote").textContent =
      `${fmtInt(allLevels.length)} selected levels shown once for each selected LLM${selectedWithinTestField === "env_hint" ? "; seasonal cases only" : ""}`;
    document.querySelector("#withinTestCombinedChart").innerHTML = panelData.length
      ? `<div class="within-all-model-grid">${panelData.map(({ model, levelRows }) => `
          <section class="within-all-summary-card">
            <h3>${model}</h3>
            ${renderLevelMeanBarChart(levelRows.map(item => ({
                label: withinLevelLabel(selectedWithinTestField, item.level),
                value: item.meanLoss,
                className: modelMeta(model).colorClass,
              })), {
                compact: true,
                xAxisTitle: GROUP_OPTIONS[selectedWithinTestField],
              })}
          </section>`).join("")}</div>`
      : `<p class="quiet">No matched multi-level cases available.</p>`;

    document.querySelector("#withinTestPanels").innerHTML = panelData.map(({ model, matchedKeys, levelRows }) => {
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
              <p>${fmtInt(matchedKeys)} matched cases across ${fmtInt(levelRows.length)} levels</p>
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
                    <th>${withinLevelLabel(selectedWithinTestField, item.level)}</th>
                    <td>${fmtInt(item.n)}</td>
                    <td class="${item.level === bestMean ? "winner-cell" : ""}">${fmtLoss(item.meanLoss)}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
          <div class="card-heading compact-heading">
            <h2>Mean-loss bars</h2>
            <span>One bar per level</span>
          </div>
          ${renderLevelMeanBarChart(levelRows.map(item => ({
              label: withinLevelLabel(selectedWithinTestField, item.level),
              value: item.meanLoss,
              className: meta.colorClass,
            })), {
              xAxisTitle: GROUP_OPTIONS[selectedWithinTestField],
            })}
          <div class="card-heading compact-heading">
            <h2>Under / equal / over pricing</h2>
            <span>Matched cases only</span>
          </div>
          <div class="direction-list compact-direction">
            ${renderDirectionBars(levelRows.map(item => ({
              label: withinLevelLabel(selectedWithinTestField, item.level),
              rows: item.rows,
            })))}
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
                    <th>${withinLevelLabel(selectedWithinTestField, item.level)}</th>
                    <td class="${item.level === bestQ25 ? "winner-cell" : ""}">${fmtLoss(item.q25)}</td>
                    <td class="${item.level === bestQ50 ? "winner-cell" : ""}">${fmtLoss(item.q50)}</td>
                    <td class="${item.level === bestQ75 ? "winner-cell" : ""}">${fmtLoss(item.q75)}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </article>`;
    }).join("");
    return;
  }

  const comparison = `${labelA} - ${labelB}`;
  const comparisons = [{ a: selectedWithinTestLevelA, b: selectedWithinTestLevelB }];
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
  document.querySelector("#withinTestsNote").innerHTML =
    `<strong>${fmtInt(totalPairs)} matched within-model pairs</strong><span>Comparing <strong>${GROUP_OPTIONS[selectedWithinTestField]}</strong> levels ${labelA} and ${labelB}. The controls only show level pairs that have exact matches for the selected LLMs. Each pair is identical on every benchmark input column except ${GROUP_OPTIONS[selectedWithinTestField]}; <code>variant</code> is ignored because it labels the condition.</span>`;

  const combinedItems = panelData.map(({ model, pairs, evidence, comparison: comparisonItem, comparisonLabel }) => ({
    title: modelMeta(model).short,
    leftLabel: withinLevelLabel(selectedWithinTestField, comparisonItem.a),
    rightLabel: withinLevelLabel(selectedWithinTestField, comparisonItem.b),
    leftMean: mean(pairs.map(pair => pair.a.rel_rev_loss).filter(Number.isFinite)),
    rightMean: mean(pairs.map(pair => pair.b.rel_rev_loss).filter(Number.isFinite)),
    leftClass: "pair-one",
    rightClass: "pair-two",
    pValue: evidence.tP,
  }));
  document.querySelector("#withinTestCombinedTitle").textContent = `${GROUP_OPTIONS[selectedWithinTestField]}: matched mean loss`;
  document.querySelector("#withinTestCombinedNote").textContent = selectedWithinTestField === "env_hint"
    ? `${labelA} and ${labelB} shown side by side for each LLM; seasonal cases only`
    : `${labelA} and ${labelB} shown side by side for each LLM`;
  document.querySelector("#withinTestCombinedChart").innerHTML = renderPairMeanCards(combinedItems, {
    showPValues: false,
    showValues: true,
    withinStyle: true,
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
            showPValues: false,
            showValues: true,
            withinStyle: true,
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
  const availableDemandModels = availableAcrossDemandModels();
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
  const selectedDemandModelLabels = selectedAcrossDemandModels.map(displayLevel);
  let demandModelNote = "Select one or more demand models to run the across-model comparison.";
  if (selectedAcrossDemandModels.length && selectedAcrossDemandModels.length === availableDemandModels.length) {
    demandModelNote = "Using all demand models.";
  } else if (selectedAcrossDemandModels.length) {
    demandModelNote = `Filtered to <strong>${fmtInt(selectedAcrossDemandModels.length)}</strong> demand models: <strong>${selectedDemandModelLabels.join(", ")}</strong>.`;
  }
  document.querySelector("#acrossNote").innerHTML =
    `<strong>${fmtInt(cases.length)} matched inputs</strong><span>${demandModelNote} Each row is matched by the normalized benchmark-input key. Mean loss and wins use only the ${fmtInt(completed.length)} cases where every model has a numeric answer and relative revenue loss.</span>`;

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
  document.querySelector("#acrossOverviewDirectionBars").innerHTML = renderDirectionBars(models.map(model => ({
    label: model,
    rows: completed.map(caseRows => caseRows[model]),
  })));

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
  let fieldCache = withinGroupSummaryCache.get(selectedWithinGroup);
  if (!fieldCache) {
    fieldCache = new Map();
    withinGroupSummaryCache.set(selectedWithinGroup, fieldCache);
  }
  if (fieldCache.has(model)) {
    return fieldCache.get(model);
  }

  const modelRows = rowsByModel.get(model) || [];
  const groups = new Map();
  modelRows.forEach(row => {
    const level = levelValue(row[selectedWithinGroup]);
    const groupRows = groups.get(level) || [];
    groupRows.push(row);
    groups.set(level, groupRows);
  });

  const summaries = [...groups.entries()].map(([level, groupRows]) => {
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
  fieldCache.set(model, summaries);
  return summaries;
}

function renderWithinModelPanel(model) {
  const summaries = withinGroupSummaries(model);
  const modelRows = rowsByModel.get(model) || [];
  const answeredRows = answeredRowsByModel.get(model) || [];
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
      <div class="card-heading compact-heading">
        <h2>Under / similar / over pricing</h2>
        <span>Similar means within +/-5% of the optimal price</span>
      </div>
      <div class="direction-list compact-direction">
        ${renderDirectionBars(summaries
          .filter(item => item.answered)
          .map(item => ({
            label: displayLevel(item.level),
            rows: item.rows,
          })))}
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
  if (selectedTab === "overview") renderOverview();
  if (selectedTab === "across") renderAcross();
  if (selectedTab === "tests") renderTests();
  if (selectedTab === "tTestsAcross") renderAcrossTTests();
  if (selectedTab === "tTestsWithin") renderWithinTTests();
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

document.querySelector("#acrossDemandModelList").addEventListener("change", event => {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") return;
  selectedAcrossDemandModels = [...document.querySelectorAll("#acrossDemandModelList input:checked")]
    .map(input => input.value);
  renderAcross();
});

document.querySelector("#acrossDemandModelReset").addEventListener("click", () => {
  selectedAcrossDemandModels = availableAcrossDemandModels();
  renderAcross();
});

document.querySelector("#withinGroupPicker").addEventListener("change", event => {
  selectedWithinGroup = event.target.value;
  renderWithin();
});

document.addEventListener("click", event => {
  const overviewResetButton = event.target.closest("[data-overview-filter-reset]");
  if (overviewResetButton) {
    const field = overviewResetButton.dataset.overviewFilterReset;
    const available = availableOverviewFilterValues(field);
    const selected = selectedOverviewFilterValues(field, available);
    selectedOverviewFilters[field] = selected.length === available.length ? [] : [...available];
    rerenderWithOpenDropdowns(renderOverview);
    return;
  }

  const resetButton = event.target.closest("[data-test-filter-reset]");
  if (resetButton) {
    const field = resetButton.dataset.testFilterReset;
    const available = availableTestFilterValues(field);
    const selected = selectedTestFilterValues(field, available);
    selectedTestFilters[field] = selected.length === available.length ? [] : [...available];
    const renderer = resetButton.closest("#tTestsAcross") ? renderAcrossTTests : render;
    rerenderWithOpenDropdowns(renderer);
    return;
  }

  const openDropdowns = document.querySelectorAll(".multi-select[open]");
  openDropdowns.forEach(dropdown => {
    if (!dropdown.contains(event.target)) dropdown.open = false;
  });
});

document.addEventListener("change", event => {
  const host = event.target.closest("[data-test-filter-list]");
  if (!host || !(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") return;
  const field = host.dataset.testFilterList;
  selectedTestFilters[field] = [...host.querySelectorAll("input:checked")].map(input => input.value);
  const renderer = host.closest("#tTestsAcross") ? renderAcrossTTests : render;
  rerenderWithOpenDropdowns(renderer);
});

document.addEventListener("change", event => {
  const host = event.target.closest("[data-overview-filter-list]");
  if (!host || !(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") return;
  const field = host.dataset.overviewFilterList;
  selectedOverviewFilters[field] = [...host.querySelectorAll("input:checked")].map(input => input.value);
  rerenderWithOpenDropdowns(renderOverview);
});

document.querySelector("#resetOverviewFilters").addEventListener("click", () => {
  selectedOverviewFilters = {};
  renderOverview();
});

document.querySelector("#resetTestFilters").addEventListener("click", () => {
  selectedTestFilters = {};
  render();
});

document.addEventListener("click", event => {
  if (!event.target.closest("#resetTTestAcrossFilters")) return;
  selectedTestFilters = {};
  renderAcrossTTests();
});

document.querySelector("#tTestAcrossModelList").addEventListener("change", event => {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") return;
  selectedTTestModels = [...document.querySelectorAll("#tTestAcrossModelList input:checked")]
    .map(input => input.value);
  renderAcrossTTests();
});

document.querySelector("#tTestAcrossModelReset").addEventListener("click", () => {
  selectedTTestModels = availableTTestMethods(true);
  renderAcrossTTests();
});

document.querySelector("#tTestAcrossField").addEventListener("change", event => {
  selectedTTestField = event.target.value;
  selectedTTestLevels = [];
  renderAcrossTTests();
});

document.querySelector("#tTestAcrossLevelList").addEventListener("change", event => {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") return;
  selectedTTestLevels = [...document.querySelectorAll("#tTestAcrossLevelList input:checked")]
    .map(input => input.value);
  renderAcrossTTests();
});

document.querySelector("#tTestAcrossLevelReset").addEventListener("click", () => {
  selectedTTestLevels = availableAcrossTTestLevels(selectedTTestField, selectedTTestModels);
  renderAcrossTTests();
});

document.querySelector("#tTestWithinModelList").addEventListener("change", event => {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") return;
  selectedTTestWithinModels = [...document.querySelectorAll("#tTestWithinModelList input:checked")]
    .map(input => input.value);
  renderWithinTTests();
});

document.querySelector("#tTestWithinModelReset").addEventListener("click", () => {
  selectedTTestWithinModels = availableTTestMethods();
  renderWithinTTests();
});

document.addEventListener("click", event => {
  const compareButton = event.target.closest("[data-within-t-test-compare-field]");
  if (compareButton) {
    const field = compareButton.dataset.withinTTestCompareField;
    if (field && field !== selectedTTestWithinField) {
      selectedTTestWithinCompareField = field;
      selectedTTestWithinCompareLevels = [];
      rerenderWithOpenDropdowns(renderWithinTTests);
    }
    return;
  }

  const splitButton = event.target.closest("[data-within-t-test-split-field]");
  if (splitButton) {
    const field = splitButton.dataset.withinTTestSplitField;
    if (field && field !== selectedTTestWithinCompareField) {
      selectedTTestWithinField = field;
      selectedTTestWithinLevels = [];
      rerenderWithOpenDropdowns(renderWithinTTests);
    }
    return;
  }

  const resetButton = event.target.closest("[data-within-t-test-filter-reset]");
  if (!resetButton) return;
  const field = resetButton.dataset.withinTTestFilterReset;
  const available = availableWithinTTestFilterValues(field, selectedTTestWithinModels);
  const selected = selectedWithinTTestFilterValues(field, selectedTTestWithinModels, available);
  selectedWithinTTestFilters[field] = selected.length === available.length ? [] : [...available];
  if (field === selectedTTestWithinCompareField) selectedTTestWithinCompareLevels = [...selectedWithinTTestFilters[field]];
  if (field === selectedTTestWithinField) selectedTTestWithinLevels = [...selectedWithinTTestFilters[field]];
  rerenderWithOpenDropdowns(renderWithinTTests);
});

document.addEventListener("change", event => {
  const host = event.target.closest("[data-within-t-test-filter-list]");
  if (!host || !(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") return;
  const field = host.dataset.withinTTestFilterList;
  selectedWithinTTestFilters[field] = [...host.querySelectorAll("input:checked")].map(input => input.value);
  if (field === selectedTTestWithinCompareField) {
    selectedTTestWithinCompareLevels = [...selectedWithinTTestFilters[field]];
  }
  if (field === selectedTTestWithinField) {
    selectedTTestWithinLevels = [...selectedWithinTTestFilters[field]];
  }
  rerenderWithOpenDropdowns(renderWithinTTests);
});

document.querySelector("#tTestWithinExtraFiltersReset").addEventListener("click", () => {
  selectedTTestWithinCompareField = "scenario_subtype";
  selectedTTestWithinCompareLevels = ["static", "seasonal"];
  selectedTTestWithinField = "demand_model";
  selectedTTestWithinLevels = [];
  selectedWithinTTestFilters = {
    scenario_subtype: ["static", "seasonal"],
  };
  renderWithinTTests();
});

document.querySelector("#withinTestModels").addEventListener("change", event => {
  selectedWithinTestModels = [...event.target.selectedOptions].map(option => option.value);
  selectedWithinTestLevelA = "";
  selectedWithinTestLevelB = "";
  selectedWithinTestIncludedLevels = [];
  renderWithinTests();
});

document.querySelector("#withinTestField").addEventListener("change", event => {
  selectedWithinTestField = event.target.value;
  if (selectedWithinTestMode === "pair") {
    selectedWithinTestLevelA = "";
    selectedWithinTestLevelB = "";
  }
  selectedWithinTestIncludedLevels = [];
  renderWithinTests();
});

document.querySelector("#withinTestMode").addEventListener("change", event => {
  selectedWithinTestMode = event.target.value;
  if (selectedWithinTestMode === "pair") {
    selectedWithinTestLevelA = "";
    selectedWithinTestLevelB = "";
  } else {
    selectedWithinTestIncludedLevels = [];
  }
  renderWithinTests();
});

document.querySelector("#withinTestLevelA").addEventListener("change", event => {
  selectedWithinTestLevelA = event.target.value;
  if (selectedWithinTestLevelB === selectedWithinTestLevelA) selectedWithinTestLevelB = "";
  if (selectedWithinTestLevelA !== WITHIN_ALL_LEVEL) selectedWithinTestIncludedLevels = [];
  renderWithinTests();
});

document.querySelector("#withinTestLevelB").addEventListener("change", event => {
  selectedWithinTestLevelB = event.target.value;
  if (selectedWithinTestLevelA === selectedWithinTestLevelB) selectedWithinTestLevelA = "";
  renderWithinTests();
});

document.querySelector("#withinTestIncludedLevels").addEventListener("change", event => {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") return;
  selectedWithinTestIncludedLevels = [...document.querySelectorAll("#withinTestIncludedLevels input:checked")]
    .map(input => input.value);
  renderWithinTests();
});

document.querySelector("#withinTestIncludedLevelsReset").addEventListener("click", () => {
  selectedWithinTestIncludedLevels = concreteWithinAllSelections(selectedWithinTestModels, selectedWithinTestField)
    .map(item => item.b);
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
    rebuildDerivedIndexes();
    render();
  })
  .catch(error => {
    const isFileProtocol = window.location.protocol === "file:";
    const launchHint = isFileProtocol
      ? `<p>This page was opened directly from Finder, so the browser blocked access to <code>data.json</code>.</p>
         <p>Open the included <code>Open AI Pricing App All Data.command</code> file in this folder, and keep that Terminal window open while you use the app.</p>`
      : `<p>Could not load app data: ${error.message}</p>`;
    document.querySelector("main").innerHTML = `
      <article class="card error">
        <h2>App data could not be loaded</h2>
        ${launchHint}
      </article>`;
  });
