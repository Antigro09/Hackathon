import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import * as L from 'leaflet';
import type { AnalysisResult } from '../types';
import {
  canMapNumericResult, createSessionMapReading, parseManualCoordinates, peakDescription,
  readingColor, syntheticReadings,
} from '../data/readings';
import type { MapReading, SessionMapReading } from '../data/readings';
import { LOUDOUN_DATA_CENTERS, LOUDOUN_DATA_CENTER_SOURCE } from '../data/loudounDataCenters';
import { Icon } from './Icon';
import { MiniGap } from './Motif';
import { NOISE_REPORTS, COMMUNITY_REPORTS_LINK } from '../data/noiseReports';
import type { NoiseReport } from '../data/noiseReports';
import 'leaflet/dist/leaflet.css';
import '../map.css';

export interface ObservationMapProps {
  currentResult: AnalysisResult | null;
  sessionReadings?: readonly SessionMapReading[];
  onAddReading?: (reading: SessionMapReading) => void;
  onClearSessionReadings?: () => void;
}

type BasemapStatus = 'loading' | 'ready' | 'unavailable';
interface Layers { dataCenters: boolean; news: boolean; demo: boolean; session: boolean }

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const gapValue = (reading: MapReading) => reading.cMinusADb === null ? '—' : `${reading.cMinusADb.toFixed(1)} dB`;
const screenText = (reading: MapReading) => {
  const color = readingColor(reading);
  return color === 'amber' ? 'Deep hum' : color === 'neutral' ? 'No deep hum' : 'Couldn’t tell';
};
const originTag = (reading: MapReading) => reading.provenance === 'synthetic-demo'
  ? 'Demo · synthetic'
  : reading.inputKind === 'imported-file' ? 'Your file' : reading.inputKind === 'synthetic' ? 'Your demo run' : 'Your microphone';

function popupElement(reading: MapReading): HTMLElement {
  const root = document.createElement('div');
  root.className = 'tw-pop';
  const tag = document.createElement('span');
  tag.className = `tw-pop-tag tw-pop-tag--${reading.provenance === 'synthetic-demo' ? 'demo' : 'own'}`;
  tag.textContent = originTag(reading);
  const title = document.createElement('strong');
  title.className = 'tw-pop-title';
  title.textContent = reading.label;
  const stats = document.createElement('dl');
  const add = (k: string, v: string) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    stats.append(dt, dd);
  };
  add('Gap', gapValue(reading));
  add('Result', screenText(reading));
  add('Steady tone', peakDescription(reading.peakScreen));
  const note = document.createElement('p');
  note.textContent = reading.provenance === 'synthetic-demo'
    ? 'Invented example for illustration. No measurement was taken here.'
    : 'Location entered by you. Uncalibrated screening only.';
  root.append(tag, title, stats, note);
  return root;
}

function readingIcon(reading: MapReading, n: number): L.DivIcon {
  const el = document.createElement('span');
  el.className = `tw-pin tw-pin--${readingColor(reading)}${reading.provenance === 'session-preview' ? ' tw-pin--own' : ''}`;
  el.textContent = String(n);
  return L.divIcon({ html: el, className: 'tw-pin-wrap', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14] });
}

function dataCenterPopup(address: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'tw-pop';
  const tag = document.createElement('span');
  tag.className = 'tw-pop-tag tw-pop-tag--dc';
  tag.textContent = 'Data center building';
  const title = document.createElement('strong');
  title.className = 'tw-pop-title';
  title.textContent = address || 'Address not listed';
  const note = document.createElement('p');
  note.textContent = 'Loudoun County GIS, existing structures. A building location, not a noise measurement.';
  root.append(tag, title, note);
  return root;
}

function newsPopup(report: NoiseReport): HTMLElement {
  const root = document.createElement('div');
  root.className = 'tw-pop';
  const tag = document.createElement('span');
  tag.className = 'tw-pop-tag tw-pop-tag--news';
  tag.textContent = 'Reported noise · news';
  const title = document.createElement('strong');
  title.className = 'tw-pop-title';
  title.textContent = report.place;
  const body = document.createElement('p');
  body.className = 'tw-pop-body';
  body.textContent = report.summary;
  const src = document.createElement('a');
  src.href = report.url; src.target = '_blank'; src.rel = 'noreferrer';
  src.textContent = `${report.source}, ${report.date}`;
  const note = document.createElement('p');
  note.textContent = 'Approximate area described in the report, not a measurement.';
  root.append(tag, title, body, src, note);
  return root;
}

// Address search uses OpenStreetMap Nominatim: one request per submit (no autocomplete), biased to Northern Virginia.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const NOVA_VIEWBOX = '-78.2,39.4,-76.9,38.5';

export default function ObservationMap({ currentResult, sessionReadings, onAddReading, onClearSessionReadings }: ObservationMapProps) {
  const [internalReadings, setInternalReadings] = useState<SessionMapReading[]>([]);
  const ownReadings = sessionReadings ?? internalReadings;
  const readings = useMemo<MapReading[]>(() => [...syntheticReadings, ...ownReadings], [ownReadings]);
  const [layers, setLayers] = useState<Layers>({ dataCenters: true, news: true, demo: true, session: true });
  const [basemap, setBasemap] = useState<BasemapStatus>('loading');
  const [label, setLabel] = useState('');
  const [placement, setPlacement] = useState<'unplaced' | 'coordinates'>('coordinates');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [confirmedResultId, setConfirmedResultId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const dcLayerRef = useRef<L.LayerGroup | null>(null);
  const demoLayerRef = useRef<L.LayerGroup | null>(null);
  const ownLayerRef = useRef<L.LayerGroup | null>(null);
  const newsLayerRef = useRef<L.LayerGroup | null>(null);
  const newsMarkersRef = useRef(new Map<string, L.Marker>());
  const searchMarkerRef = useRef<L.Marker | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState('');
  const markersRef = useRef(new Map<string, L.Marker>());
  const draftRef = useRef<L.Marker | null>(null);
  const pickRef = useRef(false);
  const numericAvailable = currentResult ? canMapNumericResult(currentResult) : false;
  const locationConfirmed = currentResult !== null && confirmedResultId === currentResult.id;
  const amberCount = syntheticReadings.filter(r => readingColor(r) === 'amber').length;

  useEffect(() => {
    if (!hostRef.current) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const map = L.map(hostRef.current, {
      scrollWheelZoom: false, minZoom: 3, maxZoom: 18, preferCanvas: true,
      zoomAnimation: !reducedMotion, fadeAnimation: !reducedMotion, markerZoomAnimation: !reducedMotion,
    });
    map.zoomControl.setPosition('topright');
    map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
    const bounds = L.latLngBounds([
      ...LOUDOUN_DATA_CENTERS.map(([lat, lng]) => [lat, lng] as L.LatLngTuple),
      ...syntheticReadings.map(r => [r.coordinates.latitude, r.coordinates.longitude] as L.LatLngTuple),
      ...NOISE_REPORTS.map(r => [r.lat, r.lng] as L.LatLngTuple),
    ]);
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12, animate: false });

    let failures = 0;
    const tiles = L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, updateWhenIdle: true });
    tiles.on('load', () => setBasemap('ready'));
    tiles.on('tileload', () => setBasemap(s => s === 'unavailable' ? s : 'ready'));
    tiles.on('tileerror', () => { failures += 1; if (failures >= 4) { setBasemap('unavailable'); map.removeLayer(tiles); } });
    if (navigator.onLine) tiles.addTo(map); else setBasemap('unavailable');
    const offline = () => { setBasemap('unavailable'); map.removeLayer(tiles); };
    window.addEventListener('offline', offline);

    const dcLayer = L.layerGroup();
    const renderer = L.canvas({ padding: 0.5 });
    for (const [lat, lng, address] of LOUDOUN_DATA_CENTERS) {
      L.circleMarker([lat, lng], { renderer, radius: 4, color: '#ffffff', weight: 1, fillColor: '#1c1c1e', fillOpacity: 0.85 })
        .bindPopup(() => dataCenterPopup(address), { maxWidth: 260 })
        .addTo(dcLayer);
    }
    dcLayer.addTo(map);
    const newsLayer = L.layerGroup().addTo(map);
    for (const report of NOISE_REPORTS) {
      const icon = L.divIcon({ html: '<span class="tw-news-pin" aria-hidden="true"></span>', className: 'tw-pin-wrap', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14] });
      const marker = L.marker([report.lat, report.lng], { icon, keyboard: true, title: 'Reported noise: ' + report.place, alt: 'Reported noise: ' + report.place, riseOnHover: true })
        .bindPopup(() => newsPopup(report), { maxWidth: 280, minWidth: 210 }).addTo(newsLayer);
      newsMarkersRef.current.set(report.id, marker);
    }
    newsLayerRef.current = newsLayer;
    const demoLayer = L.layerGroup().addTo(map);
    const ownLayer = L.layerGroup().addTo(map);
    mapRef.current = map; dcLayerRef.current = dcLayer; demoLayerRef.current = demoLayer; ownLayerRef.current = ownLayer;

    map.on('click', (event: L.LeafletMouseEvent) => {
      if (!pickRef.current) return;
      const { lat, lng } = event.latlng;
      setLatitude(lat.toFixed(5)); setLongitude(lng.toFixed(5)); setConfirmedResultId(null);
      const icon = L.divIcon({ html: '<span class="tw-pin tw-pin--draft"></span>', className: 'tw-pin-wrap', iconSize: [26, 26], iconAnchor: [13, 13] });
      if (draftRef.current) draftRef.current.setLatLng(event.latlng);
      else draftRef.current = L.marker(event.latlng, { icon, interactive: false }).addTo(map);
    });
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false, animate: false }));
    observer.observe(hostRef.current);
    return () => {
      observer.disconnect();
      window.removeEventListener('offline', offline);
      markersRef.current.clear();
      map.remove();
      mapRef.current = null; dcLayerRef.current = null; demoLayerRef.current = null; ownLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const demoLayer = demoLayerRef.current, ownLayer = ownLayerRef.current;
    if (!demoLayer || !ownLayer) return;
    demoLayer.clearLayers(); ownLayer.clearLayers(); markersRef.current.clear();
    readings.forEach((reading, index) => {
      if (!reading.coordinates) return;
      const marker = L.marker([reading.coordinates.latitude, reading.coordinates.longitude], {
        icon: readingIcon(reading, index + 1), keyboard: true, riseOnHover: true,
        title: `${originTag(reading)} · ${reading.label} · gap ${gapValue(reading)}`,
        alt: `${originTag(reading)} · ${reading.label}`,
      });
      marker.bindPopup(popupElement(reading), { maxWidth: 260, minWidth: 190 });
      marker.addTo(reading.provenance === 'synthetic-demo' ? demoLayer : ownLayer);
      markersRef.current.set(reading.id, marker);
    });
  }, [readings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pairs: [L.LayerGroup | null, boolean][] = [[dcLayerRef.current, layers.dataCenters], [newsLayerRef.current, layers.news], [demoLayerRef.current, layers.demo], [ownLayerRef.current, layers.session]];
    for (const [layer, on] of pairs) {
      if (!layer) continue;
      if (on && !map.hasLayer(layer)) layer.addTo(map);
      if (!on && map.hasLayer(layer)) map.removeLayer(layer);
    }
  }, [layers]);

  const picking = currentResult !== null && numericAvailable && placement === 'coordinates';
  useEffect(() => {
    pickRef.current = picking;
    hostRef.current?.classList.toggle('is-picking', picking);
    if (!picking && draftRef.current) { draftRef.current.remove(); draftRef.current = null; }
  }, [picking]);

  const toggle = (key: keyof Layers) => setLayers(prev => ({ ...prev, [key]: !prev[key] }));

  const locate = (id: string) => {
    const map = mapRef.current, marker = markersRef.current.get(id);
    if (!map || !marker) return;
    const reading = readings.find(r => r.id === id);
    if (reading) setLayers(prev => ({ ...prev, [reading.provenance === 'synthetic-demo' ? 'demo' : 'session']: true }));
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 13), { animate: false });
    marker.openPopup();
    hostRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const showNews = (id: string) => {
    const map = mapRef.current, marker = newsMarkersRef.current.get(id);
    if (!map || !marker) return;
    setLayers(prev => ({ ...prev, news: true }));
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 14), { animate: false });
    marker.openPopup();
    hostRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    const map = mapRef.current;
    if (!q || !map || searching) return;
    setSearching(true); setSearchNote('');
    try {
      const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=us&viewbox=${NOVA_VIEWBOX}&q=${encodeURIComponent(q)}`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(String(response.status));
      const hits = await response.json() as { lat: string; lon: string; display_name: string }[];
      if (!hits.length) { setSearchNote('No match. Try a street and town, like “Waxpool Rd, Ashburn”.'); return; }
      const latlng = L.latLng(Number(hits[0].lat), Number(hits[0].lon));
      map.setView(latlng, 15, { animate: false });
      const icon = L.divIcon({ html: '<span class="tw-search-pin"></span>', className: 'tw-pin-wrap', iconSize: [22, 22], iconAnchor: [11, 11] });
      if (searchMarkerRef.current) searchMarkerRef.current.setLatLng(latlng);
      else searchMarkerRef.current = L.marker(latlng, { icon, interactive: false, keyboard: false }).addTo(map);
      setSearchNote(hits[0].display_name.split(',').slice(0, 3).join(','));
      if (pickRef.current) {
        setLatitude(latlng.lat.toFixed(5)); setLongitude(latlng.lng.toFixed(5)); setConfirmedResultId(null);
        const draftIcon = L.divIcon({ html: '<span class="tw-pin tw-pin--draft"></span>', className: 'tw-pin-wrap', iconSize: [26, 26], iconAnchor: [13, 13] });
        if (draftRef.current) draftRef.current.setLatLng(latlng);
        else draftRef.current = L.marker(latlng, { icon: draftIcon, interactive: false }).addTo(map);
      }
    } catch {
      setSearchNote('Search is unavailable right now (it needs an internet connection). You can still tap the map.');
    } finally {
      setSearching(false);
    }
  };

  const resetView = () => {
    const pts: L.LatLngTuple[] = [
      ...(layers.dataCenters ? LOUDOUN_DATA_CENTERS.map(([lat, lng]) => [lat, lng] as L.LatLngTuple) : []),
      ...readings.flatMap(r => r.coordinates ? [[r.coordinates.latitude, r.coordinates.longitude] as L.LatLngTuple] : []),
    ];
    if (pts.length) mapRef.current?.fitBounds(pts, { padding: [30, 30], maxZoom: 13, animate: false });
  };

  const addReading = (event: FormEvent) => {
    event.preventDefault();
    if (!currentResult) return;
    setFormError('');
    try {
      const coordinates = placement === 'coordinates' && numericAvailable ? parseManualCoordinates(latitude, longitude) : null;
      const reading = createSessionMapReading(currentResult, { label, coordinates, locationConfirmed });
      if (onAddReading) onAddReading(reading); else setInternalReadings(prev => [...prev, reading]);
      setFeedback(`Added “${reading.label}”${coordinates ? ' to the map' : ' to the list (no location)'}. Kept in this browser session only.`);
      setLabel(''); setConfirmedResultId(null); setLatitude(''); setLongitude('');
      if (draftRef.current) { draftRef.current.remove(); draftRef.current = null; }
      if (coordinates) setTimeout(() => locate(reading.id), 0);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'This observation could not be added. Check the location fields.');
    }
  };

  const clearReadings = () => {
    if (onClearSessionReadings) onClearSessionReadings(); else setInternalReadings([]);
    setFeedback('Your session observations were cleared.');
  };

  return <main id="main-content" className="page-shell tw-map-page" aria-labelledby="observation-map-title">
    <header className="tw-map-head">
      <div>
        <h1 id="observation-map-title">Map</h1>
        <p className="tw-map-lede">Black dots are data center buildings in Loudoun County.</p>
      </div>
      <a className="button secondary" href="#/measure">Check a hum</a>
    </header>

    <div className="tw-map-stats" role="list">
      <div role="listitem"><strong>{LOUDOUN_DATA_CENTERS.length}</strong><span>data center buildings</span></div>
      <div role="listitem"><strong>{syntheticReadings.length}</strong><span>demo readings, {amberCount} at 15 dB+</span></div>
      <div role="listitem"><strong>{ownReadings.length}</strong><span>yours this session</span></div>
    </div>

    <form className="tw-map-search" role="search" onSubmit={search}>
      <label htmlFor="map-search" className="sr-only">Search an address or place</label>
      <input id="map-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search an address or place" autoComplete="street-address" enterKeyHint="search" />
      <button type="submit" className="button primary" disabled={searching || !query.trim()}>{searching ? 'Searching…' : 'Go'}</button>
    </form>
    {searchNote ? <p className="tw-map-search-note" role="status">{searchNote}</p> : null}
    <section className="tw-map-frame" aria-label="Map">
      <div className="tw-map-canvas" ref={hostRef} role="region" aria-label="Interactive map of Loudoun County data center buildings and readings. The same readings are listed below the map." />
      <div className="tw-map-layers" aria-label="Map layers">
        <strong>Layers</strong>
        <label><input type="checkbox" checked={layers.dataCenters} onChange={() => toggle('dataCenters')} /><i className="sw sw-dc" />Data center buildings</label>
        <label><input type="checkbox" checked={layers.news} onChange={() => toggle('news')} /><i className="sw sw-news" />Reported noise <em>news</em></label>
        <label><input type="checkbox" checked={layers.demo} onChange={() => toggle('demo')} /><i className="sw sw-amber" />Demo readings <em>synthetic</em></label>
        <label><input type="checkbox" checked={layers.session} onChange={() => toggle('session')} /><i className="sw sw-own" />Your observations</label>
        <div className="tw-map-key">
          <span><i className="sw sw-amber" />Gap 15 dB+</span>
          <span><i className="sw sw-neutral" />Under 15 dB</span>
          <span><i className="sw sw-na" />Couldn’t tell</span>
        </div>
        <button type="button" onClick={resetView}>Fit to all</button>
      </div>
      {basemap === 'unavailable' ? <p className="tw-map-offline" role="status">Street map unavailable offline. Dots and readings still work.</p> : null}
    </section>
    <p className="tw-map-source">Data center buildings: <a href={LOUDOUN_DATA_CENTER_SOURCE.url} target="_blank" rel="noreferrer">{LOUDOUN_DATA_CENTER_SOURCE.label}</a>, retrieved {LOUDOUN_DATA_CENTER_SOURCE.retrieved}. Demo readings are invented examples placed near Ashburn, Sterling and Chantilly; no measurement was taken at those spots. Basemap tiles and address search use OpenStreetMap; what you type in the search box is sent to OpenStreetMap’s search service.</p>

    <section className="panel tw-news" aria-labelledby="news-title">
      <h2 id="news-title">Reported noise</h2>
      <p className="tw-news-lede">Places where residents’ complaints about data center noise made the news.</p>
      <ul className="tw-news-list">{NOISE_REPORTS.map(report => <li key={report.id}>
        <span className="tw-news-pin" aria-hidden="true"/>
        <div><strong>{report.place}</strong><p>{report.summary}</p><a href={report.url} target="_blank" rel="noreferrer">{report.source}, {report.date}</a></div>
        <button type="button" className="tw-map-show" onClick={() => showNews(report.id)}>Show</button>
      </li>)}</ul>
      <p className="tw-news-foot">Pins mark the approximate area each report describes. For resident-submitted reports across Loudoun, see <a href={COMMUNITY_REPORTS_LINK.url} target="_blank" rel="noreferrer">{COMMUNITY_REPORTS_LINK.label}</a>. County complaint records are not published as open data.</p>
    </section>

    <div className="tw-map-grid">
      <section className="panel tw-map-add" aria-labelledby="map-add-title">
        <h2 id="map-add-title">Add your observation</h2>
        {currentResult ? <form onSubmit={addReading}>
          <p className="tw-map-current"><span>{currentResult.inputKind === 'synthetic' ? 'Demo run' : currentResult.inputKind === 'imported-file' ? 'Imported file' : 'Microphone'}</span>{currentResult.inputLabel ?? 'Current analysis'}{currentResult.cMinusADb !== null ? ` · gap ${currentResult.cMinusADb.toFixed(1)} dB` : ''}</p>
          {!numericAvailable ? <p className="tw-map-warn">This result is inconclusive, so it can be listed but not placed on the map.</p> : null}
          <label htmlFor="map-location-label">Name it<input id="map-location-label" value={label} onChange={e => setLabel(e.target.value)} maxLength={120} required placeholder="e.g. Back yard, Tuesday night" /></label>
          <fieldset className="tw-map-place"><legend>Location</legend><div className="tw-map-place-options">
            <label><input type="radio" name="map-placement" checked={placement === 'coordinates' && numericAvailable} onChange={() => setPlacement('coordinates')} disabled={!numericAvailable} />Pin on map</label>
            <label><input type="radio" name="map-placement" checked={placement === 'unplaced' || !numericAvailable} onChange={() => setPlacement('unplaced')} />No location</label>
          </div></fieldset>
          {placement === 'coordinates' && numericAvailable ? <>
            <p className="tw-map-hint"><Icon name="pin" size={16}/>{latitude && longitude ? 'Pin dropped. Tap the map again to move it.' : 'Tap the map where you recorded to drop your pin.'}</p>
            <div className="tw-map-coords">
              <label htmlFor="map-latitude">Latitude<input id="map-latitude" inputMode="decimal" value={latitude} onChange={e => { setLatitude(e.target.value); setConfirmedResultId(null); }} required placeholder="39.03" /></label>
              <label htmlFor="map-longitude">Longitude<input id="map-longitude" inputMode="decimal" value={longitude} onChange={e => { setLongitude(e.target.value); setConfirmedResultId(null); }} required placeholder="-77.47" /></label>
            </div>
            <label className="tw-map-confirm"><input type="checkbox" checked={locationConfirmed} onChange={e => setConfirmedResultId(e.target.checked ? currentResult.id : null)} required />{currentResult.inputKind === 'synthetic' ? 'I’m placing a demo run for illustration, not a field measurement.' : 'This is where the recording was made.'}</label>
          </> : null}
          <button className="button primary" type="submit">{placement === 'coordinates' && numericAvailable ? 'Add to map' : 'Add to list'}</button>
          {formError ? <p className="tw-map-error" role="alert">{formError}</p> : null}
        </form> : <div className="tw-map-empty"><p>Check a sound first, then pin it here.</p><a className="button primary" href="#/measure">Go to Check</a></div>}
        <p className="tw-map-feedback" role="status">{feedback}</p>
        <p className="tw-map-privacy">No GPS, no upload. Your observations stay in this browser tab.</p>
        {ownReadings.length ? <button type="button" className="text-button" onClick={clearReadings}>Clear my {ownReadings.length} observation{ownReadings.length === 1 ? '' : 's'}</button> : null}
      </section>

      <section className="panel tw-map-list" aria-labelledby="map-reading-list-title">
        <h2 id="map-reading-list-title">Readings</h2>
        <div className="tw-map-table-wrap"><table>
          <thead><tr><th>#</th><th>Reading</th><th>Gap</th><th>Result</th><th></th></tr></thead>
          <tbody>{readings.map((reading, index) => <tr key={reading.id} className={`row-${readingColor(reading)}`}>
            <td><span className={`tw-pin tw-pin--${readingColor(reading)}${reading.provenance === 'session-preview' ? ' tw-pin--own' : ''}`}>{index + 1}</span></td>
            <td><strong>{reading.provenance === 'synthetic-demo' ? reading.label.replace(/\s+—.*$/, '') : reading.label}</strong><small>{originTag(reading)}{reading.qualityCodes.length ? ' · quality flags' : ''}</small></td>
            <td className="num">{gapValue(reading)}<MiniGap gapDb={reading.cMinusADb} alert={readingColor(reading) === 'amber'}/></td>
            <td>{screenText(reading)}</td>
            <td>{reading.coordinates ? <button type="button" className="tw-map-show" onClick={() => locate(reading.id)}>Show</button> : <small>No location</small>}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="tw-map-foot">Demo readings are synthetic and only show how the map works. Colors show the gap; the steady-tone check is separate. Uncalibrated screening, not a legal or source determination.</p>
      </section>
    </div>
  </main>;
}
