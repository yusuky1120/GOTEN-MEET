export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'switching'
  | 'disconnecting'
  | 'error';

export type TokenResponse = {
  serverUrl: string;
  participantToken: string;
  participantIdentity: string;
};

export type TokenErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

export type ParticipantSummary = {
  identity: string;
  name: string;
  isLocal: boolean;
};

export type VoiceSessionSnapshot = {
  status: ConnectionStatus;
  roomName: string;
  participantIdentity: string | null;
  participants: ParticipantSummary[];
  muted: boolean;
  needsAudioStart: boolean;
  errorMessage: string | null;
  voiceParticipantCount: number;
  proximityAudioEnabled: boolean;
  nearestDistance: number | null;
  nearestVolume: number | null;
  staleParticipantCount: number;
};

export type VoiceSessionListener = (snapshot: VoiceSessionSnapshot) => void;
