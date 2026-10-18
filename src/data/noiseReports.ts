// Publicly reported data center noise, from news coverage. Each point marks the APPROXIMATE area a report
// describes (geocoded from the named street or neighborhood), not a measurement location or a specific home.
export interface NoiseReport {
  id: string;
  place: string;
  lat: number;
  lng: number;
  summary: string;
  date: string;
  source: string;
  url: string;
}

export const NOISE_REPORTS: readonly NoiseReport[] = [
  {
    id: 'nbc4-cloudhq-2026',
    place: 'Loudoun County Pkwy near Waxpool Rd, Ashburn',
    lat: 39.0135, lng: -77.4655,
    summary: 'Neighbors described a loud, continuous drone, "like a helicopter." News4 measured 90 decibels with an app; residents up to 5 miles away said they heard it. County zoning enforcement said it would investigate.',
    date: 'March 23, 2026',
    source: 'NBC4 Washington',
    url: 'https://www.nbcwashington.com/news/local/northern-virginia/neighbors-raise-concerns-about-noisy-data-center-in-loudoun/4080249/',
  },
  {
    id: 'nbc4-regency-2026',
    place: 'Regency neighborhood off Waxpool Rd, Ashburn',
    lat: 39.0117, lng: -77.4818,
    summary: 'A 143-home neighborhood flanked by data centers on two sides. NBC4 reported the noise and a developer proposal to buy out each home for about $4 million.',
    date: 'March 24, 2026',
    source: 'NBC4 Washington',
    url: 'https://www.nbcwashington.com/news/local/northern-virginia/were-ashburn-neighbors-offered-4m-each-to-sell-for-data-center-development/4080800/',
  },
  {
    id: 'pwtimes-great-oak-2022',
    place: 'Great Oak subdivision, near Manassas',
    lat: 38.7300, lng: -77.5000,
    summary: 'Residents of the 291-home subdivision describe a constant buzz from four Amazon data centers built next to their neighborhood. "Some say it sounds like a low roar combined with tinny, high-pitched whir."',
    date: 'August 2022',
    source: 'Prince William Times',
    url: 'https://www.princewilliamtimes.com/news/manassas-neighborhood-battles-noise-from-data-centers/article_84b9f0ea-1ef1-11ed-a8a1-9307028db1fd.html',
  },
];

export const COMMUNITY_REPORTS_LINK = { label: 'Loudoun Data Center Watch', url: 'https://loudoundatacenterwatch.org/' } as const;
