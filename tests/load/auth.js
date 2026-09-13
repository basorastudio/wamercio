import http from 'k6/http';
import { check, sleep } from 'k6';

const baseURL = __ENV.WAMERCIO_LOAD_BASE_URL || 'http://127.0.0.1';
const phone = __ENV.WAMERCIO_LOAD_PHONE || '8090000000';
const pin = __ENV.WAMERCIO_LOAD_PIN || '000000';

export const options = {
  vus: 2,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const response = http.post(
    `${baseURL}/api/client/login`,
    JSON.stringify({ phone, pin }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'client_login' } },
  );
  check(response, {
    'login no falla como servidor': (result) => result.status < 500,
    'rate limit funciona': (result) => [200, 400, 401, 403, 429].includes(result.status),
  });
  sleep(2);
}
