import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addDaysToDateKey,
  dateKeyFromSearch,
  isDateOnlyKey,
  localDateKey,
  timestampToLocalDateKey,
  workoutDateKey,
} from './utils';

test('date-only keys validate as calendar values and cross month/year boundaries', () => {
  assert.equal(isDateOnlyKey('2026-02-28'), true);
  assert.equal(isDateOnlyKey('2026-02-30'), false);
  assert.equal(isDateOnlyKey('2026-2-28'), false);
  assert.equal(addDaysToDateKey('2026-08-31', 1), '2026-09-01');
  assert.equal(addDaysToDateKey('2026-12-31', 1), '2027-01-01');
});

test('meal date query values are applied as date-only keys', () => {
  assert.equal(
    dateKeyFromSearch(
      '?date=2026-09-14',
      '2026-09-15',
    ),
    '2026-09-14',
  );
  assert.equal(
    dateKeyFromSearch(
      '?date=2026-02-30',
      '2026-09-15',
    ),
    '2026-09-15',
  );
});

test('timestamp calendar keys use local date components instead of the UTC string prefix', () => {
  const timestamp = '2026-09-14T15:30:00.000Z';

  assert.equal(
    timestampToLocalDateKey(timestamp),
    localDateKey(new Date(timestamp)),
  );
});

test('workout calendar keys prefer the persisted date-only value', () => {
  assert.equal(
    workoutDateKey(
      '2026-09-15',
      '2026-09-14T15:30:00.000Z',
    ),
    '2026-09-15',
  );
  assert.equal(
    workoutDateKey(
      undefined,
      '2026-09-14T15:30:00.000Z',
    ),
    timestampToLocalDateKey(
      '2026-09-14T15:30:00.000Z',
    ),
  );
});
