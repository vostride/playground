import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addFlightDays,
  bookingTotal,
  flightDateWindow,
  flightMonthDays,
  flights,
  formatFlightDate,
  isValidFlightDate,
  searchFlights,
  unavailableSeats,
  validatePassenger,
} from './flights.ts';

test('travel dates accept past and distant years while rejecting impossible calendar dates', () => {
  for (const date of ['0001-01-01', '1980-02-29', '2032-02-29', '2400-02-29', '9999-12-31']) {
    assert.equal(isValidFlightDate(date), true, date);
    const options = searchFlights('JFK', 'LHR', date);
    assert.equal(options.length, 12, date);
    assert.deepEqual(options, searchFlights('JFK', 'LHR', date));
    assert.ok(options.every((flight) => Number.isFinite(flight.price) && flight.price > 0));
  }
  for (const date of [
    '',
    '0000-01-01',
    '2026-02-29',
    '2100-02-29',
    '2026-04-31',
    '2032-13-01',
    '2032-2-1',
  ]) {
    assert.equal(isValidFlightDate(date), false, date);
    assert.deepEqual(searchFlights('JFK', 'LHR', date), []);
  }
});

test('date navigation handles leap years, year crossings and the complete ISO year range', () => {
  assert.equal(flightMonthDays('0096-02'), 29);
  assert.equal(flightMonthDays('1900-02'), 28);
  assert.equal(flightMonthDays('2000-02'), 29);
  assert.equal(flightMonthDays('2032-02'), 29);
  assert.equal(addFlightDays('2032-02-28', 1), '2032-02-29');
  assert.equal(addFlightDays('2032-02-29', 1), '2032-03-01');
  assert.equal(addFlightDays('2099-12-31', 1), '2100-01-01');
  assert.equal(addFlightDays('0001-01-01', -3), '0001-01-01');
  assert.equal(addFlightDays('9999-12-31', 7), '9999-12-31');
  assert.throws(() => addFlightDays('2031-02-29', 1), RangeError);
});

test('price calendar windows keep seven unique consecutive dates at both year boundaries', () => {
  assert.deepEqual(flightDateWindow('0001-01-01'), [
    '0001-01-01',
    '0001-01-02',
    '0001-01-03',
    '0001-01-04',
    '0001-01-05',
    '0001-01-06',
    '0001-01-07',
  ]);
  assert.deepEqual(flightDateWindow('9999-12-31'), [
    '9999-12-25',
    '9999-12-26',
    '9999-12-27',
    '9999-12-28',
    '9999-12-29',
    '9999-12-30',
    '9999-12-31',
  ]);
  for (const date of ['0001-01-03', '0096-02-29', '2032-03-01', '9999-12-29']) {
    const days = flightDateWindow(date);
    assert.equal(new Set(days).size, 7);
    assert.ok(days.includes(date));
    assert.ok(days.every(isValidFlightDate));
    assert.ok(days.slice(1).every((day, index) => day === addFlightDays(days[index], 1)));
  }
});

test('date-only labels preserve skipped calendar dates and early years', () => {
  const fullDate: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  };
  assert.equal(formatFlightDate('2011-12-30', fullDate), 'Friday, December 30, 2011');
  assert.equal(formatFlightDate('0001-01-01', fullDate), 'Monday, January 1, 1');
  assert.equal(
    formatFlightDate('0096-02-29', { year: 'numeric', month: 'long', day: 'numeric' }),
    'February 29, 96',
  );
});

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
