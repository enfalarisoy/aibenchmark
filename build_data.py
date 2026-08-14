import json
from pathlib import Path

import pandas as pd


APP_DIR = Path(__file__).resolve().parent
OUTPUT = APP_DIR / "data.json"

MODEL_SOURCES = {
    "GPT-5 mini": [
        {
            "label": "static",
            "path": APP_DIR / "results_static_s5_s20_l5_l15_l45_8models_concise_gpt-5-mini_reasoningminimal_0810.csv",
        },
        {
            "label": "seasonal",
            "path": APP_DIR / "results_season_s5_s20_l5_l15_l45_8families_concise_gpt-5-mini_reasoningminimal_0810.csv",
        },
        {
            "label": "duopoly",
            "path": APP_DIR / "results_duoply_s5_s20_l5_l15_l45_8families_concise_gpt-5-mini_reasoningminimal_0811.csv",
        },
    ],
    "Gemini 2.5 Flash": [
        {
            "label": "static",
            "path": APP_DIR / "results_static_s5_s20_l5_l15_l45_8models_concise_gemini-2.5-flash_thinkingbudget0_0810.csv",
        },
        {
            "label": "seasonal",
            "path": APP_DIR / "results_season_s5_s20_l5_l15_l45_8families_concise_gemini-2.5-flash_thinkingbudget0_0810.csv",
        },
        {
            "label": "duopoly",
            "path": APP_DIR / "results_duoply_s5_s20_l5_l15_l45_8families_concise_gemini-2.5-flash_thinkingbudget0_0811.csv",
        },
    ],
    "Claude Haiku 4.5": [
        {
            "label": "static",
            "path": APP_DIR / "results_static_s5_s20_l5_l15_l45_8models_concise_claude-haiku-4-5_0810.csv",
        },
        {
            "label": "seasonal",
            "path": APP_DIR / "results_season_s5_s20_l5_l15_l45_8families_concise_claude-haiku-4-5_0810.csv",
        },
        {
            "label": "duopoly",
            "path": APP_DIR / "results_duoply_s5_s20_l5_l15_l45_8families_concise_claude-haiku-4-5_0811.csv",
        },
    ],
}

INPUT_COLUMNS = [
    "instance_id",
    "instance_type",
    "scenario_subtype",
    "demand_model",
    "sigma",
    "history_length",
    "parameter_set",
    "has_environment",
    "next_env",
    "mc",
    "p_c_current",
    "variant",
    "role",
    "product_context",
    "dist_hint",
    "dist_hint_applied",
    "env_hint",
    "closing",
    "p_star",
]

KEEP_COLUMNS = INPUT_COLUMNS + [
    "ai_answer",
    "rel_rev_loss",
    "heuristic_price",
    "heuristic_rel_rev_loss",
    "prompt_preview",
]

KEEP_COLUMN_SET = set(KEEP_COLUMNS)


def clean_string(value):
    if pd.isna(value):
        return ""
    return str(value).strip()


def clean_bool(value):
    text = clean_string(value).lower()
    if text == "true":
        return True
    if text == "false":
        return False
    return None if text == "" else text


def clean_number(value):
    if pd.isna(value) or clean_string(value) == "":
        return None
    number = pd.to_numeric(value, errors="coerce")
    if pd.isna(number):
        return None
    return float(number)


def normalize_scenario_subtype(raw_value, source_label):
    text = clean_string(raw_value).lower()
    if source_label == "duopoly":
        return "duopoly"
    if source_label == "seasonal" or text == "seasonality":
        return "seasonal"
    return text or source_label


def row_case_key(record):
    parts = []
    for column in INPUT_COLUMNS:
        value = record[column]
        if isinstance(value, bool):
            parts.append("TRUE" if value else "FALSE")
        elif value is None:
            parts.append("")
        elif isinstance(value, float):
            parts.append(f"{value:.8g}")
        else:
            parts.append(str(value))
    return "|".join(parts)


rows = []
for model, sources in MODEL_SOURCES.items():
    for source in sources:
        frame = pd.read_csv(
            source["path"],
            usecols=lambda column: column in KEEP_COLUMN_SET,
            dtype=str,
            keep_default_na=False,
        )
        for column in KEEP_COLUMNS:
            if column not in frame.columns:
                frame[column] = ""
        frame = frame[KEEP_COLUMNS]

        for raw in frame.to_dict(orient="records"):
            record = {
                "model": model,
                "instance_id": clean_string(raw["instance_id"]),
                "instance_type": clean_string(raw["instance_type"]),
                "scenario_subtype": normalize_scenario_subtype(raw["scenario_subtype"], source["label"]),
                "demand_model": clean_string(raw["demand_model"]),
                "sigma": clean_number(raw["sigma"]),
                "history_length": clean_number(raw["history_length"]),
                "parameter_set": clean_string(raw["parameter_set"]),
                "has_environment": clean_bool(raw["has_environment"]),
                "next_env": clean_string(raw["next_env"]),
                "mc": clean_number(raw["mc"]),
                "p_c_current": clean_number(raw["p_c_current"]),
                "variant": clean_string(raw["variant"]),
                "role": clean_bool(raw["role"]),
                "product_context": clean_string(raw["product_context"]).lower(),
                "dist_hint": clean_string(raw["dist_hint"]),
                "dist_hint_applied": clean_string(raw["dist_hint_applied"]),
                "env_hint": clean_bool(raw["env_hint"]),
                "closing": clean_string(raw["closing"]),
                "p_star": clean_number(raw["p_star"]),
                "ai_answer": clean_number(raw["ai_answer"]),
                "rel_rev_loss": clean_number(raw["rel_rev_loss"]),
                "heuristic_price": clean_number(raw["heuristic_price"]),
                "heuristic_rel_rev_loss": clean_number(raw["heuristic_rel_rev_loss"]),
                "prompt_preview": clean_string(raw["prompt_preview"]),
            }
            record["answered"] = record["ai_answer"] is not None and record["rel_rev_loss"] is not None
            record["case_key"] = row_case_key(record)
            rows.append(record)

payload = {
    "source_files": {
        model: [str(source["path"]) for source in sources]
        for model, sources in MODEL_SOURCES.items()
    },
    "input_columns": INPUT_COLUMNS,
    "models": list(MODEL_SOURCES.keys()),
    "rows": rows,
}

OUTPUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
print(f"Wrote {len(rows):,} rows across {len(MODEL_SOURCES)} models to {OUTPUT}")
