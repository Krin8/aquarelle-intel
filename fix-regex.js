const fs = require('fs');
const file = 'src/lib/ai/analyzers/contact-extractor.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const emailRegex = \/\\\\b\(\[a-zA-Z0-9\._%\+-\]\+\)@\(\[a-zA-Z0-9\.-\]\+\\\\\.\[a-zA-Z\]\{2,\}\)\\\\b\/g;/,
  'const emailRegex = /\\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})\\b/g;'
);

content = content.replace(
  /const linkedinRegex = \/https:\\\\\/\\\\/\(www\\\\.\)\?linkedin\\\\.com\\\\/in\\\\/\[a-zA-Z0-9_-\]\+\\\\\/\?\/g;/,
  'const linkedinRegex = /https:\\/\\/(www\\.)?linkedin\\.com\\/in\\/[a-zA-Z0-9_-]+\\/?/g;'
);

content = content.replace(
  /const slugMatch = url\.match\(\/in\\\\/\(\[a-zA-Z0-9_-\]\+\)\/\);/,
  'const slugMatch = url.match(/in\\/([a-zA-Z0-9_-]+)/);'
);

fs.writeFileSync(file, content);
console.log('Fixed regexes');
