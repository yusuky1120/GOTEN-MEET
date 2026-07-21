export type ValidationFailure = {
  code: 'VALIDATION_ERROR';
  message: string;
};

const ROOM_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SessionRequest = {
  participantName: string;
};

export type VoiceTokenRequest = {
  roomName: string;
  participantName: string;
  participantIdentity: string;
};

function asObject(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

function parseParticipantName(
  record: Record<string, unknown>,
): string | ValidationFailure {
  if (typeof record.participantName !== 'string') {
    return {
      code: 'VALIDATION_ERROR',
      message: 'participantName is required and must be a string',
    };
  }

  const participantName = record.participantName.trim();
  if (participantName.length < 1 || participantName.length > 32) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'participantName must be between 1 and 32 characters after trimming',
    };
  }
  if (CONTROL_CHARS.test(participantName)) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'participantName must not contain control characters',
    };
  }
  return participantName;
}

function parseRoomName(record: Record<string, unknown>): string | ValidationFailure {
  if (typeof record.roomName !== 'string') {
    return {
      code: 'VALIDATION_ERROR',
      message: 'roomName is required and must be a string',
    };
  }

  const roomName = record.roomName;
  if (roomName.length < 1 || roomName.length > 64) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'roomName must be between 1 and 64 characters',
    };
  }
  if (!ROOM_NAME_PATTERN.test(roomName)) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'roomName contains invalid characters',
    };
  }
  return roomName;
}

export function parseSessionRequest(body: unknown): SessionRequest | ValidationFailure {
  const record = asObject(body);
  if (!record) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Request body must be a JSON object',
    };
  }

  const participantName = parseParticipantName(record);
  if (typeof participantName !== 'string') return participantName;

  return { participantName };
}

export function parseVoiceTokenRequest(body: unknown): VoiceTokenRequest | ValidationFailure {
  const record = asObject(body);
  if (!record) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Request body must be a JSON object',
    };
  }

  const roomName = parseRoomName(record);
  if (typeof roomName !== 'string') return roomName;

  const participantName = parseParticipantName(record);
  if (typeof participantName !== 'string') return participantName;

  if (typeof record.participantIdentity !== 'string') {
    return {
      code: 'VALIDATION_ERROR',
      message: 'participantIdentity is required and must be a string',
    };
  }
  const participantIdentity = record.participantIdentity.trim();
  if (!UUID_PATTERN.test(participantIdentity)) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'participantIdentity must be a UUID',
    };
  }

  return { roomName, participantName, participantIdentity };
}
