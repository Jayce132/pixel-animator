import { describe, expect, it } from 'vitest';
import { resolveAdmissionClaims } from './admission';
import type { AdmissionClaim } from './admission';

const claim = (instanceId: string, role: AdmissionClaim['role'], epoch = 0): AdmissionClaim => ({
    instanceId,
    role,
    epoch
});

describe('two-person admission', () => {
    it('keeps an established host and admits the lowest simultaneous pending guest', () => {
        const result = resolveAdmissionClaims([
            claim('host', 'host'),
            claim('pending-z', 'pending'),
            claim('pending-a', 'pending')
        ]);
        expect(result.host?.instanceId).toBe('host');
        expect(result.guest?.instanceId).toBe('pending-a');
        expect(result.overflow.map(entry => entry.instanceId)).toEqual(['pending-z']);
    });

    it('elects deterministic roles when every participant is pending', () => {
        const result = resolveAdmissionClaims([
            claim('c', 'pending'),
            claim('a', 'pending'),
            claim('b', 'pending')
        ]);
        expect(result.host?.instanceId).toBe('a');
        expect(result.guest?.instanceId).toBe('b');
        expect(result.overflow[0].instanceId).toBe('c');
    });

    it('reconciles two hosts by epoch and then instance id', () => {
        expect(resolveAdmissionClaims([
            claim('original', 'host', 0),
            claim('higher-epoch', 'host', 1)
        ])).toMatchObject({
            host: { instanceId: 'higher-epoch' },
            guest: { instanceId: 'original' }
        });
        expect(resolveAdmissionClaims([
            claim('z', 'host', 2),
            claim('a', 'host', 2)
        ]).host?.instanceId).toBe('a');
    });
});
