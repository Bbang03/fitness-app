from pathlib import Path
from typing import List, Optional, Any
import json

import numpy as np
import pandas as pd

from catboost import CatBoostRegressor

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


# =================================================================================================
# PATHS
# =================================================================================================

BASE_DIR = (
    Path(__file__)
    .resolve()
    .parents[1]
)

MODEL_DIR = (
    BASE_DIR
    / "models"
)

MANIFEST_PATH = (
    MODEL_DIR
    / "manifest.json"
)

FEATURE_CONTRACT_PATH = (
    MODEL_DIR
    / "feature_contract.json"
)


# =================================================================================================
# LOAD CONTRACT
# =================================================================================================

with open(
    MANIFEST_PATH,
    "r",
    encoding="utf-8",
) as f:

    MANIFEST = json.load(f)


with open(
    FEATURE_CONTRACT_PATH,
    "r",
    encoding="utf-8",
) as f:

    FEATURE_CONTRACT = json.load(f)


FEATURE_SETS = (
    FEATURE_CONTRACT[
        "feature_sets"
    ]
)

SELECTED_CONFIG = (
    MANIFEST[
        "selected_config"
    ]
)

MODEL_FILES = (
    MANIFEST[
        "model_files"
    ]
)


# =================================================================================================
# LOAD MODELS ONCE
# =================================================================================================
#
# Important:
# models are loaded at module initialization, NOT once per request.
# =================================================================================================

MODELS = {}

for target in [
    "weight_kg",
    "fat_mass_kg",
    "smm_actual_kg",
]:

    filename = MODEL_FILES[
        target
    ]

    if filename is None:

        MODELS[target] = None
        continue

    path = (
        MODEL_DIR
        / filename
    )

    if not path.exists():

        raise RuntimeError(
            f"Missing model artifact: {path}"
        )

    model = CatBoostRegressor()

    model.load_model(
        str(path)
    )

    MODELS[target] = model


# =================================================================================================
# EXACT FEATURE CONTRACT
# =================================================================================================

CORE4 = [
    "weight0_kg",
    "fat0_kg",
    "smm0_kg",
    "bf0_pct",
]


MINIMAL_HISTORY_ONLY = [
    "has_prev",
    "days_since_prev",

    "slope30_from_prev_weight",
    "slope30_from_prev_fat",
    "slope30_from_prev_smm",
    "slope30_from_prev_bf",
]


ROLLING_EXTRA = [
    "has_prev2",
    "days_between_prev1_prev2",

    "history_n_prior",

    "history_count_30d",
    "history_count_90d",
    "history_count_180d",

    "slope30_prevtrend_weight",
    "slope30_prevtrend_fat",
    "slope30_prevtrend_smm",
    "slope30_prevtrend_bf",

    "ols30_90d_weight",
    "ols30_90d_fat",
    "ols30_90d_smm",
    "ols30_90d_bf",

    "ols30_180d_weight",
    "ols30_180d_fat",
    "ols30_180d_smm",
    "ols30_180d_bf",
]


EXPECTED_ROLLING = (
    CORE4
    +
    MINIMAL_HISTORY_ONLY
    +
    ROLLING_EXTRA
)


if (
    FEATURE_SETS[
        "rolling"
    ]
    !=
    EXPECTED_ROLLING
):

    raise RuntimeError(
        "Feature contract mismatch."
    )


# =================================================================================================
# TARGET CONTRACT
# =================================================================================================

BASELINE_COL = {

    "weight_kg":
        "weight0_kg",

    "fat_mass_kg":
        "fat0_kg",

    "smm_actual_kg":
        "smm0_kg",
}


# =================================================================================================
# API SCHEMA
# =================================================================================================

class BodyMeasurement(BaseModel):

    measured_at: str

    weight_kg: float = Field(
        gt=0
    )

    fat_mass_kg: float = Field(
        ge=0
    )

    skeletal_muscle_kg: float = Field(
        gt=0
    )

    body_fat_pct: float = Field(
        ge=0,
        lt=100,
    )


class PredictRequest(BaseModel):

    current_body: BodyMeasurement

    prior_measurements: List[
        BodyMeasurement
    ] = Field(
        default_factory=list
    )

    include_debug: bool = False


# =================================================================================================
# FEATURE HELPERS
# =================================================================================================

def parse_time(
    value,
    field_name,
):

    ts = pd.to_datetime(
        value,
        errors="coerce",
        utc=True,
    )

    if pd.isna(ts):

        raise ValueError(
            f"Invalid datetime: {field_name}"
        )

    return ts


def safe_30d_slope(
    newer,
    older,
    days,
):

    if (
        not np.isfinite(newer)
        or
        not np.isfinite(older)
        or
        not np.isfinite(days)
        or
        days <= 0
    ):

        return np.nan

    return (
        (newer - older)
        /
        days
        *
        30.0
    )


def ols_30d_slope(
    times,
    values,
    t0,
):

    if len(values) < 2:

        return np.nan


    x = np.asarray(
        [
            (
                timestamp
                -
                t0
            ).total_seconds()
            /
            86400.0

            for timestamp
            in times
        ],
        dtype=float,
    )


    y = np.asarray(
        values,
        dtype=float,
    )


    good = (
        np.isfinite(x)
        &
        np.isfinite(y)
    )

    x = x[
        good
    ]

    y = y[
        good
    ]


    if (
        len(y) < 2
        or
        len(
            np.unique(x)
        ) < 2
    ):

        return np.nan


    slope = np.polyfit(
        x,
        y,
        deg=1,
    )[0]


    return float(
        slope
        *
        30.0
    )


# =================================================================================================
# HISTORY NORMALIZATION
# =================================================================================================

def normalize_history(
    measurements,
):

    rows = []

    invalid_count = 0


    for item in measurements:

        try:

            if hasattr(
                item,
                "model_dump"
            ):

                item = (
                    item.model_dump()
                )


            t = pd.to_datetime(
                item[
                    "measured_at"
                ],
                errors="coerce",
                utc=True,
            )


            values = np.array(
                [
                    float(
                        item[
                            "weight_kg"
                        ]
                    ),

                    float(
                        item[
                            "fat_mass_kg"
                        ]
                    ),

                    float(
                        item[
                            "skeletal_muscle_kg"
                        ]
                    ),

                    float(
                        item[
                            "body_fat_pct"
                        ]
                    ),
                ],
                dtype=float,
            )


            if (
                pd.isna(t)
                or
                not np.isfinite(
                    values
                ).all()
            ):

                invalid_count += 1
                continue


            rows.append({

                "_measurement_time":
                    t,

                "_weight":
                    values[0],

                "_fat":
                    values[1],

                "_smm":
                    values[2],

                "_bf":
                    values[3],
            })


        except Exception:

            invalid_count += 1


    if not rows:

        return (
            pd.DataFrame(
                columns=[
                    "_measurement_time",
                    "_weight",
                    "_fat",
                    "_smm",
                    "_bf",
                ]
            ),
            invalid_count,
        )


    history = pd.DataFrame(
        rows
    )


    # Exact v6.2 duplicate policy:
    # same timestamp -> median collapse.

    history = (

        history

        .groupby(
            "_measurement_time",
            as_index=False,
        )

        .agg(
            _weight=(
                "_weight",
                "median",
            ),

            _fat=(
                "_fat",
                "median",
            ),

            _smm=(
                "_smm",
                "median",
            ),

            _bf=(
                "_bf",
                "median",
            ),
        )

        .sort_values(
            "_measurement_time"
        )

        .reset_index(
            drop=True
        )
    )


    return (
        history,
        invalid_count,
    )


# =================================================================================================
# RUNTIME FEATURES
# =================================================================================================

VARIABLES = {

    "weight":
        (
            "_weight",
            "weight0_kg",
        ),

    "fat":
        (
            "_fat",
            "fat0_kg",
        ),

    "smm":
        (
            "_smm",
            "smm0_kg",
        ),

    "bf":
        (
            "_bf",
            "bf0_pct",
        ),
}


def build_features(
    current_body,
    prior_measurements,
):

    if hasattr(
        current_body,
        "model_dump"
    ):

        current_body = (
            current_body.model_dump()
        )


    t0 = parse_time(
        current_body[
            "measured_at"
        ],
        "current_body.measured_at",
    )


    current = {

        "weight0_kg":
            float(
                current_body[
                    "weight_kg"
                ]
            ),

        "fat0_kg":
            float(
                current_body[
                    "fat_mass_kg"
                ]
            ),

        "smm0_kg":
            float(
                current_body[
                    "skeletal_muscle_kg"
                ]
            ),

        "bf0_pct":
            float(
                current_body[
                    "body_fat_pct"
                ]
            ),
    }


    # Structural validation.

    if (
        current[
            "fat0_kg"
        ]
        >=
        current[
            "weight0_kg"
        ]
    ):

        raise ValueError(
            "fat_mass_kg must be smaller "
            "than weight_kg."
        )


    history_all, invalid_rows = (
        normalize_history(
            prior_measurements
        )
    )


    total_normalized = len(
        history_all
    )


    # CRITICAL LEAKAGE CONTRACT:
    # strictly prior timestamp only.

    history = history_all[

        history_all[
            "_measurement_time"
        ]
        <
        t0

    ].copy()


    non_past_ignored = (
        total_normalized
        -
        len(history)
    )


    history = (
        history
        .sort_values(
            "_measurement_time"
        )
        .reset_index(
            drop=True
        )
    )


    features = {

        **current,

        "history_n_prior":
            0,

        "has_prev":
            0,

        "has_prev2":
            0,

        "days_since_prev":
            np.nan,

        "days_between_prev1_prev2":
            np.nan,

        "history_count_30d":
            0,

        "history_count_90d":
            0,

        "history_count_180d":
            0,
    }


    for variable in VARIABLES:

        features[
            f"slope30_from_prev_{variable}"
        ] = np.nan

        features[
            f"slope30_prevtrend_{variable}"
        ] = np.nan

        features[
            f"ols30_90d_{variable}"
        ] = np.nan

        features[
            f"ols30_180d_{variable}"
        ] = np.nan


    max_prior_time = None


    if len(history) > 0:

        features[
            "history_n_prior"
        ] = int(
            len(history)
        )

        features[
            "has_prev"
        ] = 1


        max_prior_time = (
            history[
                "_measurement_time"
            ].max()
        )


        days_ago = (

            t0

            -
            history[
                "_measurement_time"
            ]

        ).dt.total_seconds() / 86400.0


        features[
            "history_count_30d"
        ] = int(
            (
                days_ago <= 30
            ).sum()
        )

        features[
            "history_count_90d"
        ] = int(
            (
                days_ago <= 90
            ).sum()
        )

        features[
            "history_count_180d"
        ] = int(
            (
                days_ago <= 180
            ).sum()
        )


        prev1 = history.iloc[
            -1
        ]


        days_since_prev = (

            t0

            -
            prev1[
                "_measurement_time"
            ]

        ).total_seconds() / 86400.0


        features[
            "days_since_prev"
        ] = float(
            days_since_prev
        )


        for variable, (
            history_col,
            current_col,
        ) in VARIABLES.items():

            features[
                f"slope30_from_prev_{variable}"
            ] = safe_30d_slope(

                float(
                    current[
                        current_col
                    ]
                ),

                float(
                    prev1[
                        history_col
                    ]
                ),

                days_since_prev,
            )


        if len(history) >= 2:

            features[
                "has_prev2"
            ] = 1


            prev2 = history.iloc[
                -2
            ]


            prev_gap = (

                prev1[
                    "_measurement_time"
                ]

                -
                prev2[
                    "_measurement_time"
                ]

            ).total_seconds() / 86400.0


            features[
                "days_between_prev1_prev2"
            ] = float(
                prev_gap
            )


            for variable, (
                history_col,
                _
            ) in VARIABLES.items():

                features[
                    f"slope30_prevtrend_{variable}"
                ] = safe_30d_slope(

                    float(
                        prev1[
                            history_col
                        ]
                    ),

                    float(
                        prev2[
                            history_col
                        ]
                    ),

                    prev_gap,
                )


        # 90d / 180d OLS trends.
        # Current t0 point is included.

        for window in [
            90,
            180,
        ]:

            window_history = history[

                (
                    (
                        t0

                        -
                        history[
                            "_measurement_time"
                        ]
                    )

                    .dt
                    .total_seconds()

                    /
                    86400.0
                )

                <=
                window

            ].copy()


            for variable, (
                history_col,
                current_col,
            ) in VARIABLES.items():

                timestamps = (

                    window_history[
                        "_measurement_time"
                    ].tolist()

                    +
                    [
                        t0
                    ]
                )


                values = (

                    window_history[
                        history_col
                    ]
                    .astype(float)
                    .tolist()

                    +
                    [
                        float(
                            current[
                                current_col
                            ]
                        )
                    ]
                )


                features[
                    f"ols30_{window}d_{variable}"
                ] = ols_30d_slope(

                    timestamps,
                    values,
                    t0,
                )


    X = pd.DataFrame(
        [
            features
        ]
    )


    missing = [

        c
        for c
        in EXPECTED_ROLLING

        if c not in X.columns
    ]


    if missing:

        raise RuntimeError(
            f"Missing features: {missing}"
        )


    X = X[
        EXPECTED_ROLLING
    ]


    if features[
        "has_prev"
    ] == 0:

        history_quality = (
            "NO_PREVIOUS_MEASUREMENT"
        )

    elif features[
        "days_since_prev"
    ] <= 30:

        history_quality = (
            "RECENT_LE_30D"
        )

    elif features[
        "days_since_prev"
    ] <= 90:

        history_quality = (
            "RECENT_LE_90D"
        )

    elif features[
        "days_since_prev"
    ] <= 180:

        history_quality = (
            "RECENT_LE_180D"
        )

    else:

        history_quality = (
            "STALE_GT_180D"
        )


    metadata = {

        "history_quality":
            history_quality,

        "history_n_prior":
            int(
                features[
                    "history_n_prior"
                ]
            ),

        "has_prev":
            bool(
                features[
                    "has_prev"
                ]
            ),

        "has_prev2":
            bool(
                features[
                    "has_prev2"
                ]
            ),

        "days_since_prev":
            (
                None

                if not np.isfinite(
                    features[
                        "days_since_prev"
                    ]
                )

                else

                float(
                    features[
                        "days_since_prev"
                    ]
                )
            ),

        "history_count_30d":
            int(
                features[
                    "history_count_30d"
                ]
            ),

        "history_count_90d":
            int(
                features[
                    "history_count_90d"
                ]
            ),

        "history_count_180d":
            int(
                features[
                    "history_count_180d"
                ]
            ),

        "invalid_history_rows_ignored":
            int(
                invalid_rows
            ),

        "non_past_rows_ignored":
            int(
                non_past_ignored
            ),

        "max_prior_time":
            (
                None

                if max_prior_time is None

                else

                max_prior_time.isoformat()
            ),
    }


    return (
        X,
        metadata,
        current,
        t0,
    )


# =================================================================================================
# PREDICT
# =================================================================================================

def predict_internal(
    current_body,
    prior_measurements,
    include_debug=False,
):

    X_rolling, history_meta, current, t0 = (
        build_features(
            current_body,
            prior_measurements,
        )
    )


    baseline = {

        "weight_kg":
            current[
                "weight0_kg"
            ],

        "fat_mass_kg":
            current[
                "fat0_kg"
            ],

        "smm_actual_kg":
            current[
                "smm0_kg"
            ],
    }


    prediction = {}

    debug = {}


    for target in [
        "weight_kg",
        "fat_mass_kg",
        "smm_actual_kg",
    ]:

        cfg = (
            SELECTED_CONFIG[
                target
            ]
        )

        policy = str(
            cfg[
                "policy"
            ]
        )

        alpha = float(
            cfg[
                "alpha"
            ]
        )


        if policy == "persistence":

            raw_delta = 0.0

            final_value = (
                baseline[
                    target
                ]
            )


        else:

            feature_set = str(
                cfg[
                    "feature_set"
                ]
            )


            X = X_rolling[
                FEATURE_SETS[
                    feature_set
                ]
            ]


            raw_delta = float(

                MODELS[
                    target
                ].predict(
                    X
                )[0]
            )


            final_value = (

                baseline[
                    target
                ]

                +
                alpha
                *
                raw_delta
            )


        prediction[
            target
        ] = float(
            final_value
        )


        debug[
            target
        ] = {

            "raw_predicted_delta":
                float(
                    raw_delta
                ),

            "alpha":
                alpha,

            "applied_delta":
                float(
                    alpha
                    *
                    raw_delta
                ),

            "feature_set":
                str(
                    cfg[
                        "feature_set"
                    ]
                ),

            "training_policy":
                policy,
        }


    pred_weight = (
        prediction[
            "weight_kg"
        ]
    )

    pred_fat = (
        prediction[
            "fat_mass_kg"
        ]
    )

    pred_smm = (
        prediction[
            "smm_actual_kg"
        ]
    )


    if pred_weight <= 0:

        raise RuntimeError(
            "Non-positive predicted weight."
        )


    pred_bf = (

        100.0
        *
        pred_fat
        /
        pred_weight
    )


    violations = []


    if pred_fat < 0:

        violations.append(
            "fat_negative"
        )


    if pred_fat >= pred_weight:

        violations.append(
            "fat_ge_weight"
        )


    if pred_smm <= 0:

        violations.append(
            "smm_nonpositive"
        )


    if not (
        0
        <=
        pred_bf
        <
        100
    ):

        violations.append(
            "bf_outside_0_100"
        )


    if violations:

        raise RuntimeError(
            "Physical sanity violation: "
            +
            ", ".join(
                violations
            )
        )


    result = {

        "model": {

            "name":
                MANIFEST[
                    "model_name"
                ],

            "version":
                MANIFEST[
                    "model_version"
                ],

            "endpoint_window":
                MANIFEST[
                    "endpoint_window"
                ],
        },


        "current": {

            "measured_at":
                t0.isoformat(),

            "weight_kg":
                current[
                    "weight0_kg"
                ],

            "fat_mass_kg":
                current[
                    "fat0_kg"
                ],

            "skeletal_muscle_kg":
                current[
                    "smm0_kg"
                ],

            "body_fat_pct":
                float(
                    current_body[
                        "body_fat_pct"
                    ]
                    if isinstance(
                        current_body,
                        dict
                    )
                    else
                    current_body.body_fat_pct
                ),
        },


        "prediction": {

            "weight_kg":
                pred_weight,

            "fat_mass_kg":
                pred_fat,

            "skeletal_muscle_kg":
                pred_smm,

            "body_fat_pct":
                float(
                    pred_bf
                ),
        },


        "change": {

            "weight_kg":
                float(
                    pred_weight
                    -
                    current[
                        "weight0_kg"
                    ]
                ),

            "fat_mass_kg":
                float(
                    pred_fat
                    -
                    current[
                        "fat0_kg"
                    ]
                ),

            "skeletal_muscle_kg":
                float(
                    pred_smm
                    -
                    current[
                        "smm0_kg"
                    ]
                ),

            "body_fat_pct":
                float(
                    pred_bf

                    -
                    (
                        current_body[
                            "body_fat_pct"
                        ]

                        if isinstance(
                            current_body,
                            dict
                        )

                        else

                        current_body.body_fat_pct
                    )
                ),
        },


        "history":
            history_meta,


        "quality": {

            "physical_sanity":
                "PASS",

            "history_available":
                history_meta[
                    "has_prev"
                ],

            "validation_scope":
                (
                    "internal participant-safe "
                    "v6.2 validation"
                ),
        },
    }


    if include_debug:

        result[
            "debug"
        ] = {

            "targets":
                debug,

            "features": {

                k: (
                    None

                    if pd.isna(v)

                    else

                    float(v)
                )

                for k, v
                in X_rolling.iloc[
                    0
                ].items()
            },
        }


    return result
