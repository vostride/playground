import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingTotal,
  flights,
  searchFlights,
  unavailableSeats,
  validatePassenger,
} from './flights.ts';

test('flight searches provide repeatable complete routes with realistic journey lengths', () => {
  assert.equal(flights.length, 4560);
  assert.equal(new Set(flights.map((f) => f.id)).size, 4560);
  const transatlantic = searchFlights('JFK', 'LHR', '2026-11-10');
  assert.equal(transatlantic.length, 12);
  assert.deepEqual(transatlantic, searchFlights('JFK', 'LHR', '2026-11-10'));
  assert.ok(
    transatlantic.filter((f) => f.stops === 0).every((f) => f.duration > 350 && f.duration < 500),
  );
  assert.equal(searchFlights('JFK', 'JFK', '2026-11-10').length, 0);
});
test('round trip fare upgrades apply to every traveler and both flights', () => {
  const outbound = searchFlights('JFK', 'LHR', '2026-11-10')[0],
    inbound = searchFlights('LHR', 'JFK', '2026-11-17')[0];
  assert.equal(
    bookingTotal(outbound, inbound, 'standard', 3),
    (outbound.price + inbound.price + 128) * 3,
  );
  assert.equal(bookingTotal(outbound, undefined, 'flex', 2), (outbound.price + 128) * 2);
  assert.equal(bookingTotal(outbound, undefined, 'light', 1), outbound.price);
});
test('passenger validation rejects incomplete, impossible and underage dates', () => {
  const passenger = { firstName: 'Alex', lastName: 'Morgan', birthDate: '1992-06-15' };
  assert.equal(validatePassenger(passenger), '');
  assert.ok(validatePassenger({ ...passenger, firstName: ' ' }));
  for (const birthDate of ['', '2026-12-01', '1992-02-31', '2016-01-01', '1899-12-31'])
    assert.ok(validatePassenger({ ...passenger, birthDate }));
  assert.equal(validatePassenger({ ...passenger, birthDate: '2000-02-29' }), '');
});
test('seat occupancy stays deterministic and leaves enough seats for a party', () => {
  const occupied = unavailableSeats('JFK-LHR-0');
  assert.deepEqual(occupied, unavailableSeats('JFK-LHR-0'));
  assert.equal(new Set(occupied).size, occupied.length);
  assert.ok(occupied.length > 0 && occupied.length < 66);
  assert.ok(occupied.every((seat) => /^(?:[1-9]|1[0-2])[A-F]$/.test(seat)));
});
