import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ then: undefined })),
      })),
    })),
    auth: {
      getUser: vi.fn(),
    },
    functions: {
      invoke: invokeMock,
    },
  },
}));

describe('enhanceImageClientSide', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('invokes the server-side enhancement function instead of contacting Gemini from the browser', async () => {
    invokeMock.mockResolvedValue({
      data: { enhancedImageUrl: 'https://example.com/enhanced.jpg' },
      error: null,
    });

    const { enhanceImageClientSide } = await import('./imageEnhancement');
    const result = await enhanceImageClientSide('prod-123', 'https://example.com/original.jpg');

    expect(invokeMock).toHaveBeenCalledWith('enhance-image', {
      body: {
        productId: 'prod-123',
        originalImageUrl: 'https://example.com/original.jpg',
      },
    });
    expect(result).toBe('https://example.com/enhanced.jpg');
  });
});
