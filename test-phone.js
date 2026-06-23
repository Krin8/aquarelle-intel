const cheerio = require('cheerio');
fetch('https://bananaclub.co.in').then(r => r.text()).then(html => {
  const $ = cheerio.load(html);
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const phoneRegex = /(?<!\d)\+?(?:[0-9][\s\-\.]?){9,14}[0-9](?!\d)/g;
  console.log('Matches:', bodyText.match(phoneRegex));
  const idx = bodyText.indexOf('636380');
  console.log('Snippet:', bodyText.substring(idx - 30, idx + 30));
});
