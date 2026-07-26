import {
  RemoteSeatOccupancy,
  createSeatKey,
  findSeatKeyAtPosition,
  selectSeatOwner,
  type SeatDescriptor,
} from '../src/game/seatOccupancy.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const seats: SeatDescriptor[] = [
  { kind: 'chair', x: 100, y: 200 },
  { kind: 'sofa', x: 300, y: 400 },
  { kind: 'sofa', x: 300, y: 440 },
];

const chairKey = createSeatKey(seats[0]!);
const sofaTopKey = createSeatKey(seats[1]!);
const sofaBottomKey = createSeatKey(seats[2]!);

assert(findSeatKeyAtPosition(seats, 100, 197) === chairKey, 'seated chair position matches');
assert(findSeatKeyAtPosition(seats, 102, 199) === chairKey, 'small network drift is tolerated');
assert(findSeatKeyAtPosition(seats, 100, 205) === null, 'standing position is not a seat claim');
assert(findSeatKeyAtPosition(seats, 300, 397) === sofaTopKey, 'first sofa slot matches');
assert(findSeatKeyAtPosition(seats, 300, 437) === sofaBottomKey, 'second sofa slot matches');

const occupancy = new RemoteSeatOccupancy();
occupancy.update(seats, { participantIdentity: 'remote-b', x: 100, y: 197 });
assert(occupancy.isOccupied(chairKey), 'remote seated participant occupies chair');
assert(occupancy.occupants(chairKey)[0] === 'remote-b', 'occupant identity is tracked');

occupancy.update(seats, { participantIdentity: 'remote-b', x: 80, y: 180 });
assert(!occupancy.isOccupied(chairKey), 'moving away releases chair');

occupancy.update(seats, { participantIdentity: 'remote-b', x: 300, y: 397 });
occupancy.update(seats, { participantIdentity: 'remote-c', x: 300, y: 397 });
assert(occupancy.occupants(sofaTopKey).length === 2, 'simultaneous claims are observed');
assert(
  selectSeatOwner(['remote-c', 'remote-b', 'remote-c']) === 'remote-b',
  'simultaneous claims resolve deterministically',
);

occupancy.remove('remote-b');
assert(occupancy.occupants(sofaTopKey).length === 1, 'participant removal releases only its claim');
occupancy.clear();
assert(!occupancy.isOccupied(sofaTopKey), 'clear releases all seats');
assert(selectSeatOwner([]) === null, 'empty claim set has no owner');

console.log('check-seat-occupancy: ok');
