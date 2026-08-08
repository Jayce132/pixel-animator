export type AdmissionRole = 'pending' | 'host' | 'guest';

export interface AdmissionClaim {
    role: AdmissionRole;
    epoch: number;
    instanceId: string;
}

export interface AdmissionResult {
    host: AdmissionClaim | null;
    guest: AdmissionClaim | null;
    overflow: AdmissionClaim[];
}

const claimPriority = (left: AdmissionClaim, right: AdmissionClaim): number => {
    if (left.epoch !== right.epoch) return right.epoch - left.epoch;
    return left.instanceId.localeCompare(right.instanceId);
};

export const resolveAdmissionClaims = (claims: AdmissionClaim[]): AdmissionResult => {
    const hosts = claims.filter(claim => claim.role === 'host').sort(claimPriority);
    const guests = claims.filter(claim => claim.role === 'guest').sort(claimPriority);
    const pending = claims.filter(claim => claim.role === 'pending')
        .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
    const host = hosts[0] ?? pending.shift() ?? guests.shift() ?? null;
    const guest = guests.find(claim => claim.instanceId !== host?.instanceId)
        ?? pending.find(claim => claim.instanceId !== host?.instanceId)
        ?? hosts.find(claim => claim.instanceId !== host?.instanceId)
        ?? null;
    const accepted = new Set([host?.instanceId, guest?.instanceId].filter(Boolean));
    return {
        host,
        guest,
        overflow: claims.filter(claim => !accepted.has(claim.instanceId))
    };
};
