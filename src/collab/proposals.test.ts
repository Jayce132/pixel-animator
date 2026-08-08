import { describe, expect, it } from 'vitest';
import { resolveCrossingProposals } from './proposals';

describe('wholesale proposal arbitration', () => {
    it('always lets the lexicographically lower crossing proposal proceed', () => {
        expect(resolveCrossingProposals('a-proposal', 'z-proposal')).toBe('local-proceeds');
        expect(resolveCrossingProposals('z-proposal', 'a-proposal')).toBe('remote-proceeds');
    });
});
