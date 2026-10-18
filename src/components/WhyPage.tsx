import { Icon } from './Icon';
import { RatioBars } from './Motif';

const LEVENTHALL_WHO = 'https://journals.lww.com/nohe/fulltext/2004/06230/low_frequency_noise_and_annoyance.6.aspx';

type IconName = 'moon' | 'activity' | 'heart' | 'gauge';
interface Finding { icon: IconName; title: string; figure?: string; ratio?: number; text: string; note?: string; source: string; href: string }

/* Research context only. These figures come from studies of community / traffic noise and are
   never applied to a TonalWatch reading (the app's levels are uncalibrated digital levels). */
const FINDINGS: readonly Finding[] = [
  { icon: 'moon', title: 'Sleep', text: 'Low-frequency noise, like ventilation hum, can disturb rest and sleep even at low sound levels.', source: 'WHO Guidelines for Community Noise, via Leventhall, Noise & Health (2004)', href: LEVENTHALL_WHO },
  { icon: 'activity', title: 'Stress and blood pressure', text: 'Noise is linked to stress-related illness, high blood pressure, sleep disruption and lost productivity.', source: 'U.S. EPA', href: 'https://www.epa.gov/clean-air-act-overview/clean-air-act-title-iv-noise-pollution' },
  { icon: 'heart', title: 'Heart health over years', figure: '8%', ratio: 1.08, text: 'In a WHO review of long-term studies, every 10 dB more road-traffic noise at home was linked to about 8% higher risk of heart disease.', note: 'Measured for traffic noise; studies of data center hum are still limited.', source: 'WHO noise guidelines review (2018)', href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5858448/' },
  { icon: 'moon', title: 'Sleep, by the numbers', figure: '2×', ratio: 2, text: 'In the same WHO review, 10 dB more night-time road noise roughly doubled the odds of people reporting badly disturbed sleep.', note: 'Traffic noise studies.', source: 'WHO noise guidelines review (2018)', href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5877064/' },
  { icon: 'gauge', title: 'Why official meters miss it', text: 'The WHO notes that the usual “A-weighted” measurement underestimates low-frequency noise, and that a large share of low-frequency sound can considerably increase the health effects.', source: 'WHO, via Leventhall, Noise & Health (2004)', href: LEVENTHALL_WHO },
];

export function WhyPage() {
  return <main id="main-content" tabIndex={-1} className="page-shell why-page">
    <div className="page-heading"><div><h1>Why it matters</h1><p>Deep, steady hum is easy to dismiss and hard to escape. Here’s what research says about living with noise.</p></div></div>
    <ul className="list why-list">
      {FINDINGS.map(item => <li key={item.title} className="why-row">
        <span className="why-icon"><Icon name={item.icon} size={22}/></span>
        <div className="why-body">
          <h2>{item.title}</h2>
          {item.figure ? <div className="why-figure-row" aria-hidden="true"><span className="why-figure">{item.figure}</span>{item.ratio ? <RatioBars ratio={item.ratio}/> : null}</div> : null}
          <p>{item.text}</p>
          {item.note ? <p className="why-note">{item.note}</p> : null}
          <a className="why-source" href={item.href} target="_blank" rel="noreferrer">{item.source}<Icon name="external" size={13}/></a>
        </div>
      </li>)}
    </ul>
    <p className="footnote why-closing">Loudoun County notes that research on low-frequency noise from data centers is still developing. TonalWatch is a screening tool: it helps you decide when to ask for a professional measurement. <a href="https://www.loudoun.gov/6405/Noise-Air-Quality-Concerns" target="_blank" rel="noreferrer">Loudoun County</a></p>
    <a className="button primary why-cta" href="#/measure"><Icon name="mic" size={20}/> Check a hum</a>
  </main>;
}

export default WhyPage;
