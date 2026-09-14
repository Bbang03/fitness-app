from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd
from catboost import CatBoostRegressor

from scripts.build_bath_keto_week4_dataset import (
    DEFAULT_INPUT,
    HEADER_ROWS,
    SHEET_NAME,
    STATIC_COL,
    clean_text,
    diary_col,
    numeric,
)


DEFAULT_OUTPUT_DIR = Path("models/behavior_correction_v1")

MODEL_VERSION = "behavior-correction-v1.0.0"
RANDOM_SEED = 20260914

CARB_COMPONENTS = [
    "starch_g_per_day",
    "fruit_veg_sugar_g_per_day",
    "milk_sugar_g_per_day",
    "liquid_free_sugar_g_per_day",
    "solid_free_sugar_g_per_day",
]

BODY_FEATURES = [
    "age_years",
    "sex",
    "baseline_weight_kg",
    "baseline_fat_mass_kg",
    "baseline_body_fat_pct_tanita",
]

DIET_FEATURES = [
    "week1_carb_g_per_day",
    "week1_fat_g_per_day",
    "week1_protein_g_per_kg",
]

TARGETS = {
    "weight_kg": "delta_weight_kg",
    "fat_mass_kg": "delta_fat_mass_kg",
}

CAT_FEATURES = ["sex"]

MODEL_PARAMS = {
    "iterations": 200,
    "depth": 3,
    "learning_rate": 0.03,
    "loss_function": "MAE",
    "l2_leaf_reg": 5.0,
    "random_seed": RANDOM_SEED,
    "verbose": False,
    "allow_writing_files": False,
    "thread_count": -1,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Train the locked production candidate for FitTrack behavior correction. "
            "The deployed correction is the difference between a Week1 diet-augmented "
            "delta model and its paired body-only delta model."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Bath Keto raw workbook (default: {DEFAULT_INPUT})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Artifact directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    return parser.parse_args()


def build_training_table(raw: pd.DataFrame) -> pd.DataFrame:
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

    participant_mask = out["participant_id"].notna()
    out = out.loc[participant_mask].copy()
    data = data.loc[participant_mask].copy()

    duplicate_ids = out["participant_id"].duplicated(keep=False)
    if duplicate_ids.any():
        duplicated = sorted(
            out.loc[duplicate_ids, "participant_id"]
            .astype(str)
            .unique()
        )
        raise RuntimeError(
            "Duplicate participant IDs detected: "
            + ", ".join(duplicated)
        )

    out = out.reset_index(drop=True)
    data = data.reset_index(drop=True)

    out["baseline_fat_mass_kg"] = (
        out["baseline_dxa_fat_mass_g"] / 1000.0
    )
    out["week4_fat_mass_kg"] = (
        out["week4_dxa_fat_mass_g"] / 1000.0
    )

    out["delta_weight_kg"] = (
        out["week4_weight_kg"]
        - out["baseline_weight_kg"]
    )
    out["delta_fat_mass_kg"] = (
        out["week4_fat_mass_kg"]
        - out["baseline_fat_mass_kg"]
    )

    carb_parts = pd.concat(
        [
            numeric(
                data.iloc[:, diary_col(1, component)]
            ).reset_index(drop=True)
            for component in CARB_COMPONENTS
        ],
        axis=1,
    )

    out["week1_carb_g_per_day"] = carb_parts.sum(
        axis=1,
        min_count=len(CARB_COMPONENTS),
    )

    out["week1_fat_g_per_day"] = numeric(
        data.iloc[:, diary_col(1, "fat_g_per_day")]
    ).reset_index(drop=True)

    out["week1_protein_g_per_day"] = numeric(
        data.iloc[:, diary_col(1, "protein_g_per_day")]
    ).reset_index(drop=True)

    out["week1_protein_g_per_kg"] = (
        out["week1_protein_g_per_day"]
        / out["baseline_weight_kg"]
    )

    required = [
        "participant_id",
        "diet_group",
        *BODY_FEATURES,
        *DIET_FEATURES,
        *TARGETS.values(),
    ]

    cohort = out[required].dropna().copy()
    cohort = cohort.reset_index(drop=True)

    if cohort["participant_id"].nunique() != len(cohort):
        raise RuntimeError("Participant uniqueness check failed.")

    if len(cohort) < 30:
        raise RuntimeError(
            f"Too few complete participants: {len(cohort)}"
        )

    return cohort


def make_model() -> CatBoostRegressor:
    return CatBoostRegressor(**MODEL_PARAMS)


def fit_and_save_pair(
    cohort: pd.DataFrame,
    target_name: str,
    target_column: str,
    output_dir: Path,
) -> dict:
    y = cohort[target_column].astype(float)

    body_features = BODY_FEATURES
    behavior_features = BODY_FEATURES + DIET_FEATURES

    body_model = make_model()
    behavior_model = make_model()

    body_model.fit(
        cohort[body_features],
        y,
        cat_features=CAT_FEATURES,
    )

    behavior_model.fit(
        cohort[behavior_features],
        y,
        cat_features=CAT_FEATURES,
    )

    body_path = output_dir / f"{target_name}_body_delta.cbm"
    behavior_path = output_dir / f"{target_name}_behavior_delta.cbm"

    body_model.save_model(str(body_path))
    behavior_model.save_model(str(behavior_path))

    body_pred = body_model.predict(cohort[body_features])
    behavior_pred = behavior_model.predict(cohort[behavior_features])

    correction = behavior_pred - body_pred

    return {
        "target": target_name,
        "target_column": target_column,
        "body_model_file": body_path.name,
        "behavior_model_file": behavior_path.name,
        "training_rows": int(len(cohort)),
        "training_correction_summary_kg": {
            "min": float(correction.min()),
            "median": float(pd.Series(correction).median()),
            "mean": float(correction.mean()),
            "max": float(correction.max()),
            "mean_abs": float(abs(correction).mean()),
        },
    }


def main() -> None:
    args = parse_args()

    if not args.input.exists():
        raise FileNotFoundError(
            f"Bath Keto workbook not found: {args.input.resolve()}"
        )

    print("=" * 100)
    print("FITTRACK BEHAVIOR CORRECTION — FINAL TRAINING CANDIDATE")
    print("=" * 100)
    print(f"Model version : {MODEL_VERSION}")
    print(f"Input         : {args.input.resolve()}")
    print()
    print("Locked product contract:")
    print("  - Frozen production v1 remains unchanged")
    print("  - D-1 cutoff")
    print("  - Rolling recent 7-day meal window")
    print("  - Minimum 3 observed meal days before correction is eligible")
    print("  - Weight and fat mass receive correction")
    print("  - SMM receives no correction")
    print("  - BF% is recalculated from corrected fat / corrected weight")
    print()

    raw = pd.read_excel(
        args.input,
        sheet_name=SHEET_NAME,
        header=None,
        engine="openpyxl",
    )

    print(f"Raw shape     : {raw.shape}")

    cohort = build_training_table(raw)

    print(
        "Training cohort: "
        f"{len(cohort)} participants"
    )
    print(
        "Diet groups    : "
        f"{cohort['diet_group'].value_counts().to_dict()}"
    )
    print()

    args.output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    artifacts = {}

    for target_name, target_column in TARGETS.items():
        print(f"Training {target_name} pair...")

        artifacts[target_name] = fit_and_save_pair(
            cohort=cohort,
            target_name=target_name,
            target_column=target_column,
            output_dir=args.output_dir,
        )

    manifest = {
        "model_name": "fittrack-behavior-correction",
        "model_version": MODEL_VERSION,
        "status": "production_candidate",
        "architecture": {
            "base_prediction": "frozen-v1",
            "equation": (
                "final_target = v1_target + "
                "(behavior_delta_model - body_delta_model)"
            ),
            "correction_training_mode": "within_study_incremental_delta",
        },
        "targets": {
            "weight_kg": {
                "correction_enabled": True,
                **artifacts["weight_kg"],
            },
            "fat_mass_kg": {
                "correction_enabled": True,
                **artifacts["fat_mass_kg"],
            },
            "smm_actual_kg": {
                "correction_enabled": False,
                "policy": "frozen_v1_passthrough",
            },
            "body_fat_pct": {
                "correction_enabled": False,
                "policy": (
                    "recalculate_from_corrected_fat_mass_kg/"
                    "corrected_weight_kg"
                ),
            },
        },
        "feature_contract": {
            "body_features": BODY_FEATURES,
            "diet_features": DIET_FEATURES,
            "categorical_features": CAT_FEATURES,
            "service_mapping": {
                "age_years": (
                    "prediction_date year minus profile.birth_year "
                    "(approximate integer age)"
                ),
                "sex": "profile.sex",
                "baseline_weight_kg": "latest eligible InBody weight_kg",
                "baseline_fat_mass_kg": "latest eligible InBody body_fat_kg",
                "baseline_body_fat_pct_tanita": (
                    "latest eligible InBody body_fat_pct"
                ),
                "week1_carb_g_per_day": "meal_7d_avg_carbs_g",
                "week1_fat_g_per_day": "meal_7d_avg_fat_g",
                "week1_protein_g_per_kg": (
                    "meal_7d_avg_protein_g / current_weight_kg"
                ),
            },
        },
        "gate": {
            "cutoff_policy": "D-1",
            "rolling_window_days": 7,
            "minimum_observed_meal_days": 3,
            "requires_profile_sex": True,
            "requires_profile_birth_year": True,
            "missing_or_ineligible_policy": "zero_correction",
        },
        "training": {
            "source_dataset": "Bath Keto Week1",
            "training_participants": int(len(cohort)),
            "diet_group_counts": {
                str(k): int(v)
                for k, v in cohort["diet_group"]
                .value_counts()
                .to_dict()
                .items()
            },
            "model_family": "CatBoostRegressor",
            "parameters": MODEL_PARAMS,
            "raw_diet_group_used_as_model_feature": False,
            "paee_used": False,
            "smm_used": False,
        },
        "validation_evidence": {
            "scope": "single-study internal development evidence",
            "random_cv_week1": {
                "weight_relative_mae_change_pct": -29.2941,
                "fat_mass_relative_mae_change_pct": -19.2968,
                "repeats_better": "5/5 for both targets",
                "paired_bootstrap_ci_entirely_below_zero": True,
            },
            "leave_one_diet_group_out_week1": {
                "weight_relative_mae_change_pct": -18.0298,
                "fat_mass_relative_mae_change_pct": -22.7175,
                "held_out_groups_improved_weight": "3/3 directional",
                "held_out_groups_improved_fat_mass": "3/3",
                "pooled_bootstrap_ci_entirely_below_zero": True,
            },
            "warning": (
                "This is not independent deployment validation. "
                "The correction is transported from a paired within-study "
                "delta comparison to the frozen production v1."
            ),
        },
    }

    manifest_path = args.output_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            manifest,
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    print()
    print("Training PASSED")
    print(f"Artifacts: {args.output_dir.resolve()}")
    print()
    for target_name in ["weight_kg", "fat_mass_kg"]:
        item = artifacts[target_name]
        print(
            f"{target_name}: "
            f"{item['body_model_file']} + "
            f"{item['behavior_model_file']}"
        )
        print(
            "  training correction summary (kg): "
            f"{item['training_correction_summary_kg']}"
        )

    print()
    print(f"Manifest: {manifest_path.resolve()}")
    print()
    print("No production runtime file was modified.")


if __name__ == "__main__":
    main()
