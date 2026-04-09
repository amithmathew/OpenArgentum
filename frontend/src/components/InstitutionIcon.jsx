import { useState } from 'react'

// Maps institution names to domains for logo lookup
const INSTITUTION_DOMAINS = {
  'scotiabank': 'scotiabank.com',
  'scotia': 'scotiabank.com',
  'cibc': 'cibc.com',
  'rbc': 'rbc.com',
  'royal bank': 'rbc.com',
  'td': 'td.com',
  'td canada trust': 'td.com',
  'bmo': 'bmo.com',
  'national bank': 'nbc.ca',
  'desjardins': 'desjardins.com',
  'tangerine': 'tangerine.ca',
  'simplii': 'simplii.com',
  'eq bank': 'eqbank.ca',
  'chase': 'chase.com',
  'wells fargo': 'wellsfargo.com',
  'bank of america': 'bankofamerica.com',
  'american express': 'americanexpress.com',
  'amex': 'americanexpress.com',
  'capital one': 'capitalone.com',
  'citi': 'citi.com',
  'usaa': 'usaa.com',
  'discover': 'discover.com',
  'hsbc': 'hsbc.com',
}

function getDomain(institution) {
  if (!institution) return null
  const lower = institution.toLowerCase()
  // Direct match
  if (INSTITUTION_DOMAINS[lower]) return INSTITUTION_DOMAINS[lower]
  // Partial match
  for (const [key, domain] of Object.entries(INSTITUTION_DOMAINS)) {
    if (lower.includes(key) || key.includes(lower)) return domain
  }
  return null
}

export default function InstitutionIcon({ institution, iconUrl, size = 20 }) {
  const [failed, setFailed] = useState(false)

  // Priority: custom icon_url > domain lookup > letter fallback
  const src = iconUrl || (() => {
    const domain = getDomain(institution)
    return domain ? `https://img.logo.dev/${domain}?token=pk_anonymous&size=${size * 2}` : null
  })()

  if (!src || failed) {
    const letter = institution ? institution[0].toUpperCase() : '?'
    return (
      <div
        className="rounded-md flex items-center justify-center font-bold shrink-0"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.5,
          backgroundColor: 'var(--color-surface-alt)',
          color: 'var(--color-text-muted)',
        }}
      >
        {letter}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={institution || 'Account'}
      width={size}
      height={size}
      className="rounded-md shrink-0"
      style={{ objectFit: 'contain' }}
      onError={() => setFailed(true)}
    />
  )
}
