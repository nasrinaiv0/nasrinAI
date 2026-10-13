# Converts the owner's pixel-bot SVGs (CSS-animated) into CSP-safe SVGs:
# colours as attributes, motion as SMIL <animate> (no <style>, no style=""),
# no background tile (the robot alone), plus still versions for reduced
# motion and a busy version: while Nasrin thinks, remembers or writes code,
# the ball pops up, explodes into its pixels (reaching out, like connecting
# to its sources) while the sphere turns once horizontally like a globe,
# pauses only at 360 degrees, snaps back into its normal form and shrinks. Two more working moods: remember (a ripple
# of light moving out through the pixels) and write (pixels fill in row by
# row, like typing).
# Usage: pixelbot-logo.py SRC_DIR OUT_DIR
import math, re, sys
src, out = sys.argv[1], sys.argv[2]
f3 = lambda x: ('%.3f' % x).rstrip('0').rstrip('.')
BUSY = 3.6   # seconds per busy cycle

# The busy cycle, as times (0..1). Every pixel keeps its square shape and
# never overlaps another ("perfect pixel"): the ball bursts by spreading its
# grid evenly (gaps between pixels, no scatter), and turns like a globe by
# sliding its face across the fixed grid: the eyes and the speckle move along
# each row, squeeze towards the edge and come back round from the other side,
# while the light (darker edges) stays where it is.
T_POP, T_GROW, T_BURST, T_SETTLE, T_OUT, T_PAUSE, T_GATHER, T_IN, T_SHRINK = .08, .13, .22, .32, .56, .70, .80, .85, .94
SPREAD, OVER, UNDER = .75, .82, -.07   # how far the burst throws the edge (x its distance) / at the bounce out / in
SCATTER = .4   # random nudge per pixel, as a share of the gap to its neighbour (under .5: never touch)
FPS = 60    # face frames per second while turning (no faster than a screen)

def ease(u):
    return u * u * (3 - 2 * u)

def turn(t):
    # How far the face has turned (0..2*pi) at time t: one whole turn while
    # it is burst; it pauses only once it is facing front again (360 degrees).
    if t <= T_GROW: return 0
    if t <= T_OUT: return 2 * math.pi * ease((t - T_GROW) / (T_OUT - T_GROW))
    return 2 * math.pi

def globe(rects, colors, eye):
    # Per pixel: its fill over time (discrete frames, repeated values merged).
    # The eyes are drawn on top of body pixels; here the body pixel under an
    # eye shows the eye itself, so the eye can travel with the face.
    eyes = {(x, y) for cls, x, y, *_ in rects if 'e' in cls.split()}
    cells, index = [], {}
    for n, (cls, x, y, w, *_) in enumerate(rects):
        b = [k for k in cls.split() if k.startswith('b')]
        if not b: continue
        index[n] = len(cells)
        cells.append((float(x) + float(w) / 2 - 512, float(y) + float(w) / 2 - 512, (x, y) in eyes, int(b[0][1])))
    # The light: the average shade at each distance from the centre.
    bins = {}
    for cx, cy, e, sh in cells:
        bins.setdefault(int(math.hypot(cx, cy) // 45), []).append(sh)
    def light(cx, cy):
        b = bins[min(bins, key=lambda k: abs(k - math.hypot(cx, cy) // 45))]
        return sum(b) / len(b)
    rows = {}
    for i, (cx, cy, e, sh) in enumerate(cells): rows.setdefault(cy, []).append(i)
    half = {cy: max(abs(cells[i][0]) for i in ids) + 15 for cy, ids in rows.items()}
    # What the face holds at each pixel: an eye, or how much lighter/darker
    # than the light it is (the speckle). The back of the ball has no eyes.
    face = [('e' if e else (sh - light(cx, cy))) for cx, cy, e, sh in cells]
    def look(i, phi):
        cx, cy, e, sh = cells[i]
        r = half[cy]
        lon = math.asin(max(-1, min(1, cx / r))) - phi
        back = math.cos(lon) < 0
        if back: lon += math.pi
        sx = r * math.sin(lon)
        j = min(rows[cy], key=lambda k: abs(cells[k][0] - sx))
        f = face[j]
        if f == 'e':
            if not back: return eye
            f = 0
        shade = light(cx, cy) + f
        return colors[min(colors, key=lambda k: abs(int(k[1]) - shade))]
    n = round(BUSY * FPS)
    frames = [k / n for k in range(n)]
    out = []
    for i in range(len(cells)):
        vals, times = [], []
        for t in frames:
            v = look(i, turn(t))
            if not vals or vals[-1] != v: vals.append(v); times.append(t)
        out.append((vals, times))
    return {n: out[k] for n, k in index.items()}

def convert(path, mode, speed=1.0):
    f = lambda x: f3(float(x) / speed)
    s = open(path).read()
    s = re.sub(r'<metadata>.*?</metadata>', '', s, flags=re.S)
    style = re.search(r'<style>(.*?)</style>', s, re.S).group(1)
    colors = dict(re.findall(r'\.(b\d)\{--c:(#[0-9a-fA-F]{3,6})\}', style))
    hl = re.search(r'--h:(#[0-9a-fA-F]{3,6})', style).group(1)
    eye = re.search(r'\.e\{fill:(#[0-9a-fA-F]{3,6})', style).group(1)
    rects = re.findall(r'<rect class="([^"]+)" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="(\d+)" style="([^"]*)"/>', s)
    vars_ = lambda st: dict(re.findall(r'--([a-z]):(-?[\d.]+)', st))
    # The most used body colour: the back of the sphere, where the eyes are not.
    skin = max(colors.values(), key=lambda v: sum(1 for cl, *_ in rects if 'e' not in cl.split() and colors.get(next((k for k in cl.split() if k.startswith('b')), ''), None) == v))
    faces = globe(rects, colors, eye) if mode == 'busy' else None
    body = []
    for i, (cls, x, y, w, h, rx, st) in enumerate(rects):
        c = cls.split(); v = vars_(st)
        geo = f'x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"'
        col = eye if 'e' in c else colors[[k for k in c if k.startswith('b')][0]]
        if mode == 'still':
            body.append(f'<rect {geo} fill="{col}"/>'); continue
        if mode == 'busy':
            if i not in faces: continue   # an eye: the pixel under it shows it
            # Thrown out from the centre (outer pixels further, so gaps grow
            # outwards and pixels never overlap), bounces, turns, waits, is
            # pulled back in with a bounce; its colour follows the turning face.
            cx, cy = float(x) + float(w) / 2 - 512, float(y) + float(w) / 2 - 512
            rho = min(1, math.hypot(cx, cy) / 420)
            far = .5 + .5 * rho
            # A small fixed random nudge (same file every run), less than half
            # the gap to the next pixel, so the burst looks scattered but no
            # two pixels ever touch.
            gap = 30 * (1 + SPREAD * far) - 27
            jx = (((i * 2654435761) % 1000) / 500 - 1) * SCATTER * gap
            jy = (((i * 40503 + 17) % 997) / 498.5 - 1) * SCATTER * gap
            mv = lambda k: f'{round(k * far * cx + k / SPREAD * jx)} {round(k * far * cy + k / SPREAD * jy)}'
            vals, times = faces[i]
            fill = (f'<animate attributeName="fill" calcMode="discrete" values="{";".join(vals)}" keyTimes="{";".join(f3(t) for t in times)}" dur="{BUSY}s" repeatCount="indefinite"/>' if len(vals) > 1 else '')
            body.append(f'<rect {geo} fill="{vals[0]}">{fill}<animateTransform attributeName="transform" type="translate" '
                        f'values="0 0;0 0;{mv(OVER)};{mv(SPREAD)};{mv(SPREAD)};{mv(UNDER)};0 0;0 0" '
                        f'keyTimes="0;{T_GROW};{T_BURST};{T_SETTLE};{T_PAUSE};{T_GATHER};{T_IN};1" calcMode="spline" '
                        f'keySplines="0 0 1 1;.1 .9 .2 1;.5 0 .5 1;0 0 1 1;.6 0 .9 .5;.3 0 .4 1;0 0 1 1" dur="{BUSY}s" repeatCount="indefinite"/></rect>')
            continue
        if mode == 'remember':
            # A ring of light runs out from the centre and back.
            d = math.hypot(float(x) + float(w) / 2 - 512, float(y) + float(w) / 2 - 512) / 430
            body.append(f'<rect {geo} fill="{col}"><animate attributeName="opacity" values="1;.3;1;1" keyTimes="0;.18;.4;1" '
                        f'dur="1.8s" begin="{f3(d * 0.9 - 1.8)}s" repeatCount="indefinite"/></rect>')
            continue
        if mode == 'write':
            # Rows fill in from the top, left to right in each row, like typing.
            t = .04 + .74 * ((float(y) - 93.5) / 810 + (float(x) - 93.5) / 810 * .045)
            body.append(f'<rect {geo} fill="{col}"><animate attributeName="opacity" values=".12;.12;1;1;.12" '
                        f'keyTimes="0;{f3(t)};{f3(t + .03)};.92;1" dur="2.6s" repeatCount="indefinite"/></rect>')
            continue
        if 'e' in c:
            if 'e0' in c:
                body.append(f'<rect {geo} fill="{eye}"/>'); continue
            body.append(f'<rect {geo} fill="{eye}"><animate attributeName="opacity" values="1;1;0;0;1;1;0;0;1;1" keyTimes="0;.58;.6;.64;.66;.7;.72;.76;.78;1" dur="{f(6)}s" begin="{f(v.get("s","0"))}s" repeatCount="indefinite"/></rect>')
            continue
        anim = f'<animate attributeName="fill" values="{col};{hl};{col};{col}" keyTimes="0;.03;.09;1" dur="{f(7)}s" begin="{f(v.get("s","0"))}s" repeatCount="indefinite"/>'
        if 'k' in c:
            anim += f'<animate attributeName="opacity" values="1;1;.1;.85;.15;1;1" keyTimes="0;.88;.9;.93;.95;.97;1" dur="{f(v.get("u","5"))}s" begin="{f(v.get("v","0"))}s" repeatCount="indefinite"/>'
        body.append(f'<rect {geo} fill="{col}">{anim}</rect>')
    if mode == 'busy':
        # Pops up; explodes while the sphere turns once about its vertical
        # axis; pauses at 360 degrees; snaps back together; shrinks. A wider
        # view (same centre) leaves room for the burst.
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-192 -192 1408 1408" role="img" aria-label="NasrinAI Code">'
                '<g transform="translate(512 512)"><g>'
                f'<animateTransform attributeName="transform" type="scale" values=".76;1.02;.9;.9;.69;.76" keyTimes="0;{T_POP};{T_GROW};{T_IN};{T_SHRINK};1" calcMode="spline" keySplines=".2 .9 .3 1;.5 0 .5 1;0 0 1 1;.5 0 .7 1;.3 0 .3 1" dur="{BUSY}s" repeatCount="indefinite"/>'
                '<g transform="translate(-512 -512)">' + ''.join(body) + '</g></g></g></svg>\n')
    if mode == 'remember':
        # The ball breathes a little while the light runs through it.
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="NasrinAI Code">'
                '<g transform="translate(512 512)"><g><animateTransform attributeName="transform" type="scale" values=".86;.96;.86" dur="1.8s" repeatCount="indefinite"/>'
                '<g transform="translate(-512 -512)">' + ''.join(body) + '</g></g></g></svg>\n')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="NasrinAI Code"><g>'
            + ''.join(body) + '</g></svg>\n')

# Light UI: the dark robot (owner's "dark" file); dark UI: the "light" file.
for name, file in [('light', 'pixel-bot-logo-dark.svg'), ('dark', 'pixel-bot-logo-light.svg')]:
    open(f'{out}/code-bot-{name}.svg', 'w').write(convert(f'{src}/{file}', 'idle'))
    open(f'{out}/code-bot-{name}-still.svg', 'w').write(convert(f'{src}/{file}', 'still'))
    open(f'{out}/code-bot-{name}-busy.svg', 'w').write(convert(f'{src}/{file}', 'busy'))
    open(f'{out}/code-bot-{name}-remember.svg', 'w').write(convert(f'{src}/{file}', 'remember'))
    open(f'{out}/code-bot-{name}-write.svg', 'w').write(convert(f'{src}/{file}', 'write'))
