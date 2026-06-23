const cheerio = require('cheerio');
fetch('https://bananaclub.co.in').then(r => r.text()).then(html => {
  const $ = cheerio.load(html);
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const phoneRegex = /(?<!\d)\+?(?:[0-9][\s\-\.]?){9,14}[0-9](?!\d)/g;
  const rawPhones = bodyText.match(phoneRegex) || [];
  const phones = [...new Set(
    rawPhones
      .map(p => p.trim())
      .filter(p => {
        const digits = p.replace(/\D/g, '');
        const digitCount = digits.length;
        if (digitCount < 10 || digitCount > 15) return false;
        
        if (digitCount > 10 && !p.startsWith('+') && !p.includes(' ') && !p.includes('-')) {
           if (digitCount === 11 && (p.startsWith('1') || p.startsWith('0'))) {
               // OK
           } else {
               return false;
           }
        }
        
        // Extra filter for 10 digits: some 10-digit IDs start with weird numbers. In India/US, they rarely start with 0 (unless area code) but let's just leave 10 digits as is.
        // Or wait, is there a way to filter out the 10-digit IDs like 1738237436?
        // 10 digits without any formatting might be unix timestamps (e.g. 1738237436 is Jan 2025). 
        if (digitCount === 10 && p.startsWith('173')) return false; // Common unix timestamp range for 2024-2025
        
        // Also if it's an arithmetic equation like "14.946-14.946", the digits match. 
        if (p.includes('.') || p.split('-').length > 3) return false;

        return true;
      })
  )];
  console.log('Filtered Phones:', phones);
});
