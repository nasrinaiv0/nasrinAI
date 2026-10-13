# Converts the owner's pixel-bot SVGs (CSS-animated) into CSP-safe SVGs:
# colours as attributes, motion as SMIL <animate> (no <style>, no style=""),
# no background tile (the robot alone), plus still versions for reduced
# motion and a busy version: while Nasrin thinks, remembers or writes code,
# the ball starts small, grows, bursts into its pixels (reaching out, like
# connecting to its sources) while the sphere turns horizontally like a globe,
# pauses, turns back into its normal form and shrinks. Two more working moods: remember (a ripple
# of light moving out through the pixels) and write (pixels fill in row by
# row, like typing).
# Usage: pixelbot-logo.py SRC_DIR OUT_DIR
import math, re, sys
src, out = sys.argv[1], sys.argv[2]
f3 = lambda x: ('%.3f' % x).rstrip('0').rstrip('.')
BUSY = 3.2   # seconds per busy cycle

def scatter(i, x, y, w):
    # Each pixel flies out from the centre and back, by a fixed pseudo-random
    # amount (same file every run), and the whole ball reassembles together.
    cx, cy = x + w / 2 - 512, y + w / 2 - 512
    d = math.hypot(cx, cy) or 1
    r = ((i * 2654435761) % 1000) / 1000
    q = ((i * 40503) % 997) / 997
    out_ = 40 + 70 * r
    return cx / d * out_ + (q - .5) * 40, cy / d * out_ + (r - .5) * 40

# The busy cycle, as times (0..1): grow, burst while the sphere turns half
# way, pause, turn the rest of the way while gathering, shrink.
T_GROW, T_OUT, T_PAUSE, T_IN = .2, .38, .56, .78
STEPS = 6   # samples per turning stretch (straight lines between them)
R = 420     # the ball's radius in the 1024 box

def ease(u):
    return u * u * (3 - 2 * u)

def sphere_frames(cx, cy, dx, dy, back):
    # A pixel on the ball's front (or its copy on the back) seen from the front
    # while the sphere turns about its vertical axis: it moves along its row
    # (x = r*sin(angle)), hidden while behind, darker towards the edges.
    r = math.sqrt(max(R * R - cy * cy, 1))
    a0 = math.asin(max(-1, min(1, cx / r))) + (math.pi if back else 0)
    times, phis, bursts = [0, T_GROW], [0, 0], [0, 0]
    for k in range(1, STEPS + 1):
        u = k / STEPS
        times.append(T_GROW + (T_OUT - T_GROW) * u); phis.append(math.pi * ease(u)); bursts.append(ease(u))
    times.append(T_PAUSE); phis.append(math.pi); bursts.append(1)
    for k in range(1, STEPS + 1):
        u = k / STEPS
        times.append(T_PAUSE + (T_IN - T_PAUSE) * u); phis.append(math.pi + math.pi * ease(u)); bursts.append(1 - ease(u))
    times.append(1); phis.append(2 * math.pi); bursts.append(0)
    moves, ops = [], []
    for phi, b in zip(phis, bursts):
        z = math.cos(a0 + phi)
        moves.append(f'{round(r * math.sin(a0 + phi) - cx + b * dx)} {round(b * dy)}')
        ops.append(('%.1f' % (.3 + .7 * z)).lstrip('0') if z > 0 else '0')
    return ';'.join(f3(t) for t in times), ';'.join(moves), ';'.join(ops)

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
    body = []
    for i, (cls, x, y, w, h, rx, st) in enumerate(rects):
        c = cls.split(); v = vars_(st)
        geo = f'x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"'
        col = eye if 'e' in c else colors[[k for k in c if k.startswith('b')][0]]
        if mode == 'still':
            body.append(f'<rect {geo} fill="{col}"/>'); continue
        if mode == 'busy':
            # Every pixel twice: on the front, and its copy on the back of the
            # sphere (the back has no eyes), so the ball stays whole as it turns.
            dx, dy = scatter(i, float(x), float(y), float(w))
            cx, cy = float(x) + float(w) / 2 - 512, float(y) + float(w) / 2 - 512
            for back in (False, True):
                kt, moves, ops = sphere_frames(cx, cy, dx, dy, back)
                fill = (skin if 'e' in c else col) if back else col
                body.append(f'<rect {geo} fill="{fill}"><animateTransform attributeName="transform" type="translate" values="{moves}" keyTimes="{kt}" dur="{BUSY}s" repeatCount="indefinite"/>'
                            f'<animate attributeName="opacity" values="{ops}" keyTimes="{kt}" dur="{BUSY}s" repeatCount="indefinite"/></rect>')
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
        # Grows from small; bursts while the sphere turns half way about its
        # vertical axis; pauses; turns the rest of the way while the pixels
        # gather into the ball; shrinks back.
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="NasrinAI Code">'
                '<g transform="translate(512 512)"><g>'
                f'<animateTransform attributeName="transform" type="scale" values=".55;.9;.9;.55" keyTimes="0;{T_GROW};{T_IN};1" calcMode="spline" keySplines=".3 0 .2 1;0 0 1 1;.6 0 .4 1" dur="{BUSY}s" repeatCount="indefinite"/>'
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
