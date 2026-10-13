# Converts the owner's pixel-bot SVGs (CSS-animated) into CSP-safe SVGs:
# colours as attributes, motion as SMIL <animate> (no <style>, no style=""),
# no background tile (the robot alone), plus still versions for reduced
# motion and a busy version: while Nasrin thinks, remembers or writes code,
# the ball starts small, grows, bursts into its pixels (reaching out, like
# connecting to its sources) while spinning horizontally, pauses, spins back
# into its normal form and shrinks. Two more working moods: remember (a ripple
# of light moving out through the pixels) and write (pixels fill in row by
# row, like typing).
# Usage: pixelbot-logo.py SRC_DIR OUT_DIR
import math, re, sys
src, out = sys.argv[1], sys.argv[2]
f3 = lambda x: ('%.3f' % x).rstrip('0').rstrip('.')
BUSY = 3.2   # seconds per busy cycle
KT = '0;.25;.42;.6;.82;1'   # grow, burst + spin, pause, spin back + gather, shrink

def scatter(i, x, y, w):
    # Each pixel flies out from the centre and back, by a fixed pseudo-random
    # amount (same file every run), and the whole ball reassembles together.
    cx, cy = x + w / 2 - 512, y + w / 2 - 512
    d = math.hypot(cx, cy) or 1
    r = ((i * 2654435761) % 1000) / 1000
    q = ((i * 40503) % 997) / 997
    out_ = 40 + 70 * r
    return cx / d * out_ + (q - .5) * 40, cy / d * out_ + (r - .5) * 40

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
    body = []
    for i, (cls, x, y, w, h, rx, st) in enumerate(rects):
        c = cls.split(); v = vars_(st)
        geo = f'x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"'
        col = eye if 'e' in c else colors[[k for k in c if k.startswith('b')][0]]
        if mode == 'still':
            body.append(f'<rect {geo} fill="{col}"/>'); continue
        if mode == 'busy':
            dx, dy = scatter(i, float(x), float(y), float(w))
            body.append(f'<rect {geo} fill="{col}"><animateTransform attributeName="transform" type="translate" '
                        f'values="0 0;0 0;{f3(dx)} {f3(dy)};{f3(dx)} {f3(dy)};0 0;0 0" keyTimes="{KT}" '
                        f'calcMode="spline" keySplines="0 0 1 1;.2 .8 .3 1;0 0 1 1;.6 0 .4 1;0 0 1 1" dur="{BUSY}s" repeatCount="indefinite"/>'
                        f'<animate attributeName="opacity" values="1;1;.5;.6;1;1" keyTimes="{KT}" dur="{BUSY}s" repeatCount="indefinite"/></rect>')
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
        # Grows from small; bursts while spinning horizontally (its width goes
        # 1 -> -1, about the centre); pauses; spins back (-1 -> 1) while the
        # pixels gather into the ball; shrinks back.
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="NasrinAI Code">'
                '<g transform="translate(512 512)"><g>'
                f'<animateTransform attributeName="transform" type="scale" values="1 1;1 1;-1 1;-1 1;1 1;1 1" keyTimes="{KT}" calcMode="spline" keySplines="0 0 1 1;.45 0 .55 1;0 0 1 1;.45 0 .55 1;0 0 1 1" dur="{BUSY}s" repeatCount="indefinite"/><g>'
                f'<animateTransform attributeName="transform" type="scale" values=".55;.9;.9;.9;.9;.55" keyTimes="{KT}" calcMode="spline" keySplines=".3 0 .2 1;0 0 1 1;0 0 1 1;0 0 1 1;.6 0 .4 1" dur="{BUSY}s" repeatCount="indefinite"/>'
                '<g transform="translate(-512 -512)">' + ''.join(body) + '</g></g></g></g></svg>\n')
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
