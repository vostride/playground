import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  Leaf,
  LogOut,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  Truck,
  User,
  X,
} from 'lucide-react';
import { PlaygroundBanner, useSessionState } from '@playground/ui';
import { money } from '@playground/core';
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
  type Shipping,
  type ShopState,
} from '@playground/core/shop';
import { ProductArt } from './ProductArt';
import './style.css';
const bugs = [
  {
    id: 'cart-total',
    label: 'Incorrect cart total',
    description: 'The bag counts only one of each product, even when the quantity is higher.',
  },
  {
    id: 'checkout-validation',
    label: 'Missing address validation',
    description: 'Checkout accepts incomplete shipping details.',
  },
];
const blankShipping: Shipping = {
  name: '',
  email: '',
  address: '',
  city: '',
  postalCode: '',
  country: 'United States',
};
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || 'catalog');
  useEffect(() => {
    const onHash = () => {
      setRoute(location.hash.slice(1) || 'catalog');
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  return route;
}
function go(route: string) {
  location.hash = route;
}
function Dialog({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button className="icon dialog-close" aria-label="Close dialog" onClick={onClose}>
        <X size={20} />
      </button>
      {children}
    </dialog>
  );
}
function App() {
  const [state, setState] = useSessionState<ShopState>('shop:v1', initialShopState);
  const route = useRoute();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All products');
  const [sort, setSort] = useState('featured');
  const [stockOnly, setStockOnly] = useState(false);
  const [price, setPrice] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(false);
  const [shipping, setShipping] = useSessionState<Shipping>('shop:shipping', blankShipping);
  const [step, setStep] = useState(1);
  const [delivery, setDelivery] = useState<'standard' | 'express'>('standard');
  const [errors, setErrors] = useState<Partial<Record<keyof Shipping, string>>>({});
  const [orderId, setOrderId] = useState('');
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const bug = new URLSearchParams(location.search).get('bug') || '';
  const totals = cartTotals(state.cart, delivery, bug);
  const cartCount = state.cart.reduce((n, i) => n + i.quantity, 0);
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 280);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const title =
      route === 'catalog'
        ? 'Shop'
        : route === 'cart'
          ? 'Cart'
          : route === 'signin'
            ? 'Sign in'
            : route === 'checkout'
              ? 'Checkout'
              : route === 'orders'
                ? 'Orders'
                : route === 'success'
                  ? 'Order confirmed'
                  : 'Shop';
    document.title = `${title} · Fernwood`;
    setError('');
  }, [route]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    setPage(1);
  }, [query, category, sort, stockOnly, price]);
  let filtered = products.filter(
    (p) =>
      (category === 'All products' || p.category === category) &&
      `${p.name} ${p.color}`.toLowerCase().includes(query.toLowerCase()) &&
      (!stockOnly || p.stock > 0) &&
      (price === 'all' || (price === 'under50' ? p.price < 5000 : p.price >= 5000)),
  );
  if (sort === 'price-low') filtered = [...filtered].sort((a, b) => a.price - b.price);
  if (sort === 'price-high') filtered = [...filtered].sort((a, b) => b.price - a.price);
  if (sort === 'rating') filtered = [...filtered].sort((a, b) => b.rating - a.rating);
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const visible = filtered.slice((page - 1) * 12, page * 12);
  function add(product: Product, quantity = 1) {
    try {
      const cart = setQuantity(
        state.cart,
        product.id,
        (state.cart.find((i) => i.productId === product.id)?.quantity || 0) + quantity,
      );
      setState({ ...state, cart });
      setSelected(null);
      setNotice(`${product.name} added to your bag`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function changeQuantity(id: string, quantity: number) {
    try {
      const cart = setQuantity(state.cart, id, quantity);
      setState({ ...state, cart });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function checkout() {
    setStep(1);
    go(state.signedIn ? 'checkout' : 'signin');
  }
  function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (!authenticate(String(data.get('email')), String(data.get('password')))) {
      setError('That email and password do not match. Use the demo credentials below.');
      return;
    }
    setState((s) => ({ ...s, signedIn: true }));
    setShipping((s) => ({
      ...s,
      name: s.name || credentials.name,
      email: s.email || credentials.email,
    }));
    setNotice('Welcome back, Alex');
    go(state.cart.length ? 'checkout' : 'catalog');
  }
  function nextStep(e: FormEvent) {
    e.preventDefault();
    const next = bug === 'checkout-validation' ? {} : validateShipping(shipping);
    setErrors(next);
    if (!Object.keys(next).length) setStep(2);
  }
  function submitOrder() {
    try {
      const next = placeOrder(state, shipping, delivery, bug);
      setOrderId(next.orders[0].id);
      setState(next);
      go('success');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function resetFilters() {
    setQuery('');
    setCategory('All products');
    setStockOnly(false);
    setPrice('all');
    setSort('featured');
  }
  const summary = (
    <div className="order-summary">
      <h2>Order summary</h2>
      <div>
        <span>Subtotal</span>
        <b>{money(totals.subtotal)}</b>
      </div>
      <div>
        <span>Shipping</span>
        <b>{totals.shippingCost ? money(totals.shippingCost) : 'Free'}</b>
      </div>
      <p>Taxes included. No payment will be collected.</p>
      <div className="total">
        <span>Total</span>
        <strong>{money(totals.total)}</strong>
      </div>
      {totals.subtotal < 10000 && totals.subtotal > 0 && (
        <small>Add {money(10000 - totals.subtotal)} for free standard shipping.</small>
      )}
    </div>
  );
  return (
    <>
      <PlaygroundBanner app="Fernwood" bugs={bugs} />
      <header className="site-header">
        <a href="#catalog" className="brand">
          <Leaf size={27} strokeWidth={1.4} />
          fernwood<span>Considered goods. Everyday living.</span>
        </a>
        <nav aria-label="Main navigation">
          <a className={route === 'catalog' ? 'active' : ''} href="#catalog">
            Shop
          </a>
          <a className={route === 'orders' ? 'active' : ''} href="#orders">
            Orders
          </a>
        </nav>
        <div className="header-actions">
          {state.signedIn ? (
            <>
              <span className="account-name">Hi, Alex</span>
              <button
                className="icon"
                aria-label="Sign out"
                title="Sign out"
                onClick={() => {
                  setState((s) => ({ ...s, signedIn: false }));
                  go('catalog');
                  setNotice('You are signed out');
                }}
              >
                <LogOut size={19} />
              </button>
            </>
          ) : (
            <button className="icon" aria-label="Sign in" onClick={() => go('signin')}>
              <User size={20} />
            </button>
          )}
          <button
            className="bag-button"
            onClick={() => go('cart')}
            aria-label={`Shopping bag (${cartCount})`}
          >
            <ShoppingBag size={20} />
            <span>Bag</span>
            <b>{cartCount}</b>
          </button>
        </div>
      </header>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
          <button onClick={() => setNotice('')} aria-label="Dismiss notification">
            <X size={16} />
          </button>
        </div>
      )}
      {error && (
        <div className="error global-error" role="alert">
          {error}
          <button className="text-button" onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}
      {route === 'catalog' && (
        <main className="catalog">
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">THE EVERYDAY COLLECTION</span>
              <h1>
                Good things.
                <br />
                <em>For the everyday.</em>
              </h1>
              <p>
                Thoughtful essentials for the spaces you live in
                <br className="desktop" /> and the moments in between.
              </p>
              <button
                onClick={() =>
                  document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                Find your everyday <ArrowRight size={17} />
              </button>
              <div className="hero-note">
                <span />
                Less, but better. Made to be kept.
              </div>
            </div>
            <div className="hero-art">
              <span className="hero-ring" />
              <ProductArt art="lamp" color="Sand" className="hero-lamp" />
              <ProductArt art="vase" color="Amber" className="hero-vase" />
              <span className="hero-caption">A quieter kind of everyday.</span>
              <span className="hero-edition">01 / THE HOME EDIT</span>
            </div>
          </section>
          <div className="benefits">
            <span>
              <Truck size={17} /> Free shipping on orders $100+
            </span>
            <span>
              <Leaf size={16} /> Thoughtfully made, thoughtfully chosen
            </span>
            <span>
              <Package size={17} /> 30-day returns, no fuss
            </span>
          </div>
          <section id="collection" className="collection">
            <div className="collection-heading">
              <div>
                <span className="eyebrow">FIND YOUR FAVORITES</span>
                <h2>The little things, well made.</h2>
              </div>
              <span className="collection-count">
                {products.length.toLocaleString()} considered essentials
              </span>
            </div>
            <div className="catalog-layout">
              <aside className={`filters ${filters ? 'expanded' : ''}`}>
                <div className="filter-title">
                  Browse collection
                  <button
                    className="icon mobile"
                    aria-label="Close filters"
                    onClick={() => setFilters(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="category-list">
                  {['All products', 'Living', 'Kitchen', 'Workspace', 'Everyday'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={c === category ? 'selected' : ''}
                    >
                      {c}
                      <span>
                        {c === 'All products'
                          ? 1200
                          : products.filter((p) => p.category === c).length}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="filter-group">
                  <h3>Price</h3>
                  {[
                    ['all', 'All prices'],
                    ['under50', 'Under $50'],
                    ['over50', '$50 and above'],
                  ].map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="price"
                        checked={price === value}
                        onChange={() => setPrice(value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="filter-group">
                  <h3>Availability</h3>
                  <label>
                    <input
                      type="checkbox"
                      checked={stockOnly}
                      onChange={(e) => setStockOnly(e.target.checked)}
                    />
                    In stock only
                  </label>
                </div>
                <div className="sidebar-note">
                  <Leaf size={22} strokeWidth={1.4} />
                  <h3>A little more considered.</h3>
                  <p>
                    Objects with purpose.
                    <br />
                    Materials with character.
                    <br />
                    Things that feel like you.
                  </p>
                </div>
              </aside>
              <div className="product-area">
                <div className="catalog-toolbar">
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search products"
                      placeholder="Search the collection"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        className="icon"
                        aria-label="Clear search"
                        onClick={() => setQuery('')}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <button className="outline mobile" onClick={() => setFilters(!filters)}>
                    <SlidersHorizontal size={16} />
                    Filters
                  </button>
                  <label className="sort">
                    Sort by{' '}
                    <select
                      aria-label="Sort products"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="featured">Featured</option>
                      <option value="price-low">Price: low to high</option>
                      <option value="price-high">Price: high to low</option>
                      <option value="rating">Top rated</option>
                    </select>
                  </label>
                </div>
                <div className="results-line">
                  <span>
                    {category}{' '}
                    <span className="muted">/ {filtered.length.toLocaleString()} items</span>
                  </span>
                  {(query || category !== 'All products' || stockOnly || price !== 'all') && (
                    <button className="text-button" onClick={resetFilters}>
                      Clear filters
                    </button>
                  )}
                </div>
                {loading ? (
                  <div className="product-grid" aria-label="Loading products" aria-busy="true">
                    {Array.from({ length: 6 }, (_, i) => (
                      <div className="skeleton" key={i} />
                    ))}
                  </div>
                ) : visible.length ? (
                  <div className="product-grid">
                    {visible.map((product) => (
                      <article className="product-card" key={product.id}>
                        <button
                          className={`product-image art-${product.art}`}
                          onClick={() => {
                            setSelected(product);
                            setQty(1);
                          }}
                          aria-label={`View ${product.name}`}
                        >
                          <ProductArt art={product.art} color={product.color} />
                          {product.tag && (
                            <span className={`tag ${product.tag === 'New arrival' ? 'new' : ''}`}>
                              {product.tag}
                            </span>
                          )}
                          {!product.stock && <span className="tag">Sold out</span>}
                        </button>
                        <div className="product-info">
                          <div>
                            <button
                              className="product-name"
                              onClick={() => {
                                setSelected(product);
                                setQty(1);
                              }}
                            >
                              {product.name}
                            </button>
                            <p>
                              {product.color} <span>·</span> {product.category}
                            </p>
                          </div>
                          <span className="product-price">{money(product.price)}</span>
                        </div>
                        <button
                          className="quick-add"
                          onClick={() => add(product)}
                          disabled={!product.stock}
                          aria-label={`Add ${product.name} to bag`}
                        >
                          <Plus size={15} />
                          {product.stock ? 'Add to bag' : 'Out of stock'}
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <Search size={32} />
                    <h2>No products found</h2>
                    <p>Try a different search or clear your filters.</p>
                    <button className="primary" onClick={resetFilters}>
                      Clear filters
                    </button>
                  </div>
                )}
                <div className="pagination">
                  <span>
                    Showing {filtered.length ? (page - 1) * 12 + 1 : 0}–
                    {Math.min(page * 12, filtered.length)} of {filtered.length.toLocaleString()}
                  </span>
                  <div>
                    <button
                      className="icon"
                      aria-label="Previous page"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span>
                      Page {page} of {pages}
                    </span>
                    <button
                      className="icon"
                      aria-label="Next page"
                      disabled={page === pages}
                      onClick={() => {
                        setPage((p) => p + 1);
                        document.getElementById('collection')?.scrollIntoView();
                      }}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}
      {route === 'signin' && (
        <main className="auth-layout">
          <div className="auth-story">
            <Leaf size={38} strokeWidth={1} />
            <h1>
              Make yourself
              <br />
              <em>at home.</em>
            </h1>
            <p>
              A few good things.
              <br />A place to keep track of them.
            </p>
            <ProductArt art="mug" color="Sage" />
          </div>
          <section className="auth-form">
            <span className="eyebrow">YOUR FERNWOOD</span>
            <h1>Welcome back.</h1>
            <p className="muted">Sign in to check out and keep track of your orders.</p>
            <form onSubmit={signIn}>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                />
              </label>
              <button className="primary" type="submit">
                Sign in <ArrowRight size={17} />
              </button>
            </form>
            <div className="demo-credentials">
              <b>This is a playground. Use the demo account.</b>
              <span>
                Email <code>{credentials.email}</code>
              </span>
              <span>
                Password <code>{credentials.password}</code>
              </span>
            </div>
            <a className="back-link" href="#catalog">
              <ArrowLeft size={15} /> Back to the collection
            </a>
          </section>
        </main>
      )}
      {route === 'cart' && (
        <main className="page-container">
          <a className="back-link" href="#catalog">
            <ArrowLeft size={15} /> Continue shopping
          </a>
          <div className="page-heading">
            <span className="eyebrow">YOUR EVERYDAY, UPGRADED</span>
            <h1>
              Your bag <span>({cartCount})</span>
            </h1>
          </div>
          {!state.cart.length ? (
            <div className="empty">
              <ShoppingBag size={36} strokeWidth={1} />
              <h2>A little room for something good.</h2>
              <p>Your bag is empty. Find your next everyday favorite.</p>
              <button className="primary" onClick={() => go('catalog')}>
                Explore the collection <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <div className="checkout-layout">
              <div>
                <div className="cart-labels">
                  <span>PRODUCT</span>
                  <span>QUANTITY / TOTAL</span>
                </div>
                {state.cart.map((item) => {
                  const p = products.find((p) => p.id === item.productId)!;
                  return (
                    <article className="cart-item" key={p.id}>
                      <div className="cart-art">
                        <ProductArt art={p.art} color={p.color} />
                      </div>
                      <div className="cart-description">
                        <h3>{p.name}</h3>
                        <p>{p.color}</p>
                        <span>{money(p.price)}</span>
                        <button
                          className="text-button"
                          onClick={() => changeQuantity(p.id, 0)}
                          aria-label={`Remove ${p.name}`}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="quantity">
                        <button
                          aria-label={`Decrease ${p.name} quantity`}
                          onClick={() => changeQuantity(p.id, item.quantity - 1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span aria-label={`${p.name} quantity`}>{item.quantity}</span>
                        <button
                          aria-label={`Increase ${p.name} quantity`}
                          disabled={item.quantity >= p.stock}
                          onClick={() => changeQuantity(p.id, item.quantity + 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <b className="line-total">{money(p.price * item.quantity)}</b>
                    </article>
                  );
                })}
                <div className="shipping-note">
                  <Truck size={19} />
                  <span>Carefully packed. On its way in 2–3 business days.</span>
                </div>
              </div>
              <aside>
                {summary}
                <button className="primary full" onClick={checkout}>
                  Continue to checkout <ArrowRight size={17} />
                </button>
                <p className="safe-note">A simulated checkout. No payment details needed.</p>
              </aside>
            </div>
          )}
        </main>
      )}
      {route === 'checkout' && (
        <main className="page-container">
          <a className="back-link" href="#cart">
            <ArrowLeft size={15} /> Back to your bag
          </a>
          <div className="page-heading">
            <span className="eyebrow">ALMOST YOURS</span>
            <h1>Checkout</h1>
          </div>
          {!state.signedIn ? (
            <div className="empty">
              <h2>Sign in to continue</h2>
              <button className="primary" onClick={() => go('signin')}>
                Sign in
              </button>
            </div>
          ) : !state.cart.length ? (
            <div className="empty">
              <h2>Your bag is empty</h2>
              <button className="primary" onClick={() => go('catalog')}>
                Explore the collection
              </button>
            </div>
          ) : (
            <>
              <ol className="steps">
                {['Shipping', 'Delivery', 'Review'].map((s, i) => (
                  <li key={s} className={step >= i + 1 ? 'current' : ''}>
                    <span>{step > i + 1 ? <Check size={13} /> : i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
              <div className="checkout-layout">
                <section className="checkout-form">
                  {step === 1 && (
                    <form onSubmit={nextStep} noValidate>
                      <h2>Where should we send it?</h2>
                      <p className="muted">Use fictional details. Nothing will be shipped.</p>
                      <div className="form-grid">
                        {(
                          ['name', 'email', 'address', 'city', 'postalCode', 'country'] as const
                        ).map((key) => (
                          <label
                            key={key}
                            className={['address', 'name', 'email'].includes(key) ? 'span-two' : ''}
                          >
                            {
                              {
                                name: 'Full name',
                                email: 'Email address',
                                address: 'Street address',
                                city: 'City',
                                postalCode: 'Postal code',
                                country: 'Country',
                              }[key]
                            }
                            {key === 'country' ? (
                              <select
                                value={shipping.country}
                                onChange={(e) =>
                                  setShipping((s) => ({ ...s, country: e.target.value }))
                                }
                              >
                                <option>United States</option>
                                <option>United Kingdom</option>
                                <option>Canada</option>
                                <option>India</option>
                                <option>Australia</option>
                              </select>
                            ) : (
                              <input
                                aria-label={
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
                                type={key === 'email' ? 'email' : 'text'}
                                onChange={(e) =>
                                  setShipping((s) => ({ ...s, [key]: e.target.value }))
                                }
                                aria-invalid={!!errors[key]}
                                aria-describedby={errors[key] ? `${key}-error` : undefined}
                              />
                            )}{' '}
                            {errors[key] && (
                              <span className="field-error" id={`${key}-error`}>
                                {errors[key]}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                      <button className="primary" type="submit">
                        Continue to delivery <ArrowRight size={16} />
                      </button>
                    </form>
                  )}
                  {step === 2 && (
                    <>
                      <h2>A good thing is on its way.</h2>
                      <p className="muted">Choose your delivery method.</p>
                      {(['standard', 'express'] as const).map((d) => (
                        <label
                          className={`delivery-option ${delivery === d ? 'chosen' : ''}`}
                          key={d}
                        >
                          <input
                            type="radio"
                            name="delivery"
                            checked={delivery === d}
                            onChange={() => setDelivery(d)}
                          />
                          <span>
                            <b>{d === 'standard' ? 'Standard delivery' : 'Express delivery'}</b>
                            <small>
                              {d === 'standard' ? '3–5 business days' : '1–2 business days'}
                            </small>
                          </span>
                          <b>
                            {d === 'express'
                              ? '$12.00'
                              : totals.subtotal >= 10000
                                ? 'Free'
                                : '$5.00'}
                          </b>
                        </label>
                      ))}
                      <div className="form-actions">
                        <button className="outline" onClick={() => setStep(1)}>
                          Back
                        </button>
                        <button className="primary" onClick={() => setStep(3)}>
                          Review order <ArrowRight size={16} />
                        </button>
                      </div>
                    </>
                  )}
                  {step === 3 && (
                    <>
                      <h2>One last look.</h2>
                      <p className="muted">Make sure everything is just right.</p>
                      <div className="review-address">
                        <div>
                          <h3>Ship to</h3>
                          <button className="text-button" onClick={() => setStep(1)}>
                            Edit shipping
                          </button>
                        </div>
                        <p>
                          {shipping.name}
                          <br />
                          {shipping.address}
                          <br />
                          {shipping.city}, {shipping.postalCode}
                          <br />
                          {shipping.country}
                          <br />
                          {shipping.email}
                        </p>
                      </div>
                      <div className="review-address">
                        <div>
                          <h3>Delivery</h3>
                          <button className="text-button" onClick={() => setStep(2)}>
                            Edit delivery
                          </button>
                        </div>
                        <p>
                          {delivery === 'standard'
                            ? 'Standard delivery · 3–5 business days'
                            : 'Express delivery · 1–2 business days'}
                        </p>
                      </div>
                      {state.cart.map((i) => {
                        const p = products.find((p) => p.id === i.productId)!;
                        return (
                          <div className="review-item" key={p.id}>
                            <span>
                              {p.name} × {i.quantity}
                            </span>
                            <b>{money(p.price * i.quantity)}</b>
                          </div>
                        );
                      })}
                      <p className="simulation-note">
                        This order is simulated. You will not be charged.
                      </p>
                      <button className="primary" onClick={submitOrder}>
                        Place order · {money(totals.total)} <ArrowRight size={16} />
                      </button>
                    </>
                  )}
                </section>
                <aside>{summary}</aside>
              </div>
            </>
          )}
        </main>
      )}
      {route === 'success' && (
        <main className="confirmation">
          <CheckCircle2 size={48} strokeWidth={1.1} />
          <span className="eyebrow">A LITTLE SOMETHING TO LOOK FORWARD TO</span>
          <h1>Good things are on their way.</h1>
          <p>
            Your order <b>{orderId || state.orders[0]?.id || ''}</b> is confirmed.
          </p>
          <p className="muted">This is a simulated order. Nothing will be shipped or charged.</p>
          <div>
            <button className="primary" onClick={() => go('orders')}>
              View orders <ArrowRight size={17} />
            </button>
            <button className="outline" onClick={() => go('catalog')}>
              Continue shopping
            </button>
          </div>
        </main>
      )}
      {route === 'orders' && (
        <main className="page-container">
          <div className="page-heading">
            <span className="eyebrow">YOUR FERNWOOD</span>
            <h1>Your orders</h1>
            <p className="muted">Good things, all in one place.</p>
          </div>
          {!state.signedIn ? (
            <div className="empty">
              <User size={32} />
              <h2>Sign in to see your orders</h2>
              <button className="primary" onClick={() => go('signin')}>
                Sign in
              </button>
            </div>
          ) : !state.orders.length ? (
            <div className="empty">
              <Package size={36} strokeWidth={1} />
              <h2>Your story starts here.</h2>
              <p>When you place an order, you'll find it here.</p>
              <button className="primary" onClick={() => go('catalog')}>
                Explore the collection
              </button>
            </div>
          ) : (
            <div className="orders">
              {state.orders.map((order) => (
                <article className="order" key={order.id}>
                  <div className="order-header">
                    <div>
                      <h2>Order {order.id}</h2>
                      <span>
                        November 1, 2026 · {order.items.reduce((n, i) => n + i.quantity, 0)} items
                      </span>
                    </div>
                    <span className={`status ${order.status.toLowerCase()}`}>{order.status}</span>
                    <b>{money(order.total)}</b>
                  </div>
                  {order.items.map((i) => {
                    const p = products.find((p) => p.id === i.productId)!;
                    return (
                      <div className="ordered-product" key={i.productId}>
                        <div>
                          <ProductArt art={p.art} color={p.color} />
                        </div>
                        <span>
                          <b>{p.name}</b>
                          <small>
                            {p.color} · Quantity {i.quantity}
                          </small>
                        </span>
                        <b>{money(p.price * i.quantity)}</b>
                      </div>
                    );
                  })}
                  <div className="order-bottom">
                    <span>
                      Ship to {order.shipping.name} · {order.shipping.city}
                      <small>
                        {order.delivery === 'standard' ? 'Standard delivery' : 'Express delivery'}
                      </small>
                    </span>
                    {order.status === 'Confirmed' && (
                      <button className="outline" onClick={() => setConfirmCancel(order.id)}>
                        Cancel order
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>
      )}
      {!['catalog', 'signin', 'cart', 'checkout', 'success', 'orders'].includes(route) && (
        <main className="empty">
          <h1>Page not found</h1>
          <a href="#catalog">Back to the collection</a>
        </main>
      )}
      <footer>
        <a className="footer-brand" href="#catalog">
          <Leaf size={19} /> fernwood
        </a>
        <span>A little more considered. A little more everyday.</span>
        <span>Part of the Playground collection</span>
      </footer>
      {selected && (
        <Dialog title={selected.name} onClose={() => setSelected(null)}>
          <div className="product-detail">
            <div className="detail-art">
              <ProductArt art={selected.art} color={selected.color} />
            </div>
            <div className="detail-copy">
              <span className="eyebrow">{selected.category}</span>
              <h2>{selected.name}</h2>
              <span className="detail-price">{money(selected.price)}</span>
              <div className="rating">
                <Star size={13} fill="currentColor" />
                {selected.rating} <span>({selected.reviews} reviews)</span>
              </div>
              <p>{selected.description}</p>
              <p className="color-description">
                Color: <b>{selected.color}</b>
              </p>
              <span className="stock-note">
                {selected.stock ? `${selected.stock} in stock` : 'Out of stock'}
              </span>
              <div className="detail-actions">
                <div className="quantity">
                  <button
                    aria-label="Decrease quantity"
                    disabled={qty <= 1}
                    onClick={() => setQty((q) => q - 1)}
                  >
                    <Minus size={15} />
                  </button>
                  <span>{qty}</span>
                  <button
                    aria-label="Increase quantity"
                    disabled={qty >= selected.stock}
                    onClick={() => setQty((q) => q + 1)}
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <button
                  className="primary"
                  disabled={!selected.stock}
                  onClick={() => add(selected, qty)}
                >
                  Add to bag <Plus size={16} />
                </button>
              </div>
              <div className="detail-shipping">
                <Truck size={16} />
                Free shipping on orders $100+
              </div>
            </div>
          </div>
        </Dialog>
      )}
      {confirmCancel && (
        <Dialog title="Cancel order" onClose={() => setConfirmCancel(null)}>
          <div className="cancel-dialog">
            <h2>Cancel order {confirmCancel}?</h2>
            <p>This will mark your simulated order as cancelled.</p>
            <div className="form-actions">
              <button className="outline" onClick={() => setConfirmCancel(null)}>
                Keep order
              </button>
              <button
                className="primary"
                onClick={() => {
                  setState((s) => cancelOrder(s, confirmCancel));
                  setConfirmCancel(null);
                  setNotice('Order cancelled');
                }}
              >
                Confirm cancellation
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
