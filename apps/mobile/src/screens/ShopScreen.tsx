import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Modal,
  StyleSheet,
  Switch,
  RefreshControl,
  ScrollView,
} from 'react-native';
import {
  products,
  credentials,
  authenticate,
  initialShopState,
  setQuantity,
  cartTotals,
  validateShipping,
  placeOrder,
  cancelOrder,
  type Product,
  type ShopState,
  type Shipping,
} from '@playground/core/shop';
import { money } from '@playground/core';
import { SvgXml } from 'react-native-svg';
import { shopArt } from './ShopArt';
import {
  Screen,
  Card,
  Button,
  Field,
  Row,
  Chip,
  Heading,
  Empty,
  SafeModalArea,
  useSessionState,
  type MobileScreenProps,
} from '../ui';
const blank: Shipping = {
  name: '',
  email: '',
  address: '',
  city: '',
  postalCode: '',
  country: 'United States',
};
const art: Record<string, string> = {
  lamp: '◒',
  mug: '▱',
  notebook: '▤',
  vase: '♧',
  tote: '▢',
  tray: '▱',
  glass: '∪',
  throw: '▧',
  coffee: '▽',
  clock: '◷',
  pens: '╱',
  pouch: '▰',
};
export default function ShopScreen({ route, bug, navigate }: MobileScreenProps) {
  const [state, setState] = useSessionState<ShopState>('shop:v1', initialShopState);
  const [shipping, setShipping] = useSessionState<Shipping>('shop:shipping', blank);
  const [category, setCategory] = useState('All products');
  const [query, setQuery] = useState('');
  const [stock, setStock] = useState(false);
  const [priceFilter, setPriceFilter] = useState('All prices');
  const [countryOpen, setCountryOpen] = useState(false);
  const [sort, setSort] = useState('Featured');
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQty] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [step, setStep] = useState(1);
  const [delivery, setDelivery] = useState<'standard' | 'express'>('standard');
  const [refreshing, setRefreshing] = useState(false);
  const [cancel, setCancel] = useState('');
  const current = route || 'catalog';
  const totals = cartTotals(state.cart, delivery, bug);
  const count = state.cart.reduce((n, i) => n + i.quantity, 0);
  const filtered = useMemo(() => {
    const result = products.filter(
      (p) =>
        (category === 'All products' || p.category === category) &&
        `${p.name} ${p.color}`.toLowerCase().includes(query.toLowerCase()) &&
        (!stock || p.stock > 0) &&
        (priceFilter === 'All prices' ||
          (priceFilter === 'Under $50' ? p.price < 5000 : p.price >= 5000)),
    );
    return sort === 'Price: low to high'
      ? result.sort((a, b) => a.price - b.price)
      : sort === 'Price: high to low'
        ? result.sort((a, b) => b.price - a.price)
        : sort === 'Top rated'
          ? result.sort((a, b) => b.rating - a.rating)
          : result;
  }, [category, query, stock, sort, priceFilter]);
  const nav = (next: string) => {
    setError('');
    navigate('shop', next);
  };
  function add(p: Product, q = 1) {
    try {
      const cart = setQuantity(
        state.cart,
        p.id,
        (state.cart.find((i) => i.productId === p.id)?.quantity || 0) + q,
      );
      setState({ ...state, cart });
      setSelected(null);
      setNotice(`${p.name} added to your bag`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function quantityChange(id: string, q: number) {
    try {
      setState({ ...state, cart: setQuantity(state.cart, id, q) });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const summary = (
    <Card>
      <Text style={s.cardTitle}>Order summary</Text>
      <Row>
        <Text>Subtotal</Text>
        <Text>{money(totals.subtotal)}</Text>
      </Row>
      <Row>
        <Text>Shipping</Text>
        <Text>{totals.shippingCost ? money(totals.shippingCost) : 'Free'}</Text>
      </Row>
      <Row>
        <Text style={s.bold}>Total</Text>
        <Text style={s.bold}>{money(totals.total)}</Text>
      </Row>
      <Text style={s.small}>Taxes included.</Text>
    </Card>
  );
  const header = (
    <>
      <Row>
        <Text style={s.brand}>Komazon</Text>
        {state.signedIn ? (
          <Button
            title="Sign out"
            variant="secondary"
            onPress={() => {
              setState({ ...state, signedIn: false });
              nav('catalog');
            }}
          />
        ) : (
          <Button title="Sign in" variant="secondary" onPress={() => nav('signin')} />
        )}
      </Row>
      <Row>
        <Chip label="Shop" selected={current === 'catalog'} onPress={() => nav('catalog')} />
        <Chip label={`Bag (${count})`} selected={current === 'cart'} onPress={() => nav('cart')} />
        <Chip label="Orders" selected={current === 'orders'} onPress={() => nav('orders')} />
      </Row>
      {notice ? (
        <Pressable onPress={() => setNotice('')} accessibilityLabel="Dismiss notification">
          <Text accessibilityLiveRegion="polite" style={s.notice}>
            {notice}
          </Text>
        </Pressable>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
    </>
  );
  const modal = (
    <Modal
      visible={!!selected}
      transparent
      animationType="slide"
      onRequestClose={() => setSelected(null)}
    >
      <SafeModalArea style={s.scrim}>
        <ScrollView style={s.sheetScroll} contentContainerStyle={s.sheetContent}>
          {selected && (
            <>
              <View style={s.largeArt}>
                <SvgXml xml={shopArt[selected.art]} width="100%" height="100%" />
              </View>
              <Heading
                title={selected.name}
                subtitle={`${selected.color} · ${selected.category}`}
              />
              <Text style={s.price}>{money(selected.price)}</Text>
              <Text style={s.body}>{selected.description}</Text>
              <Text style={s.small}>
                {selected.stock} in stock · {selected.rating} stars
              </Text>
              <Row>
                <Button
                  title="−"
                  variant="secondary"
                  onPress={() => setQty(Math.max(1, quantity - 1))}
                />
                <Text accessibilityLabel="Quantity">{quantity}</Text>
                <Button
                  title="+"
                  variant="secondary"
                  disabled={quantity >= selected.stock}
                  onPress={() => setQty(quantity + 1)}
                />
              </Row>
              <Button
                title="Add to bag"
                disabled={!selected.stock}
                onPress={() => add(selected, quantity)}
              />
              <Button title="Close" variant="secondary" onPress={() => setSelected(null)} />
            </>
          )}
        </ScrollView>
      </SafeModalArea>
    </Modal>
  );
  if (current === 'catalog')
    return (
      <View style={s.fill}>
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          numColumns={2}
          contentContainerStyle={s.list}
          columnWrapperStyle={s.columns}
          initialNumToRender={12}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setTimeout(() => {
                  setRefreshing(false);
                  setNotice('Products refreshed');
                }, 400);
              }}
            />
          }
          ListHeaderComponent={
            <View style={s.listHeader}>
              {header}
              <Heading title="Products" />
              <Field
                label="Search products"
                value={query}
                onChangeText={setQuery}
                placeholder="Search products"
              />
              <Row>
                {['All products', 'Living', 'Kitchen', 'Workspace', 'Everyday'].map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    selected={category === c}
                    onPress={() => setCategory(c)}
                  />
                ))}
              </Row>
              <Row>
                <Text>In stock only</Text>
                <Switch accessibilityLabel="In stock only" value={stock} onValueChange={setStock} />
              </Row>
              <Row>
                {['Featured', 'Price: low to high', 'Price: high to low', 'Top rated'].map((o) => (
                  <Chip key={o} label={o} selected={sort === o} onPress={() => setSort(o)} />
                ))}
              </Row>
              <Row>
                {['All prices', 'Under $50', '$50 and above'].map((p) => (
                  <Chip
                    key={p}
                    label={p}
                    selected={priceFilter === p}
                    onPress={() => setPriceFilter(p)}
                  />
                ))}
              </Row>
              <Text style={s.small}>{filtered.length.toLocaleString()} items</Text>
            </View>
          }
          ListEmptyComponent={
            <Empty
              title="No products found"
              detail="Try a different search or clear your filters."
            />
          }
          renderItem={({ item: p }) => (
            <View style={s.product}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View ${p.name}`}
                onPress={() => {
                  setSelected(p);
                  setQty(1);
                }}
              >
                <View
                  style={[
                    s.art,
                    { backgroundColor: p.category === 'Living' ? '#ebece2' : '#f0ede5' },
                  ]}
                >
                  <SvgXml xml={shopArt[p.art]} width="100%" height="100%" />
                  {p.tag ? <Text style={s.tag}>{p.tag}</Text> : null}
                </View>
                <Text style={s.productName}>{p.name}</Text>
                <Text style={s.small}>{p.color}</Text>
                <Text style={s.productPrice}>{money(p.price)}</Text>
              </Pressable>
              <Button
                testID={`shop-add-${p.id}`}
                title={p.stock ? 'Add to bag' : 'Out of stock'}
                variant="secondary"
                disabled={!p.stock}
                onPress={() => add(p)}
              />
            </View>
          )}
        />
        {modal}
      </View>
    );
  if (current === 'signin')
    return (
      <Screen key={`${current}-${step}`}>
        {header}
        <Heading
          testID="shop-signin-heading"
          title="Sign in"
          subtitle="Sign in to check out and keep track of your orders."
        />
        <Field
          label="Email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <Button
          testID="shop-submit-signin"
          title="Sign in"
          onPress={() => {
            if (!authenticate(email, password)) {
              setError('That email and password do not match. Use the sign-in details below.');
              return;
            }
            setState({ ...state, signedIn: true });
            setShipping({
              ...shipping,
              name: shipping.name || credentials.name,
              email: shipping.email || credentials.email,
            });
            setStep(1);
            nav(state.cart.length ? 'checkout' : 'catalog');
          }}
        />
        <Card>
          <Text style={s.bold}>Sign-in details</Text>
          <Text selectable>Email: {credentials.email}</Text>
          <Text selectable>Password: {credentials.password}</Text>
        </Card>
        <Button title="Back to products" variant="secondary" onPress={() => nav('catalog')} />
      </Screen>
    );
  if (current === 'cart')
    return (
      <Screen key={`${current}-${step}`}>
        {header}
        <Heading title={`Your bag (${count})`} />
        {!state.cart.length ? (
          <>
            <Empty title="Your bag is empty" />
            <Button title="Browse products" onPress={() => nav('catalog')} />
          </>
        ) : (
          <>
            {state.cart.map((i) => {
              const p = products.find((p) => p.id === i.productId)!;
              return (
                <Card key={p.id}>
                  <Text style={s.cardTitle}>{p.name}</Text>
                  <Text style={s.small}>
                    {p.color} · {money(p.price)}
                  </Text>
                  <Row>
                    <Button
                      title="−"
                      variant="secondary"
                      onPress={() => quantityChange(p.id, i.quantity - 1)}
                    />
                    <Text accessibilityLabel={`${p.name} quantity`}>{i.quantity}</Text>
                    <Button
                      title="+"
                      variant="secondary"
                      disabled={i.quantity >= p.stock}
                      onPress={() => quantityChange(p.id, i.quantity + 1)}
                    />
                    <Text>{money(p.price * i.quantity)}</Text>
                  </Row>
                  <Button
                    title={`Remove ${p.name}`}
                    variant="secondary"
                    onPress={() => quantityChange(p.id, 0)}
                  />
                </Card>
              );
            })}
            {summary}
            <Button
              title="Continue to checkout"
              onPress={() => {
                setStep(1);
                nav(state.signedIn ? 'checkout' : 'signin');
              }}
            />
          </>
        )}
      </Screen>
    );
  if (current === 'checkout')
    return (
      <Screen key={`${current}-${step}`}>
        {header}
        <Modal
          visible={countryOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setCountryOpen(false)}
        >
          <SafeModalArea style={s.scrim}>
            <View style={s.sheet}>
              <Heading title="Choose a country" />
              {['United States', 'United Kingdom', 'Canada', 'India', 'Australia'].map(
                (country) => (
                  <Chip
                    key={country}
                    label={country}
                    selected={shipping.country === country}
                    onPress={() => {
                      setShipping({ ...shipping, country });
                      setCountryOpen(false);
                    }}
                  />
                ),
              )}
              <Button title="Close" variant="secondary" onPress={() => setCountryOpen(false)} />
            </View>
          </SafeModalArea>
        </Modal>
        <Heading
          title="Checkout"
          subtitle={['1 · Shipping', '2 · Delivery', '3 · Review'][step - 1]}
        />
        {!state.signedIn ? (
          <Button title="Sign in" onPress={() => nav('signin')} />
        ) : !state.cart.length ? (
          <Empty title="Your bag is empty" />
        ) : (
          <>
            {step === 1 ? (
              <>
                <Heading title="Shipping address" />
                {(Object.keys(blank) as (keyof Shipping)[]).map((key) =>
                  key === 'country' ? (
                    <Button
                      key={key}
                      title={`Country: ${shipping.country}`}
                      variant="secondary"
                      onPress={() => setCountryOpen(true)}
                    />
                  ) : (
                    <Field
                      key={key}
                      label={
                        {
                          name: 'Full name',
                          email: 'Email address',
                          address: 'Street address',
                          city: 'City',
                          postalCode: 'Postal code',
                          country: 'Country',
                        }[key]
                      }
                      value={shipping[key]}
                      onChangeText={(value) => setShipping({ ...shipping, [key]: value })}
                      keyboardType={key === 'email' ? 'email-address' : 'default'}
                      autoCapitalize={key === 'email' ? 'none' : 'words'}
                    />
                  ),
                )}
                <Button
                  title="Continue to delivery"
                  onPress={() => {
                    const errors = bug === 'checkout-validation' ? {} : validateShipping(shipping);
                    if (Object.keys(errors).length) {
                      setError(Object.values(errors).join('\n'));
                      return;
                    }
                    setError('');
                    setStep(2);
                  }}
                />
              </>
            ) : step === 2 ? (
              <>
                <Heading title="Delivery method" />
                <Chip
                  label={`Standard delivery · 3–5 business days · ${totals.subtotal >= 10000 ? 'Free' : '$5.00'}`}
                  selected={delivery === 'standard'}
                  onPress={() => setDelivery('standard')}
                />
                <Chip
                  label="Express delivery · 1–2 business days · $12.00"
                  selected={delivery === 'express'}
                  onPress={() => setDelivery('express')}
                />
                <Button title="Review order" onPress={() => setStep(3)} />
                <Button title="Back" variant="secondary" onPress={() => setStep(1)} />
              </>
            ) : (
              <>
                <Heading title="Review order" testID="shop-review-heading" />
                <Card>
                  <Text style={s.cardTitle}>Ship to</Text>
                  <Text style={s.body}>
                    {shipping.name}
                    {'\n'}
                    {shipping.address}
                    {'\n'}
                    {shipping.city}, {shipping.postalCode}
                    {'\n'}
                    {shipping.country}
                    {'\n'}
                    {shipping.email}
                  </Text>
                  <Button title="Edit shipping" variant="secondary" onPress={() => setStep(1)} />
                </Card>
                <Card>
                  <Text>
                    {delivery === 'standard'
                      ? 'Standard delivery · 3–5 business days'
                      : 'Express delivery · 1–2 business days'}
                  </Text>
                  <Button title="Edit delivery" variant="secondary" onPress={() => setStep(2)} />
                </Card>
                {state.cart.map((i) => (
                  <Text key={i.productId}>
                    {products.find((p) => p.id === i.productId)!.name} × {i.quantity}
                  </Text>
                ))}
              </>
            )}
            {summary}
            {step === 3 && (
              <Button
                title={`Place order · ${money(totals.total)}`}
                onPress={() => {
                  try {
                    setState(placeOrder(state, shipping, delivery, bug));
                    nav('success');
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            )}
          </>
        )}
      </Screen>
    );
  if (current === 'success')
    return (
      <Screen key={`${current}-${step}`}>
        {header}
        <View style={s.success}>
          <Text style={s.successIcon}>✓</Text>
          <Heading
            title="Order confirmed"
            subtitle={`Your order ${state.orders[0]?.id || ''} is confirmed.`}
          />

          <Button title="View orders" onPress={() => nav('orders')} />
          <Button title="Continue shopping" variant="secondary" onPress={() => nav('catalog')} />
        </View>
      </Screen>
    );
  return (
    <Screen key={`${current}-${step}`}>
      {header}
      <Heading title="Your orders" />
      {!state.signedIn ? (
        <Button title="Sign in to see your orders" onPress={() => nav('signin')} />
      ) : !state.orders.length ? (
        <Empty title="No orders" detail="When you place an order, you'll find it here." />
      ) : (
        state.orders.map((o) => (
          <Card key={o.id}>
            <Row>
              <Text style={s.cardTitle}>Order {o.id}</Text>
              <Text style={s.status}>{o.status}</Text>
            </Row>
            <Text style={s.small}>November 1, 2026</Text>
            {o.items.map((i) => (
              <Row key={i.productId}>
                <Text style={s.flex}>
                  {products.find((p) => p.id === i.productId)!.name} × {i.quantity}
                </Text>
                <Text>{money(products.find((p) => p.id === i.productId)!.price * i.quantity)}</Text>
              </Row>
            ))}
            <Text style={s.bold}>Total {money(o.total)}</Text>
            <Text style={s.small}>
              Ship to {o.shipping.name} · {o.shipping.city}
            </Text>
            {o.status === 'Confirmed' && (
              <Button title="Cancel order" variant="secondary" onPress={() => setCancel(o.id)} />
            )}
          </Card>
        ))
      )}
      <Modal
        visible={!!cancel}
        transparent
        onRequestClose={() => setCancel('')}
        animationType="slide"
      >
        <SafeModalArea style={s.scrim}>
          <View style={s.sheet}>
            <Heading title={`Cancel order ${cancel}?`} subtitle="This will cancel your order." />
            <Button
              title="Confirm cancellation"
              variant="danger"
              onPress={() => {
                setState(cancelOrder(state, cancel));
                setCancel('');
                setNotice('Order cancelled');
              }}
            />
            <Button title="Keep order" variant="secondary" onPress={() => setCancel('')} />
          </View>
        </SafeModalArea>
      </Modal>
    </Screen>
  );
}
const s = StyleSheet.create({
  fill: { flex: 1 },
  brand: { fontSize: 20, fontWeight: '700', color: '#2e5140' },
  flex: { flex: 1 },
  list: { padding: 16, paddingBottom: 24 },
  columns: { gap: 14 },
  listHeader: { gap: 10, paddingBottom: 12 },
  body: { fontSize: 13, lineHeight: 22, color: '#788570' },
  small: { fontSize: 11, color: '#8c9783', lineHeight: 18 },
  bold: { fontSize: 13, fontWeight: '600', color: '#3b5137' },
  product: { flex: 1, maxWidth: '50%', gap: 8, marginBottom: 16 },
  art: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
    position: 'relative',
  },
  symbol: { fontSize: 72, color: '#748366' },
  tag: {
    position: 'absolute',
    top: 10,
    left: 10,
    fontSize: 8,
    color: '#7b8b6c',
    backgroundColor: '#fffef8',
    padding: 4,
  },
  productName: { fontSize: 12, color: '#3b5137', fontWeight: '500', marginTop: 12, lineHeight: 18 },
  productPrice: { fontSize: 12, color: '#3b5137', marginTop: 5 },
  price: { fontSize: 23, color: '#3b5137' },
  scrim: { flex: 1, backgroundColor: '#17241266', justifyContent: 'flex-end' },
  sheetScroll: {
    maxHeight: '92%',
    backgroundColor: '#fffef9',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  sheetContent: { padding: 16, paddingBottom: 24, gap: 12 },
  sheet: {
    backgroundColor: '#fffef9',
    padding: 16,
    paddingBottom: 24,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    gap: 12,
    maxHeight: '92%',
  },
  largeArt: {
    height: 130,
    backgroundColor: '#edf0e6',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
  },
  largeSymbol: { fontSize: 95, color: '#75886a' },
  cardTitle: { fontSize: 16, fontWeight: '500', color: '#3b5137' },
  notice: {
    backgroundColor: '#e9f1df',
    color: '#50723e',
    padding: 13,
    borderRadius: 2,
    fontSize: 12,
  },
  error: {
    backgroundColor: '#fff0e9',
    color: '#a25438',
    padding: 14,
    lineHeight: 21,
    borderRadius: 2,
    fontSize: 12,
  },
  success: { gap: 16, paddingTop: 24, paddingBottom: 24 },
  successIcon: { fontSize: 42, color: '#5b8148' },
  status: {
    fontSize: 10,
    color: '#5f7e4f',
    backgroundColor: '#ecf2e4',
    padding: 6,
    borderRadius: 2,
  },
});
