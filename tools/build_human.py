#!/usr/bin/env python3
"""Empacota a malha humana do MakeHuman (CC0) para o MiniBlender.

Entrada (assets oficiais do MakeHuman, licença CC0 — www.makehumancommunity.org):
  --base   human_full_size.json  (malha base hm08 + UVs; pacote npm makehuman-data)
  --targets targets.npz          (morphs; pacote PyPI makehuman)
  --skins  pasta com as texturas de pele
Saída: assets/human.bin (malha, UVs, morphs quantizados, juntas) e assets/skin_*.jpg

Uso: python3 -I tools/build_human.py --base ... --targets ... --skins ... --out assets
"""
import argparse, json, struct, os
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--base', required=True); ap.add_argument('--targets', required=True)
ap.add_argument('--skins', required=True); ap.add_argument('--out', default='assets')
A = ap.parse_args()

d = json.load(open(A.base))
V = np.array(d['vertices'], dtype=np.float64).reshape(-1, 3)
UV = np.array(d['uvs'][0], dtype=np.float64).reshape(-1, 2)
mats = [m['DbgName'] for m in d['materials']]
jidx = d['metadata']['joint_pos_idxs']

# --- faces (formato three.js JSON v3: bits do tipo) ---
F = d['faces']; i = 0; faces = []
while i < len(F):
    t = F[i]; i += 1
    n = 4 if t & 1 else 3
    vs = F[i:i + n]; i += n
    mat = None
    if t & 2: mat = F[i]; i += 1
    if t & 4: i += 1
    uvs = None
    if t & 8: uvs = F[i:i + n]; i += n
    if t & 16: i += 1
    if t & 32: i += n
    if t & 64: i += 1
    if t & 128: i += n
    faces.append((vs, mat, uvs))
KEEP = {'body': 0, 'helper-r-eye': 1, 'helper-l-eye': 2}
sel = [(vs, KEEP[mats[m]], uv) for vs, m, uv in faces if mats[m] in KEEP]
assert all(len(vs) == 4 for vs, _, _ in sel), 'esperava só quads'
hair = sorted({v for vs, m, _ in faces if mats[m] == 'helper-hair' for v in vs})

# --- conjunto de vértices: renderizados primeiro, depois os cubos de junta ---
order = []; seen = {}
for vs, _, _ in sel:
    for v in vs:
        if v not in seen: seen[v] = len(order); order.append(v)
nR = len(order)
S = {'E': 'R', 'D': 'L'}  # no app, _E fica em x<0 (lado direito do personagem do MakeHuman)
JOINTS = [('Pelvis', 'spine05____head'), ('Coluna', 'spine03____head'), ('Peito', 'spine02____head'),
          ('Pescoco', 'neck01____head'), ('Cabeca', 'head____head'), ('Cabeca_tail', 'head____tail')]
for s in 'ED':
    m = S[s]
    JOINTS += [('Braco_' + s, f'upperarm01.{m}____head'), ('Antebraco_' + s, f'lowerarm01.{m}____head'),
               ('Mao_' + s, f'wrist.{m}____head'), ('Mao_' + s + '_tail', f'finger3-3.{m}____tail'),
               ('Coxa_' + s, f'upperleg01.{m}____head'), ('Canela_' + s, f'lowerleg01.{m}____head'),
               ('Pe_' + s, f'foot.{m}____head'), ('Pe_' + s + '_tail', f'toe3-3.{m}____tail'),
               ('Olho_' + s, f'eye.{m}____head')]
joints = {}
for name, key in JOINTS:
    ids = []
    for v in jidx[key]:
        if v not in seen: seen[v] = len(order); order.append(v)
        ids.append(seen[v])
    joints[name] = ids
order = np.array(order); nT = len(order)
remap = np.full(len(V), -1, dtype=np.int64); remap[order] = np.arange(nT)
SC = 0.1  # decímetros -> metros
P = V[order] * SC

quads = np.array([[seen[v] for v in vs] for vs, _, _ in sel], dtype=np.uint16)
fmat = np.array([m for _, m, _ in sel], dtype=np.uint8)
fuv = np.array([[UV[u] for u in uv] for _, _, uv in sel])  # (nF,4,2), v para cima

# --- UV dos olhos: realoca para um quadrado vazio do atlas do corpo ---
R = 256; occ = np.zeros((R, R), bool)
for q in fuv[fmat == 0]:
    x0, y0 = np.floor(q.min(0) * R).astype(int); x1, y1 = np.ceil(q.max(0) * R).astype(int)
    occ[max(0, y0 - 1):y1 + 1, max(0, x0 - 1):x1 + 1] = True
best = None
for size in range(40, 6, -2):
    for y in range(0, R - size, 2):
        for x in range(0, R - size, 2):
            if not occ[y:y + size, x:x + size].any(): best = (x, y, size); break
        if best: break
    if best: break
ex, ey, es = [b / R for b in best]
for m in (1, 2):
    q = fuv[fmat == m]; lo = q.reshape(-1, 2).min(0); hi = q.reshape(-1, 2).max(0)
    fuv[fmat == m] = (q - lo) / (hi - lo) * es * 0.96 + np.array([ex, ey]) + es * 0.02
eye_rect = [ex, 1 - ey - es, es, es]  # no app o v é invertido (flipY=false)
fuv_app = fuv.copy(); fuv_app[..., 1] = 1 - fuv_app[..., 1]
uv16 = np.clip(np.round(fuv_app * 65535), 0, 65535).astype(np.uint16)

# --- couro cabeludo: vértices do corpo junto do "capacete" helper-hair ---
flags = np.zeros(nR, np.uint8)
HP = V[hair]
body_idx = np.unique(quads[fmat == 0]); BP = V[order[body_idx]]
for a in range(0, len(BP), 500):
    dd = np.sqrt(((BP[a:a + 500, None, :] - HP[None]) ** 2).sum(-1)).min(1)
    flags[body_idx[a:a + 500][dd < 0.16]] |= 1
flags[np.unique(quads[fmat == 1])] |= 2; flags[np.unique(quads[fmat == 2])] |= 4

# --- morphs ---
Z = np.load(A.targets, allow_pickle=False)
def target(name):
    idx = Z[f'targets/{name}.index']; vec = Z[f'targets/{name}.vector'].astype(np.float64) * 1e-3 * SC
    out = np.zeros((nT, 3)); r = remap[idx]; ok = r >= 0; out[r[ok]] = vec[ok]; return out
macro = []
for g in ('female', 'male'):
    for age in ('child', 'young', 'old'):
        for mu in ('minmuscle', 'averagemuscle', 'maxmuscle'):
            for wt in ('minweight', 'averageweight', 'maxweight'):
                macro.append(f'macrodetails/universal-{g}-{age}-{mu}-{wt}')
        for race in ('caucasian', 'asian', 'african'):
            macro.append(f'macrodetails/{race}-{g}-{age}')
DETAIL = ['measure/measure-bust-circ', 'measure/measure-underbust-circ', 'measure/measure-waist-circ', 'measure/measure-hips-circ',
          'measure/measure-shoulder-dist', 'measure/measure-neck-circ', 'measure/measure-neck-height', 'measure/measure-upperarm-circ',
          'measure/measure-upperarm-length', 'measure/measure-lowerarm-length', 'measure/measure-thigh-circ', 'measure/measure-calf-circ',
          'measure/measure-upperleg-height', 'measure/measure-lowerleg-height', 'measure/measure-napetowaist-dist',
          'torso/torso-vshape', 'torso/torso-muscle-pectoral', 'torso/torso-muscle-dorsi', 'stomach/stomach-tone', 'stomach/stomach-pregnant',
          'buttocks/buttocks-volume']
detail = []
for base in DETAIL:
    for suf in ('decr', 'incr'):
        detail.append((base.split('/')[1] + '-' + suf, f'{base}-{suf}'))
for cup in ('mincup', 'maxcup'):
    detail.append(('breast-' + cup, f'breast/female-young-averagemuscle-averageweight-{cup}-averagefirmness'))

# --- escreve o binário: [u32 tamanho do cabeçalho][JSON][buffers alinhados em 4 bytes] ---
bufs = []; meta = {}
def add(name, arr):
    arr = np.ascontiguousarray(arr); off = sum(len(b) for b in bufs)
    # int16/uint16: grava bytes baixos e altos em planos separados ("shuffle") — o gzip comprime bem melhor.
    sh = arr.dtype.itemsize == 2
    raw = arr.reshape(-1).view(np.uint8).reshape(-1, 2).T.tobytes() if sh else arr.tobytes()
    raw += b'\0' * ((4 - len(raw) % 4) % 4); bufs.append(raw)
    meta[name] = {'o': off, 't': str(arr.dtype), 'n': int(arr.size), 'sh': int(sh)}
add('pos', P.astype(np.float32)); add('quads', quads); add('fmat', fmat); add('uv', uv16); add('flags', flags)
# Morphs macro densos: int8 quando o deslocamento máximo é pequeno (passo <= 0,1 mm), senão int16.
mmeta = []
for full in macro:
    t = target(full); mx = float(np.abs(t).max()); short = full.split('/')[1]
    if mx < 1e-9: mmeta.append({'name': short, 'scale': 0, 'bits': 0}); continue
    bits = 8 if mx <= 0.0127 else 16; q = 127.0 if bits == 8 else 32767.0
    add('m_' + short, np.round(t / (mx / q)).astype(np.int8 if bits == 8 else np.int16)); mmeta.append({'name': short, 'scale': mx / q, 'bits': bits})
dmeta = []
for short, full in detail:
    t = target(full); nz = np.where(np.abs(t).max(1) > 1e-6)[0]; sc = max(np.abs(t).max() / 32767.0, 1e-12)
    add('d_i_' + short, nz.astype(np.uint16)); add('d_v_' + short, np.round(t[nz] / sc).astype(np.int16)); dmeta.append({'name': short, 'scale': float(sc), 'count': int(len(nz))})
header = {'version': 1, 'source': 'MakeHuman (www.makehumancommunity.org) — malha base hm08 e morphs, licença CC0', 'nR': nR, 'nT': nT, 'nF': len(quads),
          'macro': mmeta, 'detail': dmeta, 'joints': joints, 'eyeRect': eye_rect, 'arrays': meta}
hj = json.dumps(header, separators=(',', ':')).encode(); hj += b' ' * ((4 - len(hj) % 4) % 4)
os.makedirs(A.out, exist_ok=True)
import gzip
blob = struct.pack('<I', len(hj)) + hj + b''.join(bufs)
with open(os.path.join(A.out, 'human.bin.gz'), 'wb') as f:
    with gzip.GzipFile(fileobj=f, mode='wb', compresslevel=9, mtime=0) as g: g.write(blob)
print(f'human.bin.gz: {nR} vértices visíveis (+{nT - nR} de juntas), {len(quads)} quads, {len(blob) / 1e6:.2f} MB -> {os.path.getsize(os.path.join(A.out, "human.bin.gz")) / 1e6:.2f} MB')

# --- texturas de pele ---
from PIL import Image
SK = {'skin_f_suit': 'young_caucasian_female/textures/young_caucasian_female_special_suit.png', 'skin_m_suit': 'young_caucasian_male/textures/young_caucasian_male_special_suit.png',
      'skin_f': 'young_caucasian_female/textures/young_lightskinned_female_diffuse.png', 'skin_m': 'young_caucasian_male/textures/young_lightskinned_male_diffuse.png'}
for out, src in SK.items():
    Image.open(os.path.join(A.skins, src)).convert('RGB').save(os.path.join(A.out, out + '.jpg'), quality=88)
    print(out + '.jpg', os.path.getsize(os.path.join(A.out, out + '.jpg')) // 1024, 'KB')
