import { describe, expect, it } from 'vitest';
import { isCompletedOrderStatus, validateReviewDraft } from './productReviews.service';

describe('isCompletedOrderStatus', () => {
  it('treats delivered and fulfilled aliases as completed purchases', () => {
    expect(isCompletedOrderStatus('delivered')).toBe(true);
    expect(isCompletedOrderStatus('Delivered')).toBe(true);
    expect(isCompletedOrderStatus('completed')).toBe(true);
    expect(isCompletedOrderStatus('complete')).toBe(true);
    expect(isCompletedOrderStatus('fulfilled')).toBe(true);
  });

  it('rejects cancelled, open, and missing orders', () => {
    expect(isCompletedOrderStatus('cancelled')).toBe(false);
    expect(isCompletedOrderStatus('canceled')).toBe(false);
    expect(isCompletedOrderStatus('shipped')).toBe(false);
    expect(isCompletedOrderStatus('processing')).toBe(false);
    expect(isCompletedOrderStatus('pending')).toBe(false);
    expect(isCompletedOrderStatus('refunded')).toBe(false);
    expect(isCompletedOrderStatus(null)).toBe(false);
    expect(isCompletedOrderStatus('')).toBe(false);
  });
});

describe('validateReviewDraft', () => {
  it('requires a 1-5 rating and a written note', () => {
    expect(validateReviewDraft({ rating: 5, comment: 'Beautiful finish and careful making.' })).toBeNull();
    expect(validateReviewDraft({ rating: 0, comment: 'Beautiful finish and careful making.' })).toBe('Please choose a rating from 1 to 5.');
    expect(validateReviewDraft({ rating: 6, comment: 'Beautiful finish and careful making.' })).toBe('Please choose a rating from 1 to 5.');
    expect(validateReviewDraft({ rating: 4, comment: 'short' })).toBe('Please write a short note about the piece.');
    expect(validateReviewDraft({ rating: 4, comment: '   ' })).toBe('Please write a short note about the piece.');
    expect(validateReviewDraft({ rating: 4, comment: 'a'.repeat(2001) })).toBe('Please keep your review under 2,000 characters.');
  });
});
