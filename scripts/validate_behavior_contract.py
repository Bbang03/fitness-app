from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from api.behavior_runtime import (
    BEHAVIOR_FEATURE_VERSION,
    build_behavior_context,
    build_behavior_features,
)


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "models" / "behavior_feature_contract.json"

PREDICTION_DATE = date(2026, 9, 13)
CUTOFF_DATE = date(2026, 9, 12)
ANCHOR_DATE = date(2026, 9, 3)
CURRENT_WEIGHT_KG = 70.0

PREDICTION_PROFILE = {
    "training_experience_months": 24,
    "recent_training_frequency": 4,
    "average_session_minutes": 60,
    "training_consistency": "somewhat_consistent",
    "activity_level": "moderate",
    "average_sleep_hours": 7.0,
    "primary_goal": "recomposition",
    "diet_experience": "beginner",
    "typical_meals_per_day": 3,
}


def iso_utc(day: date, hour: int, minute: int = 0) -> str:
    dt = datetime(
        day.year,
        day.month,
        day.day,
        hour,
        minute,
        tzinfo=timezone.utc,
    )
    return dt.isoformat()


def meal_log(day: date, index: int) -> dict:
    return {
        "id": f"meal-{index}",
        "date": day.isoformat(),
        "meal_type": "lunch",
        "meal_items": [
            {
                "id": f"meal-item-{index}",
                "meal_log_id": f"meal-{index}",
                "food_name": "validation-meal",
                "serving": "1",
                "kcal": 700.0 + index,
                "carbs_g": 80.0,
                "protein_g": 45.0,
                "fat_g": 20.0,
                "nutrition_status": "validated",
                "nutrition_confidence": 1.0,
                "nutrition_source": "validator",
            }
        ],
    }


def workout_log(day: date, index: int) -> dict:
    return {
        "id": f"workout-{index}",
        "date": day.isoformat(),
        "routine_id": None,
        "routine_name": "validation-workout",
        "started_at": iso_utc(day, 9, 0),
        "finished_at": iso_utc(day, 10, 0),
        "set_logs": [
            {
                "id": f"set-{index}",
                "workout_log_id": f"workout-{index}",
                "exercise_name": "validation-lift",
                "set_number": 1,
                "weight_kg": 50.0,
                "reps": 10,
                "actual_rest_seconds": 60,
                "duration_seconds": 0,
                "record_type": "weight_reps",
            }
        ],
    }


def days_before(*offsets: int) -> list[date]:
    return [
        CUTOFF_DATE - timedelta(days=offset)
        for offset in offsets
    ]


def make_rows(day_list: list[date], builder) -> list[dict]:
    return [
        builder(day, index)
        for index, day in enumerate(day_list, start=1)
    ]


def build_case(meal_days: list[date], workout_days: list[date]) -> dict:
    meal_rows = make_rows(meal_days, meal_log)
    workout_rows = make_rows(workout_days, workout_log)

    context = build_behavior_context(
        meal_rows=meal_rows,
        workout_rows=workout_rows,
        prediction_date=PREDICTION_DATE,
        cutoff_date=CUTOFF_DATE,
        anchor_date=ANCHOR_DATE,
    )

    return build_behavior_features(
        meal_rows=meal_rows,
        workout_rows=workout_rows,
        behavior_context=context,
        cutoff_date=CUTOFF_DATE,
        current_weight_kg=CURRENT_WEIGHT_KG,
        prediction_profile=PREDICTION_PROFILE,
    )


def assert_equal(actual, expected, label: str) -> None:
    if actual != expected:
        raise AssertionError(
            f"{label} mismatch\n"
            f"expected: {expected}\n"
            f"actual:   {actual}"
        )


def assert_set_equal(actual, expected, label: str) -> None:
    actual_set = set(actual)
    expected_set = set(expected)

    if actual_set != expected_set:
        missing = sorted(expected_set - actual_set)
        extra = sorted(actual_set - expected_set)

        raise AssertionError(
            f"{label} mismatch\n"
            f"missing: {missing}\n"
            f"extra:   {extra}"
        )


def main() -> None:
    with CONTRACT_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        contract = json.load(file)

    observed_7d = build_case(
        meal_days=days_before(0, 1, 2),
        workout_days=days_before(0, 2),
    )

    observed_14d = build_case(
        meal_days=days_before(0, 1, 7, 8, 9),
        workout_days=days_before(0, 7),
    )

    observed_30d = build_case(
        meal_days=days_before(0, 1, 7, 8, 14, 15, 16),
        workout_days=days_before(0, 14, 15),
    )

    personal_prior = build_case(
        meal_days=days_before(30, 31, 32, 33, 34),
        workout_days=days_before(30, 40, 50),
    )

    unavailable = build_case(
        meal_days=[],
        workout_days=[],
    )

    cases = {
        "observed_7d": observed_7d,
        "observed_14d": observed_14d,
        "observed_30d": observed_30d,
        "personal_prior": personal_prior,
        "unavailable": unavailable,
    }

    assert_equal(
        contract["contract_version"],
        BEHAVIOR_FEATURE_VERSION,
        "contract_version",
    )

    expected_numeric = (
        contract["nutrition_features"]
        + contract["workout_features"]
        + contract["effective_fallback_features"]
        + contract["profile_numeric_features"]
    )

    for case_name, features in cases.items():
        assert_set_equal(
            features["flat_numeric"].keys(),
            expected_numeric,
            f"{case_name}.flat_numeric",
        )

        assert_set_equal(
            features["profile_context"].keys(),
            contract["profile_categorical_features"],
            f"{case_name}.profile_context",
        )

        assert_equal(
            features["used_by_model"],
            contract["production_usage"]["used_by_model"],
            f"{case_name}.used_by_model",
        )

        assert_equal(
            features["model_ready"],
            contract["production_usage"]["model_ready"],
            f"{case_name}.model_ready",
        )

        assert_equal(
            features["cutoff_policy"],
            contract["prediction_policy"]["behavior_cutoff"],
            f"{case_name}.cutoff_policy",
        )

    expected_sources = {
        "observed_7d": (
            "observed_7d",
            "observed_logged_7d",
        ),
        "observed_14d": (
            "observed_14d",
            "observed_logged_14d",
        ),
        "observed_30d": (
            "observed_30d",
            "observed_logged_30d",
        ),
        "personal_prior": (
            "personal_prior_31_90d",
            "personal_logged_prior_31_90d",
        ),
        "unavailable": (
            "unavailable",
            "unavailable",
        ),
    }

    actual_nutrition_sources = []
    actual_training_sources = []

    for case_name, features in cases.items():
        nutrition_source = features["effective"]["nutrition"]["source"]
        training_source = features["effective"]["training"]["source"]

        expected_nutrition, expected_training = expected_sources[case_name]

        assert_equal(
            nutrition_source,
            expected_nutrition,
            f"{case_name}.nutrition_source",
        )

        assert_equal(
            training_source,
            expected_training,
            f"{case_name}.training_source",
        )

        actual_nutrition_sources.append(nutrition_source)
        actual_training_sources.append(training_source)

    assert_set_equal(
        actual_nutrition_sources,
        contract["allowed_nutrition_sources"],
        "allowed_nutrition_sources",
    )

    assert_set_equal(
        actual_training_sources,
        contract["allowed_training_sources"],
        "allowed_training_sources",
    )

    assert_set_equal(
        contract["fallback_source_features"],
        [
            "nutrition_source",
            "training_source",
        ],
        "fallback_source_features",
    )

    print("Behavior contract validation PASSED")
    print(f"contract_version: {contract['contract_version']}")
    print(f"numeric_features: {len(expected_numeric)}")
    print(
        "nutrition_sources:",
        ", ".join(contract["allowed_nutrition_sources"]),
    )
    print(
        "training_sources:",
        ", ".join(contract["allowed_training_sources"]),
    )
    print(
        "production_usage:",
        contract["production_usage"],
    )


if __name__ == "__main__":
    main()
