#!/usr/bin/env python3
"""Tải Google Fonts về local cho PDF Tools Desktop.
- Giữ lại các subset: latin, latin-ext, vietnamese (cần dấu tiếng Việt)
- Rewrite url(...) trong CSS thành đường dẫn relative fonts.gstatic-style
"""
import re, urllib.request, pathlib, sys

CSS = pathlib.Path('fonts/css2.css')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'}
KEEP = ('/* latin */', '/* latin-ext */', '/* vietnamese */')

text = CSS.read_text()

# tách từng @font-face block kèm comment subset phía trước
blocks = re.findall(r'(/\* [a-z-]+ \*/\s*@font-face \{[^}]+\})', text)
out = []
urls = set()
for b in blocks:
    mm = re.match(r'/\* ([a-z-]+) \*/', b)
    if not mm:
        continue
    subset = mm.group(1)
    if subset not in ('latin', 'latin-ext', 'vietnamese'):
        continue
    m = re.search(r'url\((https://[^)]+)\)', b)
    if not m:
        continue
    u = m.group(1)
    urls.add(u)
    rel = u.replace('https://fonts.gstatic.com/', '')  # s/inter/v20/xxx.woff2
    b2 = b.replace(u, rel)
    out.append(b2)

new_css = '\n'.join(out)
CSS.write_text(new_css)
print(f'giữ {len(out)} @font-face, {len(urls)} file woff2')

for u in sorted(urls):
    rel = u.replace('https://fonts.gstatic.com/', '')
    dest = pathlib.Path('fonts') / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 100:
        print('skip', rel); continue
    req = urllib.request.Request(u, headers=UA)
    data = urllib.request.urlopen(req, timeout=30).read()
    dest.write_bytes(data)
    print('ok  ', rel, len(data))
print('DONE')
