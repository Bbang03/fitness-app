from __future__ import annotations

import time

import numpy as np
import torch
from ccpfn import CEPOEstimator


def treatment_response(
    x: np.ndarray,
    t: np.ndarray,
) -> np.ndarray:
    """
    Synthetic causal response used only to verify that CCPFN
    installs, loads its weights, fits context data, and returns
    counterfactual predictions.

    This is NOT the FitTrack production model.
    """
    return (
        0.35 * x[..., 0]
        - 0.20 * x[..., 1]
        + 0.45 * x[..., 2] * t
        - 0.12 * np.square(t)
    )


def treatment_assignment(
    x: np.ndarray,
) -> np.ndarray:
    """
    Synthetic confounded treatment assignment.
    """
    return (
        0.8
        + 0.25 * x[..., 0]
        - 0.15 * x[..., 2]
    )


def main() -> None:
    rng = np.random.default_rng(
        seed=42,
    )

    device = torch.device(
        "cuda:0"
        if torch.cuda.is_available()
        else "cpu"
    )

    print("=" * 60)
    print("FitTrack CCPFN smoke test")
    print("=" * 60)
    print(
        "PyTorch:",
        torch.__version__,
    )
    print(
        "Device:",
        device,
    )

    n_context = 768
    n_query = 32
    n_features = 3

    x_context = rng.standard_normal(
        (
            n_context,
            n_features,
        )
    ).astype(
        np.float32
    )

    t_context = treatment_assignment(
        x_context
    ).astype(
        np.float32
    )

    y_context = (
        treatment_response(
            x_context,
            t_context,
        )
        + 0.05
        * rng.standard_normal(
            n_context
        )
    ).astype(
        np.float32
    )

    x_query = rng.standard_normal(
        (
            n_query,
            n_features,
        )
    ).astype(
        np.float32
    )

    # Same people/covariates, two different interventions.
    t_low = np.full(
        n_query,
        0.5,
        dtype=np.float32,
    )

    t_high = np.full(
        n_query,
        1.5,
        dtype=np.float32,
    )

    print()
    print(
        "Creating CEPOEstimator..."
    )

    start = time.perf_counter()

    estimator = CEPOEstimator(
        device=device,
    )

    print(
        "Fitting observational context..."
    )

    estimator.fit(
        x_context,
        t_context,
        y_context,
    )

    print(
        "Estimating counterfactual outcomes..."
    )

    y_low = estimator.estimate_cepo(
        x_query,
        t_low,
    )

    y_high = estimator.estimate_cepo(
        x_query,
        t_high,
    )

    elapsed = (
        time.perf_counter()
        - start
    )

    y_low = np.asarray(
        y_low
    ).reshape(
        -1
    )

    y_high = np.asarray(
        y_high
    ).reshape(
        -1
    )

    true_low = treatment_response(
        x_query,
        t_low,
    )

    true_high = treatment_response(
        x_query,
        t_high,
    )

    rmse_low = float(
        np.sqrt(
            np.mean(
                np.square(
                    y_low
                    - true_low
                )
            )
        )
    )

    rmse_high = float(
        np.sqrt(
            np.mean(
                np.square(
                    y_high
                    - true_high
                )
            )
        )
    )

    predicted_effect = float(
        np.mean(
            y_high
            - y_low
        )
    )

    true_effect = float(
        np.mean(
            true_high
            - true_low
        )
    )

    print()
    print("=" * 60)
    print("RESULT")
    print("=" * 60)
    print(
        "Pred shape:",
        y_low.shape,
    )
    print(
        f"RMSE @ t=0.5: {rmse_low:.4f}"
    )
    print(
        f"RMSE @ t=1.5: {rmse_high:.4f}"
    )
    print(
        "Mean predicted treatment effect "
        f"(1.5 vs 0.5): {predicted_effect:.4f}"
    )
    print(
        "Mean true treatment effect "
        f"(1.5 vs 0.5): {true_effect:.4f}"
    )
    print(
        f"Elapsed: {elapsed:.2f}s"
    )
    print()
    print(
        "SMOKE TEST COMPLETE"
    )
    print(
        "This confirms the CCPFN inference pipeline works locally."
    )


if __name__ == "__main__":
    main()
