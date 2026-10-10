import os, re

ROOT = r'F:/bevy/Spiderman_3d'
SRC = os.path.join(ROOT, 'src')

# 1) rename pNN_name.js -> name.js
renamed = []
for f in sorted(os.listdir(SRC)):
    if re.match(r'^p\d{2}_.*\.js$', f):
        new = re.sub(r'^p\d{2}_', '', f)
        os.rename(os.path.join(SRC, f), os.path.join(SRC, new))
        renamed.append((f, new))

# 2) update index.html <script src="src/pNN_x.js"> references
idx = os.path.join(ROOT, 'index.html')
s = open(idx, 'r', encoding='utf-8').read()
s2 = re.sub(r'src/p\d{2}_([a-z0-9]+\.js)', r'src/\1', s)
open(idx, 'w', encoding='utf-8').write(s2)

# 3) keep tooling consistent (split_project.py markers, smoke_test.cjs mods)
for tf in ['tools/split_project.py', 'tools/smoke_test.cjs']:
    p = os.path.join(ROOT, tf)
    if os.path.exists(p):
        t = open(p, 'r', encoding='utf-8').read()
        t2 = re.sub(r"p\d{2}_([a-z0-9]+\.js)", r'\1', t)
        open(p, 'w', encoding='utf-8').write(t2)

print('Renamed %d files:' % len(renamed))
for a, b in renamed:
    print('  %s -> %s' % (a, b))
