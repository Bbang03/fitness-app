'use client';

import {
  ChangeEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';

const OPTIONAL_FIELDS = [
  {
    key: 'abdominal_fat_ratio',
    label: '복부지방률 (WHR)',
    placeholder: '예: 0.85',
    step: '0.01',
    unit: '',
  },
  {
    key: 'visceral_fat_level',
    label: '내장지방레벨',
    placeholder: '예: 8',
    step: '1',
    unit: 'Lv.',
  },
  {
    key: 'body_water_kg',
    label: '체수분',
    placeholder: '예: 38.5',
    step: '0.1',
    unit: 'kg',
  },
  {
    key: 'bmr_kcal',
    label: '기초대사량',
    placeholder: '예: 1680',
    step: '1',
    unit: 'kcal',
  },
  {
    key: 'protein_kg',
    label: '단백질',
    placeholder: '예: 10.8',
    step: '0.1',
    unit: 'kg',
  },
  {
    key: 'mineral_kg',
    label: '무기질',
    placeholder: '예: 3.5',
    step: '0.1',
    unit: 'kg',
  },
] as const;

type FormKey =
  | 'measured_at'
  | 'weight_kg'
  | 'skeletal_muscle_kg'
  | 'body_fat_kg'
  | 'body_fat_pct'
  | 'abdominal_fat_ratio'
  | 'visceral_fat_level'
  | 'body_water_kg'
  | 'bmr_kcal'
  | 'protein_kg'
  | 'mineral_kg';

type NumericFormKey = Exclude<FormKey, 'measured_at'>;

type OcrField = {
  value: string | number | null;
  confidence?: number;
  sourceText?: string;
};

type OcrResponse = {
  fields?: Partial<Record<FormKey, OcrField | string | number | null>>;
  data?: Partial<Record<FormKey, OcrField | string | number | null>>;
  overallConfidence?: number;
  warnings?: string[];
  rawText?: string;
};

type FieldState = {
  confidence?: number;
  candidate?: string;
  needsReview?: boolean;
};

const REQUIRED_FIELDS: Array<{
  key: NumericFormKey;
  label: string;
  placeholder: string;
  step: string;
  unit: string;
}> = [
  {
    key: 'weight_kg',
    label: '체중',
    placeholder: '예: 72.5',
    step: '0.1',
    unit: 'kg',
  },
  {
    key: 'skeletal_muscle_kg',
    label: '골격근량',
    placeholder: '예: 34.2',
    step: '0.1',
    unit: 'kg',
  },
  {
    key: 'body_fat_kg',
    label: '체지방량',
    placeholder: '예: 12.3',
    step: '0.1',
    unit: 'kg',
  },
  {
    key: 'body_fat_pct',
    label: '체지방률',
    placeholder: '예: 18.4',
    step: '0.1',
    unit: '%',
  },
];

function emptyForm(todayKey: string): Record<FormKey, string> {
  return {
    measured_at: '',
    weight_kg: '',
    skeletal_muscle_kg: '',
    body_fat_kg: '',
    body_fat_pct: '',
    abdominal_fat_ratio: '',
    visceral_fat_level: '',
    body_water_kg: '',
    bmr_kcal: '',
    protein_kg: '',
    mineral_kg: '',
  };
}

function normalizeValue(value: unknown) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value)
    .replace(/,/g, '')
    .trim();
}

function numberOrNull(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function parseOcrField(
  value:
    | OcrField
    | string
    | number
    | null
    | undefined,
): {
  value: string;
  confidence: number;
} | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return {
      value: normalizeValue(value),
      confidence: 0.85,
    };
  }

  return {
    value: normalizeValue(value.value),
    confidence:
      typeof value.confidence === 'number'
        ? value.confidence
        : 0.85,
  };
}

function isPlausibleValue(
  key: FormKey,
  value: string,
  currentForm: Record<FormKey, string>,
  todayKey: string,
) {
  if (key === 'measured_at') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    return value <= todayKey;
  }

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return false;
  }

  switch (key) {
    case 'weight_kg':
      return n >= 30 && n <= 250;

    case 'skeletal_muscle_kg': {
      const weight =
        numberOrNull(currentForm.weight_kg);

      if (n < 5 || n > 100) {
        return false;
      }

      if (
        weight !== null &&
        n > weight * 0.7
      ) {
        return false;
      }

      return true;
    }

    case 'body_fat_kg': {
      const weight =
        numberOrNull(currentForm.weight_kg);

      if (n < 1 || n > 150) {
        return false;
      }

      if (
        weight !== null &&
        n >= weight
      ) {
        return false;
      }

      return true;
    }

    case 'body_fat_pct':
      return n >= 1 && n <= 60;

    case 'abdominal_fat_ratio':
      return n >= 0.5 && n <= 1.5;

    case 'visceral_fat_level':
      return n >= 1 && n <= 30;

    case 'body_water_kg': {
      const weight =
        numberOrNull(currentForm.weight_kg);

      if (n < 10 || n > 150) {
        return false;
      }

      if (
        weight !== null &&
        n > weight
      ) {
        return false;
      }

      return true;
    }

    case 'bmr_kcal':
      return n >= 500 && n <= 4000;

    case 'protein_kg':
      return n >= 2 && n <= 30;

    case 'mineral_kg':
      return n >= 1 && n <= 10;

    default:
      return true;
  }
}

function confidenceLabel(
  confidence?: number,
  needsReview?: boolean,
) {
  if (needsReview) {
    return {
      text: '확인 필요',
      className:
        'bg-amber-500/10 text-amber-300 border-amber-500/20',
    };
  }

  if (
    confidence !== undefined &&
    confidence >= 0.85
  ) {
    return {
      text: '자동 인식',
      className:
        'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    };
  }

  return null;
}

export default function NewInbodyPage() {
  const router = useRouter();

  const {
    currentUser,
    addInbodyRecord,
  } = useStore();

  const user =
    currentUser();

  useEffect(() => {
    if (!user) {
      router.replace('/login');
    }
  }, [user, router]);

  const todayKey =
    new Date()
      .toISOString()
      .split('T')[0];

  const [form, setForm] =
    useState<Record<FormKey, string>>(
      () => emptyForm(todayKey),
    );

  const [
    fieldStates,
    setFieldStates,
  ] = useState<
    Partial<Record<FormKey, FieldState>>
  >({});

  const [
    imageFile,
    setImageFile,
  ] = useState<File | null>(null);

  const [
    imagePreview,
    setImagePreview,
  ] = useState<string | null>(null);

  const [
    analyzing,
    setAnalyzing,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const [
    ocrWarnings,
    setOcrWarnings,
  ] = useState<string[]>([]);

  const [
    overallConfidence,
    setOverallConfidence,
  ] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(
          imagePreview,
        );
      }
    };
  }, [imagePreview]);

  const calculatedBodyFatPct =
    useMemo(() => {
      const weight =
        numberOrNull(
          form.weight_kg,
        );

      const fatKg =
        numberOrNull(
          form.body_fat_kg,
        );

      if (
        weight === null ||
        fatKg === null ||
        weight <= 0
      ) {
        return null;
      }

      return (
        fatKg /
        weight *
        100
      );
    }, [
      form.weight_kg,
      form.body_fat_kg,
    ]);

  const calculatedBodyFatKg =
    useMemo(() => {
      const weight =
        numberOrNull(
          form.weight_kg,
        );

      const fatPct =
        numberOrNull(
          form.body_fat_pct,
        );

      if (
        weight === null ||
        fatPct === null
      ) {
        return null;
      }

      return (
        weight *
        fatPct /
        100
      );
    }, [
      form.weight_kg,
      form.body_fat_pct,
    ]);

  const bodyFatConsistencyWarning =
    useMemo(() => {
      const actual =
        numberOrNull(
          form.body_fat_kg,
        );

      if (
        actual === null ||
        calculatedBodyFatKg ===
          null
      ) {
        return false;
      }

      return (
        Math.abs(
          actual -
          calculatedBodyFatKg,
        ) > 1
      );
    }, [
      form.body_fat_kg,
      calculatedBodyFatKg,
    ]);

  const updateField =
    (
      key: FormKey,
      value: string,
    ) => {
      setForm((prev) => ({
        ...prev,
        [key]: value,
      }));

      setFieldStates(
        (prev) => ({
          ...prev,
          [key]: undefined,
        }),
      );

      setError('');
    };

  const handleImageChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    if (
      !file.type.startsWith(
        'image/',
      )
    ) {
      setError(
        '이미지 파일만 업로드할 수 있습니다.',
      );

      return;
    }

    if (
      file.size >
      12 * 1024 * 1024
    ) {
      setError(
        '이미지는 12MB 이하로 업로드해주세요.',
      );

      return;
    }

    if (imagePreview) {
      URL.revokeObjectURL(
        imagePreview,
      );
    }

    setImageFile(file);
    setImagePreview(
      URL.createObjectURL(
        file,
      ),
    );

    setFieldStates({});
    setOcrWarnings([]);
    setOverallConfidence(null);
    setError('');
  };

  const removeImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(
        imagePreview,
      );
    }

    setImageFile(null);
    setImagePreview(null);
    setFieldStates({});
    setOcrWarnings([]);
    setOverallConfidence(null);
  };

  const handleAnalyze = async () => {
    if (
      !imageFile ||
      analyzing
    ) {
      return;
    }

    setAnalyzing(true);
    setError('');
    setOcrWarnings([]);

    try {
      const payload =
        new FormData();

      payload.append(
        'image',
        imageFile,
      );

      const response =
        await fetch(
          '/api/inbody/parse',
          {
            method: 'POST',
            body: payload,
          },
        );

      const result =
        (
          await response.json()
        ) as OcrResponse & {
          error?: string;
          message?: string;
        };

      if (!response.ok) {
        throw new Error(
          result.message ??
            result.error ??
            '체성분 이미지 분석에 실패했습니다.',
        );
      }

      const extracted =
        result.fields ??
        result.data ??
        {};

      const nextForm = {
        ...form,
      };

      const nextStates:
        Partial<
          Record<
            FormKey,
            FieldState
          >
        > = {};

      const warnings =
        [...(
          result.warnings ??
          []
        )];

      const keys: FormKey[] = [
        'measured_at',
        'weight_kg',
        'skeletal_muscle_kg',
        'body_fat_kg',
        'body_fat_pct',
        'abdominal_fat_ratio',
        'visceral_fat_level',
        'body_water_kg',
        'bmr_kcal',
        'protein_kg',
        'mineral_kg',
      ];

      for (
        const key
        of keys
      ) {
        const parsed =
          parseOcrField(
            extracted[key],
          );

        if (
          !parsed ||
          !parsed.value
        ) {
          continue;
        }

        const plausible =
          isPlausibleValue(
            key,
            parsed.value,
            nextForm,
            todayKey,
          );

        const reliable =
          parsed.confidence >=
          0.6;

        if (
          plausible &&
          reliable
        ) {
          nextForm[key] =
            parsed.value;

          nextStates[key] = {
            confidence:
              parsed.confidence,

            needsReview:
              parsed.confidence <
              0.85,
          };

          if (
            parsed.confidence <
            0.85
          ) {
            warnings.push(
              `${
                fieldLabel(key)
              } 인식 신뢰도가 낮아 확인이 필요합니다.`,
            );
          }
        } else {
          nextStates[key] = {
            confidence:
              parsed.confidence,

            candidate:
              parsed.value,

            needsReview: true,
          };

          warnings.push(
            `${
              fieldLabel(key)
            } 값 "${
              parsed.value
            }"은 자동 적용하지 않았습니다.`,
          );
        }
      }

      setForm(nextForm);
      setFieldStates(
        nextStates,
      );

      setOcrWarnings(
        Array.from(
          new Set(
            warnings,
          ),
        ),
      );

      setOverallConfidence(
        typeof result.overallConfidence ===
          'number'
          ? result.overallConfidence
          : null,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '체성분 이미지 분석에 실패했습니다.',
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave =
    async () => {
      if (saving) {
        return;
      }

      setError('');

      const weight =
        Number(
          form.weight_kg,
        );

      const skeletal =
        Number(
          form.skeletal_muscle_kg,
        );

      const bodyFatKg =
        Number(
          form.body_fat_kg,
        );

      const fatPct =
        Number(
          form.body_fat_pct,
        );

      if (
        !form.measured_at
      ) {
        setError(
          '측정일을 입력해주세요.',
        );

        return;
      }

      if (
        !weight ||
        !skeletal ||
        !bodyFatKg ||
        !fatPct
      ) {
        setError(
          '체중, 골격근량, 체지방량, 체지방률은 필수 항목입니다.',
        );

        return;
      }

      if (
        weight < 30 ||
        weight > 250
      ) {
        setError(
          '체중이 올바르지 않습니다.',
        );

        return;
      }

      if (
        skeletal < 5 ||
        skeletal >
          weight * 0.7
      ) {
        setError(
          '골격근량이 올바르지 않습니다.',
        );

        return;
      }

      if (
        bodyFatKg < 1 ||
        bodyFatKg >= weight
      ) {
        setError(
          '체지방량이 올바르지 않습니다.',
        );

        return;
      }

      if (
        fatPct < 1 ||
        fatPct > 60
      ) {
        setError(
          '체지방률이 올바르지 않습니다.',
        );

        return;
      }

      if (
        bodyFatConsistencyWarning
      ) {
        setError(
          '체지방량과 체지방률의 관계가 크게 차이납니다. 체성분 결과지를 다시 확인해주세요.',
        );

        return;
      }

      setSaving(true);

      const ok =
        await addInbodyRecord({
          measured_at:
            form.measured_at,

          weight_kg:
            weight,

          skeletal_muscle_kg:
            skeletal,

          body_fat_kg:
            bodyFatKg,

          body_fat_pct:
            fatPct,

          abdominal_fat_ratio:
            form.abdominal_fat_ratio
              ? Number(
                  form.abdominal_fat_ratio,
                )
              : undefined,

          visceral_fat_level:
            form.visceral_fat_level
              ? Number(
                  form.visceral_fat_level,
                )
              : undefined,

          body_water_kg:
            form.body_water_kg
              ? Number(
                  form.body_water_kg,
                )
              : undefined,

          bmr_kcal:
            form.bmr_kcal
              ? Number(
                  form.bmr_kcal,
                )
              : undefined,

          protein_kg:
            form.protein_kg
              ? Number(
                  form.protein_kg,
                )
              : undefined,

          mineral_kg:
            form.mineral_kg
              ? Number(
                  form.mineral_kg,
                )
              : undefined,
        });

      if (!ok) {
        setSaving(false);

        setError(
          '체성분 기록 저장에 실패했습니다.',
        );

        return;
      }

      router.back();
    };

  const inputCls =
    'w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-center text-base text-white placeholder-zinc-600 transition-colors focus:border-blue-500 focus:outline-none';

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen px-4 pb-12 pt-10">
      {/* Header */}
      <div className="mb-7 flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            router.back()
          }
          className="-ml-1 p-1 text-zinc-400 transition-colors hover:text-white"
          aria-label="뒤로 가기"
        >
          <ChevronLeft
            size={24}
          />
        </button>

        <div>
          <h1 className="text-lg font-bold">
            체성분 기록 추가
          </h1>

          <p className="mt-0.5 text-xs text-zinc-500">
            결과지를 촬영하면 값을 자동으로 입력할 수 있어요
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* OCR upload */}
        <section className="rounded-2xl border border-blue-500/15 bg-gradient-to-br from-blue-500/[0.08] to-violet-500/[0.05] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
              <Camera
                size={21}
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                체성분 결과지 자동 입력
              </p>

              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                결과지 전체가 선명하게 보이도록 촬영해주세요.
                인식 결과는 저장 전에 반드시 확인할 수 있습니다.
              </p>
            </div>
          </div>

          {!imagePreview ? (
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-7 transition-colors hover:border-blue-500/50 hover:bg-blue-500/[0.03]">
              <ImagePlus
                size={24}
                className="mb-2 text-zinc-500"
              />

              <p className="text-sm font-medium text-zinc-300">
                결과지 이미지 선택
              </p>

              <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
                체성분 측정 결과지 이미지를 선택해주세요.
                <br />
                JPG, PNG, WEBP · 최대 12MB
              </p>

              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={
                  handleImageChange
                }
                className="hidden"
              />
            </label>
          ) : (
            <div className="mt-4">
              <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    imagePreview
                  }
                  alt="업로드한 체성분 결과지"
                  className="max-h-[420px] w-full object-contain"
                />

                <button
                  type="button"
                  onClick={
                    removeImage
                  }
                  className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-zinc-300 backdrop-blur"
                  aria-label="이미지 제거"
                >
                  <X
                    size={15}
                  />
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  void handleAnalyze()
                }
                disabled={
                  analyzing
                }
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {analyzing ? (
                  <>
                    <Loader2
                      size={16}
                      className="animate-spin"
                    />
                    결과지 분석 중...
                  </>
                ) : (
                  <>
                    <Sparkles
                      size={16}
                    />
                    체성분 자동 인식
                  </>
                )}
              </button>

              {overallConfidence !==
                null && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-zinc-950/50 px-3 py-2.5">
                  <span className="text-[11px] text-zinc-500">
                    전체 인식 신뢰도
                  </span>

                  <span className="text-xs font-semibold text-blue-300">
                    {Math.round(
                      overallConfidence *
                        100,
                    )}
                    %
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* OCR warnings */}
        {ocrWarnings.length >
          0 && (
          <section className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-4">
            <div className="flex items-start gap-2">
              <AlertCircle
                size={15}
                className="mt-0.5 flex-shrink-0 text-amber-400"
              />

              <div>
                <p className="text-xs font-semibold text-amber-300">
                  확인이 필요한 항목이 있어요
                </p>

                <div className="mt-2 space-y-1">
                  {ocrWarnings
                    .slice(
                      0,
                      6,
                    )
                    .map(
                      (
                        warning,
                        index,
                      ) => (
                        <p
                          key={`${warning}-${index}`}
                          className="text-[10px] leading-relaxed text-zinc-500"
                        >
                          · {warning}
                        </p>
                      ),
                    )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Date */}
        <FieldShell
          label="측정일"
          state={
            fieldStates.measured_at
          }
        >
          <input
            type="date"
            value={
              form.measured_at
            }
            max={todayKey}
            onChange={(event) =>
              updateField(
                'measured_at',
                event.target
                  .value,
              )
            }
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-base text-white transition-colors focus:border-blue-500 focus:outline-none"
          />

          <CandidateHint
            state={
              fieldStates.measured_at
            }
            onUse={(
              value,
            ) =>
              updateField(
                'measured_at',
                value,
              )
            }
          />
        </FieldShell>

        {/* Required */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              필수 항목
            </p>

            <span className="text-[10px] text-zinc-600">
              InBody 핵심 지표
            </span>
          </div>

          {REQUIRED_FIELDS.map(
            ({
              key,
              label,
              placeholder,
              step,
              unit,
            }) => (
              <FieldShell
                key={key}
                label={`${label} (${unit})`}
                state={
                  fieldStates[
                    key
                  ]
                }
              >
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    step={step}
                    value={
                      form[key]
                    }
                    onChange={(
                      event,
                    ) =>
                      updateField(
                        key,
                        event
                          .target
                          .value,
                      )
                    }
                    className={
                      inputCls
                    }
                    placeholder={
                      placeholder
                    }
                  />
                </div>

                <CandidateHint
                  state={
                    fieldStates[
                      key
                    ]
                  }
                  onUse={(
                    value,
                  ) =>
                    updateField(
                      key,
                      value,
                    )
                  }
                />
              </FieldShell>
            ),
          )}

          {calculatedBodyFatKg !==
            null && (
            <div
              className={`rounded-xl border px-3 py-2.5 text-[11px] ${
                bodyFatConsistencyWarning
                  ? 'border-amber-500/20 bg-amber-500/[0.05] text-amber-300'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-500'
              }`}
            >
              {bodyFatConsistencyWarning
                ? '체지방량과 체중×체지방률 계산값의 차이가 큽니다. 결과지를 다시 확인해주세요.'
                : `계산 검증: ${form.weight_kg}kg × ${form.body_fat_pct}% ≈ ${calculatedBodyFatKg.toFixed(1)}kg`}
            </div>
          )}

          {calculatedBodyFatPct !==
            null &&
            !form.body_fat_pct && (
              <p className="text-center text-[10px] text-zinc-600">
                체중·체지방량 기준 추정
                체지방률{' '}
                {calculatedBodyFatPct.toFixed(
                  1,
                )}
                %
              </p>
            )}
        </section>

        {/* Optional */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            추가 체성분 정보
          </p>

          {OPTIONAL_FIELDS.map(
            ({
              key,
              label,
              placeholder,
              step,
              unit,
            }) => (
              <FieldShell
                key={key}
                label={
                  unit
                    ? `${label} (${unit})`
                    : label
                }
                state={
                  fieldStates[
                    key
                  ]
                }
              >
                <input
                  type="number"
                  inputMode="decimal"
                  step={step}
                  value={
                    form[key]
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      key,
                      event
                        .target
                        .value,
                    )
                  }
                  className={
                    inputCls
                  }
                  placeholder={
                    placeholder
                  }
                />

                <CandidateHint
                  state={
                    fieldStates[
                      key
                    ]
                  }
                  onUse={(
                    value,
                  ) =>
                    updateField(
                      key,
                      value,
                    )
                  }
                />
              </FieldShell>
            ),
          )}
        </section>

        {/* Summary */}
        {form.weight_kg &&
          form.skeletal_muscle_kg &&
          form.body_fat_kg &&
          form.body_fat_pct && (
            <section className="rounded-2xl bg-zinc-900 p-4">
              <p className="mb-3 text-xs font-semibold text-zinc-400">
                저장할 핵심 체성분
              </p>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  {
                    label:
                      '체중',
                    value: `${form.weight_kg}kg`,
                    color:
                      'text-white',
                  },
                  {
                    label:
                      '골격근',
                    value: `${form.skeletal_muscle_kg}kg`,
                    color:
                      'text-blue-400',
                  },
                  {
                    label:
                      '체지방량',
                    value: `${form.body_fat_kg}kg`,
                    color:
                      'text-rose-300',
                  },
                  {
                    label:
                      '체지방률',
                    value: `${form.body_fat_pct}%`,
                    color:
                      'text-rose-400',
                  },
                ].map(
                  ({
                    label,
                    value,
                    color,
                  }) => (
                    <div
                      key={
                        label
                      }
                      className="rounded-xl bg-zinc-800 py-3 text-center"
                    >
                      <p
                        className={`text-sm font-bold ${color}`}
                      >
                        {value}
                      </p>

                      <p className="mt-0.5 text-[10px] text-zinc-500">
                        {label}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/15 bg-red-500/[0.05] px-3 py-3">
            <AlertCircle
              size={15}
              className="mt-0.5 flex-shrink-0 text-red-400"
            />

            <p className="text-xs leading-relaxed text-red-300">
              {error}
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={() =>
            void handleSave()
          }
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-base font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2
                size={17}
                className="animate-spin"
              />
              저장 중...
            </>
          ) : (
            '체성분 기록 저장'
          )}
        </button>
      </div>
    </div>
  );
}

function FieldShell({
  label,
  state,
  children,
}: {
  label: string;
  state?: FieldState;
  children:
    React.ReactNode;
}) {
  const badge =
    confidenceLabel(
      state?.confidence,
      state?.needsReview,
    );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="text-sm text-zinc-400">
          {label}
        </label>

        {badge && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${badge.className}`}
          >
            {state?.needsReview ? (
              <AlertCircle
                size={10}
              />
            ) : (
              <CheckCircle2
                size={10}
              />
            )}

            {badge.text}
          </span>
        )}
      </div>

      {children}
    </div>
  );
}

function CandidateHint({
  state,
  onUse,
}: {
  state?: FieldState;
  onUse:
    (value: string) => void;
}) {
  if (
    !state?.candidate
  ) {
    return null;
  }

  return (
    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.05] px-3 py-2">
      <div className="min-w-0">
        <p className="text-[9px] text-zinc-600">
          OCR 후보
        </p>

        <p className="truncate text-xs font-semibold text-amber-300">
          {state.candidate}
        </p>
      </div>

      <button
        type="button"
        onClick={() =>
          onUse(
            state.candidate!,
          )
        }
        className="flex-shrink-0 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-amber-300"
      >
        이 값 사용
      </button>
    </div>
  );
}

function fieldLabel(
  key: FormKey,
) {
  const labels:
    Record<FormKey, string> = {
      measured_at:
        '측정일',
      weight_kg:
        '체중',
      skeletal_muscle_kg:
        '골격근량',
      body_fat_kg:
        '체지방량',
      body_fat_pct:
        '체지방률',
      abdominal_fat_ratio:
        '복부지방률',
      visceral_fat_level:
        '내장지방레벨',
      body_water_kg:
        '체수분',
      bmr_kcal:
        '기초대사량',
      protein_kg:
        '단백질',
      mineral_kg:
        '무기질',
    };

  return labels[key];
}