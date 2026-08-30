import { describe, expect, it } from 'vitest';
import {
  createInitialProfileState,
  mergeProfileState,
  normalizeIndianPhone,
} from './profileSchema';

describe('profile conversation state merging', () => {
  it('preserves a known name when a later turn only provides location', () => {
    const firstTurn = mergeProfileState(
      createInitialProfileState('en', true),
      { name: 'Mohan Kumar', location: 'Chennai' },
      {},
      true,
    );

    const secondTurn = mergeProfileState(
      firstTurn,
      { name: null, location: 'Chennai', craft: null, experienceYears: null },
      {},
      true,
    );

    expect(secondTurn.name).toBe('Mohan Kumar');
    expect(secondTurn.location).toBe('Chennai');
  });

  it('does not create profile updates from empty semantic output', () => {
    const current = mergeProfileState(
      createInitialProfileState('en'),
      { name: 'Ravi', craft: 'pottery', experienceYears: 18 },
      {},
    );

    expect(mergeProfileState(current, {}, {}, false)).toEqual(current);
  });

  it('normalizes Indian phone numbers without changing other fields', () => {
    expect(normalizeIndianPhone('09962926301')).toBe('+919962926301');
    expect(normalizeIndianPhone('+91 99629 26301')).toBe('+919962926301');
  });
});
