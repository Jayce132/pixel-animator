export type CrossingProposalResolution = 'local-proceeds' | 'remote-proceeds';

export const resolveCrossingProposals = (
    localProposalId: string,
    remoteProposalId: string
): CrossingProposalResolution => (
    localProposalId < remoteProposalId ? 'local-proceeds' : 'remote-proceeds'
);
