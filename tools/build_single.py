#!/usr/bin/env python3
"""Gera o MiniBlender em UM arquivo HTML (abre direto no celular, sem servidor).

Embute os scripts (vendor/ e js/) no HTML e os demais arquivos (corpo humano,
texturas de pele, SDK da Anthropic, plugin de exemplo) como data: URLs em MB_ASSETS.
Uso: python3 tools/build_single.py [saida.html]
"""
import base64, os, re, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'dist', 'MiniBlender.html')
html = open(os.path.join(root, 'index.html'), encoding='utf-8').read()

def inline(m):
    code = open(os.path.join(root, m.group(1)), encoding='utf-8').read()
    # '</script' dentro do código fecharia a tag
    return '<script>/* ' + m.group(1) + ' */\n' + code.replace('</script', '<\\/script') + '\n</script>'
html, n = re.subn(r'<script src="([^"]+)"></script>', inline, html)

MIME = {'.gz': 'application/octet-stream', '.jpg': 'image/jpeg', '.mjs': 'text/javascript', '.js': 'text/javascript'}
assets = ['assets/human.bin.gz', 'assets/skin_f.jpg', 'assets/skin_m.jpg', 'assets/skin_f_suit.jpg', 'assets/skin_m_suit.jpg',
          'vendor/anthropic-sdk.mjs', 'plugins/exemplo-escada.js']
entries = []
for a in assets:
    data = open(os.path.join(root, a), 'rb').read()
    entries.append('%r:"data:%s;base64,%s"' % (a, MIME[os.path.splitext(a)[1]], base64.b64encode(data).decode()))
html = html.replace('<head>', '<head>\n<script>window.MB_ASSETS={' + ','.join(entries) + '};</script>', 1)
# ícone e manifesto são arquivos separados; no arquivo único ficam de fora
html = re.sub(r'<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?', '', html)
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8').write(html)
print('%s: %d scripts embutidos, %d arquivos, %.1f MB' % (out, n, len(assets), os.path.getsize(out) / 1e6))
