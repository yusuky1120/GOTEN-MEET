export type HouseChatMessage = {
  id: string;
  participantIdentity: string;
  participantName: string;
  text: string;
  sentAt: number;
  own: boolean;
};

export type IncomingHouseChatPayload = {
  id: string;
  participantIdentity: string;
  participantName: string;
  text: string;
  sentAt: number;
  attributes: Record<string, string> | undefined;
};
