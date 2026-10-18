import { seedRandom } from './index';
export type Category = 'Living' | 'Kitchen' | 'Workspace' | 'Everyday';
export type Product = {
  id: string;
  name: string;
  category: Category;
  price: number;
  color: string;
  art: string;
  description: string;
  stock: number;
  rating: number;
  reviews: number;
  tag?: string;
};
const bases: Omit<Product, 'id' | 'stock' | 'rating' | 'reviews'>[] = [
  {
    name: 'Arc Table Lamp',
    category: 'Living',
    price: 8900,
    color: 'Sand',
    art: 'lamp',
    description:
      'A little warmth for your favorite corner. A sculptural powder-coated shade and solid oak base, with a soft, diffused glow.',
    tag: 'Bestseller',
  },
  {
    name: 'Everyday Ceramic Mug',
    category: 'Kitchen',
    price: 2400,
    color: 'Sage',
    art: 'mug',
    description:
      'Your morning ritual, made a little better. Hand-finished stoneware with a comfortable handle and a satin glaze.',
    tag: 'Bestseller',
  },
  {
    name: 'Linen Hardcover Notebook',
    category: 'Workspace',
    price: 1800,
    color: 'Moss',
    art: 'notebook',
    description:
      'Make room for your next idea. Lay-flat binding, 160 dotted pages and a textured linen cover.',
  },
  {
    name: 'Form Glass Vase',
    category: 'Living',
    price: 4200,
    color: 'Amber',
    art: 'vase',
    description:
      'An easy home for a handful of stems. Mouth-blown glass with a warm amber tint and a quietly sculptural silhouette.',
    tag: 'New arrival',
  },
  {
    name: 'Canvas Market Tote',
    category: 'Everyday',
    price: 3200,
    color: 'Natural',
    art: 'tote',
    description:
      'For the market, the library, and everything in between. Heavyweight cotton canvas, an inside pocket and reinforced handles.',
  },
  {
    name: 'Oak Desk Tray',
    category: 'Workspace',
    price: 3600,
    color: 'Oak',
    art: 'tray',
    description:
      'A landing place for the small things. Sustainably sourced solid oak, hand-sanded and finished with natural oil.',
  },
  {
    name: 'Ripple Water Glasses',
    category: 'Kitchen',
    price: 3800,
    color: 'Clear',
    art: 'glass',
    description:
      'Light-catching, everyday glassware with a delicate ribbed texture. A set of two, ready for your table.',
  },
  {
    name: 'Woven Cotton Throw',
    category: 'Living',
    price: 6800,
    color: 'Terracotta',
    art: 'throw',
    description:
      'An extra layer for slow mornings and long evenings. Soft, breathable cotton with a tactile basket weave.',
  },
  {
    name: 'Pour-over Coffee Set',
    category: 'Kitchen',
    price: 5400,
    color: 'Chalk',
    art: 'coffee',
    description:
      'A considered start to your day. A stoneware dripper and matching server, thoughtfully sized for two.',
  },
  {
    name: 'Studio Wall Clock',
    category: 'Living',
    price: 5800,
    color: 'Forest',
    art: 'clock',
    description: 'Keep good time. A quiet sweep movement, simple face and slender aluminum frame.',
  },
  {
    name: 'Pocket Pen Set',
    category: 'Workspace',
    price: 2200,
    color: 'Brass',
    art: 'pens',
    description:
      'Three smooth-writing pens in a reusable paper sleeve. Comfortable, balanced and built for everyday notes.',
  },
  {
    name: 'Weekender Pouch',
    category: 'Everyday',
    price: 2800,
    color: 'Clay',
    art: 'pouch',
    description:
      'All the little essentials, together. A washable cotton pouch with a wide opening and sturdy brass zipper.',
  },
];
export function createProducts(): Product[] {
  const random = seedRandom(4815);
  return Array.from({ length: 1200 }, (_, i) => {
    const base = bases[i % bases.length];
    return {
      ...base,
      id: `FW-${String(i + 1).padStart(4, '0')}`,
      name: i < 12 ? base.name : `${base.name} · Edition ${Math.floor(i / 12) + 1}`,
      price: base.price + (i < 12 ? 0 : Math.floor(random() * 12) * 100),
      stock: i < 12 ? 24 : random() < 0.08 ? 0 : Math.ceil(random() * 48),
      rating: Math.round((4 + random()) * 10) / 10,
      reviews: Math.floor(12 + random() * 240),
      tag: i < 12 ? base.tag : undefined,
    };
  });
}
export const products = createProducts();
export const credentials = {
  email: 'alex@example.com',
  password: 'komazon123',
  name: 'Alex Morgan',
};
export type CartItem = { productId: string; quantity: number };
export type Shipping = {
  name: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
};
export type Order = {
  id: string;
  items: CartItem[];
  shipping: Shipping;
  delivery: 'standard' | 'express';
  subtotal: number;
  shippingCost: number;
  total: number;
  status: 'Confirmed' | 'Cancelled';
  date: string;
};
export type ShopState = { signedIn: boolean; cart: CartItem[]; orders: Order[]; nextOrder: number };
export const initialShopState: ShopState = {
  signedIn: false,
  cart: [],
  orders: [],
  nextOrder: 1001,
};
export function authenticate(email: string, password: string) {
  return email.trim().toLowerCase() === credentials.email && password === credentials.password;
}
export function setQuantity(cart: CartItem[], id: string, quantity: number): CartItem[] {
  const product = products.find((p) => p.id === id);
  if (!product) throw new Error('Product not found.');
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > product.stock)
    throw new Error(`Only ${product.stock} available.`);
  const next = cart.filter((i) => i.productId !== id);
  if (quantity) next.push({ productId: id, quantity });
  return next.sort((a, b) => a.productId.localeCompare(b.productId));
}
export function cartTotals(
  cart: CartItem[],
  delivery: 'standard' | 'express' = 'standard',
  bug?: string,
) {
  const subtotal = cart.reduce(
    (total, item) =>
      total +
      (products.find((p) => p.id === item.productId)?.price || 0) *
        (bug === 'cart-total' ? 1 : item.quantity),
    0,
  );
  const shippingCost =
    subtotal === 0 ? 0 : delivery === 'express' ? 1200 : subtotal >= 10000 ? 0 : 500;
  return { subtotal, shippingCost, total: subtotal + shippingCost };
}
export function validateShipping(value: Shipping): Partial<Record<keyof Shipping, string>> {
  const errors: Partial<Record<keyof Shipping, string>> = {};
  if (value.name.trim().length < 2) errors.name = 'Enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))
    errors.email = 'Enter a valid email address.';
  if (value.address.trim().length < 5) errors.address = 'Enter a street address.';
  if (!value.city.trim()) errors.city = 'Enter a city.';
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{2,11}$/.test(value.postalCode))
    errors.postalCode = 'Enter a valid postal code.';
  if (!value.country) errors.country = 'Choose a country.';
  return errors;
}
export function placeOrder(
  state: ShopState,
  shipping: Shipping,
  delivery: 'standard' | 'express',
  bug?: string,
): ShopState {
  if (!state.signedIn) throw new Error('Sign in to place your order.');
  if (!state.cart.length) throw new Error('Your bag is empty.');
  if (bug !== 'checkout-validation' && Object.keys(validateShipping(shipping)).length)
    throw new Error('Check your shipping details.');
  state.cart.forEach((i) => setQuantity([], i.productId, i.quantity));
  const order: Order = {
    id: `FW-${state.nextOrder}`,
    items: state.cart.map((i) => ({ ...i })),
    shipping: { ...shipping },
    delivery,
    ...cartTotals(state.cart, delivery, bug),
    status: 'Confirmed',
    date: '2026-11-01',
  };
  return { ...state, cart: [], orders: [order, ...state.orders], nextOrder: state.nextOrder + 1 };
}
export function cancelOrder(state: ShopState, id: string): ShopState {
  return {
    ...state,
    orders: state.orders.map((o) => (o.id === id ? { ...o, status: 'Cancelled' } : o)),
  };
}
