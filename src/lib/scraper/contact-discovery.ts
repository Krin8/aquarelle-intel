import prisma from '../db';
import { getApiKey } from '@/lib/settings';
import { generateStructuredResponse } from '../ai/router';
import { deriveEmailPattern, generateEmail } from '../normalizer/email-pattern';

export interface DiscoveredPerson {
  name: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  role: string;
  company: string;
  department?: string;
  linkedinUrl?: string;
}

export interface VerifiedContact extends DiscoveredPerson {
  email?: string;
  phone?: string;
  verificationStatus: 'valid' | 'catch-all' | 'invalid' | 'unverified';
  officeLocation?: string;
  previousEmployers?: string;
}

const ROLES_TO_SEARCH = [
  'Sourcing Director', 'Sourcing Manager', 'Buying Director',
  'Buying Manager', 'Product Development Director', 'Product Development Manager',
  'Technical Director', 'Technical Manager', 'Sustainability Director',
  'Sustainability Manager', 'Sustainability Team', 'Country Sourcing Head',
  'Regional Sourcing Head', 'Procurement Director', 'Procurement Manager',
  'Head of Sourcing', 'Head of Procurement'
];

export async function runContactDiscoveryForBrand(brandId: string) {
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return { success: false, error: 'Brand not found' };

  console.log(`[ContactDiscovery] Starting workflow for ${brand.name}...`);

  try {

    // ─── STEP 1: Discover Decision Makers ──────────────────────────────────────────
    console.log(`[ContactDiscovery] Step 1: Identifying decision makers for ${brand.name}...`);

    const peopleMap = new Map<string, DiscoveredPerson>();

    try {
      const existingContacts = await prisma.contact.findMany({
        where: { brandId, email: null },
      });

      for (const c of existingContacts) {
        if (c.name && c.name.trim().toLowerCase() !== 'unknown') {
          const parts = c.name.trim().split(/\s+/);
          if (parts.length >= 2) {
            peopleMap.set(c.name.toLowerCase(), {
              name: c.name,
              firstName: parts[0],
              lastName: parts[parts.length - 1],
              role: c.role || 'Unknown',
              company: brand.name
            });
          }
        }
      }
      console.log(`[ContactDiscovery] Successfully loaded ${peopleMap.size} contacts from DB to enrich.`);
    } catch (err) {
      console.warn(`[ContactDiscovery] Failed to load contacts from DB. Error:`, err instanceof Error ? err.message : err);
    }

    const systemPrompt = `You are an expert B2B lead researcher. Return ONLY valid JSON.`;
    const prompt = `Use Google Search to find as many of the most important decision makers as possible (minimum 5, maximum 15-20) who currently hold any of the following B2B operational roles at ${brand.name}:\n${ROLES_TO_SEARCH.join(', ')}\n\nCRITICAL: DO NOT return top-level executives like CEO, President, Chairman, Vice Chairman, or CFO. We only want operational contacts we can meet for B2B supplier talks (e.g. Sourcing, Buying, Procurement, Merchandising, Supply Chain).\n\nUse your search grounding to find real names that actively work there today. Extract every valid contact you can find up to a maximum of 20, but if you can only find 7, that is perfectly fine. Just ensure you return at least 5 if they exist. Return ONLY a strict JSON array of objects with keys: "name", "firstName", "lastName", "middleName", and "role". Do not include any other text. If none found, return [].`;

    console.log(`[ContactDiscovery] Querying Gemini (with Google Search Grounding) for all roles at once...`);

    try {
      const { result: contacts } = await generateStructuredResponse<any[]>(
        systemPrompt,
        prompt,
        (text) => {
          const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
          const startIdx = cleaned.indexOf('[');
          const endIdx = cleaned.lastIndexOf(']');
          if (startIdx >= 0 && endIdx >= startIdx) {
            return JSON.parse(cleaned.substring(startIdx, endIdx + 1));
          }
          throw new Error('No JSON array found');
        },
        true // Enable Google Search Grounding to prevent hallucination
      );

      if (Array.isArray(contacts)) {
        for (const item of contacts) {
          if (item.name && item.role) {
            peopleMap.set(item.name.toLowerCase(), {
              name: item.name,
              firstName: item.firstName,
              lastName: item.lastName,
              middleName: item.middleName,
              role: item.role,
              company: brand.name
            });
          }
        }
        console.log(`[ContactDiscovery] Successfully discovered ${contacts.length} new contacts via grounded search.`);
      }
    } catch (err) {
      console.warn(`[ContactDiscovery] Failed to discover contacts via grounded search. Error:`, err instanceof Error ? err.message : err);
    }

    let discoveredPeople = Array.from(peopleMap.values());

    console.log(`[ContactDiscovery] Found ${discoveredPeople.length} potential decision makers.`);

    if (discoveredPeople.length === 0) {
      return { success: false, error: 'No decision makers found.' };
    }

    // ─── STEP 2: Find Contact Info & Email Pattern ────────────────────────────────────────────────
    console.log(`[ContactDiscovery] Step 2: Deriving email pattern from Apollo...`);
    const enrichedContacts: VerifiedContact[] = [];

    let derivedPattern = 'unknown';
    // Extract base domain to avoid missing patterns on subdomains (e.g. global.llbean.com -> llbean.com)
    let discoveredDomain = '';
    try {
      if (brand.website) {
        let hostname = new URL(brand.website).hostname;
        hostname = hostname.replace(/^www\./, '');
        const parts = hostname.split('.');
        // Simple base domain extraction
        if (parts.length > 2) {
          // Check for common ccTLDs like .co.uk
          if (parts[parts.length - 2] === 'co' || parts[parts.length - 2] === 'com') {
            discoveredDomain = parts.slice(-3).join('.');
          } else {
            discoveredDomain = parts.slice(-2).join('.');
          }
        } else {
          discoveredDomain = hostname;
        }
      }
    } catch {
      discoveredDomain = brand.website ? brand.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : '';
    }

    if (discoveredDomain) {
      let hunterPatternFound = false;
      const hunterKey = await getApiKey('HUNTER');
      if (hunterKey) {
        console.log(`[ContactDiscovery] Querying Hunter.io for domain pattern of ${discoveredDomain}...`);
        try {
          const hunterRes = await fetch(`https://api.hunter.io/v2/domain-search?domain=${discoveredDomain}&api_key=${hunterKey}`);
          
          if (hunterRes.ok) {
            const data = await hunterRes.json();
            if (data.data && data.data.pattern) {
              derivedPattern = data.data.pattern;
              hunterPatternFound = true;
              console.log(`[ContactDiscovery] Hunter found pattern: ${derivedPattern} for domain ${discoveredDomain}`);
            } else {
              console.log(`[ContactDiscovery] Hunter domain search successful but no pattern found.`);
            }
          } else {
            console.log(`[ContactDiscovery] Hunter API match failed: ${hunterRes.status}.`);
          }
        } catch (e) {
          console.warn('[ContactDiscovery] Hunter request error:', e);
        }
      } else {
        console.log(`[ContactDiscovery] No HUNTER_API_KEY found in .env, skipping Hunter search.`);
      }

      // --- FINDYMAIL FALLBACK ---
      if (!hunterPatternFound) {
        const findymailKey = await getApiKey('FINDYMAIL');
        const samplePerson = discoveredPeople.find(p => p.firstName && p.lastName);
        if (findymailKey && samplePerson) {
          console.log(`[ContactDiscovery] Hunter skipped/failed. Querying Findymail for ${samplePerson.name}...`);
          try {
            const findyRes = await fetch('https://app.findymail.com/api/search/name', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${findymailKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                name: samplePerson.name,
                domain: discoveredDomain
              })
            });
            
            if (findyRes.ok) {
              const data = await findyRes.json();
              const foundEmail = data?.contact?.email || data?.email;
              if (foundEmail) {
                console.log(`[ContactDiscovery] Findymail found email: ${foundEmail}`);
                derivedPattern = deriveEmailPattern(samplePerson.firstName!, samplePerson.lastName!, foundEmail);
                console.log(`[ContactDiscovery] Derived Pattern from Findymail: ${derivedPattern}`);
              } else {
                console.log(`[ContactDiscovery] Findymail succeeded but no email found.`);
              }
            } else {
              console.log(`[ContactDiscovery] Findymail API failed: ${findyRes.status}`);
            }
          } catch (e) {
            console.warn('[ContactDiscovery] Findymail request error:', e);
          }
        } else if (!findymailKey) {
          console.log(`[ContactDiscovery] No FINDYMAIL_API_KEY found in .env, skipping Findymail fallback.`);
        }
      }

      // --- DROPCONTACT FALLBACK ---
      if (derivedPattern === 'unknown') {
        const dcKey = await getApiKey('DROPCONTACT');
        const samplePerson = discoveredPeople.find(p => p.firstName && p.lastName);
        if (dcKey && samplePerson) {
          console.log(`[ContactDiscovery] Findymail skipped/failed. Querying Dropcontact for ${samplePerson.name}...`);
          try {
            const dcRes = await fetch('https://api.dropcontact.com/v1/enrich/all', {
              method: 'POST',
              headers: {
                'X-Access-Token': dcKey,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                data: [{
                  first_name: samplePerson.firstName,
                  last_name: samplePerson.lastName,
                  website: discoveredDomain
                }]
              })
            });
            if (dcRes.ok) {
              const data = await dcRes.json();
              const result = data?.data?.[0] || data?.[0];
              const foundEmail = result?.email?.[0]?.email || result?.emails?.[0]?.email || result?.email || result?.emails?.[0];
              if (foundEmail && typeof foundEmail === 'string') {
                console.log(`[ContactDiscovery] Dropcontact found email: ${foundEmail}`);
                derivedPattern = deriveEmailPattern(samplePerson.firstName!, samplePerson.lastName!, foundEmail);
                console.log(`[ContactDiscovery] Derived Pattern from Dropcontact: ${derivedPattern}`);
              } else {
                console.log(`[ContactDiscovery] Dropcontact succeeded but no email found.`);
              }
            } else {
              console.log(`[ContactDiscovery] Dropcontact API failed: ${dcRes.status}`);
            }
          } catch (e) {
            console.warn('[ContactDiscovery] Dropcontact request error:', e);
          }
        }
      }

      // --- PEOPLE DATA LABS (PDL) FALLBACK ---
      if (derivedPattern === 'unknown') {
        const pdlKey = await getApiKey('PDL');
        const samplePerson = discoveredPeople.find(p => p.firstName && p.lastName);
        if (pdlKey && samplePerson) {
          console.log(`[ContactDiscovery] Dropcontact skipped/failed. Querying People Data Labs for ${samplePerson.name}...`);
          try {
            const pdlRes = await fetch('https://api.peopledatalabs.com/v5/person/enrich', {
              method: 'POST',
              headers: {
                'X-Api-Key': pdlKey,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: samplePerson.name,
                company: discoveredDomain
              })
            });
            if (pdlRes.ok) {
              const data = await pdlRes.json();
              const foundEmail = data?.data?.emails?.[0]?.address || data?.data?.emails?.[0];
              if (foundEmail && typeof foundEmail === 'string') {
                console.log(`[ContactDiscovery] PDL found email: ${foundEmail}`);
                derivedPattern = deriveEmailPattern(samplePerson.firstName!, samplePerson.lastName!, foundEmail);
                console.log(`[ContactDiscovery] Derived Pattern from PDL: ${derivedPattern}`);
              } else {
                console.log(`[ContactDiscovery] PDL succeeded but no email found.`);
              }
            } else {
              console.log(`[ContactDiscovery] PDL API failed: ${pdlRes.status}`);
            }
          } catch (e) {
            console.warn('[ContactDiscovery] PDL request error:', e);
          }
        }
      }

      // --- PROSPEO FALLBACK ---
      if (derivedPattern === 'unknown') {
        const prospeoKey = await getApiKey('PROSPEO');
        const samplePerson = discoveredPeople.find(p => p.firstName && p.lastName);
        if (prospeoKey && samplePerson) {
          console.log(`[ContactDiscovery] PDL skipped/failed. Querying Prospeo for ${samplePerson.name}...`);
          try {
            const prospeoRes = await fetch('https://api.prospeo.io/email-finder', {
              method: 'POST',
              headers: {
                'X-KEY': prospeoKey,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                first_name: samplePerson.firstName,
                last_name: samplePerson.lastName,
                company: discoveredDomain
              })
            });
            if (prospeoRes.ok) {
              const data = await prospeoRes.json();
              const foundEmail = data?.email?.email || data?.email || data?.response?.email?.email;
              if (foundEmail && typeof foundEmail === 'string') {
                console.log(`[ContactDiscovery] Prospeo found email: ${foundEmail}`);
                derivedPattern = deriveEmailPattern(samplePerson.firstName!, samplePerson.lastName!, foundEmail);
                console.log(`[ContactDiscovery] Derived Pattern from Prospeo: ${derivedPattern}`);
              } else {
                console.log(`[ContactDiscovery] Prospeo succeeded but no email found.`);
              }
            } else {
              console.log(`[ContactDiscovery] Prospeo API failed: ${prospeoRes.status}`);
            }
          } catch (e) {
            console.warn('[ContactDiscovery] Prospeo request error:', e);
          }
        }
      }

      // --- FINAL DEFAULT FALLBACK ---
      if (derivedPattern === 'unknown') {
        console.log(`[ContactDiscovery] No pattern found from APIs. Proceeding without email generation.`);
      }
    }

    for (const person of discoveredPeople) {
      let email: string | undefined;

      if (person.firstName && person.lastName && derivedPattern !== 'unknown' && discoveredDomain) {
        email = generateEmail(person.firstName, person.lastName, discoveredDomain, derivedPattern);
        if (email) {
          console.log(`[ContactDiscovery] Generated email for ${person.name}: ${email}`);
        }
      }

      enrichedContacts.push({
        ...person,
        email,
        phone: undefined,
        linkedinUrl: undefined,
        officeLocation: undefined,
        previousEmployers: undefined,
        verificationStatus: email ? 'unverified' : 'invalid'
      });
    }

    console.log(`[ContactDiscovery] Saving and verifying ${enrichedContacts.length} contacts...`);
    let verifiedCount = 0;

    for (const contact of enrichedContacts) {
      if (contact.email) {
        contact.verificationStatus = 'unverified';
        verifiedCount++;
      }

      // Save to DB
      const existing = await prisma.contact.findFirst({
        where: { brandId, name: contact.name }
      });
      if (existing) {
        await prisma.contact.update({
          where: { id: existing.id },
          data: {
            firstName: contact.firstName,
            lastName: contact.lastName,
            middleName: contact.middleName,
            email: contact.email,
            phone: contact.phone,
            linkedinUrl: contact.linkedinUrl,
            officeLocation: contact.officeLocation,
            previousEmployers: contact.previousEmployers
          }
        });
      } else {
        await prisma.contact.create({
          data: {
            brandId,
            name: contact.name,
            firstName: contact.firstName,
            lastName: contact.lastName,
            middleName: contact.middleName,
            role: contact.role,
            email: contact.email,
            phone: contact.phone,
            linkedinUrl: contact.linkedinUrl,
            officeLocation: contact.officeLocation,
            previousEmployers: contact.previousEmployers,
            isVerified: contact.verificationStatus === 'valid',
            verificationStatus: contact.verificationStatus,
            source: 'google_ai_sge',
            confidenceScore: contact.email ? 0.9 : 0.4
          }
        });
      }
    }

    return { success: true, verifiedCount };
  } catch (error: any) {
    console.error('[ContactDiscovery] Error:', error);
    return { success: false, error: error.message };
  }
}
