import test from 'node:test';
import assert from 'node:assert/strict';
import {
  products,
  createProducts,
  authenticate,
  setQuantity,
  cartTotals,
  validateShipping,
  placeOrder,
  initialShopState,
  cancelOrder,
} from './shop';
const shipping = {
  name: 'Alex Morgan',
  email: 'alex@example.com',
  address: '24 Cedar Lane',
  city: 'Portland',
  postalCode: '97205',
  country: 'United States',
};
test('catalog is deterministic and has realistic volume', () => {
  assert.equal(products.length, 1200);
  assert.deepEqual(createProducts(), products);
  assert.equal(new Set(products.map((p) => p.id)).size, 1200);
});
test('credentials and quantity validation', () => {
  assert.ok(authenticate('alex@example.com', 'komazon123'));
  assert.ok(!authenticate('alex@example.com', 'wrong'));
  assert.throws(() => setQuantity([], 'FW-0001', 25));
  assert.throws(() => setQuantity([], 'FW-0001', 1.5));
});
test('cart calculations include all quantities and shipping threshold', () => {
  const cart = [{ productId: 'FW-0002', quantity: 3 }];
  assert.deepEqual(cartTotals(cart), { subtotal: 7200, shippingCost: 500, total: 7700 });
  assert.equal(cartTotals([{ productId: 'FW-0001', quantity: 2 }]).shippingCost, 0);
  assert.equal(cartTotals(cart, 'express').shippingCost, 1200);
  assert.equal(cartTotals(cart, 'standard', 'cart-total').subtotal, 2400);
});
test('checkout validates fields, auth and empty cart; order snapshots survive cart reset', () => {
  assert.deepEqual(validateShipping(shipping), {});
  assert.ok(validateShipping({ ...shipping, email: 'invalid' }).email);
  assert.throws(() => placeOrder(initialShopState, shipping, 'standard'));
  const state = placeOrder(
    { ...initialShopState, signedIn: true, cart: [{ productId: 'FW-0002', quantity: 2 }] },
    shipping,
    'standard',
  );
  assert.equal(state.orders[0].total, 5300);
  assert.equal(state.cart.length, 0);
  assert.equal(state.nextOrder, 1002);
  assert.equal(cancelOrder(state, 'FW-1001').orders[0].status, 'Cancelled');
});
