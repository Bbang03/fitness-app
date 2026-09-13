from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


DEFAULT_INPUT = Path(
    "data/research/bath_keto/Parallel_RCT_Master_data_03.07.2024.xlsx"
)
DEFAULT_OUTPUT_DIR = Path("data/research/derived/bath_keto_week4")

SHEET_NAME = "Sheet1"
HEADER_ROWS = 7

# Require at least 3 of the 4 exposure weeks (Weeks 1-4)
# before creating a 28-day interval dietary summary.
MIN_INTERVAL_DIARY_WEEKS = 3

# Audited zero-based column positions from the Bath Keto workbook.
STATIC_COL = {
    "participant_id": 1,
    "diet_group": 2,
    "sex": 3,
    "age_years": 4,

    "baseline_weight_kg": 16,
    "baseline_body_fat_pct_tanita": 21,
    "week4_weight_kg": 25,

    "baseline_dxa_fat_mass_g": 45,
    "week4_dxa_fat_mass_g": 55,

    # Study-reported summary. Retained for audit only in the first experiment.
    "reported_baseline_to_week4_delta_ei_kcal_per_day": 427,

    "baseline_paee_total_kcal_per_day": 435,
    "week4_paee_total_kcal_per_day": 441,
}

# Food-diary layout:
# Week 0 begins at column 310 and each week occupies 9 columns.
FOOD_DIARY_WEEK0_START = 310
FOOD_DIARY_FIELDS = [
    "starch_g_per_day",
    "fruit_veg_sugar_g_per_day",
    "milk_sugar_g_per_day",
    "liquid_free_sugar_g_per_day",
    "solid_free_sugar_g_per_day",
    "fat_g_per_day",
    "protein_g_per_day",
    "alcohol_g_per_day",
    "fibre_g_per_day",
]
EXPOSURE_WEEKS = (1, 2, 3, 4)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build the audited Bath Keto baseline->Week4 (28d) research table "
            "for behavior-correction experiments."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Path to raw Bath Keto workbook (default: {DEFAULT_INPUT})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    return parser.parse_args()


def clean_text(series: pd.Series) -> pd.Series:
    out = series.astype("string").str.strip()
    return out.mask(out.isin(["", "nan", "None", "<NA>"]))


def numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def diary_col(week: int, field_name: str) -> int:
    field_offset = FOOD_DIARY_FIELDS.index(field_name)
    return FOOD_DIARY_WEEK0_START + (week * len(FOOD_DIARY_FIELDS)) + field_offset


def require_workbook_shape(raw: pd.DataFrame) -> None:
    required = list(STATIC_COL.values())

    for week in EXPOSURE_WEEKS:
        for field_name in FOOD_DIARY_FIELDS:
            required.append(diary_col(week, field_name))

    max_required = max(required)
    if raw.shape[1] <= max_required:
        raise RuntimeError(
            "Unexpected workbook width. "
            f"Need column index {max_required}, but workbook has "
            f"{raw.shape[1]} columns."
        )


def interval_average(
    weekly_values: pd.DataFrame,
    min_weeks: int = MIN_INTERVAL_DIARY_WEEKS,
) -> tuple[pd.Series, pd.Series]:
    coverage = weekly_values.notna().sum(axis=1)
    average = weekly_values.mean(axis=1, skipna=True)
    average = average.where(coverage >= min_weeks)
    return average, coverage


def build_table(raw: pd.DataFrame) -> pd.DataFrame:
    require_workbook_shape(raw)

    data = raw.iloc[HEADER_ROWS:].reset_index(drop=True)

    out = pd.DataFrame(
        {
            name: data.iloc[:, idx]
            for name, idx in STATIC_COL.items()
        }
    )

    out["participant_id"] = clean_text(out["participant_id"])
    out["diet_group"] = clean_text(out["diet_group"]).str.upper()
    out["sex"] = clean_text(out["sex"]).str.title()

    for column in STATIC_COL:
        if column not in {"participant_id", "diet_group", "sex"}:
            out[column] = numeric(out[column])

    # Keep participant-like rows only, then collapse exact duplicated IDs.
    out = out[out["participant_id"].notna()].copy()
    data = data.loc[out.index].copy()

    duplicate_ids = out["participant_id"].duplicated(keep=False)
    if duplicate_ids.any():
        duplicated = sorted(out.loc[duplicate_ids, "participant_id"].astype(str).unique())
        raise RuntimeError(
            "Duplicate participant IDs detected; refusing to collapse them silently: "
            + ", ".join(duplicated)
        )

    # Body-composition targets.
    out["baseline_fat_mass_kg"] = out["baseline_dxa_fat_mass_g"] / 1000.0
    out["week4_fat_mass_kg"] = out["week4_dxa_fat_mass_g"] / 1000.0

    out["delta_weight_kg"] = (
        out["week4_weight_kg"] - out["baseline_weight_kg"]
    )
    out["delta_fat_mass_kg"] = (
        out["week4_fat_mass_kg"] - out["baseline_fat_mass_kg"]
    )

    # Build Week 1-4 realized dietary exposure summaries.
    weekly: dict[str, pd.DataFrame] = {}

    for field_name in FOOD_DIARY_FIELDS:
        weekly[field_name] = pd.DataFrame(
            {
                f"week{week}": numeric(
                    data.iloc[:, diary_col(week, field_name)]
                ).reset_index(drop=True)
                for week in EXPOSURE_WEEKS
            }
        )

    # Align row indices after participant filtering.
    out = out.reset_index(drop=True)

    # Total carbohydrate components are constructed only when all five
    # recorded carbohydrate components are available within a given week.
    carb_component_names = [
        "starch_g_per_day",
        "fruit_veg_sugar_g_per_day",
        "milk_sugar_g_per_day",
        "liquid_free_sugar_g_per_day",
        "solid_free_sugar_g_per_day",
    ]

    weekly_carb = pd.DataFrame(index=out.index)
    for week in EXPOSURE_WEEKS:
        parts = pd.concat(
            [weekly[name][f"week{week}"] for name in carb_component_names],
            axis=1,
        )
        weekly_carb[f"week{week}"] = parts.sum(
            axis=1,
            min_count=len(carb_component_names),
        )

    out["interval_carb_components_g_per_day"], carb_coverage = interval_average(
        weekly_carb
    )
    out["interval_carb_diary_weeks_observed"] = carb_coverage

    for source_name, output_name in [
        ("fat_g_per_day", "interval_fat_g_per_day"),
        ("protein_g_per_day", "interval_protein_g_per_day"),
        ("alcohol_g_per_day", "interval_alcohol_g_per_day"),
        ("fibre_g_per_day", "interval_fibre_g_per_day"),
    ]:
        avg, coverage = interval_average(weekly[source_name])
        out[output_name] = avg
        out[f"{output_name}_weeks_observed"] = coverage

    out["interval_protein_g_per_kg"] = (
        out["interval_protein_g_per_day"] / out["baseline_weight_kg"]
    )

    out["paee_change_kcal_per_day"] = (
        out["week4_paee_total_kcal_per_day"]
        - out["baseline_paee_total_kcal_per_day"]
    )

    # IMPORTANT:
    # - We do NOT derive total kcal from macro grams.
    # - We retain the study's reported Delta EI for later semantic review.
    # - DXA lean mass is intentionally not used as SMM.

    ordered = [
        "participant_id",
        "diet_group",
        "sex",
        "age_years",

        "baseline_weight_kg",
        "baseline_fat_mass_kg",
        "baseline_body_fat_pct_tanita",

        "week4_weight_kg",
        "week4_fat_mass_kg",

        "delta_weight_kg",
        "delta_fat_mass_kg",

        "interval_carb_components_g_per_day",
        "interval_carb_diary_weeks_observed",

        "interval_fat_g_per_day",
        "interval_fat_g_per_day_weeks_observed",

        "interval_protein_g_per_day",
        "interval_protein_g_per_day_weeks_observed",
        "interval_protein_g_per_kg",

        "interval_alcohol_g_per_day",
        "interval_alcohol_g_per_day_weeks_observed",

        "interval_fibre_g_per_day",
        "interval_fibre_g_per_day_weeks_observed",

        "reported_baseline_to_week4_delta_ei_kcal_per_day",

        "baseline_paee_total_kcal_per_day",
        "week4_paee_total_kcal_per_day",
        "paee_change_kcal_per_day",
    ]

    return out[ordered].sort_values("participant_id").reset_index(drop=True)


def complete_count(df: pd.DataFrame, columns: list[str]) -> int:
    return int(df[columns].notna().all(axis=1).sum())


def numeric_stats(series: pd.Series) -> dict:
    s = numeric(series).dropna()
    if s.empty:
        return {"n": 0}

    return {
        "n": int(len(s)),
        "mean": float(s.mean()),
        "std": float(s.std(ddof=1)) if len(s) > 1 else None,
        "min": float(s.min()),
        "median": float(s.median()),
        "max": float(s.max()),
    }


def build_summary(df: pd.DataFrame) -> dict:
    target_cols = [
        "baseline_weight_kg",
        "week4_weight_kg",
        "delta_weight_kg",
        "baseline_fat_mass_kg",
        "week4_fat_mass_kg",
        "delta_fat_mass_kg",
    ]

    body_only_cols = [
        "age_years",
        "sex",
        "baseline_weight_kg",
        "baseline_fat_mass_kg",
        "baseline_body_fat_pct_tanita",
    ]

    # First transport-oriented research feature set.
    # Diet group is deliberately excluded here because the app does not
    # observe randomized intervention assignment.
    behavior_numeric_core = [
        "interval_carb_components_g_per_day",
        "interval_fat_g_per_day",
        "interval_protein_g_per_day",
        "interval_protein_g_per_kg",
        "week4_paee_total_kcal_per_day",
    ]

    behavior_plus_paee_change = behavior_numeric_core + [
        "baseline_paee_total_kcal_per_day",
        "paee_change_kcal_per_day",
    ]

    summary = {
        "dataset": "bath_keto_week4",
        "builder_version": "v0.2",
        "horizon_days": 28,
        "minimum_interval_diary_weeks": MIN_INTERVAL_DIARY_WEEKS,

        "rows_total": int(len(df)),
        "unique_participants": int(df["participant_id"].nunique()),

        "both_targets_complete": complete_count(df, target_cols),
        "body_only_complete": complete_count(df, target_cols + body_only_cols),

        "behavior_numeric_core_complete": complete_count(
            df,
            target_cols + body_only_cols + behavior_numeric_core,
        ),

        "behavior_plus_paee_change_complete": complete_count(
            df,
            target_cols + body_only_cols + behavior_plus_paee_change,
        ),

        "intervention_context_complete": complete_count(
            df,
            target_cols
            + body_only_cols
            + behavior_numeric_core
            + ["diet_group"],
        ),

        "diet_group_counts": {
            str(key): int(value)
            for key, value in df["diet_group"]
            .fillna("MISSING")
            .value_counts()
            .to_dict()
            .items()
        },

        "target_stats": {
            "delta_weight_kg": numeric_stats(df["delta_weight_kg"]),
            "delta_fat_mass_kg": numeric_stats(df["delta_fat_mass_kg"]),
        },

        "non_null_counts": {
            column: int(df[column].notna().sum())
            for column in df.columns
        },

        "feature_sets": {
            "body_only": body_only_cols,
            "behavior_numeric_core": behavior_numeric_core,
            "behavior_plus_paee_change": behavior_plus_paee_change,
            "intervention_context_only": ["diet_group"],
            "audit_only_not_first_model": [
                "reported_baseline_to_week4_delta_ei_kcal_per_day",
            ],
        },

        "notes": [
            "DXA fat mass is converted from grams to kilograms.",
            "DXA lean mass is intentionally not used as skeletal muscle mass.",
            "No synthetic imputation is performed by the dataset builder.",
            (
                "Diet exposure is summarized over Weeks 1-4, requiring at least "
                f"{MIN_INTERVAL_DIARY_WEEKS} observed weeks."
            ),
            (
                "Diet group is kept as intervention context but is excluded from "
                "the first transport-oriented behavior model."
            ),
            (
                "reported_baseline_to_week4_delta_ei_kcal_per_day is retained "
                "for audit only until its exact derivation/sign semantics are reviewed."
            ),
            (
                "Week4 PAEE is an interval-end activity measurement and is not "
                "equivalent to app workout-log features."
            ),
        ],
    }

    return summary


def main() -> None:
    args = parse_args()

    if not args.input.exists():
        raise FileNotFoundError(
            "Bath Keto workbook not found:\n"
            f"  {args.input.resolve()}\n\n"
            "Place the raw workbook at that path or pass --input."
        )

    print("=" * 80)
    print("BATH KETO WEEK4 DATASET BUILD v0.2")
    print("=" * 80)
    print(f"Input : {args.input.resolve()}")

    raw = pd.read_excel(
        args.input,
        sheet_name=SHEET_NAME,
        header=None,
        engine="openpyxl",
    )

    print(f"Raw shape: {raw.shape}")

    df = build_table(raw)
    summary = build_summary(df)

    args.output_dir.mkdir(parents=True, exist_ok=True)

    all_path = args.output_dir / "bath_keto_week4_all.csv"
    summary_path = args.output_dir / "bath_keto_week4_summary.json"

    df.to_csv(all_path, index=False)
    summary_path.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print()
    print("Build PASSED")
    print(
        f"Rows / participants             : "
        f"{summary['rows_total']} / {summary['unique_participants']}"
    )
    print(
        f"Both targets complete           : "
        f"{summary['both_targets_complete']}"
    )
    print(
        f"Body-only complete              : "
        f"{summary['body_only_complete']}"
    )
    print(
        f"Behavior numeric core complete  : "
        f"{summary['behavior_numeric_core_complete']}"
    )
    print(
        f"Behavior + PAEE change complete : "
        f"{summary['behavior_plus_paee_change_complete']}"
    )
    print(
        f"Intervention context complete   : "
        f"{summary['intervention_context_complete']}"
    )
    print(f"Diet groups                     : {summary['diet_group_counts']}")
    print()
    print(f"CSV     : {all_path.resolve()}")
    print(f"Summary : {summary_path.resolve()}")
    print()
    print("No model training was performed.")


if __name__ == "__main__":
    main()
