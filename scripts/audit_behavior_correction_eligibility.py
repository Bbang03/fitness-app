from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "models" / "behavior_correction_contract.json"
MANIFEST_PATH = ROOT / "models" / "behavior_correction_dataset_manifest.json"


def fail(message: str) -> None:
    raise AssertionError(message)


def main() -> None:
    with CONTRACT_PATH.open("r", encoding="utf-8") as f:
        contract = json.load(f)

    with MANIFEST_PATH.open("r", encoding="utf-8") as f:
        manifest = json.load(f)

    if manifest["generated_for_contract"] != contract["contract_version"]:
        fail(
            "dataset manifest contract mismatch: "
            f"{manifest['generated_for_contract']} != {contract['contract_version']}"
        )

    if manifest["eligibility_rules"]["synthetic_allowed"] is not False:
        fail("synthetic training must remain disabled")

    if manifest["eligibility_rules"]["dxa_lean_mass_is_not_smm"] is not True:
        fail("DXA lean mass must never be treated as SMM")

    if contract["training_modes"]["direct_v1_residual"]["enabled_now"] is not False:
        fail("direct v1 residual training must remain disabled")

    if contract["training_modes"]["within_study_incremental_delta"]["enabled_now"] is not True:
        fail("within-study incremental delta mode should be enabled for research")

    datasets = manifest["datasets"]
    ids = [row["dataset_id"] for row in datasets]

    if len(ids) != len(set(ids)):
        fail("duplicate dataset_id detected")

    bath = next(
        (row for row in datasets if row["dataset_id"] == "bath_keto_week4"),
        None,
    )

    if bath is None:
        fail("bath_keto_week4 audit row missing")

    expected_counts = {
        "participants_total_detected": 60,
        "baseline_weight_non_null": 56,
        "week4_weight_non_null": 53,
        "baseline_dxa_fat_mass_non_null": 55,
        "week4_dxa_fat_mass_non_null": 53,
        "week4_food_diary_protein_non_null": 51,
        "baseline_to_week4_delta_energy_intake_non_null": 53,
        "week4_physical_activity_total_kcal_non_null": 50,
    }

    for key, expected in expected_counts.items():
        actual = bath.get(key)
        if actual != expected:
            fail(f"bath_keto_week4.{key}: expected {expected}, got {actual}")

    if bath["horizon_days"] != 28:
        fail("bath_keto_week4 must remain an exact 28d candidate")

    if bath["direct_v1_residual_eligible"] is not False:
        fail("bath_keto_week4 must not be used for direct v1 residual training")

    if bath["incremental_delta_candidate"] is not True:
        fail("bath_keto_week4 should remain the primary incremental-delta candidate")

    if bath["actual_smm_available"] is not False:
        fail("bath_keto_week4 does not contain actual SMM")

    if contract["target_policy"]["skeletal_muscle_kg"]["adjustment_allowed_for_research"] is not False:
        fail("SMM adjustment must remain disabled")

    if contract["production_usage"]["used_by_model"] is not False:
        fail("behavior correction must not be used by production")

    if contract["production_usage"]["model_ready"] is not False:
        fail("behavior correction must not be model_ready")

    current_candidates = [
        row["dataset_id"]
        for row in datasets
        if row.get("incremental_delta_candidate") is True
    ]

    request_candidates = [
        row["dataset_id"]
        for row in datasets
        if row.get("incremental_delta_candidate") == "potential_if_raw_obtained"
    ]

    print("Behavior correction eligibility audit PASSED")
    print(f"contract_version: {contract['contract_version']}")
    print(f"datasets_audited: {len(datasets)}")
    print(f"current_incremental_delta_candidates: {current_candidates}")
    print(f"future_request_candidates: {request_candidates}")
    print("bath_keto_week4:")
    print("  horizon_days: 28")
    print("  participants_detected: 60")
    print("  week4_weight_non_null: 53")
    print("  week4_dxa_fat_mass_non_null: 53")
    print("  week4_food_diary_protein_non_null: 51")
    print("  week4_physical_activity_total_kcal_non_null: 50")
    print("  direct_v1_residual_eligible: False")
    print("  training_mode: within_study_incremental_delta")
    print("Safety gates PASSED")


if __name__ == "__main__":
    main()
