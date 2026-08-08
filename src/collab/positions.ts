import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

export const MAX_POSITION_LENGTH = 128;

export interface PositionedFrame {
    id: string;
    position: string;
}

export const comparePositionedFrames = (a: PositionedFrame, b: PositionedFrame): number => {
    if (a.position < b.position) return -1;
    if (a.position > b.position) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
};

export const isValidPosition = (position: unknown): position is string => {
    if (
        typeof position !== 'string'
        || position.length < 2
        || position.length > MAX_POSITION_LENGTH
        || !/^[0-9A-Za-z]+$/.test(position)
    ) {
        return false;
    }

    try {
        // The package validates the integer part and forbidden trailing zero.
        // The character allowlist above closes a validation gap in fractional
        // suffixes, where unknown characters otherwise alias to the zero digit.
        generateKeyBetween(position, null);
        return true;
    } catch {
        return false;
    }
};

export const generateInitialPositions = (count: number): string[] => {
    if (!Number.isSafeInteger(count) || count < 0) {
        throw new RangeError('Frame count must be a non-negative safe integer');
    }
    return generateNKeysBetween(null, null, count);
};

export const generatePositionsInGap = (
    before: string | null,
    after: string | null,
    count: number
): string[] => generateNKeysBetween(before, after, count);

/**
 * Assign positions only to the frames being moved. `desiredIds` must contain
 * those frames as one contiguous group, which matches the timeline's drag API.
 */
export const positionsForMovedFrames = (
    currentFrames: PositionedFrame[],
    desiredIds: string[],
    movedIds: Iterable<string>
): Map<string, string> => {
    const currentById = new Map(currentFrames.map(frame => [frame.id, frame]));
    const movedSet = new Set(movedIds);
    const desiredMovedIds = desiredIds.filter(id => movedSet.has(id));
    if (desiredMovedIds.length === 0) return new Map();
    if (desiredMovedIds.length !== movedSet.size) {
        throw new Error('Desired frame order does not contain every moved frame');
    }

    const firstMovedIndex = desiredIds.findIndex(id => movedSet.has(id));
    let lastMovedIndex = firstMovedIndex;
    for (let index = desiredIds.length - 1; index >= 0; index--) {
        if (movedSet.has(desiredIds[index])) {
            lastMovedIndex = index;
            break;
        }
    }
    if (lastMovedIndex - firstMovedIndex + 1 !== desiredMovedIds.length) {
        throw new Error('Moved frames must be contiguous in the desired order');
    }

    const beforeId = desiredIds[firstMovedIndex - 1] ?? null;
    const afterId = desiredIds[lastMovedIndex + 1] ?? null;
    const before = beforeId ? currentById.get(beforeId)?.position ?? null : null;
    const after = afterId ? currentById.get(afterId)?.position ?? null : null;
    const positions = generatePositionsInGap(before, after, desiredMovedIds.length);

    return new Map(desiredMovedIds.map((id, index) => [id, positions[index]]));
};

/**
 * Reconciles an arbitrary desired order while preserving a longest ordered
 * subsequence of existing frame positions. Only moved and newly-added frames
 * receive new keys.
 */
export const positionsForDesiredOrder = (
    currentFrames: PositionedFrame[],
    desiredIds: string[]
): Map<string, string> => {
    if (new Set(desiredIds).size !== desiredIds.length) {
        throw new Error('Desired frame order contains duplicate ids');
    }

    const orderedCurrent = [...currentFrames].sort(comparePositionedFrames);
    const currentById = new Map(orderedCurrent.map(frame => [frame.id, frame]));
    const rankById = new Map(orderedCurrent.map((frame, rank) => [frame.id, rank]));
    const existingDesired = desiredIds.filter(id => rankById.has(id));

    // O(n²) is intentionally simple and bounded by MAX_COLLAB_FRAMES (128).
    const lengths = existingDesired.map(() => 1);
    const previous = existingDesired.map(() => -1);
    let bestIndex = -1;
    existingDesired.forEach((id, index) => {
        const rank = rankById.get(id)!;
        for (let candidate = 0; candidate < index; candidate++) {
            if (
                rankById.get(existingDesired[candidate])! < rank
                && lengths[candidate] + 1 > lengths[index]
            ) {
                lengths[index] = lengths[candidate] + 1;
                previous[index] = candidate;
            }
        }
        if (bestIndex === -1 || lengths[index] > lengths[bestIndex]) bestIndex = index;
    });

    const anchors = new Set<string>();
    while (bestIndex >= 0) {
        anchors.add(existingDesired[bestIndex]);
        bestIndex = previous[bestIndex];
    }

    const assigned = new Map<string, string>();
    let segmentStart = 0;
    let before: string | null = null;
    for (let index = 0; index <= desiredIds.length; index++) {
        const id = desiredIds[index];
        const isBoundary = index === desiredIds.length || anchors.has(id);
        if (!isBoundary) continue;

        const after = index < desiredIds.length
            ? currentById.get(id)?.position ?? null
            : null;
        const segmentIds = desiredIds.slice(segmentStart, index);
        const positions = generatePositionsInGap(before, after, segmentIds.length);
        segmentIds.forEach((segmentId, segmentIndex) => {
            assigned.set(segmentId, positions[segmentIndex]);
        });
        if (index < desiredIds.length) {
            before = after;
            segmentStart = index + 1;
        }
    }

    return assigned;
};
