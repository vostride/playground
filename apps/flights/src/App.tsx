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
  Globe2,
  Luggage,
  MapPin,
  Plane,
  Plus,
  Minus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { PlaygroundBanner, useSessionState } from '@playground/ui';
import {
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
const formatDate = (
  value: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', options);
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
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
        <input
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
    [selecting, setSelecting] = useState<'departure' | 'returnDate'>('departure');
  const first = new Date(`${month}-01T12:00:00`),
    days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(),
    start = (first.getDay() + 6) % 7;
  return (
    <div className="date-field">
      <span className="field-label">Travel dates</span>
      <button
        type="button"
        className="plain picker-button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setSelecting('departure');
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
              onClick={() => setMonth(addDays(`${month}-01`, -1).slice(0, 7))}
            >
              <ChevronLeft size={18} />
            </button>
            <strong>{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Next month"
              onClick={() => setMonth(addDays(`${month}-${days}`, 1).slice(0, 7))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="date-tabs">
            <button
              type="button"
              className={selecting === 'departure' ? 'selected' : ''}
              onClick={() => setSelecting('departure')}
            >
              Departure <b>{formatDate(value.departure)}</b>
            </button>
            {value.roundTrip && (
              <button
                type="button"
                className={selecting === 'returnDate' ? 'selected' : ''}
                onClick={() => setSelecting('returnDate')}
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
                  onClick={() => {
                    onChange({
                      ...value,
                      [selecting]: date,
                      ...(selecting === 'departure' && date > value.returnDate
                        ? { returnDate: addDays(date, 7) }
                        : {}),
                    });
                    if (selecting === 'departure' && value.roundTrip) setSelecting('returnDate');
                    else setOpen(false);
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <button className="button small full" type="button" onClick={() => setOpen(false)}>
            Done
          </button>
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
    <article className="flight-card">
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
        <button className="button" onClick={choose}>
          Select flight <ArrowRight size={15} />
        </button>
      </div>
    </article>
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
      home: 'Find your next somewhere',
      results: leg === 'outbound' ? 'Choose your flight' : 'Choose your return',
      fare: 'Choose your fare',
      seats: 'Choose your seats',
      checkout: 'Checkout',
      confirmation: 'Booking confirmed',
      bookings: 'My trips',
    };
    document.title = `${titles[view]} · Wayline`;
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
        <span>
          Economy <ChevronDown size={13} />
        </span>
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
        <button className="button search-submit" type="submit">
          <Search size={19} /> Search flights
        </button>
      </div>
    </form>
  );
  const summary = outbound && (
    <aside className="trip-summary">
      <span className="eyebrow">YOUR TRIP</span>
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
      <p>
        <ShieldCheck size={15} /> All taxes and fees included
      </p>
    </aside>
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
      <PlaygroundBanner app="Wayline" bugs={bugs} />
      <header className="site-header">
        <div className="header-inner">
          <button className="wordmark" aria-label="Wayline home" onClick={() => go('home')}>
            <span className="brand-mark">
              <Plane size={23} />
            </span>
            wayline<span className="brand-dot">.</span>
          </button>
          <nav aria-label="Main navigation">
            <button className={view !== 'bookings' ? 'nav-active' : ''} onClick={() => go('home')}>
              Explore flights
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
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">
                  <span /> A LITTLE FURTHER. A LITTLE FREER.
                </span>
                <h1>
                  Find your next
                  <br />
                  <em>somewhere.</em>
                </h1>
                <p>
                  Good journeys begin with a little possibility.
                  <br />
                  Find a flight, make a plan, and go.
                </p>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="sun" />
                <div className="art-cloud cloud-one" />
                <div className="art-cloud cloud-two" />
                <div className="mountain mountain-back" />
                <div className="mountain mountain-front" />
                <div className="flight-trail" />
                <Plane className="hero-plane" size={76} />
                <div className="art-ticket">
                  <span>YOUR NEXT CHAPTER</span>
                  <strong>
                    JFK <ArrowRight size={17} /> LHR
                  </strong>
                  <small>Just a flight away.</small>
                </div>
              </div>
            </section>
            <section className="home-search">
              {searchForm}
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
            </section>
            <section className="trust-row">
              <span>
                <ShieldCheck size={18} /> Clear prices. No surprises.
              </span>
              <span>
                <ArrowRightLeft size={18} /> A fare that fits your plans.
              </span>
              <span>
                <Globe2 size={18} /> A world worth exploring.
              </span>
            </section>
            <section className="destinations">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">LET CURIOSITY LEAD</span>
                  <h2>A change of scenery</h2>
                </div>
                <p>A few places we keep coming back to.</p>
              </div>
              <div className="destination-grid">
                {[
                  {
                    code: 'LHR',
                    city: 'London',
                    tag: 'Old streets. New stories.',
                    style: 'london',
                  },
                  { code: 'LIS', city: 'Lisbon', tag: 'Follow the golden light.', style: 'lisbon' },
                  { code: 'HND', city: 'Tokyo', tag: 'Every turn, something new.', style: 'tokyo' },
                ].map((d, i) => (
                  <button
                    className={`destination ${d.style}`}
                    key={d.code}
                    onClick={() => {
                      setSearch({ ...search, to: d.code });
                      setToast(`${d.city} selected. Choose your dates and search flights.`);
                      document.getElementById('airport-From')?.focus();
                    }}
                  >
                    <div className="destination-art" aria-hidden="true">
                      <div className="destination-sun" />
                      <div className="buildings">
                        {Array.from({ length: 7 }, (_, j) => (
                          <i
                            key={j}
                            style={{
                              height: `${30 + ((j * 29 + i * 13) % 65)}%`,
                              width: `${12 + (j % 2) * 3}%`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="destination-info">
                      <div>
                        <h3>{d.city}</h3>
                        <p>{d.tag}</p>
                      </div>
                      <ArrowRight size={20} />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
        {view === 'results' && (
          <>
            <section className="compact-search">{searchForm}</section>
            <section className="results-page">
              <div className="results-heading">
                <div>
                  <span className="eyebrow">
                    {leg === 'outbound' ? 'YOUR JOURNEY STARTS HERE' : 'LET’S GET YOU HOME'}
                  </span>
                  <h1>
                    {airport(routeFrom).city} <ArrowRight size={28} /> {airport(routeTo).city}
                  </h1>
                  <p>
                    {formatDate(routeDate, { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
                    {search.passengers} traveler{search.passengers > 1 ? 's' : ''} ·{' '}
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
                    <ShieldCheck size={19} />
                    <strong>The price you see is the price you pay.</strong>
                    <p>Taxes and fees are always included.</p>
                  </div>
                </aside>
                <div className="flight-results">
                  <div className="price-calendar" aria-label="Price calendar">
                    {[-3, -2, -1, 0, 1, 2, 3].map((offset) => {
                      const date = addDays(routeDate, offset),
                        price = Math.min(
                          ...searchFlights(routeFrom, routeTo, date).map((f) => f.price),
                        );
                      return (
                        <button
                          key={date}
                          className={offset === 0 ? 'selected' : ''}
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
                      <button
                        className="button"
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
                      </button>
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
            <span className="eyebrow">A LITTLE FLEXIBILITY GOES A LONG WAY</span>
            <h1>A fare that fits your plans</h1>
            <p className="page-subtitle">
              Choose what matters for your journey. Your fare applies to all travelers and flights.
            </p>
            <div className="fare-layout">
              <div className="fare-cards">
                {fares.map((f) => (
                  <article className={`fare-card ${fare === f.id ? 'selected' : ''}`} key={f.id}>
                    {f.id === 'standard' && <span className="recommended">OUR MOST POPULAR</span>}
                    <h2>{f.name}</h2>
                    <p>
                      {f.id === 'light'
                        ? 'Travel light, keep it simple.'
                        : f.id === 'standard'
                          ? 'A little more room to roam.'
                          : 'Room for a change of plans.'}
                    </p>
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
                    <button
                      className={`button ${fare !== f.id ? 'secondary' : ''}`}
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
                    </button>
                  </article>
                ))}
              </div>
              {summary}
            </div>
            <div className="flow-actions">
              <span>Make the journey yours.</span>
              <button className="button" onClick={beginSeats}>
                Continue to seats <ArrowRight size={16} />
              </button>
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
            <span className="eyebrow">YOUR OWN LITTLE WINDOW ON THE WORLD</span>
            <h1>Find your favorite seat</h1>
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
                <button
                  className="button full"
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
                </button>
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
              {step === 0
                ? 'Who’s coming along?'
                : step === 1
                  ? 'One step closer to takeoff.'
                  : 'Ready for your next chapter?'}
            </h1>
            <p className="page-subtitle">
              {step === 0
                ? 'Enter each traveler’s details as they appear on their travel document.'
                : step === 1
                  ? 'This is a practice booking. Use the sample payment details below.'
                  : 'Take a moment to check the details before you book.'}
            </p>
            <div className="checkout-layout">
              <div className="checkout-content">
                {step === 0 && (
                  <>
                    {travelers.map((p, i) => (
                      <section className="form-section" key={i}>
                        <h3>
                          Traveler {i + 1} <span>Adult</span>
                        </h3>
                        <div className="form-grid">
                          <label>
                            First name
                            <input
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
                            <input
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
                            <input
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
                      </section>
                    ))}
                    <section className="form-section">
                      <h3>Where should we send your confirmation?</h3>
                      <label>
                        Email address
                        <input
                          type="email"
                          autoComplete="email"
                          placeholder="alex@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </label>
                      <p className="muted">Use sample details. No email will be sent.</p>
                    </section>
                  </>
                )}
                {step === 1 && (
                  <section className="form-section">
                    <h3>Payment details</h3>
                    <div className="sample-card">
                      <ShieldCheck size={20} />
                      <div>
                        <strong>Sample card · no real payment</strong>
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
                        <input
                          value={card.name}
                          autoComplete="off"
                          onChange={(e) => setCard({ ...card, name: e.target.value })}
                        />
                      </label>
                      <label className="span-two">
                        Card number
                        <input
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="4242 4242 4242 4242"
                          value={card.number}
                          onChange={(e) => setCard({ ...card, number: e.target.value })}
                        />
                      </label>
                      <label>
                        Expiry date
                        <input
                          placeholder="MM/YY"
                          value={card.expiry}
                          maxLength={5}
                          onChange={(e) => setCard({ ...card, expiry: e.target.value })}
                        />
                      </label>
                      <label>
                        Security code
                        <input
                          inputMode="numeric"
                          value={card.cvc}
                          maxLength={3}
                          onChange={(e) => setCard({ ...card, cvc: e.target.value })}
                        />
                      </label>
                    </div>
                  </section>
                )}
                {step === 2 && (
                  <>
                    <section className="form-section">
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
                    </section>
                    <section className="form-section">
                      <h3>Payment</h3>
                      <p>Sample Visa ending in 4242 · {card.name}</p>
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
                    </section>
                  </>
                )}
                {error && (
                  <p className="error-message" role="alert">
                    {error}
                  </p>
                )}
                <div className="checkout-action">
                  <button
                    className="button"
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
                  </button>
                  <span>
                    <ShieldCheck size={14} /> Practice booking. No charge.
                  </span>
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
            <span className="eyebrow">IT’S HAPPENING</span>
            <h1>You’re going to {airport(confirmed.outbound.to).city}.</h1>
            <p>Your booking is confirmed. Let the looking-forward begin.</p>
            <div className="confirmation-card">
              <span className="eyebrow">BOOKING REFERENCE</span>
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
            <button className="button" onClick={() => go('bookings')}>
              Manage your booking <ArrowRight size={16} />
            </button>
            <p className="muted">This booking exists only in your current browser session.</p>
          </section>
        )}
        {view === 'bookings' && (
          <section className="flow-page bookings-page">
            <span className="eyebrow">MORE THAN A BOOKING. SOMETHING TO LOOK FORWARD TO.</span>
            <h1>My trips</h1>
            <p className="page-subtitle">
              All your plans, in one place. View a trip, choose a seat, or change direction.
            </p>
            <div className="booking-controls">
              <label>
                <Search size={17} />
                <input
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
              <button className="button" onClick={() => go('home')}>
                Plan another trip <Plus size={16} />
              </button>
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
                  <article className="booking-card" key={b.reference}>
                    <div className="booking-card-top">
                      <span className={`status ${b.status}`}>
                        {b.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                      </span>
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
                          ? `Refund of ${money(b.total)} recorded for this practice booking.`
                          : b.fare === 'standard'
                            ? `Travel credit of ${money(Math.max(0, b.total - 40))} recorded for this practice booking.`
                            : 'Cancelled under Light fare conditions. No refund.'}
                      </p>
                    )}
                  </article>
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
                  <button
                    className="button secondary"
                    onClick={() => {
                      setLookup('');
                      setBookingFilter('all');
                    }}
                  >
                    Clear search
                  </button>
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
      <footer className="site-footer">
        <span className="footer-wordmark">wayline.</span>
        <span>Good journeys start here.</span>
        <span>A self-contained travel playground · USD</span>
      </footer>
      {cancelRef && (
        <div className="modal-backdrop" role="presentation" onClick={() => setCancelRef('')}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="Close cancellation dialog"
              onClick={() => setCancelRef('')}
            >
              <X size={20} />
            </button>
            <h2 id="cancel-title">Cancel this trip?</h2>
            <p>Booking {cancelRef} will be cancelled for every traveler.</p>
            <p>
              {bookings.find((b) => b.reference === cancelRef)?.fare === 'flex'
                ? 'Your Flex fare is fully refundable. A simulated refund will be recorded.'
                : bookings.find((b) => b.reference === cancelRef)?.fare === 'standard'
                  ? 'Your Standard fare receives a simulated travel credit less a $40 cancellation fee.'
                  : 'Your Light fare is non-refundable. You won’t receive a refund.'}
            </p>
            <div className="modal-actions">
              <button className="button secondary" autoFocus onClick={() => setCancelRef('')}>
                Keep my trip
              </button>
              <button
                className="button destructive"
                onClick={() => {
                  setBookings((prev) =>
                    prev.map((b) =>
                      b.reference === cancelRef ? { ...b, status: 'cancelled' } : b,
                    ),
                  );
                  setCancelRef('');
                  setToast('Your booking has been cancelled.');
                }}
              >
                Cancel booking
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
