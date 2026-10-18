import React, { useEffect, useState, type FormEvent } from 'react';
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
import {
  BrandMark,
  PlaygroundBanner,
  useSessionState,
  Button,
  Input,
  Badge,
  Card,
  Dialog as ShadcnDialog,
  DialogContent,
  DialogTitle,
} from '@playground/ui';
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
  return (
    <ShadcnDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={`shop-dialog gap-0 overflow-hidden p-0 ${title === 'Cancel order' ? 'sm:max-w-lg' : 'sm:max-w-4xl'}`}
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Button
          variant="secondary"
          size="icon"
          className="dialog-close absolute right-4 top-4 z-10"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={18} />
        </Button>
        {children}
      </DialogContent>
    </ShadcnDialog>
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
    document.title = `${title} · Komazon`;
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
      setError('That email and password do not match. Use the sign-in details below.');
      return;
    }
    setState((s) => ({ ...s, signedIn: true }));
    setShipping((s) => ({
      ...s,
      name: s.name || credentials.name,
      email: s.email || credentials.email,
    }));
    setNotice('Signed in as Alex');
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
    <Card className="order-summary gap-0">
      <h2>Order summary</h2>
      <div>
        <span>Subtotal</span>
        <b>{money(totals.subtotal)}</b>
      </div>
      <div>
        <span>Shipping</span>
        <b>{totals.shippingCost ? money(totals.shippingCost) : 'Free'}</b>
      </div>
      <p>Taxes included.</p>
      <div className="total">
        <span>Total</span>
        <strong>{money(totals.total)}</strong>
      </div>
      {totals.subtotal < 10000 && totals.subtotal > 0 && (
        <small>Add {money(10000 - totals.subtotal)} for free standard shipping.</small>
      )}
    </Card>
  );
  return (
    <>
      <PlaygroundBanner app="Komazon" bugs={bugs} />
      <header className="site-header">
        <a href="#catalog" className="brand">
          <span className="brand-icon">
            <BrandMark app="shop" size={24} className="size-6" />
          </span>
          Komazon
        </a>
        <nav aria-label="Main navigation">
          <a
            className={route === 'catalog' ? 'active' : ''}
            aria-current={route === 'catalog' ? 'page' : undefined}
            href="#catalog"
          >
            Shop
          </a>
          <a
            className={route === 'orders' ? 'active' : ''}
            aria-current={route === 'orders' ? 'page' : undefined}
            href="#orders"
          >
            Orders
          </a>
        </nav>
        <div className="header-actions">
          {state.signedIn ? (
            <>
              <span className="account-name">Hi, Alex</span>
              <Button
                variant="ghost"
                size="icon"
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
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="icon"
              aria-label="Sign in"
              onClick={() => go('signin')}
            >
              <User size={20} />
            </Button>
          )}
          <Button
            variant="ghost"
            className="bag-button border border-[#355448] bg-[#1c352c] text-[#b2f5d9]"
            onClick={() => go('cart')}
            aria-label={`Shopping bag (${cartCount})`}
          >
            <ShoppingBag size={20} />
            <span>Bag</span>
            <b>{cartCount}</b>
          </Button>
        </div>
      </header>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
          <Button variant="ghost" onClick={() => setNotice('')} aria-label="Dismiss notification">
            <X size={16} />
          </Button>
        </div>
      )}
      {error && (
        <div className="error global-error" role="alert">
          {error}
          <Button variant="ghost" className="text-button" onClick={() => setError('')}>
            Dismiss
          </Button>
        </div>
      )}
      {route === 'catalog' && (
        <main className="catalog">
          <section id="collection" className="collection">
            <div className="collection-heading">
              <h1>Products</h1>
            </div>
            <div className="catalog-layout">
              <aside className={`filters ${filters ? 'expanded' : ''}`}>
                <div className="filter-title">
                  Categories
                  <Button
                    variant="ghost"
                    size="icon"
                    className="icon mobile min-[761px]:hidden"
                    aria-label="Close filters"
                    onClick={() => setFilters(false)}
                  >
                    <X size={16} />
                  </Button>
                </div>
                <div className="category-list">
                  {['All products', 'Living', 'Kitchen', 'Workspace', 'Everyday'].map((c) => (
                    <Button
                      variant="ghost"
                      key={c}
                      onClick={() => setCategory(c)}
                      aria-pressed={c === category}
                      className={`w-full justify-between px-2.5 ${c === category ? 'selected' : ''}`}
                    >
                      {c}
                      <span>
                        {c === 'All products'
                          ? 1200
                          : products.filter((p) => p.category === c).length}
                      </span>
                    </Button>
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
              </aside>
              <div className="product-area">
                <div className="catalog-toolbar">
                  <label className="search">
                    <Search size={17} />
                    <Input
                      className="h-10 pl-10 pr-10"
                      aria-label="Search products"
                      placeholder="Search products"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="icon"
                        aria-label="Clear search"
                        onClick={() => setQuery('')}
                      >
                        <X size={14} />
                      </Button>
                    )}
                  </label>
                  <Button
                    variant="outline"
                    className="outline mobile min-[761px]:hidden"
                    onClick={() => setFilters(!filters)}
                  >
                    <SlidersHorizontal size={16} />
                    Filters
                  </Button>
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
                    <Button variant="ghost" className="text-button" onClick={resetFilters}>
                      Clear filters
                    </Button>
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
                      <Card role="article" className="product-card" key={product.id}>
                        <Button
                          variant="ghost"
                          className={`product-image relative h-auto w-full rounded-none p-0 has-[>svg]:px-0 art-${product.art}`}
                          onClick={() => {
                            setSelected(product);
                            setQty(1);
                          }}
                          aria-label={`View ${product.name}`}
                        >
                          <ProductArt
                            art={product.art}
                            color={product.color}
                            className="size-full"
                          />
                          {product.tag && (
                            <Badge
                              variant="secondary"
                              className={`tag px-1 py-0 text-[9px] ${product.tag === 'New arrival' ? 'new' : ''}`}
                            >
                              {product.tag}
                            </Badge>
                          )}
                          {!product.stock && (
                            <Badge variant="secondary" className="tag px-1 py-0 text-[9px]">
                              Sold out
                            </Badge>
                          )}
                        </Button>
                        <div className="product-info">
                          <div>
                            <Button
                              variant="ghost"
                              className="product-name h-auto justify-start p-0 text-left whitespace-normal"
                              onClick={() => {
                                setSelected(product);
                                setQty(1);
                              }}
                            >
                              {product.name}
                            </Button>
                            <p>
                              {product.color} <span>·</span> {product.category}
                            </p>
                          </div>
                          <span className="product-price">{money(product.price)}</span>
                        </div>
                        <Button
                          variant="ghost"
                          className="quick-add"
                          onClick={() => add(product)}
                          disabled={!product.stock}
                          aria-label={`Add ${product.name} to bag`}
                        >
                          <Plus size={15} />
                          {product.stock ? 'Add to bag' : 'Out of stock'}
                        </Button>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <Search size={32} />
                    <h2>No products found</h2>
                    <p>Try a different search or clear your filters.</p>
                    <Button className="primary" onClick={resetFilters}>
                      Clear filters
                    </Button>
                  </div>
                )}
                <div className="pagination">
                  <span>
                    Showing {filtered.length ? (page - 1) * 12 + 1 : 0}–
                    {Math.min(page * 12, filtered.length)} of {filtered.length.toLocaleString()}
                  </span>
                  <div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="icon"
                      aria-label="Previous page"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft size={18} />
                    </Button>
                    <span>
                      Page {page} of {pages}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="icon"
                      aria-label="Next page"
                      disabled={page === pages}
                      onClick={() => {
                        setPage((p) => p + 1);
                        document.getElementById('collection')?.scrollIntoView();
                      }}
                    >
                      <ChevronRight size={18} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}
      {route === 'signin' && (
        <main className="auth-layout">
          <section className="auth-form">
            <h1>Sign in</h1>
            <p className="muted">Sign in to check out and keep track of your orders.</p>
            <form onSubmit={signIn}>
              <label>
                Email address
                <Input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <Input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                />
              </label>
              <Button className="primary" type="submit">
                Sign in <ArrowRight size={17} />
              </Button>
            </form>
            <div className="demo-credentials">
              <b>Sign-in details</b>
              <span>
                Email <code>{credentials.email}</code>
              </span>
              <span>
                Password <code>{credentials.password}</code>
              </span>
            </div>
            <a className="back-link" href="#catalog">
              <ArrowLeft size={15} /> Back to products
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
            <h1>
              Your bag <span>({cartCount})</span>
            </h1>
          </div>
          {!state.cart.length ? (
            <div className="empty">
              <ShoppingBag size={36} strokeWidth={1} />
              <h2>Your bag is empty</h2>
              <Button className="primary" onClick={() => go('catalog')}>
                Browse products <ArrowRight size={17} />
              </Button>
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
                    <Card role="article" className="cart-item grid gap-4 shadow-none" key={p.id}>
                      <div className="cart-art">
                        <ProductArt art={p.art} color={p.color} />
                      </div>
                      <div className="cart-description">
                        <h3>{p.name}</h3>
                        <p>{p.color}</p>
                        <span>{money(p.price)}</span>
                        <Button
                          variant="ghost"
                          className="text-button"
                          onClick={() => changeQuantity(p.id, 0)}
                          aria-label={`Remove ${p.name}`}
                        >
                          Remove
                        </Button>
                      </div>
                      <div className="quantity">
                        <Button
                          variant="ghost"
                          aria-label={`Decrease ${p.name} quantity`}
                          onClick={() => changeQuantity(p.id, item.quantity - 1)}
                        >
                          <Minus size={14} />
                        </Button>
                        <span aria-label={`${p.name} quantity`}>{item.quantity}</span>
                        <Button
                          variant="ghost"
                          aria-label={`Increase ${p.name} quantity`}
                          disabled={item.quantity >= p.stock}
                          onClick={() => changeQuantity(p.id, item.quantity + 1)}
                        >
                          <Plus size={14} />
                        </Button>
                      </div>
                      <b className="line-total">{money(p.price * item.quantity)}</b>
                    </Card>
                  );
                })}
              </div>
              <aside>
                {summary}
                <Button className="primary full" onClick={checkout}>
                  Continue to checkout <ArrowRight size={17} />
                </Button>
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
            <h1>Checkout</h1>
          </div>
          {!state.signedIn ? (
            <div className="empty">
              <h2>Sign in to continue</h2>
              <Button className="primary" onClick={() => go('signin')}>
                Sign in
              </Button>
            </div>
          ) : !state.cart.length ? (
            <div className="empty">
              <h2>Your bag is empty</h2>
              <Button className="primary" onClick={() => go('catalog')}>
                Browse products
              </Button>
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
                      <h2>Shipping address</h2>

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
                              <Input
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
                      <Button className="primary" type="submit">
                        Continue to delivery <ArrowRight size={16} />
                      </Button>
                    </form>
                  )}
                  {step === 2 && (
                    <>
                      <h2>Delivery method</h2>
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
                        <Button variant="outline" className="outline" onClick={() => setStep(1)}>
                          Back
                        </Button>
                        <Button className="primary" onClick={() => setStep(3)}>
                          Review order <ArrowRight size={16} />
                        </Button>
                      </div>
                    </>
                  )}
                  {step === 3 && (
                    <>
                      <h2>Review order</h2>
                      <div className="review-address">
                        <div>
                          <h3>Ship to</h3>
                          <Button
                            variant="ghost"
                            className="text-button"
                            onClick={() => setStep(1)}
                          >
                            Edit shipping
                          </Button>
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
                          <Button
                            variant="ghost"
                            className="text-button"
                            onClick={() => setStep(2)}
                          >
                            Edit delivery
                          </Button>
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
                      <Button className="primary" onClick={submitOrder}>
                        Place order · {money(totals.total)} <ArrowRight size={16} />
                      </Button>
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

          <h1>Order confirmed</h1>
          <p>
            Your order <b>{orderId || state.orders[0]?.id || ''}</b> is confirmed.
          </p>

          <div>
            <Button className="primary" onClick={() => go('orders')}>
              View orders <ArrowRight size={17} />
            </Button>
            <Button variant="outline" className="outline" onClick={() => go('catalog')}>
              Continue shopping
            </Button>
          </div>
        </main>
      )}
      {route === 'orders' && (
        <main className="page-container">
          <div className="page-heading">
            <h1>Your orders</h1>
          </div>
          {!state.signedIn ? (
            <div className="empty">
              <User size={32} />
              <h2>Sign in to see your orders</h2>
              <Button className="primary" onClick={() => go('signin')}>
                Sign in
              </Button>
            </div>
          ) : !state.orders.length ? (
            <div className="empty">
              <Package size={36} strokeWidth={1} />
              <h2>No orders</h2>
              <p>When you place an order, you'll find it here.</p>
              <Button className="primary" onClick={() => go('catalog')}>
                Browse products
              </Button>
            </div>
          ) : (
            <div className="orders">
              {state.orders.map((order) => (
                <Card role="article" className="order gap-0 py-0 shadow-none" key={order.id}>
                  <div className="order-header">
                    <div>
                      <h2>Order {order.id}</h2>
                      <span>
                        November 1, 2026 · {order.items.reduce((n, i) => n + i.quantity, 0)} items
                      </span>
                    </div>
                    <Badge variant="secondary" className={`status ${order.status.toLowerCase()}`}>
                      {order.status}
                    </Badge>
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
                      <Button
                        variant="outline"
                        className="outline"
                        onClick={() => setConfirmCancel(order.id)}
                      >
                        Cancel order
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </main>
      )}
      {!['catalog', 'signin', 'cart', 'checkout', 'success', 'orders'].includes(route) && (
        <main className="empty">
          <h1>Page not found</h1>
          <a href="#catalog">Back to products</a>
        </main>
      )}
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
                  <Button
                    variant="ghost"
                    aria-label="Decrease quantity"
                    disabled={qty <= 1}
                    onClick={() => setQty((q) => q - 1)}
                  >
                    <Minus size={15} />
                  </Button>
                  <span>{qty}</span>
                  <Button
                    variant="ghost"
                    aria-label="Increase quantity"
                    disabled={qty >= selected.stock}
                    onClick={() => setQty((q) => q + 1)}
                  >
                    <Plus size={15} />
                  </Button>
                </div>
                <Button
                  className="primary"
                  disabled={!selected.stock}
                  onClick={() => add(selected, qty)}
                >
                  Add to bag <Plus size={16} />
                </Button>
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
            <p>This will cancel your order.</p>
            <div className="form-actions">
              <Button variant="outline" className="outline" onClick={() => setConfirmCancel(null)}>
                Keep order
              </Button>
              <Button
                className="primary"
                onClick={() => {
                  setState((s) => cancelOrder(s, confirmCancel));
                  setConfirmCancel(null);
                  setNotice('Order cancelled');
                }}
              >
                Confirm cancellation
              </Button>
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
