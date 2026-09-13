import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const baseURL = __ENV.COLMAPRO_LOAD_BASE_URL || 'http://127.0.0.1';
const sessionCookie = __ENV.COLMAPRO_LOAD_CLIENT_COOKIE || '';
const storeID = __ENV.COLMAPRO_LOAD_STORE_ID || '';
const productID = __ENV.COLMAPRO_LOAD_PRODUCT_ID || '';

export const options = {
  scenarios: {
    orders: { executor: 'constant-arrival-rate', rate: 2, timeUnit: '1s', duration: '1m', preAllocatedVUs: 4, maxVUs: 12 },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1200', 'p(99)<2500'],
  },
};

export default function () {
  if (!sessionCookie || !storeID || !productID) {
    fail('Define COLMAPRO_LOAD_CLIENT_COOKIE, COLMAPRO_LOAD_STORE_ID y COLMAPRO_LOAD_PRODUCT_ID.');
  }
  const idempotencyKey = `k6-${__VU}-${__ITER}-${Date.now()}`;
  const payload = {
    store_id: storeID,
    method: 'cash',
    order_mode: 'pickup',
    items: [{ product_id: productID, quantity: 1 }],
  };
  const response = http.post(`${baseURL}/api/client/orders`, JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
      'Idempotency-Key': idempotencyKey,
    },
    tags: { endpoint: 'client_order' },
  });
  check(response, { 'pedido creado': (result) => result.status === 201 });
  sleep(1);
}
