import http from 'k6/http';
import { check, sleep } from 'k6';

const baseURL = __ENV.COLMAPRO_LOAD_BASE_URL || 'http://127.0.0.1';

export const options = {
  scenarios: {
    catalog: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m', target: 20 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<750', 'p(99)<1500'],
  },
};

export default function () {
  const response = http.get(`${baseURL}/api/bootstrap`, {
    headers: { Accept: 'application/json' },
    tags: { endpoint: 'bootstrap_public' },
  });
  check(response, {
    'catálogo responde 200': (result) => result.status === 200,
    'respuesta es JSON': (result) => (result.headers['Content-Type'] || '').includes('application/json'),
  });
  sleep(1);
}
