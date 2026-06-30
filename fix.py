import sys

with open('src/lib/ai/analyzers/contact-extractor.ts', 'r') as f:
    content = f.read()

# We need to completely rewrite the regex lines to be clean Javascript regex literals.
import re

content = re.sub(
    r'const emailRegex = .*?;',
    r'const emailRegex = /\\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})\\b/g;',
    content
)

content = re.sub(
    r'const linkedinRegex = .*?;',
    r'const linkedinRegex = /https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/g;',
    content
)

content = re.sub(
    r'const slugMatch = url.match\(.*?\);',
    r'const slugMatch = url.match(/in\/([a-zA-Z0-9_-]+)/);',
    content
)

with open('src/lib/ai/analyzers/contact-extractor.ts', 'w') as f:
    f.write(content)
