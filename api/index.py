from typing import Optional
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
        ""
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


    # Usually this returns only a few rows.
    # Pagination keeps exact history_n_prior semantics
    # even if a long-term user eventually exceeds 1000 records.

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


        # Defensive bound.
        if offset >= 10000:

            raise RuntimeError(
                "Unexpectedly large InBody history."
            )


    return all_rows


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


        token = extract_bearer_token(
            authorization
        )


        async with httpx.AsyncClient(
            timeout=15.0
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


            if not rows:

                raise HTTPException(
                    status_code=409,
                    detail=(
                        "No InBody record available. "
                        "Add an InBody measurement first."
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


            prior_measurements = [

                record_to_model_body(
                    row
                )

                for row
                in rows[1:]
            ]


            # -------------------------------------------------------------------------------------
            # Frozen v7.3 model runtime
            # -------------------------------------------------------------------------------------

            result = predict_internal(

                current_body,

                prior_measurements,

                include_debug=False,
            )


            # -------------------------------------------------------------------------------------
            # Add DB context
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
            }


            # -------------------------------------------------------------------------------------
            # Persist prediction
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
