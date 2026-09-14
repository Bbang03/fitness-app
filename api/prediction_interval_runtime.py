from __future__ import annotations

from pathlib import Path
import json


BASE_DIR = Path(__file__).resolve().parents[1]

ARTIFACT_PATH = (
    BASE_DIR
    / "models"
    / "prediction_interval_v1.json"
)

DEFAULT_COVERAGE = 0.80


def _load_artifact() -> dict:
    if not ARTIFACT_PATH.exists():
        raise RuntimeError(
            f"Missing prediction interval artifact: {ARTIFACT_PATH}"
        )

    with ARTIFACT_PATH.open(
        "r",
        encoding="utf-8",
    ) as f:
        artifact = json.load(f)

    if "metrics" not in artifact:
        raise RuntimeError(
            "Prediction interval artifact has no metrics."
        )

    return artifact


ARTIFACT = _load_artifact()


METRIC_MAP = {
    "weight_kg": {
        "artifact_key": "weight_kg",
        "prediction_key": "weight_kg",
        "unit": "kg",
    },

    "fat_mass_kg": {
        "artifact_key": "fat_mass_kg",
        "prediction_key": "fat_mass_kg",
        "unit": "kg",
    },

    "skeletal_muscle_kg": {
        "artifact_key": "smm_actual_kg",
        "prediction_key": "skeletal_muscle_kg",
        "unit": "kg",
    },

    "body_fat_pct": {
        "artifact_key": "bf_pct",
        "prediction_key": "body_fat_pct",
        "unit": "percentage_point",
    },
}


def _bound_value(
    metric: str,
    value: float,
) -> float:

    value = float(value)

    if metric in {
        "weight_kg",
        "fat_mass_kg",
        "skeletal_muscle_kg",
    }:
        return max(
            0.0,
            value,
        )

    if metric == "body_fat_pct":
        return min(
            100.0,
            max(
                0.0,
                value,
            ),
        )

    return value


def apply_prediction_intervals(
    result: dict,
) -> dict:

    prediction = result.get(
        "prediction"
    )

    if not isinstance(
        prediction,
        dict,
    ):
        raise RuntimeError(
            "Prediction result is missing prediction."
        )

    result_model_version = str(
        result.get(
            "model",
            {},
        ).get(
            "version",
            "",
        )
    )

    artifact_model_version = str(
        ARTIFACT.get(
            "production_model_version",
            "",
        )
    )

    if (
        result_model_version
        and artifact_model_version
        and result_model_version
        != artifact_model_version
    ):
        raise RuntimeError(
            "Prediction interval artifact/model version mismatch."
        )

    correction = (
        result.get(
            "behavior_correction"
        )
        or {}
    )

    output_metrics = {}

    for public_key, config in METRIC_MAP.items():

        artifact_key = config[
            "artifact_key"
        ]

        prediction_key = config[
            "prediction_key"
        ]

        center = float(
            prediction[
                prediction_key
            ]
        )

        metric_artifact = (
            ARTIFACT[
                "metrics"
            ][
                artifact_key
            ]
        )

        intervals = {}

        for coverage_key in (
            "0.50",
            "0.80",
        ):

            interval_artifact = (
                metric_artifact[
                    "intervals"
                ][
                    coverage_key
                ]
            )

            coverage = float(
                coverage_key
            )

            lower_residual = float(
                interval_artifact[
                    "lower_residual_quantile"
                ]
            )

            upper_residual = float(
                interval_artifact[
                    "upper_residual_quantile"
                ]
            )

            lower = _bound_value(
                public_key,
                center
                + lower_residual,
            )

            upper = _bound_value(
                public_key,
                center
                + upper_residual,
            )

            intervals[
                coverage_key
            ] = {
                "coverage":
                    coverage,

                "lower":
                    lower,

                "upper":
                    upper,

                "lower_residual_quantile":
                    lower_residual,

                "upper_residual_quantile":
                    upper_residual,

                "empirical_row_coverage":
                    interval_artifact.get(
                        "empirical_row_coverage"
                    ),

                "empirical_participant_macro_coverage":
                    interval_artifact.get(
                        "empirical_participant_macro_coverage"
                    ),
            }

        output_metrics[
            public_key
        ] = {
            "center":
                center,

            "unit":
                config[
                    "unit"
                ],

            "default_coverage":
                DEFAULT_COVERAGE,

            "default_interval":
                intervals[
                    "0.80"
                ],

            "intervals":
                intervals,
        }

    result[
        "prediction_interval"
    ] = {
        "artifact_version":
            ARTIFACT.get(
                "artifact_version"
            ),

        "production_model_version":
            artifact_model_version,

        "source_model_id":
            ARTIFACT.get(
                "source_model_id"
            ),

        "endpoint_window":
            ARTIFACT.get(
                "endpoint_window"
            ),

        "default_coverage":
            DEFAULT_COVERAGE,

        "available_coverages":
            [
                0.50,
                0.80,
            ],

        "center_policy":
            "final_prediction_after_behavior_correction",

        "behavior_correction_applied":
            bool(
                correction.get(
                    "applied",
                    False,
                )
            ),

        "behavior_correction_uncertainty_calibrated":
            False,

        "calibration_method":
            ARTIFACT.get(
                "calibration_method"
            ),

        "calibration_scope":
            ARTIFACT.get(
                "calibration_scope"
            ),

        "metrics":
            output_metrics,
    }

    result[
        "model"
    ][
        "prediction_interval_version"
    ] = ARTIFACT.get(
        "artifact_version"
    )

    return result


def health_status() -> dict:
    return {
        "loaded":
            True,

        "artifact_version":
            ARTIFACT.get(
                "artifact_version"
            ),

        "production_model_version":
            ARTIFACT.get(
                "production_model_version"
            ),

        "default_coverage":
            DEFAULT_COVERAGE,

        "available_coverages":
            [
                0.50,
                0.80,
            ],

        "calibration_scope":
            ARTIFACT.get(
                "calibration_scope"
            ),
    }