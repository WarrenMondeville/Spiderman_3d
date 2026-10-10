import os, shutil

ROOT = r'F:/bevy/Spiderman_3d'
HTML = os.path.join(ROOT, 'spiderman.html')

with open(HTML, 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

# 1-indexed boundaries discovered from the file
HTML_END = 236            # last body DOM line before the library <script>
THREE_START = 238        # first line of three.js code (after <script> @237)
THREE_END = 53285        # last line of three.js code (before </script> @53286)
GAME_LAST = 57578        # last code line inside the game <script> (before </script> @57580)

# module markers: (1-indexed line of the /* ==== pNN_name.js ==== */ comment, filename)
markers = [
    (53289, 'core.js'), (53473, 'gfx.js'), (53813, 'sky.js'),
    (53930, 'citygen.js'), (54160, 'facade.js'), (54462, 'citymesh.js'),
    (54684, 'ground.js'), (54870, 'props.js'), (55047, 'traffic.js'),
    (55170, 'peds.js'), (55240, 'body.js'), (55518, 'suit.js'),
    (55726, 'anim.js'), (55922, 'hero.js'), (55949, 'player.js'),
    (56360, 'camera.js'), (56447, 'fx.js'), (56618, 'enemies.js'),
    (56785, 'combat.js'), (56973, 'crimes.js'), (57096, 'hud.js'),
    (57193, 'flow.js'), (57411, 'tests.js'), (57464, 'main.js'),
]

os.makedirs(os.path.join(ROOT, 'vendor'), exist_ok=True)
os.makedirs(os.path.join(ROOT, 'src'), exist_ok=True)

# --- extract three.js (pure JS, no script tags) ---
three_content = '\n'.join(lines[THREE_START - 1:THREE_END])
with open(os.path.join(ROOT, 'vendor', 'three.js'), 'w', encoding='utf-8') as f:
    f.write(three_content + '\n')

# --- extract each game module ---
mod_order = []
for i, (ln, name) in enumerate(markers):
    start = ln - 1                      # 0-indexed: the marker comment line
    stop = (markers[i + 1][0] - 1) if i + 1 < len(markers) else GAME_LAST
    block = '\n'.join(lines[start:stop])
    # add 'use strict' at the top of every module to preserve the original
    # whole-script strict-mode semantics (p01 already had one; a duplicate is harmless)
    out = "'use strict';\n" + block + '\n'
    with open(os.path.join(ROOT, 'src', name), 'w', encoding='utf-8') as f:
        f.write(out)
    mod_order.append(name)

# --- rebuild the HTML shell ---
shell = lines[0:HTML_END]               # lines 1..236 (head + body DOM)
script_tags = ['<script src="vendor/three.js"></script>']
for name in mod_order:
    script_tags.append(f'<script src="src/{name}"></script>')
new_html = '\n'.join(shell + script_tags + ['</body>', '</html>']) + '\n'

# backup original before overwriting
shutil.copy2(HTML, HTML + '.bak')

with open(HTML, 'w', encoding='utf-8') as f:
    f.write(new_html)

print('Modules extracted:', len(mod_order))
print('three.js lines   :', three_content.count('\n') + 1)
print('new html lines   :', new_html.count('\n') + 1)
print('backup           :', HTML + '.bak')
