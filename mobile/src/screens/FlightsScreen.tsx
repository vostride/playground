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
  BottomTabs,
  Card,
  Chip,
  colors,
  Empty,
  Field,
  Heading,
  Icon,
  IconButton,
  Row,
  SafeModalArea,
  Screen,
  Text,
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
export default function FlightsScreen({ route, bug, navigationKey }: MobileScreenProps) {
  const [search, setSearch] = useSessionState<SearchState>('wayline-search', initialSearch),
    [bookings, setBookings] = useSessionState<Booking[]>('wayline-bookings', [sampleBooking]);
  const [view, setView] = useState<Step>(route.startsWith('bookings') ? 'bookings' : 'search'),
    [picker, setPicker] = useState<
      '' | 'from' | 'to' | 'dates' | 'passengers' | 'filters' | 'sort'
    >(''),
    [query, setQuery] = useState(''),
    [month, setMonth] = useState('2026-11'),
    [datePart, setDatePart] = useState<'departure' | 'returnDate'>('departure'),
    [draftDeparture, setDraftDeparture] = useState(initialSearch.departure),
    [draftReturn, setDraftReturn] = useState(initialSearch.returnDate),
    [exactDate, setExactDate] = useState(initialSearch.departure),
    [dateError, setDateError] = useState(''),
    [calendarWidth, setCalendarWidth] = useState(308);
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
    setEditing(undefined);
    if (route.startsWith('bookings')) setView('bookings');
    else if (route === '') setView('search');
  }, [route, navigationKey]);
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
    const date = part === 'departure' ? draftDeparture : draftReturn;
    setDatePart(part);
    setMonth((date || draftDeparture).slice(0, 7));
    setExactDate(date);
    setDateError('');
  };
  const chooseDate = (date: string, exact = false) => {
    if (!isValidFlightDate(date)) {
      setDateError('Enter a valid date in YYYY-MM-DD format.');
      return;
    }
    if (search.roundTrip && datePart === 'returnDate' && date < draftDeparture && exact) {
      setDateError('Your return date must be on or after your departure.');
      return;
    }
    setMonth(date.slice(0, 7));
    setDateError('');
    if (!search.roundTrip) {
      setSearch({ ...search, departure: date });
      setDraftDeparture(date);
      setExactDate(date);
      setPicker('');
    } else if (datePart === 'departure' || date < draftDeparture) {
      setDraftDeparture(date);
      setDraftReturn('');
      setDatePart('returnDate');
      setExactDate('');
    } else {
      setSearch({ ...search, departure: draftDeparture, returnDate: date });
      setDraftReturn(date);
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
    <View style={styles.root}>
      <Screen
        key={`${view}-${leg}-${seatLeg}-${checkoutStep}`}
        refreshControl={
          view === 'bookings' ? (
            <RefreshControl
              refreshing={loading}
              tintColor={colors.ink}
              colors={[colors.ink]}
              progressBackgroundColor={colors.surface}
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
            <View style={styles.searchForm}>
              <Row style={styles.tripType}>
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
                <View style={{ flex: 1 }} />
                <Text style={styles.small}>Economy</Text>
              </Row>
              <Row style={styles.sectionHeader}>
                <Text style={styles.label}>Airports</Text>
                <IconButton
                  icon="arrowUpDown"
                  label="Swap departure and arrival"
                  testID="button-swap-departure-and-arrival"
                  onPress={() => setSearch({ ...search, from: search.to, to: search.from })}
                />
              </Row>
              {(['from', 'to'] as const).map((key) => (
                <TouchableOpacity
                  testID={`flight-${key}-picker`}
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
                    <Icon name="chevronDown" size={18} color={colors.muted} />
                  </Row>
                </TouchableOpacity>
              ))}
              <View style={styles.searchDetails}>
                <TouchableOpacity
                  testID="flight-dates-picker"
                  accessibilityRole="button"
                  accessibilityLabel={`Travel dates: ${shortDate(search.departure)}${search.roundTrip ? ` – ${shortDate(search.returnDate)}` : ''}`}
                  style={[styles.searchField, styles.searchDetail]}
                  onPress={() => {
                    setPicker('dates');
                    setDraftDeparture(search.departure);
                    setDraftReturn(search.roundTrip ? search.returnDate : '');
                    setDatePart('departure');
                    setMonth(search.departure.slice(0, 7));
                    setExactDate(search.departure);
                    setDateError('');
                  }}
                >
                  <Row style={styles.fieldLabel}>
                    <Icon name="calendar" size={16} color={colors.muted} />
                    <Text style={styles.label}>Travel dates</Text>
                  </Row>
                  <Text style={styles.medium}>
                    {shortDate(search.departure)}
                    {search.roundTrip && ` – ${shortDate(search.returnDate)}`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="flight-travelers-picker"
                  accessibilityRole="button"
                  accessibilityLabel={`Travelers: ${search.passengers} adult${search.passengers > 1 ? 's' : ''}`}
                  style={[styles.searchField, styles.searchDetail]}
                  onPress={() => setPicker('passengers')}
                >
                  <Row style={styles.fieldLabel}>
                    <Icon name="user" size={16} color={colors.muted} />
                    <Text style={styles.label}>Travelers</Text>
                  </Row>
                  <Text style={styles.medium}>
                    {search.passengers} adult{search.passengers > 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
              </View>
              <Button title="Search flights" onPress={runSearch} />
            </View>
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
              <Row style={styles.dateStrip}>
                {flightDateWindow(date).map((next) => {
                  return (
                    <TouchableOpacity
                      key={next}
                      testID={`flight-price-date-${next}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: next === date }}
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
            <View style={styles.resultTools}>
              <TouchableOpacity
                testID="flight-open-filters"
                accessibilityRole="button"
                accessibilityLabel="Filters"
                style={styles.toolButton}
                onPress={() => setPicker('filters')}
              >
                <Icon name="sliders" size={18} color={colors.ink} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.medium}>Filters</Text>
                  <Text style={styles.small}>
                    {nonstop ||
                    selectedAirlines.length ||
                    departureTime !== 'any' ||
                    maxPrice !== '1000'
                      ? `${Number(nonstop) + selectedAirlines.length + Number(departureTime !== 'any') + Number(maxPrice !== '1000')} active`
                      : 'All flights'}
                  </Text>
                </View>
                <Icon name="chevronDown" size={16} color={colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                testID="flight-open-sort"
                accessibilityRole="button"
                accessibilityLabel="Sort flights"
                style={styles.toolButton}
                onPress={() => setPicker('sort')}
              >
                <Icon name="arrowUpDown" size={18} color={colors.ink} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.medium}>Sort</Text>
                  <Text style={styles.small}>
                    {sort === 'cheapest'
                      ? 'Lowest price'
                      : sort === 'fastest'
                        ? 'Shortest duration'
                        : sort === 'earliest'
                          ? 'Earliest departure'
                          : 'Recommended'}
                  </Text>
                </View>
                <Icon name="chevronDown" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <Text testID="flight-results-count" style={styles.small}>
              {results.length} flights found
            </Text>
            {loading ? (
              <ActivityIndicator color={colors.primary} accessibilityLabel="Searching flights" />
            ) : results.length ? (
              results.map((f, index) => (
                <Card key={f.id} style={styles.flightResult}>
                  <Row style={styles.airlineRow}>
                    <Icon name="plane" size={18} color={colors.muted} />
                    <Text testID={`flight-result-${index}-summary`} style={styles.medium}>
                      {f.airline} <Text style={styles.small}>{f.number}</Text>
                    </Text>
                  </Row>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View>
                      <Text style={styles.time}>{f.departure}</Text>
                      <Text style={styles.small}>{f.from}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={styles.small}>{durationLabel(f.duration)}</Text>
                      <View style={styles.flightPath}>
                        <View style={styles.flightPathLine} />
                        <Icon name="plane" size={15} color={colors.muted} />
                        <View style={styles.flightPathLine} />
                      </View>
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
                    <Text testID={`flight-result-${index}-price`} style={styles.price}>
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
                <Row style={styles.sectionHeader}>
                  <Text style={styles.fareName}>{f.name}</Text>
                  {fare === f.id && <Icon name="check" size={20} color={colors.ink} />}
                </Row>
                <Text style={styles.price}>
                  {f.extra ? `+${money(f.extra)}` : 'Included'}{' '}
                  <Text style={styles.small}>
                    {f.extra ? 'per traveler, per flight' : 'in your flight price'}
                  </Text>
                </Text>
                {f.features.map((feature) => (
                  <Row key={feature} style={styles.featureRow}>
                    <Icon name="check" size={15} color={colors.muted} />
                    <Text style={[styles.body, { flex: 1 }]}>{feature}</Text>
                  </Row>
                ))}
                <Button
                  testID={`flight-fare-${f.id}`}
                  title={fare === f.id ? 'Selected' : `Choose ${f.name}`}
                  variant={fare === f.id ? 'primary' : 'secondary'}
                  onPress={() => setFare(f.id)}
                />
              </Card>
            ))}
            <Text testID="flight-fare-total" style={styles.price}>
              Total {money(total)}
            </Text>
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
            <Row style={styles.seatLegend}>
              <Row style={styles.legendItem}>
                <View style={styles.availableSwatch} />
                <Text style={styles.small}>Available</Text>
              </Row>
              <Row style={styles.legendItem}>
                <View style={[styles.availableSwatch, styles.selectedSeat]} />
                <Text style={styles.small}>Selected</Text>
              </Row>
              <Row style={styles.legendItem}>
                <Icon name="x" size={14} color={colors.muted} />
                <Text style={styles.small}>Occupied</Text>
              </Row>
            </Row>
            <ScrollView horizontal contentContainerStyle={styles.seatScroll}>
              <View style={styles.airplane}>
                <View style={styles.cabinHeader}>
                  <Icon name="plane" size={22} color={colors.muted} />
                  <Text style={styles.label}>Front of cabin</Text>
                </View>
                <Row style={styles.seatRow}>
                  {'ABC DEF'.split('').map((letter, i) => (
                    <Text style={letter === ' ' ? styles.rowNumber : styles.seatLetter} key={i}>
                      {letter}
                    </Text>
                  ))}
                </Row>
                {Array.from({ length: 12 }, (_, row) => (
                  <Row style={styles.seatRow} key={row}>
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
                          !(
                            seatLeg === 'outbound' ? editing?.seats : editing?.returnSeats
                          )?.includes(seat);
                      return (
                        <TouchableOpacity
                          key={seat}
                          testID={`flight-seat-${seat}`}
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
                          {selected ? (
                            <Icon name="check" size={18} color={colors.background} />
                          ) : occupied ? (
                            <Icon name="x" size={17} color={colors.muted} />
                          ) : (
                            <Text style={styles.seatText}>{seat}</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </Row>
                ))}
              </View>
            </ScrollView>
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
                      testID={i === 0 ? 'field-first-name' : `flight-traveler-${i + 1}-first-name`}
                      value={p.firstName}
                      onChangeText={(value) =>
                        setTravelers(
                          travelers.map((v, j) => (i === j ? { ...v, firstName: value } : v)),
                        )
                      }
                    />
                    <Field
                      label="Last name"
                      testID={i === 0 ? 'field-last-name' : `flight-traveler-${i + 1}-last-name`}
                      value={p.lastName}
                      onChangeText={(value) =>
                        setTravelers(
                          travelers.map((v, j) => (i === j ? { ...v, lastName: value } : v)),
                        )
                      }
                    />
                    <Field
                      label="Date of birth"
                      testID={
                        i === 0 ? 'field-date-of-birth' : `flight-traveler-${i + 1}-birth-date`
                      }
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
                <View style={styles.pairedFields}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Expiry date"
                      placeholder="MM/YY"
                      value={payment.expiry}
                      onChangeText={(expiry) => setPayment({ ...payment, expiry })}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Security code"
                      keyboardType="numeric"
                      maxLength={3}
                      value={payment.cvc}
                      onChangeText={(cvc) => setPayment({ ...payment, cvc })}
                    />
                  </View>
                </View>
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
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor={terms ? colors.background : colors.muted}
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
              <Icon name="check" size={24} color={colors.ink} />
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
              <Text testID="flight-confirmation-total" style={styles.price}>
                Total {money(confirmed.total)}
              </Text>
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
                      testID={`flight-booking-${b.reference}-status`}
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
                  <Text testID={`flight-booking-${b.reference}-seats`} style={styles.small}>
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
                    <Text testID={`flight-booking-${b.reference}-refund`} style={styles.small}>
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
            <Text testID="flight-error" style={styles.errorText}>
              {error}
            </Text>
          </View>
        )}
      </Screen>
      <BottomTabs
        tabs={[
          { id: 'search', label: 'Search', icon: 'search', testID: 'flight-tab-search' },
          { id: 'bookings', label: 'My trips', icon: 'ticket', testID: 'flight-tab-bookings' },
        ]}
        active={view === 'bookings' || view === 'confirmation' || editing ? 'bookings' : 'search'}
        onSelect={(next) => {
          setEditing(undefined);
          go(next === 'bookings' ? 'bookings' : 'search');
        }}
      />
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
                    : picker === 'filters'
                      ? 'Filters'
                      : picker === 'sort'
                        ? 'Sort flights'
                        : 'Travelers'}
            </Text>
            <Row>
              {picker === 'dates' && search.roundTrip && !draftReturn && (
                <IconButton icon="x" label="Cancel date selection" onPress={() => setPicker('')} />
              )}
              <Button
                title="Done"
                variant="secondary"
                disabled={picker === 'dates' && search.roundTrip && !draftReturn}
                onPress={() => setPicker('')}
              />
            </Row>
          </View>
          {(picker === 'from' || picker === 'to') && (
            <View style={{ flex: 1, padding: 16 }}>
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
                    testID={`flight-airport-${a.code}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.city} (${a.code}), ${a.name}`}
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
                  label={`Departure ${shortDate(draftDeparture)}`}
                  selected={datePart === 'departure'}
                  onPress={() => selectDatePart('departure')}
                />
                {search.roundTrip && (
                  <Chip
                    label={`Return ${draftReturn ? shortDate(draftReturn) : 'Select date'}`}
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
              <Button
                title="Use date"
                variant="secondary"
                onPress={() => chooseDate(exactDate, true)}
              />
              <Row style={{ justifyContent: 'space-between' }}>
                <IconButton
                  icon="arrowLeft"
                  label="Previous month"
                  testID="flight-previous-month"
                  disabled={month === '0001-01'}
                  onPress={() => setMonth(addDays(`${month}-01`, -1).slice(0, 7))}
                />
                <Text style={styles.medium}>
                  {shortDate(`${month}-01`, { month: 'long', year: 'numeric' })}
                </Text>
                <IconButton
                  icon="arrowRight"
                  label="Next month"
                  testID="flight-next-month"
                  disabled={month === '9999-12'}
                  onPress={() => setMonth(addDays(`${month}-${days}`, 1).slice(0, 7))}
                />
              </Row>
              <View
                onLayout={(event) =>
                  setCalendarWidth(Math.max(308, event.nativeEvent.layout.width))
                }
              >
                <ScrollView horizontal>
                  <View style={[styles.calendar, { width: calendarWidth }]}>
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
                          value === draftDeparture || (search.roundTrip && value === draftReturn);
                      return (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={value}
                          accessibilityState={{ selected }}
                          key={value}
                          style={[
                            styles.calendarCell,
                            selected && styles.calendarSelected,
                            search.roundTrip &&
                              Boolean(draftReturn) &&
                              value > draftDeparture &&
                              value < draftReturn &&
                              styles.calendarRange,
                          ]}
                          onPress={() => chooseDate(value)}
                        >
                          <Text
                            style={[
                              styles.body,
                              selected && { color: colors.background, fontWeight: '600' },
                            ]}
                          >
                            {i + 1}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </Screen>
          )}
          {picker === 'filters' && (
            <Screen>
              <Row style={styles.filterToggle}>
                <Text style={[styles.body, { flex: 1 }]}>Nonstop only</Text>
                <Switch
                  testID="flight-nonstop-filter"
                  accessibilityLabel="Nonstop only"
                  value={nonstop}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={nonstop ? colors.background : colors.muted}
                  onValueChange={setNonstop}
                />
              </Row>
              <View style={styles.filterSection}>
                <Text style={styles.label}>Departure time</Text>
                <Row>
                  {[
                    { id: 'any', label: 'Any time' },
                    { id: 'morning', label: 'Morning · before 12 pm' },
                    { id: 'afternoon', label: 'Afternoon · after 12 pm' },
                  ].map((time) => (
                    <Chip
                      key={time.id}
                      label={time.label}
                      selected={departureTime === time.id}
                      onPress={() => setDepartureTime(time.id)}
                    />
                  ))}
                </Row>
              </View>
              <Field
                label="Maximum flight price"
                keyboardType="numeric"
                value={maxPrice}
                onChangeText={setMaxPrice}
              />
              <View style={styles.filterSection}>
                <Text style={styles.label}>Airlines</Text>
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
                            ? previous.filter((airline) => airline !== name)
                            : [...previous, name],
                        )
                      }
                    />
                  ))}
                </Row>
              </View>
              <Button
                testID="flight-apply-filters"
                title={`Show ${results.length} flights`}
                onPress={() => setPicker('')}
              />
              <Button
                testID="chip-reset"
                title="Reset filters"
                variant="secondary"
                onPress={() => {
                  setNonstop(false);
                  setSelectedAirlines([]);
                  setDepartureTime('any');
                  setMaxPrice('1000');
                }}
              />
            </Screen>
          )}
          {picker === 'sort' && (
            <Screen>
              {[
                { id: 'recommended', label: 'Recommended' },
                { id: 'cheapest', label: 'Lowest price' },
                { id: 'fastest', label: 'Shortest duration' },
                { id: 'earliest', label: 'Earliest departure' },
              ].map((option) => (
                <TouchableOpacity
                  key={option.id}
                  testID={`chip-${option.label.toLowerCase().replaceAll(' ', '-')}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sort === option.id }}
                  style={styles.sortOption}
                  onPress={() => {
                    setSort(option.id);
                    setPicker('');
                  }}
                >
                  <Text style={styles.body}>{option.label}</Text>
                  {sort === option.id && <Icon name="check" size={18} color={colors.ink} />}
                </TouchableOpacity>
              ))}
            </Screen>
          )}
          {picker === 'passengers' && (
            <Screen>
              <Card>
                <Text style={styles.medium}>Adults</Text>
                <Text style={styles.small}>Age 12 and above</Text>
                <Row style={{ justifyContent: 'space-between' }}>
                  <TouchableOpacity
                    testID="button-remove-traveler"
                    accessibilityRole="button"
                    accessibilityLabel="Remove traveler"
                    accessibilityState={{ disabled: search.passengers === 1 }}
                    disabled={search.passengers === 1}
                    style={[styles.counterButton, search.passengers === 1 && { opacity: 0.4 }]}
                    onPress={() => setSearch({ ...search, passengers: search.passengers - 1 })}
                  >
                    <View style={styles.minus} />
                  </TouchableOpacity>
                  <Text testID="flight-traveler-count" style={styles.price}>
                    {search.passengers}
                  </Text>
                  <IconButton
                    icon="plus"
                    label="Add traveler"
                    testID="button-add-traveler"
                    disabled={search.passengers === 6}
                    onPress={() => setSearch({ ...search, passengers: search.passengers + 1 })}
                  />
                </Row>
              </Card>
            </Screen>
          )}
        </SafeModalArea>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  searchForm: { gap: 14 },
  tripType: { gap: 8 },
  sectionHeader: { justifyContent: 'space-between', minHeight: 44 },
  searchField: {
    minHeight: 72,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 7,
  },
  searchDetails: { flexDirection: 'row', gap: 16, marginBottom: 6 },
  searchDetail: { flex: 1, minWidth: 0, alignSelf: 'stretch' },
  fieldLabel: { gap: 6, flexWrap: 'nowrap' },
  label: { fontSize: 12, lineHeight: 18, color: colors.muted, fontWeight: '500' },
  medium: { fontSize: 14, lineHeight: 20, color: colors.ink, fontWeight: '600' },
  small: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 22 },
  airportCode: { fontSize: 26, lineHeight: 32, fontWeight: '600', color: colors.ink, minWidth: 62 },
  resultTools: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  toolButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterToggle: { minHeight: 56, borderBottomWidth: 1, borderColor: colors.border },
  filterSection: { paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderColor: colors.border },
  sortOption: {
    minHeight: 52,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  dateStrip: { gap: 6, flexWrap: 'nowrap' },
  datePrice: {
    width: 96,
    minHeight: 72,
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  datePriceSelected: {
    borderBottomWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.soft,
  },
  flightResult: { paddingVertical: 16, gap: 12 },
  airlineRow: { gap: 8, flexWrap: 'nowrap' },
  flightPath: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 94, marginVertical: 6 },
  flightPathLine: { flex: 1, height: 1, backgroundColor: colors.border },
  time: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '600',
    letterSpacing: -0.7,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  price: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    letterSpacing: -0.5,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  fareName: { fontSize: 20, lineHeight: 26, fontWeight: '600', color: colors.ink },
  featureRow: { gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' },
  seatLegend: { gap: 16, paddingVertical: 8, justifyContent: 'center' },
  legendItem: { gap: 6, flexWrap: 'nowrap' },
  availableSwatch: {
    width: 14,
    height: 14,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.input,
    backgroundColor: colors.surface,
  },
  seatScroll: { flexGrow: 1, justifyContent: 'center' },
  airplane: { width: 312, paddingVertical: 12, gap: 8 },
  cabinHeader: { alignItems: 'center', gap: 8, paddingBottom: 16 },
  seatRow: { justifyContent: 'center', gap: 4, flexWrap: 'nowrap' },
  seat: {
    height: 44,
    width: 44,
    borderRadius: 2,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: colors.input,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatText: { fontSize: 12, fontWeight: '500', color: colors.ink },
  occupiedSeat: { backgroundColor: colors.soft, borderColor: colors.border },
  selectedSeat: { backgroundColor: colors.primary, borderColor: colors.primary },
  seatLetter: { width: 44, textAlign: 'center', fontSize: 12, lineHeight: 18, color: colors.muted },
  rowNumber: { width: 24, textAlign: 'center', fontSize: 12, lineHeight: 18, color: colors.muted },
  pairedFields: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  confirmationMark: {
    height: 44,
    width: 44,
    borderRadius: 2,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reference: {
    fontSize: 26,
    lineHeight: 34,
    letterSpacing: 2,
    fontWeight: '600',
    color: colors.ink,
  },
  status: { fontSize: 12, lineHeight: 18, fontWeight: '600', paddingVertical: 4 },
  error: {
    backgroundColor: colors.dangerSurface,
    borderLeftWidth: 2,
    borderColor: colors.danger,
    padding: 12,
  },
  errorText: { fontSize: 14, color: colors.danger, lineHeight: 22 },
  pickerHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  pickerTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: colors.ink },
  airportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 76,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  counterButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
  },
  minus: { width: 14, height: 2, backgroundColor: colors.ink },
  calendar: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  calendarCell: {
    width: '14.2857%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
  },
  calendarSelected: { backgroundColor: colors.primary },
  calendarRange: { backgroundColor: colors.soft },
});
