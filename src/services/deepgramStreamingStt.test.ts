import { describe, expect, it } from 'vitest';
import { buildDeepgramWebSocketProtocols } from './deepgramStreamingStt';

const SAMPLE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

/** Mirrors browser WebSocket subprotocol validation (RFC 6455 token: no spaces). */
const assertBrowserSubprotocolsValid = (protocols: string[]): void => {
  for (const protocol of protocols) {
    if (/\s/.test(protocol)) {
      throw new Error(`Invalid WebSocket subprotocol (contains space): "${protocol}"`);
    }
  }
};

describe('buildDeepgramWebSocketProtocols', () => {
  it('returns bearer scheme and JWT as separate subprotocols', () => {
    expect(buildDeepgramWebSocketProtocols(SAMPLE_JWT)).toEqual(['bearer', SAMPLE_JWT]);
  });

  it('does not produce a single subprotocol containing a space', () => {
    const protocols = buildDeepgramWebSocketProtocols(SAMPLE_JWT);
    for (const protocol of protocols) {
      expect(protocol).not.toMatch(/\s/);
    }
    expect(protocols.join(' ')).not.toBe(`Bearer ${SAMPLE_JWT}`);
    expect(() => assertBrowserSubprotocolsValid([`Bearer ${SAMPLE_JWT}`])).toThrow(/space/i);
    expect(() => assertBrowserSubprotocolsValid(protocols)).not.toThrow();
  });

  it('uses the Deepgram browser auth shape (bearer + jwt), not Authorization header text', () => {
    const protocols = buildDeepgramWebSocketProtocols(SAMPLE_JWT);
    expect(protocols[0]).toBe('bearer');
    expect(protocols[1]).toBe(SAMPLE_JWT);
    expect(protocols).not.toContain(`Bearer ${SAMPLE_JWT}`);
  });
});
