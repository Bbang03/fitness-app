export type BodyPart = '가슴' | '등' | '어깨' | '삼두' | '이두' | '하체' | '복근' | '유산소';
export type Equipment = '맨몸' | '덤벨' | '바벨' | '머신' | '케이블';
export type RecordType = 'weight_reps' | 'reps_only' | 'time';

export interface Exercise {
  id: string;
  name: string;
  body_part: BodyPart;
  equipment: Equipment;
  record_type: RecordType;
}

export const EXERCISE_DB: Exercise[] = [
  // ── 가슴 ─────────────────────────────────────────────────────────────────
  { id: 'c01', name: '바벨 벤치프레스',          body_part: '가슴', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'c02', name: '인클라인 바벨 벤치프레스',  body_part: '가슴', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'c03', name: '디클라인 바벨 벤치프레스',  body_part: '가슴', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'c04', name: '클로즈그립 벤치프레스',     body_part: '가슴', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'c05', name: '랜드마인 체스트 프레스',    body_part: '가슴', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'c06', name: '덤벨 벤치프레스',           body_part: '가슴', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'c07', name: '인클라인 덤벨 벤치프레스',  body_part: '가슴', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'c08', name: '디클라인 덤벨 벤치프레스',  body_part: '가슴', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'c09', name: '덤벨 플라이',               body_part: '가슴', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'c10', name: '인클라인 덤벨 플라이',      body_part: '가슴', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'c11', name: '케이블 크로스오버',          body_part: '가슴', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'c12', name: '로우 케이블 플라이',         body_part: '가슴', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'c13', name: '하이 케이블 플라이',         body_part: '가슴', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'c14', name: '펙덱 플라이',               body_part: '가슴', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'c15', name: '체스트 프레스 머신',         body_part: '가슴', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'c16', name: '스미스 머신 벤치프레스',     body_part: '가슴', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'c17', name: '푸시업',                    body_part: '가슴', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'c18', name: '인클라인 푸시업',            body_part: '가슴', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'c19', name: '디클라인 푸시업',            body_part: '가슴', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'c20', name: '다이아몬드 푸시업',          body_part: '가슴', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'c21', name: '딥스',                      body_part: '가슴', equipment: '맨몸',  record_type: 'reps_only' },

  // ── 등 ───────────────────────────────────────────────────────────────────
  { id: 'b01', name: '바벨 데드리프트',           body_part: '등', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'b02', name: '루마니안 데드리프트',        body_part: '등', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'b03', name: '스모 데드리프트',            body_part: '등', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'b04', name: '바벨 로우',                 body_part: '등', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'b05', name: '펜들레이 로우',              body_part: '등', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'b06', name: '티바 로우',                 body_part: '등', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'b07', name: '랙풀',                      body_part: '등', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'b08', name: '덤벨 로우',                 body_part: '등', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'b09', name: '덤벨 풀오버',               body_part: '등', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'b10', name: '랫풀다운',                  body_part: '등', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'b11', name: '리버스그립 랫풀다운',        body_part: '등', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'b12', name: '시티드 케이블 로우',         body_part: '등', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'b13', name: '스트레이트암 풀다운',         body_part: '등', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'b14', name: '싱글암 케이블 로우',          body_part: '등', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'b15', name: '케이블 풀오버',              body_part: '등', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'b16', name: '케이블 Y 레이즈',            body_part: '등', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'b17', name: '머신 로우',                 body_part: '등', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'b18', name: '풀업',                      body_part: '등', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'b19', name: '친업',                      body_part: '등', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'b20', name: '인버티드 로우',              body_part: '등', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'b21', name: '하이퍼익스텐션',             body_part: '등', equipment: '맨몸',  record_type: 'reps_only' },

  // ── 어깨 ─────────────────────────────────────────────────────────────────
  { id: 's01', name: '바벨 오버헤드 프레스',       body_part: '어깨', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 's02', name: '바벨 업라이트 로우',          body_part: '어깨', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 's03', name: '바벨 쉬러그',               body_part: '어깨', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 's04', name: '랜드마인 프레스',             body_part: '어깨', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 's05', name: '덤벨 오버헤드 프레스',        body_part: '어깨', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 's06', name: '아놀드 프레스',              body_part: '어깨', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 's07', name: '덤벨 레터럴 레이즈',          body_part: '어깨', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 's08', name: '덤벨 프론트 레이즈',          body_part: '어깨', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 's09', name: '리어 델트 덤벨 플라이',       body_part: '어깨', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 's10', name: '덤벨 쉬러그',               body_part: '어깨', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 's11', name: '케이블 레터럴 레이즈',        body_part: '어깨', equipment: '케이블', record_type: 'weight_reps' },
  { id: 's12', name: '케이블 프론트 레이즈',        body_part: '어깨', equipment: '케이블', record_type: 'weight_reps' },
  { id: 's13', name: '케이블 페이스 풀',            body_part: '어깨', equipment: '케이블', record_type: 'weight_reps' },
  { id: 's14', name: '숄더 프레스 머신',            body_part: '어깨', equipment: '머신',  record_type: 'weight_reps' },
  { id: 's15', name: '머신 레터럴 레이즈',          body_part: '어깨', equipment: '머신',  record_type: 'weight_reps' },
  { id: 's16', name: '리어 델트 머신',             body_part: '어깨', equipment: '머신',  record_type: 'weight_reps' },
  { id: 's17', name: '파이크 푸시업',              body_part: '어깨', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 's18', name: '핸드스탠드 푸시업',           body_part: '어깨', equipment: '맨몸',  record_type: 'reps_only' },

  // ── 삼두 ─────────────────────────────────────────────────────────────────
  { id: 't01', name: '스컬크러셔',                body_part: '삼두', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 't02', name: 'JM 프레스',                body_part: '삼두', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 't03', name: '덤벨 오버헤드 트라이셉스 익스텐션', body_part: '삼두', equipment: '덤벨', record_type: 'weight_reps' },
  { id: 't04', name: '덤벨 킥백',                body_part: '삼두', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 't05', name: '덤벨 스컬크러셔',           body_part: '삼두', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 't06', name: '케이블 트라이셉스 푸시다운', body_part: '삼두', equipment: '케이블', record_type: 'weight_reps' },
  { id: 't07', name: '케이블 로프 푸시다운',       body_part: '삼두', equipment: '케이블', record_type: 'weight_reps' },
  { id: 't08', name: '케이블 오버헤드 트라이셉스 익스텐션', body_part: '삼두', equipment: '케이블', record_type: 'weight_reps' },
  { id: 't09', name: '리버스그립 케이블 푸시다운', body_part: '삼두', equipment: '케이블', record_type: 'weight_reps' },
  { id: 't10', name: '케이블 크로스바디 익스텐션', body_part: '삼두', equipment: '케이블', record_type: 'weight_reps' },
  { id: 't11', name: '머신 트라이셉스 익스텐션',   body_part: '삼두', equipment: '머신',  record_type: 'weight_reps' },
  { id: 't12', name: '트라이셉스 딥스',            body_part: '삼두', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 't13', name: '벤치 딥스',                body_part: '삼두', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 't14', name: '클로즈그립 푸시업',          body_part: '삼두', equipment: '맨몸',  record_type: 'reps_only' },

  // ── 이두 ─────────────────────────────────────────────────────────────────
  { id: 'bi01', name: '바벨 컬',                 body_part: '이두', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'bi02', name: 'EZ바 컬',                body_part: '이두', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'bi03', name: '프리처 컬',               body_part: '이두', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'bi04', name: '스파이더 컬',              body_part: '이두', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'bi05', name: '리버스 바벨 컬',           body_part: '이두', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'bi06', name: '바벨 21s',               body_part: '이두', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'bi07', name: '덤벨 컬',                 body_part: '이두', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'bi08', name: '해머 컬',                 body_part: '이두', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'bi09', name: '인클라인 덤벨 컬',         body_part: '이두', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'bi10', name: '컨센트레이션 컬',          body_part: '이두', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'bi11', name: '크로스 바디 해머 컬',      body_part: '이두', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'bi12', name: '케이블 컬',               body_part: '이두', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'bi13', name: '케이블 해머 컬',           body_part: '이두', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'bi14', name: '리버스 케이블 컬',         body_part: '이두', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'bi15', name: '머신 컬',                 body_part: '이두', equipment: '머신',  record_type: 'weight_reps' },

  // ── 하체 ─────────────────────────────────────────────────────────────────
  { id: 'l01', name: '바벨 백스쿼트',            body_part: '하체', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'l02', name: '바벨 프론트스쿼트',         body_part: '하체', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'l03', name: '힙 쓰러스트',              body_part: '하체', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'l04', name: '바벨 루마니안 데드리프트',   body_part: '하체', equipment: '바벨',  record_type: 'weight_reps' },
  { id: 'l05', name: '고블렛 스쿼트',            body_part: '하체', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'l06', name: '불가리안 스플릿 스쿼트',    body_part: '하체', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'l07', name: '덤벨 런지',               body_part: '하체', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'l08', name: '워킹 런지',               body_part: '하체', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'l09', name: '덤벨 스텝업',             body_part: '하체', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'l10', name: '싱글레그 데드리프트',       body_part: '하체', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'l11', name: '스모 덤벨 스쿼트',         body_part: '하체', equipment: '덤벨',  record_type: 'weight_reps' },
  { id: 'l12', name: '케틀벨 스윙',             body_part: '하체', equipment: '덤벨',  record_type: 'reps_only' },
  { id: 'l13', name: '레그 프레스',             body_part: '하체', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'l14', name: '레그 익스텐션',            body_part: '하체', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'l15', name: '라잉 레그 컬',            body_part: '하체', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'l16', name: '시티드 레그 컬',           body_part: '하체', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'l17', name: '스탠딩 카프 레이즈',        body_part: '하체', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'l18', name: '시티드 카프 레이즈',        body_part: '하체', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'l19', name: '해크 스쿼트',             body_part: '하체', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'l20', name: '스미스 머신 스쿼트',        body_part: '하체', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'l21', name: '레그 애브덕션',            body_part: '하체', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'l22', name: '레그 애덕션',             body_part: '하체', equipment: '머신',  record_type: 'weight_reps' },
  { id: 'l23', name: '글루트 브리지',            body_part: '하체', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'l24', name: '박스 점프',               body_part: '하체', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'l25', name: '점프 스쿼트',             body_part: '하체', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'l26', name: '월 싯',                  body_part: '하체', equipment: '맨몸',  record_type: 'time' },

  // ── 복근 ─────────────────────────────────────────────────────────────────
  { id: 'ab01', name: '크런치',                 body_part: '복근', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'ab02', name: '싯업',                   body_part: '복근', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'ab03', name: '레그레이즈',              body_part: '복근', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'ab04', name: '행잉 레그레이즈',          body_part: '복근', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'ab05', name: '행잉 니레이즈',            body_part: '복근', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'ab06', name: '플랭크',                  body_part: '복근', equipment: '맨몸',  record_type: 'time' },
  { id: 'ab07', name: '사이드 플랭크',            body_part: '복근', equipment: '맨몸',  record_type: 'time' },
  { id: 'ab08', name: '마운틴 클라이머',          body_part: '복근', equipment: '맨몸',  record_type: 'time' },
  { id: 'ab09', name: 'AB 롤아웃',              body_part: '복근', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'ab10', name: '러시안 트위스트',          body_part: '복근', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'ab11', name: 'V업',                    body_part: '복근', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'ab12', name: '바이시클 크런치',          body_part: '복근', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'ab13', name: '토 투 바',               body_part: '복근', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'ab14', name: '윈드실드 와이퍼',          body_part: '복근', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'ab15', name: '드래곤 플래그',            body_part: '복근', equipment: '맨몸',  record_type: 'reps_only' },
  { id: 'ab16', name: '케이블 크런치',            body_part: '복근', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'ab17', name: '케이블 우드찹',            body_part: '복근', equipment: '케이블', record_type: 'weight_reps' },
  { id: 'ab18', name: '덤벨 사이드 벤드',         body_part: '복근', equipment: '덤벨',  record_type: 'weight_reps' },

  // ── 유산소 ───────────────────────────────────────────────────────────────
  { id: 'ca01', name: '트레드밀 달리기',           body_part: '유산소', equipment: '머신', record_type: 'time' },
  { id: 'ca02', name: '실내 사이클',              body_part: '유산소', equipment: '머신', record_type: 'time' },
  { id: 'ca03', name: '일립티컬',                body_part: '유산소', equipment: '머신', record_type: 'time' },
  { id: 'ca04', name: '로잉 머신',               body_part: '유산소', equipment: '머신', record_type: 'time' },
  { id: 'ca05', name: '스테어 클라이머',           body_part: '유산소', equipment: '머신', record_type: 'time' },
  { id: 'ca06', name: '어시트 바이크',             body_part: '유산소', equipment: '머신', record_type: 'time' },
  { id: 'ca07', name: '스키 에르그',              body_part: '유산소', equipment: '머신', record_type: 'time' },
  { id: 'ca08', name: '줄넘기',                  body_part: '유산소', equipment: '맨몸', record_type: 'time' },
  { id: 'ca09', name: '버피',                    body_part: '유산소', equipment: '맨몸', record_type: 'reps_only' },
  { id: 'ca10', name: '점핑잭',                  body_part: '유산소', equipment: '맨몸', record_type: 'reps_only' },
  { id: 'ca11', name: '배틀 로프',               body_part: '유산소', equipment: '맨몸', record_type: 'time' },
  { id: 'ca12', name: '하이 니',                 body_part: '유산소', equipment: '맨몸', record_type: 'time' },
  { id: 'ca13', name: '야외 달리기',              body_part: '유산소', equipment: '맨몸', record_type: 'time' },
  { id: 'ca14', name: '수영',                    body_part: '유산소', equipment: '맨몸', record_type: 'time' },
  { id: 'ca15', name: '스프린트',                body_part: '유산소', equipment: '맨몸', record_type: 'time' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function searchExercises(
  query: string,
  bodyPart?: BodyPart | null,
  equipment?: Equipment | null,
): Exercise[] {
  const q = query.trim().toLowerCase();
  return EXERCISE_DB.filter((ex) => {
    if (bodyPart && ex.body_part !== bodyPart) return false;
    if (equipment && ex.equipment !== equipment) return false;
    if (q && !ex.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function findExerciseByName(name: string): Exercise | undefined {
  return EXERCISE_DB.find((ex) => ex.name === name);
}

export const BODY_PARTS: BodyPart[] = ['가슴', '등', '어깨', '삼두', '이두', '하체', '복근', '유산소'];
export const EQUIPMENTS: Equipment[] = ['맨몸', '덤벨', '바벨', '머신', '케이블'];

export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  weight_reps: '무게+횟수',
  reps_only:   '횟수',
  time:        '시간',
};
