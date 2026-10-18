import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import { LOUDOUN_DATA_CENTERS } from '../data/loudounDataCenters';
import 'leaflet/dist/leaflet.css';

/** Small, non-interactive preview of the real map: street basemap + the county's data center buildings. */
export default function MapPreview() {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hostRef.current) return;
    const map = L.map(hostRef.current, {
      zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.25, preferCanvas: true,
    });
    map.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(map);
    const renderer = L.canvas({ padding: 0.5 });
    for (const [lat, lng] of LOUDOUN_DATA_CENTERS) {
      L.circleMarker([lat, lng], { renderer, radius: 3.5, color: '#ffffff', weight: 1, fillColor: '#1c1c1e', fillOpacity: 0.9, interactive: false }).addTo(map);
    }
    map.fitBounds(L.latLngBounds(LOUDOUN_DATA_CENTERS.map(([lat, lng]) => [lat, lng] as L.LatLngTuple)), { padding: [16, 16], animate: false });
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false, animate: false }));
    observer.observe(hostRef.current);
    return () => { observer.disconnect(); map.remove(); };
  }, []);
  return <div className="map-preview-canvas" ref={hostRef} aria-hidden="true" />;
}
