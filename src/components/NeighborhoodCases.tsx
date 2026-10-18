import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AnalysisResult } from '../types';
import { createDatacenterDiscovery, datacenterDistanceKm } from '../data/datacenters';
import type { LocationCandidate } from '../data/datacenters';
import { peakDescription } from '../data/readings';
import { qualityDescriptions } from '../data/references';
import { CommunityRequestError, publishCommunityObservation } from '../community/client';
import type { CommunityCoordinates, CommunityObservation, CommunityPublishResult } from '../community/types';
import { attachCaseObservation, createNeighborhoodCase, deleteNeighborhoodCase, getNeighborhoodCase, listNeighborhoodCases } from '../community/casesClient';
import { CASE_UUID, caseHref } from '../community/casesTypes';
import type { NeighborhoodCase, NeighborhoodCaseDetail, NeighborhoodCaseDraft, NeighborhoodCaseFeed } from '../community/casesTypes';
import { caseRemovalAccess, readCasesSession, validPendingCaseDraft, writeCasesSession } from '../community/casesSession';
import type { CasesSession } from '../community/casesSession';
import { approximateCommunityCoordinates, communityScreeningPreview, makeCommunityDraft } from './communityMapDraft';
import { communityTabStorage, readCommunitySession, removalAccess, writeCommunitySession } from './communityMapSession';
import type { CommunityMapSession, RemovalAccess } from './communityMapSession';
import { NoiseSolutions } from './NoiseSolutions';
import '../neighborhood-cases.css';

export interface NeighborhoodCasesProps {
  caseId: string | null;
  currentResult: AnalysisResult | null;
  onContribute: (caseId: string) => void;
  includeReport?: boolean;
}
type Status = 'idle' | 'loading' | 'ready' | 'error';
type CaseState = {
  session: CasesSession;
  community: CommunityMapSession;
  casesRef: { current: CasesSession };
  communityRef: { current: CommunityMapSession };
  saveCases: (next: CasesSession) => void;
  saveCommunity: (next: CommunityMapSession) => void;
};
const message = (error: unknown) => error instanceof Error ? error.message : 'This service is unavailable. Please try again.';
const coordinateText = (p: CommunityCoordinates) => `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`;
const timeText = (utc: string) => new Date(utc).toLocaleString();

export function makeNeighborhoodCaseDraft(options: { title: string; neighborhood: string; description: string; latitude: string; longitude: string; radiusKm: number; consent: boolean }): NeighborhoodCaseDraft {
  if (!options.consent) throw new Error('Review the case details and agree to publish them.');
  const draft: NeighborhoodCaseDraft = { schemaVersion: 1, title: options.title.trim(), neighborhood: options.neighborhood.trim(), description: options.description.trim(),
    coordinates: approximateCommunityCoordinates(options.latitude, options.longitude), radiusKm: options.radiusKm, consent: true, website: '' };
  if (!validPendingCaseDraft(draft)) throw new Error('Use a title of 1–80 characters, neighborhood of 1–100, description of up to 500, and a radius from 1 to 25 km.');
  return draft;
}
export function caseContainsObservation(value: Pick<NeighborhoodCase, 'coordinates' | 'radiusKm'>, coordinates: CommunityCoordinates): boolean {
  try { return datacenterDistanceKm(value.coordinates, coordinates) <= value.radiusKm + 1e-9; } catch { return false; }
}
export function caseInviteUrl(id: string, baseUrl: string): string {
  if (!CASE_UUID.test(id)) throw new Error('A valid case is required.');
  const url = new URL(baseUrl); url.search = ''; url.hash = `/cases/${id}`; url.username = ''; url.password = '';
  return url.href;
}

export function CaseObservationList({ observations }: { observations: readonly CommunityObservation[] }) {
  return <div className="cases-observation-list">{observations.map(observation => <article className="cases-observation" key={observation.id}>
    <p className="cases-tag">PUBLIC OBSERVATION · SELF-REPORTED · UNVERIFIED</p><h3>{observation.label}</h3>
    <p>Recorded {timeText(observation.capturedAtUtc)} · {observation.durationSeconds} seconds</p>
    {observation.note ? <p className="cases-description">{observation.note}</p> : null}
    <p>{observation.cMinusADb === null ? 'Descriptive observation; numeric screening unavailable.' : `Captured-spectrum C−A ${observation.cMinusADb.toFixed(1)} dB · uncalibrated.`}</p>
    <p>{peakDescription(observation.peakScreen)} · independent check</p>
    <details><summary>Recording details and quality checks</summary><dl>
      <div><dt>Location</dt><dd>{coordinateText(observation.coordinates)} · approximate</dd></div>
      <div><dt>Sample rate</dt><dd>{observation.sampleRateHz.toLocaleString()} Hz</dd></div>
      <div><dt>Published</dt><dd>{timeText(observation.publishedAtUtc)}</dd></div>
    </dl>{observation.qualityCodes.length ? <ul>{observation.qualityCodes.map(code => <li key={code}>{qualityDescriptions[code]}</li>)}</ul> : <p>No automated quality flag was recorded. This does not certify faithful capture.</p>}
      {observation.nearbyFacility ? <p>Contributor-selected reference: <a href={`https://www.openstreetmap.org/${observation.nearbyFacility.osmType}/${observation.nearbyFacility.osmId}`} target="_blank" rel="noreferrer">{observation.nearbyFacility.name}</a>. This does not identify the sound source.</p> : null}
    </details>
  </article>)}</div>;
}

function CasesDirectory({ state }: { state: CaseState }) {
  const [discovery] = useState(() => createDatacenterDiscovery());
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<LocationCandidate[]>([]);
  const [placeStatus, setPlaceStatus] = useState<Status>('idle');
  const [placeError, setPlaceError] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<number | null>(null);
  const [latitude, setLatitude] = useState(''), [longitude, setLongitude] = useState(''), [radiusKm, setRadiusKm] = useState(5);
  const [title, setTitle] = useState(''), [neighborhood, setNeighborhood] = useState(''), [description, setDescription] = useState(''), [consent, setConsent] = useState(false);
  const [feed, setFeed] = useState<NeighborhoodCaseFeed | null>(null), [feedStatus, setFeedStatus] = useState<Status>('idle'), [feedError, setFeedError] = useState('');
  const [createStatus, setCreateStatus] = useState<Status>('idle'), [createError, setCreateError] = useState(''), [created, setCreated] = useState<NeighborhoodCase | null>(null);
  const [recoverConsent, setRecoverConsent] = useState(false);
  const placeRequest = useRef<AbortController | null>(null), feedRequest = useRef<AbortController | null>(null), createRequest = useRef<AbortController | null>(null);
  const feedArea = useRef<{ center: CommunityCoordinates; radiusKm: number } | null>(null);
  useEffect(() => () => { placeRequest.current?.abort(); feedRequest.current?.abort(); createRequest.current?.abort(); }, []);
  let rounded: CommunityCoordinates | null = null;
  try { rounded = approximateCommunityCoordinates(latitude, longitude); } catch { /* Incomplete manual entry. */ }

  const search = async (event: FormEvent) => {
    event.preventDefault(); placeRequest.current?.abort(); const controller = new AbortController(); placeRequest.current = controller;
    setPlaceStatus('loading'); setPlaceError(''); setPlaces([]); setSelectedPlace(null);
    try { const found = await discovery.searchLocations(query, { signal: controller.signal });
      if (!controller.signal.aborted) { setPlaces(found.locations); setPlaceStatus('ready'); }
    } catch (error) { if (!controller.signal.aborted) { setPlaceError(message(error)); setPlaceStatus('error'); } }
  };
  const choosePlace = (place: LocationCandidate) => {
    const p = approximateCommunityCoordinates(String(place.latitude), String(place.longitude));
    setSelectedPlace(place.id); setLatitude(p.latitude.toFixed(3)); setLongitude(p.longitude.toFixed(3)); setConsent(false);
    if (!neighborhood) setNeighborhood(place.displayName.slice(0, 100));
  };
  const findCases = async (cursor?: string) => {
    feedRequest.current?.abort(); const controller = new AbortController(); feedRequest.current = controller;
    setFeedStatus('loading'); setFeedError('');
    try {
      const area = cursor ? feedArea.current : { center: approximateCommunityCoordinates(latitude, longitude), radiusKm };
      if (!area || !Number.isFinite(area.radiusKm) || area.radiusKm < 1 || area.radiusKm > 25) throw new Error('Choose an area and radius between 1 and 25 km.');
      if (!cursor) { feedArea.current = area; setFeed(null); }
      const value = await listNeighborhoodCases({ ...area, limit: 100, ...(cursor ? { cursor } : {}) }, controller.signal);
      if (!controller.signal.aborted) { setFeed(previous => cursor && previous ? { ...value, cases: [...previous.cases, ...value.cases.filter(item => !previous.cases.some(old => old.id === item.id))] } : value); setFeedStatus('ready'); }
    } catch (error) { if (!controller.signal.aborted) { setFeedError(message(error)); setFeedStatus('error'); } }
  };
  const submitCreate = async (draft: NeighborhoodCaseDraft, key: string) => {
    if (createRequest.current) return;
    const controller = new AbortController(); createRequest.current = controller; setCreateStatus('loading'); setCreateError('');
    try {
      const result = await createNeighborhoodCase(draft, key, controller.signal);
      if (!controller.signal.aborted) {
        const current = state.casesRef.current;
        state.saveCases({ ...current, pending: null, removal: [...current.removal.filter(item => item.case.id !== result.case.id), caseRemovalAccess(result)] });
        setCreated(result.case); setConsent(false); setRecoverConsent(false); setCreateStatus('ready');
      }
    } catch (error) { if (!controller.signal.aborted) {
      if (error instanceof CommunityRequestError && error.status === 410) state.saveCases({ ...state.casesRef.current, pending: null });
      setCreateError(message(error)); setCreateStatus('error');
    } } finally { if (createRequest.current === controller) createRequest.current = null; }
  };
  const create = async (event: FormEvent) => {
    event.preventDefault(); if (createRequest.current) return; setCreateError('');
    try {
      if (state.casesRef.current.removal.length >= 20) throw new Error('This tab already manages 20 cases. Remove a case before creating another.');
      const draft = makeNeighborhoodCaseDraft({ title, neighborhood, description, latitude, longitude, radiusKm, consent });
      const pending = state.casesRef.current.pending;
      if (pending && JSON.stringify(pending.draft) !== JSON.stringify(draft)) throw new Error('Recover the earlier case creation below first. It may already be public.');
      const key = pending?.key ?? crypto.randomUUID();
      state.saveCases({ ...state.casesRef.current, pending: { draft, key } }); await submitCreate(draft, key);
    } catch (error) { setCreateError(message(error)); setCreateStatus('error'); }
  };
  const pending = state.session.pending;
  return <>
    <header className="page-heading"><div><p className="eyebrow">Gather observations. See the context.</p><h1>Neighborhood cases</h1><p>Give a recurring noise concern a shared place for observations and follow-up.</p></div><a className="button secondary" href="#/map">Open community map</a></header>
    <div className="cases-banner"><strong>Resident-organized · public · unverified</strong><p>A case brings reports together. It does not establish a noise source, measurement accuracy or an official complaint.</p></div>
    <div className="cases-grid"><section className="panel cases-panel" aria-labelledby="cases-area-title"><p className="eyebrow">01 / Choose an area</p><h2 id="cases-area-title">Find your neighborhood</h2>
      <form onSubmit={event => { void search(event); }}><div className="cases-search-row"><label htmlFor="cases-place-query">US city or ZIP<input id="cases-place-query" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} required placeholder="City, state or ZIP" /></label><button className="button secondary" type="submit" disabled={placeStatus === 'loading'}>{placeStatus === 'loading' ? 'Searching…' : 'Search places'}</button></div></form>
      <p className="cases-note">Only a submitted city or ZIP goes to Open-Meteo, along with your IP. No GPS is read. <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames location data</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · <a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">Open-Meteo terms</a></p>
      {placeError ? <p className="cases-error" role="alert">{placeError}</p> : null}{placeStatus === 'ready' && !places.length ? <p role="status">No matching place found. Try another city or ZIP.</p> : null}
      {places.length ? <fieldset className="cases-choices"><legend>Choose the intended place</legend>{places.map(place => <label key={place.id}><input type="radio" name="cases-place" checked={selectedPlace === place.id} onChange={() => choosePlace(place)} /><span>{place.displayName}</span></label>)}</fieldset> : null}
      <fieldset className="cases-area"><legend>Public case area</legend><p className="cases-note">Choose a search result or enter a center manually. This describes the case area, not anyone’s recording location.</p><div className="cases-coordinate-row"><label htmlFor="cases-latitude">Center latitude<input id="cases-latitude" inputMode="decimal" value={latitude} onChange={event => { setLatitude(event.target.value); setSelectedPlace(null); setConsent(false); }} placeholder="−85 to 85" /></label><label htmlFor="cases-longitude">Center longitude<input id="cases-longitude" inputMode="decimal" value={longitude} onChange={event => { setLongitude(event.target.value); setSelectedPlace(null); setConsent(false); }} placeholder="−180 to 180" /></label></div><label htmlFor="cases-radius">Radius in km<input id="cases-radius" type="number" min={1} max={25} step="any" value={Number.isNaN(radiusKm) ? '' : radiusKm} onChange={event => { setRadiusKm(event.target.value === '' ? NaN : Number(event.target.value)); setConsent(false); }} /></label><p className="cases-note">{rounded ? `Reviewed center: ${coordinateText(rounded)}. Rounded to three decimals before sending.` : 'Enter both coordinates. Centers are rounded to three decimals before sending.'}</p></fieldset>
      <button className="button primary" type="button" disabled={!rounded || feedStatus === 'loading'} onClick={() => { void findCases(); }}>{feedStatus === 'loading' ? 'Finding cases…' : 'Find neighborhood cases'}</button>
      {feedError ? <p className="cases-error" role="alert">{feedError}</p> : null}
    </section>
    <section className="panel cases-panel" aria-labelledby="cases-create-title"><p className="eyebrow">02 / Start a shared record</p><h2 id="cases-create-title">Create a case</h2><p>Describe what needs documenting. Keep personal addresses and accusations out of public details.</p>
      <form onSubmit={event => { void create(event); }}><fieldset disabled={createStatus === 'loading'} className="cases-form-fields"><div className="cases-fields"><label htmlFor="case-title">Public case title<input id="case-title" value={title} onChange={event => { setTitle(event.target.value); setConsent(false); }} maxLength={80} required placeholder="Recurring evening hum in our neighborhood" /></label><label htmlFor="case-neighborhood">Neighborhood or area<input id="case-neighborhood" value={neighborhood} onChange={event => { setNeighborhood(event.target.value); setConsent(false); }} maxLength={100} required /></label><label htmlFor="case-description">Public description <small>Optional · up to 500 characters</small><textarea id="case-description" value={description} onChange={event => { setDescription(event.target.value); setConsent(false); }} rows={4} maxLength={500} /></label></div><p className="cases-note">{rounded ? `Case area: ${coordinateText(rounded)} · ${Number.isFinite(radiusKm) ? radiusKm : '—'} km radius.` : 'Choose the public case area in step 1.'}</p><label className="cases-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required />I reviewed the title, description and approximate area and agree to publish this unverified case.</label><button className="button primary" type="submit" disabled={!consent || !rounded || createStatus === 'loading'}>{createStatus === 'loading' ? 'Creating…' : 'Create public case'}</button></fieldset></form>
      {createError ? <p className="cases-error" role="alert">{createError}</p> : null}{created ? <p className="cases-feedback" role="status">Your case is public. <a href={caseHref(created.id)}>Open {created.title} and invite others →</a></p> : null}
      {pending ? <div className="cases-recovery"><h3>Recover an interrupted case creation</h3><p>The earlier request may already have created this case. Recovery uses the same reviewed details and key.</p><strong>{pending.draft.title}</strong><p>{pending.draft.neighborhood} · {coordinateText(pending.draft.coordinates)} · {pending.draft.radiusKm} km</p><p className="cases-description">{pending.draft.description || 'No public description.'}</p><label className="cases-consent"><input type="checkbox" checked={recoverConsent} onChange={event => setRecoverConsent(event.target.checked)} />I reviewed these saved public details and want to recover this case.</label><button className="button secondary" type="button" disabled={!recoverConsent || createStatus === 'loading'} onClick={() => { void submitCreate(pending.draft, pending.key); }}>Recover case creation</button></div> : null}
      {state.session.removal.length ? <div className="cases-owned-list"><h3>Your cases in this browser tab</h3><p className="cases-note">Removal access stays in this tab through navigation and reloads.</p>{state.session.removal.map(item => <div key={item.case.id}><a href={caseHref(item.case.id)}>{item.case.title}</a></div>)}</div> : null}
    </section></div>
    <section className="cases-list-section" aria-labelledby="cases-directory-title"><div className="cases-section-heading"><h2 id="cases-directory-title">Cases in the selected area</h2>{feed ? <span className="cases-note">{feed.cases.length} loaded {feed.cases.length === 1 ? 'case' : 'cases'}</span> : null}</div>
      {feedArea.current && feed ? <p className="cases-note">Within {feedArea.current.radiusKm} km of {coordinateText(feedArea.current.center)}. {feed.notice}</p> : null}
      {feed?.cases.length ? <div className="cases-card-list">{feed.cases.map(item => <article className="cases-card" key={item.id}><p className="cases-tag">PUBLIC · RESIDENT-ORGANIZED · UNVERIFIED</p><h3>{item.title}</h3><p>{item.neighborhood} · {item.radiusKm} km case area</p><p className="cases-description">{item.description || 'No public description supplied.'}</p><p>Created {timeText(item.createdAtUtc)}</p><a href={caseHref(item.id)}>Open case →</a></article>)}</div> : <div className="cases-empty"><h3>{feed ? 'No cases returned for this area' : 'Find a neighborhood to begin'}</h3><p className="cases-note">{feed ? 'An empty directory is not evidence of quiet conditions. You can start a case and invite others to document what they observe.' : 'Choose a city, ZIP or manual center, then search. Nothing is published until you review and create a case.'}</p></div>}
      {feed?.nextCursor ? <button className="button secondary cases-load-more" type="button" disabled={feedStatus === 'loading'} onClick={() => { void findCases(feed.nextCursor ?? undefined); }}>Load more cases</button> : null}
    </section>
  </>;
}

function CaseDetail({ caseId, currentResult, onContribute, includeReport, state }: Omit<NeighborhoodCasesProps, 'caseId'> & { caseId: string; state: CaseState }) {
  const [detail, setDetail] = useState<NeighborhoodCaseDetail | null>(null), [status, setStatus] = useState<Status>('loading'), [error, setError] = useState('');
  const [feedback, setFeedback] = useState(''), [busy, setBusy] = useState(false), [deleteConsent, setDeleteConsent] = useState(false);
  const [label, setLabel] = useState(''), [note, setNote] = useState(''), [latitude, setLatitude] = useState(''), [longitude, setLongitude] = useState('');
  const [publicConsentId, setPublicConsentId] = useState<string | null>(null), [publishAttachConsent, setPublishAttachConsent] = useState(false), [retryConsent, setRetryConsent] = useState(false);
  const [existingId, setExistingId] = useState(''), [existingConsent, setExistingConsent] = useState(false);
  const readRequest = useRef<AbortController | null>(null), mutation = useRef<AbortController | null>(null);
  const microphone = currentResult?.inputKind === 'microphone' ? currentResult : null;
  const preview = microphone ? communityScreeningPreview(microphone) : null;
  const contribution = state.session.contribution?.caseId === caseId ? state.session.contribution : null;
  const pending = contribution && !contribution.observationId && contribution.publicationKey === state.community.pending?.key ? state.community.pending : null;
  const ownedCase = state.session.removal.find(item => item.case.id === caseId);
  const refresh = useCallback(async () => {
    readRequest.current?.abort(); const controller = new AbortController(); readRequest.current = controller; setStatus('loading'); setError('');
    try { const value = await getNeighborhoodCase(caseId, controller.signal); if (!controller.signal.aborted) { setDetail(value); setStatus('ready'); } }
    catch (failure) { if (!controller.signal.aborted) { setError(message(failure)); setStatus('error'); } }
  }, [caseId]);
  useEffect(() => { void refresh(); return () => { readRequest.current?.abort(); mutation.current?.abort(); }; }, [refresh]);
  useEffect(() => { setPublicConsentId(null); setPublishAttachConsent(false); }, [microphone?.id]);
  const begin = (): AbortController | null => { if (mutation.current) return null; const controller = new AbortController(); mutation.current = controller; setBusy(true); setError(''); setFeedback(''); return controller; };
  const finish = (controller: AbortController) => { if (mutation.current === controller) { mutation.current = null; if (!controller.signal.aborted) setBusy(false); } };
  const rememberPublication = (value: CommunityPublishResult, resultId: string | null): RemovalAccess => {
    const access = removalAccess(value), current = state.communityRef.current;
    state.saveCommunity({ ...current, pending: null, removal: [...current.removal.filter(item => item.observation.id !== value.observation.id), access] });
    state.saveCases({ ...state.casesRef.current, contribution: { caseId, observationId: access.observation.id, resultId, publicationKey: null, attached: false } });
    return access;
  };
  const link = async (access: RemovalAccess, resultId: string | null, controller: AbortController) => {
    if (!detail || !caseContainsObservation(detail.case, access.observation.coordinates)) throw new Error('The observation’s approximate recording location is outside this case area.');
    await attachCaseObservation(caseId, access.observation.id, access.deleteToken, controller.signal);
    if (!controller.signal.aborted) { state.saveCases({ ...state.casesRef.current, contribution: { caseId, observationId: access.observation.id, resultId, publicationKey: null, attached: true } }); setFeedback('Your public observation is now linked to this case.'); setRetryConsent(false); setPublishAttachConsent(false); setExistingConsent(false); void refresh(); }
  };
  const publish = async (event: FormEvent) => {
    event.preventDefault(); if (!microphone || !detail || mutation.current) return;
    let controller: AbortController | null = null, saved = false;
    try {
      if (publicConsentId !== microphone.id || !publishAttachConsent) throw new Error('Review public sharing and separately confirm linking this observation to the case.');
      if (state.communityRef.current.removal.length >= 20) throw new Error('This tab manages 20 public observations. Remove one on the community map before publishing another.');
      if (state.casesRef.current.contribution?.resultId === microphone.id && state.casesRef.current.contribution?.observationId) throw new Error('This capture is already public. Link the existing observation below instead of publishing it again.');
      const draft = makeCommunityDraft(microphone, { latitude, longitude, label, note, consent: true, nearbyFacility: null });
      if (!caseContainsObservation(detail.case, draft.coordinates)) throw new Error('Choose the actual recording location within this case area. If you recorded elsewhere, use the community map instead.');
      const previous = state.communityRef.current.pending;
      if (previous && JSON.stringify(previous.draft) !== JSON.stringify(draft)) throw new Error('Recover the earlier public-map publication before publishing a different observation.');
      const key = previous?.key ?? crypto.randomUUID();
      state.saveCommunity({ ...state.communityRef.current, pending: { draft, key } });
      state.saveCases({ ...state.casesRef.current, contribution: { caseId, observationId: null, resultId: microphone.id, publicationKey: key, attached: false } });
      controller = begin(); if (!controller) return;
      const value = await publishCommunityObservation(draft, key, controller.signal); if (controller.signal.aborted) return;
      const access = rememberPublication(value, microphone.id); saved = true; setPublicConsentId(null);
      await link(access, microphone.id, controller);
    } catch (failure) { if (!controller?.signal.aborted) setError(saved ? `Your observation is public on the community map, but linking did not finish. Retry the attachment below; do not publish another copy. ${message(failure)}` : message(failure)); }
    finally { if (controller) finish(controller); }
  };
  const recover = async () => {
    if (!pending || !contribution || contribution.observationId || !retryConsent || !detail || mutation.current) return;
    const controller = begin(); if (!controller) return; let saved = false;
    try {
      if (!caseContainsObservation(detail.case, pending.draft.coordinates)) throw new Error('This saved observation is outside the case area. Recover it on the community map.');
      const value = await publishCommunityObservation(pending.draft, pending.key, controller.signal); if (controller.signal.aborted) return;
      const access = rememberPublication(value, contribution.resultId); saved = true; await link(access, contribution.resultId, controller);
    } catch (failure) { if (!controller.signal.aborted) {
      if (failure instanceof CommunityRequestError && failure.status === 410 && !saved) { state.saveCommunity({ ...state.communityRef.current, pending: null }); state.saveCases({ ...state.casesRef.current, contribution: null }); }
      setError(saved ? `The observation is public on the community map. Retry only its case attachment below. ${message(failure)}` : message(failure));
    } } finally { finish(controller); }
  };
  const attachOwned = async (access: RemovalAccess, resultId: string | null) => {
    const controller = begin(); if (!controller) return;
    try { state.saveCases({ ...state.casesRef.current, contribution: { caseId, observationId: access.observation.id, resultId, publicationKey: null, attached: false } }); await link(access, resultId, controller); }
    catch (failure) { if (!controller.signal.aborted) setError(`The public-map observation was not republished. Its case attachment did not finish: ${message(failure)}`); }
    finally { finish(controller); }
  };
  const removeCase = async () => {
    if (!ownedCase || !deleteConsent) return; const controller = begin(); if (!controller) return;
    try { await deleteNeighborhoodCase(caseId, ownedCase.deleteToken, controller.signal); if (!controller.signal.aborted) {
      const current = state.casesRef.current; state.saveCases({ ...current, removal: current.removal.filter(item => item.case.id !== caseId), contribution: current.contribution?.caseId === caseId ? null : current.contribution }); window.location.hash = '/cases';
    } } catch (failure) { if (!controller.signal.aborted) setError(message(failure)); } finally { finish(controller); }
  };
  const invite = typeof window === 'undefined' ? caseHref(caseId) : caseInviteUrl(caseId, window.location.href);
  const copyInvite = async () => { try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(invite); setFeedback('Case link copied. Anyone with it can read the public case.'); } catch { setFeedback('Copy the visible case link below. Clipboard access is unavailable in this browser.'); } };
  let coordinates: CommunityCoordinates | null = null;
  try { coordinates = approximateCommunityCoordinates(latitude, longitude); } catch { /* Wait for a complete reviewed location. */ }
  const eligible = detail ? state.community.removal.filter(item => caseContainsObservation(detail.case, item.observation.coordinates) && !detail.observations.some(observation => observation.id === item.observation.id)) : [];
  const retryAccess = contribution?.observationId ? state.community.removal.find(item => item.observation.id === contribution.observationId) : null;
  const alreadyPublic = !!(microphone && state.session.contribution?.resultId === microphone.id && state.session.contribution.observationId);
  return <>
    <header className="page-heading"><div><p className="eyebrow">Neighborhood case · public and unverified</p><h1>{detail?.case.title ?? 'Neighborhood case'}</h1><p>Bring separate observations together, then decide what needs a closer look.</p></div><a className="button secondary" href="#/cases">All neighborhood cases</a></header>
    {status === 'loading' ? <p role="status">Loading case…</p> : null}{error ? <p className="cases-error" role="alert">{error}</p> : null}{feedback ? <p className="cases-feedback" role="status">{feedback}</p> : null}
    {!detail ? <div className="cases-empty"><h2>{status === 'error' ? 'This case could not be loaded' : 'Opening the shared case'}</h2><p>Public cases need a network connection. No sample observations are substituted.</p><button className="button secondary" type="button" disabled={status === 'loading'} onClick={() => { void refresh(); }}>Retry loading case</button></div> : <>
      <div className="cases-banner"><strong>{detail.case.neighborhood} · {detail.observations.length} linked {detail.observations.length === 1 ? 'observation' : 'observations'}</strong><p>These are reports, not a count of residents. Shared notes and nearby facilities do not establish who or what caused a sound.</p></div>
      <div className="cases-detail-grid"><div className="cases-detail-stack"><section className="panel cases-panel" aria-labelledby="case-context-title"><h2 id="case-context-title">What we’re documenting</h2><p className="cases-description">{detail.case.description || 'The organizer has not added a description yet.'}</p><p className="cases-note">Approximate area center: {coordinateText(detail.case.coordinates)} · {detail.case.radiusKm} km radius. Created {timeText(detail.case.createdAtUtc)}.</p>
        <div className="cases-actions"><button className="button primary" type="button" disabled={busy} onClick={() => onContribute(caseId)}>Record for this case</button><button className="button secondary" type="button" disabled={status === 'loading' || busy} onClick={() => { void refresh(); }}>Refresh case</button>{includeReport ? <a className="button secondary" href={`${caseHref(caseId)}/report`}>Review case summary</a> : null}</div>
        <div className="cases-share"><h3>Invite your neighborhood</h3><p>Share this public case link. Each contributor reviews their own recording location and public details.</p><button className="button secondary" type="button" onClick={() => { void copyInvite(); }}>Copy invite link</button><a href={invite}>{invite}</a></div>
        {ownedCase ? <div className="cases-owner"><h3>Manage your case</h3><p className="cases-note">This tab retains case removal access. Removing the case keeps its observations on the public community map.</p><label className="cases-consent"><input type="checkbox" checked={deleteConsent} onChange={event => setDeleteConsent(event.target.checked)} />I want to remove this case. Its public observations will remain.</label><button className="cases-link-button" type="button" disabled={!deleteConsent || busy} onClick={() => { void removeCase(); }}>Remove my case</button></div> : null}
      </section>
      <section className="panel cases-panel" aria-labelledby="case-observations-title"><div className="cases-section-heading"><h2 id="case-observations-title">Linked observations</h2></div><p className="cases-note">{detail.notice} Read recordings separately: uncalibrated phone levels cannot be averaged into a neighborhood noise level.</p>{detail.observations.length ? <CaseObservationList observations={detail.observations} /> : <div className="cases-empty"><h3>Be the first to document an observation</h3><p>No linked reports yet does not mean quiet conditions. Invite others and record where you actually are.</p></div>}</section>
      <NoiseSolutions />
      </div><aside className="panel cases-panel" aria-labelledby="case-contribute-title"><p className="eyebrow">Add your own observation</p><h2 id="case-contribute-title">Contribute deliberately</h2><p>Audio stays in your browser. Your reviewed public label, note, approximate location and screening metadata go to the community map; linking makes them part of this case too.</p>
        {contribution && !contribution.attached ? <div className="cases-recovery"><h3>{contribution.observationId ? 'Finish linking your public observation' : 'Recover an interrupted publication'}</h3>
          {contribution.observationId ? <><p>This observation may already be public on the map. Attachment retries do not publish another copy.</p><strong>{retryAccess?.observation.label ?? 'Public observation'}</strong>{retryAccess ? <p>Approximate recording location: {coordinateText(retryAccess.observation.coordinates)}.</p> : <p>Removal access is unavailable in this tab. The observation cannot be linked here without its owner capability.</p>}</> : <><p>The earlier map publication may already have completed. Recovery resends the same reviewed details and key.</p>{pending ? <><strong>{pending.draft.label}</strong><p className="cases-description">{pending.draft.note || 'No public note.'}</p><p>Recorded {timeText(pending.draft.capturedAtUtc)} · {coordinateText(pending.draft.coordinates)} · {pending.draft.durationSeconds} seconds.</p></> : <p>No saved publication body is available. Use an existing public observation below.</p>}</>}
          <label className="cases-consent"><input type="checkbox" checked={retryConsent} onChange={event => setRetryConsent(event.target.checked)} />I reviewed this observation and agree to link it publicly to this case.</label>
          <button className="button secondary" type="button" disabled={!retryConsent || busy || (contribution.observationId ? !retryAccess : !pending)} onClick={() => { if (retryAccess) void attachOwned(retryAccess, contribution.resultId); else void recover(); }}>{contribution.observationId ? 'Retry case attachment' : 'Recover publication and link'}</button>
        </div> : null}
        {state.community.pending && !pending ? <div className="cases-warning"><p>An earlier public-map publication needs recovery. <a href="#/map">Recover it on the community map</a> before publishing another observation.</p></div> : null}
        {microphone && preview ? <form onSubmit={event => { void publish(event); }}><fieldset disabled={busy} className="cases-form-fields"><h3>Current microphone capture</h3><p>{microphone.durationSeconds} seconds · {microphone.recordedAtUtc ? timeText(microphone.recordedAtUtc) : 'No recording timestamp; record again.'}</p><p>{preview.cMinusADb === null ? 'Numeric screening unavailable; a descriptive post is still possible.' : `Captured-spectrum C−A ${preview.cMinusADb.toFixed(1)} dB · uncalibrated.`} {peakDescription(preview.peakScreen)}.</p>{alreadyPublic ? <p className="cases-feedback">This capture is already public. Use its existing observation or attachment recovery instead of publishing another copy.</p> : null}
          <div className="cases-fields"><label htmlFor="case-observation-label">Public observation label<input id="case-observation-label" maxLength={80} required value={label} onChange={event => { setLabel(event.target.value); setPublicConsentId(null); setPublishAttachConsent(false); }} placeholder="Outdoor evening observation" /></label><label htmlFor="case-observation-note">Public note <small>Optional · avoid personal details</small><textarea id="case-observation-note" rows={3} maxLength={280} value={note} onChange={event => { setNote(event.target.value); setPublicConsentId(null); setPublishAttachConsent(false); }} /></label></div>
          <fieldset className="cases-area"><legend>Actual recording location</legend><p className="cases-note">Enter where you recorded, not the case center or a facility. Coordinates are rounded to three decimals before sending.</p><div className="cases-coordinate-row"><label htmlFor="case-recording-latitude">Latitude<input id="case-recording-latitude" value={latitude} inputMode="decimal" required onChange={event => { setLatitude(event.target.value); setPublicConsentId(null); setPublishAttachConsent(false); }} /></label><label htmlFor="case-recording-longitude">Longitude<input id="case-recording-longitude" value={longitude} inputMode="decimal" required onChange={event => { setLongitude(event.target.value); setPublicConsentId(null); setPublishAttachConsent(false); }} /></label></div>{coordinates ? <p className="cases-note">Public location: {coordinateText(coordinates)}. {caseContainsObservation(detail.case, coordinates) ? 'Within the case area.' : 'Outside this case area; use the community map or a different case.'}</p> : null}</fieldset>
          <label className="cases-consent"><input type="checkbox" checked={publicConsentId === microphone.id} onChange={event => setPublicConsentId(event.target.checked ? microphone.id : null)} required />I confirm this is where I recorded and agree to publish these reviewed details as an unverified community-map observation.</label><label className="cases-consent"><input type="checkbox" checked={publishAttachConsent} onChange={event => setPublishAttachConsent(event.target.checked)} required />I also agree to link this public observation to this neighborhood case.</label><button className="button primary" type="submit" disabled={busy || alreadyPublic || !!state.community.pending || publicConsentId !== microphone.id || !publishAttachConsent || !coordinates || !caseContainsObservation(detail.case, coordinates)}>Publish and link observation</button></fieldset></form> : <div className="cases-empty"><p>Record a live microphone sample, then return here to review and share it.</p><button className="button primary" type="button" disabled={busy} onClick={() => onContribute(caseId)}>Record for this case</button></div>}
        <section className="cases-owned-list"><h3>Link an existing observation</h3><p className="cases-note">Only observations you can manage in this browser tab, inside this case area, are available.</p>{eligible.length ? <><label htmlFor="case-existing-observation">Your public observations<select id="case-existing-observation" className="cases-owned-choice" value={existingId} onChange={event => { setExistingId(event.target.value); setExistingConsent(false); }}><option value="">Choose an observation</option>{eligible.map(item => <option key={item.observation.id} value={item.observation.id}>{item.observation.label} · {coordinateText(item.observation.coordinates)}</option>)}</select></label><label className="cases-consent"><input type="checkbox" checked={existingConsent} onChange={event => setExistingConsent(event.target.checked)} />I agree to link the selected public observation to this case.</label><button className="button secondary" type="button" disabled={busy || !existingConsent || !eligible.some(item => item.observation.id === existingId)} onClick={() => { const access = eligible.find(item => item.observation.id === existingId); if (access && existingConsent) void attachOwned(access, null); }}>Link selected observation</button></> : <p>No other owned public observations are available within this area.</p>}<p className="cases-note"><a href="#/map">Manage or remove your public observations on the community map</a>. Removing an observation also removes it from case views after refresh.</p></section>
      </aside></div>
    </>}
  </>;
}

export default function NeighborhoodCases({ caseId, currentResult, onContribute, includeReport = false }: NeighborhoodCasesProps) {
  const [session, setSession] = useState(() => readCasesSession(communityTabStorage()));
  const [community, setCommunity] = useState(() => readCommunitySession(communityTabStorage()));
  const [storageWarning, setStorageWarning] = useState('');
  const casesRef = useRef(session), communityRef = useRef(community);
  const saveCases = useCallback((next: CasesSession) => { casesRef.current = next; setSession(next); if (!writeCasesSession(communityTabStorage(), next)) setStorageWarning('Tab storage is unavailable. Keep this page open: recovery and removal access can only stay here until you leave.'); }, []);
  const saveCommunity = useCallback((next: CommunityMapSession) => { communityRef.current = next; setCommunity(next); if (!writeCommunitySession(communityTabStorage(), next)) setStorageWarning('Tab storage is unavailable. Keep this page open: public-observation recovery and removal access can only stay here until you leave.'); }, []);
  const state: CaseState = { session, community, casesRef, communityRef, saveCases, saveCommunity };
  return <main id="main-content" className="page-shell cases-page" aria-label={caseId ? 'Neighborhood case' : 'Neighborhood cases'}>
    {storageWarning ? <div className="cases-warning" role="alert"><p>{storageWarning}</p></div> : null}
    {caseId && !CASE_UUID.test(caseId) ? <div className="cases-empty"><h1>Case link not recognized</h1><p>Use the complete public invite link, or find a case in your area.</p><a href="#/cases">Find neighborhood cases →</a></div> : caseId ? <CaseDetail key={caseId} caseId={caseId} currentResult={currentResult} onContribute={onContribute} includeReport={includeReport} state={state} /> : <CasesDirectory state={state} />}
  </main>;
}
