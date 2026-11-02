"""사거리 옆길마다 '그쪽으로 가면 나오는 동네(법정동)'를 브이월드 주소 찾기(좌표 → 주소)로 받아 넣음.
도로 안내 표지의 좌 · 우 행선지에 씀 (실제 표지처럼 '← 범어동 · 만촌동 →').

실행:  python scripts/fetch_osm.py && python scripts/fetch_arm_places.py   (repos/FE 에서, .env.local 에 VWORLD_KEY)
결과:  src/data/dalgu_osm.json 의 junction 마다 'to': [팔별 동 이름]
"""
import json, math, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEY = next(l.split('=', 1)[1].strip() for l in (ROOT / '.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('VWORLD_KEY='))
OSM = ROOT / 'src/data/dalgu_osm.json'
CACHE = Path(__file__).resolve().parent / '.vworld_addr_cache.json'
LAT0, LON0 = 35.866, 128.59
KLAT, KLON = 110940, 111320 * math.cos(math.radians(LAT0))
BIG = {'trunk', 'primary', 'secondary', 'tertiary'}

def dong(x, z, cache):
    lon, lat = LON0 + x / KLON, LAT0 - z / KLAT
    k = f'{lon:.5f},{lat:.5f}'
    if k in cache: return cache[k]
    q = urllib.parse.urlencode({'service': 'address', 'request': 'getAddress', 'version': '2.0', 'crs': 'epsg:4326', 'point': k,
                                'format': 'json', 'type': 'parcel', 'zipcode': 'false', 'simple': 'false', 'key': KEY, 'domain': 'http://localhost:4501'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen('https://api.vworld.kr/req/address?' + q, timeout=30) as r: res = json.load(r)['response']
            name = res['result'][0]['structure']['level4L'] if res['status'] == 'OK' else ''
            cache[k] = name; return name
        except Exception as e:
            print('  재시도:', e, flush=True); time.sleep(2 + attempt * 3)
    return ''

def main():
    d = json.loads(OSM.read_text(encoding='utf-8'))
    cache = json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.exists() else {}
    n = 0
    for j in d['junction']:
        if j['hw'] not in BIG: continue
        to = []
        for arm in j['arms']:                                                  # 팔 방향으로 700 m 나간 곳의 동 (바로 옆은 대로 양쪽이 같은 동인 경우가 많음)
            (ax, az), (bx, bz) = arm[0], arm[-1]; L = math.hypot(bx - ax, bz - az) or 1
            to.append(dong(ax + (bx - ax) / L * 700, az + (bz - az) / L * 700, cache))
        j['to'] = to
        n += 1
        if n % 10 == 0: CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding='utf-8'); print(f'  사거리 {n}곳', flush=True)
        time.sleep(0.1)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding='utf-8')
    OSM.write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'사거리 {n}곳 행선지 저장 · 예: ' + ', '.join(f"{j['name'] or '?'}→{'/'.join(j['to'])}" for j in d['junction'] if j.get('to'))[:200])

if __name__ == '__main__':
    main()
