# Converts the owner's pixel-bot SVGs (CSS-animated) into CSP-safe SVGs:
# colours as attributes, motion as SMIL <animate> (no <style>, no style=""),
# plus still versions for reduced motion. Usage: pixelbot.py SRC_DIR OUT_DIR
import re, sys
src, out = sys.argv[1], sys.argv[2]
def convert(path, animated, speed=1.0):
    f = lambda x: ('%.3f' % (float(x) / speed)).rstrip('0').rstrip('.')
    s = open(path).read()
    s = re.sub(r'<metadata>.*?</metadata>', '', s, flags=re.S)
    style = re.search(r'<style>(.*?)</style>', s, re.S).group(1)
    colors = dict(re.findall(r'\.(b\d)\{--c:(#[0-9a-fA-F]{3,6})\}', style))
    hl = re.search(r'--h:(#[0-9a-fA-F]{3,6})', style).group(1)
    eye = re.search(r'\.e\{fill:(#[0-9a-fA-F]{3,6})', style).group(1)
    defs = re.search(r'<defs>.*?</defs>', s, re.S).group(0)
    defs = re.sub(r'<filter.*?</filter>', '', defs, flags=re.S)
    bg = re.search(r'<stop offset="0" stop-color="(#[0-9a-fA-F]+)"/><stop offset="1" stop-color="(#[0-9a-fA-F]+)"/>', defs).groups()
    rects = re.findall(r'<rect class="([^"]+)" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="(\d+)" style="([^"]*)"/>', s)
    vars_ = lambda st: dict(re.findall(r'--([a-z]):(-?[\d.]+)', st))
    body = []
    for cls, x, y, w, h, rx, st in rects:
        c = cls.split(); v = vars_(st)
        geo = f'x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"'
        if 'e' in c:
            if not animated or 'e0' in c:
                body.append(f'<rect {geo} fill="{eye}"/>'); continue
            body.append(f'<rect {geo} fill="{eye}"><animate attributeName="opacity" values="1;1;0;0;1;1;0;0;1;1" keyTimes="0;.58;.6;.64;.66;.7;.72;.76;.78;1" dur="{f(6)}s" begin="{f(v.get("s","0"))}s" repeatCount="indefinite"/></rect>')
            continue
        col = colors[[k for k in c if k.startswith('b')][0]]
        if not animated:
            body.append(f'<rect {geo} fill="{col}"/>'); continue
        anim = f'<animate attributeName="fill" values="{col};{hl};{col};{col}" keyTimes="0;.03;.09;1" dur="{f(7)}s" begin="{f(v.get("s","0"))}s" repeatCount="indefinite"/>'
        if 'k' in c:
            anim += f'<animate attributeName="opacity" values="1;1;.1;.85;.15;1;1" keyTimes="0;.88;.9;.93;.95;.97;1" dur="{f(v.get("u","5"))}s" begin="{f(v.get("v","0"))}s" repeatCount="indefinite"/>'
        body.append(f'<rect {geo} fill="{col}">{anim}</rect>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="NasrinAI Code">'
            f'<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg[0]}"/><stop offset="1" stop-color="{bg[1]}"/></linearGradient></defs>'
            '<rect width="1024" height="1024" rx="224" fill="url(#bg)"/><g>' + ''.join(body) + '</g></svg>\n')
# Light UI: dark robot on a light tile (owner's "dark" file); dark UI: the "light" file.
for name, file in [('light', 'pixel-bot-logo-dark.svg'), ('dark', 'pixel-bot-logo-light.svg')]:
    open(f'{out}/code-bot-{name}.svg', 'w').write(convert(f'{src}/{file}', True))
    open(f'{out}/code-bot-{name}-still.svg', 'w').write(convert(f'{src}/{file}', False))
    # While Nasrin is working (thinking, remembering, reading…): the same robot, about 4x faster.
    open(f'{out}/code-bot-{name}-busy.svg', 'w').write(convert(f'{src}/{file}', True, speed=4.2))
