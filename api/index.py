from typing import Optional
from datetime import (
    date,
    datetime,
    timedelta,
    timezone,
)

import asyncio
import os

import httpx

from fastapi import (
    FastAPI,
    HTTPException,
    Header,
)

from pydantic import BaseModel

from api.model_runtime import (
    MANIFEST,
    MODELS,
    SELECTED_CONFIG,
    predict_internal,
)


# =================================================================================================
# ENVIRONMENT
# =================================================================================================

SUPABASE_URL = (
    os.environ
    .get(
        "SUPABASE_URL",
        "",
    )
    .rstrip("/")
)

SUPABASE_PUBLISHABLE_KEY = (
    os.environ
    .get(
        "SUPABASE_PUBLISHABLE_KEY",
        "",
    )
)


APP_TIMEZONE = timezone(
    timedelta(
        hours=9
    )
)


def require_supabase_config():

    if not SUPABASE_URL:

        raise RuntimeError(
            "SUPABASE_URL is not configured."
        )

    if not SUPABASE_PUBLISHABLE_KEY:

        raise RuntimeError(
            "SUPABASE_PUBLISHABLE_KEY "
            "is not configured."
        )


# =================================================================================================
# REQUEST
# =================================================================================================

class PredictMeRequest(
    BaseModel
):

    save_prediction: bool = True

    # Optional explicit date is useful for
    # audit / reproducible inference later.
    #
    # Production frontend can omit this.
    prediction_date: Optional[
        date
    ] = None


# =================================================================================================
# DATE / NUMBER HELPERS
# =================================================================================================

def resolve_prediction_date(
    requested_date,
):

    if requested_date is not None:

        return requested_date

    return (
        datetime
        .now(
            APP_TIMEZONE
        )
        .date()
    )


def parse_datetime(
    value,
):

    if value is None:

        return None

    text = str(
        value
    ).strip()

    if not text:

        return None

    try:

        parsed = (
            datetime
            .fromisoformat(
                text.replace(
                    "Z",
                    "+00:00",
                )
            )
        )

    except ValueError:

        return None


    if parsed.tzinfo is None:

        parsed = (
            parsed
            .replace(
                tzinfo=timezone.utc
            )
        )


    return (
        parsed
        .astimezone(
            APP_TIMEZONE
        )
    )


def parse_date(
    value,
):

    if value is None:

        return None

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

        return (
            date
            .fromisoformat(
                text[:10]
            )
        )

    except ValueError:

        return None


def safe_float(
    value,
    default=0.0,
):

    try:

        number = float(
            value
        )

        if number != number:

            return default

        return number

    except (
        TypeError,
        ValueError,
    ):

        return default


# =================================================================================================
# AUTH
# =================================================================================================

def extract_bearer_token(
    authorization,
):

    if not authorization:

        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header.",
        )


    prefix = "Bearer "


    if not authorization.startswith(
        prefix
    ):

        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header.",
        )


    token = (
        authorization[
            len(prefix):
        ]
        .strip()
    )


    if not token:

        raise HTTPException(
            status_code=401,
            detail="Missing access token.",
        )


    return token


def supabase_headers(
    token,
):

    return {

        "apikey":
            SUPABASE_PUBLISHABLE_KEY,

        "Authorization":
            f"Bearer {token}",

        "Content-Type":
            "application/json",
    }


async def verify_user(
    client,
    token,
):

    response = await client.get(

        f"{SUPABASE_URL}/auth/v1/user",

        headers=
            supabase_headers(
                token
            ),
    )


    if response.status_code != 200:

        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session.",
        )


    user = response.json()


    user_id = user.get(
        "id"
    )


    if not user_id:

        raise HTTPException(
            status_code=401,
            detail="Could not resolve authenticated user.",
        )


    return user_id


# =================================================================================================
# GENERIC SUPABASE REST HELPERS
# =================================================================================================

async def fetch_optional_single(
    client,
    token,
    table,
    select,
    filter_name,
    filter_value,
):

    params = [

        (
            "select",
            select,
        ),

        (
            filter_name,
            f"eq.{filter_value}",
        ),

        (
            "limit",
            "1",
        ),
    ]


    response = await client.get(

        f"{SUPABASE_URL}/rest/v1/{table}",

        headers=
            supabase_headers(
                token
            ),

        params=params,
    )


    if response.status_code != 200:

        raise RuntimeError(
            f"Could not retrieve {table}."
        )


    rows = response.json()


    if not rows:

        return None


    return rows[0]


async def fetch_paginated_user_rows(
    client,
    token,
    table,
    select,
    user_id,
    start_date,
    end_date,
    order,
    extra_filters=None,
):

    if end_date < start_date:

        return []


    headers = (
        supabase_headers(
            token
        )
    )


    page_size = 1000

    offset = 0

    all_rows = []


    while True:

        params = [

            (
                "select",
                select,
            ),

            (
                "user_id",
                f"eq.{user_id}",
            ),

            (
                "date",
                f"gte.{start_date.isoformat()}",
            ),

            (
                "date",
                f"lte.{end_date.isoformat()}",
            ),

            (
                "order",
                order,
            ),

            (
                "limit",
                str(
                    page_size
                ),
            ),

            (
                "offset",
                str(
                    offset
                ),
            ),
        ]


        if extra_filters:

            params.extend(
                extra_filters
            )


        response = await client.get(

            f"{SUPABASE_URL}/rest/v1/{table}",

            headers=headers,

            params=params,
        )


        if response.status_code != 200:

            raise RuntimeError(
                f"Could not retrieve {table}."
            )


        rows = response.json()


        all_rows.extend(
            rows
        )


        if len(
            rows
        ) < page_size:

            break


        offset += (
            page_size
        )


        if offset >= 10000:

            raise RuntimeError(
                f"Unexpectedly large {table} history."
            )


    return all_rows


# =================================================================================================
# PROFILE
# =================================================================================================

async def fetch_profile(
    client,
    token,
    user_id,
):

    return await fetch_optional_single(

        client,
        token,

        "profiles",

        (
            "id,"
            "height_cm,"
            "sex,"
            "birth_year"
        ),

        "id",
        user_id,
    )


async def fetch_prediction_profile(
    client,
    token,
    user_id,
):

    return await fetch_optional_single(

        client,
        token,

        "prediction_profiles",

        (
            "user_id,"
            "training_experience_months,"
            "recent_training_frequency,"
            "average_session_minutes,"
            "training_consistency,"
            "activity_level,"
            "average_sleep_hours,"
            "primary_goal,"
            "diet_experience,"
            "typical_meals_per_day"
        ),

        "user_id",
        user_id,
    )


# =================================================================================================
# INBODY
# =================================================================================================

async def fetch_inbody_records(
    client,
    token,
    user_id,
):

    headers = (
        supabase_headers(
            token
        )
    )


    page_size = 1000

    offset = 0

    all_rows = []


    while True:

        params = {

            "select":
                (
                    "id,"
                    "user_id,"
                    "measured_at,"
                    "weight_kg,"
                    "skeletal_muscle_kg,"
                    "body_fat_kg,"
                    "body_fat_pct"
                ),

            "user_id":
                f"eq.{user_id}",

            "order":
                "measured_at.desc",

            "limit":
                str(
                    page_size
                ),

            "offset":
                str(
                    offset
                ),
        }


        response = await client.get(

            f"{SUPABASE_URL}/rest/v1/inbody_records",

            headers=headers,

            params=params,
        )


        if response.status_code != 200:

            raise RuntimeError(
                "Could not retrieve "
                "InBody history."
            )


        rows = response.json()


        all_rows.extend(
            rows
        )


        if len(rows) < page_size:

            break


        offset += (
            page_size
        )


        if offset >= 10000:

            raise RuntimeError(
                "Unexpectedly large InBody history."
            )


    return all_rows


# =================================================================================================
# MEALS
# =================================================================================================

async def fetch_meal_logs(
    client,
    token,
    user_id,
    start_date,
    end_date,
):

    return await fetch_paginated_user_rows(

        client,
        token,

        table=
            "meal_logs",

        select=(
            "id,"
            "user_id,"
            "date,"
            "meal_type,"
            "meal_items("
            "id,"
            "meal_log_id,"
            "food_name,"
            "serving,"
            "kcal,"
            "carbs_g,"
            "protein_g,"
            "fat_g,"
            "nutrition_status,"
            "nutrition_confidence,"
            "nutrition_source"
            ")"
        ),

        user_id=
            user_id,

        start_date=
            start_date,

        end_date=
            end_date,

        order=
            "date.asc",
    )


# =================================================================================================
# WORKOUTS
# =================================================================================================

async def fetch_workout_logs(
    client,
    token,
    user_id,
    start_date,
    end_date,
):

    return await fetch_paginated_user_rows(

        client,
        token,

        table=
            "workout_logs",

        select=(
            "id,"
            "user_id,"
            "routine_id,"
            "routine_name,"
            "date,"
            "started_at,"
            "finished_at,"
            "set_logs("
            "id,"
            "workout_log_id,"
            "exercise_name,"
            "set_number,"
            "weight_kg,"
            "reps,"
            "actual_rest_seconds,"
            "duration_seconds,"
            "record_type"
            ")"
        ),

        user_id=
            user_id,

        start_date=
            start_date,

        end_date=
            end_date,

        order=
            "date.asc",

        # Only completed workouts are prediction inputs.
        extra_filters=[
            (
                "finished_at",
                "not.is.null",
            ),
        ],
    )


# =================================================================================================
# BEHAVIOR WINDOW HELPERS
# =================================================================================================

def window_length_days(
    start_date,
    end_date,
):

    if end_date < start_date:

        return 0

    return (
        (
            end_date
            -
            start_date
        ).days
        +
        1
    )


def rows_in_date_window(
    rows,
    start_date,
    end_date,
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
            <=
            row_date
            <=
            end_date
        ):

            filtered.append(
                row
            )


    return filtered


def summarize_meals(
    meal_rows,
    start_date,
    end_date,
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
            or
            []
        )


        # An empty meal shell should not count
        # as an observed nutrition day.
        if not items:

            continue


        meal_log_count += 1


        key = (
            row_date
            .isoformat()
        )


        if key not in daily:

            daily[key] = {

                "kcal":
                    0.0,

                "carbs_g":
                    0.0,

                "protein_g":
                    0.0,

                "fat_g":
                    0.0,
            }


        for item in items:

            item_count += 1


            daily[
                key
            ][
                "kcal"
            ] += safe_float(
                item.get(
                    "kcal"
                )
            )


            daily[
                key
            ][
                "carbs_g"
            ] += safe_float(
                item.get(
                    "carbs_g"
                )
            )


            daily[
                key
            ][
                "protein_g"
            ] += safe_float(
                item.get(
                    "protein_g"
                )
            )


            daily[
                key
            ][
                "fat_g"
            ] += safe_float(
                item.get(
                    "fat_g"
                )
            )


    observed_days = len(
        daily
    )


    total_window_days = (
        window_length_days(
            start_date,
            end_date,
        )
    )


    if observed_days > 0:

        avg_kcal = (
            sum(
                value[
                    "kcal"
                ]
                for value
                in daily.values()
            )
            /
            observed_days
        )


        avg_carbs = (
            sum(
                value[
                    "carbs_g"
                ]
                for value
                in daily.values()
            )
            /
            observed_days
        )


        avg_protein = (
            sum(
                value[
                    "protein_g"
                ]
                for value
                in daily.values()
            )
            /
            observed_days
        )


        avg_fat = (
            sum(
                value[
                    "fat_g"
                ]
                for value
                in daily.values()
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


    coverage = (

        observed_days
        /
        total_window_days

        if total_window_days > 0

        else
        0.0
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
                coverage
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
    start_date,
    end_date,
):

    rows = rows_in_date_window(

        workout_rows,
        start_date,
        end_date,
    )


    observed_dates = set()

    completed_sessions = 0

    set_count = 0

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


        # fetch_workout_logs already requests
        # finished_at IS NOT NULL.
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


        observed_dates.add(
            row_date.isoformat()
        )


        completed_sessions += 1


        if (
            started_at is not None
            and
            finished_at >= started_at
        ):

            session_seconds = (
                finished_at
                -
                started_at
            ).total_seconds()


            # Ignore clearly corrupt sessions
            # rather than turning them into huge features.
            if (
                0
                <=
                session_seconds
                <=
                24 * 60 * 60
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
            or
            []
        )


        for set_row in sets:

            set_count += 1


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


            # Only positive weight × reps contributes
            # to volume. reps-only movements do not
            # become artificial zero-weight volume.
            if (
                weight > 0
                and
                reps > 0
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


    observed_days = len(
        observed_dates
    )


    total_window_days = (
        window_length_days(
            start_date,
            end_date,
        )
    )


    coverage = (

        observed_days
        /
        total_window_days

        if total_window_days > 0

        else
        0.0
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

        # This is logging coverage.
        #
        # A non-observed day must NOT be interpreted
        # as proof that no exercise happened.
        "coverage_ratio":
            float(
                coverage
            ),

        "completed_sessions":
            completed_sessions,

        "set_count":
            set_count,

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
    }


def build_behavior_context(
    meal_rows,
    workout_rows,
    prediction_date,
    cutoff_date,
    anchor_date,
):

    windows = {}


    for days in [
        7,
        14,
        30,
    ]:

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

        since_anchor_meals = (
            summarize_meals(

                meal_rows,
                since_anchor_start,
                cutoff_date,
            )
        )


        since_anchor_workouts = (
            summarize_workouts(

                workout_rows,
                since_anchor_start,
                cutoff_date,
            )
        )

    else:

        # Example:
        # InBody was measured today while behavior
        # cutoff is yesterday.
        since_anchor_meals = (
            summarize_meals(

                [],
                since_anchor_start,
                cutoff_date,
            )
        )


        since_anchor_workouts = (
            summarize_workouts(

                [],
                since_anchor_start,
                cutoff_date,
            )
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
                False,

            "fallback_stage":
                "not_applied_yet",
        },

        # Important:
        # v1 prediction is intentionally unchanged
        # in this first integration step.
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


# =================================================================================================
# MAP DB RECORD → MODEL INPUT
# =================================================================================================

def record_to_model_body(
    row,
):

    required = [
        "measured_at",
        "weight_kg",
        "skeletal_muscle_kg",
        "body_fat_kg",
        "body_fat_pct",
    ]


    missing = [

        key
        for key
        in required

        if row.get(
            key
        ) is None
    ]


    if missing:

        raise ValueError(
            "InBody record is incomplete: "
            +
            ", ".join(
                missing
            )
        )


    return {

        "measured_at":
            row[
                "measured_at"
            ],

        "weight_kg":
            float(
                row[
                    "weight_kg"
                ]
            ),

        "fat_mass_kg":
            float(
                row[
                    "body_fat_kg"
                ]
            ),

        "skeletal_muscle_kg":
            float(
                row[
                    "skeletal_muscle_kg"
                ]
            ),

        "body_fat_pct":
            float(
                row[
                    "body_fat_pct"
                ]
            ),
    }


# =================================================================================================
# SAVE RESULT
# =================================================================================================

async def save_prediction_history(
    client,
    token,
    user_id,
    source_inbody_id,
    result,
):

    current = (
        result[
            "current"
        ]
    )

    prediction = (
        result[
            "prediction"
        ]
    )

    change = (
        result[
            "change"
        ]
    )


    payload = {

        "user_id":
            user_id,

        "source_inbody_id":
            source_inbody_id,

        "model_version":
            result[
                "model"
            ][
                "version"
            ],

        "endpoint_window":
            result[
                "model"
            ][
                "endpoint_window"
            ],

        "current_measured_at":
            current[
                "measured_at"
            ],

        "current_weight_kg":
            current[
                "weight_kg"
            ],

        "current_fat_mass_kg":
            current[
                "fat_mass_kg"
            ],

        "current_skeletal_muscle_kg":
            current[
                "skeletal_muscle_kg"
            ],

        "current_body_fat_pct":
            current[
                "body_fat_pct"
            ],

        "predicted_weight_kg":
            prediction[
                "weight_kg"
            ],

        "predicted_fat_mass_kg":
            prediction[
                "fat_mass_kg"
            ],

        "predicted_skeletal_muscle_kg":
            prediction[
                "skeletal_muscle_kg"
            ],

        "predicted_body_fat_pct":
            prediction[
                "body_fat_pct"
            ],

        "delta_weight_kg":
            change[
                "weight_kg"
            ],

        "delta_fat_mass_kg":
            change[
                "fat_mass_kg"
            ],

        "delta_skeletal_muscle_kg":
            change[
                "skeletal_muscle_kg"
            ],

        "delta_body_fat_pct":
            change[
                "body_fat_pct"
            ],

        "history_meta":
            result[
                "history"
            ],

        "quality_meta":
            result[
                "quality"
            ],
    }


    headers = (
        supabase_headers(
            token
        )
    )


    headers[
        "Prefer"
    ] = "return=representation"


    response = await client.post(

        f"{SUPABASE_URL}/rest/v1/prediction_history",

        headers=headers,

        json=payload,
    )


    if response.status_code not in (
        200,
        201,
    ):

        raise RuntimeError(
            "Prediction succeeded but "
            "history save failed."
        )


    rows = response.json()


    if not rows:

        raise RuntimeError(
            "Prediction history insert "
            "returned no row."
        )


    return rows[
        0
    ]


# =================================================================================================
# APP
# =================================================================================================

app = FastAPI(

    title=
        "FitTrack Prediction API",

    version=
        MANIFEST[
            "model_version"
        ],
)


@app.get(
    "/api/health"
)
async def health():

    return {

        "status":
            "ok",

        "service":
            "fittrack-prediction",

        "model_version":
            MANIFEST[
                "model_version"
            ],

        "models_loaded": {

            target:
                (
                    model is not None

                    or

                    SELECTED_CONFIG[
                        target
                    ][
                        "policy"
                    ]
                    ==
                    "persistence"
                )

            for target, model
            in MODELS.items()
        },

        "supabase_configured":
            bool(
                SUPABASE_URL
                and
                SUPABASE_PUBLISHABLE_KEY
            ),

        "behavior_pipeline":
            "context-v2-ready",
    }


@app.post(
    "/api/predict"
)
async def predict_me(

    body:
        PredictMeRequest,

    authorization:
        Optional[str]
        =
        Header(
            default=None
        ),
):

    try:

        require_supabase_config()


        prediction_date = (
            resolve_prediction_date(
                body.prediction_date
            )
        )


        # ---------------------------------------------------------------------
        # CRITICAL BEHAVIOR CUTOFF
        #
        # Prediction on date D may use completed
        # meal/workout data only through D-1.
        # ---------------------------------------------------------------------

        behavior_cutoff_date = (
            prediction_date
            -
            timedelta(
                days=1
            )
        )


        token = extract_bearer_token(
            authorization
        )


        async with httpx.AsyncClient(
            timeout=20.0
        ) as client:

            # -------------------------------------------------------------------------------------
            # Verified authenticated identity
            # -------------------------------------------------------------------------------------

            user_id = await verify_user(

                client,
                token,
            )


            # -------------------------------------------------------------------------------------
            # User-owned InBody data
            # -------------------------------------------------------------------------------------

            rows = await fetch_inbody_records(

                client,
                token,
                user_id,
            )


# -------------------------------------------------------------------------
# Prediction date D uses body measurements
# only through D-1 as well.
# -------------------------------------------------------------------------

            eligible_rows = []


            for row in rows:

                measured_at = parse_datetime(
                    row.get(
                        "measured_at"
                    )
                )


                if measured_at is None:

                    continue


                if (
                    measured_at.date()
                    <=
                    behavior_cutoff_date
                ):

                    eligible_rows.append(
                        row
                    )


            rows = eligible_rows


            if not rows:

                raise HTTPException(
                    status_code=409,
                    detail=(
                        "No InBody record is available "
                        "on or before the prediction cutoff date."
                    ),
                )


            current_row = (
                rows[0]
            )


            current_body = (
                record_to_model_body(
                    current_row
                )
            )


            current_measured_at = (
                parse_datetime(
                    current_row[
                        "measured_at"
                    ]
                )
            )


            if current_measured_at is None:

                raise ValueError(
                    "Latest InBody measured_at is invalid."
                )


            anchor_date = (
                current_measured_at
                .date()
            )


            prior_measurements = [

                record_to_model_body(
                    row
                )

                for row
                in rows[1:]
            ]


            # -------------------------------------------------------------------------------------
            # v2-ready data acquisition
            #
            # Need both:
            # 1. behavior since latest InBody
            # 2. recent 7 / 14 / 30 day windows
            #
            # Therefore start at whichever is earlier:
            # latest InBody date OR 30-day window start.
            # -------------------------------------------------------------------------------------

            recent_30d_start = (
                behavior_cutoff_date
                -
                timedelta(
                    days=29
                )
            )


            behavior_start_date = min(

                anchor_date,
                recent_30d_start,
            )


            (
                profile,
                prediction_profile,
                meal_rows,
                workout_rows,
            ) = await asyncio.gather(

                fetch_profile(
                    client,
                    token,
                    user_id,
                ),

                fetch_prediction_profile(
                    client,
                    token,
                    user_id,
                ),

                fetch_meal_logs(

                    client,
                    token,
                    user_id,

                    behavior_start_date,
                    behavior_cutoff_date,
                ),

                fetch_workout_logs(

                    client,
                    token,
                    user_id,

                    behavior_start_date,
                    behavior_cutoff_date,
                ),
            )


            behavior_context = (
                build_behavior_context(

                    meal_rows,
                    workout_rows,

                    prediction_date,
                    behavior_cutoff_date,
                    anchor_date,
                )
            )


            # -------------------------------------------------------------------------------------
            # Frozen v7.3 model runtime
            #
            # IMPORTANT:
            # Behavior data is NOT passed into the model yet.
            #
            # This preserves production behavior while
            # validating the v2 data pipeline.
            # -------------------------------------------------------------------------------------

            result = predict_internal(

                current_body,

                prior_measurements,

                include_debug=False,
            )


            # -------------------------------------------------------------------------------------
            # Add DB / v2 context
            # -------------------------------------------------------------------------------------

            result[
                "source"
            ] = {

                "inbody_record_id":
                    current_row[
                        "id"
                    ],

                "inbody_records_used":
                    len(
                        rows
                    ),

                "authenticated_user":
                    True,

                "profile_available":
                    profile is not None,

                "prediction_profile_available":
                    prediction_profile is not None,

                "meal_logs_fetched":
                    len(
                        meal_rows
                    ),

                "workout_logs_fetched":
                    len(
                        workout_rows
                    ),

                "behavior_cutoff_date":
                    behavior_cutoff_date.isoformat(),

                "behavior_used_by_model":
                    False,
            }


            # Compact profile availability/context.
            #
            # This is the authenticated user's own data,
            # but we still return only fields relevant
            # to prediction development.

            result[
                "profile_context"
            ] = {

                "profile":
                    (
                        None

                        if profile is None

                        else {

                            "height_cm":
                                profile.get(
                                    "height_cm"
                                ),

                            "sex":
                                profile.get(
                                    "sex"
                                ),

                            "birth_year":
                                profile.get(
                                    "birth_year"
                                ),
                        }
                    ),

                "prediction_profile":
                    prediction_profile,
            }


            result[
                "behavior_context"
            ] = (
                behavior_context
            )


            # -------------------------------------------------------------------------------------
            # Persist prediction
            #
            # Existing prediction_history schema is unchanged.
            # v2 context is not persisted yet.
            # -------------------------------------------------------------------------------------

            if body.save_prediction:

                saved = await save_prediction_history(

                    client,
                    token,
                    user_id,
                    current_row[
                        "id"
                    ],
                    result,
                )


                result[
                    "prediction_history_id"
                ] = saved[
                    "id"
                ]


            else:

                result[
                    "prediction_history_id"
                ] = None


            return result


    except HTTPException:

        raise


    except ValueError as exc:

        raise HTTPException(
            status_code=422,
            detail=str(
                exc
            ),
        )


    except RuntimeError as exc:

        raise HTTPException(
            status_code=500,
            detail=str(
                exc
            ),
        )


    except Exception:

        raise HTTPException(
            status_code=500,
            detail="Prediction failed.",
        )
