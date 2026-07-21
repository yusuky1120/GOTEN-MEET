import { AccessToken, TrackSource } from 'livekit-server-sdk';

export type TokenGrantKind = 'presence' | 'voice';

export type CreateParticipantTokenInput = {
  apiKey: string;
  apiSecret: string;
  roomName: string;
  participantName: string;
  participantIdentity: string;
  grantKind: TokenGrantKind;
};

export type CreateParticipantTokenResult = {
  participantToken: string;
  participantIdentity: string;
};

export async function createParticipantToken(
  input: CreateParticipantTokenInput,
): Promise<CreateParticipantTokenResult> {
  const token = new AccessToken(input.apiKey, input.apiSecret, {
    identity: input.participantIdentity,
    name: input.participantName,
    ttl: '1h',
  });

  if (input.grantKind === 'presence') {
    token.addGrant({
      roomJoin: true,
      room: input.roomName,
      canPublish: false,
      canPublishData: true,
      canSubscribe: true,
    });
  } else {
    token.addGrant({
      roomJoin: true,
      room: input.roomName,
      canPublish: true,
      canPublishData: false,
      canSubscribe: true,
      canPublishSources: [TrackSource.MICROPHONE],
    });
  }

  const participantToken = await token.toJwt();

  return {
    participantToken,
    participantIdentity: input.participantIdentity,
  };
}
