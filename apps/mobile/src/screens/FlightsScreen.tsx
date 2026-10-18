import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  addFlightDays as addDays,
  flightDateWindow,
  flightMonthDays,
  formatFlightDate as shortDate,
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
import {
  Button,
  Card,
  Chip,
  colors,
  Empty,
  Field,
  Heading,
  Row,
  SafeModalArea,
  Screen,
  useSessionState,
  type MobileScreenProps,
} from '../ui';
type Step = 'search' | 'results' | 'fare' | 'seats' | 'checkout' | 'confirmation' | 'bookings';
type SearchState = {
  from: string;
  to: string;
  departure: string;
  returnDate: string;
  roundTrip: boolean;
  passengers: number;
};
const initialSearch: SearchState = {
  from: 'JFK',
  to: 'LHR',
  departure: '2026-11-10',
  returnDate: '2026-11-17',
  roundTrip: true,
  passengers: 1,
};
export default function FlightsScreen({ route, bug }: MobileScreenProps) {
  const [search, setSearch] = useSessionState<SearchState>('wayline-search', initialSearch),
    [bookings, setBookings] = useSessionState<Booking[]>('wayline-bookings', [sampleBooking]);
  const [view, setView] = useState<Step>(route.startsWith('bookings') ? 'bookings' : 'search'),
    [picker, setPicker] = useState<'' | 'from' | 'to' | 'dates' | 'passengers'>(''),
    [query, setQuery] = useState(''),
    [month, setMonth] = useState('2026-11'),
    [datePart, setDatePart] = useState<'departure' | 'returnDate'>('departure'),
    [exactDate, setExactDate] = useState(initialSearch.departure),
    [dateError, setDateError] = useState('');
  const [outbound, setOutbound] = useState<Flight>(),
    [inbound, setInbound] = useState<Flight>(),
    [leg, setLeg] = useState<'outbound' | 'return'>('outbound'),
    [fare, setFare] = useState<Fare>('standard'),
    [seats, setSeats] = useState<string[]>([]),
    [returnSeats, setReturnSeats] = useState<string[]>([]),
    [seatLeg, setSeatLeg] = useState<'outbound' | 'return'>('outbound');
  const [nonstop, setNonstop] = useState(false),
    [selectedAirlines, setSelectedAirlines] = useState<string[]>([]),
    [departureTime, setDepartureTime] = useState('any'),
    [maxPrice, setMaxPrice] = useState('1000'),
    [sort, setSort] = useState('recommended'),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [checkoutStep, setCheckoutStep] = useState(0),
    [travelers, setTravelers] = useState<Passenger[]>([]),
    [email, setEmail] = useState(''),
    [payment, setPayment] = useState({ name: '', number: '', expiry: '', cvc: '' }),
    [terms, setTerms] = useState(false),
    [confirmed, setConfirmed] = useState<Booking>(),
    [lookup, setLookup] = useState(''),
    [status, setStatus] = useState('all'),
    [editing, setEditing] = useState<Booking>();
  useEffect(() => {
    if (route.startsWith('bookings')) setView('bookings');
    else if (route === '') setView('search');
  }, [route]);
  const go = (next: Step) => {
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
    setOutbound(undefined);
    setInbound(undefined);
    setSeats([]);
    setReturnSeats([]);
    setLeg('outbound');
    setLoading(true);
    go('results');
    setTimeout(() => setLoading(false), 500);
  };
  const from = leg === 'outbound' ? search.from : search.to,
    to = leg === 'outbound' ? search.to : search.from,
    date = leg === 'outbound' ? search.departure : search.returnDate;
  const results = searchFlights(from, to, date)
    .filter(
      (f) =>
        (!nonstop || !f.stops) &&
        (!selectedAirlines.length || selectedAirlines.includes(f.airline)) &&
        (departureTime === 'any' ||
          (departureTime === 'morning'
            ? Number(f.departure.slice(0, 2)) < 12
            : Number(f.departure.slice(0, 2)) >= 12)) &&
        f.price <= Number(maxPrice || 1000),
    )
    .sort((a, b) =>
      sort === 'cheapest'
        ? a.price - b.price
        : sort === 'fastest'
          ? a.duration - b.duration
          : sort === 'earliest'
            ? a.departure.localeCompare(b.departure)
            : a.price + a.duration / 3 + a.stops * 100 - (b.price + b.duration / 3 + b.stops * 100),
    );
  const choose = (flight: Flight) => {
    if (leg === 'outbound') {
      setOutbound(flight);
      if (search.roundTrip) {
        setLeg('return');
        return;
      }
      go('fare');
    } else {
      setInbound(flight);
      go('fare');
    }
  };
  const total = outbound
    ? bookingTotal(outbound, inbound, bug === 'fare-total' ? 'light' : fare, search.passengers)
    : 0;
  const selectedSeats = seatLeg === 'outbound' ? seats : returnSeats,
    setSelectedSeats = seatLeg === 'outbound' ? setSeats : setReturnSeats,
    seatFlight = editing
      ? seatLeg === 'outbound'
        ? editing.outbound
        : editing.inbound
      : seatLeg === 'outbound'
        ? outbound
        : inbound,
    passengerCount = editing ? editing.passengers.length : search.passengers;
  const finishSeats = () => {
    if (seatLeg === 'outbound' && (editing?.inbound || (!editing && inbound))) {
      setSeatLeg('return');
      return;
    }
    if (editing) {
      setBookings((previous) =>
        previous.map((b) => (b.reference === editing.reference ? { ...b, seats, returnSeats } : b)),
      );
      setEditing(undefined);
      go('bookings');
      return;
    }
    setTravelers(
      Array.from({ length: search.passengers }, () => ({
        firstName: '',
        lastName: '',
        birthDate: '',
      })),
    );
    setCheckoutStep(0);
    go('checkout');
  };
  const nextCheckout = () => {
    if (checkoutStep === 0) {
      const invalid = travelers.map(validatePassenger).find(Boolean);
      if (invalid) {
        setError(invalid);
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Enter a valid email address for your booking confirmation.');
        return;
      }
    } else if (checkoutStep === 1) {
      if (
        !payment.name.trim() ||
        payment.number.replace(/\s/g, '') !== '4242424242424242' ||
        payment.expiry !== '12/30' ||
        payment.cvc !== '123'
      ) {
        setError(
          'Use the sample card: 4242 4242 4242 4242, expiry 12/30, security code 123, and enter a cardholder name.',
        );
        return;
      }
    }
    setError('');
    setCheckoutStep(checkoutStep + 1);
  };
  const confirm = () => {
    if (!terms) {
      setError('Accept the fare conditions before confirming your booking.');
      return;
    }
    if (!outbound) return;
    setLoading(true);
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
      setBookings((previous) => [booking, ...previous]);
      setConfirmed(booking);
      setLoading(false);
      go('confirmation');
    }, 500);
  };
  const selectDatePart = (part: 'departure' | 'returnDate') => {
    setDatePart(part);
    setMonth(search[part].slice(0, 7));
    setExactDate(search[part]);
    setDateError('');
  };
  const chooseDate = (date: string) => {
    if (!isValidFlightDate(date)) {
      setDateError('Enter a valid date in YYYY-MM-DD format.');
      return;
    }
    if (datePart === 'returnDate' && date < search.departure) {
      setDateError('Your return date must be on or after your departure.');
      return;
    }
    const next = {
      ...search,
      [datePart]: date,
      ...(datePart === 'departure' && date > search.returnDate
        ? { returnDate: addDays(date, 7) }
        : {}),
    };
    setSearch(next);
    setMonth(date.slice(0, 7));
    setDateError('');
    if (datePart === 'departure' && search.roundTrip) {
      setDatePart('returnDate');
      setExactDate(next.returnDate);
    } else {
      setExactDate(date);
      setPicker('');
    }
  };
  const first = new Date(`${month}-01T00:00:00Z`),
    days = flightMonthDays(month),
    start = (first.getUTCDay() + 6) % 7;
  const cancel = (booking: Booking) =>
    Alert.alert(
      'Cancel this trip?',
      `Booking ${booking.reference} will be cancelled for every traveler. ${booking.fare === 'flex' ? 'Your Flex fare is fully refundable.' : booking.fare === 'standard' ? 'Your Standard fare receives a travel credit less a $40 cancellation fee.' : 'Your Light fare is non-refundable. You won’t receive a refund.'}`,
      [
        { text: 'Keep my trip', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: () =>
            setBookings((previous) =>
              previous.map((b) =>
                b.reference === booking.reference ? { ...b, status: 'cancelled' } : b,
              ),
            ),
        },
      ],
    );
  return (
    <>
      <Row style={styles.subnav}>
        <Chip label="Flights" selected={view !== 'bookings'} onPress={() => go('search')} />
        <Chip label="My trips" selected={view === 'bookings'} onPress={() => go('bookings')} />
      </Row>
      <Screen
        key={`${view}-${leg}-${seatLeg}-${checkoutStep}`}
        refreshControl={
          view === 'bookings' ? (
            <RefreshControl
              refreshing={loading}
              onRefresh={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 450);
              }}
            />
          ) : undefined
        }
      >
        {view === 'search' && (
          <>
            <Heading title="Flight search" />
            <Card>
              <Row>
                <Chip
                  label="Round trip"
                  selected={search.roundTrip}
                  onPress={() => setSearch({ ...search, roundTrip: true })}
                />
                <Chip
                  label="One way"
                  selected={!search.roundTrip}
                  onPress={() => setSearch({ ...search, roundTrip: false })}
                />
                <Text style={styles.small}>Economy</Text>
              </Row>
              {(['from', 'to'] as const).map((key) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`${key === 'from' ? 'From' : 'To'}: ${airport(search[key]).city} (${search[key]})`}
                  key={key}
                  style={styles.searchField}
                  onPress={() => {
                    setQuery('');
                    setPicker(key);
                  }}
                >
                  <Text style={styles.label}>{key === 'from' ? 'From' : 'To'}</Text>
                  <Row>
                    <Text style={styles.airportCode}>{search[key]}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.medium}>{airport(search[key]).city}</Text>
                      <Text style={styles.small}>{airport(search[key]).name}</Text>
                    </View>
                    <Text style={styles.muted}>⌄</Text>
                  </Row>
                </TouchableOpacity>
              ))}
              <Button
                title="Swap departure and arrival"
                variant="secondary"
                onPress={() => setSearch({ ...search, from: search.to, to: search.from })}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Travel dates"
                style={styles.searchField}
                onPress={() => {
                  setPicker('dates');
                  selectDatePart('departure');
                }}
              >
                <Text style={styles.label}>Travel dates</Text>
                <Text style={styles.medium}>
                  {shortDate(search.departure)}
                  {search.roundTrip && ` – ${shortDate(search.returnDate)}`}{' '}
                  <Text style={styles.muted}>⌄</Text>
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Travelers"
                style={styles.searchField}
                onPress={() => setPicker('passengers')}
              >
                <Text style={styles.label}>Travelers</Text>
                <Text style={styles.medium}>
                  {search.passengers} adult{search.passengers > 1 ? 's' : ''}{' '}
                  <Text style={styles.muted}>⌄</Text>
                </Text>
              </TouchableOpacity>
              <Button title="Search flights" onPress={runSearch} />
            </Card>
          </>
        )}
        {view === 'results' && (
          <>
            <Heading
              title={`${airport(from).city} → ${airport(to).city}`}
              subtitle={`${shortDate(date)} · ${search.passengers} traveler${search.passengers > 1 ? 's' : ''} · ${leg === 'outbound' ? 'Outbound flight' : 'Return flight'}`}
            />
            {leg === 'return' && outbound && (
              <Card>
                <Text style={styles.small}>
                  Outbound selected: {outbound.airline} · {outbound.departure} ·{' '}
                  {money(outbound.price)}
                </Text>
                <Button
                  title="Change outbound"
                  variant="secondary"
                  onPress={() => setLeg('outbound')}
                />
              </Card>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Row>
                {flightDateWindow(date).map((next) => {
                  return (
                    <TouchableOpacity
                      key={next}
                      accessibilityRole="button"
                      disabled={leg === 'return' && next < search.departure}
                      accessibilityLabel={`${shortDate(next)}, from ${money(Math.min(...searchFlights(from, to, next).map((f) => f.price)))}`}
                      style={[styles.datePrice, next === date && styles.datePriceSelected]}
                      onPress={() =>
                        setSearch({
                          ...search,
                          [leg === 'outbound' ? 'departure' : 'returnDate']: next,
                          ...(leg === 'outbound' && next > search.returnDate
                            ? { returnDate: addDays(next, 7) }
                            : {}),
                        })
                      }
                    >
                      <Text style={styles.small}>{shortDate(next)}</Text>
                      <Text style={styles.medium}>
                        {money(Math.min(...searchFlights(from, to, next).map((f) => f.price)))}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </Row>
            </ScrollView>
            <Card>
              <Row>
                <Text style={styles.medium}>Filters</Text>
                <View style={{ flex: 1 }} />
                <Chip
                  label="Reset"
                  onPress={() => {
                    setNonstop(false);
                    setSelectedAirlines([]);
                    setDepartureTime('any');
                    setMaxPrice('1000');
                  }}
                />
              </Row>
              <Row>
                <Text style={[styles.small, { flex: 1 }]}>Nonstop only</Text>
                <Switch
                  accessibilityLabel="Nonstop only"
                  value={nonstop}
                  onValueChange={setNonstop}
                />
              </Row>
              <Row>
                {[
                  { id: 'any', label: 'Any time' },
                  { id: 'morning', label: 'Morning · before 12 pm' },
                  { id: 'afternoon', label: 'Afternoon · after 12 pm' },
                ].map((t) => (
                  <Chip
                    key={t.id}
                    label={t.label}
                    selected={departureTime === t.id}
                    onPress={() => setDepartureTime(t.id)}
                  />
                ))}
              </Row>
              <Field
                label="Maximum flight price"
                keyboardType="numeric"
                value={maxPrice}
                onChangeText={setMaxPrice}
              />
              <ScrollView horizontal>
                <Row>
                  <Chip
                    label="All airlines"
                    selected={!selectedAirlines.length}
                    onPress={() => setSelectedAirlines([])}
                  />
                  {airlines.map((name) => (
                    <Chip
                      key={name}
                      label={name}
                      selected={selectedAirlines.includes(name)}
                      onPress={() =>
                        setSelectedAirlines((previous) =>
                          previous.includes(name)
                            ? previous.filter((a) => a !== name)
                            : [...previous, name],
                        )
                      }
                    />
                  ))}
                </Row>
              </ScrollView>
              <Text style={styles.label}>Sort by</Text>
              <Row>
                {[
                  { id: 'recommended', label: 'Recommended' },
                  { id: 'cheapest', label: 'Lowest price' },
                  { id: 'fastest', label: 'Shortest duration' },
                  { id: 'earliest', label: 'Earliest departure' },
                ].map((s) => (
                  <Chip
                    key={s.id}
                    label={s.label}
                    selected={sort === s.id}
                    onPress={() => setSort(s.id)}
                  />
                ))}
              </Row>
            </Card>
            <Text style={styles.small}>{results.length} flights found</Text>
            {loading ? (
              <ActivityIndicator color={colors.primary} accessibilityLabel="Finding your way" />
            ) : results.length ? (
              results.map((f) => (
                <Card key={f.id}>
                  <Text style={styles.medium}>
                    {f.airline} <Text style={styles.small}>{f.number}</Text>
                  </Text>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View>
                      <Text style={styles.time}>{f.departure}</Text>
                      <Text style={styles.small}>{f.from}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={styles.small}>{durationLabel(f.duration)}</Text>
                      <Text style={styles.muted}>──── ✈ ────</Text>
                      <Text style={styles.small}>
                        {f.stops ? `${f.stops} stop${f.stops > 1 ? 's' : ''}` : 'Nonstop'}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.time}>{f.arrival}</Text>
                      <Text style={styles.small}>{f.to}</Text>
                    </View>
                  </Row>
                  <Text style={styles.small}>Carry-on included · Economy · {f.aircraft}</Text>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={styles.price}>
                      {money(f.price)}
                      <Text style={styles.small}> / traveler</Text>
                    </Text>
                    <Button title="Select flight" onPress={() => choose(f)} />
                  </Row>
                </Card>
              ))
            ) : (
              <Empty
                title="No flights match your filters"
                detail="Try a higher budget or include connecting flights."
              />
            )}
            <Button title="Edit search" variant="secondary" onPress={() => go('search')} />
          </>
        )}
        {view === 'fare' && outbound && (
          <>
            <Heading
              title="Choose your fare"
              subtitle="Your fare applies to all travelers and flights."
            />
            {fares.map((f) => (
              <Card
                key={f.id}
                style={fare === f.id ? { borderColor: colors.primary, borderBottomWidth: 2 } : {}}
              >
                <Row>
                  <Text style={[styles.price, { flex: 1 }]}>{f.name}</Text>
                </Row>
                <Text style={styles.price}>
                  {f.extra ? `+${money(f.extra)}` : 'Included'}{' '}
                  <Text style={styles.small}>
                    {f.extra ? 'per traveler, per flight' : 'in your flight price'}
                  </Text>
                </Text>
                {f.features.map((feature) => (
                  <Text style={styles.body} key={feature}>
                    ✓ {feature}
                  </Text>
                ))}
                <Button
                  title={fare === f.id ? 'Selected' : `Choose ${f.name}`}
                  variant={fare === f.id ? 'primary' : 'secondary'}
                  onPress={() => setFare(f.id)}
                />
              </Card>
            ))}
            <Text style={styles.price}>Total {money(total)}</Text>
            <Button
              title="Continue to seats"
              onPress={() => {
                setSeatLeg('outbound');
                setEditing(undefined);
                go('seats');
              }}
            />
            <Button title="Back to flights" variant="secondary" onPress={() => go('results')} />
          </>
        )}
        {view === 'seats' && seatFlight && (
          <>
            <Heading
              title="Choose your seats"
              subtitle={`${seatLeg === 'outbound' ? 'Outbound' : 'Return'} · ${seatFlight.from} to ${seatFlight.to} · ${seatFlight.aircraft}. Select ${passengerCount} seat${passengerCount > 1 ? 's' : ''}.`}
            />
            <Row style={{ justifyContent: 'center' }}>
              <Text style={styles.small}>□ Available</Text>
              <Text style={styles.small}>■ Selected</Text>
              <Text style={styles.small}>× Occupied</Text>
            </Row>
            <Card style={styles.airplane}>
              <Text style={[styles.time, { textAlign: 'center', marginBottom: 20 }]}>✈</Text>
              <Row style={{ justifyContent: 'center' }}>
                {'ABC DEF'.split('').map((letter, i) => (
                  <Text style={letter === ' ' ? styles.rowNumber : styles.seatLetter} key={i}>
                    {letter}
                  </Text>
                ))}
              </Row>
              {Array.from({ length: 12 }, (_, row) => (
                <Row style={{ justifyContent: 'center', gap: 5, flexWrap: 'nowrap' }} key={row}>
                  {'ABC DEF'.split('').map((letter, i) => {
                    if (letter === ' ')
                      return (
                        <Text style={styles.rowNumber} key={i}>
                          {row + 1}
                        </Text>
                      );
                    const seat = `${row + 1}${letter}`,
                      selected = selectedSeats.includes(seat),
                      occupied =
                        unavailableSeats(seatFlight.id).includes(seat) &&
                        !(seatLeg === 'outbound' ? editing?.seats : editing?.returnSeats)?.includes(
                          seat,
                        );
                    return (
                      <TouchableOpacity
                        key={seat}
                        accessibilityRole="button"
                        accessibilityLabel={`Seat ${seat}${occupied ? ', occupied' : ''}${selected ? ', selected' : ''}`}
                        accessibilityState={{
                          selected,
                          disabled: occupied && bug !== 'seat-conflict',
                        }}
                        disabled={occupied && bug !== 'seat-conflict'}
                        style={[
                          styles.seat,
                          occupied && styles.occupiedSeat,
                          selected && styles.selectedSeat,
                        ]}
                        onPress={() => {
                          if (selected) setSelectedSeats(selectedSeats.filter((s) => s !== seat));
                          else if (selectedSeats.length < passengerCount)
                            setSelectedSeats([...selectedSeats, seat]);
                          else
                            setError(
                              `Deselect a seat before choosing another. Select ${passengerCount} seat${passengerCount > 1 ? 's' : ''}.`,
                            );
                        }}
                      >
                        <Text style={[styles.seatText, selected && { color: '#fff' }]}>
                          {selected ? '✓' : occupied ? '×' : seat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </Row>
              ))}
            </Card>
            <Card>
              <Text style={styles.medium}>
                Your seats: {selectedSeats.length ? selectedSeats.join(', ') : 'Not selected'}
              </Text>
              <Text style={styles.small}>
                Window seats A and F · Aisle seats C and D. Seat selection is included.
              </Text>
            </Card>
            <Button
              title={
                editing
                  ? seatLeg === 'outbound' && editing.inbound
                    ? 'Choose return seats'
                    : 'Save seats'
                  : seatLeg === 'outbound' && inbound
                    ? 'Choose return seats'
                    : 'Continue to checkout'
              }
              disabled={selectedSeats.length !== passengerCount}
              onPress={finishSeats}
            />
            <Button
              title={editing ? 'Back to my trips' : 'Back to fares'}
              variant="secondary"
              onPress={() => go(editing ? 'bookings' : 'fare')}
            />
          </>
        )}
        {view === 'checkout' && outbound && (
          <>
            <Row>
              {['Travelers', 'Payment', 'Review'].map((title, i) => (
                <Chip
                  key={title}
                  label={`${i + 1}. ${title}`}
                  selected={i === checkoutStep}
                  onPress={() => i < checkoutStep && setCheckoutStep(i)}
                />
              ))}
            </Row>
            <Heading
              testID={checkoutStep === 2 ? 'flight-review-heading' : undefined}
              title={
                checkoutStep === 0
                  ? 'Traveler details'
                  : checkoutStep === 1
                    ? 'Payment details'
                    : 'Review booking'
              }
              subtitle={
                checkoutStep === 0
                  ? 'Enter each traveler’s details as they appear on their travel document.'
                  : checkoutStep === 1
                    ? 'Enter your payment details.'
                    : 'Take a moment to check the details before you book.'
              }
            />
            <Card>
              <Text style={styles.medium}>
                {airport(outbound.from).city} → {airport(outbound.to).city}
              </Text>
              <Text style={styles.small}>
                {shortDate(search.departure)} · {outbound.departure}
                {inbound && ` · Return ${shortDate(search.returnDate)}`}
              </Text>
              <Text style={styles.price}>Total {money(total)}</Text>
              <Text style={styles.small}>
                {search.passengers} traveler{search.passengers > 1 ? 's' : ''} ·{' '}
                {fares.find((f) => f.id === fare)?.name}
              </Text>
            </Card>
            {checkoutStep === 0 && (
              <>
                {travelers.map((p, i) => (
                  <Card key={i}>
                    <Text style={styles.medium}>Traveler {i + 1} · Adult</Text>
                    <Field
                      label="First name"
                      value={p.firstName}
                      onChangeText={(value) =>
                        setTravelers(
                          travelers.map((v, j) => (i === j ? { ...v, firstName: value } : v)),
                        )
                      }
                    />
                    <Field
                      label="Last name"
                      value={p.lastName}
                      onChangeText={(value) =>
                        setTravelers(
                          travelers.map((v, j) => (i === j ? { ...v, lastName: value } : v)),
                        )
                      }
                    />
                    <Field
                      label="Date of birth"
                      placeholder="YYYY-MM-DD"
                      value={p.birthDate}
                      onChangeText={(value) =>
                        setTravelers(
                          travelers.map((v, j) => (i === j ? { ...v, birthDate: value } : v)),
                        )
                      }
                    />
                  </Card>
                ))}
                <Card>
                  <Field
                    label="Email address"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </Card>
              </>
            )}
            {checkoutStep === 1 && (
              <Card>
                <Text style={styles.medium}>Payment details</Text>
                <Text style={styles.body}>Sample card</Text>
                <Text style={styles.small}>
                  4242 4242 4242 4242 · Expiry 12/30 · Security code 123
                </Text>
                <Button
                  title="Use sample"
                  variant="secondary"
                  onPress={() =>
                    setPayment({
                      name: 'Alex Morgan',
                      number: '4242 4242 4242 4242',
                      expiry: '12/30',
                      cvc: '123',
                    })
                  }
                />
                <Field
                  label="Name on card"
                  value={payment.name}
                  onChangeText={(name) => setPayment({ ...payment, name })}
                />
                <Field
                  label="Card number"
                  keyboardType="numeric"
                  value={payment.number}
                  onChangeText={(number) => setPayment({ ...payment, number })}
                />
                <Field
                  label="Expiry date"
                  placeholder="MM/YY"
                  value={payment.expiry}
                  onChangeText={(expiry) => setPayment({ ...payment, expiry })}
                />
                <Field
                  label="Security code"
                  keyboardType="numeric"
                  maxLength={3}
                  value={payment.cvc}
                  onChangeText={(cvc) => setPayment({ ...payment, cvc })}
                />
              </Card>
            )}
            {checkoutStep === 2 && (
              <>
                <Card>
                  <Text style={styles.medium}>Travelers & seats</Text>
                  {travelers.map((p, i) => (
                    <View key={i}>
                      <Text style={styles.body}>
                        {p.firstName} {p.lastName}
                      </Text>
                      <Text style={styles.small}>
                        Outbound seat {seats[i]}
                        {inbound && ` · Return seat ${returnSeats[i]}`}
                      </Text>
                    </View>
                  ))}
                  <Text style={styles.small}>Confirmation for {email}</Text>
                  <Button
                    title="Edit details"
                    variant="secondary"
                    onPress={() => setCheckoutStep(0)}
                  />
                </Card>
                <Card>
                  <Text style={styles.medium}>Payment</Text>
                  <Text style={styles.body}>Visa ending in 4242 · {payment.name}</Text>
                  <Text style={styles.medium}>Fare conditions</Text>
                  <Text style={styles.body}>
                    {fare === 'flex'
                      ? 'Your Flex fare includes free changes and cancellation.'
                      : fare === 'standard'
                        ? 'Your Standard fare includes changes for $40. Cancellation receives a travel credit less a $40 fee.'
                        : 'Your Light fare is non-changeable. Cancellation is available without a refund.'}
                  </Text>
                  <Row>
                    <Switch
                      testID="flight-accept-terms"
                      accessibilityLabel="I have reviewed the trip details and accept the fare conditions."
                      value={terms}
                      onValueChange={setTerms}
                    />
                    <Text style={[styles.small, { flex: 1 }]}>
                      I have reviewed the trip details and accept the fare conditions.
                    </Text>
                  </Row>
                </Card>
              </>
            )}
            <Button
              title={
                loading
                  ? 'Confirming your booking…'
                  : checkoutStep === 0
                    ? 'Continue to payment'
                    : checkoutStep === 1
                      ? 'Review booking'
                      : `Confirm booking · ${money(total)}`
              }
              disabled={loading}
              onPress={checkoutStep === 2 ? confirm : nextCheckout}
            />
            <Button
              title={checkoutStep ? 'Previous step' : 'Back to seats'}
              variant="secondary"
              onPress={() => (checkoutStep ? setCheckoutStep(checkoutStep - 1) : go('seats'))}
            />
          </>
        )}
        {view === 'confirmation' && confirmed && (
          <>
            <View style={styles.confirmationMark}>
              <Text style={{ fontSize: 34, color: colors.primary }}>✓</Text>
            </View>
            <Heading title="Booking confirmed" />
            <Card>
              <Text style={styles.label}>Booking reference</Text>
              <Text style={styles.reference}>{confirmed.reference}</Text>
              <Text style={styles.price}>
                {confirmed.outbound.from} → {confirmed.outbound.to}
              </Text>
              <Text style={styles.body}>
                Departure {shortDate(confirmed.departureDate)} · {confirmed.outbound.departure}
              </Text>
              {confirmed.inbound && (
                <Text style={styles.body}>
                  Return {shortDate(confirmed.returnDate)} · {confirmed.inbound.departure}
                </Text>
              )}
              <Text style={styles.body}>
                {confirmed.passengers.length} traveler{confirmed.passengers.length > 1 ? 's' : ''} ·
                Seats {confirmed.seats.join(', ')}
              </Text>
              <Text style={styles.price}>Total {money(confirmed.total)}</Text>
            </Card>
            <Button title="Manage your booking" onPress={() => go('bookings')} />
          </>
        )}
        {view === 'bookings' && (
          <>
            <Heading title="My trips" subtitle="View bookings, change seats, or cancel a trip." />
            <Field
              label="Find a booking"
              placeholder="Search by reference or destination"
              value={lookup}
              onChangeText={setLookup}
            />
            <Row>
              {['all', 'confirmed', 'cancelled'].map((s) => (
                <Chip
                  key={s}
                  label={
                    s === 'all' ? 'All bookings' : s === 'confirmed' ? 'Confirmed' : 'Cancelled'
                  }
                  selected={status === s}
                  onPress={() => setStatus(s)}
                />
              ))}
            </Row>
            {bookings
              .filter(
                (b) =>
                  (status === 'all' || b.status === status) &&
                  `${b.reference} ${airport(b.outbound.to).city} ${b.outbound.to}`
                    .toLowerCase()
                    .includes(lookup.toLowerCase()),
              )
              .map((b) => (
                <Card key={b.reference}>
                  <Row>
                    <Text
                      style={[
                        styles.status,
                        { color: b.status === 'confirmed' ? colors.primary : colors.danger },
                      ]}
                    >
                      {b.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                    </Text>
                    <Text style={styles.small}>Booking {b.reference}</Text>
                  </Row>
                  <Text style={styles.price}>
                    {airport(b.outbound.from).city} → {airport(b.outbound.to).city}
                  </Text>
                  <Text style={styles.body}>
                    {shortDate(b.departureDate)} · {b.outbound.departure}–{b.outbound.arrival}
                  </Text>
                  <Text style={styles.small}>
                    {b.outbound.airline} · {b.inbound ? 'Round trip' : 'One way'} ·{' '}
                    {fares.find((f) => f.id === b.fare)?.name}
                  </Text>
                  <Text style={styles.body}>
                    {b.passengers.map((p) => `${p.firstName} ${p.lastName}`).join(', ')}
                  </Text>
                  <Text style={styles.small}>
                    Seats {b.seats.join(', ')}
                    {b.inbound &&
                      ` · Return ${shortDate(b.returnDate)}, seats ${b.returnSeats.join(', ')}`}
                  </Text>
                  <Text style={styles.price}>{money(b.total)}</Text>
                  {b.status === 'confirmed' ? (
                    <>
                      <Button
                        title="View booking"
                        variant="secondary"
                        onPress={() => {
                          setConfirmed(b);
                          go('confirmation');
                        }}
                      />
                      <Button
                        title="Change seats"
                        variant="secondary"
                        onPress={() => {
                          setEditing(b);
                          setSeats(b.seats);
                          setReturnSeats(b.returnSeats);
                          setSeatLeg('outbound');
                          go('seats');
                        }}
                      />
                      <Button title="Cancel booking" variant="danger" onPress={() => cancel(b)} />
                    </>
                  ) : (
                    <Text style={styles.small}>
                      {b.fare === 'flex'
                        ? `Refund of ${money(b.total)} recorded.`
                        : b.fare === 'standard'
                          ? `Travel credit of ${money(Math.max(0, b.total - 40))} recorded.`
                          : 'Cancelled under Light fare conditions. No refund.'}
                    </Text>
                  )}
                </Card>
              ))}
            {!bookings.some(
              (b) =>
                (status === 'all' || b.status === status) &&
                `${b.reference} ${airport(b.outbound.to).city} ${b.outbound.to}`
                  .toLowerCase()
                  .includes(lookup.toLowerCase()),
            ) && (
              <Empty
                title="No trips found"
                detail="Try another reference or destination, or plan a new trip."
              />
            )}
            <Button title="Plan another trip" onPress={() => go('search')} />
          </>
        )}
        {Boolean(error) && (
          <View accessibilityRole="alert" style={styles.error}>
            <Text style={{ fontSize: 12, color: colors.danger, lineHeight: 19 }}>{error}</Text>
          </View>
        )}
      </Screen>
      <Modal
        visible={Boolean(picker)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPicker('')}
      >
        <SafeModalArea style={{ backgroundColor: colors.background }}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>
              {picker === 'from'
                ? 'Flying from'
                : picker === 'to'
                  ? 'Flying to'
                  : picker === 'dates'
                    ? 'Travel dates'
                    : 'Travelers'}
            </Text>
            <Button title="Done" variant="secondary" onPress={() => setPicker('')} />
          </View>
          {(picker === 'from' || picker === 'to') && (
            <View style={{ flex: 1, padding: 20 }}>
              <Field
                label="Search airports"
                autoFocus
                placeholder="City, airport, or code"
                value={query}
                onChangeText={setQuery}
              />
              <FlatList
                data={airports.filter((a) =>
                  `${a.code} ${a.city} ${a.name}`.toLowerCase().includes(query.toLowerCase()),
                )}
                keyExtractor={(a) => a.code}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Empty title="No airports found" detail="Try another city or airport code." />
                }
                renderItem={({ item: a }) => (
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.airportOption}
                    onPress={() => {
                      setSearch({ ...search, [picker]: a.code });
                      setPicker('');
                    }}
                  >
                    <Text style={styles.airportCode}>{a.code}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.medium}>{a.city}</Text>
                      <Text style={styles.small}>{a.name}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
          {picker === 'dates' && (
            <Screen>
              <Row>
                <Chip
                  label={`Departure ${shortDate(search.departure)}`}
                  selected={datePart === 'departure'}
                  onPress={() => selectDatePart('departure')}
                />
                {search.roundTrip && (
                  <Chip
                    label={`Return ${shortDate(search.returnDate)}`}
                    selected={datePart === 'returnDate'}
                    onPress={() => selectDatePart('returnDate')}
                  />
                )}
              </Row>
              <Field
                label={
                  datePart === 'departure'
                    ? 'Departure date (YYYY-MM-DD)'
                    : 'Return date (YYYY-MM-DD)'
                }
                testID="flight-exact-travel-date"
                placeholder="YYYY-MM-DD"
                value={exactDate}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
                onChangeText={(text) => {
                  setExactDate(text);
                  setDateError('');
                }}
              />
              {dateError ? (
                <Text accessibilityRole="alert" style={{ color: colors.danger }}>
                  {dateError}
                </Text>
              ) : null}
              <Button title="Use date" variant="secondary" onPress={() => chooseDate(exactDate)} />
              <Row style={{ justifyContent: 'space-between' }}>
                <Button
                  title="‹"
                  testID="flight-previous-month"
                  disabled={month === '0001-01'}
                  variant="secondary"
                  onPress={() => setMonth(addDays(`${month}-01`, -1).slice(0, 7))}
                />
                <Text style={styles.medium}>
                  {shortDate(`${month}-01`, { month: 'long', year: 'numeric' })}
                </Text>
                <Button
                  title="›"
                  testID="flight-next-month"
                  disabled={month === '9999-12'}
                  variant="secondary"
                  onPress={() => setMonth(addDays(`${month}-${days}`, 1).slice(0, 7))}
                />
              </Row>
              <View style={styles.calendar}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <View style={styles.calendarCell} key={`weekday-${i}`}>
                    <Text style={styles.small}>{d}</Text>
                  </View>
                ))}
                {Array.from({ length: start }, (_, i) => (
                  <View key={`empty-${i}`} style={styles.calendarCell} />
                ))}
                {Array.from({ length: days }, (_, i) => {
                  const value = `${month}-${String(i + 1).padStart(2, '0')}`,
                    selected =
                      value === search.departure ||
                      (search.roundTrip && value === search.returnDate);
                  return (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={value}
                      accessibilityState={{ selected }}
                      disabled={datePart === 'returnDate' && value < search.departure}
                      key={value}
                      style={[
                        styles.calendarCell,
                        selected && styles.calendarSelected,
                        search.roundTrip &&
                          value > search.departure &&
                          value < search.returnDate &&
                          styles.calendarRange,
                      ]}
                      onPress={() => chooseDate(value)}
                    >
                      <Text style={[styles.body, selected && { color: '#fff' }]}>{i + 1}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Screen>
          )}
          {picker === 'passengers' && (
            <Screen>
              <Card>
                <Text style={styles.medium}>Adults</Text>
                <Text style={styles.small}>Age 12 and above</Text>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Button
                    title="Remove traveler"
                    variant="secondary"
                    disabled={search.passengers === 1}
                    onPress={() => setSearch({ ...search, passengers: search.passengers - 1 })}
                  />
                  <Text style={styles.price}>{search.passengers}</Text>
                  <Button
                    title="Add traveler"
                    variant="secondary"
                    disabled={search.passengers === 6}
                    onPress={() => setSearch({ ...search, passengers: search.passengers + 1 })}
                  />
                </Row>
              </Card>
            </Screen>
          )}
        </SafeModalArea>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  subnav: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#fff',
  },
  searchField: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 9,
  },
  label: { fontSize: 10, color: colors.muted, fontWeight: '500' },
  medium: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  small: { fontSize: 10, color: colors.muted, lineHeight: 17 },
  muted: { color: colors.muted, fontSize: 15 },
  body: { fontSize: 12, color: colors.ink, lineHeight: 20 },
  airportCode: { fontSize: 19, fontWeight: '600', color: colors.primary, minWidth: 50 },
  datePrice: {
    width: 74,
    gap: 7,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 0,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  datePriceSelected: { borderBottomWidth: 2, borderColor: colors.primary },
  time: { fontSize: 25, letterSpacing: -0.5, color: colors.ink },
  price: { fontSize: 22, fontWeight: '600', letterSpacing: -0.6, color: colors.ink },
  airplane: {
    paddingHorizontal: 12,
    paddingVertical: 28,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    gap: 9,
  },
  seat: {
    height: 35,
    width: 35,
    borderRadius: 2,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: '#aac09d',
    backgroundColor: '#eff5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatText: { fontSize: 9, color: '#627e55' },
  occupiedSeat: { backgroundColor: '#e2e6dc', borderColor: '#d7dfce' },
  selectedSeat: { backgroundColor: colors.primary, borderColor: colors.primary },
  seatLetter: { width: 35, textAlign: 'center', fontSize: 10, color: colors.muted },
  rowNumber: { width: 15, textAlign: 'center', fontSize: 9, color: colors.muted },
  confirmationMark: {
    height: 75,
    width: 75,
    borderRadius: 2,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    margin: 15,
  },
  reference: { fontSize: 28, letterSpacing: 4, fontWeight: '600', color: colors.ink },
  status: {
    fontSize: 10,
    fontWeight: '600',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 6,
    borderRadius: 2,
  },
  error: {
    backgroundColor: '#fbece4',
    borderWidth: 1,
    borderColor: '#ebc9ba',
    padding: 15,
    borderRadius: 2,
  },
  pickerHeader: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: { fontSize: 23, fontWeight: '600', color: colors.ink },
  airportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 19,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  calendar: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  calendarCell: {
    width: '14.2857%',
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderRadius: 2,
  },
  calendarSelected: { backgroundColor: colors.primary },
  calendarRange: { backgroundColor: colors.soft },
});
