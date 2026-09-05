from __future__ import annotations

import io
import math
import re
import threading
from collections import Counter
from dataclasses import dataclass
from statistics import median
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from paddleocr import PaddleOCR
from PIL import Image, ImageEnhance, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool


MAX_FILE_BYTES = 12 * 1024 * 1024
MIN_OCR_LONG_SIDE = 1800
MAX_OCR_LONG_SIDE = 3000

# 검사일시는 문서 상단의 날짜/시간 텍스트만 별도 OCR한다.
DATE_ROI = (0.515, 0.058, 0.665, 0.098)

app = FastAPI(
    title="FitTrack InBody OCR",
    version="0.6.0",
)

print("[FitTrack OCR] Loading PaddleOCR Korean model...")

ocr = PaddleOCR(
    lang="korean",
    ocr_version="PP-OCRv5",
    device="cpu",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
)

print("[FitTrack OCR] PaddleOCR ready.")

ocr_lock = threading.Lock()


@dataclass
class Token:
    text: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2

    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2

    @property
    def width(self) -> float:
        return max(1.0, self.x2 - self.x1)

    @property
    def height(self) -> float:
        return max(1.0, self.y2 - self.y1)


# InBody 370S 템플릿에서 "숫자 텍스트"만 있는 작은 영역.
# 그래프 막대/눈금 전체를 해석하지 않는다.
#
# (x1, y1, x2, y2)는 문서 전체 대비 0~1 정규화 좌표.
# 넉넉하게 잡되 그래프 눈금 숫자는 최대한 제외했다.
FIELD_ROIS: dict[str, dict[str, Any]] = {
    # 상단 체성분분석 표의 직접 측정값
    "body_water_kg": {
        "label": "체수분",
        "roi": (0.185, 0.145, 0.285, 0.185),
        "min": 10.0,
        "max": 150.0,
        "decimals": 1,
    },
    "protein_kg": {
        "label": "단백질",
        "roi": (0.185, 0.175, 0.285, 0.215),
        "min": 2.0,
        "max": 30.0,
        "decimals": 1,
    },
    "mineral_kg": {
        "label": "무기질",
        "roi": (0.185, 0.205, 0.285, 0.245),
        "min": 1.0,
        "max": 10.0,
        "decimals": 2,
    },
    "body_fat_kg": {
        "label": "체지방량",
        "roi": (0.185, 0.235, 0.285, 0.275),
        "min": 1.0,
        "max": 150.0,
        "decimals": 1,
    },

    # 체중은 상단 체성분분석 표의 우측 직접값을 사용.
    # 아래 근육-지방 그래프는 읽지 않는다.
    "weight_kg": {
        "label": "체중",
        "roi": (0.515, 0.175, 0.615, 0.225),
        "min": 30.0,
        "max": 250.0,
        "decimals": 1,
    },

    # 아래 2개는 결과지에 별도 숫자로 인쇄된 "현재값"만 crop한다.
    # 그래프 막대와 눈금은 ROI 밖으로 제외.
    "skeletal_muscle_kg": {
        "label": "골격근량",
        "roi": (0.305, 0.345, 0.405, 0.385),
        "min": 5.0,
        "max": 100.0,
        "decimals": 1,
    },
    "body_fat_pct": {
        "label": "체지방률",
        "roi": (0.305, 0.475, 0.405, 0.515),
        "min": 1.0,
        "max": 60.0,
        "decimals": 1,
    },

    # 우측 하단 연구항목의 숫자 텍스트만 crop
    "bmr_kcal": {
        "label": "기초대사량",
        "roi": (0.755, 0.650, 0.845, 0.676),
        "dedicated_first": True,
        "min": 500.0,
        "max": 4000.0,
        "decimals": 0,
    },
    "abdominal_fat_ratio": {
        "label": "복부지방률",
        "roi": (0.755, 0.674, 0.845, 0.697),
        "dedicated_first": True,
        "min": 0.5,
        "max": 1.5,
        "decimals": 2,
    },
    "visceral_fat_level": {
        "label": "내장지방레벨",
        "roi": (0.770, 0.691, 0.835, 0.708),
        "dedicated_first": True,
        "min": 1.0,
        "max": 30.0,
        "decimals": 0,
    },
}


def to_native(value: Any) -> Any:
    if isinstance(value, np.ndarray):
        return value.tolist()

    if isinstance(value, np.generic):
        return value.item()

    if isinstance(value, dict):
        return {
            str(key): to_native(item)
            for key, item in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [
            to_native(item)
            for item in value
        ]

    return value


def prepare_image(content: bytes) -> np.ndarray:
    image = Image.open(
        io.BytesIO(content)
    )

    image = ImageOps.exif_transpose(image)

    if image.mode in ("RGBA", "LA"):
        background = Image.new(
            "RGB",
            image.size,
            "white",
        )

        alpha = image.getchannel("A")

        background.paste(
            image.convert("RGB"),
            mask=alpha,
        )

        image = background
    else:
        image = image.convert("RGB")

    width, height = image.size
    long_side = max(width, height)

    if long_side < MIN_OCR_LONG_SIDE:
        scale = min(
            3.0,
            MIN_OCR_LONG_SIDE / max(1, long_side),
        )
    elif long_side > MAX_OCR_LONG_SIDE:
        scale = (
            MAX_OCR_LONG_SIDE / long_side
        )
    else:
        scale = 1.0

    if abs(scale - 1.0) > 0.01:
        image = image.resize(
            (
                max(
                    1,
                    int(round(width * scale)),
                ),
                max(
                    1,
                    int(round(height * scale)),
                ),
            ),
            Image.Resampling.LANCZOS,
        )

    return np.asarray(image)


def get_result_payload(
    result_item: Any,
) -> dict[str, Any]:
    payload = getattr(
        result_item,
        "json",
        None,
    )

    if callable(payload):
        payload = payload()

    if (
        payload is None
        and isinstance(result_item, dict)
    ):
        payload = result_item

    payload = to_native(payload)

    if not isinstance(payload, dict):
        raise RuntimeError(
            "PaddleOCR result did not expose a JSON dictionary."
        )

    inner = payload.get(
        "res",
        payload,
    )

    if not isinstance(inner, dict):
        raise RuntimeError(
            "Unexpected PaddleOCR result format."
        )

    return inner


def box_from_poly(
    poly: Any,
) -> tuple[
    float,
    float,
    float,
    float,
] | None:
    if (
        not isinstance(poly, list)
        or not poly
    ):
        return None

    points: list[
        tuple[float, float]
    ] = []

    for point in poly:
        if (
            isinstance(point, list)
            and len(point) >= 2
            and isinstance(
                point[0],
                (int, float),
            )
            and isinstance(
                point[1],
                (int, float),
            )
        ):
            points.append(
                (
                    float(point[0]),
                    float(point[1]),
                )
            )

    if not points:
        return None

    xs = [point[0] for point in points]
    ys = [point[1] for point in points]

    return (
        min(xs),
        min(ys),
        max(xs),
        max(ys),
    )


def extract_tokens(
    result_item: Any,
) -> list[Token]:
    payload = get_result_payload(
        result_item
    )

    texts = to_native(
        payload.get("rec_texts", [])
    )
    scores = to_native(
        payload.get("rec_scores", [])
    )
    boxes = to_native(
        payload.get("rec_boxes", [])
    )
    polys = to_native(
        payload.get("rec_polys", [])
    )

    if not isinstance(texts, list):
        return []

    tokens: list[Token] = []

    for index, raw_text in enumerate(texts):
        text = str(raw_text).strip()

        if not text:
            continue

        confidence = 0.5

        if (
            isinstance(scores, list)
            and index < len(scores)
        ):
            try:
                confidence = float(
                    scores[index]
                )
            except (
                TypeError,
                ValueError,
            ):
                confidence = 0.5

        box: tuple[
            float,
            float,
            float,
            float,
        ] | None = None

        if (
            isinstance(boxes, list)
            and index < len(boxes)
        ):
            raw_box = boxes[index]

            if (
                isinstance(raw_box, list)
                and len(raw_box) >= 4
                and all(
                    isinstance(
                        value,
                        (int, float),
                    )
                    for value
                    in raw_box[:4]
                )
            ):
                box = (
                    float(raw_box[0]),
                    float(raw_box[1]),
                    float(raw_box[2]),
                    float(raw_box[3]),
                )

        if (
            box is None
            and isinstance(polys, list)
            and index < len(polys)
        ):
            box = box_from_poly(
                polys[index]
            )

        if box is None:
            continue

        x1, y1, x2, y2 = box

        tokens.append(
            Token(
                text=text,
                confidence=max(
                    0.0,
                    min(
                        1.0,
                        confidence,
                    ),
                ),
                x1=x1,
                y1=y1,
                x2=x2,
                y2=y2,
            )
        )

    return tokens


def run_pipeline(
    image_array: np.ndarray,
) -> list[Token]:
    with ocr_lock:
        results = ocr.predict(
            image_array
        )

    if not results:
        return []

    return extract_tokens(
        results[0]
    )


def clean_number_text(text: str) -> str:
    return (
        text.strip()
        .replace(" ", "")
        .replace("O", "0")
        .replace("o", "0")
        .replace("I", "1")
        .replace("l", "1")
        .replace("S", "5")
    )


def raw_number_candidates(
    text: str,
) -> list[str]:
    cleaned = clean_number_text(text)

    # 1,605는 천 단위 쉼표
    cleaned = re.sub(
        r"(?<=\d),(?=\d{3}(?:\D|$))",
        "",
        cleaned,
    )

    return re.findall(
        r"\d+(?:[.,]\d+)?",
        cleaned,
    )


def parse_plain_number(
    raw: str,
) -> float | None:
    value_text = raw.replace(",", ".")

    try:
        value = float(value_text)
    except ValueError:
        return None

    if not math.isfinite(value):
        return None

    return value


def repaired_number(
    raw: str,
    minimum: float,
    maximum: float,
    decimals: int,
) -> tuple[
    float,
    bool,
] | None:
    """
    ROI 안에는 목표 숫자 하나만 있어야 한다.

    예:
      32.6 -> 32.6 그대로
      OCR가 326 -> 32.6 보정
      OCR가 379 -> 3.79 보정
      OCR가 081 -> 0.81 보정

    그래프 숫자에서 추론하는 것이 아니라,
    작은 ROI에서 읽은 하나의 숫자 문자열에 소수점이 빠졌을 때만 복구한다.
    """
    value = parse_plain_number(raw)

    if value is None:
        return None

    if minimum <= value <= maximum:
        return (
            value,
            False,
        )

    digits = re.sub(
        r"\D",
        "",
        raw,
    )

    if not digits:
        return None

    integer_value = float(digits)

    # 해당 필드가 기대하는 소수 자릿수를 먼저 시도.
    divisors: list[int] = []

    if decimals > 0:
        divisors.append(
            10 ** decimals
        )

    # 일부 OCR는 32.6 -> 326처럼 소수점 하나만 잃으므로
    # 1자리/2자리도 안전 범위 안에서 추가 시도.
    for divisor in (10, 100):
        if divisor not in divisors:
            divisors.append(divisor)

    for divisor in divisors:
        candidate = (
            integer_value / divisor
        )

        if (
            minimum
            <= candidate
            <= maximum
        ):
            return (
                candidate,
                True,
            )

    return None


def normalized_roi_to_pixels(
    roi: tuple[
        float,
        float,
        float,
        float,
    ],
    width: int,
    height: int,
) -> tuple[
    int,
    int,
    int,
    int,
]:
    x1, y1, x2, y2 = roi

    return (
        max(
            0,
            int(
                math.floor(
                    x1 * width
                )
            ),
        ),
        max(
            0,
            int(
                math.floor(
                    y1 * height
                )
            ),
        ),
        min(
            width,
            int(
                math.ceil(
                    x2 * width
                )
            ),
        ),
        min(
            height,
            int(
                math.ceil(
                    y2 * height
                )
            ),
        ),
    )


def tokens_inside_roi(
    tokens: list[Token],
    roi_pixels: tuple[
        int,
        int,
        int,
        int,
    ],
) -> list[Token]:
    x1, y1, x2, y2 = roi_pixels

    return [
        token
        for token in tokens
        if (
            x1 <= token.cx <= x2
            and y1 <= token.cy <= y2
        )
    ]


def preprocess_roi(
    image_array: np.ndarray,
    roi_pixels: tuple[
        int,
        int,
        int,
        int,
    ],
    *,
    scale_target: int = 500,
    contrast: float = 1.35,
    sharpen: float = 1.0,
    threshold: int | None = None,
) -> np.ndarray:
    x1, y1, x2, y2 = roi_pixels

    crop = Image.fromarray(
        image_array[
            y1:y2,
            x1:x2,
        ]
    ).convert("L")

    crop = ImageOps.autocontrast(
        crop,
        cutoff=1,
    )

    crop = ImageEnhance.Contrast(
        crop
    ).enhance(
        contrast
    )

    if sharpen != 1.0:
        crop = ImageEnhance.Sharpness(
            crop
        ).enhance(
            sharpen
        )

    if threshold is not None:
        crop = crop.point(
            lambda value:
                255
                if value >= threshold
                else 0
        )

    width, height = crop.size

    scale = max(
        3.0,
        min(
            8.0,
            scale_target / max(
                width,
                height,
                1,
            ),
        ),
    )

    crop = crop.resize(
        (
            max(
                1,
                int(
                    round(
                        width * scale
                    )
                ),
            ),
            max(
                1,
                int(
                    round(
                        height * scale
                    )
                ),
            ),
        ),
        Image.Resampling.LANCZOS,
    )

    return np.asarray(
        crop.convert("RGB")
    )


def roi_ocr_variants(
    image_array: np.ndarray,
    roi_pixels: tuple[
        int,
        int,
        int,
        int,
    ],
) -> list[
    tuple[
        str,
        list[Token],
    ]
]:
    """
    아주 작은 숫자 한 줄은 단일 전처리 결과에 의존하지 않는다.
    같은 픽셀을 여러 방식으로 확대/명암 처리한 뒤 OCR 결과를 합의시킨다.
    """
    configs = [
        (
            "normal",
            {
                "scale_target": 650,
                "contrast": 1.25,
                "sharpen": 1.0,
                "threshold": None,
            },
        ),
        (
            "sharp",
            {
                "scale_target": 700,
                "contrast": 1.45,
                "sharpen": 2.0,
                "threshold": None,
            },
        ),
        (
            "threshold175",
            {
                "scale_target": 700,
                "contrast": 1.25,
                "sharpen": 1.5,
                "threshold": 175,
            },
        ),
        (
            "threshold195",
            {
                "scale_target": 700,
                "contrast": 1.25,
                "sharpen": 1.5,
                "threshold": 195,
            },
        ),
        (
            "threshold215",
            {
                "scale_target": 700,
                "contrast": 1.20,
                "sharpen": 1.5,
                "threshold": 215,
            },
        ),
    ]

    results: list[
        tuple[
            str,
            list[Token],
        ]
    ] = []

    for (
        name,
        kwargs,
    ) in configs:
        roi_image = preprocess_roi(
            image_array,
            roi_pixels,
            **kwargs,
        )

        tokens = run_pipeline(
            roi_image
        )

        results.append(
            (
                name,
                tokens,
            )
        )

    return results

def choose_value_from_tokens(
    field_key: str,
    definition: dict[str, Any],
    tokens: list[Token],
    source: str,
) -> dict[str, Any] | None:
    candidates: list[
        dict[str, Any]
    ] = []

    for token in tokens:
        raws = raw_number_candidates(
            token.text
        )

        # ROI는 숫자 하나를 읽는 용도라
        # 숫자가 여러 개 포함된 토큰은 참고범위/잡음일 가능성이 높다.
        if len(raws) != 1:
            continue

        repaired = repaired_number(
            raws[0],
            float(
                definition["min"]
            ),
            float(
                definition["max"]
            ),
            int(
                definition["decimals"]
            ),
        )

        if repaired is None:
            continue

        value, was_repaired = (
            repaired
        )

        score = (
            token.confidence
            * 10.0
            + token.height
            * 0.01
        )

        # 소수점 보정 없이 직접 읽힌 값을 우선.
        if not was_repaired:
            score += 1.5

        candidates.append(
            {
                "value":
                    value,
                "token":
                    token,
                "was_repaired":
                    was_repaired,
                "score":
                    score,
            }
        )

    if not candidates:
        return None

    best = max(
        candidates,
        key=lambda item:
            item["score"],
    )

    decimals = int(
        definition["decimals"]
    )

    value = best["value"]

    if decimals == 0:
        normalized_value: (
            int | float
        ) = int(
            round(value)
        )
    else:
        normalized_value = round(
            value,
            decimals,
        )

    confidence = (
        float(
            best["token"].confidence
        )
        - (
            0.12
            if best["was_repaired"]
            else 0.0
        )
    )

    confidence = max(
        0.55,
        min(
            0.99,
            confidence,
        ),
    )

    return {
        "value":
            normalized_value,
        "confidence":
            round(
                confidence,
                3,
            ),
        "sourceText":
            best["token"].text,
        "source":
            source,
        "decimalRepaired":
            bool(
                best["was_repaired"]
            ),
    }



def consensus_integer_field(
    field_key: str,
    definition: dict[str, Any],
    image_array: np.ndarray,
    roi_pixels: tuple[
        int,
        int,
        int,
        int,
    ],
    full_tokens: list[Token],
) -> dict[str, Any] | None:
    """
    BMR처럼 한 자리 OCR 오류가 치명적인 정수 필드는
    동일 ROI를 여러 전처리 방식으로 읽고 합의가 있을 때만 자동 확정한다.
    """
    candidates: list[
        tuple[
            int,
            float,
            str,
        ]
    ] = []

    local_tokens = tokens_inside_roi(
        full_tokens,
        roi_pixels,
    )

    full_result = choose_value_from_tokens(
        field_key,
        definition,
        local_tokens,
        "full_page_roi",
    )

    if full_result is not None:
        candidates.append(
            (
                int(
                    round(
                        float(
                            full_result["value"]
                        )
                    )
                ),
                float(
                    full_result["confidence"]
                ),
                "full_page",
            )
        )

    for (
        variant_name,
        tokens,
    ) in roi_ocr_variants(
        image_array,
        roi_pixels,
    ):
        result = choose_value_from_tokens(
            field_key,
            definition,
            tokens,
            f"roi_{variant_name}",
        )

        if result is None:
            continue

        candidates.append(
            (
                int(
                    round(
                        float(
                            result["value"]
                        )
                    )
                ),
                float(
                    result["confidence"]
                ),
                variant_name,
            )
        )

    if not candidates:
        return None

    counts = Counter(
        value
        for (
            value,
            _,
            _,
        ) in candidates
    )

    top_value, top_count = (
        counts.most_common(1)[0]
    )

    total = len(
        candidates
    )

    # 같은 숫자를 두 번 이상 읽었으면 OCR 합의로 확정.
    if top_count >= 2:
        matching_confidences = [
            confidence
            for (
                value,
                confidence,
                _,
            ) in candidates
            if value == top_value
        ]

        confidence = min(
            0.99,
            0.82
            + min(
                0.12,
                top_count * 0.025,
            )
            + (
                sum(
                    matching_confidences
                )
                / len(
                    matching_confidences
                )
                - 0.5
            ) * 0.08,
        )

        return {
            "value":
                top_value,
            "confidence":
                round(
                    max(
                        0.82,
                        confidence,
                    ),
                    3,
                ),
            "sourceText":
                str(
                    [
                        value
                        for (
                            value,
                            _,
                            _,
                        ) in candidates
                    ]
                ),
            "source":
                "multi_pass_consensus",
            "decimalRepaired":
                False,
        }

    values = [
        value
        for (
            value,
            _,
            _,
        ) in candidates
    ]

    # 모든 OCR 결과가 1~2 차이로 갈리면 임의 확정하지 않는다.
    # 중앙값을 후보로 주되 confidence 0.55 -> UI에서 사용자 확인 필요.
    if (
        len(values) >= 3
        and max(values)
        - min(values)
        <= 2
    ):
        candidate = int(
            median(
                values
            )
        )

        return {
            "value":
                candidate,
            "confidence":
                0.55,
            "sourceText":
                str(values),
            "source":
                "multi_pass_ambiguous",
            "decimalRepaired":
                False,
        }

    # 합의가 없으면 가장 자신 있는 OCR 한 개도 자동 적용하지 않고 후보로만 전달.
    best = max(
        candidates,
        key=lambda item:
            item[1],
    )

    return {
        "value":
            best[0],
        "confidence":
            0.55,
        "sourceText":
            str(values),
        "source":
            "multi_pass_no_consensus",
        "decimalRepaired":
            False,
    }


def date_candidates_from_tokens(
    tokens: list[Token],
) -> list[
    tuple[
        str,
        float,
    ]
]:
    if not tokens:
        return []

    ordered = sorted(
        tokens,
        key=lambda item: (
            item.cy,
            item.cx,
        ),
    )

    texts = [
        token.text
        for token in ordered
    ]

    combined = " ".join(
        texts
    )

    compact = "".join(
        texts
    )

    search_texts = (
        texts
        + [
            combined,
            compact,
        ]
    )

    found: list[
        tuple[
            str,
            float,
        ]
    ] = []

    patterns = [
        re.compile(
            r"\b(20\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\b"
        ),
        re.compile(
            r"\b(20\d{2})(\d{2})(\d{2})\b"
        ),
    ]

    average_confidence = (
        sum(
            token.confidence
            for token in tokens
        )
        / len(tokens)
    )

    for text in search_texts:
        cleaned = (
            text
            .replace("O", "0")
            .replace("o", "0")
        )

        for pattern in patterns:
            for match in pattern.finditer(
                cleaned
            ):
                year = int(
                    match.group(1)
                )
                month = int(
                    match.group(2)
                )
                day = int(
                    match.group(3)
                )

                if not (
                    2020 <= year <= 2100
                    and 1 <= month <= 12
                    and 1 <= day <= 31
                ):
                    continue

                found.append(
                    (
                        f"{year:04d}-{month:02d}-{day:02d}",
                        average_confidence,
                    )
                )

    unique: dict[
        str,
        float,
    ] = {}

    for (
        value,
        confidence,
    ) in found:
        unique[value] = max(
            confidence,
            unique.get(
                value,
                0.0,
            ),
        )

    return list(
        unique.items()
    )


def parse_measurement_date_consensus(
    image_array: np.ndarray,
    full_tokens: list[Token],
) -> dict[str, Any] | None:
    height, width = (
        image_array.shape[:2]
    )

    roi_pixels = normalized_roi_to_pixels(
        DATE_ROI,
        width,
        height,
    )

    candidates: list[
        tuple[
            str,
            float,
            str,
        ]
    ] = []

    # 전체 페이지 결과에서도 날짜 ROI 안에 있는 token만 사용.
    local_tokens = tokens_inside_roi(
        full_tokens,
        roi_pixels,
    )

    for (
        value,
        confidence,
    ) in date_candidates_from_tokens(
        local_tokens
    ):
        candidates.append(
            (
                value,
                confidence,
                "full_page_roi",
            )
        )

    for (
        variant_name,
        tokens,
    ) in roi_ocr_variants(
        image_array,
        roi_pixels,
    ):
        for (
            value,
            confidence,
        ) in date_candidates_from_tokens(
            tokens
        ):
            candidates.append(
                (
                    value,
                    confidence,
                    variant_name,
                )
            )

    if not candidates:
        return None

    counts = Counter(
        value
        for (
            value,
            _,
            _,
        ) in candidates
    )

    top_value, top_count = (
        counts.most_common(1)[0]
    )

    if top_count >= 2:
        return {
            "value":
                top_value,
            "confidence":
                0.94
                if top_count >= 3
                else 0.88,
            "sourceText":
                str(
                    [
                        value
                        for (
                            value,
                            _,
                            _,
                        ) in candidates
                    ]
                ),
            "source":
                "date_multi_pass_consensus",
        }

    # 날짜는 한 글자만 틀려도 다른 날짜가 되므로
    # 합의가 없을 때는 자동 입력하지 않고 확인 후보로만 넘긴다.
    best = max(
        candidates,
        key=lambda item:
            item[1],
    )

    return {
        "value":
            best[0],
        "confidence":
            0.55,
        "sourceText":
            str(
                [
                    value
                    for (
                        value,
                        _,
                        _,
                    ) in candidates
                ]
            ),
        "source":
            "date_no_consensus",
    }


def extract_field_value(
    field_key: str,
    definition: dict[str, Any],
    image_array: np.ndarray,
    full_tokens: list[Token],
) -> dict[str, Any] | None:
    height, width = (
        image_array.shape[:2]
    )

    roi_pixels = (
        normalized_roi_to_pixels(
            definition["roi"],
            width,
            height,
        )
    )

    local_tokens = (
        tokens_inside_roi(
            full_tokens,
            roi_pixels,
        )
    )

    if field_key == "bmr_kcal":
        return consensus_integer_field(
            field_key,
            definition,
            image_array,
            roi_pixels,
            full_tokens,
        )

    dedicated_first = bool(
        definition.get(
            "dedicated_first",
            False,
        )
    )

    # 우측 연구항목 3개는 각 행이 매우 촘촘하고 오른쪽에 참고범위가 붙어 있어
    # full-page OCR token보다 숫자 칸만 확대한 dedicated OCR을 먼저 신뢰한다.
    if dedicated_first:
        roi_image = preprocess_roi(
            image_array,
            roi_pixels,
        )

        roi_tokens = run_pipeline(
            roi_image
        )

        result = choose_value_from_tokens(
            field_key,
            definition,
            roi_tokens,
            "dedicated_roi_ocr",
        )

        if result is not None:
            return result

        result = choose_value_from_tokens(
            field_key,
            definition,
            local_tokens,
            "full_page_roi",
        )

        if result is not None:
            return result
    else:
        # 나머지 필드는 v4에서 이미 잘 동작했으므로 기존 순서를 그대로 유지.
        result = choose_value_from_tokens(
            field_key,
            definition,
            local_tokens,
            "full_page_roi",
        )

        if result is not None:
            return result

        roi_image = preprocess_roi(
            image_array,
            roi_pixels,
        )

        roi_tokens = run_pipeline(
            roi_image
        )

        result = choose_value_from_tokens(
            field_key,
            definition,
            roi_tokens,
            "dedicated_roi_ocr",
        )

        if result is not None:
            return result

    print(
        "[FitTrack OCR]",
        field_key,
        "ROI OCR failed.",
        "full tokens=",
        [
            token.text
            for token in local_tokens
        ],
    )

    return None


def field_number(
    fields: dict[
        str,
        dict[str, Any],
    ],
    key: str,
) -> float | None:
    field = fields.get(key)

    if not field:
        return None

    try:
        value = float(
            field["value"]
        )
    except (
        KeyError,
        TypeError,
        ValueError,
    ):
        return None

    return (
        value
        if math.isfinite(value)
        else None
    )


def lower_confidence(
    fields: dict[
        str,
        dict[str, Any],
    ],
    key: str,
    ceiling: float,
) -> None:
    if key not in fields:
        return

    try:
        current = float(
            fields[key][
                "confidence"
            ]
        )
    except (
        KeyError,
        TypeError,
        ValueError,
    ):
        current = 0.0

    fields[key][
        "confidence"
    ] = min(
        current,
        ceiling,
    )


def apply_consistency_checks(
    fields: dict[
        str,
        dict[str, Any],
    ],
    warnings: list[str],
) -> None:
    weight = field_number(
        fields,
        "weight_kg",
    )
    skeletal = field_number(
        fields,
        "skeletal_muscle_kg",
    )
    fat_kg = field_number(
        fields,
        "body_fat_kg",
    )
    fat_pct = field_number(
        fields,
        "body_fat_pct",
    )
    water = field_number(
        fields,
        "body_water_kg",
    )

    if (
        weight is not None
        and skeletal is not None
        and skeletal > weight * 0.7
    ):
        lower_confidence(
            fields,
            "skeletal_muscle_kg",
            0.55,
        )

        warnings.append(
            "골격근량 값은 원본 확인이 필요합니다."
        )

    if (
        weight is not None
        and water is not None
        and water > weight
    ):
        lower_confidence(
            fields,
            "body_water_kg",
            0.55,
        )

        warnings.append(
            "체수분 값은 원본 확인이 필요합니다."
        )

    if (
        weight is not None
        and fat_kg is not None
        and fat_pct is not None
    ):
        expected = (
            fat_kg
            / weight
            * 100
        )

        if abs(
            expected - fat_pct
        ) > 2.0:
            lower_confidence(
                fields,
                "body_fat_kg",
                0.70,
            )

            lower_confidence(
                fields,
                "body_fat_pct",
                0.70,
            )

            warnings.append(
                "체지방량과 체지방률의 관계를 원본에서 다시 확인해주세요."
            )


def parse_inbody(
    image_array: np.ndarray,
    full_tokens: list[Token],
) -> dict[str, Any]:
    fields: dict[
        str,
        dict[str, Any],
    ] = {}

    warnings: list[str] = []

    measured_at = (
        parse_measurement_date_consensus(
            image_array,
            full_tokens,
        )
    )

    if measured_at:
        fields[
            "measured_at"
        ] = measured_at

    for (
        field_key,
        definition,
    ) in FIELD_ROIS.items():
        value = extract_field_value(
            field_key,
            definition,
            image_array,
            full_tokens,
        )

        if value is not None:
            fields[field_key] = value
        else:
            warnings.append(
                f"{definition['label']} 숫자를 읽지 못했습니다. 직접 확인해주세요."
            )

    apply_consistency_checks(
        fields,
        warnings,
    )

    confidences = [
        float(
            field["confidence"]
        )
        for field in fields.values()
        if isinstance(
            field.get(
                "confidence"
            ),
            (int, float),
        )
    ]

    overall = (
        sum(confidences)
        / len(confidences)
        if confidences
        else 0.0
    )

    print(
        "[FitTrack OCR] ---------- TEXT ROI RESULT ----------"
    )

    for key, field in fields.items():
        print(
            "[FitTrack OCR]",
            key,
            "=",
            field.get("value"),
            "| sourceText=",
            field.get("sourceText"),
            "| source=",
            field.get("source"),
            "| repaired=",
            field.get(
                "decimalRepaired",
                False,
            ),
            "| confidence=",
            field.get(
                "confidence"
            ),
        )

    print(
        "[FitTrack OCR] -------------------------------------"
    )

    return {
        "fields":
            fields,
        "overallConfidence":
            round(
                overall,
                3,
            ),
        "warnings":
            list(
                dict.fromkeys(
                    warnings
                )
            ),
        "engine": {
            "name":
                "PaddleOCR",
            "ocrVersion":
                "PP-OCRv5",
            "language":
                "korean",
            "parserVersion":
                "inbody370s-text-roi-v6",
            "tokenCount":
                len(
                    full_tokens
                ),
        },
    }


def run_full_ocr(
    image_array: np.ndarray,
) -> list[Token]:
    return run_pipeline(
        image_array
    )


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "engine":
            "PaddleOCR",
        "ocrVersion":
            "PP-OCRv5",
        "language":
            "korean",
        "parserVersion":
            "inbody370s-text-roi-v6",
        "device":
            "cpu",
    }


@app.post("/parse-inbody")
async def parse_inbody_endpoint(
    image: UploadFile = File(...),
) -> JSONResponse:
    if image.content_type not in {
        "image/jpeg",
        "image/png",
        "image/webp",
    }:
        raise HTTPException(
            status_code=415,
            detail=
                "JPG, PNG, WEBP 이미지만 지원합니다.",
        )

    content = await image.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail=
                "빈 이미지 파일입니다.",
        )

    if (
        len(content)
        > MAX_FILE_BYTES
    ):
        raise HTTPException(
            status_code=413,
            detail=
                "이미지는 12MB 이하로 업로드해주세요.",
        )

    try:
        image_array = prepare_image(
            content
        )
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=400,
            detail=
                "이미지 파일을 읽을 수 없습니다.",
        ) from exc

    try:
        full_tokens = (
            await run_in_threadpool(
                run_full_ocr,
                image_array,
            )
        )

        # ROI fallback OCR도 동일 PaddleOCR 객체를 사용하고 lock을 잡기 때문에
        # parse_inbody 전체를 threadpool에 넣어 event loop를 막지 않는다.
        parsed = (
            await run_in_threadpool(
                parse_inbody,
                image_array,
                full_tokens,
            )
        )

        return JSONResponse(
            content=parsed,
            headers={
                "Cache-Control":
                    "no-store",
            },
        )

    except HTTPException:
        raise

    except Exception as exc:
        print(
            "[FitTrack OCR] inference error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail=
                "OCR 분석 중 오류가 발생했습니다.",
        ) from exc
