from datetime import (
    date,
    datetime,
    timedelta,
    timezone,
)
from typing import Any, Optional


APP_TIMEZONE = timezone(
    timedelta(hours=9)
)

WINDOW_DAYS = (
    7,
    14,
    30,
)

PERSONAL_HISTORY_LOOKBACK_DAYS = 90

# Engineering defaults for pipeline validation only.
# These are not physiological or clinical thresholds.
MIN_RECENT_MEAL_DAYS = {
    7: 3,
    14: 5,
    30: 7,
}

MIN_PERSONAL_MEAL_DAYS = 5

MIN_RECENT_WORKOUT_SESSIONS = {
    7: 2,
    14: 2,
    30: 3,
}

MIN_PERSONAL_WORKOUT_SESSIONS = 3

BEHAVIOR_FEATURE_VERSION = "behavior-v0.1"


def parse_datetime(
    value: Any,
) -> Optional[datetime]:

    if value is None:
        return None

    text = str(
        value
    ).strip()

    if not text:
        return None

    try:
        parsed = datetime.fromisoformat(
            text.replace(
                "Z",
                "+00:00",
            )
        )
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(
            tzinfo=timezone.utc
        )

    return parsed.astimezone(
        APP_TIMEZONE
    )


def parse_date(
    value: Any,
) -> Optional[date]:

    if value is None:
        return None

    if isinstance(
        value,
        datetime,
    ):
        return value.date()

    if isinstance(
        value,
        date,
    ):
        return value

    text = str(
        value
    ).strip()

    if not text:
        return None

    try:
        return date.fromisoformat(
            text[:10]
        )
    except ValueError:
        return None


def safe_float(
    value: Any,
    default: float = 0.0,
) -> float:

    try:
        number = float(
            value
        )
    except (
        TypeError,
        ValueError,
    ):
        return default

    if number != number:
        return default

    return number


def optional_float(
    value: Any,
) -> Optional[float]:

    if value is None:
        return None

    try:
        number = float(
            value
        )
    except (
        TypeError,
        ValueError,
    ):
        return None

    if number != number:
        return None

    return number


def window_length_days(
    start_date: date,
    end_date: date,
) -> int:

    if end_date < start_date:
        return 0

    return (
        end_date
        -
        start_date
    ).days + 1


def rows_in_date_window(
    rows,
    start_date: date,
    end_date: date,
):

    if end_date < start_date:
        return []

    filtered = []

    for row in rows:

        row_date = parse_date(
            row.get(
                "date"
            )
        )

        if row_date is None:
            continue

        if (
            start_date
            <= row_date
            <= end_date
        ):
            filtered.append(
                row
            )

    return filtered


def summarize_meals(
    meal_rows,
    start_date: date,
    end_date: date,
):

    rows = rows_in_date_window(
        meal_rows,
        start_date,
        end_date,
    )

    daily = {}

    item_count = 0
    meal_log_count = 0

    for row in rows:

        row_date = parse_date(
            row.get(
                "date"
            )
        )

        if row_date is None:
            continue

        items = (
            row.get(
                "meal_items"
            )
            or []
        )

        # An empty meal shell is not treated as
        # an observed nutrition day.
        if not items:
            continue

        meal_log_count += 1

        key = row_date.isoformat()

        if key not in daily:
            daily[key] = {
                "kcal": 0.0,
                "carbs_g": 0.0,
                "protein_g": 0.0,
                "fat_g": 0.0,
            }

        for item in items:

            item_count += 1

            daily[key]["kcal"] += safe_float(
                item.get(
                    "kcal"
                )
            )

            daily[key]["carbs_g"] += safe_float(
                item.get(
                    "carbs_g"
                )
            )

            daily[key]["protein_g"] += safe_float(
                item.get(
                    "protein_g"
                )
            )

            daily[key]["fat_g"] += safe_float(
                item.get(
                    "fat_g"
                )
            )

    observed_days = len(
        daily
    )

    total_window_days = window_length_days(
        start_date,
        end_date,
    )

    if observed_days > 0:

        avg_kcal = (
            sum(
                value["kcal"]
                for value in daily.values()
            )
            /
            observed_days
        )

        avg_carbs = (
            sum(
                value["carbs_g"]
                for value in daily.values()
            )
            /
            observed_days
        )

        avg_protein = (
            sum(
                value["protein_g"]
                for value in daily.values()
            )
            /
            observed_days
        )

        avg_fat = (
            sum(
                value["fat_g"]
                for value in daily.values()
            )
            /
            observed_days
        )

    else:

        # Missing is not zero.
        avg_kcal = None
        avg_carbs = None
        avg_protein = None
        avg_fat = None

    coverage_ratio = (
        observed_days
        /
        total_window_days
        if total_window_days > 0
        else 0.0
    )

    return {
        "window_start":
            start_date.isoformat(),

        "window_end":
            end_date.isoformat(),

        "calendar_days":
            total_window_days,

        "observed_days":
            observed_days,

        "coverage_ratio":
            float(
                coverage_ratio
            ),

        "meal_logs":
            meal_log_count,

        "meal_items":
            item_count,

        "observed_day_average": {
            "kcal":
                (
                    None
                    if avg_kcal is None
                    else float(
                        avg_kcal
                    )
                ),

            "carbs_g":
                (
                    None
                    if avg_carbs is None
                    else float(
                        avg_carbs
                    )
                ),

            "protein_g":
                (
                    None
                    if avg_protein is None
                    else float(
                        avg_protein
                    )
                ),

            "fat_g":
                (
                    None
                    if avg_fat is None
                    else float(
                        avg_fat
                    )
                ),
        },
    }


def summarize_workouts(
    workout_rows,
    start_date: date,
    end_date: date,
):

    rows = rows_in_date_window(
        workout_rows,
        start_date,
        end_date,
    )

    logged_training_dates = set()

    logged_completed_sessions = 0
    logged_set_count = 0

    total_session_minutes = 0.0
    total_volume_kg = 0.0
    total_time_based_seconds = 0.0

    for row in rows:

        row_date = parse_date(
            row.get(
                "date"
            )
        )

        if row_date is None:
            continue

        finished_at = parse_datetime(
            row.get(
                "finished_at"
            )
        )

        started_at = parse_datetime(
            row.get(
                "started_at"
            )
        )

        if finished_at is None:
            continue

        logged_training_dates.add(
            row_date.isoformat()
        )

        logged_completed_sessions += 1

        if (
            started_at is not None
            and finished_at >= started_at
        ):

            session_seconds = (
                finished_at
                -
                started_at
            ).total_seconds()

            # Defensive cap for malformed timestamps.
            if (
                0
                <= session_seconds
                <= 24 * 60 * 60
            ):
                total_session_minutes += (
                    session_seconds
                    /
                    60.0
                )

        sets = (
            row.get(
                "set_logs"
            )
            or []
        )

        for set_row in sets:

            logged_set_count += 1

            weight = max(
                0.0,
                safe_float(
                    set_row.get(
                        "weight_kg"
                    )
                ),
            )

            reps = max(
                0.0,
                safe_float(
                    set_row.get(
                        "reps"
                    )
                ),
            )

            duration_seconds = max(
                0.0,
                safe_float(
                    set_row.get(
                        "duration_seconds"
                    )
                ),
            )

            if (
                weight > 0
                and reps > 0
            ):
                total_volume_kg += (
                    weight
                    *
                    reps
                )

            if duration_seconds > 0:
                total_time_based_seconds += (
                    duration_seconds
                )

    logged_training_days = len(
        logged_training_dates
    )

    total_window_days = window_length_days(
        start_date,
        end_date,
    )

    logged_training_day_ratio = (
        logged_training_days
        /
        total_window_days
        if total_window_days > 0
        else 0.0
    )

    logged_sessions_per_week = (
        logged_completed_sessions
        *
        7.0
        /
        total_window_days
        if total_window_days > 0
        else None
    )

    logged_volume_kg_per_week = (
        total_volume_kg
        *
        7.0
        /
        total_window_days
        if total_window_days > 0
        else None
    )

    return {
        "window_start":
            start_date.isoformat(),

        "window_end":
            end_date.isoformat(),

        "calendar_days":
            total_window_days,

        "logged_training_days":
            logged_training_days,

        # Ratio of calendar days that contain a completed workout log.
        # This is NOT an estimate of true exercise adherence.
        "logged_training_day_ratio":
            float(
                logged_training_day_ratio
            ),

        "logged_completed_sessions":
            logged_completed_sessions,

        "logged_set_count":
            logged_set_count,

        "logged_session_minutes":
            float(
                total_session_minutes
            ),

        "logged_training_volume_kg":
            float(
                total_volume_kg
            ),

        "logged_time_based_minutes":
            float(
                total_time_based_seconds
                /
                60.0
            ),

        "logged_sessions_per_week":
            (
                None
                if logged_sessions_per_week is None
                else float(
                    logged_sessions_per_week
                )
            ),

        "logged_volume_kg_per_week":
            (
                None
                if logged_volume_kg_per_week is None
                else float(
                    logged_volume_kg_per_week
                )
            ),
    }


def build_behavior_context(
    meal_rows,
    workout_rows,
    prediction_date: date,
    cutoff_date: date,
    anchor_date: date,
):

    windows = {}

    for days in WINDOW_DAYS:

        start_date = (
            cutoff_date
            -
            timedelta(
                days=days - 1
            )
        )

        windows[
            f"{days}d"
        ] = {
            "meals":
                summarize_meals(
                    meal_rows,
                    start_date,
                    cutoff_date,
                ),

            "workouts":
                summarize_workouts(
                    workout_rows,
                    start_date,
                    cutoff_date,
                ),
        }

    since_anchor_start = (
        anchor_date
        +
        timedelta(
            days=1
        )
    )

    if since_anchor_start <= cutoff_date:

        since_anchor_meals = summarize_meals(
            meal_rows,
            since_anchor_start,
            cutoff_date,
        )

        since_anchor_workouts = summarize_workouts(
            workout_rows,
            since_anchor_start,
            cutoff_date,
        )

    else:

        since_anchor_meals = summarize_meals(
            [],
            since_anchor_start,
            cutoff_date,
        )

        since_anchor_workouts = summarize_workouts(
            [],
            since_anchor_start,
            cutoff_date,
        )

    return {
        "prediction_date":
            prediction_date.isoformat(),

        "behavior_cutoff_date":
            cutoff_date.isoformat(),

        "cutoff_policy":
            "D-1",

        "anchor_date":
            anchor_date.isoformat(),

        "since_anchor_start_date":
            since_anchor_start.isoformat(),

        "missing_data_policy": {
            "missing_meal_means_zero_intake":
                False,

            "missing_workout_means_no_exercise":
                False,

            "fallback_engine_enabled":
                True,

            "population_prior_enabled":
                False,
        },

        # v1 CatBoost remains unchanged.
        "behavior_used_by_model":
            False,

        "windows":
            windows,

        "since_anchor": {
            "meals":
                since_anchor_meals,

            "workouts":
                since_anchor_workouts,
        },
    }


def _nutrition_candidate(
    source_name,
    summary,
    current_weight_kg,
):

    averages = (
        summary.get(
            "observed_day_average"
        )
        or {}
    )

    kcal = optional_float(
        averages.get(
            "kcal"
        )
    )

    protein_g = optional_float(
        averages.get(
            "protein_g"
        )
    )

    carbs_g = optional_float(
        averages.get(
            "carbs_g"
        )
    )

    fat_g = optional_float(
        averages.get(
            "fat_g"
        )
    )

    protein_g_per_kg = None

    if (
        protein_g is not None
        and current_weight_kg is not None
        and current_weight_kg > 0
    ):
        protein_g_per_kg = (
            protein_g
            /
            current_weight_kg
        )

    return {
        "source":
            source_name,

        "avg_kcal":
            kcal,

        "avg_carbs_g":
            carbs_g,

        "avg_protein_g":
            protein_g,

        "avg_fat_g":
            fat_g,

        "avg_protein_g_per_kg":
            protein_g_per_kg,

        "observed_days":
            summary.get(
                "observed_days",
                0,
            ),

        "coverage_ratio":
            summary.get(
                "coverage_ratio",
                0.0,
            ),
    }


def _training_candidate(
    source_name,
    summary,
):

    return {
        "source":
            source_name,

        "logged_sessions_per_week":
            optional_float(
                summary.get(
                    "logged_sessions_per_week"
                )
            ),

        "logged_volume_kg_per_week":
            optional_float(
                summary.get(
                    "logged_volume_kg_per_week"
                )
            ),

        "logged_completed_sessions":
            int(
                summary.get(
                    "logged_completed_sessions",
                    0,
                )
                or 0
            ),

        "logged_set_count":
            int(
                summary.get(
                    "logged_set_count",
                    0,
                )
                or 0
            ),

        "logged_training_day_ratio":
            safe_float(
                summary.get(
                    "logged_training_day_ratio"
                )
            ),
    }


def _select_effective_nutrition(
    context,
    personal_prior_meals,
    current_weight_kg,
):

    for days in WINDOW_DAYS:

        summary = (
            context[
                "windows"
            ][
                f"{days}d"
            ][
                "meals"
            ]
        )

        if (
            summary.get(
                "observed_days",
                0,
            )
            >=
            MIN_RECENT_MEAL_DAYS[
                days
            ]
        ):
            return _nutrition_candidate(
                f"observed_{days}d",
                summary,
                current_weight_kg,
            )

    if (
        personal_prior_meals.get(
            "observed_days",
            0,
        )
        >=
        MIN_PERSONAL_MEAL_DAYS
    ):
        return _nutrition_candidate(
            "personal_prior_31_90d",
            personal_prior_meals,
            current_weight_kg,
        )

    return {
        "source":
            "unavailable",

        "avg_kcal":
            None,

        "avg_carbs_g":
            None,

        "avg_protein_g":
            None,

        "avg_fat_g":
            None,

        "avg_protein_g_per_kg":
            None,

        "observed_days":
            0,

        "coverage_ratio":
            0.0,
    }


def _select_effective_training(
    context,
    personal_prior_workouts,
):

    for days in WINDOW_DAYS:

        summary = (
            context[
                "windows"
            ][
                f"{days}d"
            ][
                "workouts"
            ]
        )

        if (
            summary.get(
                "logged_completed_sessions",
                0,
            )
            >=
            MIN_RECENT_WORKOUT_SESSIONS[
                days
            ]
        ):
            return _training_candidate(
                f"observed_logged_{days}d",
                summary,
            )

    if (
        personal_prior_workouts.get(
            "logged_completed_sessions",
            0,
        )
        >=
        MIN_PERSONAL_WORKOUT_SESSIONS
    ):
        return _training_candidate(
            "personal_logged_prior_31_90d",
            personal_prior_workouts,
        )

    return {
        "source":
            "unavailable",

        "logged_sessions_per_week":
            None,

        "logged_volume_kg_per_week":
            None,

        "logged_completed_sessions":
            0,

        "logged_set_count":
            0,

        "logged_training_day_ratio":
            0.0,
    }


def build_behavior_features(
    meal_rows,
    workout_rows,
    behavior_context,
    cutoff_date: date,
    current_weight_kg: Optional[float],
    prediction_profile=None,
):

    prior_start = (
        cutoff_date
        -
        timedelta(
            days=PERSONAL_HISTORY_LOOKBACK_DAYS - 1
        )
    )

    prior_end = (
        cutoff_date
        -
        timedelta(
            days=30
        )
    )

    personal_prior_meals = summarize_meals(
        meal_rows,
        prior_start,
        prior_end,
    )

    personal_prior_workouts = summarize_workouts(
        workout_rows,
        prior_start,
        prior_end,
    )

    effective_nutrition = _select_effective_nutrition(
        behavior_context,
        personal_prior_meals,
        current_weight_kg,
    )

    effective_training = _select_effective_training(
        behavior_context,
        personal_prior_workouts,
    )

    flat_numeric = {}

    for days in WINDOW_DAYS:

        key = f"{days}d"

        meal_summary = (
            behavior_context[
                "windows"
            ][
                key
            ][
                "meals"
            ]
        )

        workout_summary = (
            behavior_context[
                "windows"
            ][
                key
            ][
                "workouts"
            ]
        )

        meal_avg = (
            meal_summary.get(
                "observed_day_average"
            )
            or {}
        )

        prefix = f"meal_{days}d"

        flat_numeric[
            f"{prefix}_observed_days"
        ] = float(
            meal_summary.get(
                "observed_days",
                0,
            )
        )

        flat_numeric[
            f"{prefix}_coverage_ratio"
        ] = safe_float(
            meal_summary.get(
                "coverage_ratio"
            )
        )

        flat_numeric[
            f"{prefix}_avg_kcal"
        ] = optional_float(
            meal_avg.get(
                "kcal"
            )
        )

        flat_numeric[
            f"{prefix}_avg_carbs_g"
        ] = optional_float(
            meal_avg.get(
                "carbs_g"
            )
        )

        flat_numeric[
            f"{prefix}_avg_protein_g"
        ] = optional_float(
            meal_avg.get(
                "protein_g"
            )
        )

        flat_numeric[
            f"{prefix}_avg_fat_g"
        ] = optional_float(
            meal_avg.get(
                "fat_g"
            )
        )

        prefix = f"workout_{days}d"

        flat_numeric[
            f"{prefix}_logged_training_days"
        ] = float(
            workout_summary.get(
                "logged_training_days",
                0,
            )
        )

        flat_numeric[
            f"{prefix}_logged_training_day_ratio"
        ] = safe_float(
            workout_summary.get(
                "logged_training_day_ratio"
            )
        )

        flat_numeric[
            f"{prefix}_logged_completed_sessions"
        ] = float(
            workout_summary.get(
                "logged_completed_sessions",
                0,
            )
        )

        flat_numeric[
            f"{prefix}_logged_set_count"
        ] = float(
            workout_summary.get(
                "logged_set_count",
                0,
            )
        )

        flat_numeric[
            f"{prefix}_logged_volume_kg"
        ] = safe_float(
            workout_summary.get(
                "logged_training_volume_kg"
            )
        )

        flat_numeric[
            f"{prefix}_logged_sessions_per_week"
        ] = optional_float(
            workout_summary.get(
                "logged_sessions_per_week"
            )
        )

        flat_numeric[
            f"{prefix}_logged_volume_kg_per_week"
        ] = optional_float(
            workout_summary.get(
                "logged_volume_kg_per_week"
            )
        )

    flat_numeric[
        "effective_avg_kcal"
    ] = effective_nutrition[
        "avg_kcal"
    ]

    flat_numeric[
        "effective_avg_protein_g"
    ] = effective_nutrition[
        "avg_protein_g"
    ]

    flat_numeric[
        "effective_avg_protein_g_per_kg"
    ] = effective_nutrition[
        "avg_protein_g_per_kg"
    ]

    flat_numeric[
        "effective_logged_sessions_per_week"
    ] = effective_training[
        "logged_sessions_per_week"
    ]

    flat_numeric[
        "effective_logged_volume_kg_per_week"
    ] = effective_training[
        "logged_volume_kg_per_week"
    ]

    prediction_profile = (
        prediction_profile
        or {}
    )

    flat_numeric[
        "profile_training_experience_months"
    ] = optional_float(
        prediction_profile.get(
            "training_experience_months"
        )
    )

    flat_numeric[
        "profile_recent_training_frequency"
    ] = optional_float(
        prediction_profile.get(
            "recent_training_frequency"
        )
    )

    flat_numeric[
        "profile_average_session_minutes"
    ] = optional_float(
        prediction_profile.get(
            "average_session_minutes"
        )
    )

    flat_numeric[
        "profile_average_sleep_hours"
    ] = optional_float(
        prediction_profile.get(
            "average_sleep_hours"
        )
    )

    return {
        "version":
            BEHAVIOR_FEATURE_VERSION,

        "used_by_model":
            False,

        "model_ready":
            False,

        "cutoff_policy":
            "D-1",

        "engineering_thresholds": {
            "recent_meal_days":
                MIN_RECENT_MEAL_DAYS,

            "personal_meal_days":
                MIN_PERSONAL_MEAL_DAYS,

            "recent_workout_sessions":
                MIN_RECENT_WORKOUT_SESSIONS,

            "personal_workout_sessions":
                MIN_PERSONAL_WORKOUT_SESSIONS,

            "note":
                (
                    "Pipeline engineering defaults only; "
                    "not physiological thresholds."
                ),
        },

        "personal_prior": {
            "window_start":
                prior_start.isoformat(),

            "window_end":
                prior_end.isoformat(),

            "meals":
                personal_prior_meals,

            "workouts":
                personal_prior_workouts,
        },

        "effective": {
            "nutrition":
                effective_nutrition,

            "training":
                effective_training,
        },

        "profile_context": {
            "training_consistency":
                prediction_profile.get(
                    "training_consistency"
                ),

            "activity_level":
                prediction_profile.get(
                    "activity_level"
                ),

            "primary_goal":
                prediction_profile.get(
                    "primary_goal"
                ),

            "diet_experience":
                prediction_profile.get(
                    "diet_experience"
                ),

            "typical_meals_per_day":
                prediction_profile.get(
                    "typical_meals_per_day"
                ),
        },

        "flat_numeric":
            flat_numeric,
    }
