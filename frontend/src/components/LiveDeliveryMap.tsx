'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import MotorcycleIcon from '../common/MotorcycleIcon';

const {
  FiHome,
  FiMapPin,
  FiPlus,
  FiMinus,
  FiNavigation,
  FiCrosshair,
  FiMaximize2,
} = FiIcons;

export type MapPoint = {
  lat: number;
  lng: number;
};

export type LiveMapDriver = MapPoint & {
  heading?: number | null;
  accuracy?: number | null;
  updatedAt?: string | null;
  label?: string;
};

type Props = {
  route?: MapPoint[];
  polygon?: MapPoint[];
  store?: (MapPoint & { label?: string }) | null;
  destination?: (MapPoint & { label?: string }) | null;
  driver?: LiveMapDriver | null;
  className?: string;
  emptyMessage?: string;
  showLegend?: boolean;
  snapDriverToRoute?: boolean;
  drawPolygon?: boolean;
  onPolygonPoint?: (point: MapPoint) => void;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 4;
const MAX_ZOOM = 18;
const DEFAULT_CENTER: MapPoint = { lat: 18.7357, lng: -70.1627 };
const DOMINICAN_REPUBLIC_MAINLAND: MapPoint[] = [
  { lat: 19.708112, lng: -71.751855 },
  { lat: 19.723841, lng: -71.751244 },
  { lat: 19.738118, lng: -71.744612 },
  { lat: 19.908573, lng: -71.619555 },
  { lat: 19.920647, lng: -71.605275 },
  { lat: 19.924910, lng: -71.587067 },
  { lat: 19.920285, lng: -70.806469 },
  { lat: 19.916972, lng: -70.790764 },
  { lat: 19.663684, lng: -70.207887 },
  { lat: 19.686183, lng: -69.938896 },
  { lat: 19.678590, lng: -69.925042 },
  { lat: 19.666225, lng: -69.915208 },
  { lat: 19.334169, lng: -69.745250 },
  { lat: 19.353187, lng: -69.223583 },
  { lat: 19.350175, lng: -69.206834 },
  { lat: 19.340473, lng: -69.192852 },
  { lat: 19.325836, lng: -69.184170 },
  { lat: 19.308914, lng: -69.182358 },
  { lat: 19.051741, lng: -69.210162 },
  { lat: 19.018943, lng: -68.806175 },
  { lat: 19.011128, lng: -68.785484 },
  { lat: 18.644252, lng: -68.294015 },
  { lat: 18.631804, lng: -68.283077 },
  { lat: 18.615991, lng: -68.278123 },
  { lat: 18.599528, lng: -68.280003 },
  { lat: 18.585239, lng: -68.288393 },
  { lat: 18.178183, lng: -68.659766 },
  { lat: 18.168476, lng: -68.673329 },
  { lat: 18.165144, lng: -68.689671 },
  { lat: 18.168765, lng: -68.705951 },
  { lat: 18.381846, lng: -69.171904 },
  { lat: 18.340879, lng: -69.620349 },
  { lat: 18.385828, lng: -69.938680 },
  { lat: 18.210346, lng: -70.114934 },
  { lat: 18.145351, lng: -70.526286 },
  { lat: 18.151752, lng: -70.540401 },
  { lat: 18.163037, lng: -70.551023 },
  { lat: 18.376500, lng: -70.684912 },
  { lat: 18.251848, lng: -70.972019 },
  { lat: 17.578379, lng: -71.365677 },
  { lat: 17.566553, lng: -71.376224 },
  { lat: 17.559752, lng: -71.390536 },
  { lat: 17.559040, lng: -71.406365 },
  { lat: 17.723541, lng: -71.678681 },
  { lat: 17.735121, lng: -71.690766 },
  { lat: 17.750632, lng: -71.697055 },
  { lat: 18.038056, lng: -71.747698 },
  { lat: 18.303185, lng: -71.728873 },
  { lat: 18.590867, lng: -71.975481 },
  { lat: 18.605462, lng: -71.983442 },
  { lat: 18.622033, lng: -71.984781 },
  { lat: 18.637717, lng: -71.979268 },
  { lat: 18.649805, lng: -71.967855 },
  { lat: 18.809109, lng: -71.737375 },
  { lat: 19.170589, lng: -71.665507 },
];

const rectangularCountryShape = (south: number, north: number, west: number, east: number): MapPoint[] => [
  { lat: north, lng: west },
  { lat: north, lng: east },
  { lat: south, lng: east },
  { lat: south, lng: west },
];

const DOMINICAN_REPUBLIC_SHAPES: MapPoint[][] = [
  DOMINICAN_REPUBLIC_MAINLAND,
  rectangularCountryShape(18.04, 18.24, -68.88, -68.54), // Saona
  rectangularCountryShape(18.31, 18.43, -69.12, -68.97), // Catalina
  rectangularCountryShape(17.52, 17.69, -71.62, -71.43), // Beata
  rectangularCountryShape(17.43, 17.53, -71.72, -71.56), // Alto Velo
];

const DOMINICAN_REPUBLIC_BOUNDS = {
  south: 17.42,
  north: 19.94,
  west: -72.00,
  east: -68.25,
};
const COUNTRY_VIEWPORT_PADDING = 24;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const validPoint = (point: any): point is MapPoint => (
  Number.isFinite(Number(point?.lat))
  && Number.isFinite(Number(point?.lng))
  && Math.abs(Number(point.lat)) <= 90
  && Math.abs(Number(point.lng)) <= 180
);

const normalizePoint = (point: MapPoint): MapPoint => ({ lat: Number(point.lat), lng: Number(point.lng) });

const pointInsidePolygon = (point: MapPoint, polygon: MapPoint[]) => {
  let inside = false;
  for (let currentIndex = 0, previousIndex = polygon.length - 1; currentIndex < polygon.length; previousIndex = currentIndex, currentIndex += 1) {
    const current = polygon[currentIndex];
    const previous = polygon[previousIndex];
    const crossesLatitude = (current.lat > point.lat) !== (previous.lat > point.lat);
    const crossingLongitude = ((previous.lng - current.lng) * (point.lat - current.lat)) / ((previous.lat - current.lat) || Number.EPSILON) + current.lng;
    if (crossesLatitude && point.lng < crossingLongitude) inside = !inside;
  }
  return inside;
};

const pointInsideDominicanRepublic = (point: any): point is MapPoint => {
  if (!validPoint(point)) return false;
  const normalized = normalizePoint(point);
  if (
    normalized.lat < DOMINICAN_REPUBLIC_BOUNDS.south
    || normalized.lat > DOMINICAN_REPUBLIC_BOUNDS.north
    || normalized.lng < DOMINICAN_REPUBLIC_BOUNDS.west
    || normalized.lng > DOMINICAN_REPUBLIC_BOUNDS.east
  ) return false;
  return DOMINICAN_REPUBLIC_SHAPES.some((shape) => pointInsidePolygon(normalized, shape));
};

const shapeCentroid = (shape: MapPoint[]): MapPoint => ({
  lat: shape.reduce((total, point) => total + point.lat, 0) / shape.length,
  lng: shape.reduce((total, point) => total + point.lng, 0) / shape.length,
});

const nearestPointOnCountry = (point: MapPoint) => {
  let nearestPoint = DEFAULT_CENTER;
  let nearestShape = DOMINICAN_REPUBLIC_MAINLAND;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  const referenceLatitude = (point.lat * Math.PI) / 180;
  const longitudeScale = Math.max(0.1, Math.cos(referenceLatitude));

  DOMINICAN_REPUBLIC_SHAPES.forEach((shape) => {
    shape.forEach((start, index) => {
      const end = shape[(index + 1) % shape.length];
      const startX = (start.lng - point.lng) * longitudeScale;
      const startY = start.lat - point.lat;
      const endX = (end.lng - point.lng) * longitudeScale;
      const endY = end.lat - point.lat;
      const segmentX = endX - startX;
      const segmentY = endY - startY;
      const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
      const projection = segmentLengthSquared > 0
        ? clamp(-((startX * segmentX) + (startY * segmentY)) / segmentLengthSquared, 0, 1)
        : 0;
      const projectedX = startX + segmentX * projection;
      const projectedY = startY + segmentY * projection;
      const distanceSquared = projectedX * projectedX + projectedY * projectedY;
      if (distanceSquared < nearestDistanceSquared) {
        nearestDistanceSquared = distanceSquared;
        nearestPoint = {
          lat: point.lat + projectedY,
          lng: point.lng + projectedX / longitudeScale,
        };
        nearestShape = shape;
      }
    });
  });

  const centroid = shapeCentroid(nearestShape);
  for (const inwardFactor of [0.03, 0.08, 0.16, 0.3]) {
    const candidate = {
      lat: nearestPoint.lat + (centroid.lat - nearestPoint.lat) * inwardFactor,
      lng: nearestPoint.lng + (centroid.lng - nearestPoint.lng) * inwardFactor,
    };
    if (pointInsidePolygon(candidate, nearestShape)) return candidate;
  }
  return centroid;
};

const worldPoint = (point: MapPoint, zoom: number) => {
  const scale = TILE_SIZE * 2 ** zoom;
  const latitude = clamp(point.lat, -85.05112878, 85.05112878);
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((point.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
};

const geographicPoint = (world: { x: number; y: number }, zoom: number): MapPoint => {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (world.x / scale) * 360 - 180;
  const mercator = Math.PI - (2 * Math.PI * world.y) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(mercator));
  return { lat: clamp(lat, -85.05112878, 85.05112878), lng };
};

const minimumCountryZoom = (width: number, height: number) => {
  const viewportWidth = Math.max(260, width) + COUNTRY_VIEWPORT_PADDING * 2;
  const viewportHeight = Math.max(180, height) + COUNTRY_VIEWPORT_PADDING * 2;
  for (let candidate = MIN_ZOOM; candidate <= MAX_ZOOM; candidate += 1) {
    const northWest = worldPoint({ lat: DOMINICAN_REPUBLIC_BOUNDS.north, lng: DOMINICAN_REPUBLIC_BOUNDS.west }, candidate);
    const southEast = worldPoint({ lat: DOMINICAN_REPUBLIC_BOUNDS.south, lng: DOMINICAN_REPUBLIC_BOUNDS.east }, candidate);
    if ((southEast.x - northWest.x) >= viewportWidth && (southEast.y - northWest.y) >= viewportHeight) return candidate;
  }
  return MAX_ZOOM;
};

const constrainCenterToDominicanRepublic = (point: MapPoint, zoom: number, width: number, height: number): MapPoint => {
  const northWest = worldPoint({ lat: DOMINICAN_REPUBLIC_BOUNDS.north, lng: DOMINICAN_REPUBLIC_BOUNDS.west }, zoom);
  const southEast = worldPoint({ lat: DOMINICAN_REPUBLIC_BOUNDS.south, lng: DOMINICAN_REPUBLIC_BOUNDS.east }, zoom);
  const current = worldPoint(point, zoom);
  const halfWidth = Math.max(0, width / 2);
  const halfHeight = Math.max(0, height / 2);
  const minX = northWest.x + halfWidth;
  const maxX = southEast.x - halfWidth;
  const minY = northWest.y + halfHeight;
  const maxY = southEast.y - halfHeight;
  const x = minX <= maxX ? clamp(current.x, minX, maxX) : (northWest.x + southEast.x) / 2;
  const y = minY <= maxY ? clamp(current.y, minY, maxY) : (northWest.y + southEast.y) / 2;
  const bounded = geographicPoint({ x, y }, zoom);
  return pointInsideDominicanRepublic(bounded) ? bounded : nearestPointOnCountry(bounded);
};

const boundsFor = (points: MapPoint[]) => {
  if (!points.length) return null;
  return points.reduce((bounds, point) => ({
    minLat: Math.min(bounds.minLat, point.lat),
    maxLat: Math.max(bounds.maxLat, point.lat),
    minLng: Math.min(bounds.minLng, point.lng),
    maxLng: Math.max(bounds.maxLng, point.lng),
  }), {
    minLat: points[0].lat,
    maxLat: points[0].lat,
    minLng: points[0].lng,
    maxLng: points[0].lng,
  });
};

const fitZoom = (points: MapPoint[], width: number, height: number) => {
  if (points.length <= 1) return 15;
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const projected = points.map((point) => worldPoint(point, zoom));
    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    if (spanX <= Math.max(120, width - 110) && spanY <= Math.max(100, height - 110)) return zoom;
  }
  return MIN_ZOOM;
};

const snapPointToRoute = (point: LiveMapDriver, route: MapPoint[]) => {
  if (!validPoint(point) || route.length < 2) return point;
  const referenceLatitude = (point.lat * Math.PI) / 180;
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = Math.max(1, Math.cos(referenceLatitude) * metersPerDegreeLatitude);
  let nearest: MapPoint = point;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const startX = (start.lng - point.lng) * metersPerDegreeLongitude;
    const startY = (start.lat - point.lat) * metersPerDegreeLatitude;
    const endX = (end.lng - point.lng) * metersPerDegreeLongitude;
    const endY = (end.lat - point.lat) * metersPerDegreeLatitude;
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    const projection = segmentLengthSquared > 0
      ? clamp(-((startX * segmentX) + (startY * segmentY)) / segmentLengthSquared, 0, 1)
      : 0;
    const projectedX = startX + segmentX * projection;
    const projectedY = startY + segmentY * projection;
    const distanceSquared = projectedX * projectedX + projectedY * projectedY;
    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      nearest = {
        lat: point.lat + projectedY / metersPerDegreeLatitude,
        lng: point.lng + projectedX / metersPerDegreeLongitude,
      };
    }
  }

  const toleranceMeters = Math.max(180, Math.min(500, Number(point.accuracy || 0) * 2));
  return nearestDistanceSquared <= toleranceMeters * toleranceMeters ? { ...point, ...nearest } : point;
};

const Marker = ({
  point,
  centerWorld,
  zoom,
  width,
  height,
  type,
  label,
  heading = 0,
}: any) => {
  if (!pointInsideDominicanRepublic(point)) return null;
  const world = worldPoint(point, zoom);
  const x = world.x - centerWorld.x + width / 2;
  const y = world.y - centerWorld.y + height / 2;
  const visual = type === 'store'
    ? { icon: FiHome, className: 'bg-[#1a2332] text-white border-white', size: 34 }
    : type === 'driver'
      ? { icon: MotorcycleIcon, className: 'bg-[#00a884] text-white border-white', size: 38 }
      : { icon: FiMapPin, className: 'bg-rose-500 text-white border-white', size: 34 };
  const Icon = visual.icon;
  return (
    <motion.div
      initial={false}
      animate={{ x: x - visual.size / 2, y: y - visual.size / 2 }}
      transition={{ type: 'tween', duration: type === 'driver' ? 1.8 : 0.25, ease: 'linear' }}
      className="absolute left-0 top-0 z-30 pointer-events-none"
    >
      {type === 'driver' && <span className="absolute inset-[-8px] rounded-full bg-[#00a884]/25 animate-ping" />}
      <div
        className={`relative rounded-full border-[3px] shadow-xl flex items-center justify-center ${visual.className}`}
        style={{ width: visual.size, height: visual.size, transform: type === 'driver' ? `rotate(${Number(heading || 0)}deg)` : undefined }}
      >
        <Icon className="w-5 h-5" />
      </div>
      {label && (
        <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap rounded-lg bg-white/95 border border-gray-200 px-2 py-1 text-[9px] font-black text-gray-700 shadow-md">
          {label}
        </span>
      )}
    </motion.div>
  );
};

export default function LiveDeliveryMap({
  route = [],
  polygon = [],
  store = null,
  destination = null,
  driver = null,
  className = 'h-[320px]',
  emptyMessage = 'No hay coordenadas disponibles para mostrar el mapa.',
  showLegend = true,
  snapDriverToRoute = true,
  drawPolygon = false,
  onPolygonPoint,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    lastX: number;
    lastY: number;
    pinchDistance: number;
    pinchZoom: number;
  } | null>(null);
  const fitSignatureRef = useRef('');
  const userInteractedRef = useRef(false);
  const [size, setSize] = useState({ width: 720, height: 360 });
  const [zoom, setZoom] = useState(15);
  const [center, setCenter] = useState<MapPoint>(DEFAULT_CENTER);
  const [dragging, setDragging] = useState(false);
  const [followDriver, setFollowDriver] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const update = () => setSize({ width: Math.max(260, element.clientWidth), height: Math.max(180, element.clientHeight) });
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const cleanRoute = useMemo(() => route.filter(pointInsideDominicanRepublic).map(normalizePoint), [route]);
  const cleanPolygon = useMemo(() => polygon.filter(pointInsideDominicanRepublic).map(normalizePoint), [polygon]);
  const displayDriver = useMemo(() => {
    if (!pointInsideDominicanRepublic(driver)) return null;
    return snapDriverToRoute
      ? snapPointToRoute(driver as LiveMapDriver, cleanRoute)
      : driver;
  }, [cleanRoute, driver, snapDriverToRoute]);
  const structuralPoints = useMemo(() => [
    ...cleanRoute,
    ...cleanPolygon,
    ...(pointInsideDominicanRepublic(store) ? [normalizePoint(store as MapPoint)] : []),
    ...(pointInsideDominicanRepublic(destination) ? [normalizePoint(destination as MapPoint)] : []),
  ], [cleanRoute, cleanPolygon, store, destination]);
  const allPoints = useMemo(() => [
    ...structuralPoints,
    ...(pointInsideDominicanRepublic(displayDriver) ? [normalizePoint(displayDriver as MapPoint)] : []),
  ], [structuralPoints, displayDriver]);

  const countryMinZoom = useMemo(() => minimumCountryZoom(size.width, size.height), [size.height, size.width]);

  const fitView = useCallback(() => {
    if (!allPoints.length) return;
    const bounds = boundsFor(allPoints);
    if (!bounds) return;
    const nextZoom = Math.max(countryMinZoom, fitZoom(allPoints, size.width, size.height));
    const nextCenter = constrainCenterToDominicanRepublic({
      lat: (bounds.minLat + bounds.maxLat) / 2,
      lng: (bounds.minLng + bounds.maxLng) / 2,
    }, nextZoom, size.width, size.height);
    setCenter(nextCenter);
    setZoom(nextZoom);
    setFollowDriver(false);
    userInteractedRef.current = false;
  }, [allPoints, countryMinZoom, size.height, size.width]);

  const structuralSignature = useMemo(() => JSON.stringify({
    route: cleanRoute,
    polygon: cleanPolygon,
    store: pointInsideDominicanRepublic(store) ? normalizePoint(store as MapPoint) : null,
    destination: pointInsideDominicanRepublic(destination) ? normalizePoint(destination as MapPoint) : null,
  }), [cleanRoute, cleanPolygon, destination, store]);

  useEffect(() => {
    if (!allPoints.length) return;
    if (fitSignatureRef.current === structuralSignature) return;
    fitSignatureRef.current = structuralSignature;
    fitView();
  }, [allPoints.length, fitView, structuralSignature]);

  useEffect(() => {
    if (!userInteractedRef.current && allPoints.length > 0) fitView();
  }, [allPoints.length, fitView, size.height, size.width]);

  useEffect(() => {
    if (followDriver && pointInsideDominicanRepublic(displayDriver)) {
      setCenter(constrainCenterToDominicanRepublic(normalizePoint(displayDriver as MapPoint), zoom, size.width, size.height));
    }
  }, [displayDriver, followDriver, size.height, size.width, zoom]);


  useEffect(() => {
    const nextZoom = Math.max(zoom, countryMinZoom);
    if (nextZoom !== zoom) setZoom(nextZoom);
    setCenter((current) => {
      const next = constrainCenterToDominicanRepublic(current, nextZoom, size.width, size.height);
      return Math.abs(next.lat - current.lat) < 0.0000001 && Math.abs(next.lng - current.lng) < 0.0000001
        ? current
        : next;
    });
    // Recalculate only when the viewport or its country floor changes. All direct map actions constrain themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryMinZoom, size.height, size.width]);

  const centerWorld = useMemo(() => worldPoint(center, zoom), [center, zoom]);

  const panByPixels = useCallback((deltaX: number, deltaY: number) => {
    setCenter((current) => {
      const world = worldPoint(current, zoom);
      return constrainCenterToDominicanRepublic(geographicPoint({ x: world.x - deltaX, y: world.y - deltaY }, zoom), zoom, size.width, size.height);
    });
    setFollowDriver(false);
    userInteractedRef.current = true;
  }, [size.height, size.width, zoom]);

  const setConstrainedZoom = useCallback((nextZoom: number) => {
    const constrainedZoom = clamp(nextZoom, countryMinZoom, MAX_ZOOM);
    setZoom(constrainedZoom);
    setCenter((current) => constrainCenterToDominicanRepublic(current, constrainedZoom, size.width, size.height));
  }, [countryMinZoom, size.height, size.width]);

  const zoomBy = useCallback((delta: number) => {
    setConstrainedZoom(zoom + delta);
    setFollowDriver(false);
    userInteractedRef.current = true;
  }, [setConstrainedZoom, zoom]);

  const pointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drawPolygon) return;
    if (!allPoints.length) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPosition(event);
    pointersRef.current.set(event.pointerId, point);
    const pointers = Array.from(pointersRef.current.values()) as Array<{ x: number; y: number }>;
    if (pointers.length === 1) {
      gestureRef.current = { lastX: point.x, lastY: point.y, pinchDistance: 0, pinchZoom: zoom };
      setDragging(true);
    } else if (pointers.length === 2) {
      const [first, second] = pointers;
      gestureRef.current = {
        lastX: (first.x + second.x) / 2,
        lastY: (first.y + second.y) / 2,
        pinchDistance: Math.hypot(first.x - second.x, first.y - second.y),
        pinchZoom: zoom,
      };
      setDragging(false);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drawPolygon) return;
    if (!pointersRef.current.has(event.pointerId) || !gestureRef.current) return;
    const point = pointerPosition(event);
    pointersRef.current.set(event.pointerId, point);
    const pointers = Array.from(pointersRef.current.values()) as Array<{ x: number; y: number }>;

    if (pointers.length >= 2) {
      const [first, second] = pointers;
      const centroid = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const distance = Math.max(1, Math.hypot(first.x - second.x, first.y - second.y));
      const gesture = gestureRef.current;
      if (gesture.pinchDistance > 0) {
        const zoomDelta = Math.round(Math.log2(distance / gesture.pinchDistance));
        setConstrainedZoom(gesture.pinchZoom + zoomDelta);
      }
      panByPixels(centroid.x - gesture.lastX, centroid.y - gesture.lastY);
      gesture.lastX = centroid.x;
      gesture.lastY = centroid.y;
      return;
    }

    const gesture = gestureRef.current;
    panByPixels(point.x - gesture.lastX, point.y - gesture.lastY);
    gesture.lastX = point.x;
    gesture.lastY = point.y;
  };

  const finishPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drawPolygon) return;
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const pointers = Array.from(pointersRef.current.values()) as Array<{ x: number; y: number }>;
    if (pointers.length === 1) {
      const [point] = pointers;
      gestureRef.current = { lastX: point.x, lastY: point.y, pinchDistance: 0, pinchZoom: zoom };
      setDragging(true);
    } else if (pointers.length === 0) {
      gestureRef.current = null;
      setDragging(false);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!allPoints.length) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1 : -1);
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (drawPolygon) return;
    if (!allPoints.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - size.width / 2;
    const offsetY = event.clientY - rect.top - size.height / 2;
    const selected = geographicPoint({ x: centerWorld.x + offsetX, y: centerWorld.y + offsetY }, zoom);
    setCenter(constrainCenterToDominicanRepublic(selected, zoom, size.width, size.height));
    zoomBy(1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 120 : 50;
    if (event.key === 'ArrowLeft') panByPixels(step, 0);
    else if (event.key === 'ArrowRight') panByPixels(-step, 0);
    else if (event.key === 'ArrowUp') panByPixels(0, step);
    else if (event.key === 'ArrowDown') panByPixels(0, -step);
    else if (event.key === '+' || event.key === '=') zoomBy(1);
    else if (event.key === '-') zoomBy(-1);
    else if (event.key === 'Home') fitView();
    else return;
    event.preventDefault();
  };

  const tiles = useMemo(() => {
    const count = 2 ** zoom;
    const minX = Math.floor((centerWorld.x - size.width / 2) / TILE_SIZE) - 1;
    const maxX = Math.floor((centerWorld.x + size.width / 2) / TILE_SIZE) + 1;
    const minY = Math.max(0, Math.floor((centerWorld.y - size.height / 2) / TILE_SIZE) - 1);
    const maxY = Math.min(count - 1, Math.floor((centerWorld.y + size.height / 2) / TILE_SIZE) + 1);
    const result: Array<{ key: string; src: string; left: number; top: number }> = [];
    for (let tileY = minY; tileY <= maxY; tileY += 1) {
      for (let tileX = minX; tileX <= maxX; tileX += 1) {
        const wrappedX = ((tileX % count) + count) % count;
        result.push({
          key: `${zoom}-${tileX}-${tileY}`,
          src: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`,
          left: tileX * TILE_SIZE - centerWorld.x + size.width / 2,
          top: tileY * TILE_SIZE - centerWorld.y + size.height / 2,
        });
      }
    }
    return result;
  }, [centerWorld.x, centerWorld.y, size.height, size.width, zoom]);

  const routePath = useMemo(() => cleanRoute.map((point) => {
    const world = worldPoint(point, zoom);
    return `${world.x - centerWorld.x + size.width / 2},${world.y - centerWorld.y + size.height / 2}`;
  }).join(' '), [cleanRoute, zoom, centerWorld.x, centerWorld.y, size.width, size.height]);

  const polygonPath = useMemo(() => cleanPolygon.map((point) => {
    const world = worldPoint(point, zoom);
    return `${world.x - centerWorld.x + size.width / 2},${world.y - centerWorld.y + size.height / 2}`;
  }).join(' '), [cleanPolygon, zoom, centerWorld.x, centerWorld.y, size.width, size.height]);

  const handleMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!drawPolygon || !onPolygonPoint) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - size.width / 2;
    const offsetY = event.clientY - rect.top - size.height / 2;
    const selected = geographicPoint({ x: centerWorld.x + offsetX, y: centerWorld.y + offsetY }, zoom);
    if (pointInsideDominicanRepublic(selected)) onPolygonPoint(normalizePoint(selected));
  };


  const countryScreenShapes = useMemo(() => DOMINICAN_REPUBLIC_SHAPES.map((shape) => shape.map((point) => {
    const world = worldPoint(point, zoom);
    return {
      x: world.x - centerWorld.x + size.width / 2,
      y: world.y - centerWorld.y + size.height / 2,
    };
  })), [centerWorld.x, centerWorld.y, size.height, size.width, zoom]);

  const countryMaskPath = useMemo(() => {
    const viewport = `M 0 0 H ${size.width} V ${size.height} H 0 Z`;
    const countryHoles = countryScreenShapes.map((shape) => {
      if (!shape.length) return '';
      return `M ${shape.map((point) => `${point.x} ${point.y}`).join(' L ')} Z`;
    }).join(' ');
    return `${viewport} ${countryHoles}`;
  }, [countryScreenShapes, size.height, size.width]);

  return (
    <div
      ref={containerRef}
      role="application"
      tabIndex={0}
      aria-label="Mapa interactivo de la entrega limitado a República Dominicana"
      className={`relative overflow-hidden bg-[#e7eef4] outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] ${drawPolygon ? 'cursor-crosshair' : dragging ? 'cursor-grabbing' : 'cursor-grab'} ${className}`}
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onClick={handleMapClick}
      onKeyDown={handleKeyDown}
    >
      {!allPoints.length ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 bg-gray-50 cursor-default">
          <FiNavigation className="text-5xl text-gray-200" />
          <p className="text-sm font-bold text-gray-500 mt-3">{emptyMessage}</p>
        </div>
      ) : (
        <>
          <div className="absolute inset-0 pointer-events-none select-none">
            {tiles.map((tile) => (
              <img
                key={tile.key}
                src={tile.src}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="absolute w-64 h-64 max-w-none select-none pointer-events-none"
                style={{ left: tile.left, top: tile.top }}
              />
            ))}
          </div>

          <svg className="absolute inset-0 z-10 pointer-events-none" width={size.width} height={size.height} aria-hidden="true">
            <path d={countryMaskPath} fill="rgba(231, 238, 244, 0.88)" fillRule="evenodd" />
            {countryScreenShapes.map((shape, index) => (
              <polygon
                key={`country-outline-${index}`}
                points={shape.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="none"
                stroke="rgba(0, 168, 132, 0.32)"
                strokeWidth="1.5"
              />
            ))}
          </svg>

          <svg className="absolute inset-0 z-20 pointer-events-none" width={size.width} height={size.height} aria-hidden="true">
            {polygonPath && <>
              <polygon points={polygonPath} fill="rgba(0,168,132,0.20)" stroke="rgba(255,255,255,0.95)" strokeWidth="7" strokeLinejoin="round" />
              <polygon points={polygonPath} fill="rgba(0,168,132,0.14)" stroke="#00a884" strokeWidth="3" strokeLinejoin="round" />
              {cleanPolygon.map((point, index) => {
                const world = worldPoint(point, zoom);
                const x = world.x - centerWorld.x + size.width / 2;
                const y = world.y - centerWorld.y + size.height / 2;
                return <circle key={`polygon-vertex-${index}`} cx={x} cy={y} r="5" fill="#ffffff" stroke="#00a884" strokeWidth="3" />;
              })}
            </>}
            {routePath && <>
              <polyline points={routePath} fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={routePath} fill="none" stroke="#2563eb" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 7">
                <animate attributeName="stroke-dashoffset" from="0" to="-34" dur="1.4s" repeatCount="indefinite" />
              </polyline>
            </>}
          </svg>
          <Marker point={store} centerWorld={centerWorld} zoom={zoom} width={size.width} height={size.height} type="store" label={store?.label || 'Negocio'} />
          <Marker point={destination} centerWorld={centerWorld} zoom={zoom} width={size.width} height={size.height} type="destination" label={destination?.label || 'Cliente'} />
          <Marker point={displayDriver} centerWorld={centerWorld} zoom={zoom} width={size.width} height={size.height} type="driver" label={driver?.label || 'Repartidor'} heading={driver?.heading} />
        </>
      )}

      {allPoints.length > 0 && (
        <div
          className="absolute right-3 top-3 z-40 flex flex-col rounded-xl overflow-hidden border border-gray-200 shadow-lg bg-white cursor-default"
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={(event) => { event.stopPropagation(); zoomBy(1); }} className="w-9 h-9 flex items-center justify-center text-gray-700 hover:bg-gray-50" aria-label="Acercar mapa"><FiPlus /></button>
          <button type="button" onClick={(event) => { event.stopPropagation(); zoomBy(-1); }} className="w-9 h-9 flex items-center justify-center text-gray-700 border-t border-gray-100 hover:bg-gray-50" aria-label="Alejar mapa"><FiMinus /></button>
          {pointInsideDominicanRepublic(displayDriver) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setCenter(constrainCenterToDominicanRepublic(normalizePoint(displayDriver as MapPoint), Math.max(zoom, 15), size.width, size.height));
                setConstrainedZoom(Math.max(zoom, 15));
                setFollowDriver(true);
                userInteractedRef.current = true;
              }}
              className={`w-9 h-9 flex items-center justify-center border-t border-gray-100 hover:bg-gray-50 ${followDriver ? 'text-[#00a884] bg-emerald-50' : 'text-gray-700'}`}
              aria-label="Centrar y seguir al repartidor"
              title="Centrar repartidor"
            >
              <FiCrosshair />
            </button>
          )}
          <button type="button" onClick={(event) => { event.stopPropagation(); fitView(); }} className="w-9 h-9 flex items-center justify-center text-gray-700 border-t border-gray-100 hover:bg-gray-50" aria-label="Mostrar toda la ruta" title="Mostrar ruta completa"><FiMaximize2 /></button>
        </div>
      )}

      {showLegend && allPoints.length > 0 && (
        <div className="absolute left-3 bottom-7 z-40 flex flex-wrap gap-1.5 rounded-xl bg-white/95 border border-gray-200 shadow-md px-2.5 py-2 text-[9px] font-black text-gray-600 pointer-events-none">
          <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-[#1a2332]" /> Negocio</span>
          <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-[#00a884]" /> Repartidor</span>
          <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-rose-500" /> Cliente</span>
        </div>
      )}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="absolute bottom-1 right-2 z-40 text-[8px] text-gray-600 bg-white/80 px-1.5 py-0.5 rounded cursor-pointer" onPointerDown={(event) => event.stopPropagation()}>© OpenStreetMap</a>
    </div>
  );
}
