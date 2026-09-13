import http from 'k6/http';
import { check, sleep } from 'k6';

const baseURL = __ENV.COLMAPRO_LOAD_BASE_URL || 'http://127.0.0.1';
const sessionCookie = __ENV.COLMAPRO_LOAD_SESSION_COOKIE || '';

export const options = {
  scenarios: {
    sse_connections: { executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '30s', target: 50 }, { duration: '2m', target: 50 }, { duration: '30s', target: 0 }] },
  },
  thresholds: { http_req_failed: ['rate<0.02'] },
};

export default function () {
  const response = http.get(`${baseURL}/api/events`, {
    headers: sessionCookie ? { Cookie: sessionCookie, Accept: 'text/event-stream' } : { Accept: 'text/event-stream' },
    timeout: '35s',
    tags: { endpoint: 'sse' },
  });
  check(response, {
    'SSE disponible o exige sesión': (result) => [200, 401, 403].includes(result.status),
  });
  sleep(1);
}
