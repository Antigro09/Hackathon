import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import * as L from 'leaflet';
import type { AnalysisResult } from '../types';
import type { SessionMapReading } from '../data/readings';
import { peakDescription } from '../data/readings';
import { qualityDescriptions } from '../data/references';
import { createDatacenterDiscovery } from '../data/datacenters';
import type { DatacenterSearchResult, LocationCandidate } from '../data/datacenters';
import { CommunityRequestError, deleteCommunityObservation, listCommunityObservations, publishCommunityObservation } from '../community/client';
import type { CommunityCoordinates, CommunityFeed, CommunityObservation, CommunityPublishResult } from '../community/types';
import { approximateCommunityCoordinates, communityScreeningPreview, makeCommunityDraft } from './communityMapDraft';
import { communityTabStorage, readCommunitySession, removalAccess, writeCommunitySession } from './communityMapSession';
import type { CommunityMapSession, RemovalAccess } from './communityMapSession';
import { LOUDOUN_DATA_CENTERS, LOUDOUN_DATA_CENTER_SOURCE } from '../data/loudounDataCenters';
import { NOISE_REPORTS, COMMUNITY_REPORTS_LINK } from '../data/noiseReports';
import { MiniGap } from './Motif';
import 'leaflet/dist/leaflet.css';
import '../map.css';

export interface ObservationMapProps {
  currentResult: AnalysisResult | null;
  // Compatibility with the old local layer. These entries never become public.
  sessionReadings?: readonly SessionMapReading[];
  onAddReading?: (reading: SessionMapReading) => void;
  onClearSessionReadings?: () => void;
}
type Status = 'idle' | 'loading' | 'ready' | 'error';
interface Layers { county: boolean; osm: boolean; observations: boolean; news: boolean }
type TileStatus = 'grid' | 'loading' | 'ready' | 'failed';
const INITIAL = { latitude: 39.0438, longitude: -77.4874 };
const coordinateText = (p: CommunityCoordinates) => `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`;
const point = (p: CommunityCoordinates): L.LatLngTuple => [p.latitude, p.longitude];
const errorText = (error: unknown) => error instanceof Error ? error.message : 'This service is unavailable. Please try again.';
const osmUrl = (p: { osmType: string; osmId: string | number }) => `https://www.openstreetmap.org/${p.osmType}/${p.osmId}`;
const color = (p: { cMinusADb: number | null }) => p.cMinusADb === null ? 'unavailable' : p.cMinusADb >= 15 ? 'amber' : 'neutral';
const gap = (p: { cMinusADb: number | null }) => p.cMinusADb === null ? 'Numeric screening unavailable' : `Captured-spectrum C−A ${p.cMinusADb.toFixed(1)} dB`;

/** Never pass contributor/provider strings to Leaflet's HTML-string helpers. */
function popup(title: string, lines: string[], link?: { label: string; url: string }) {
  const node = document.createElement('div'); node.className = 'tw-map-popup';
  const h = document.createElement('h3'); h.textContent = title; node.append(h);
  for (const text of lines) { const p = document.createElement('p'); p.textContent = text; node.append(p); }
  if (link) { const a = document.createElement('a'); a.href = link.url; a.textContent = link.label; a.target = '_blank'; a.rel = 'noreferrer'; node.append(a); }
  return node;
}
function icon(kind: 'facility' | 'public' | 'draft', text: string, value = 'neutral') {
  const node = document.createElement('span'); node.className = `tw-community-pin tw-community-pin--${kind} tw-community-pin--${value}`; node.textContent = text;
  return L.divIcon({ html: node, className: 'tw-community-marker', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14] });
}
function PublicCard({ reading, locate }: { reading: CommunityObservation; locate: (id: string) => void }) {
  return <article className={`map-reading map-reading--${color(reading)}`}>
    <p className="map-provenance">PUBLIC · SELF-REPORTED · UNVERIFIED</p><h3>{reading.label}</h3><p className="map-reading-gap">{gap(reading)}</p><MiniGap gapDb={reading.cMinusADb} alert={color(reading) === 'amber'}/>
    <p>{reading.cMinusADb === null ? 'Descriptive observation; no usable numeric screen.' : reading.cMinusADb >= 15 ? 'Low-frequency contribution suggested by the prototype screen.' : 'Below the prototype’s 15 dB low-frequency threshold.'}</p>
    <p>{peakDescription(reading.peakScreen)} · independent check</p>{reading.note ? <p className="map-public-note">{reading.note}</p> : null}
    <details><summary>Recording & source details</summary><p>Approximate recording location: {coordinateText(reading.coordinates)}. Rounded to three decimals; association supplied by the contributor.</p><p>Recorded {new Date(reading.capturedAtUtc).toLocaleString()} · {reading.durationSeconds} s · {reading.sampleRateHz.toLocaleString()} Hz</p><p>{reading.aDigitalDb === null || reading.cDigitalDb === null ? 'Weighted levels unavailable.' : `A ${reading.aDigitalDb.toFixed(1)} · C ${reading.cDigitalDb.toFixed(1)} dB re digital RMS 1. Uncalibrated.`}</p><p>Published {new Date(reading.publishedAtUtc).toLocaleString()}</p>{reading.qualityCodes.length ? <ul>{reading.qualityCodes.map(code => <li key={code}>{qualityDescriptions[code]}</li>)}</ul> : null}{reading.nearbyFacility ? <p>Contributor-selected reference: <a href={osmUrl(reading.nearbyFacility)} target="_blank" rel="noreferrer">{reading.nearbyFacility.name}</a>. This does not establish the sound’s source.</p> : null}</details>
    <button type="button" className="map-locate" onClick={() => locate(`public:${reading.id}`)}>Show observation pin ↗</button>
  </article>;
}

export default function CommunityMap({ currentResult }: ObservationMapProps) {
  const [discovery] = useState(() => createDatacenterDiscovery());
  const [query, setQuery] = useState('Ashburn, VA'), [places, setPlaces] = useState<LocationCandidate[]>([]), [selectedPlace, setSelectedPlace] = useState<LocationCandidate | null>(null);
  const [placeStatus, setPlaceStatus] = useState<Status>('idle'), [placeError, setPlaceError] = useState('');
  const [placeAttribution, setPlaceAttribution] = useState<readonly { label: string; url: string }[]>([]);
  const [center, setCenter] = useState<CommunityCoordinates>(INITIAL), [radiusKm, setRadiusKm] = useState(10);
  const [facilities, setFacilities] = useState<DatacenterSearchResult | null>(null), [facilityStatus, setFacilityStatus] = useState<Status>('idle'), [facilityError, setFacilityError] = useState('');
  const [facilityVisible, setFacilityVisible] = useState(20);
  const [feed, setFeed] = useState<CommunityFeed | null>(null), [feedStatus, setFeedStatus] = useState<Status>('idle'), [feedError, setFeedError] = useState('');
  const [tilesEnabled, setTilesEnabled] = useState(false), [tileStatus, setTileStatus] = useState<TileStatus>('grid');
  const [latitude, setLatitude] = useState(''), [longitude, setLongitude] = useState(''), [label, setLabel] = useState(''), [note, setNote] = useState('');
  const [facilityKey, setFacilityKey] = useState(''), [consentId, setConsentId] = useState<string | null>(null), [picking, setPicking] = useState(false);
  const [publishStatus, setPublishStatus] = useState<Status>('idle'), [publishError, setPublishError] = useState(''), [feedback, setFeedback] = useState('');
  const [tabSession, setTabSession] = useState(() => readCommunitySession(communityTabStorage()));
  const owned = tabSession.removal;
  const [storageWarning, setStorageWarning] = useState(''), [deleting, setDeleting] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>({ county: true, osm: true, observations: true, news: true });
  const countyLayer = useRef<L.LayerGroup | null>(null), newsLayer = useRef<L.LayerGroup | null>(null), facilityLayer = useRef<L.LayerGroup | null>(null), newsMarkers = useRef(new Map<string, L.Marker>());
  const host = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), layer = useRef<L.LayerGroup | null>(null), markers = useRef(new Map<string, L.Marker>());
  const discoveryRequest = useRef<AbortController | null>(null), feedRequest = useRef<AbortController | null>(null), publishRequest = useRef<AbortController | null>(null), deleteRequest = useRef<AbortController | null>(null);
  const pickingRef = useRef(false), requestKey = useRef<{ signature: string; key: string } | null>(tabSession.pending ? { signature: JSON.stringify(tabSession.pending.draft), key: tabSession.pending.key } : null);
  const microphone = currentResult?.inputKind === 'microphone' ? currentResult : null;
  const consent = microphone !== null && consentId === microphone.id;
  const preview = microphone ? communityScreeningPreview(microphone) : null;
  let draft: CommunityCoordinates | null = null;
  try { draft = approximateCommunityCoordinates(latitude, longitude); } catch { /* incomplete coordinates */ }
  const draftLat = draft?.latitude, draftLon = draft?.longitude;

  const loadFeed = useCallback(async (cursor?: string) => {
    feedRequest.current?.abort(); const controller = new AbortController(); feedRequest.current = controller;
    setFeedStatus('loading'); setFeedError(''); if (!cursor) setFeed(null);
    try {
      const value = await listCommunityObservations({ center, radiusKm, limit: 100, ...(cursor ? { cursor } : {}) }, controller.signal);
      if (controller.signal.aborted) return;
      setFeed(previous => cursor && previous ? { ...value, observations: [...previous.observations, ...value.observations.filter(item => !previous.observations.some(old => old.id === item.id))] } : value); setFeedStatus('ready');
    } catch (error) { if (!controller.signal.aborted) { setFeedError(errorText(error)); setFeedStatus('error'); } }
  }, [center, radiusKm]);
  const latestFeedLoader = useRef(loadFeed);
  useEffect(() => { latestFeedLoader.current = loadFeed; }, [loadFeed]);
  useEffect(() => { void loadFeed(); return () => feedRequest.current?.abort(); }, [loadFeed]);
  useEffect(() => () => { discoveryRequest.current?.abort(); publishRequest.current?.abort(); deleteRequest.current?.abort(); }, []);
  useEffect(() => { pickingRef.current = picking; }, [picking]);

  useEffect(() => {
    if (!host.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const instance = L.map(host.current, { scrollWheelZoom: false, minZoom: 2, maxZoom: 18, zoomAnimation: !reduced, fadeAnimation: !reduced, markerZoomAnimation: !reduced }).setView(point(INITIAL), 11);
    instance.zoomControl.setPosition('topright'); instance.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
    map.current = instance; layer.current = L.layerGroup().addTo(instance); facilityLayer.current = L.layerGroup().addTo(instance);
    const renderer = L.canvas({ padding: 0.5 });
    const county = L.layerGroup();
    for (const [lat, lng, address] of LOUDOUN_DATA_CENTERS) L.circleMarker([lat, lng], { renderer, radius: 4, color: '#ffffff', weight: 1, fillColor: '#1c1c1e', fillOpacity: 0.85 }).bindPopup(() => popup(address || 'Address not listed', ['LOUDOUN COUNTY GIS · NOT A NOISE READING', 'Existing data center structure in county GIS. A building location, not a noise measurement or a sound source.']), { maxWidth: 290 }).addTo(county);
    county.addTo(instance); countyLayer.current = county;
    const news = L.layerGroup();
    for (const report of NOISE_REPORTS) {
      const node = document.createElement('span'); node.className = 'tw-news-pin'; node.setAttribute('aria-hidden', 'true');
      const marker = L.marker([report.lat, report.lng], { icon: L.divIcon({ html: node, className: 'tw-community-marker', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14] }), title: `Reported noise · ${report.place}`, alt: `Reported noise · ${report.place}`, keyboard: true })
        .bindPopup(popup(report.place, ['REPORTED NOISE · NEWS', report.summary, 'Approximate area described in the report, not a measurement.'], { label: `${report.source}, ${report.date}`, url: report.url }), { maxWidth: 290, minWidth: 160 }).addTo(news);
      newsMarkers.current.set(report.id, marker);
    }
    news.addTo(instance); newsLayer.current = news;
    const choose = (event: L.LeafletMouseEvent) => {
      if (!pickingRef.current) return;
      try { const rounded = approximateCommunityCoordinates(String(event.latlng.lat), String(event.latlng.lng)); setLatitude(rounded.latitude.toFixed(3)); setLongitude(rounded.longitude.toFixed(3)); setConsentId(null); setPicking(false); setFeedback('Approximate recording location selected. Review it before publishing.'); } catch { setFeedback('Choose a point between −85 and 85 latitude.'); }
    };
    instance.on('click', choose);
    const observer = new ResizeObserver(() => { instance.invalidateSize({ pan: false, animate: false }); host.current?.style.setProperty('--map-popup-max', `${Math.max(110, instance.getSize().x - 64)}px`); }); observer.observe(host.current);
    const offline = () => { setTilesEnabled(false); setTileStatus('failed'); }; window.addEventListener('offline', offline);
    return () => { observer.disconnect(); window.removeEventListener('offline', offline); instance.off('click', choose); markers.current.clear(); newsMarkers.current.clear(); instance.remove(); map.current = null; layer.current = null; facilityLayer.current = null; countyLayer.current = null; newsLayer.current = null; };
  }, []);
  useEffect(() => {
    const group = layer.current, facilityGroup = facilityLayer.current; if (!group || !facilityGroup) return; group.clearLayers(); facilityGroup.clearLayers(); markers.current.clear();
    const add = (key: string, position: CommunityCoordinates, markerIcon: L.DivIcon, title: string, content: HTMLElement, target: L.LayerGroup = group) => {
      const item = L.marker(point(position), { icon: markerIcon, title, alt: title, keyboard: true }).bindPopup(content, { maxWidth: 290, minWidth: 160, autoPanPadding: [16, 16] }).addTo(target); markers.current.set(key, item);
    };
    for (const facility of facilities?.facilities ?? []) add(`facility:${facility.key}`, facility, icon('facility', 'D'), `OSM data-center tag · ${facility.name ?? 'Unnamed site'}`, popup(facility.name ?? 'Unnamed mapped site', ['OPENSTREETMAP TAG · NOT A NOISE READING', facility.operator ? `Operator tag: ${facility.operator}` : 'Operator not supplied.', `${facility.distanceKm.toFixed(1)} km from search center · ${facility.kind}`, facility.locationMethod === 'bounding-box-center' ? 'Approximate bounding-box center.' : 'Mapped point.', 'A tag does not confirm operation or a sound source.'], { label: 'Original OSM record', url: facility.sourceUrl }), facilityGroup);
    for (const reading of feed?.observations ?? []) add(`public:${reading.id}`, reading.coordinates, icon('public', '●', color(reading)), `Public unverified observation · ${reading.label}`, popup(reading.label, ['PUBLIC · SELF-REPORTED · UNVERIFIED', gap(reading), `${peakDescription(reading.peakScreen)} · independent check`, reading.note, `Approximate recording location ${coordinateText(reading.coordinates)}.`, 'Uncalibrated screening. This does not identify a sound source.'].filter(Boolean)));
    if (draftLat !== undefined && draftLon !== undefined) add('draft', { latitude: draftLat, longitude: draftLon }, icon('draft', '+'), 'Your unpublished recording-location draft', popup('Recording-location draft', ['NOT PUBLIC YET', `${draftLat.toFixed(3)}, ${draftLon.toFixed(3)}`, 'This should be where you recorded, not a nearby facility.']));
  }, [facilities, feed, draftLat, draftLon]);
  useEffect(() => {
    const instance = map.current; if (!instance || !tilesEnabled) return;
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>', minZoom: 2, maxZoom: 18, keepBuffer: 0, updateWhenIdle: true });
    const ready = () => setTileStatus('ready'), failed = () => { setTilesEnabled(false); setTileStatus('failed'); };
    tiles.on('tileload', ready); tiles.on('tileerror', failed); tiles.addTo(instance);
    return () => { tiles.off('tileload', ready); tiles.off('tileerror', failed); instance.removeLayer(tiles); };
  }, [tilesEnabled]);

  useEffect(() => {
    const instance = map.current; if (!instance) return;
    const pairs: [L.LayerGroup | null, boolean][] = [[countyLayer.current, layers.county], [facilityLayer.current, layers.osm], [layer.current, layers.observations], [newsLayer.current, layers.news]];
    for (const [group, on] of pairs) { if (!group) continue; if (on && !instance.hasLayer(group)) group.addTo(instance); if (!on && instance.hasLayer(group)) instance.removeLayer(group); }
  }, [layers]);
  const toggleLayer = (key: keyof Layers) => setLayers(previous => ({ ...previous, [key]: !previous[key] }));
  const showNews = (id: string) => { const item = newsMarkers.current.get(id); if (!map.current || !item) return; setLayers(previous => ({ ...previous, news: true })); map.current.setView(item.getLatLng(), Math.max(12, map.current.getZoom()), { animate: false }); item.openPopup(); host.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); };
  const locate = (id: string) => { const item = markers.current.get(id); if (!map.current || !item) return; setLayers(previous => ({ ...previous, ...(id.startsWith('facility:') ? { osm: true } : { observations: true }) })); map.current.setView(item.getLatLng(), Math.max(12, map.current.getZoom()), { animate: false }); item.openPopup(); host.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); };
  const searchPlaces = async (event: FormEvent) => {
    event.preventDefault(); discoveryRequest.current?.abort(); const controller = new AbortController(); discoveryRequest.current = controller;
    setPlaceStatus('loading'); setPlaceError(''); setPlaces([]); setPlaceAttribution([]); setSelectedPlace(null); setFacilities(null); setFacilityStatus('idle'); setFacilityKey(''); setConsentId(null);
    try { const value = await discovery.searchLocations(query, { signal: controller.signal }); if (!controller.signal.aborted) { setPlaces(value.locations); setPlaceAttribution(value.attribution); setPlaceStatus('ready'); } } catch (error) { if (!controller.signal.aborted) { setPlaceError(errorText(error)); setPlaceStatus('error'); } }
  };
  const choosePlace = (place: LocationCandidate) => { discoveryRequest.current?.abort(); setSelectedPlace(place); setCenter({ latitude: place.latitude, longitude: place.longitude }); setFacilities(null); setFacilityStatus('idle'); setFacilityKey(''); setConsentId(null); map.current?.setView([place.latitude, place.longitude], 12, { animate: false }); };
  const findFacilities = async () => {
    if (!selectedPlace) return;
    discoveryRequest.current?.abort(); const controller = new AbortController(); discoveryRequest.current = controller;
    setFacilityStatus('loading'); setFacilityError(''); setFacilities(null); setFacilityVisible(20); setFacilityKey(''); setConsentId(null);
    try { const value = await discovery.findNearby({ latitude: selectedPlace.latitude, longitude: selectedPlace.longitude }, radiusKm, { signal: controller.signal }); if (!controller.signal.aborted) { setFacilities(value); setFacilityStatus('ready'); } } catch (error) { if (!controller.signal.aborted) { setFacilityError(errorText(error)); setFacilityStatus('error'); } }
  };
  const saveSession = (next: CommunityMapSession) => {
    if (!writeCommunitySession(communityTabStorage(), next)) setStorageWarning('This browser blocked tab storage. Removal and retry access can only stay on this page; do not reload until you have finished.');
    setTabSession(next);
  };
  const finishPublication = (value: CommunityPublishResult) => {
    saveSession({ version: 1, removal: [...owned.filter(item => item.observation.id !== value.observation.id), removalAccess(value)], pending: null });
    setPublishStatus('ready'); setConsentId(null); setFeedback('Your observation is public and unverified. Removal access is saved in this browser tab.'); void latestFeedLoader.current();
  };
  const publish = async (event: FormEvent) => {
    event.preventDefault(); if (!microphone || publishStatus === 'loading') return;
    setPublishError(''); setFeedback(''); publishRequest.current = null;
    let active: AbortController | null = null;
    try {
      if (owned.length >= 20) throw new Error('This tab already manages 20 public observations. Remove one before publishing another.');
      const facility = facilities?.facilities.find(item => item.key === facilityKey);
      const body = makeCommunityDraft(microphone, { latitude, longitude, label, note, consent, nearbyFacility: facility ? { osmType: facility.osmType, osmId: String(facility.osmId), name: (facility.name ?? facility.operator ?? 'Unnamed mapped site').slice(0, 120) } : null });
      const signature = JSON.stringify(body);
      if (tabSession.pending && JSON.stringify(tabSession.pending.draft) !== signature) throw new Error('Recover the interrupted publication below before publishing a changed draft. The earlier request may already be public.');
      if (requestKey.current?.signature !== signature) requestKey.current = { signature, key: crypto.randomUUID() };
      saveSession({ ...tabSession, pending: { draft: body, key: requestKey.current.key } });
      const controller = new AbortController(); active = controller; publishRequest.current = controller; setPublishStatus('loading');
      const value = await publishCommunityObservation(body, requestKey.current.key, controller.signal); if (controller.signal.aborted) return;
      finishPublication(value);
    } catch (error) { if (!active?.signal.aborted && publishRequest.current === active) { setPublishError(errorText(error)); setPublishStatus('error'); } }
  };
  const recover = async () => {
    if (!tabSession.pending || publishStatus === 'loading') return;
    if (owned.length >= 20) { setPublishError('This tab manages 20 public observations. Remove one before recovering another publication so its removal access can be retained.'); return; }
    const controller = new AbortController(); publishRequest.current = controller; setPublishStatus('loading'); setPublishError('');
    try { const value = await publishCommunityObservation(tabSession.pending.draft, tabSession.pending.key, controller.signal); if (!controller.signal.aborted) finishPublication(value); }
    catch (error) { if (!controller.signal.aborted) { if (error instanceof CommunityRequestError && error.status === 410) { saveSession({ ...tabSession, pending: null }); requestKey.current = null; setPublishError('The earlier publication was already removed. Recovery did not create another observation.'); } else setPublishError(errorText(error)); setPublishStatus('error'); } }
  };
  const remove = async (entry: RemovalAccess) => {
    const controller = new AbortController(); deleteRequest.current = controller; setDeleting(entry.observation.id); setPublishError('');
    try { await deleteCommunityObservation(entry.observation.id, entry.deleteToken, controller.signal); if (!controller.signal.aborted) { saveSession({ ...tabSession, removal: owned.filter(item => item.observation.id !== entry.observation.id) }); setFeedback('Your public observation was removed.'); void latestFeedLoader.current(); } } catch (error) { if (!controller.signal.aborted) setPublishError(errorText(error)); } finally { if (!controller.signal.aborted) setDeleting(null); }
  };
  const tileMessage = tileStatus === 'ready' ? 'Optional OpenStreetMap street tiles are loaded.' : tileStatus === 'loading' ? 'Loading optional street tiles…' : tileStatus === 'failed' ? 'Street tiles unavailable. Pins and lists remain on the neutral grid.' : 'Street tiles are off. Showing the neutral coordinate grid.';

  return <main id="main-content" className="page-shell observation-map" aria-labelledby="community-map-title">
    <header className="page-heading"><div><p className="eyebrow">Community context for data-center noise</p><h1 id="community-map-title">Community noise map</h1><p>Find mapped data-center sites and public observations. Proximity does not establish the source of a sound.</p></div><a className="button secondary" href="#/measure">Record an observation</a></header>
    <div className="map-public-banner"><strong>PUBLIC OBSERVATIONS · SELF-REPORTED · UNVERIFIED</strong><p>Shared observations appear after contributors choose to publish. Observation locations are approximate and values are uncalibrated. OpenStreetMap facility tags form a separate layer.</p></div>
    <section className="panel map-search-panel" aria-labelledby="map-search-title"><p className="eyebrow">Start with an area</p><h2 id="map-search-title">Find data centers near a city or ZIP</h2>
      <form className="map-place-form" onSubmit={event => { void searchPlaces(event); }}><label htmlFor="community-place-query">US city or ZIP<input id="community-place-query" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} required placeholder="Ashburn, VA or 20147" /></label><button className="button primary" type="submit" disabled={placeStatus === 'loading' || facilityStatus === 'loading'}>{placeStatus === 'loading' ? 'Searching…' : 'Search places'}</button></form>
      <p className="map-network-note">Search sends the city or ZIP and your IP to Open-Meteo. Find data centers downloads a dated OSM directory from this site and filters it locally; your chosen coordinates are not sent to a discovery provider. No audio or notes are sent. Neither search starts automatically.</p>
      {placeAttribution.length ? <p className="map-source-line">Place-search attribution: {placeAttribution.map((source, i) => <span key={source.url}>{i ? ' · ' : ''}<a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></span>)}</p> : null}
      {placeStatus === 'loading' || facilityStatus === 'loading' ? <button className="map-locate" type="button" onClick={() => { discoveryRequest.current?.abort(); setPlaceStatus(value => value === 'loading' ? 'idle' : value); setFacilityStatus(value => value === 'loading' ? 'idle' : value); }}>Cancel discovery request</button> : null}
      {placeError ? <p role="alert" className="map-form-error">{placeError} Submit Search places to retry.</p> : null}{placeStatus === 'ready' && !places.length ? <p role="status">No matching place found. Try a city, state or another ZIP.</p> : null}
      {places.length ? <fieldset className="map-place-choices"><legend>Choose the intended place</legend>{places.map(place => <label key={place.id}><input type="radio" name="community-place" checked={selectedPlace?.id === place.id} onChange={() => choosePlace(place)} /><span>{place.displayName}</span></label>)}</fieldset> : null}
      <div className="map-radius-row"><label htmlFor="community-radius">Search radius<select id="community-radius" value={radiusKm} onChange={event => { discoveryRequest.current?.abort(); setPlaceStatus(value => value === 'loading' ? 'idle' : value); setFacilityStatus('idle'); setRadiusKm(Number(event.target.value)); setFacilities(null); setFacilityKey(''); setConsentId(null); }}><option value={5}>5 km</option><option value={10}>10 km</option><option value={25}>25 km</option></select></label><button className="button secondary" type="button" disabled={!selectedPlace || facilityStatus === 'loading' || placeStatus === 'loading'} onClick={() => { void findFacilities(); }}>{facilityStatus === 'loading' ? 'Finding sites…' : 'Find data centers'}</button></div>
      <p className="map-search-selected">{selectedPlace ? `Selected search place: ${selectedPlace.displayName}. This does not set your recording location.` : 'Choose a place to find facilities. The public feed initially shows the Ashburn area.'}</p>{facilityError ? <p role="alert" className="map-form-error">{facilityError} Use Find data centers to retry.</p> : null}
    </section>

    <div className="map-workspace"><section className="map-panel panel" aria-label="Community and facility map"><div className="map-view-heading"><strong>SEPARATE FACILITY & OBSERVATION LAYERS</strong><button type="button" onClick={() => map.current?.setView(point(center), 12, { animate: false })}>Show selected area</button></div><div className={`observation-leaflet${picking ? ' map-picking-location' : ''}`} ref={host} role="region" aria-label="Interactive map. Squares marked D are OSM facility tags, small black dots are Loudoun County GIS buildings, diamonds are reported-noise news areas, circles are public unverified observations and a plus is your unpublished location. Equivalent lists follow." />{picking ? <p className="map-location-prompt" role="status">Click where you recorded. This selects an approximate location; nothing is published.</p> : null}<p className="map-basemap-status" role="status">{tileMessage}</p>
      <fieldset className="tw-map-layers map-layer-toggles"><legend>Layers</legend>
        <label><input type="checkbox" checked={layers.county} onChange={() => toggleLayer('county')} /><i className="sw sw-dc" />Data center buildings <em>county GIS</em></label>
        <label><input type="checkbox" checked={layers.osm} onChange={() => toggleLayer('osm')} /><i className="legend-shape facility" />OSM data-center tags <em>after search</em></label>
        <label><input type="checkbox" checked={layers.observations} onChange={() => toggleLayer('observations')} /><i className="legend-shape public" />Public observations <em>unverified</em></label>
        <label><input type="checkbox" checked={layers.news} onChange={() => toggleLayer('news')} /><i className="sw sw-news" />Reported noise <em>news</em></label>
      </fieldset>
      <div className="map-legend"><span><i className="sw sw-dc" />Loudoun County GIS building</span><span><i className="legend-shape facility" />OSM data-center tag</span><span><i className="legend-shape public" />Public unverified observation</span><span><i className="legend-shape draft" />Unpublished location</span><span><i className="legend-dot amber" />C−A ≥ 15 dB</span><span><i className="legend-dot unavailable" />Numeric screen unavailable</span></div><p className="map-boundary">Observation color describes only the prototype low-frequency screen. The peak check is independent. Proximity, tags and notes do not prove causation, acoustic levels or legal compliance.</p>
      <p className="map-source-line">Data center buildings: <a href={LOUDOUN_DATA_CENTER_SOURCE.url} target="_blank" rel="noreferrer">{LOUDOUN_DATA_CENTER_SOURCE.label}</a>, retrieved {LOUDOUN_DATA_CENTER_SOURCE.retrieved}. Shown from a copy bundled with this site; no request is made. A building location, not a noise measurement.</p>
      <div className="map-basemap-actions"><button className="button secondary" type="button" onClick={() => { if (tilesEnabled) { setTilesEnabled(false); setTileStatus('grid'); } else if (!navigator.onLine) setTileStatus('failed'); else { setTilesEnabled(true); setTileStatus('loading'); } }}>{tilesEnabled ? 'Use neutral grid' : tileStatus === 'failed' ? 'Retry street map' : 'Load street map'}</button><p>Optional street tiles contact OpenStreetMap with your IP and viewed area. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Map attribution</a></p></div>
    </section>

    <aside className="map-local-panel panel" aria-labelledby="map-publish-title"><p className="eyebrow">Share deliberately</p><h2 id="map-publish-title">Publish your observation</h2><p>Share a live microphone result with the community. Audio stays on your device; the fields reviewed here will be public.</p>
      {microphone && preview ? <form onSubmit={event => { void publish(event); }}><p className="map-current-origin"><strong>CURRENT LIVE MICROPHONE OBSERVATION</strong><span>{microphone.durationSeconds} seconds · {microphone.recordedAtUtc ? new Date(microphone.recordedAtUtc).toLocaleString() : 'Recording timestamp unavailable; make a new capture.'}</span></p><p className="map-public-values">{gap(preview)} · uncalibrated. {peakDescription(preview.peakScreen)}.</p>
        <label htmlFor="community-label">Public label<input id="community-label" value={label} onChange={event => { setLabel(event.target.value); setConsentId(null); }} maxLength={80} required placeholder="Outdoor afternoon observation" /></label><label htmlFor="community-note">Public note <small>Optional · 280 characters · avoid personal details</small><textarea id="community-note" value={note} onChange={event => { setNote(event.target.value); setConsentId(null); }} maxLength={280} rows={3} placeholder="Describe what you observed without assuming a source." /></label>
        <fieldset className="map-placement"><legend>Where was this recording made?</legend><p>Choose the recording location, not a nearby facility. Coordinates are rounded before sending to three decimals, roughly 100 m precision that varies with latitude.</p><button className="button secondary" type="button" onClick={() => { const next = !picking; pickingRef.current = next; setPicking(next); setConsentId(null); if (next) host.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); }}>{picking ? 'Cancel map selection' : 'Choose recording location on map'}</button><div className="map-coordinate-fields"><label htmlFor="community-latitude">Latitude<input id="community-latitude" inputMode="decimal" type="text" value={latitude} onChange={event => { setLatitude(event.target.value); setConsentId(null); }} required placeholder="−85 to 85" /></label><label htmlFor="community-longitude">Longitude<input id="community-longitude" inputMode="decimal" type="text" value={longitude} onChange={event => { setLongitude(event.target.value); setConsentId(null); }} required placeholder="−180 to 180" /></label></div>{draft ? <p className="map-rounded-review"><strong>Public location:</strong> {coordinateText(draft)}</p> : <p>Enter both coordinates or select a point on the map.</p>}</fieldset>
        <label htmlFor="community-facility">Nearby facility reference <small>Optional; not a source attribution</small><select id="community-facility" value={facilityKey} onChange={event => { setFacilityKey(event.target.value); setConsentId(null); }}><option value="">No facility reference</option>{(facilities?.facilities ?? []).map(item => <option key={item.key} value={item.key}>{item.name ?? item.operator ?? 'Unnamed mapped site'} · {item.distanceKm.toFixed(1)} km</option>)}</select></label>
        <label className="map-location-confirm"><input type="checkbox" checked={consent} onChange={event => setConsentId(event.target.checked ? microphone.id : null)} required />I confirm this approximate location is where I recorded and agree to publish the label, note, screening values and recording metadata as an unverified observation.</label><button className="button primary" type="submit" disabled={publishStatus === 'loading' || deleting !== null || !consent || !draft}>{publishStatus === 'loading' ? 'Publishing…' : 'Publish public observation'}</button>{publishStatus === 'loading' ? <button className="map-clear" type="button" onClick={() => { publishRequest.current?.abort(); setPublishStatus('idle'); setFeedback('Request canceled. It may already have been saved; refresh before retrying. An unchanged retry uses the same request key.'); }}>Cancel request</button> : null}
      </form> : <div className="map-no-result"><p>Record a live microphone sample before publishing. Imported files and synthetic examples cannot become community observations.</p><a href="#/measure">Go to Check →</a></div>}
      {storageWarning ? <p className="map-form-warning" role="alert">{storageWarning}</p> : null}
      {tabSession.pending ? <section className="map-pending"><h3>Recover an interrupted publication</h3><p>An interrupted request may already be public. Recovery resends only these previously reviewed fields with the same request key, so it cannot create a second copy. Nothing is sent automatically.</p><strong>{tabSession.pending.draft.label}</strong><p>{tabSession.pending.draft.note || 'No public note.'}</p><p>Approximate recording location: {coordinateText(tabSession.pending.draft.coordinates)} · {tabSession.pending.draft.durationSeconds} seconds · recorded {new Date(tabSession.pending.draft.capturedAtUtc).toLocaleString()}.</p><p>{gap(tabSession.pending.draft)} · {peakDescription(tabSession.pending.draft.peakScreen)}.</p><p>{tabSession.pending.draft.nearbyFacility ? `Optional reference: ${tabSession.pending.draft.nearbyFacility.name}; no source attribution.` : 'No facility reference.'}</p><button className="button secondary" type="button" disabled={publishStatus === 'loading' || deleting !== null} onClick={() => { void recover(); }}>Recover last publication</button></section> : null}
      {publishError ? <p className="map-form-error" role="alert">{publishError}</p> : null}<p className="map-feedback" role="status">{feedback}</p>{owned.length ? <div className="map-owned"><h3>Your posts in this browser tab</h3><p>Removal access stays in this browser tab through navigation and reloads. Closing the tab clears access. No account or long-term browser tracking is used.</p>{owned.map(entry => <div key={entry.observation.id}><strong>{entry.observation.label}</strong><button className="map-locate" type="button" onClick={() => { setCenter({ ...entry.observation.coordinates }); map.current?.setView(point(entry.observation.coordinates), 13, { animate: false }); host.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); }}>Show published area</button><button className="map-clear" type="button" disabled={deleting !== null || publishStatus === 'loading'} onClick={() => { void remove(entry); }}>{deleting === entry.observation.id ? 'Removing…' : 'Remove my public observation'}</button></div>)}</div> : null}
    </aside></div>

    <section className="map-facility-section" aria-labelledby="map-facilities-title"><div className="section-heading"><div><p className="eyebrow">Independent public map records</p><h2 id="map-facilities-title">Mapped data-center sites</h2></div><span>{facilities ? `${facilities.facilities.length} tags within ${facilities.radiusKm} km` : 'No facility search requested'}</span></div><p className="map-list-note">OSM coverage can be incomplete or outdated. Building and site tags do not confirm current operation. Distances use mapped points or approximate centers, not property boundaries or sound propagation.</p>
      {facilityStatus === 'loading' ? <p role="status">Finding mapped facilities…</p> : facilities ? <><p className="map-source-line">Retrieved {new Date(facilities.retrievedAt).toLocaleString()}{facilities.osmDataTimestamp ? ` · OSM timestamp ${facilities.osmDataTimestamp}` : ''}. {facilities.attribution.map((source, i) => <span key={source.url}>{i ? ' · ' : ''}<a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></span>)}</p>{facilities.truncated ? <p className="map-form-warning">More matching sites exist; showing at most the nearest {facilities.limit}. Absence from this list is not evidence of absence.</p> : null}<div className="map-source-line"><p>Directory snapshot: {facilities.snapshot.date}. {facilities.receivedCount.toLocaleString()} catalog records; {facilities.facilities.length} matching tags shown within {facilities.radiusKm} km. This is not a live OSM update.</p><details><summary>Directory source details</summary><p>Publisher generation time: {facilities.snapshot.generatedAt} (timezone unspecified).<br />Snapshot SHA256: <span className="map-source-hash">{facilities.snapshot.sha256}</span></p></details></div>{!facilities.facilities.length ? <p>No matching OSM tags returned. This does not establish that no data centers are nearby.</p> : <div className="map-reading-list">{facilities.facilities.slice(0, facilityVisible).map(item => <article className="map-reading map-facility-card" key={item.key}><p className="map-provenance">OSM TAG · NOT A NOISE READING</p><h3>{item.name ?? 'Unnamed mapped data-center site'}</h3><p>{item.operator ? `Operator tag: ${item.operator}` : 'No operator tag supplied.'}</p><p>{item.distanceKm.toFixed(1)} km from search center · {item.kind}</p><p>{item.locationMethod === 'bounding-box-center' ? 'Approximate bounding-box center' : 'Mapped point'}: {coordinateText(item)}</p><details><summary>Source tags</summary><ul>{item.matchedTags.map(tag => <li key={`${tag.key}:${tag.value}`}>{tag.key} = {tag.value}</li>)}</ul></details><a href={item.sourceUrl} target="_blank" rel="noreferrer">Original OSM record ↗</a><button className="map-locate" type="button" onClick={() => locate(`facility:${item.key}`)}>Show facility pin ↗</button></article>)}</div>}{facilities.facilities.length > facilityVisible ? <button className="button secondary map-load-more" type="button" onClick={() => setFacilityVisible(value => value + 20)}>Show more sites ({facilityVisible} of {facilities.facilities.length} listed)</button> : null}</> : <p>Search for a place, choose the intended location and select Find data centers. No third-party discovery request starts automatically.</p>}
    </section>

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

    <section className="map-reading-section" aria-labelledby="map-public-list-title" aria-busy={feedStatus === 'loading'}><div className="section-heading"><div><p className="eyebrow">Public community feed · unverified</p><h2 id="map-public-list-title">Observations in this area</h2></div><button className="button secondary" type="button" disabled={feedStatus === 'loading'} onClick={() => { void loadFeed(); }}>Refresh public feed</button></div><p className="map-list-note">Within {radiusKm} km of {coordinateText(center)}. This reads the community service, separately from optional location search and street tiles. Contributions are not verified field measurements or evidence that a data center caused a sound.</p>{feedStatus === 'loading' ? <p role="status">Loading public observations…</p> : null}{feedError ? <div className="map-form-error" role="alert"><p>{feedError}</p><button className="map-locate" type="button" onClick={() => { void loadFeed(); }}>Retry public feed</button></div> : null}
      {feed ? <><p className="map-source-line">{feed.notice} Showing {feed.observations.length} public {feed.observations.length === 1 ? 'observation' : 'observations'}.</p>{feed.observations.length ? <div className="map-reading-list">{feed.observations.map(reading => <PublicCard key={reading.id} reading={reading} locate={locate} />)}</div> : <div className="map-empty-public"><h3>No public observations returned for this area</h3><p>This empty feed is not evidence of quiet conditions. Record a microphone observation and choose whether to publish it.</p><a href="#/measure">Record an observation →</a></div>}{feed.nextCursor ? <button className="button secondary map-load-more" type="button" disabled={feedStatus === 'loading'} onClick={() => { void loadFeed(feed.nextCursor ?? undefined); }}>Load more public observations</button> : null}</> : null}
    </section>
  </main>;
}
