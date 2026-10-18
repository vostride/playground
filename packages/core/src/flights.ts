export interface Airport {
  code: string;
  city: string;
  name: string;
  country: string;
}
export const airports: Airport[] = [
  {
    code: 'JFK',
    city: 'New York',
    name: 'John F. Kennedy International',
    country: 'United States',
  },
  {
    code: 'SFO',
    city: 'San Francisco',
    name: 'San Francisco International',
    country: 'United States',
  },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International', country: 'United States' },
  { code: 'LHR', city: 'London', name: 'Heathrow', country: 'United Kingdom' },
  { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle', country: 'France' },
  { code: 'AMS', city: 'Amsterdam', name: 'Schiphol', country: 'Netherlands' },
  { code: 'FCO', city: 'Rome', name: 'Leonardo da Vinci', country: 'Italy' },
  { code: 'BCN', city: 'Barcelona', name: 'Josep Tarradellas Barcelona–El Prat', country: 'Spain' },
  { code: 'LIS', city: 'Lisbon', name: 'Humberto Delgado', country: 'Portugal' },
  { code: 'CPH', city: 'Copenhagen', name: 'Copenhagen Airport', country: 'Denmark' },
  { code: 'HND', city: 'Tokyo', name: 'Haneda', country: 'Japan' },
  { code: 'SIN', city: 'Singapore', name: 'Changi', country: 'Singapore' },
  { code: 'SYD', city: 'Sydney', name: 'Kingsford Smith', country: 'Australia' },
  { code: 'DXB', city: 'Dubai', name: 'Dubai International', country: 'United Arab Emirates' },
  { code: 'DEL', city: 'Delhi', name: 'Indira Gandhi International', country: 'India' },
  {
    code: 'BOM',
    city: 'Mumbai',
    name: 'Chhatrapati Shivaji Maharaj International',
    country: 'India',
  },
  { code: 'SEA', city: 'Seattle', name: 'Seattle–Tacoma International', country: 'United States' },
  { code: 'ORD', city: 'Chicago', name: 'O’Hare International', country: 'United States' },
  { code: 'YVR', city: 'Vancouver', name: 'Vancouver International', country: 'Canada' },
  { code: 'MEX', city: 'Mexico City', name: 'Benito Juárez International', country: 'Mexico' },
];
export const airlines = ['Meridian Air', 'Coast Airways', 'Altitude', 'Atlas Pacific'];
export interface Flight {
  id: string;
  from: string;
  to: string;
  airline: string;
  number: string;
  departure: string;
  arrival: string;
  duration: number;
  stops: number;
  price: number;
  aircraft: string;
}
let state = 19840211;
const random = () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 4294967296;
};
const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const coordinates: Record<string, [number, number]> = {
  JFK: [40.6, -73.8],
  SFO: [37.6, -122.4],
  LAX: [33.9, -118.4],
  LHR: [51.5, -0.5],
  CDG: [49, 2.6],
  AMS: [52.3, 4.8],
  FCO: [41.8, 12.3],
  BCN: [41.3, 2.1],
  LIS: [38.8, -9.1],
  CPH: [55.6, 12.7],
  HND: [35.5, 139.8],
  SIN: [1.4, 104],
  SYD: [-33.9, 151.2],
  DXB: [25.3, 55.4],
  DEL: [28.6, 77.1],
  BOM: [19.1, 72.9],
  SEA: [47.4, -122.3],
  ORD: [42, -87.9],
  YVR: [49.2, -123.2],
  MEX: [19.4, -99.1],
};
const routeMinutes = (from: string, to: string) => {
  const [lat1, lon1] = coordinates[from].map((v) => (v * Math.PI) / 180),
    [lat2, lon2] = coordinates[to].map((v) => (v * Math.PI) / 180);
  const h =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return Math.round((((2 * 6371 * Math.asin(Math.sqrt(h))) / 850) * 60 + 35) / 5) * 5;
};
export const flights: Flight[] = airports.flatMap((from, a) =>
  airports
    .filter((to) => to.code !== from.code)
    .flatMap((to, b) =>
      Array.from({ length: 12 }, (_, i) => {
        const stops = i < 5 ? 0 : i % 3 === 0 ? 2 : 1;
        const duration =
          routeMinutes(from.code, to.code) + Math.floor(random() * 5) * 5 + stops * 95;
        const departure = 330 + i * 75 + Math.floor(random() * 4) * 5;
        return {
          id: `${from.code}-${to.code}-${i}`,
          from: from.code,
          to: to.code,
          airline: airlines[i % 4],
          number: `${['MD', 'CA', 'AL', 'AP'][i % 4]} ${100 + a * 71 + b * 3 + i}`,
          departure: clock(departure),
          arrival: clock(departure + duration),
          duration,
          stops,
          price: 98 + Math.floor(random() * 230) + Math.floor(duration * 0.55),
          aircraft: duration > 360 ? 'Boeing 787-9' : 'Airbus A321neo',
        };
      }),
    ),
);
export type Fare = 'light' | 'standard' | 'flex';
export const fares: { id: Fare; name: string; extra: number; features: string[] }[] = [
  {
    id: 'light',
    name: 'Light',
    extra: 0,
    features: ['Personal item', 'Carry-on bag', 'Changes unavailable'],
  },
  {
    id: 'standard',
    name: 'Standard',
    extra: 64,
    features: [
      'Personal item + carry-on',
      '1 checked bag · 23 kg',
      'Seat selection included',
      'Changes for $40',
    ],
  },
  {
    id: 'flex',
    name: 'Flex',
    extra: 128,
    features: [
      'Personal item + carry-on',
      '2 checked bags · 23 kg',
      'Seat selection included',
      'Free changes and cancellation',
    ],
  },
];
export const airport = (code: string) => airports.find((a) => a.code === code)!;
export const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
export const durationLabel = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
/** Calendar dates use the complete four-digit ISO year range, without a booking window. */
export function isValidFlightDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '0001-01-01') return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
export function addFlightDays(date: string, days: number) {
  if (!isValidFlightDate(date)) throw new RangeError('Enter a valid calendar date.');
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  if (parsed.getUTCFullYear() < 1) return '0001-01-01';
  if (parsed.getUTCFullYear() > 9999) return '9999-12-31';
  return parsed.toISOString().slice(0, 10);
}
export function flightMonthDays(month: string) {
  if (!isValidFlightDate(`${month}-01`)) throw new RangeError('Enter a valid calendar month.');
  const parsed = new Date(`${month}-01T00:00:00Z`);
  parsed.setUTCMonth(parsed.getUTCMonth() + 1, 0);
  return parsed.getUTCDate();
}
/** A travel date is a calendar day, not an instant in the device's timezone. */
export function formatFlightDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    ...options,
    timeZone: 'UTC',
  });
}
/** Keep seven distinct days visible, shifting the window at the ISO year boundaries. */
export function flightDateWindow(date: string) {
  const end = addFlightDays(addFlightDays(date, -3), 6);
  const start = addFlightDays(end, -6);
  return Array.from({ length: 7 }, (_, offset) => addFlightDays(start, offset));
}
export function datePrice(date: string) {
  return ((Number(date.slice(-2)) * 13) % 49) - 24;
}
export function searchFlights(from: string, to: string, date: string) {
  if (!isValidFlightDate(date)) return [];
  return flights
    .filter((f) => f.from === from && f.to === to)
    .map((f) => ({ ...f, price: f.price + datePrice(date) }));
}
export function bookingTotal(
  outbound: Flight,
  inbound: Flight | undefined,
  fare: Fare,
  passengers: number,
) {
  return (
    (outbound.price +
      (inbound?.price ?? 0) +
      (fares.find((f) => f.id === fare)?.extra ?? 0) * (inbound ? 2 : 1)) *
    passengers
  );
}
export interface Passenger {
  firstName: string;
  lastName: string;
  birthDate: string;
}
export function validatePassenger(passenger: Passenger) {
  if (!passenger.firstName.trim() || !passenger.lastName.trim())
    return 'Enter the passenger’s first and last name.';
  const parsed = new Date(passenger.birthDate);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(passenger.birthDate) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== passenger.birthDate ||
    passenger.birthDate < '1900-01-01' ||
    passenger.birthDate > '2014-10-18'
  )
    return 'Enter a valid date of birth. Travelers must be at least 12 on October 18, 2026.';
  return '';
}
export interface Booking {
  reference: string;
  outbound: Flight;
  inbound?: Flight;
  departureDate: string;
  returnDate: string;
  fare: Fare;
  passengers: Passenger[];
  seats: string[];
  returnSeats: string[];
  email: string;
  total: number;
  status: 'confirmed' | 'cancelled';
}
export const sampleBooking: Booking = {
  reference: 'WL6P2K',
  outbound: searchFlights('JFK', 'LHR', '2026-11-10')[0],
  departureDate: '2026-11-10',
  returnDate: '',
  fare: 'standard',
  passengers: [{ firstName: 'Alex', lastName: 'Morgan', birthDate: '1992-06-15' }],
  seats: ['4B'],
  returnSeats: [],
  email: 'alex@example.com',
  total: 0,
  status: 'confirmed',
};
sampleBooking.total = bookingTotal(sampleBooking.outbound, undefined, 'standard', 1);
export function unavailableSeats(flightId: string) {
  const salt = Array.from(flightId).reduce((a, c) => a + c.charCodeAt(0), 0);
  return Array.from({ length: 72 }, (_, i) => i)
    .filter((i) => (i * 17 + salt) % 11 < 3)
    .map((i) => `${Math.floor(i / 6) + 1}${'ABCDEF'[i % 6]}`);
}
