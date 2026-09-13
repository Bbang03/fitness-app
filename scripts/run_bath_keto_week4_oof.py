from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from catboost import CatBoostRegressor
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import RepeatedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


DEFAULT_INPUT = Path(
    "data/research/derived/bath_keto_week4/bath_keto_week4_all.csv"
)
DEFAULT_OUTPUT_DIR = Path(
    "data/research/results/bath_keto_week4_oof"
)

RANDOM_SEED = 20260914
N_SPLITS = 5
N_REPEATS = 5
BOOTSTRAP_SAMPLES = 10_000

TARGETS = {
    "weight": "delta_weight_kg",
    "fat_mass": "delta_fat_mass_kg",
}

BODY_NUMERIC = [
    "age_years",
    "baseline_weight_kg",
    "baseline_fat_mass_kg",
    "baseline_body_fat_pct_tanita",
]
BODY_CATEGORICAL = ["sex"]

# First transport-oriented behavior set.
# Deliberately excludes randomized diet_group and audit-only Delta EI.
BEHAVIOR_NUMERIC = [
    "interval_carb_components_g_per_day",
    "interval_fat_g_per_day",
    "interval_protein_g_per_kg",
    "week4_paee_total_kcal_per_day",
]

REQUIRED_COLUMNS = [
    "participant_id",
    *BODY_NUMERIC,
    *BODY_CATEGORICAL,
    *BEHAVIOR_NUMERIC,
    *TARGETS.values(),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Development-only OOF comparison of Bath Keto Week4 body-only "
            "vs behavior-augmented 28-day delta models."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Input CSV (default: {DEFAULT_INPUT})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--splits",
        type=int,
        default=N_SPLITS,
        help=f"K-fold splits (default: {N_SPLITS})",
    )
    parser.add_argument(
        "--repeats",
        type=int,
        default=N_REPEATS,
        help=f"Repeated K-fold repeats (default: {N_REPEATS})",
    )
    parser.add_argument(
        "--bootstrap-samples",
        type=int,
        default=BOOTSTRAP_SAMPLES,
        help=f"Participant bootstrap samples (default: {BOOTSTRAP_SAMPLES})",
    )
    return parser.parse_args()


def validate_input(df: pd.DataFrame) -> pd.DataFrame:
    missing_columns = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_columns:
        raise RuntimeError(
            "Input dataset is missing required columns: "
            + ", ".join(missing_columns)
        )

    duplicated = df["participant_id"].duplicated(keep=False)
    if duplicated.any():
        ids = sorted(df.loc[duplicated, "participant_id"].astype(str).unique())
        raise RuntimeError(
            "Duplicate participant IDs detected: " + ", ".join(ids)
        )

    cohort = df[REQUIRED_COLUMNS].dropna().copy()

    if len(cohort) < 30:
        raise RuntimeError(
            f"Only {len(cohort)} complete participants remain; "
            "refusing to run this planned experiment."
        )

    if cohort["participant_id"].nunique() != len(cohort):
        raise RuntimeError("Participant uniqueness check failed.")

    return cohort.reset_index(drop=True)


def make_preprocessor(
    numeric_features: list[str],
    categorical_features: list[str],
    *,
    scale_numeric: bool,
) -> ColumnTransformer:
    numeric_transformer = (
        StandardScaler()
        if scale_numeric
        else "passthrough"
    )

    return ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, numeric_features),
            (
                "cat",
                OneHotEncoder(
                    handle_unknown="ignore",
                    sparse_output=False,
                ),
                categorical_features,
            ),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )


def make_model(
    model_name: str,
    numeric_features: list[str],
    categorical_features: list[str],
    seed: int,
) -> Pipeline:
    if model_name == "ridge":
        estimator = Ridge(alpha=1.0)
        scale_numeric = True

    elif model_name == "random_forest":
        estimator = RandomForestRegressor(
            n_estimators=400,
            max_depth=4,
            min_samples_leaf=3,
            max_features=0.8,
            random_state=seed,
            n_jobs=-1,
        )
        scale_numeric = False

    elif model_name == "catboost":
        estimator = CatBoostRegressor(
            iterations=200,
            depth=3,
            learning_rate=0.03,
            loss_function="MAE",
            l2_leaf_reg=5.0,
            random_seed=seed,
            verbose=False,
            allow_writing_files=False,
            thread_count=-1,
        )
        scale_numeric = False

    else:
        raise ValueError(f"Unknown model: {model_name}")

    return Pipeline(
        steps=[
            (
                "preprocess",
                make_preprocessor(
                    numeric_features,
                    categorical_features,
                    scale_numeric=scale_numeric,
                ),
            ),
            ("model", estimator),
        ]
    )


def bootstrap_mean_ci(
    values: np.ndarray,
    rng: np.random.Generator,
    n_bootstrap: int,
) -> tuple[float, float]:
    values = np.asarray(values, dtype=float)

    samples = rng.choice(
        values,
        size=(n_bootstrap, len(values)),
        replace=True,
    )
    means = samples.mean(axis=1)

    low, high = np.quantile(means, [0.025, 0.975])
    return float(low), float(high)


def run_experiment(
    cohort: pd.DataFrame,
    *,
    n_splits: int,
    n_repeats: int,
    bootstrap_samples: int,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    if n_splits < 3:
        raise ValueError("--splits must be at least 3.")
    if n_repeats < 1:
        raise ValueError("--repeats must be at least 1.")
    if n_splits > len(cohort):
        raise ValueError("--splits cannot exceed cohort size.")

    splitter = RepeatedKFold(
        n_splits=n_splits,
        n_repeats=n_repeats,
        random_state=RANDOM_SEED,
    )

    # Materialize once so every target/model/feature-set sees identical splits.
    splits = list(splitter.split(cohort))

    model_names = ["ridge", "random_forest", "catboost"]

    feature_sets = {
        "body_only": {
            "numeric": BODY_NUMERIC,
            "categorical": BODY_CATEGORICAL,
        },
        "behavior_augmented": {
            "numeric": BODY_NUMERIC + BEHAVIOR_NUMERIC,
            "categorical": BODY_CATEGORICAL,
        },
    }

    prediction_rows: list[dict] = []
    repeat_metric_rows: list[dict] = []

    for target_name, target_column in TARGETS.items():
        y = cohort[target_column].astype(float).to_numpy()

        for model_name in model_names:
            for feature_set_name, feature_spec in feature_sets.items():
                numeric_features = feature_spec["numeric"]
                categorical_features = feature_spec["categorical"]
                x_columns = numeric_features + categorical_features
                X = cohort[x_columns].copy()

                # Each participant receives exactly one OOF prediction per repeat.
                for split_idx, (train_idx, test_idx) in enumerate(splits):
                    repeat_idx = split_idx // n_splits
                    fold_idx = split_idx % n_splits

                    seed = (
                        RANDOM_SEED
                        + repeat_idx * 100
                        + fold_idx * 10
                        + model_names.index(model_name)
                    )

                    pipeline = make_model(
                        model_name,
                        numeric_features,
                        categorical_features,
                        seed,
                    )

                    pipeline.fit(
                        X.iloc[train_idx],
                        y[train_idx],
                    )
                    pred = pipeline.predict(X.iloc[test_idx])

                    for local_pos, row_idx in enumerate(test_idx):
                        prediction_rows.append(
                            {
                                "participant_id": str(
                                    cohort.iloc[row_idx]["participant_id"]
                                ),
                                "target": target_name,
                                "target_column": target_column,
                                "model": model_name,
                                "feature_set": feature_set_name,
                                "repeat": repeat_idx,
                                "fold": fold_idx,
                                "actual": float(y[row_idx]),
                                "prediction": float(pred[local_pos]),
                            }
                        )

    predictions = pd.DataFrame(prediction_rows)

    # Validate repeated-OOF structure.
    expected_per_key = n_repeats
    counts = (
        predictions.groupby(
            ["participant_id", "target", "model", "feature_set"]
        )
        .size()
    )
    if not (counts == expected_per_key).all():
        raise RuntimeError(
            "OOF accounting failed: each participant must have exactly "
            f"{expected_per_key} predictions per target/model/feature set."
        )

    # Per-repeat metrics preserve the repeated-CV distribution.
    repeat_metrics = (
        predictions.groupby(
            ["target", "model", "feature_set", "repeat"],
            as_index=False,
        )
        .apply(
            lambda g: pd.Series(
                {
                    "mae": mean_absolute_error(
                        g["actual"],
                        g["prediction"],
                    )
                }
            ),
            include_groups=False,
        )
        .reset_index(drop=True)
    )

    # Aggregate repeated OOF predictions to one prediction per participant.
    participant_oof = (
        predictions.groupby(
            ["participant_id", "target", "model", "feature_set"],
            as_index=False,
        )
        .agg(
            actual=("actual", "first"),
            prediction=("prediction", "mean"),
            prediction_sd=("prediction", "std"),
        )
    )
    participant_oof["abs_error"] = (
        participant_oof["actual"] - participant_oof["prediction"]
    ).abs()

    summary_rows: list[dict] = []
    rng = np.random.default_rng(RANDOM_SEED)

    for target_name in TARGETS:
        for model_name in model_names:
            body = participant_oof[
                (participant_oof["target"] == target_name)
                & (participant_oof["model"] == model_name)
                & (participant_oof["feature_set"] == "body_only")
            ].copy()

            behavior = participant_oof[
                (participant_oof["target"] == target_name)
                & (participant_oof["model"] == model_name)
                & (participant_oof["feature_set"] == "behavior_augmented")
            ].copy()

            paired = body.merge(
                behavior,
                on=["participant_id", "target", "model"],
                suffixes=("_body", "_behavior"),
                validate="one_to_one",
            )

            body_mae = float(paired["abs_error_body"].mean())
            behavior_mae = float(paired["abs_error_behavior"].mean())

            # Negative delta means behavior augmentation improved MAE.
            paired_delta = (
                paired["abs_error_behavior"]
                - paired["abs_error_body"]
            ).to_numpy(dtype=float)

            ci_low, ci_high = bootstrap_mean_ci(
                paired_delta,
                rng,
                bootstrap_samples,
            )

            repeat_body = repeat_metrics[
                (repeat_metrics["target"] == target_name)
                & (repeat_metrics["model"] == model_name)
                & (repeat_metrics["feature_set"] == "body_only")
            ][["repeat", "mae"]].rename(columns={"mae": "body_mae"})

            repeat_behavior = repeat_metrics[
                (repeat_metrics["target"] == target_name)
                & (repeat_metrics["model"] == model_name)
                & (repeat_metrics["feature_set"] == "behavior_augmented")
            ][["repeat", "mae"]].rename(columns={"mae": "behavior_mae"})

            repeat_pair = repeat_body.merge(
                repeat_behavior,
                on="repeat",
                validate="one_to_one",
            )
            repeat_pair["mae_delta"] = (
                repeat_pair["behavior_mae"] - repeat_pair["body_mae"]
            )

            summary_rows.append(
                {
                    "target": target_name,
                    "model": model_name,
                    "participants": int(len(paired)),
                    "body_mae": body_mae,
                    "behavior_mae": behavior_mae,
                    "mae_delta_behavior_minus_body": behavior_mae - body_mae,
                    "relative_mae_change_pct": (
                        100.0 * (behavior_mae - body_mae) / body_mae
                    ),
                    "participant_win_rate_behavior": float(
                        (paired_delta < 0).mean()
                    ),
                    "participant_tie_rate": float(
                        np.isclose(paired_delta, 0.0).mean()
                    ),
                    "paired_error_delta_mean": float(paired_delta.mean()),
                    "paired_error_delta_median": float(np.median(paired_delta)),
                    "paired_bootstrap_ci95_low": ci_low,
                    "paired_bootstrap_ci95_high": ci_high,
                    "repeat_mae_delta_mean": float(
                        repeat_pair["mae_delta"].mean()
                    ),
                    "repeat_mae_delta_std": float(
                        repeat_pair["mae_delta"].std(ddof=1)
                    ),
                    "repeats_behavior_better": int(
                        (repeat_pair["mae_delta"] < 0).sum()
                    ),
                    "total_repeats": int(len(repeat_pair)),
                }
            )

    summary = pd.DataFrame(summary_rows)

    metadata = {
        "experiment": "bath_keto_week4_behavior_incremental_oof",
        "status": "development_only_not_for_production",
        "horizon_days": 28,
        "participants": int(len(cohort)),
        "random_seed": RANDOM_SEED,
        "cv": {
            "type": "RepeatedKFold",
            "n_splits": n_splits,
            "n_repeats": n_repeats,
            "identical_splits_for_all_comparisons": True,
        },
        "targets": TARGETS,
        "body_numeric_features": BODY_NUMERIC,
        "body_categorical_features": BODY_CATEGORICAL,
        "behavior_numeric_features": BEHAVIOR_NUMERIC,
        "excluded_from_primary_behavior_model": [
            "diet_group",
            "reported_baseline_to_week4_delta_ei_kcal_per_day",
            "baseline_paee_total_kcal_per_day",
            "paee_change_kcal_per_day",
        ],
        "models": {
            "ridge": {
                "alpha": 1.0,
                "numeric_standardization": True,
            },
            "random_forest": {
                "n_estimators": 400,
                "max_depth": 4,
                "min_samples_leaf": 3,
                "max_features": 0.8,
            },
            "catboost": {
                "iterations": 200,
                "depth": 3,
                "learning_rate": 0.03,
                "loss_function": "MAE",
                "l2_leaf_reg": 5.0,
            },
        },
        "interpretation": {
            "mae_delta_behavior_minus_body": (
                "Negative values favor behavior augmentation."
            ),
            "bootstrap_ci": (
                "Exploratory participant-level bootstrap of paired absolute-error "
                "differences after averaging each participant's repeated OOF "
                "predictions. It is not an independent external-validation CI."
            ),
            "promotion_rule": (
                "Do not promote from this study alone. Look for stable negative "
                "OOF error deltas across models/repeats without material subgroup "
                "degradation, then validate transport to the frozen v1 system."
            ),
        },
    }

    return predictions, repeat_metrics, participant_oof, summary, metadata


def print_summary(summary: pd.DataFrame) -> None:
    display = summary[
        [
            "target",
            "model",
            "participants",
            "body_mae",
            "behavior_mae",
            "mae_delta_behavior_minus_body",
            "relative_mae_change_pct",
            "participant_win_rate_behavior",
            "paired_bootstrap_ci95_low",
            "paired_bootstrap_ci95_high",
            "repeats_behavior_better",
            "total_repeats",
        ]
    ].copy()

    numeric_cols = [
        "body_mae",
        "behavior_mae",
        "mae_delta_behavior_minus_body",
        "relative_mae_change_pct",
        "participant_win_rate_behavior",
        "paired_bootstrap_ci95_low",
        "paired_bootstrap_ci95_high",
    ]
    display[numeric_cols] = display[numeric_cols].round(4)

    print(display.to_string(index=False))


def main() -> None:
    args = parse_args()

    if not args.input.exists():
        raise FileNotFoundError(
            f"Input dataset not found: {args.input.resolve()}\n"
            "Run scripts.build_bath_keto_week4_dataset first."
        )

    print("=" * 100)
    print("BATH KETO WEEK4 — BODY-ONLY vs BEHAVIOR-AUGMENTED OOF")
    print("=" * 100)
    print("STATUS: DEVELOPMENT ONLY — production v1 is not modified.")
    print(f"Input: {args.input.resolve()}")

    df = pd.read_csv(args.input)
    cohort = validate_input(df)

    print(f"Complete shared cohort: {len(cohort)} participants")
    print(f"CV: {args.splits}-fold x {args.repeats} repeats")
    print("Primary behavior features:")
    for feature in BEHAVIOR_NUMERIC:
        print(f"  - {feature}")
    print()
    print("Running Ridge / RandomForest / CatBoost...")
    print()

    (
        predictions,
        repeat_metrics,
        participant_oof,
        summary,
        metadata,
    ) = run_experiment(
        cohort,
        n_splits=args.splits,
        n_repeats=args.repeats,
        bootstrap_samples=args.bootstrap_samples,
    )

    args.output_dir.mkdir(parents=True, exist_ok=True)

    predictions_path = args.output_dir / "oof_predictions_all_repeats.csv"
    repeat_metrics_path = args.output_dir / "repeat_metrics.csv"
    participant_path = args.output_dir / "participant_oof_aggregated.csv"
    summary_path = args.output_dir / "summary.csv"
    metadata_path = args.output_dir / "experiment_metadata.json"

    predictions.to_csv(predictions_path, index=False)
    repeat_metrics.to_csv(repeat_metrics_path, index=False)
    participant_oof.to_csv(participant_path, index=False)
    summary.to_csv(summary_path, index=False)
    metadata_path.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print_summary(summary)

    print()
    print("Interpretation:")
    print("  mae_delta_behavior_minus_body < 0  => behavior improved MAE")
    print("  mae_delta_behavior_minus_body > 0  => behavior worsened MAE")
    print(
        "  bootstrap CI is exploratory development uncertainty, "
        "not independent external validation."
    )
    print()
    print(f"Results: {args.output_dir.resolve()}")
    print()
    print("Production model was NOT modified.")


if __name__ == "__main__":
    main()
