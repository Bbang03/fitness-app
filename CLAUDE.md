# 프로젝트: 운동 트래커 + 식단 기록 + 인바디 예측 웹앱 (가칭)

## 제품 개요
운동하는 사람을 위한 올인원 웹앱. 실제 출시가 목표.
핵심 차별점: **운동 수행 기록 + 식단 기록 + 인바디 추이를 결합해 다음 달 인바디 결과(체중/골격근량/체지방률)를 예측**해주는 기능.
경쟁 앱(Fleek, 번핏, 플랜핏)은 트래킹까지만 제공하므로, 예측 기능을 전면에 내세운다.

## 기술 스택
- **프론트엔드**: Next.js (App Router) + TypeScript + Tailwind CSS
- **백엔드/인프라**: Supabase (Auth, PostgreSQL, Storage, Realtime)
- **배포**: Vercel
- **PWA 필수**: 사용자는 헬스장에서 모바일 브라우저로 사용. manifest + service worker 구성, 홈 화면 추가 유도.
- 예측 모델: 초기엔 TypeScript 룰베이스 → 추후 Python 서버리스 함수(LightGBM)로 교체 가능하도록 모듈 분리.

## 웹 특화 기술 요구사항 (중요)
1. **휴식 타이머**: setTimeout 기반 카운트다운 금지. 타이머 **종료 시각(timestamp)을 저장**하고 화면 복귀/리렌더 시 남은 시간을 재계산. 종료 시 Web Notifications API로 알림 + 소리.
2. **Screen Wake Lock API**: 운동 수행 모드에서 화면 꺼짐 방지.
3. **오프라인 대응**: 운동/식단 기록은 로컬(IndexedDB) 우선 기록 후 백그라운드 동기화. 헬스장 지하의 약한 네트워크 환경 가정.

## 데이터 스키마 (Supabase PostgreSQL)
```
users           : id, height_cm, sex, birth_year, created_at
routines        : id, user_id, name, created_at
routine_items   : id, routine_id, order, exercise_name, target_sets, target_reps, rest_seconds
workout_logs    : id, user_id, routine_id, date, started_at, finished_at
set_logs        : id, workout_log_id, exercise_name, set_number, weight_kg, reps, actual_rest_seconds
meal_logs       : id, user_id, date, meal_type(아침/점심/저녁/간식)
meal_items      : id, meal_log_id, food_name, serving, kcal, carbs_g, protein_g, fat_g
inbody_records  : id, user_id, measured_at, weight_kg, skeletal_muscle_kg, body_fat_kg, body_fat_pct
posts           : id, user_id, content, image_url, created_at      (v1.0)
comments        : id, post_id, user_id, content, created_at        (v1.0)
```
- `set_logs`는 반드시 **세트 단위**로 저장 (예측 모델 피처 추출용: 주간 부위별 볼륨, 점진적 과부하 추이).
- 모든 테이블에 RLS(Row Level Security) 적용.

## 식단 데이터 소스
- 1차: **식약처 식품영양성분 DB** (공공데이터포털, 무료) → 자체 테이블로 임포트해서 음식 검색 제공.
- 2차: FatSecret Platform API (해외 음식 보조).
- 직접 입력(음식명 + 칼로리/탄단지 수기 입력) 기능 필수.

## 인바디 예측 모델
- **v0.3 (룰베이스, 에너지 수지 모델)**:
  - 입력: 최근 30일 평균 섭취 칼로리, 추정 소비 칼로리(기초대사량 Mifflin-St Jeor + 운동 볼륨 기반 활동량), 일평균 단백질 섭취, 주간 총 운동 볼륨.
  - 출력: 다음 측정 시점의 **변화량(Δ체중, Δ골격근량, Δ체지방량)** 예측. 절대값이 아닌 변화량 예측.
  - 체지방 변화 ≈ 칼로리 수지 누적 / 7700kcal. 근육 변화는 볼륨·단백질·칼로리 잉여 여부로 보수적 추정.
- **추후 (데이터 축적 후)**: 전체 사용자 풀 cross-sectional 회귀(LightGBM). 개인별 시계열 모델은 데이터 포인트 부족(월 1회 측정)으로 부적합.
- 예측 로직은 `lib/prediction/` 모듈로 격리해 교체 용이하게.

## 로드맵
- **v0.1 (현재 목표)**: 회원가입/로그인, 루틴 CRUD, 운동 수행 모드(세트 기록 + 휴식 타이머 + Wake Lock), 운동 기록 조회/캘린더.
- **v0.2**: 식단 기록 (식약처 DB 검색 + 직접 입력), 일일 칼로리·탄단지 집계 대시보드.
- **v0.3**: 인바디 수기 입력, 추이 차트, 룰베이스 예측 표시.
- **v1.0**: 커뮤니티 (인증 피드, 이미지 업로드, 댓글). 사용자 확보 전까지 보류.

## 개발 원칙
- 모바일 우선 디자인 (운동 수행 화면은 한 손 조작 가능하게, 큰 터치 타겟).
- 커밋은 기능 단위로 작게.
- 환경 변수(.env.local): SUPABASE_URL, SUPABASE_ANON_KEY 등. 절대 커밋하지 않는다.
- 한국어 UI.
