export const ROOM_ID_LENGTH = 12;
export const ROOM_KEY_LENGTH = 16;
const ROOM_VALUE_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface CollabRoomLink {
    roomId: string;
    key: string;
    mode: 'live' | 'copy';
}

const isValidRoomPart = (value: string | null, length: number): value is string => (
    value !== null && value.length === length && ROOM_VALUE_PATTERN.test(value)
);

export const parseCollabHash = (hash: string = window.location.hash): CollabRoomLink | null => {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const roomId = params.get('room');
    const key = params.get('key');
    const rawMode = params.get('mode');
    if (!isValidRoomPart(roomId, ROOM_ID_LENGTH) || !isValidRoomPart(key, ROOM_KEY_LENGTH)) {
        return null;
    }
    if (rawMode !== null && rawMode !== 'copy') return null;
    return { roomId, key, mode: rawMode === 'copy' ? 'copy' : 'live' };
};

export const buildCollabLink = (room: CollabRoomLink): string => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams({ room: room.roomId, key: room.key });
    if (room.mode === 'copy') params.set('mode', 'copy');
    url.hash = params.toString();
    return url.toString();
};
