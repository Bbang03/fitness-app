from datetime import (
    date,
    datetime,
    timedelta,
)
from typing import Optional

import asyncio
import os

import httpx

from fastapi import (
    FastAPI,
    Header,
    HTTPException,
)

from pydantic import BaseModel

from api.behavior_runtime import (
    APP_TIMEZONE,
    PERSONAL_HISTORY_LOOKBACK_DAYS,
    build_behavior_context,
    build_behavior_features,
    parse_datetime,
)
from api.model_runtime import (
    MANIFEST,
    MODELS,
    SELECTED_CONFIG,
    predict_internal,
)
from api.behavior_correction_runtime import (
    apply_behavior_correction,
    health_status as behavior_correction_health_status,
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

SUPABASE_SECRET_KEY = (
    os.environ
    .get(
        "SUPABASE_SECRET_KEY",
        "",
    )
)

CRON_SECRET = (
    os.environ
    .get(
        "CRON_SECRET",
        "",
    )
)


def require_supabase_config():

    if not SUPABASE_URL:
        raise RuntimeError(
            "SUPABASE_URL is not configured."
        )

    if not SUPABASE_PUBLISHABLE_KEY:
        raise RuntimeError(
            "SUPABASE_PUBLISHABLE_KEY is not configured."
        )


def require_cron_config():

    require_supabase_config()

    if not SUPABASE_SECRET_KEY:
        raise RuntimeError(
            "SUPABASE_SECRET_KEY is not configured."
        )

    if not CRON_SECRET:
        raise RuntimeError(
            "CRON_SECRET is not configured."
        )


# =================================================================================================
# REQUEST
# =================================================================================================

class PredictMeRequest(
    BaseModel
):

    save_prediction: bool = True

    # Optional explicit date for reproducible
    # historical inference / audit.
    prediction_date: Optional[
        date
    ] = None


SERVICE_ROLLOVER_HOUR = 3


def resolve_prediction_date(
    requested_date,
):

    if requested_date is not None:
        return requested_date

    now = datetime.now(
        APP_TIMEZONE
    )

    service_date = now.date()

    # Service day rolls over at 03:00 KST.
    # Between 00:00 and 02:59, keep serving the
    # previous prediction date so D-1 behavior
    # is not refreshed until the scheduled update.
    if now.hour < SERVICE_ROLLOVER_HOUR:
        service_date = (
            service_date
            -
            timedelta(
                days=1
            )
        )

    return service_date


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

    # New Supabase secret keys (sb_secret_...) are API keys,
    # not JWTs. For server/admin requests they must be sent
    # in the apikey header and MUST NOT be sent as
    # Authorization: Bearer <secret>.
    if (
        SUPABASE_SECRET_KEY
        and
        token == SUPABASE_SECRET_KEY
    ):
        return {
            "apikey":
                SUPABASE_SECRET_KEY,

            "Content-Type":
                "application/json",
        }

    # Authenticated end-user requests keep using the
    # publishable API key + the user's JWT bearer token.
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


def verify_cron_request(
    authorization,
):

    if not CRON_SECRET:
        raise HTTPException(
            status_code=500,
            detail="CRON_SECRET is not configured.",
        )

    expected = (
        f"Bearer {CRON_SECRET}"
    )

    if authorization != expected:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized cron request.",
        )


# =================================================================================================
# SUPABASE REST
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

        offset += page_size

        if offset >= 10000:
            raise RuntimeError(
                f"Unexpectedly large {table} history."
            )

    return all_rows


async def fetch_all_profile_ids(
    client,
    token,
):

    headers = (
        supabase_headers(
            token
        )
    )

    page_size = 1000
    offset = 0
    user_ids = []

    while True:

        params = [
            (
                "select",
                "id",
            ),
            (
                "order",
                "id.asc",
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

        response = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=headers,
            params=params,
        )

        if response.status_code != 200:
            raise RuntimeError(
                "Could not retrieve profile ids for cron refresh."
            )

        rows = response.json()

        for row in rows:
            user_id = row.get(
                "id"
            )

            if user_id:
                user_ids.append(
                    user_id
                )

        if len(
            rows
        ) < page_size:
            break

        offset += page_size

        if offset >= 100000:
            raise RuntimeError(
                "Unexpectedly large profile set."
            )

    return user_ids


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
                "Could not retrieve InBody history."
            )

        rows = response.json()

        all_rows.extend(
            rows
        )

        if len(
            rows
        ) < page_size:
            break

        offset += page_size

        if offset >= 10000:
            raise RuntimeError(
                "Unexpectedly large InBody history."
            )

    return all_rows


# =================================================================================================
# MEALS / WORKOUTS
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

        extra_filters=[
            (
                "finished_at",
                "not.is.null",
            ),
        ],
    )


# =================================================================================================
# MODEL INPUT
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
        for key in required
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

async def fetch_prediction_history_for_date(
    client,
    token,
    user_id,
    prediction_date,
):

    params = [
        (
            "select",
            "id,prediction_date,created_at",
        ),
        (
            "user_id",
            f"eq.{user_id}",
        ),
        (
            "prediction_date",
            f"eq.{prediction_date.isoformat()}",
        ),
        (
            "order",
            "created_at.desc",
        ),
        (
            "limit",
            "1",
        ),
    ]

    response = await client.get(
        f"{SUPABASE_URL}/rest/v1/prediction_history",
        headers=(
            supabase_headers(
                token
            )
        ),
        params=params,
    )

    if response.status_code != 200:
        raise RuntimeError(
            "Could not check prediction history for prediction date."
        )

    rows = response.json()

    if not rows:
        return None

    return rows[0]


async def save_prediction_history(
    client,
    token,
    user_id,
    source_inbody_id,
    prediction_date,
    result,
):

    existing = await fetch_prediction_history_for_date(
        client,
        token,
        user_id,
        prediction_date,
    )

    if existing is not None:
        return existing

    current = result[
        "current"
    ]

    prediction = result[
        "prediction"
    ]

    change = result[
        "change"
    ]

    payload = {
        "user_id":
            user_id,

        "source_inbody_id":
            source_inbody_id,

        "prediction_date":
            prediction_date.isoformat(),

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
            {
                **result[
                    "quality"
                ],
                "behavior_correction":
                    result.get(
                        "behavior_correction"
                    ),
                "prediction_date":
                    prediction_date.isoformat(),
            },
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

    if response.status_code in (
        409,
    ):
        existing = await fetch_prediction_history_for_date(
            client,
            token,
            user_id,
            prediction_date,
        )

        if existing is not None:
            return existing

    if response.status_code not in (
        200,
        201,
    ):
        raise RuntimeError(
            "Prediction succeeded but history save failed."
        )

    rows = response.json()

    if not rows:
        raise RuntimeError(
            "Prediction history insert returned no row."
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
            "behavior-correction-v1-ready",

        "behavior_correction":
            behavior_correction_health_status(),

        "daily_refresh": {
            "rollover_hour_kst":
                SERVICE_ROLLOVER_HOUR,

            "secret_key_configured":
                bool(
                    SUPABASE_SECRET_KEY
                ),

            "cron_secret_configured":
                bool(
                    CRON_SECRET
                ),
        },
    }


async def run_prediction_for_user(
    *,
    client,
    token,
    user_id,
    prediction_date,
    save_prediction,
    authenticated_user,
):

    behavior_cutoff_date = (
        prediction_date
        -
        timedelta(
            days=1
        )
    )

    all_inbody_rows = await fetch_inbody_records(
        client,
        token,
        user_id,
    )

    eligible_rows = []

    for row in all_inbody_rows:

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

    current_row = rows[
        0
    ]

    current_body = record_to_model_body(
        current_row
    )

    current_measured_at = parse_datetime(
        current_row[
            "measured_at"
        ]
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
        for row in rows[
            1:
        ]
    ]

    personal_history_start = (
        behavior_cutoff_date
        -
        timedelta(
            days=
                PERSONAL_HISTORY_LOOKBACK_DAYS
                -
                1
        )
    )

    since_anchor_start = (
        anchor_date
        +
        timedelta(
            days=1
        )
    )

    behavior_start_date = min(
        personal_history_start,
        since_anchor_start,
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

    behavior_context = build_behavior_context(
        meal_rows=
            meal_rows,

        workout_rows=
            workout_rows,

        prediction_date=
            prediction_date,

        cutoff_date=
            behavior_cutoff_date,

        anchor_date=
            anchor_date,
    )

    behavior_features = build_behavior_features(
        meal_rows=
            meal_rows,

        workout_rows=
            workout_rows,

        behavior_context=
            behavior_context,

        cutoff_date=
            behavior_cutoff_date,

        current_weight_kg=
            current_body[
                "weight_kg"
            ],

        prediction_profile=
            prediction_profile,
    )

    result = predict_internal(
        current_body,
        prior_measurements,
        include_debug=False,
    )

    result = apply_behavior_correction(
        result=result,
        current_body=current_body,
        profile=profile,
        behavior_context=behavior_context,
        prediction_date=prediction_date,
    )

    correction_applied = bool(
        result[
            "behavior_correction"
        ][
            "applied"
        ]
    )

    behavior_context[
        "behavior_used_by_model"
    ] = correction_applied

    behavior_features[
        "used_by_model"
    ] = correction_applied

    behavior_features[
        "model_ready"
    ] = True

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
            authenticated_user,

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

        "prediction_date":
            prediction_date.isoformat(),

        "behavior_cutoff_date":
            behavior_cutoff_date.isoformat(),

        "behavior_used_by_model":
            correction_applied,

        "behavior_correction_version":
            result[
                "behavior_correction"
            ][
                "model_version"
            ],
    }

    result[
        "model"
    ][
        "behavior_correction_version"
    ] = result[
        "behavior_correction"
    ][
        "model_version"
    ]

    result[
        "model"
    ][
        "behavior_correction_applied"
    ] = correction_applied

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
    ] = behavior_context

    result[
        "behavior_features"
    ] = behavior_features

    if save_prediction:

        saved = await save_prediction_history(
            client,
            token,
            user_id,
            current_row[
                "id"
            ],
            prediction_date,
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

        token = extract_bearer_token(
            authorization
        )

        async with httpx.AsyncClient(
            timeout=20.0
        ) as client:

            user_id = await verify_user(
                client,
                token,
            )

            return await run_prediction_for_user(
                client=client,
                token=token,
                user_id=user_id,
                prediction_date=prediction_date,
                save_prediction=body.save_prediction,
                authenticated_user=True,
            )

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


@app.get(
    "/api/cron_refresh_predictions"
)
@app.get(
    "/api/cron/refresh-predictions"
)
async def refresh_predictions_cron(
    authorization:
        Optional[str]
        =
        Header(
            default=None
        ),
):

    try:

        require_cron_config()

        verify_cron_request(
            authorization
        )

        prediction_date = (
            resolve_prediction_date(
                None
            )
        )

        token = SUPABASE_SECRET_KEY

        async with httpx.AsyncClient(
            timeout=30.0
        ) as client:

            user_ids = await fetch_all_profile_ids(
                client,
                token,
            )

            semaphore = asyncio.Semaphore(
                3
            )

            async def refresh_one(
                user_id,
            ):

                async with semaphore:

                    existing = await fetch_prediction_history_for_date(
                        client,
                        token,
                        user_id,
                        prediction_date,
                    )

                    if existing is not None:
                        return {
                            "status": "already_current",
                        }

                    try:

                        result = await run_prediction_for_user(
                            client=client,
                            token=token,
                            user_id=user_id,
                            prediction_date=prediction_date,
                            save_prediction=True,
                            authenticated_user=False,
                        )

                        correction = (
                            result.get(
                                "behavior_correction"
                            )
                            or {}
                        )

                        return {
                            "status": "refreshed",
                            "behavior_correction_applied": bool(
                                correction.get(
                                    "applied",
                                    False,
                                )
                            ),
                            "behavior_gate_reason": (
                                correction.get(
                                    "gate",
                                    {}
                                ).get(
                                    "reason"
                                )
                            ),
                        }

                    except HTTPException as exc:

                        if exc.status_code == 409:
                            return {
                                "status": "skipped_no_eligible_inbody",
                            }

                        return {
                            "status": "failed",
                        }

                    except Exception as exc:

                        return {
                            "status": "failed",
                        }

            results = await asyncio.gather(
                *[
                    refresh_one(
                        user_id
                    )
                    for user_id in user_ids
                ]
            )

        counts = {}

        for item in results:
            status = item[
                "status"
            ]
            counts[status] = (
                counts.get(
                    status,
                    0,
                )
                +
                1
            )

        return {
            "status": "ok",
            "service_date": prediction_date.isoformat(),
            "timezone": str(
                APP_TIMEZONE
            ),
            "scheduled_refresh_hour_kst": SERVICE_ROLLOVER_HOUR,
            "users_seen": len(
                user_ids
            ),
            "counts": counts,
            "correction_applied_count": sum(
                1
                for item in results
                if item.get(
                    "behavior_correction_applied",
                    False,
                )
            ),
        }

    except HTTPException:
        raise

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
            detail="Prediction refresh failed.",
        )
