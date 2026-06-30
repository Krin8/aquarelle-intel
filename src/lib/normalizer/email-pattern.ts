export function deriveEmailPattern(firstName: string, lastName: string, email: string): string {
  const [local] = email.toLowerCase().split('@');
  const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const l = lastName.toLowerCase().replace(/[^a-z]/g, '');
  const fi = f[0];
  const li = l[0];

  if (!f || !l) return 'unknown';

  if (local === `${f}.${l}`) return '{first}.{last}';
  if (local === `${fi}.${l}`) return '{f}.{last}';
  if (local === `${f}.${li}`) return '{first}.{l}';
  if (local === `${f}${l}`) return '{first}{last}';
  if (local === `${fi}${l}`) return '{f}{last}';
  if (local === `${f}${li}`) return '{first}{l}';
  if (local === `${l}.${f}`) return '{last}.{first}';
  if (local === `${l}${fi}`) return '{last}{f}';
  if (local === f) return '{first}';
  
  // Smart fallbacks for nicknames (e.g. Matt -> matthew.delvecchio)
  if (local.endsWith(`.${l}`) && local.startsWith(fi)) return '{first}.{last}';
  if (local.endsWith(l) && local.startsWith(fi) && !local.includes('.')) return '{first}{last}';
  
  return 'unknown';
}

export function generateEmail(firstName: string, lastName: string, domain: string, pattern: string): string | undefined {
  if (pattern === 'unknown') return undefined;
  
  const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const l = lastName.toLowerCase().replace(/[^a-z]/g, '');
  
  if (!f || !l) return undefined;
  
  const fi = f[0];
  const li = l[0];
  
  let local = pattern
      .replace('{first}', f)
      .replace('{last}', l)
      .replace('{f}', fi)
      .replace('{l}', li);
      
  return `${local}@${domain}`;
}

export async function findDomainPatternWithHunter(domain: string): Promise<string> {
  const hunterKey = process.env.HUNTER_API_KEY;
  if (!hunterKey) return 'unknown';

  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${hunterKey}`);
    if (res.ok) {
      const data = await res.json();
      if (data.data && data.data.pattern) {
        return data.data.pattern;
      }
    }
  } catch (e) {
    console.warn('[Hunter] API error:', e);
  }
  return 'unknown';
}
export async function findDomainAndPatternWithHunter(companyName: string): Promise<{ domain: string | null; pattern: string | null }> {
  const hunterKey = process.env.HUNTER_API_KEY;
  if (!hunterKey) return { domain: null, pattern: null };

  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?company=${encodeURIComponent(companyName)}&api_key=${hunterKey}`);
    if (res.ok) {
      const data = await res.json();
      if (data.data) {
        return {
          domain: data.data.domain || null,
          pattern: data.data.pattern || null
        };
      }
    }
  } catch (e) {
    console.warn('[Hunter] API error for company search:', e);
  }
  return { domain: null, pattern: null };
}

export async function findRobustDomainPattern(domain: string, samplePersons: Array<{ name: string; firstName: string; lastName: string }> = []): Promise<{ pattern: string, domain: string }> {
  // We limit to max 3 samples to avoid blasting API credits on a company that just isn't in databases
  const samplesToTry = samplePersons.slice(0, 3);
  
  // Create a list of domains to try. If it's a regional TLD like levi.in, we want to fallback to levi.com
  const domainsToTry = [domain];
  if (!domain.endsWith('.com')) {
    const parts = domain.split('.');
    // Handles domains like levi.in -> levi.com, or marksandspencer.co.uk -> marksandspencer.com
    const baseName = parts.length > 2 && parts[parts.length - 2] === 'co' ? parts[parts.length - 3] : parts[0];
    domainsToTry.push(`${baseName}.com`);
  }

  for (const testDomain of domainsToTry) {
    if (domainsToTry.length > 1 && testDomain !== domain) {
      console.log(`[PatternFallback] Original domain ${domain} failed or is regional. Testing fallback corporate domain: ${testDomain}`);
    }
    
    for (const samplePerson of samplesToTry) {
      if (!samplePerson.firstName || !samplePerson.lastName) continue;
      
      console.log(`[PatternFallback] Trying to derive pattern using sample person: ${samplePerson.name} on ${testDomain}`);

      // --- HUNTER.IO FALLBACK ---
      const hunterKey = process.env.HUNTER_API_KEY;
      if (hunterKey) {
        try {
          const hunterRes = await fetch(`https://api.hunter.io/v2/email-finder?domain=${testDomain}&first_name=${encodeURIComponent(samplePerson.firstName)}&last_name=${encodeURIComponent(samplePerson.lastName)}&api_key=${hunterKey}`);
        if (hunterRes.ok) {
          const data = await hunterRes.json();
          const foundEmail = data?.data?.email;
          const isFound = data?.data?.source_type === 'found' || (data?.data?.sources && data?.data?.sources.length > 0);
          if (foundEmail && isFound) {
            console.log(`[PatternFallback] Hunter succeeded for ${samplePerson.name}: ${foundEmail}`);
            const pattern = deriveEmailPattern(samplePerson.firstName, samplePerson.lastName, foundEmail);
            const actualDomain = foundEmail.split('@')[1] || testDomain;
            return { pattern, domain: actualDomain };
          } else if (foundEmail && !isFound) {
            console.log(`[PatternFallback] Hunter generated email ${foundEmail} for ${samplePerson.name} but lacked sources (hallucinated). Ignoring.`);
          }
        }
      } catch (e) { console.warn('[PatternFallback] Hunter request error:', e); }
    }

    // --- FINDYMAIL FALLBACK ---
    const findymailKey = process.env.FINDYMAIL_API_KEY;
    if (findymailKey) {
      try {
        const findyRes = await fetch('https://app.findymail.com/api/search/name', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${findymailKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ name: samplePerson.name, domain: testDomain })
        });
        if (findyRes.ok) {
          const data = await findyRes.json();
          const foundEmail = data?.contact?.email || data?.email;
          if (foundEmail) {
            console.log(`[PatternFallback] Findymail succeeded for ${samplePerson.name}: ${foundEmail}`);
            const pattern = deriveEmailPattern(samplePerson.firstName, samplePerson.lastName, foundEmail);
            const actualDomain = foundEmail.split('@')[1] || testDomain;
            return { pattern, domain: actualDomain };
          }
        }
      } catch (e) { console.warn('[PatternFallback] Findymail request error:', e); }
    }

    // --- DROPCONTACT FALLBACK ---
    const dcKey = process.env.DROPCONTACT_API_KEY;
    if (dcKey) {
      try {
        const dcRes = await fetch('https://api.dropcontact.com/v1/enrich/all', {
          method: 'POST',
          headers: { 'X-Access-Token': dcKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: [{ first_name: samplePerson.firstName, last_name: samplePerson.lastName, website: testDomain }] })
        });
        if (dcRes.ok) {
          const data = await dcRes.json();
          const result = data?.data?.[0] || data?.[0];
          const foundEmail = result?.email?.[0]?.email || result?.emails?.[0]?.email || result?.email || result?.emails?.[0];
          if (foundEmail && typeof foundEmail === 'string') {
            console.log(`[PatternFallback] Dropcontact succeeded for ${samplePerson.name}: ${foundEmail}`);
            const pattern = deriveEmailPattern(samplePerson.firstName, samplePerson.lastName, foundEmail);
            const actualDomain = foundEmail.split('@')[1] || testDomain;
            return { pattern, domain: actualDomain };
          }
        }
      } catch (e) { console.warn('[PatternFallback] Dropcontact request error:', e); }
    }

    // --- PDL FALLBACK ---
    const pdlKey = process.env.PDL_API_KEY;
    if (pdlKey) {
      try {
        const pdlRes = await fetch('https://api.peopledatalabs.com/v5/person/enrich', {
          method: 'POST',
          headers: { 'X-Api-Key': pdlKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: samplePerson.name, company: testDomain })
        });
        if (pdlRes.ok) {
          const data = await pdlRes.json();
          const foundEmail = data?.data?.emails?.[0]?.address || data?.data?.emails?.[0];
          if (foundEmail && typeof foundEmail === 'string') {
            console.log(`[PatternFallback] PDL succeeded for ${samplePerson.name}: ${foundEmail}`);
            const pattern = deriveEmailPattern(samplePerson.firstName, samplePerson.lastName, foundEmail);
            const actualDomain = foundEmail.split('@')[1] || testDomain;
            return { pattern, domain: actualDomain };
          }
        }
      } catch (e) { console.warn('[PatternFallback] PDL request error:', e); }
    }

    // --- PROSPEO FALLBACK ---
    const prospeoKey = process.env.PROSPEO_API_KEY;
    if (prospeoKey) {
      try {
        const prospeoRes = await fetch('https://api.prospeo.io/email-finder', {
          method: 'POST',
          headers: { 'X-KEY': prospeoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ first_name: samplePerson.firstName, last_name: samplePerson.lastName, company: testDomain })
        });
        if (prospeoRes.ok) {
          const data = await prospeoRes.json();
          const foundEmail = data?.response?.email?.email || data?.email;
          if (foundEmail && typeof foundEmail === 'string') {
            console.log(`[PatternFallback] Prospeo succeeded for ${samplePerson.name}: ${foundEmail}`);
            const pattern = deriveEmailPattern(samplePerson.firstName, samplePerson.lastName, foundEmail);
            const actualDomain = foundEmail.split('@')[1] || testDomain;
            return { pattern, domain: actualDomain };
          }
        }
      } catch (e) { console.warn('[PatternFallback] Prospeo request error:', e); }
    }
    }
  }
  
  // If we couldn't find a pattern using the specific sample persons, 
  // fallback to Hunter's generic domain search as a last resort.
  console.log(`[PatternFallback] Could not derive pattern from samples, falling back to generic domain search for ${domain}`);
  let derivedPattern = await findDomainPatternWithHunter(domain);
  return { pattern: derivedPattern, domain };
}
