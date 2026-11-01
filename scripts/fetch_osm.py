"""달구벌대로 주변 거리 시설물을 OpenStreetMap(Overpass)에서 받아 게임 좌표로 저장.

실행:  python scripts/fetch_osm.py      (repos/FE 에서)
결과:  src/data/dalgu_osm.json

게임 좌표는 road.ts 와 같음: 기준점(35.866, 128.59)에서 m 단위, x = 동쪽, z = 남쪽.
"""
import json, math, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROAD = json.loads((ROOT / 'src/data/dalgu.json').read_text(encoding='utf-8'))
OUT = ROOT / 'src/data/dalgu_osm.json'

LAT0, LON0 = 35.866, 128.59
KLAT, KLON = 110940, 111320 * math.cos(math.radians(LAT0))
def xz(lon, lat): return round((lon - LON0) * KLON, 2), round(-(lat - LAT0) * KLAT, 2)

POLY = ROAD['poly']                                         # [lon, lat]
PXZ = [xz(lon, lat) for lon, lat in POLY]

def near_road(x, z):
    """도로 중심선까지 거리(m)와 중심선 위 누적 거리 s(m), 진행 방향 기준 좌(+)/우(-) 부호"""
    best, cum = (1e9, 0.0, 0), 0.0
    for (ax, az), (bx, bz) in zip(PXZ, PXZ[1:]):
        dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz or 1e-9
        t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / L2))
        px, pz = ax + dx * t, az + dz * t; d = math.hypot(x - px, z - pz)
        if d < best[0]:
            side = 1 if (dx * (z - az) - dz * (x - ax)) > 0 else -1
            best = (d, cum + math.sqrt(L2) * t, side)
        cum += math.sqrt(L2)
    return best

QT = """
[out:json][timeout:120];
(
  node["highway"="traffic_signals"](around:40,{LINE});
  node["highway"="crossing"](around:40,{LINE});
  way["footway"="crossing"](around:40,{LINE});
  node["highway"="bus_stop"](around:45,{LINE});
  node["public_transport"="platform"]["bus"="yes"](around:45,{LINE});
  node["railway"="subway_entrance"](around:90,{LINE});
  node["highway"="street_lamp"](around:45,{LINE});
  node["natural"="tree"](around:45,{LINE});
  way["natural"="tree_row"](around:45,{LINE});
  nwr["tourism"="artwork"](around:150,{LINE});
  nwr["historic"~"memorial|monument"](around:150,{LINE});
  way["highway"~"^(trunk|primary|secondary|tertiary|residential|unclassified)$"](around:15,{LINE});
);
out geom tags;
"""

def fetch_one(q, tries=3):
    body = urllib.parse.urlencode({'data': q}).encode()
    for attempt in range(tries):
        for url in ('https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'):
            try:
                req = urllib.request.Request(url, data=body, headers={'User-Agent': 'nunchi-drive/1.0 (education project)'})
                with urllib.request.urlopen(req, timeout=150) as r: return json.load(r)['elements']
            except Exception as e:
                print('  재시도:', url.split('/')[2], e, flush=True); time.sleep(5 + attempt * 10)
    return None

def fetch_part(part):
    """한 구간을 받음. 계속 실패하면 반으로 나눠 다시 (서버가 무거운 구간을 버거워함)"""
    line = ','.join(f'{lat:.6f},{lon:.6f}' for lon, lat in part)   # Overpass around: lat,lon 순서
    got = fetch_one(QT.replace('{LINE}', line))
    if got is not None: return got
    if len(part) <= 3: raise SystemExit('Overpass 응답 없음 — 잠시 뒤 다시 실행하면 받은 데까지 이어서 함')
    m = len(part) // 2
    return fetch_part(part[:m + 1]) + fetch_part(part[m:])

CACHE = Path(__file__).resolve().parent / '.osm_cache.json'   # 서버 응답 저장 (다시 가공할 때 안 받아도 됨)

def fetch():
    """선 전체를 한 번에 물으면 서버가 버거워해서 25점씩 끊어 물음 (끝점 겹침)"""
    if CACHE.exists(): return json.loads(CACHE.read_text(encoding='utf-8'))
    partial = CACHE.with_suffix('.part.json')                      # 구간마다 저장 → 중간에 끊겨도 이어서
    st = json.loads(partial.read_text(encoding='utf-8')) if partial.exists() else {'done': [], 'els': []}
    els = {(e['type'], e['id']): e for e in st['els']}; n = 25
    for i in range(0, len(POLY) - 1, n):
        if i in st['done']: continue
        for e in fetch_part(POLY[i:i + n + 1]): els[(e['type'], e['id'])] = e
        st['done'].append(i); st['els'] = list(els.values())
        partial.write_text(json.dumps(st, ensure_ascii=False), encoding='utf-8')
        print(f'  {min(i + n, len(POLY) - 1)}/{len(POLY) - 1} 점 · 누적 {len(els)}개', flush=True); time.sleep(1.5)
    CACHE.write_text(json.dumps(list(els.values()), ensure_ascii=False), encoding='utf-8'); partial.unlink()
    return list(els.values())

HALF = 15.0                                                        # 달구벌대로 반폭 (게임 ROAD_W / 2)
RANK = {'trunk': 5, 'primary': 4, 'secondary': 3, 'tertiary': 2, 'residential': 1, 'unclassified': 1}

def arms_of(g):
    """옆길 한 줄 → 달구벌대로 가장자리에서 바깥으로 뻗는 팔들 (최대 150 m). 사거리가 아니면 None"""
    ds = [near_road(x, z) for x, z in g]
    near = [i for i, d in enumerate(ds) if d[0] < 20]
    if not near or len(near) > 3 or max(d[0] for d in ds) < 35: return None   # 안 닿거나 · 나란히 달리는 길이면 제외
    k = min(near, key=lambda i: ds[i][0])
    arms = []
    for seq in (range(k, len(g)), range(k, -1, -1)):
        idx = list(seq); line, cum = [], 0.0
        for a, b in zip(idx, idx[1:]):
            (ax, az), (bx, bz) = g[a], g[b]; da, db = ds[a][0], ds[b][0]
            if db < HALF: continue
            if not line:                                           # 가장자리에서 시작
                t = 0.0 if da >= HALF else (HALF - da) / max(1e-6, db - da)
                line.append((ax + (bx - ax) * t, az + (bz - az) * t))
            cum += math.hypot(bx - line[-1][0], bz - line[-1][1]); line.append((bx, bz))
            if cum > 150: break
        if len(line) >= 2 and math.hypot(line[-1][0] - line[0][0], line[-1][1] - line[0][1]) > 12:
            arms.append([[round(x, 1), round(z, 1)] for x, z in line])
    return (ds[k][1], arms) if arms else None

def kind(t):
    if t.get('highway') == 'traffic_signals': return 'signal'
    if t.get('highway') == 'crossing' or t.get('footway') == 'crossing': return 'crossing'
    if t.get('highway') == 'bus_stop' or (t.get('public_transport') == 'platform' and t.get('bus') == 'yes'): return 'bus_stop'
    if t.get('railway') == 'subway_entrance': return 'subway'
    if t.get('highway') == 'street_lamp': return 'lamp'
    if t.get('natural') in ('tree', 'tree_row'): return 'tree'
    if t.get('tourism') == 'artwork' or t.get('historic') in ('memorial', 'monument'): return 'artwork'
    if 'highway' in t: return 'road'
    return None

def seg_x(a, b, c, d):
    """선분 ab 와 cd 의 교점 (없으면 None)"""
    r = (b[0] - a[0], b[1] - a[1]); s = (d[0] - c[0], d[1] - c[1]); den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-9: return None
    t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den; u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
    return (a[0] + t * r[0], a[1] + t * r[1]) if 0 <= t <= 1 and 0 <= u <= 1 else None

def main():
    data = fetch()
    out = {k: [] for k in ('signal', 'crossing', 'bus_stop', 'subway', 'lamp', 'tree', 'artwork', 'junction')}
    seen = set()
    for e in data:
        t = e.get('tags', {}); k = kind(t)
        if not k or (e['type'], e['id']) in seen: continue
        seen.add((e['type'], e['id']))
        if k == 'road':                                                   # 달구벌대로와 만나는 옆길 → 사거리
            name = t.get('name', '')
            if '달구벌대로' in name: continue
            r = arms_of([xz(p['lon'], p['lat']) for p in e.get('geometry', [])])
            if r: out['junction'].append({'s': round(r[0], 1), 'name': name, 'hw': t.get('highway'), 'lanes': t.get('lanes'), 'arms': r[1]})
            continue
        if e['type'] == 'node': pts = [(e['lon'], e['lat'])]
        elif k == 'tree':  pts = [(p['lon'], p['lat']) for p in e.get('geometry', [])]          # 가로수 줄 → 꼭짓점마다 한 그루
        else:
            gs = e.get('geometry') or []
            if not gs and 'center' not in e: continue
            pts = [(sum(p['lon'] for p in gs) / len(gs), sum(p['lat'] for p in gs) / len(gs))] if gs else [(e['center']['lon'], e['center']['lat'])]
        for lon, lat in pts:
            x, z = xz(lon, lat); d, s, side = near_road(x, z)
            item = {'x': x, 'z': z, 's': round(s, 1), 'off': round(d * side, 1)}
            if t.get('name'): item['name'] = t['name']
            if k == 'bus_stop' and t.get('shelter'): item['shelter'] = t['shelter']
            out[k].append(item)
    # 한 사거리에 길 여러 줄이 걸리면 (양쪽 · 쪼개진 길) 30 m 안은 하나로 합치고 팔을 모음. 등급은 가장 큰 길 기준
    js = sorted(out['junction'], key=lambda j: j['s']); merged = []
    for j in js:
        m = merged[-1] if merged else None
        if m and j['s'] - m['s'] < 30:
            m['arms'] += j['arms']
            if RANK.get(j['hw'], 0) > RANK.get(m['hw'], 0): m.update(hw=j['hw'], lanes=j['lanes'], name=j['name'] or m['name'])
            elif not m['name']: m['name'] = j['name']
            continue
        merged.append(j)
    out['junction'] = merged
    for k in out: out[k].sort(key=lambda i: i['s'])
    OUT.write_text(json.dumps({'source': 'OpenStreetMap contributors (ODbL)', **out}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print({k: len(v) for k, v in out.items()}, '→', OUT.name, f'{OUT.stat().st_size // 1024} KB')

if __name__ == '__main__':
    main()
