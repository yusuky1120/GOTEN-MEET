export type SeatDescriptor = {
  kind: string;
  x: number;
  y: number;
};

export type ParticipantPosition = {
  participantIdentity: string;
  x: number;
  y: number;
};

/** HouseScene places a seated avatar three pixels above the seat's anchor. */
export const SEATED_PLAYER_Y_OFFSET = -3;
const DEFAULT_SEAT_MATCH_TOLERANCE = 3;

export function createSeatKey(seat: SeatDescriptor): string {
  return `${seat.kind}:${seat.x}:${seat.y}`;
}

export function findSeatKeyAtPosition(
  seats: readonly SeatDescriptor[],
  x: number,
  y: number,
  tolerance = DEFAULT_SEAT_MATCH_TOLERANCE,
): string | null {
  for (const seat of seats) {
    if (
      Math.abs(x - seat.x) <= tolerance &&
      Math.abs(y - (seat.y + SEATED_PLAYER_Y_OFFSET)) <= tolerance
    ) {
      return createSeatKey(seat);
    }
  }
  return null;
}

/**
 * Resolve simultaneous seat claims identically on every client.
 * LiveKit participant identities are unique within the Presence Room, so the
 * lexicographically smallest identity wins once every claimant is observed.
 */
export function selectSeatOwner(identities: readonly string[]): string | null {
  const candidates = [...new Set(identities.map((value) => value.trim()).filter(Boolean))];
  if (candidates.length === 0) return null;
  candidates.sort();
  return candidates[0] ?? null;
}

export class RemoteSeatOccupancy {
  private readonly seatByParticipant = new Map<string, string>();

  update(seats: readonly SeatDescriptor[], position: ParticipantPosition): void {
    const seatKey = findSeatKeyAtPosition(seats, position.x, position.y);
    if (seatKey) {
      this.seatByParticipant.set(position.participantIdentity, seatKey);
    } else {
      this.seatByParticipant.delete(position.participantIdentity);
    }
  }

  remove(participantIdentity: string): void {
    this.seatByParticipant.delete(participantIdentity);
  }

  clear(): void {
    this.seatByParticipant.clear();
  }

  occupants(seatKey: string): string[] {
    const occupants: string[] = [];
    for (const [participantIdentity, claimedSeatKey] of this.seatByParticipant) {
      if (claimedSeatKey === seatKey) occupants.push(participantIdentity);
    }
    return occupants;
  }

  isOccupied(seatKey: string): boolean {
    return this.occupants(seatKey).length > 0;
  }
}

let localParticipantIdentity: string | null = null;

export function setLocalParticipantIdentity(participantIdentity: string | null): void {
  const normalized = participantIdentity?.trim() ?? '';
  localParticipantIdentity = normalized || null;
}

export function getLocalParticipantIdentity(): string | null {
  return localParticipantIdentity;
}
