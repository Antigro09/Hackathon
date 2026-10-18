import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import * as L from 'leaflet';
import type { AnalysisResult } from '../types';
import {
  canMapNumericResult, createSessionMapReading, parseManualCoordinates, peakDescription,
  readingColor, readingProvenance, syntheticReadings,
} from '../data/readings';
import type { MapReading, SessionMapReading } from '../data/readings';
import { qualityDescriptions } from '../data/references';
import 'leaflet/dist/leaflet.css';
import '../map.css';

export interface ObservationMapProps {
  currentResult: AnalysisResult | null;
  sessionReadings?: readonly SessionMapReading[];
  onAddReading?: (reading: SessionMapReading) => void;
  onClearSessionReadings?: () => void;
}

type TileStatus = 'schematic' | 'loading' | 'ready' | 'failed' | 'offline';

function gapText(reading: MapReading): string {
  return reading.cMinusADb === null ? 'C−A unavailable · inconclusive' : `Captured-spectrum C−A ${reading.cMinusADb.toFixed(1)} dB`;
}

function screenText(reading: MapReading): string {
  const color = readingColor(reading);
  if (color === 'amber') return 'Low-frequency contribution suggested';
  return color === 'neutral' ? 'Below the prototype’s 15 dB low-frequency threshold' : 'Low-frequency screen inconclusive';
}

function levelsText(reading: MapReading): string {
  if (reading.aDigitalDb === null || reading.cDigitalDb === null) return 'Weighted digital levels unavailable';
  return `A: ${reading.aDigitalDb.toFixed(1)} · C: ${reading.cDigitalDb.toFixed(1)} dB re digital RMS 1`;
}

function coordinateText(reading: MapReading): string {
  return reading.coordinates
    ? reading.provenance === 'synthetic-demo'
      ? `${reading.coordinates.latitude.toFixed(2)}, ${reading.coordinates.longitude.toFixed(2)}`
      : `${reading.coordinates.latitude}, ${reading.coordinates.longitude}`
    : 'Unplaced · recording location not supplied';
}

function popupElement(reading: MapReading): HTMLElement {
  const content = document.createElement('div');
  content.className = 'tw-map-popup';
  const badge = document.createElement('strong');
  badge.className = 'map-provenance';
  badge.textContent = readingProvenance(reading);
  content.append(badge);
  const title = document.createElement('h3');
  title.textContent = reading.label;
  content.append(title);
  const line = (text: string) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    content.append(paragraph);
  };
  line(gapText(reading));
  line(screenText(reading));
  line(`${levelsText(reading)} · uncalibrated input`);
  line(`${peakDescription(reading.peakScreen)} · separate experimental check`);
  line(`${reading.provenance === 'synthetic-demo' ? 'Illustrative coordinates' : 'User-entered recording coordinates'}: ${coordinateText(reading)}`);
  if (reading.provenance === 'synthetic-demo') {
    line(reading.exampleDevice);
    line(reading.exampleTime);
    line(reading.exampleConditions);
  } else {
    line(`Original input: ${reading.inputKind}${reading.inputLabel ? ` · ${reading.inputLabel}` : ''}`);
    line(`Analysis created: ${reading.analysisCreatedUtc}`);
    line(`Recording time: ${reading.recordedAtUtc ?? 'unknown; not inferred from analysis time'}`);
    line('Session only · resets on reload. Location association supplied by the user.');
  }
  if (reading.qualityCodes.length) {
    line(`Input limitations: ${reading.qualityCodes.map(code => qualityDescriptions[code]).join(' ')}`);
  }
  line('Uncalibrated screening only. No source identification or legal-compliance determination.');
  return content;
}

function markerIcon(reading: MapReading, number: number): L.DivIcon {
  const node = document.createElement('span');
  node.className = `tw-map-pin tw-map-pin--${readingColor(reading)}`;
  const dot = document.createElement('span');
  dot.className = 'tw-map-pin-dot';
  dot.textContent = String(number);
  const provenance = document.createElement('span');
  provenance.className = 'tw-map-pin-origin';
  provenance.textContent = reading.inputKind === 'synthetic'
    ? 'SYNTHETIC DEMO'
    : reading.inputKind === 'imported-file' ? 'FILE · LOCAL' : 'MIC · LOCAL';
  node.append(dot, provenance);
  return L.divIcon({ html: node, className: 'tw-map-marker', iconSize: [28, 42], iconAnchor: [14, 14], popupAnchor: [0, -16] });
}

function ReadingCard({ reading, onLocate }: { reading: MapReading; onLocate: (id: string) => void }) {
  return <article className={`map-reading map-reading--${readingColor(reading)}`}>
    <p className="map-provenance">{readingProvenance(reading)}</p>
    <h3>{reading.label}</h3>
    <p className="map-reading-gap">{gapText(reading)}</p>
    <p>{screenText(reading)}</p>
    <p className="map-digital-levels">{levelsText(reading)}<br /><strong>Uncalibrated input</strong></p>
    <p>{peakDescription(reading.peakScreen)} · separate check</p>
    <details>
      <summary>Provenance & context</summary>
      <p>{reading.provenance === 'synthetic-demo' ? 'Approximate illustrative coordinates' : 'User-entered coordinates'}: {coordinateText(reading)}</p>
      {reading.provenance === 'synthetic-demo' ? <>
        <p>{reading.exampleDevice}</p><p>{reading.exampleTime}</p><p>{reading.exampleConditions}</p>
      </> : <>
        <p>Original input: {reading.inputKind}{reading.inputLabel ? ` · ${reading.inputLabel}` : ''}</p>
        <p>Analysis created: {reading.analysisCreatedUtc}</p>
        <p>Recording time: {reading.recordedAtUtc ?? 'Unknown; not inferred from analysis time'}</p>
        <p>{reading.durationSeconds} s · {reading.sampleRateHz.toLocaleString()} Hz · session only, resets on reload.</p>
      </>}
      {reading.qualityCodes.length ? <ul>{reading.qualityCodes.map(code => <li key={code}>{qualityDescriptions[code]}</li>)}</ul> : null}
    </details>
    {reading.coordinates ? <button type="button" className="map-locate" onClick={() => onLocate(reading.id)}>Show this pin <span aria-hidden="true">↗</span></button> : <p className="map-unplaced">Kept in the local list; no location was inferred.</p>}
  </article>;
}

export default function ObservationMap({ currentResult, sessionReadings, onAddReading, onClearSessionReadings }: ObservationMapProps) {
  const [internalReadings, setInternalReadings] = useState<SessionMapReading[]>([]);
  const currentReadings = sessionReadings ?? internalReadings;
  const readings = useMemo(() => [...syntheticReadings, ...currentReadings], [currentReadings]);
  const [tilesEnabled, setTilesEnabled] = useState(false);
  const [tileStatus, setTileStatus] = useState<TileStatus>('schematic');
  const [label, setLabel] = useState('');
  const [placement, setPlacement] = useState<'unplaced' | 'coordinates'>('unplaced');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [confirmedResultId, setConfirmedResultId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const numericAvailable = currentResult ? canMapNumericResult(currentResult) : false;
  const locationConfirmed = currentResult !== null && confirmedResultId === currentResult.id;

  useEffect(() => {
    if (!hostRef.current) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const map = L.map(hostRef.current, {
      scrollWheelZoom: false, minZoom: 2, maxZoom: 18,
      zoomAnimation: !reducedMotion, fadeAnimation: !reducedMotion, markerZoomAnimation: !reducedMotion,
    });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
    map.fitBounds(syntheticReadings.map(reading => [reading.coordinates.latitude, reading.coordinates.longitude] as L.LatLngTuple), { padding: [45, 45], maxZoom: 11, animate: false });
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
      hostRef.current?.style.setProperty('--map-popup-max', `${Math.max(110, map.getSize().x - 64)}px`);
    });
    observer.observe(hostRef.current);
    const offline = () => { setTilesEnabled(false); setTileStatus('offline'); };
    window.addEventListener('offline', offline);
    return () => {
      observer.disconnect();
      window.removeEventListener('offline', offline);
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    readings.forEach((reading, index) => {
      if (!reading.coordinates) return;
      const marker = L.marker([reading.coordinates.latitude, reading.coordinates.longitude], {
        icon: markerIcon(reading, index + 1), keyboard: true,
        title: `${readingProvenance(reading)} · ${reading.label} · ${gapText(reading)}`,
        alt: `${readingProvenance(reading)} · ${reading.label}`,
      });
      marker.bindPopup(popupElement(reading), { maxWidth: 290, minWidth: 170, autoPanPadding: [16, 16] });
      marker.addTo(layer);
      markersRef.current.set(reading.id, marker);
    });
  }, [readings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tilesEnabled) return;
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      minZoom: 2, maxZoom: 18, keepBuffer: 0, updateWhenIdle: true,
    });
    const ready = () => setTileStatus('ready');
    const failed = () => { setTileStatus('failed'); setTilesEnabled(false); };
    tiles.on('tileload', ready);
    tiles.on('tileerror', failed);
    tiles.addTo(map);
    return () => {
      tiles.off('tileload', ready);
      tiles.off('tileerror', failed);
      map.removeLayer(tiles);
    };
  }, [tilesEnabled]);

  const toggleTiles = () => {
    if (tilesEnabled) { setTilesEnabled(false); setTileStatus('schematic'); return; }
    if (!navigator.onLine) { setTileStatus('offline'); return; }
    setTileStatus('loading');
    setTilesEnabled(true);
  };

  const locate = (id: string) => {
    const map = mapRef.current;
    const marker = markersRef.current.get(id);
    if (!map || !marker) return;
    map.setView(marker.getLatLng(), map.getZoom(), { animate: false });
    marker.openPopup();
    hostRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
  };

  const resetView = () => {
    const coordinates = readings.flatMap(reading => reading.coordinates ? [[reading.coordinates.latitude, reading.coordinates.longitude] as L.LatLngTuple] : []);
    if (coordinates.length) mapRef.current?.fitBounds(coordinates, { padding: [45, 45], maxZoom: 11, animate: false });
  };

  const addReading = (event: FormEvent) => {
    event.preventDefault();
    if (!currentResult) return;
    setFormError('');
    try {
      const coordinates = placement === 'coordinates' ? parseManualCoordinates(latitude, longitude) : null;
      const reading = createSessionMapReading(currentResult, { label, coordinates, locationConfirmed });
      if (onAddReading) onAddReading(reading);
      else setInternalReadings(previous => [...previous, reading]);
      setFeedback(`Added “${reading.label}” ${coordinates ? 'at your confirmed coordinates' : 'as an unplaced observation'}. Local preview only; resets on reload.`);
      setLabel('');
      setConfirmedResultId(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The local preview could not be added. Check the entered location.');
    }
  };

  const clearReadings = () => {
    if (onClearSessionReadings) onClearSessionReadings();
    else setInternalReadings([]);
    setFeedback('Local preview observations cleared. Synthetic demonstration records remain.');
  };

  const tileMessage = tileStatus === 'ready'
    ? 'OpenStreetMap basemap loaded online. Synthetic pins remain invented examples.'
    : tileStatus === 'loading' ? 'Loading optional street tiles. Local pins and the full list remain available.'
      : tileStatus === 'failed' || tileStatus === 'offline'
        ? 'Street basemap unavailable. Showing a neutral grid with local pins; no roads or boundaries are supplied offline.'
        : 'Neutral coordinate grid · no streets or boundaries. Pins and the list work without a tile connection.';

  return <main id="main-content" className="page-shell observation-map" aria-labelledby="observation-map-title">
    <header className="page-heading">
      <div><p className="eyebrow">An illustration of place, with provenance</p><h1 id="observation-map-title">Observation map</h1><p>Explore the demonstration, or place a result from this session yourself.</p></div>
      <a className="button secondary" href="#/measure">Make an observation</a>
    </header>
    <div className="map-demo-banner"><strong>SYNTHETIC DEMO · {syntheticReadings.length} invented examples</strong><p>Illustrative positions near Ashburn, Sterling and Chantilly. No measurement was collected at any seeded site; no household, facility or sound source is identified.</p></div>
    <div className="map-workspace">
      <section className="map-panel panel" aria-label="Map and legend">
        <div className="map-view-heading"><strong>SYNTHETIC DEMO LAYER</strong><button type="button" onClick={resetView}>Show all placed pins</button></div>
        <div className="observation-leaflet" ref={hostRef} role="region" aria-label="Interactive map. Every seeded pin is synthetic. The same observations are available in the list below." />
        <p className="map-basemap-status" role="status">{tileMessage}</p>
        <div className="map-legend" aria-label="Pin color legend">
          <span><i className="legend-dot neutral" />C−A &lt; 15 dB</span><span><i className="legend-dot amber" />C−A ≥ 15 dB: low-frequency contribution suggested</span><span><i className="legend-dot unavailable" />Inconclusive / unavailable</span>
        </div>
        <p className="map-boundary">Color describes the low-frequency screen only. The sustained-peak check is independent. Uncalibrated screening only. No source identification or legal-compliance determination.</p>
        <div className="map-basemap-actions"><button type="button" className="button secondary" onClick={toggleTiles}>{tilesEnabled ? 'Use neutral grid' : tileStatus === 'failed' ? 'Retry street map' : 'Load street map'}</button><p>Optional online tiles contact OpenStreetMap with your IP and viewed area. Audio and observation fields stay local. No offline basemap download is provided. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Map attribution</a></p></div>
      </section>
      <aside className="map-local-panel panel">
        <p className="eyebrow">Your session, kept separate</p><h2>Add a local preview</h2><p>Manually associate a result with its recording location, or keep the location unknown. No GPS, geocoding or upload.</p>
        <p className="map-local-note">Local preview · resets on reload. Navigating between app pages keeps it only while this session remains open.</p>
        {currentResult ? <form onSubmit={addReading}>
          <p className="map-current-origin"><strong>{currentResult.inputKind === 'synthetic' ? 'SYNTHETIC INPUT' : currentResult.inputKind === 'imported-file' ? 'IMPORTED FILE' : 'MICROPHONE'}</strong><span>{currentResult.inputLabel ?? 'Current analysis'}</span></p>
          {!numericAvailable ? <p className="map-form-warning">This result is inconclusive. Numeric map values are unavailable; you can keep an unplaced descriptive entry.</p> : null}
          <label htmlFor="map-location-label">Label for this observation<input id="map-location-label" value={label} onChange={event => setLabel(event.target.value)} maxLength={120} required placeholder="For example: my recording location" /></label>
          <fieldset className="map-placement"><legend>Recording location</legend><label><input type="radio" name="map-placement" value="unplaced" checked={placement === 'unplaced'} onChange={() => setPlacement('unplaced')} />Unknown — keep unplaced</label><label><input type="radio" name="map-placement" value="coordinates" checked={placement === 'coordinates'} onChange={() => setPlacement('coordinates')} disabled={!numericAvailable} />Enter recording coordinates</label></fieldset>
          {placement === 'coordinates' ? <>
            <div className="map-coordinate-fields"><label htmlFor="map-latitude">Latitude<input id="map-latitude" inputMode="decimal" type="text" value={latitude} onChange={event => { setLatitude(event.target.value); setConfirmedResultId(null); }} required placeholder="Enter latitude" /><small>−85 to 85</small></label><label htmlFor="map-longitude">Longitude<input id="map-longitude" inputMode="decimal" type="text" value={longitude} onChange={event => { setLongitude(event.target.value); setConfirmedResultId(null); }} required placeholder="Enter longitude" /><small>−180 to 180</small></label></div>
            <label className="map-location-confirm"><input type="checkbox" checked={locationConfirmed} onChange={event => setConfirmedResultId(event.target.checked ? currentResult.id : null)} required />{currentResult.inputKind === 'synthetic' ? 'I am placing a synthetic example for illustration; this is not a field measurement.' : currentResult.inputKind === 'imported-file' ? 'These coordinates describe where this imported recording was made, as supplied by me.' : 'These coordinates describe where this active microphone observation was recorded, as supplied by me.'}</label>
          </> : null}
          <button className="button primary" type="submit">{placement === 'coordinates' ? 'Add current result to map' : 'Keep current result unplaced'}<span className="sr-only"> (local preview)</span></button>
          {formError ? <p className="map-form-error" role="alert">{formError}</p> : null}
        </form> : <div className="map-no-result"><p>Analyze an input first to add your own preview. Every existing pin is a synthetic example.</p><a href="#/measure">Go to Observation →</a></div>}
        <p className="map-feedback" role="status">{feedback}</p>
        {currentReadings.length ? <button type="button" className="map-clear" onClick={clearReadings}>Clear {currentReadings.length} local preview {currentReadings.length === 1 ? 'entry' : 'entries'}</button> : null}
      </aside>
    </div>
    <section className="map-reading-section" aria-labelledby="map-reading-list-title">
      <div className="section-heading"><div><p className="eyebrow">Accessible with or without street tiles</p><h2 id="map-reading-list-title">All observations & provenance</h2></div><span>{syntheticReadings.length} synthetic · {currentReadings.length} session preview</span></div>
      <p className="map-list-note">The seeded data do not establish neighborhood conditions or spatial coverage. Approximate positions are illustrative; session coordinates are entered and associated by the user.</p>
      <div className="map-reading-list">{readings.map(reading => <ReadingCard key={reading.id} reading={reading} onLocate={locate} />)}</div>
    </section>
  </main>;
}
