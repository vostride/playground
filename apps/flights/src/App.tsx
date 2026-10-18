import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Globe2,
  Luggage,
  MapPin,
  Plane,
  Plus,
  Minus,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import {
  PlaygroundBanner,
  BrandMark,
  useSessionState,
  Button,
  Input,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@playground/ui';
import {
  addFlightDays as addDays,
  flightDateWindow,
  flightMonthDays,
  formatFlightDate as formatDate,
  isValidFlightDate,
  airport,
  airports,
  airlines,
  bookingTotal,
  durationLabel,
  fares,
  money,
  sampleBooking,
  searchFlights,
  unavailableSeats,
  validatePassenger,
  type Booking,
  type Fare,
  type Flight,
  type Passenger,
} from '@playground/core/flights';

const bugs = [
  {
    id: 'fare-total',
    label: 'Incorrect fare total',
    description: 'A fare upgrade is deliberately omitted from the checkout total.',
  },
  {
    id: 'seat-conflict',
    label: 'Occupied seat selectable',
    description: 'Already occupied seats can deliberately be selected.',
  },
];
type SearchData = {
  from: string;
  to: string;
  departure: string;
  returnDate: string;
  roundTrip: boolean;
  passengers: number;
};
const initialSearch: SearchData = {
  from: 'JFK',
  to: 'LHR',
  departure: '2026-11-10',
  returnDate: '2026-11-17',
  roundTrip: true,
  passengers: 1,
};
type View = 'home' | 'results' | 'fare' | 'seats' | 'checkout' | 'confirmation' | 'bookings';

function AirportPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const options = airports.filter((a) =>
    `${a.code} ${a.city} ${a.name}`.toLowerCase().includes(query.toLowerCase()),
  );
  useEffect(() => {
    const dismiss = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return (
    <div className="airport-field" ref={ref}>
      <label htmlFor={`airport-${label}`}>{label}</label>
      <div className="airport-input">
        <MapPin size={17} />
        <Input
          className="airport-control h-10 rounded-none border-0 bg-transparent dark:bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
          id={`airport-${label}`}
          role="combobox"
          aria-expanded={open}
          aria-controls={`options-${label}`}
          aria-autocomplete="list"
          aria-activedescendant={
            open && options[active] ? `${label}-${options[active].code}` : undefined
          }
          value={open ? query : `${airport(value).city} (${value})`}
          onClick={() => {
            if (!open) {
              setOpen(true);
              setQuery('');
              setActive(0);
            }
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
            setActive(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              e.currentTarget.blur();
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, options.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            }
            if (e.key === 'Enter' && open && options[active]) {
              e.preventDefault();
              onChange(options[active].code);
              setOpen(false);
              e.currentTarget.blur();
            }
          }}
        />
      </div>
      {open && (
        <ul
          className="airport-options"
          role="listbox"
          id={`options-${label}`}
          aria-label={`${label} airports`}
        >
          {options.length ? (
            options.map((a, i) => (
              <li
                id={`${label}-${a.code}`}
                key={a.code}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'active' : ''}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(a.code);
                  setOpen(false);
                }}
              >
                <span className="airport-code">{a.code}</span>
                <span>
                  <strong>{a.city}</strong>
                  <small>{a.name}</small>
                </span>
                <span>{a.country}</span>
              </li>
            ))
          ) : (
            <li>No airports match “{query}”.</li>
          )}
        </ul>
      )}
    </div>
  );
}
function DateRangePicker({
  value,
  onChange,
}: {
  value: SearchData;
  onChange: (s: SearchData) => void;
}) {
  const [open, setOpen] = useState(false),
    [month, setMonth] = useState(value.departure.slice(0, 7)),
    [selecting, setSelecting] = useState<'departure' | 'returnDate'>('departure'),
    [year, setYear] = useState(value.departure.slice(0, 4)),
    [exactDate, setExactDate] = useState(value.departure),
    [dateError, setDateError] = useState('');
  const showMonth = (next: string) => {
    setMonth(next);
    setYear(next.slice(0, 4));
  };
  const selectPart = (part: 'departure' | 'returnDate') => {
    setSelecting(part);
    setExactDate(value[part]);
    setDateError('');
    showMonth(value[part].slice(0, 7));
  };
  const chooseDate = (date: string) => {
    if (!isValidFlightDate(date)) {
      setDateError('Enter a valid date in YYYY-MM-DD format.');
      return;
    }
    if (selecting === 'returnDate' && date < value.departure) {
      setDateError('Your return date must be on or after your departure.');
      return;
    }
    const next = {
      ...value,
      [selecting]: date,
      ...(selecting === 'departure' && date > value.returnDate
        ? { returnDate: addDays(date, 7) }
        : {}),
    };
    onChange(next);
    setDateError('');
    showMonth(date.slice(0, 7));
    if (selecting === 'departure' && value.roundTrip) {
      setSelecting('returnDate');
      setExactDate(next.returnDate);
    } else {
      setExactDate(date);
      setOpen(false);
    }
  };
  const first = new Date(`${month}-01T00:00:00Z`),
    days = flightMonthDays(month),
    start = (first.getUTCDay() + 6) % 7;
  return (
    <div className="date-field">
      <span className="field-label">Travel dates</span>
      <button
        type="button"
        className="plain picker-button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          selectPart('departure');
        }}
      >
        <CalendarDays size={17} />
        {formatDate(value.departure)}
        {value.roundTrip && ` – ${formatDate(value.returnDate)}`}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="calendar-popover">
          <div className="calendar-heading">
            <button
              type="button"
              className="icon-button"
              aria-label="Previous month"
              disabled={month === '0001-01'}
              onClick={() => showMonth(addDays(`${month}-01`, -1).slice(0, 7))}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="calendar-jump">
              <select
                aria-label="Calendar month"
                value={month.slice(5, 7)}
                onChange={(event) => showMonth(`${month.slice(0, 4)}-${event.target.value}`)}
              >
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index} value={String(index + 1).padStart(2, '0')}>
                    {formatDate(`2024-${String(index + 1).padStart(2, '0')}-01`, { month: 'long' })}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                aria-label="Calendar year"
                className="rounded-none border-x-0 border-t-0 border-b bg-transparent dark:bg-transparent px-0 shadow-none focus-visible:ring-0 h-9 w-[76px] px-2 text-[14px]"
                min={1}
                max={9999}
                value={year}
                onChange={(event) => {
                  const text = event.target.value;
                  setYear(text);
                  if (/^\d{1,4}$/.test(text) && Number(text) >= 1) {
                    setMonth(`${text.padStart(4, '0')}-${month.slice(5, 7)}`);
                  }
                }}
                onBlur={() => setYear(month.slice(0, 4))}
              />
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Next month"
              disabled={month === '9999-12'}
              onClick={() => showMonth(addDays(`${month}-${days}`, 1).slice(0, 7))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="date-tabs">
            <button
              type="button"
              className={selecting === 'departure' ? 'selected' : ''}
              onClick={() => selectPart('departure')}
            >
              Departure <b>{formatDate(value.departure)}</b>
            </button>
            {value.roundTrip && (
              <button
                type="button"
                className={selecting === 'returnDate' ? 'selected' : ''}
                onClick={() => selectPart('returnDate')}
              >
                Return <b>{formatDate(value.returnDate)}</b>
              </button>
            )}
          </div>
          <div className="calendar-grid">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <span key={`day-${i}`}>{d}</span>
            ))}
            {Array.from({ length: start }, (_, i) => (
              <span key={`space-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, '0')}`;
              return (
                <button
                  type="button"
                  key={date}
                  aria-label={formatDate(date, { month: 'long', day: 'numeric', year: 'numeric' })}
                  aria-pressed={
                    date === value.departure || (value.roundTrip && date === value.returnDate)
                  }
                  disabled={selecting === 'returnDate' && date < value.departure}
                  className={
                    date === value.departure || date === value.returnDate
                      ? 'date-selected'
                      : value.roundTrip && date > value.departure && date < value.returnDate
                        ? 'date-in-range'
                        : ''
                  }
                  onClick={() => chooseDate(date)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="calendar-exact-date">
            <label htmlFor="exact-travel-date">
              {selecting === 'departure' ? 'Departure date' : 'Return date'}
            </label>
            <div>
              <Input
                id="exact-travel-date"
                type="date"
                className="rounded-none border-x-0 border-t-0 border-b bg-transparent dark:bg-transparent px-0 shadow-none focus-visible:ring-0 h-10 min-w-0 flex-1 text-[14px]"
                min={selecting === 'returnDate' ? value.departure : '0001-01-01'}
                max="9999-12-31"
                value={exactDate}
                aria-invalid={Boolean(dateError)}
                aria-describedby={dateError ? 'calendar-date-error' : undefined}
                onChange={(event) => {
                  setExactDate(event.target.value);
                  setDateError('');
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => chooseDate(exactDate)}
              >
                Use date
              </Button>
            </div>
            {dateError && (
              <p id="calendar-date-error" role="alert">
                {dateError}
              </p>
            )}
          </div>
          <Button
            variant="default"
            className="button small full h-[42px] text-[14px] font-semibold"
            type="button"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
function PassengerPicker({ count, onChange }: { count: number; onChange: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="passenger-field">
      <span className="field-label">Travelers</span>
      <button
        type="button"
        className="plain picker-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Users size={17} />
        {count} adult{count > 1 ? 's' : ''}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="passenger-popover">
          <div>
            <strong>Adults</strong>
            <small>Age 12 and above</small>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Remove traveler"
            disabled={count === 1}
            onClick={() => onChange(count - 1)}
          >
            <Minus size={16} />
          </button>
          <b aria-live="polite">{count}</b>
          <button
            type="button"
            className="icon-button"
            aria-label="Add traveler"
            disabled={count === 6}
            onClick={() => onChange(count + 1)}
          >
            <Plus size={16} />
          </button>
          <button className="text-button" type="button" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
function FlightCard({ flight, choose }: { flight: Flight; choose: () => void }) {
  return (
    <div className="flight-card">
      <div className={`airline-logo airline-${airlines.indexOf(flight.airline)}`}>
        <Plane size={20} />
      </div>
      <div className="flight-detail">
        <div className="flight-airline">
          {flight.airline}{' '}
          <span>
            {flight.number} · {flight.aircraft}
          </span>
        </div>
        <div className="flight-route">
          <div>
            <strong>{flight.departure}</strong>
            <small>{flight.from}</small>
          </div>
          <div className="route-line">
            <span>{durationLabel(flight.duration)}</span>
            <div>
              <i />
              <Plane size={12} />
              <i />
            </div>
            <small>
              {flight.stops === 0
                ? 'Nonstop'
                : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}
            </small>
          </div>
          <div>
            <strong>{flight.arrival}</strong>
            <small>{flight.to}</small>
          </div>
        </div>
        <div className="flight-perks">
          <Luggage size={13} /> Carry-on included <span>·</span> Economy
        </div>
      </div>
      <div className="flight-price">
        <strong>{money(flight.price)}</strong>
        <span>per traveler, one way</span>
        <Button
          variant="default"
          className="button h-[42px] text-[14px] font-semibold"
          onClick={choose}
        >
          Select flight <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  const [search, setSearch] = useSessionState<SearchData>('wayline-search', initialSearch),
    [bookings, setBookings] = useSessionState<Booking[]>('wayline-bookings', [sampleBooking]);
  const [view, setView] = useState<View>('home'),
    [outbound, setOutbound] = useState<Flight>(),
    [inbound, setInbound] = useState<Flight>(),
    [leg, setLeg] = useState<'outbound' | 'return'>('outbound'),
    [fare, setFare] = useState<Fare>('standard');
  const [seats, setSeats] = useState<string[]>([]),
    [returnSeats, setReturnSeats] = useState<string[]>([]),
    [seatLeg, setSeatLeg] = useState<'outbound' | 'return'>('outbound');
  const [travelers, setTravelers] = useState<Passenger[]>([]),
    [email, setEmail] = useState(''),
    [step, setStep] = useState(0),
    [card, setCard] = useState({ name: '', number: '', expiry: '', cvc: '' }),
    [terms, setTerms] = useState(false);
  const [filter, setFilter] = useState({
      nonstop: false,
      maxPrice: 1000,
      airlines: [] as string[],
      departure: 'any',
    }),
    [sort, setSort] = useState('recommended'),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [confirmed, setConfirmed] = useState<Booking>(),
    [lookup, setLookup] = useState(''),
    [bookingFilter, setBookingFilter] = useState('all'),
    [cancelRef, setCancelRef] = useState(''),
    [editingSeat, setEditingSeat] = useState<Booking>();
  const activeBug = new URLSearchParams(location.search).get('bug');
  useEffect(() => {
    const titles: Record<View, string> = {
      home: 'Flight search',
      results: leg === 'outbound' ? 'Choose your flight' : 'Choose your return',
      fare: 'Choose your fare',
      seats: 'Choose your seats',
      checkout: 'Checkout',
      confirmation: 'Booking confirmed',
      bookings: 'My trips',
    };
    document.title = `${titles[view]} · Looking.com`;
    window.scrollTo(0, 0);
  }, [view, leg]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const go = (next: View) => {
    setError('');
    setView(next);
  };
  const runSearch = () => {
    if (search.from === search.to) {
      setError('Choose different departure and arrival airports.');
      return;
    }
    if (
      !isValidFlightDate(search.departure) ||
      (search.roundTrip && !isValidFlightDate(search.returnDate))
    ) {
      setError('Choose valid travel dates.');
      return;
    }
    if (search.roundTrip && search.returnDate < search.departure) {
      setError('Your return date must be on or after your departure.');
      return;
    }
    setError('');
    setOutbound(undefined);
    setInbound(undefined);
    setSeats([]);
    setReturnSeats([]);
    setLeg('outbound');
    setLoading(true);
    setView('results');
    setTimeout(() => setLoading(false), 650);
  };
  const routeFrom = leg === 'outbound' ? search.from : search.to,
    routeTo = leg === 'outbound' ? search.to : search.from,
    routeDate = leg === 'outbound' ? search.departure : search.returnDate;
  let results = searchFlights(routeFrom, routeTo, routeDate).filter(
    (f) =>
      (!filter.nonstop || f.stops === 0) &&
      f.price <= filter.maxPrice &&
      (!filter.airlines.length || filter.airlines.includes(f.airline)) &&
      (filter.departure === 'any' ||
        (filter.departure === 'morning'
          ? Number(f.departure.slice(0, 2)) < 12
          : Number(f.departure.slice(0, 2)) >= 12)),
  );
  results = results.sort((a, b) =>
    sort === 'cheapest'
      ? a.price - b.price
      : sort === 'fastest'
        ? a.duration - b.duration
        : sort === 'earliest'
          ? a.departure.localeCompare(b.departure)
          : a.price + a.duration / 3 + a.stops * 100 - (b.price + b.duration / 3 + b.stops * 100),
  );
  const chooseFlight = (flight: Flight) => {
    if (leg === 'outbound') {
      setOutbound(flight);
      if (search.roundTrip) {
        setLeg('return');
        setLoading(true);
        setTimeout(() => setLoading(false), 400);
      } else go('fare');
    } else {
      setInbound(flight);
      go('fare');
    }
  };
  const total = outbound
    ? bookingTotal(
        outbound,
        inbound,
        activeBug === 'fare-total' ? 'light' : fare,
        search.passengers,
      )
    : 0;
  const beginSeats = () => {
    setSeatLeg('outbound');
    setEditingSeat(undefined);
    go('seats');
  };
  const continueSeats = () => {
    if (seatLeg === 'outbound' && inbound) {
      setSeatLeg('return');
      return;
    }
    setTravelers(
      Array.from({ length: search.passengers }, () => ({
        firstName: '',
        lastName: '',
        birthDate: '',
      })),
    );
    setStep(0);
    go('checkout');
  };
  const nextCheckout = () => {
    if (step === 0) {
      const failure = travelers.map(validatePassenger).find(Boolean);
      if (failure) {
        setError(failure);
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Enter a valid email address for your booking confirmation.');
        return;
      }
    }
    if (step === 1) {
      if (
        !card.name.trim() ||
        card.number.replace(/\s/g, '') !== '4242424242424242' ||
        card.expiry !== '12/30' ||
        card.cvc !== '123'
      ) {
        setError(
          'Use the sample card: 4242 4242 4242 4242, expiry 12/30, security code 123, and enter a cardholder name.',
        );
        return;
      }
    }
    setError('');
    setStep(step + 1);
  };
  const confirmBooking = () => {
    if (!terms) {
      setError('Accept the fare conditions before confirming your booking.');
      return;
    }
    if (!outbound) return;
    setLoading(true);
    setError('');
    setTimeout(() => {
      const booking: Booking = {
        reference: `WL${(bookings.length + 241).toString(36).toUpperCase().padStart(4, '0')}`,
        outbound,
        inbound,
        departureDate: search.departure,
        returnDate: search.roundTrip ? search.returnDate : '',
        fare,
        passengers: travelers,
        seats,
        returnSeats,
        email,
        total,
        status: 'confirmed',
      };
      setBookings((prev) => [booking, ...prev]);
      setConfirmed(booking);
      setLoading(false);
      go('confirmation');
    }, 700);
  };
  const searchForm = (
    <div className="search-panel">
      <form
        className="search-box"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <div className="search-options">
          <label>
            <input
              type="radio"
              name="trip"
              checked={search.roundTrip}
              onChange={() => setSearch({ ...search, roundTrip: true })}
            />{' '}
            Round trip
          </label>
          <label>
            <input
              type="radio"
              name="trip"
              checked={!search.roundTrip}
              onChange={() => setSearch({ ...search, roundTrip: false })}
            />{' '}
            One way
          </label>
          <span>Economy</span>
        </div>
        <div className="search-fields">
          <AirportPicker
            label="From"
            value={search.from}
            onChange={(from) => setSearch({ ...search, from })}
          />
          <button
            className="swap-button"
            type="button"
            aria-label="Swap departure and arrival"
            onClick={() => setSearch({ ...search, from: search.to, to: search.from })}
          >
            <ArrowRightLeft size={17} />
          </button>
          <AirportPicker
            label="To"
            value={search.to}
            onChange={(to) => setSearch({ ...search, to })}
          />
          <DateRangePicker value={search} onChange={setSearch} />
          <PassengerPicker
            count={search.passengers}
            onChange={(passengers) => setSearch({ ...search, passengers })}
          />
          <Button
            variant="default"
            className="button search-submit h-11 px-5 text-[14px] font-semibold"
            type="submit"
          >
            <Search size={19} /> Search flights
          </Button>
        </div>
      </form>
    </div>
  );
  const summary = outbound && (
    <div className="trip-summary">
      <span className="section-label">Trip summary</span>
      <h3>
        {airport(search.from).city} <ArrowRight size={18} /> {airport(search.to).city}
      </h3>
      <div className="summary-route">
        <span>
          {formatDate(search.departure, { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
        <strong>
          {outbound.departure} – {outbound.arrival}
        </strong>
        <small>
          {outbound.airline} · {outbound.stops ? 'Connecting' : 'Nonstop'}
        </small>
      </div>
      {inbound && (
        <div className="summary-route">
          <span>
            {formatDate(search.returnDate, { weekday: 'short', month: 'short', day: 'numeric' })} ·
            Return
          </span>
          <strong>
            {inbound.departure} – {inbound.arrival}
          </strong>
          <small>
            {inbound.airline} · {inbound.stops ? 'Connecting' : 'Nonstop'}
          </small>
        </div>
      )}
      <div className="summary-row">
        <span>
          {search.passengers} traveler{search.passengers > 1 ? 's' : ''} ·{' '}
          {fares.find((f) => f.id === fare)?.name}
        </span>
        <strong>{money(total)}</strong>
      </div>
      <div className="summary-row total">
        <strong>Total</strong>
        <strong>
          {money(total)} <small>USD</small>
        </strong>
      </div>
    </div>
  );
  const currentSeatFlight = editingSeat
    ? seatLeg === 'outbound'
      ? editingSeat.outbound
      : editingSeat.inbound
    : seatLeg === 'outbound'
      ? outbound
      : inbound;
  const currentSeats = seatLeg === 'outbound' ? seats : returnSeats;
  const setCurrentSeats = seatLeg === 'outbound' ? setSeats : setReturnSeats;
  const seatCount = editingSeat ? editingSeat.passengers.length : search.passengers;
  return (
    <>
      <PlaygroundBanner app="Looking.com" bugs={bugs} />
      <header className="site-header">
        <div className="header-inner">
          <button className="wordmark" aria-label="Looking.com home" onClick={() => go('home')}>
            <span className="brand-mark">
              <BrandMark app="flights" size={24} className="size-6" />
            </span>
            Looking<span className="brand-dot">.com</span>
          </button>
          <nav aria-label="Main navigation">
            <button className={view !== 'bookings' ? 'nav-active' : ''} onClick={() => go('home')}>
              Flights
            </button>
            <button
              className={view === 'bookings' ? 'nav-active' : ''}
              onClick={() => go('bookings')}
            >
              My trips
            </button>
          </nav>
          <span className="header-locale">
            <Globe2 size={16} /> English · USD
          </span>
        </div>
      </header>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      <main>
        {view === 'home' && (
          <section className="home-search" aria-labelledby="flight-search-heading">
            <h1 id="flight-search-heading">Flight search</h1>
            {searchForm}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
          </section>
        )}
        {view === 'results' && (
          <>
            <section className="compact-search">{searchForm}</section>
            <section className="results-page">
              <div className="results-heading">
                <div>
                  <h1>
                    {airport(routeFrom).city} <ArrowRight size={28} /> {airport(routeTo).city}
                  </h1>
                  <p>
                    {formatDate(routeDate, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}{' '}
                    · {search.passengers} traveler{search.passengers > 1 ? 's' : ''} ·{' '}
                    {leg === 'outbound' ? 'Outbound flight' : 'Return flight'}
                  </p>
                </div>
                <button className="text-button" onClick={() => go('home')}>
                  <ArrowLeft size={15} /> Edit search
                </button>
              </div>
              {leg === 'return' && outbound && (
                <div className="selected-outbound">
                  <Check size={17} /> Outbound selected: {outbound.airline} · {outbound.departure}–
                  {outbound.arrival} · {money(outbound.price)}{' '}
                  <button className="text-button" onClick={() => setLeg('outbound')}>
                    Change
                  </button>
                </div>
              )}
              <div className="results-layout">
                <aside className="filters">
                  <div className="filter-title">
                    <h3>Filters</h3>
                    <button
                      className="text-button"
                      onClick={() =>
                        setFilter({
                          nonstop: false,
                          maxPrice: 1000,
                          airlines: [],
                          departure: 'any',
                        })
                      }
                    >
                      Reset
                    </button>
                  </div>
                  <fieldset>
                    <legend>Stops</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={filter.nonstop}
                        onChange={(e) => setFilter({ ...filter, nonstop: e.target.checked })}
                      />{' '}
                      Nonstop only
                    </label>
                  </fieldset>
                  <fieldset>
                    <legend>
                      Maximum price <b>{money(filter.maxPrice)}</b>
                    </legend>
                    <input
                      aria-label="Maximum flight price"
                      type="range"
                      min="100"
                      max="1000"
                      step="25"
                      value={filter.maxPrice}
                      onChange={(e) => setFilter({ ...filter, maxPrice: Number(e.target.value) })}
                    />
                    <div className="range-labels">
                      <span>$100</span>
                      <span>$1,000</span>
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Airlines</legend>
                    {airlines.map((a) => (
                      <label key={a}>
                        <input
                          type="checkbox"
                          checked={filter.airlines.includes(a)}
                          onChange={(e) =>
                            setFilter({
                              ...filter,
                              airlines: e.target.checked
                                ? [...filter.airlines, a]
                                : filter.airlines.filter((v) => v !== a),
                            })
                          }
                        />
                        {a}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset>
                    <legend>Departure time</legend>
                    <select
                      aria-label="Departure time"
                      value={filter.departure}
                      onChange={(e) => setFilter({ ...filter, departure: e.target.value })}
                    >
                      <option value="any">Any time</option>
                      <option value="morning">Morning · before 12 pm</option>
                      <option value="afternoon">Afternoon · after 12 pm</option>
                    </select>
                  </fieldset>
                  <div className="filter-note">
                    <p>Prices include taxes and fees.</p>
                  </div>
                </aside>
                <div className="flight-results">
                  <div className="price-calendar" aria-label="Price calendar">
                    {flightDateWindow(routeDate).map((date) => {
                      const price = Math.min(
                        ...searchFlights(routeFrom, routeTo, date).map((f) => f.price),
                      );
                      return (
                        <button
                          key={date}
                          className={date === routeDate ? 'selected' : ''}
                          onClick={() => {
                            setSearch({
                              ...search,
                              [leg === 'outbound' ? 'departure' : 'returnDate']: date,
                              ...(leg === 'outbound' && date > search.returnDate
                                ? { returnDate: addDays(date, 7) }
                                : {}),
                            });
                          }}
                          disabled={leg === 'return' && date < search.departure}
                        >
                          <span>{formatDate(date, { weekday: 'short', day: 'numeric' })}</span>
                          <strong>{money(price)}</strong>
                        </button>
                      );
                    })}
                  </div>
                  <div className="results-toolbar">
                    <span aria-live="polite">{results.length} flights found</span>
                    <label>
                      Sort by{' '}
                      <select value={sort} onChange={(e) => setSort(e.target.value)}>
                        <option value="recommended">Recommended</option>
                        <option value="cheapest">Lowest price</option>
                        <option value="fastest">Shortest duration</option>
                        <option value="earliest">Earliest departure</option>
                      </select>
                    </label>
                  </div>
                  {loading ? (
                    <div className="loading-panel" role="status">
                      <div className="spinner" />
                      Finding your way…
                    </div>
                  ) : results.length ? (
                    results.map((f) => (
                      <FlightCard key={f.id} flight={f} choose={() => chooseFlight(f)} />
                    ))
                  ) : (
                    <div className="empty-state">
                      <SlidersHorizontal size={32} />
                      <h3>No flights match your filters</h3>
                      <p>Try a higher budget or include connecting flights.</p>
                      <Button
                        variant="default"
                        className="button h-[42px] text-[14px] font-semibold"
                        onClick={() =>
                          setFilter({
                            nonstop: false,
                            maxPrice: 1000,
                            airlines: [],
                            departure: 'any',
                          })
                        }
                      >
                        Clear filters
                      </Button>
                    </div>
                  )}
                  <p className="results-footnote">
                    Prices are per traveler, one way. All fares include a carry-on bag.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
        {view === 'fare' && outbound && (
          <section className="flow-page">
            <button className="text-button back" onClick={() => go('results')}>
              <ArrowLeft size={16} /> Back to flights
            </button>
            <h1>Choose your fare</h1>
            <p className="page-subtitle">Your fare applies to all travelers and flights.</p>
            <div className="fare-layout">
              <div className="fare-cards">
                {fares.map((f) => (
                  <div className={`fare-card ${fare === f.id ? 'selected' : ''}`} key={f.id}>
                    <h2>{f.name}</h2>
                    <strong className="fare-price">
                      {f.extra ? `+${money(f.extra)}` : 'Included'}
                      <small>{f.extra ? 'per traveler, per flight' : 'in your flight price'}</small>
                    </strong>
                    <ul>
                      {f.features.map((feature) => (
                        <li key={feature}>
                          <Check size={16} />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant={fare === f.id ? 'default' : 'outline'}
                      className={`button h-[42px] text-[14px] font-semibold ${fare !== f.id ? 'secondary' : ''}`}
                      aria-pressed={fare === f.id}
                      onClick={() => setFare(f.id)}
                    >
                      {fare === f.id ? (
                        <>
                          <Check size={16} /> Selected
                        </>
                      ) : (
                        `Choose ${f.name}`
                      )}
                    </Button>
                  </div>
                ))}
              </div>
              {summary}
            </div>
            <div className="flow-actions">
              <Button
                variant="default"
                className="button h-[42px] text-[14px] font-semibold"
                onClick={beginSeats}
              >
                Continue to seats <ArrowRight size={16} />
              </Button>
            </div>
          </section>
        )}
        {view === 'seats' && currentSeatFlight && (
          <section className="flow-page">
            <button
              className="text-button back"
              onClick={() => (editingSeat ? go('bookings') : go('fare'))}
            >
              <ArrowLeft size={16} /> {editingSeat ? 'Back to my trips' : 'Back to fares'}
            </button>
            <h1>Choose your seats</h1>
            <p className="page-subtitle">
              {seatLeg === 'outbound' ? 'Outbound' : 'Return'} · {currentSeatFlight.from} to{' '}
              {currentSeatFlight.to} · {currentSeatFlight.aircraft}. Select {seatCount} seat
              {seatCount > 1 ? 's' : ''}.
            </p>
            <div className="seats-layout">
              <div className="seat-panel">
                <div className="seat-legend">
                  <span>
                    <i />
                    Available
                  </span>
                  <span>
                    <i className="chosen" />
                    Selected
                  </span>
                  <span>
                    <i className="occupied" />
                    Occupied
                  </span>
                </div>
                <div className="airplane">
                  <div className="cockpit">
                    <Plane size={26} />
                  </div>
                  <div className="seat-letters">
                    {'ABC DEF'.split('').map((l, i) => (
                      <b key={i}>{l}</b>
                    ))}
                  </div>
                  {Array.from({ length: 12 }, (_, row) => (
                    <div className="seat-row" key={row}>
                      {'ABC DEF'.split('').map((letter, i) => {
                        if (letter === ' ')
                          return (
                            <span className="row-number" key={i}>
                              {row + 1}
                            </span>
                          );
                        const seat = `${row + 1}${letter}`,
                          occupied =
                            unavailableSeats(currentSeatFlight.id).includes(seat) &&
                            !(
                              seatLeg === 'outbound' ? editingSeat?.seats : editingSeat?.returnSeats
                            )?.includes(seat),
                          selected = currentSeats.includes(seat);
                        return (
                          <button
                            key={seat}
                            aria-label={`Seat ${seat}${occupied ? ', occupied' : ''}${selected ? ', selected' : ''}`}
                            aria-pressed={selected}
                            disabled={occupied && activeBug !== 'seat-conflict'}
                            className={`seat ${selected ? 'chosen' : ''} ${occupied ? 'occupied' : ''}`}
                            onClick={() => {
                              if (selected) setCurrentSeats(currentSeats.filter((s) => s !== seat));
                              else if (currentSeats.length < seatCount)
                                setCurrentSeats([...currentSeats, seat]);
                              else
                                setToast(
                                  `You have selected ${seatCount} seat${seatCount > 1 ? 's' : ''}. Deselect one to choose another.`,
                                );
                            }}
                          >
                            {selected ? <Check size={13} /> : occupied ? <X size={10} /> : seat}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <aside className="seat-details">
                <h3>Your seats</h3>
                {Array.from({ length: seatCount }, (_, i) => (
                  <div className="summary-row" key={i}>
                    <span>
                      {editingSeat ? editingSeat.passengers[i].firstName : `Traveler ${i + 1}`}
                    </span>
                    <strong>{currentSeats[i] || 'Not selected'}</strong>
                  </div>
                ))}
                <p>
                  Seat selection is included. Window seats are A and F; aisle seats are C and D.
                </p>
                <Button
                  variant="default"
                  className="button full h-[42px] text-[14px] font-semibold"
                  disabled={currentSeats.length !== seatCount}
                  onClick={() => {
                    if (editingSeat) {
                      if (seatLeg === 'outbound' && editingSeat.inbound) {
                        setSeatLeg('return');
                        return;
                      }
                      setBookings((prev) =>
                        prev.map((b) =>
                          b.reference === editingSeat.reference ? { ...b, seats, returnSeats } : b,
                        ),
                      );
                      setEditingSeat(undefined);
                      setToast('Your seats have been updated.');
                      go('bookings');
                    } else continueSeats();
                  }}
                >
                  {editingSeat
                    ? seatLeg === 'outbound' && editingSeat.inbound
                      ? 'Choose return seats'
                      : 'Save seats'
                    : seatLeg === 'outbound' && inbound
                      ? 'Choose return seats'
                      : 'Continue to checkout'}
                  <ArrowRight size={16} />
                </Button>
                {!editingSeat && summary}
              </aside>
            </div>
          </section>
        )}
        {view === 'checkout' && outbound && (
          <section className="flow-page">
            <button
              className="text-button back"
              onClick={() => (step > 0 ? setStep(step - 1) : go('seats'))}
            >
              <ArrowLeft size={16} /> {step > 0 ? 'Previous step' : 'Back to seats'}
            </button>
            <ol className="checkout-progress">
              {['Travelers', 'Payment', 'Review'].map((title, i) => (
                <li className={i === step ? 'active' : i < step ? 'complete' : ''} key={title}>
                  <span>{i < step ? <Check size={13} /> : i + 1}</span>
                  {title}
                </li>
              ))}
            </ol>
            <h1>
              {step === 0 ? 'Traveler details' : step === 1 ? 'Payment details' : 'Review booking'}
            </h1>
            <p className="page-subtitle">
              {step === 0
                ? 'Enter each traveler’s details as they appear on their travel document.'
                : step === 1
                  ? 'Enter your payment details.'
                  : 'Take a moment to check the details before you book.'}
            </p>
            <div className="checkout-layout">
              <div className="checkout-content">
                {step === 0 && (
                  <>
                    {travelers.map((p, i) => (
                      <div className="form-section" key={i}>
                        <h3>
                          Traveler {i + 1} <span>Adult</span>
                        </h3>
                        <div className="form-grid">
                          <label>
                            First name
                            <Input
                              className="rounded-none border-x-0 border-t-0 border-b bg-transparent dark:bg-transparent px-0 shadow-none focus-visible:ring-0 h-11 text-[14px]"
                              autoComplete="given-name"
                              value={p.firstName}
                              onChange={(e) =>
                                setTravelers(
                                  travelers.map((v, j) =>
                                    i === j ? { ...v, firstName: e.target.value } : v,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            Last name
                            <Input
                              className="rounded-none border-x-0 border-t-0 border-b bg-transparent dark:bg-transparent px-0 shadow-none focus-visible:ring-0 h-11 text-[14px]"
                              autoComplete="family-name"
                              value={p.lastName}
                              onChange={(e) =>
                                setTravelers(
                                  travelers.map((v, j) =>
                                    i === j ? { ...v, lastName: e.target.value } : v,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            Date of birth
                            <Input
                              className="rounded-none border-x-0 border-t-0 border-b bg-transparent dark:bg-transparent px-0 shadow-none focus-visible:ring-0 h-11 text-[14px]"
                              type="date"
                              min="1900-01-01"
                              max="2014-10-18"
                              value={p.birthDate}
                              onChange={(e) =>
                                setTravelers(
                                  travelers.map((v, j) =>
                                    i === j ? { ...v, birthDate: e.target.value } : v,
                                  ),
                                )
                              }
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                    <div className="form-section">
                      <h3>Contact details</h3>
                      <label>
                        Email address
                        <Input
                          className="rounded-none border-x-0 border-t-0 border-b bg-transparent dark:bg-transparent px-0 shadow-none focus-visible:ring-0 h-11 text-[14px]"
                          type="email"
                          autoComplete="email"
                          placeholder="alex@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </label>
                    </div>
                  </>
                )}
                {step === 1 && (
                  <div className="form-section">
                    <h3>Payment details</h3>
                    <div className="sample-card">
                      <CreditCard size={20} />
                      <div>
                        <strong>Sample card</strong>
                        <p>4242 4242 4242 4242 · Expiry 12/30 · Security code 123</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() =>
                          setCard({
                            name: 'Alex Morgan',
                            number: '4242 4242 4242 4242',
                            expiry: '12/30',
                            cvc: '123',
                          })
                        }
                      >
                        Use sample
                      </button>
                    </div>
                    <div className="form-grid">
                      <label className="span-two">
                        Name on card
                        <Input
                          className="rounded-none border-x-0 border-t-0 border-b bg-transparent dark:bg-transparent px-0 shadow-none focus-visible:ring-0 h-11 text-[14px]"
                          value={card.name}
                          autoComplete="off"
                          onChange={(e) => setCard({ ...card, name: e.target.value })}
                        />
                      </label>
                      <label className="span-two">
                        Card number
                        <Input
                          className="rounded-none border-x-0 border-t-0 border-b bg-transparent dark:bg-transparent px-0 shadow-none focus-visible:ring-0 h-11 text-[14px]"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="4242 4242 4242 4242"
                          value={card.number}
                          onChange={(e) => setCard({ ...card, number: e.target.value })}
                        />
                      </label>
                      <label>
                        Expiry date
                        <Input
                          className="rounded-none border-x-0 border-t-0 border-b bg-transparent dark:bg-transparent px-0 shadow-none focus-visible:ring-0 h-11 text-[14px]"
                          placeholder="MM/YY"
                          value={card.expiry}
                          maxLength={5}
                          onChange={(e) => setCard({ ...card, expiry: e.target.value })}
                        />
                      </label>
                      <label>
                        Security code
                        <Input
                          className="rounded-none border-x-0 border-t-0 border-b bg-transparent dark:bg-transparent px-0 shadow-none focus-visible:ring-0 h-11 text-[14px]"
                          inputMode="numeric"
                          value={card.cvc}
                          maxLength={3}
                          onChange={(e) => setCard({ ...card, cvc: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>
                )}
                {step === 2 && (
                  <>
                    <div className="form-section">
                      <div className="section-line">
                        <h3>Travelers & seats</h3>
                        <button className="text-button" onClick={() => setStep(0)}>
                          Edit details
                        </button>
                      </div>
                      {travelers.map((p, i) => (
                        <div className="review-traveler" key={i}>
                          <strong>
                            {p.firstName} {p.lastName}
                          </strong>
                          <span>
                            Outbound seat {seats[i]}
                            {inbound && ` · Return seat ${returnSeats[i]}`}
                          </span>
                        </div>
                      ))}
                      <p>
                        Confirmation for <strong>{email}</strong>
                      </p>
                    </div>
                    <div className="form-section">
                      <h3>Payment</h3>
                      <p>Visa ending in 4242 · {card.name}</p>
                      <h3>Fare conditions</h3>
                      <p>
                        {fare === 'flex'
                          ? 'Your Flex fare includes free changes and cancellation.'
                          : fare === 'standard'
                            ? 'Your Standard fare includes changes for $40. Cancellation receives a travel credit less a $40 fee.'
                            : 'Your Light fare is non-changeable. Cancellation is available without a refund.'}
                      </p>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={terms}
                          onChange={(e) => setTerms(e.target.checked)}
                        />{' '}
                        I have reviewed the trip details and accept the fare conditions.
                      </label>
                    </div>
                  </>
                )}
                {error && (
                  <p className="error-message" role="alert">
                    {error}
                  </p>
                )}
                <div className="checkout-action">
                  <Button
                    variant="default"
                    className="button h-[42px] text-[14px] font-semibold"
                    disabled={loading}
                    onClick={step === 2 ? confirmBooking : nextCheckout}
                  >
                    {loading
                      ? 'Confirming your booking…'
                      : step === 0
                        ? 'Continue to payment'
                        : step === 1
                          ? 'Review booking'
                          : `Confirm booking · ${money(total)}`}
                    <ArrowRight size={16} />
                  </Button>
                </div>
              </div>
              {summary}
            </div>
          </section>
        )}
        {view === 'confirmation' && confirmed && (
          <section className="confirmation-page">
            <div className="confirmation-icon">
              <Check size={35} />
            </div>
            <h1>Booking confirmed</h1>
            <div className="confirmation-card">
              <span className="section-label">Booking reference</span>
              <strong className="booking-reference">{confirmed.reference}</strong>
              <div className="confirmation-route">
                <div>
                  <strong>{confirmed.outbound.from}</strong>
                  <span>{airport(confirmed.outbound.from).city}</span>
                </div>
                <Plane size={25} />
                <div>
                  <strong>{confirmed.outbound.to}</strong>
                  <span>{airport(confirmed.outbound.to).city}</span>
                </div>
              </div>
              <div className="summary-row">
                <span>Departure</span>
                <strong>
                  {formatDate(confirmed.departureDate)} · {confirmed.outbound.departure}
                </strong>
              </div>
              {confirmed.inbound && (
                <div className="summary-row">
                  <span>Return</span>
                  <strong>
                    {formatDate(confirmed.returnDate)} · {confirmed.inbound.departure}
                  </strong>
                </div>
              )}
              <div className="summary-row">
                <span>Travelers</span>
                <strong>{confirmed.passengers.length}</strong>
              </div>
              <div className="summary-row">
                <span>Seats</span>
                <strong>{confirmed.seats.join(', ')}</strong>
              </div>
              <div className="summary-row total">
                <strong>Total</strong>
                <strong>{money(confirmed.total)}</strong>
              </div>
            </div>
            <Button
              variant="default"
              className="button h-[42px] text-[14px] font-semibold"
              onClick={() => go('bookings')}
            >
              Manage your booking <ArrowRight size={16} />
            </Button>
          </section>
        )}
        {view === 'bookings' && (
          <section className="flow-page bookings-page">
            <h1>My trips</h1>
            <p className="page-subtitle">View bookings, change seats, or cancel a trip.</p>
            <div className="booking-controls">
              <label>
                <Search size={17} />
                <Input
                  className="rounded-none border-x-0 border-t-0 border-b bg-transparent dark:bg-transparent px-0 shadow-none focus-visible:ring-0 h-11 pl-10 text-[14px]"
                  placeholder="Search by reference or destination"
                  aria-label="Find a booking"
                  value={lookup}
                  onChange={(e) => setLookup(e.target.value)}
                />
              </label>
              <select
                aria-label="Booking status"
                value={bookingFilter}
                onChange={(e) => setBookingFilter(e.target.value)}
              >
                <option value="all">All bookings</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <Button
                variant="default"
                className="button h-[42px] text-[14px] font-semibold"
                onClick={() => go('home')}
              >
                Plan another trip <Plus size={16} />
              </Button>
            </div>
            <div className="booking-list">
              {bookings
                .filter(
                  (b) =>
                    (bookingFilter === 'all' || b.status === bookingFilter) &&
                    `${b.reference} ${airport(b.outbound.to).city} ${b.outbound.to}`
                      .toLowerCase()
                      .includes(lookup.toLowerCase()),
                )
                .map((b) => (
                  <div className="booking-card" key={b.reference}>
                    <div className="booking-card-top">
                      <Badge variant="outline" className={`status ${b.status}`}>
                        {b.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                      </Badge>
                      <span>
                        Booking <strong>{b.reference}</strong>
                      </span>
                    </div>
                    <div className="booking-card-main">
                      <div className="trip-date">
                        <b>{formatDate(b.departureDate, { day: 'numeric' })}</b>
                        <span>{formatDate(b.departureDate, { month: 'short' })}</span>
                      </div>
                      <div>
                        <h2>
                          {airport(b.outbound.from).city} <ArrowRight size={20} />{' '}
                          {airport(b.outbound.to).city}
                        </h2>
                        <p>
                          {b.outbound.airline} · {b.outbound.departure}–{b.outbound.arrival} ·{' '}
                          {b.inbound ? 'Round trip' : 'One way'}
                        </p>
                        <p>
                          {b.passengers.map((p) => `${p.firstName} ${p.lastName}`).join(', ')} ·
                          Seat{b.seats.length > 1 ? 's' : ''} {b.seats.join(', ')}
                        </p>
                        {b.inbound && (
                          <p>
                            Return {formatDate(b.returnDate)} · {b.inbound.departure} · Seats{' '}
                            {b.returnSeats.join(', ')}
                          </p>
                        )}
                      </div>
                      <strong className="booking-total">
                        {money(b.total)}
                        <small>{fares.find((f) => f.id === b.fare)?.name} fare</small>
                      </strong>
                    </div>
                    {b.status === 'confirmed' && (
                      <div className="booking-actions">
                        <button
                          className="text-button"
                          onClick={() => {
                            setConfirmed(b);
                            go('confirmation');
                          }}
                        >
                          View booking <ChevronRight size={15} />
                        </button>
                        <button
                          className="text-button"
                          onClick={() => {
                            setEditingSeat(b);
                            setSeats(b.seats);
                            setReturnSeats(b.returnSeats);
                            setSeatLeg('outbound');
                            go('seats');
                          }}
                        >
                          Change seats
                        </button>
                        <button
                          className="text-button danger"
                          onClick={() => setCancelRef(b.reference)}
                        >
                          Cancel booking
                        </button>
                      </div>
                    )}
                    {b.status === 'cancelled' && (
                      <p className="cancelled-note">
                        {b.fare === 'flex'
                          ? `Refund of ${money(b.total)} recorded.`
                          : b.fare === 'standard'
                            ? `Travel credit of ${money(Math.max(0, b.total - 40))} recorded.`
                            : 'Cancelled under Light fare conditions. No refund.'}
                      </p>
                    )}
                  </div>
                ))}
              {!bookings.some(
                (b) =>
                  (bookingFilter === 'all' || b.status === bookingFilter) &&
                  `${b.reference} ${airport(b.outbound.to).city} ${b.outbound.to}`
                    .toLowerCase()
                    .includes(lookup.toLowerCase()),
              ) && (
                <div className="empty-state">
                  <Luggage size={32} />
                  <h3>No trips found</h3>
                  <p>Try another reference or destination, or plan a new trip.</p>
                  <Button
                    variant="outline"
                    className="button secondary h-[42px] text-[14px] font-semibold"
                    onClick={() => {
                      setLookup('');
                      setBookingFilter('all');
                    }}
                  >
                    Clear search
                  </Button>
                </div>
              )}
            </div>
          </section>
        )}
        {error && view !== 'checkout' && view !== 'home' && (
          <p className="global-error error-message" role="alert">
            {error}
          </p>
        )}
      </main>
      <Dialog open={!!cancelRef} onOpenChange={(open) => !open && setCancelRef('')}>
        <DialogContent className="wayline-dialog sm:max-w-[480px]" showCloseButton={false}>
          <Button
            variant="ghost"
            size="icon"
            className="modal-close"
            aria-label="Close cancellation dialog"
            onClick={() => setCancelRef('')}
          >
            <X size={20} />
          </Button>
          <DialogHeader>
            <DialogTitle id="cancel-title" className="text-2xl font-bold">
              Cancel this trip?
            </DialogTitle>
            <DialogDescription className="text-[14px] leading-relaxed">
              Booking {cancelRef} will be cancelled for every traveler.
            </DialogDescription>
          </DialogHeader>
          <p>
            {bookings.find((b) => b.reference === cancelRef)?.fare === 'flex'
              ? 'Your Flex fare is fully refundable.'
              : bookings.find((b) => b.reference === cancelRef)?.fare === 'standard'
                ? 'Your Standard fare receives a travel credit less a $40 cancellation fee.'
                : 'Your Light fare is non-refundable. You won’t receive a refund.'}
          </p>
          <div className="modal-actions">
            <Button
              variant="outline"
              className="button secondary h-[42px] text-[14px] font-semibold"
              autoFocus
              onClick={() => setCancelRef('')}
            >
              Keep my trip
            </Button>
            <Button
              variant="destructive"
              className="button destructive h-[42px] text-[14px] font-semibold"
              onClick={() => {
                setBookings((prev) =>
                  prev.map((b) => (b.reference === cancelRef ? { ...b, status: 'cancelled' } : b)),
                );
                setCancelRef('');
                setToast('Your booking has been cancelled.');
              }}
            >
              Cancel booking
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
