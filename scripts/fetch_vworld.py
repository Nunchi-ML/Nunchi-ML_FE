"""달구벌대로 양옆 건물을 브이월드(공간정보 오픈플랫폼) 도로명주소건물 데이터로 받아 게임용으로 저장.

실행:  python scripts/fetch_vworld.py      (repos/FE 에서, .env.local 에 VWORLD_KEY 필요)
결과:  src/data/dalgu_buildings.json  (OSM 버전을 덮어씀 — 이전 것은 git 에 있음)

- 윤곽 · 지상 층수: 브이월드 LT_C_SPBD (실제 층수라 OSM 추정 높이보다 정확)
- 용도(아파트 · 상가 · 사무실 · 학교): 기존 OSM 건물과 겹치면 그 값, 아니면 건물 이름으로 추정
- iM뱅크 본점은 따로 그리므로 겹치는 건물은 뺌
"""
import argparse, json, math, re, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEY = next(l.split('=', 1)[1].strip() for l in (ROOT / '.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('VWORLD_KEY='))
parser = argparse.ArgumentParser(description='Fetch actual building footprints and above-ground floors')
parser.add_argument('--road', choices=('dalgu', 'sincheon'), default='dalgu')
args = parser.parse_args()
ROAD = json.loads((ROOT / f'src/data/{args.road}.json').read_text(encoding='utf-8'))
OUT = ROOT / f'src/data/{args.road}_buildings.json'
OLD = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'b': [], 'bank': None}
CACHE = Path(__file__).resolve().parent / ('.vworld_cache.json' if args.road == 'dalgu' else '.vworld_cache_sincheon.json')

LAT0, LON0 = 35.866, 128.59
KLAT, KLON = 110940, 111320 * math.cos(math.radians(LAT0))
def xz(lon, lat): return (lon - LON0) * KLON, -(lat - LAT0) * KLAT
PXZ = [xz(lon, lat) for lon, lat in ROAD['poly']]
BUF = 300                                                          # 도로 중심선에서 양옆 (m)

def dist_road(x, z):
    b = 1e9
    for (ax, az), (bx, bz) in zip(PXZ, PXZ[1:]):
        dx, dz = bx - ax, bz - az; L = dx * dx + dz * dz or 1e-9
        t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / L)); b = min(b, math.hypot(x - ax - dx * t, z - az - dz * t))
    return b

def boxes():
    """도로를 따라 약 500 m 칸 (양옆 BUF 포함) — 경도/위도 상자"""
    out, step = [], 500
    cum = [0.0]
    for (ax, az), (bx, bz) in zip(PXZ, PXZ[1:]): cum.append(cum[-1] + math.hypot(bx - ax, bz - az))
    s = 0.0
    while s < cum[-1]:
        def point_at(target):
            target = min(cum[-1], max(0, target))
            i = next((i for i in range(len(cum) - 1) if cum[i + 1] >= target), len(cum) - 2)
            t = (target - cum[i]) / max(1e-9, cum[i + 1] - cum[i])
            return tuple(PXZ[i][k] + (PXZ[i + 1][k] - PXZ[i][k]) * t for k in (0, 1))
        pts = [point_at(s), point_at(s + step)] + [p for p, c in zip(PXZ, cum) if s <= c <= s + step]
        xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
        x0, x1, z0, z1 = min(xs) - BUF, max(xs) + BUF, min(zs) - BUF, max(zs) + BUF
        out.append((LON0 + x0 / KLON, LAT0 - z1 / KLAT, LON0 + x1 / KLON, LAT0 - z0 / KLAT)); s += step
    return out

def get(box, page):
    q = urllib.parse.urlencode({'service': 'data', 'version': '2.0', 'request': 'GetFeature', 'data': 'LT_C_SPBD', 'key': KEY,
                                'domain': 'http://localhost:4501', 'geomFilter': 'BOX(%.6f,%.6f,%.6f,%.6f)' % box, 'size': 1000, 'page': page,
                                'format': 'json', 'crs': 'EPSG:4326', 'geometry': 'true', 'attribute': 'true'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen('https://api.vworld.kr/req/data?' + q, timeout=60) as r: res = json.load(r)['response']
            if res['status'] == 'NOT_FOUND': return [], 1
            if res['status'] != 'OK': raise RuntimeError(res.get('error', {}).get('text', res['status']))
            return res['result']['featureCollection']['features'], int(res['page']['total'])
        except Exception as e:
            # HTTP exception URLs contain the API key. Never print them.
            print('  재시도:', type(e).__name__, flush=True); time.sleep(3 + attempt * 5)
    raise SystemExit('브이월드 응답 없음 — 다시 실행하면 받은 칸부터 이어서 함')

def fetch():
    st = json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.exists() else {'done': [], 'f': {}}
    bx = boxes()
    for i, box in enumerate(bx):
        if i in st['done']: continue
        page = 1
        while True:
            feats, total = get(box, page)
            for f in feats: st['f'][f['properties']['bd_mgt_sn']] = {'g': f['geometry'], 'fl': f['properties'].get('gro_flo_co'), 'nm': f['properties'].get('buld_nm', '')}
            if page >= total: break
            page += 1; time.sleep(0.3)
        st['done'].append(i); CACHE.write_text(json.dumps(st, ensure_ascii=False), encoding='utf-8')
        print(f'  칸 {i + 1}/{len(bx)} · 누적 {len(st["f"])}동', flush=True); time.sleep(0.3)
    return st['f']

def centroid(p):
    xs, zs = p[0::2], p[1::2]; return sum(xs) / len(xs), sum(zs) / len(zs)

def inside(x, z, p):
    c, n = False, len(p) // 2
    for i in range(n):
        ax, az, bx, bz = p[2 * i], p[2 * i + 1], p[2 * ((i + 1) % n)], p[2 * ((i + 1) % n) + 1]
        if (az > z) != (bz > z) and x < (bx - ax) * (z - az) / (bz - az) + ax: c = not c
    return c

def main():
    feats = fetch()
    # 기존 OSM 건물 용도: 칸(50 m)별로 찾기 쉽게
    grid = {}
    for b in OLD['b']:
        cx, cz = centroid(b['p']); grid.setdefault((int(cx // 50), int(cz // 50)), []).append((cx, cz, b['k']))
    bank = OLD.get('bank'); bankP = [c for pt in bank['pts'] for c in pt] if bank else None
    out = []
    for f in feats.values():
        g = f['g']; rings = g['coordinates'][0] if g['type'] == 'MultiPolygon' else g['coordinates']
        ring = rings[0]
        p = []
        for lon, lat in ring[:-1] if ring[0] == ring[-1] else ring:
            x, z = xz(lon, lat); p += [round(x, 1), round(z, 1)]
        if len(p) < 6: continue
        cx, cz = centroid(p)
        area = abs(sum(p[2 * i] * p[(2 * i + 3) % len(p)] - p[(2 * i + 2) % len(p)] * p[2 * i + 1] for i in range(len(p) // 2))) / 2
        d = dist_road(cx, cz)
        if area < 25 or d > BUF: continue                                  # 창고 · 부속 건물 같은 아주 작은 것 · 범위 밖은 뺌
        if bankP and inside(cx, cz, bankP): continue
        try: fl = max(1, int(f['fl'] or 1))
        except ValueError: fl = 1
        nm = f['nm'] or ''
        k = 0
        for gx in range(int(cx // 50) - 1, int(cx // 50) + 2):
            for gz in range(int(cz // 50) - 1, int(cz // 50) + 2):
                for ox, oz, ok in grid.get((gx, gz), []):
                    if inside(ox, oz, p): k = ok
        if '아파트' in nm or ('동' in nm[-2:] and fl >= 10): k = 1
        elif '학교' in nm: k = 4
        elif any(w in nm for w in ('빌딩', '타워', '센터', '오피스')): k = k or 3
        elif k == 0 and fl >= 12: k = 1                                  # 용도 모르는 12층 이상은 대구에선 대부분 아파트
        h = round(fl * (3.0 if k == 1 else 3.4) + (1.2 if k in (2, 3) else 0.4), 1)   # 상가 · 사무실은 1층이 높음
        item = {'p': p, 'h': h, 'k': k, 'f': fl, 'd': round(d)}           # d: 도로 중심선까지 (1층 상가를 길가에만)
        name = re.sub(r'\s*\(.*?\)\s*', '', nm).strip()                   # 실제 건물 이름 (간판용) — "(A동)" 같은 꼬리 · 흔한 시설 이름은 뺌
        if name and not re.fullmatch(r'[\d\-]+동?', name) and not any(w in name for w in ('주차장', '경로당', '노인정', '회관', '창고', '화장실', '관리', '경비', '초소', '기계실', '변전', '펌프')):
            item['n'] = name
        out.append(item)
    note = '건물: 브이월드 공간정보 오픈플랫폼 도로명주소건물(윤곽 · 지상 층수), 용도는 OpenStreetMap(© OpenStreetMap contributors, ODbL) 참고'
    OUT.write_text(json.dumps({'_note': note, 'road': args.road, 'heightNote': '높이는 실제 지상 층수 × 용도별 가정 층고로 추정', 'b': out, 'bank': bank}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    hs = sorted(b['f'] for b in out)
    print(f'{len(out)}동 저장 · 층수 중간 {hs[len(hs) // 2]} · 최고 {hs[-1]}층 · {OUT.stat().st_size // 1024} KB')

if __name__ == '__main__':
    main()
