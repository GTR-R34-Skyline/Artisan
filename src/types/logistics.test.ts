import { describe, expect, it } from 'vitest';
import { getNextCourierStatus } from './logistics';

describe('getNextCourierStatus', () => {
  it('starts courier work from dispatched', () => {
    expect(getNextCourierStatus('dispatched')).toBe('picked_up');
  });

  it('advances one stage at a time', () => {
    expect(getNextCourierStatus('picked_up')).toBe('in_transit');
    expect(getNextCourierStatus('in_transit')).toBe('at_destination_hub');
    expect(getNextCourierStatus('at_destination_hub')).toBe('out_for_delivery');
    expect(getNextCourierStatus('out_for_delivery')).toBe('delivered');
  });

  it('does not allow skipping or setting dispatched', () => {
    expect(getNextCourierStatus('picked_up')).not.toBe('delivered');
    expect(getNextCourierStatus('picked_up')).not.toBe('dispatched');
    expect(getNextCourierStatus('delivered')).toBeNull();
    expect(getNextCourierStatus('unknown')).toBeNull();
  });
});
