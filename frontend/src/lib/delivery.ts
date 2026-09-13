const numeric = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isDeliveryOrder = (sale: any = {}) => {
  const mode = String(sale.orderMode || sale.order_mode || '').toLowerCase();
  if (mode) return mode === 'delivery';
  const address = String(sale.deliveryAddress || sale.delivery_address || sale.address || '').toLowerCase();
  return address.includes('modalidad: entrega') || address.includes('entrega:') || address.includes('gps:');
};

export const isAutomaticallyAssignedDelivery = (sale: any = {}) => (
  sale.automaticallyAssigned === true
  || sale.automatically_assigned === true
  || String(sale.assignmentMode || sale.assignment_mode || '').toLowerCase() === 'automatic'
);

export const isDeliveryAccepted = (sale: any = {}) => Boolean(
  sale.acceptedAt || sale.accepted_at || isAutomaticallyAssignedDelivery(sale),
);

export const deliveryAcceptanceRequired = (sale: any = {}) => {
  if (typeof sale.acceptanceRequired === 'boolean') return sale.acceptanceRequired;
  if (typeof sale.acceptance_required === 'boolean') return sale.acceptance_required;
  return Boolean(
    (sale.assignedDriverId || sale.assigned_driver_id || sale.assignedDriver || sale.assigned_driver)
    && !isDeliveryAccepted(sale),
  );
};

export const deliveryAddress = (sale: any = {}) => {
  const raw = String(sale.deliveryAddress || sale.delivery_address || sale.address || '').trim();
  if (!raw) return 'Sin dirección registrada';
  const ignored = /^(modalidad|entrega|cambio|transferencia|origen|canal|nota)\s*:/i;
  const parts = raw.split(/\s*·\s*/).map((part) => part.trim()).filter(Boolean);
  const visible = parts.filter((part) => !ignored.test(part) && !/^GPS\s*:/i.test(part));
  return visible.join(' · ') || raw;
};

export const deliveryCoordinates = (sale: any = {}) => {
  const lat = numeric(sale.customer_lat ?? sale.customerLat ?? sale.lat);
  const lng = numeric(sale.customer_lng ?? sale.customerLng ?? sale.lng);
  if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  const raw = String(sale.deliveryAddress || sale.delivery_address || sale.address || '');
  const match = raw.match(/GPS\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const parsedLat = numeric(match[1]);
  const parsedLng = numeric(match[2]);
  return parsedLat === null || parsedLng === null ? null : { lat: parsedLat, lng: parsedLng };
};


export const storeCoordinates = (store: any = {}) => {
  const lat = numeric(store.latitude ?? store.lat);
  const lng = numeric(store.longitude ?? store.lng ?? store.lon);
  if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  return null;
};

export const phoneDigits = (sale: any = {}) => String(
  sale.customerPhone || sale.customer_phone || sale.customerWhatsapp || sale.customer_whatsapp || sale.phone || '',
).replace(/\D/g, '');

export const customerCallUrl = (sale: any = {}) => {
  const phone = phoneDigits(sale);
  return phone ? `tel:+${phone}` : '';
};

export const customerWhatsAppUrl = (sale: any = {}) => {
  const phone = phoneDigits(sale);
  if (!phone) return '';
  const orderNumber = sale.orderNumber || sale.order_number || String(sale.id || '').slice(0, 6).toUpperCase();
  const text = encodeURIComponent(`Hola, soy el repartidor de tu pedido #${orderNumber} de WAMERCIO.`);
  return `https://wa.me/${phone}?text=${text}`;
};

export const navigationUrl = (sale: any = {}) => {
  const coords = deliveryCoordinates(sale);
  const destination = coords ? `${coords.lat},${coords.lng}` : deliveryAddress(sale);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
};

export const mapEmbedUrl = (sale: any = {}) => {
  const coords = deliveryCoordinates(sale);
  if (!coords) return '';
  const delta = 0.008;
  const bbox = [coords.lng - delta, coords.lat - delta, coords.lng + delta, coords.lat + delta].join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${coords.lat}%2C${coords.lng}`;
};

export const multiStopNavigationUrl = (orders: any[] = [], origin: { lat: number; lng: number } | null = null) => {
  const destinations = orders.slice(0, 10).map((order) => {
    const coordinates = deliveryCoordinates(order);
    if (coordinates) return `${coordinates.lat},${coordinates.lng}`;
    const address = deliveryAddress(order);
    return address === 'Sin dirección registrada' ? '' : address;
  }).filter(Boolean);
  if (!destinations.length) return '';
  const destination = destinations[destinations.length - 1];
  const waypoints = destinations.slice(0, -1);
  const params = new URLSearchParams({
    api: '1',
    destination,
    travelmode: 'driving',
  });
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    params.set('origin', `${origin.lat},${origin.lng}`);
  }
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

export const deliveryStatusLabel = (status = '') => ({
  pending: 'Pendiente',
  preparing: 'En preparación',
  ready_for_delivery: 'Listo para entregar',
  on_the_way: 'En ruta',
  delivered: 'Entregado',
  issue: 'Problema',
  cancelled: 'Cancelado',
}[status] || 'Pendiente');
