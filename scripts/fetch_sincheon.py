"""Build the Sincheon route from OSM map API source geometry (no hand-drawn points).

Run from FE: python scripts/fetch_sincheon.py
Raw map tiles are cached for resumable, reproducible collection. Buildings are
fetched separately with fetch_vworld.py --road sincheon.
"""
import concurrent.futures
import datetime
import heapq
import json
import math
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'scripts/.sincheon_cache'
LAT0, LON0 = 35.866, 128.59
KLAT, KLON = 110940, 111320 * math.cos(math.radians(LAT0))

def xz(p): return ((p[0] - LON0) * KLON, -(p[1] - LAT0) * KLAT)
def distance(a, b): return math.dist(xz(a), xz(b))

def tile(box):
    path = CACHE / ('_'.join(f'{n:.3f}' for n in box) + '.osm')
    if not path.exists():
        url = 'https://api.openstreetmap.org/api/0.6/map?bbox=' + ','.join(map(str, box))
        with urllib.request.urlopen(url, timeout=60) as response: raw = response.read()
        ET.fromstring(raw)  # never cache incomplete responses
        path.write_bytes(raw)
    print('OSM tile', path.name, flush=True)
    return ET.fromstring(path.read_bytes())

def main():
    CACHE.mkdir(exist_ok=True)
    boxes = [(128.595, round(35.81 + i * .02, 3), 128.625, round(35.83 + i * .02, 3)) for i in range(5)]
    boxes += [(round(128.51 + i * .02, 3), 35.885, round(128.53 + i * .02, 3), 35.925) for i in range(5)]
    nodes, ways = {}, {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for root in pool.map(tile, boxes):
            for n in root.findall('node'): nodes[int(n.attrib['id'])] = [float(n.attrib['lon']), float(n.attrib['lat'])]
            for w in root.findall('way'):
                ways[int(w.attrib['id'])] = {'tags': {t.attrib['k']: t.attrib['v'] for t in w.findall('tag')}, 'nodes': [int(n.attrib['ref']) for n in w.findall('nd')]}
    # Several mainline links carry the underpass's own name instead of the road
    # name. Omitting those disconnects the route exactly at every underpass.
    named = {k: w for k, w in ways.items() if w['tags'].get('highway') == 'trunk' and
             (w['tags'].get('name') == '신천대로' or not w['tags'].get('name') or
              ('지하차도' in w['tags'].get('name', '') and w['tags'].get('toll') != 'yes'))}
    graph = {}
    for wid, w in named.items():
        for a, b in zip(w['nodes'], w['nodes'][1:]):
            if a not in nodes or b not in nodes: continue
            d = distance(nodes[a], nodes[b])
            graph.setdefault(a, []).append((b, d, wid)); graph.setdefault(b, []).append((a, d, wid))
    # Trace each connected carriageway; choose the complete south-to-west route.
    components, unseen = [], set(graph)
    while unseen:
        pending, comp = [next(iter(unseen))], set()
        while pending:
            n = pending.pop()
            if n in comp: continue
            comp.add(n); unseen.discard(n); pending.extend(b for b, _, _ in graph[n] if b not in comp)
        components.append(comp)
    comp = max(components, key=lambda c: max(nodes[n][1] for n in c) - min(nodes[n][1] for n in c) + max(nodes[n][0] for n in c) - min(nodes[n][0] for n in c))
    # Official managed section starts at Sangdonggyo (OSM junction reference).
    start = min(comp, key=lambda n: distance(nodes[n], [128.6055, 35.8348]))
    target = min(comp, key=lambda n: nodes[n][0])
    costs, prev, queue = {start: 0}, {}, [(0, start)]
    while queue:
        cost, n = heapq.heappop(queue)
        if cost != costs[n]: continue
        if n == target: break
        for b, d, wid in graph[n]:
            if cost + d < costs.get(b, float('inf')):
                costs[b] = cost + d; prev[b] = (n, wid); heapq.heappush(queue, (cost + d, b))
    path, edgeways, n = [target], [], target
    while n != start:
        n, wid = prev[n]; path.append(n); edgeways.append(wid)
    path.reverse(); edgeways.reverse()
    poly = [nodes[n] for n in path]
    cum = [0.0]
    for a, b in zip(poly, poly[1:]): cum.append(cum[-1] + distance(a, b))
    def nearest(p): return min(range(len(poly)), key=lambda i: distance(poly[i], p))
    def interpolate(s):
        i = next((i for i in range(len(cum)-1) if cum[i+1] >= s), len(cum)-2)
        t = min(1, max(0, (s-cum[i])/(cum[i+1]-cum[i])))
        return [poly[i][k] + (poly[i+1][k]-poly[i][k])*t for k in (0, 1)]
    # Landmarks are named OSM bridge ways, projected to the surveyed route.
    stations = [{'name': '상동교', 'km': 0.0}]
    bridge_ways = [(wid,w) for wid,w in ways.items() if w['tags'].get('name') and
                   (w['tags'].get('man_made') == 'bridge' or
                    (w['tags'].get('bridge') == 'yes' and w['tags'].get('highway') in ('trunk','primary','secondary','tertiary'))) and
                   w['tags'].get('name') != '신천대로']
    landmarks = []
    for wid,w in bridge_ways:
        pts = [nodes[n] for n in w['nodes'] if n in nodes]
        if not pts: continue
        p = min(pts, key=lambda p: distance(poly[nearest(p)],p)); i=nearest(p)
        if distance(poly[i],p) < 100: landmarks.append((cum[i], w['tags'].get('bridge:name', w['tags']['name']), wid))
    for s,name,_ in sorted(landmarks):
        if s < 200 or s > cum[-1]-200 or any(st['name']==name for st in stations): continue
        stations.append({'name': name, 'km': round(s/1000,3)})
    stations.append({'name':'서대구IC', 'km':round(cum[-1]/1000,3)})
    underpasses = []
    for i,wid in enumerate(edgeways):
        w=named[wid]
        if w['tags'].get('tunnel') not in ('yes','building_passage'): continue
        if underpasses and cum[i] - underpasses[-1]['s1'] < 8:
            underpasses[-1]['s1']=round(cum[i+1],2); underpasses[-1]['osmWayIds']=sorted(set(underpasses[-1]['osmWayIds']+[wid]))
        else:
            underpasses.append({'s0':round(cum[i],2),'s1':round(cum[i+1],2),'osmWayIds':[wid]})
    for u in underpasses:
        mid=(u['s0']+u['s1'])/2
        near=min(landmarks,key=lambda b:abs(b[0]-mid)) if landmarks else None
        own_name=named[u['osmWayIds'][0]]['tags'].get('name','')
        u['name']=own_name if '지하차도' in own_name else (near[1]+' 하부') if near and abs(near[0]-mid)<150 else '신천대로 지하차도'
        u.update(depth=4.5, clearance=4.8, ramp=65, geometryNote='OSM tunnel endpoints measured; depth/clearance/ramp are visualization assumptions')
        # Portals also provide distinct selectable landmarks for short demo runs.
        name = u['name'] if u['name'] != '신천대로 지하차도' else f"지하차도 {mid/1000:.1f} km"
        stations = [st for st in stations if abs(st['km'] - mid/1000) > .18 or st['km'] in (0.0, round(cum[-1]/1000,3))]
        stations.append({'name': name, 'km': round(mid/1000,3)})
    stations.sort(key=lambda st: st['km'])
    if len(poly) < 100 or not 14000 < cum[-1] < 19000 or len(underpasses) < 10:
        raise RuntimeError('Incomplete route: preserve existing output and inspect source map coverage')
    total=cum[-1]/1000; segments=[]
    for i in range(math.ceil(total/.2)):
        km0=i*.2; km1=min(total,(i+1)*.2); p=interpolate((km0+km1)*500)
        st=min(stations,key=lambda st:abs(st['km']-(km0+km1)/2))
        val={'b':0,'h':0,'base':1,'pred':1}
        segments.append({'km0':round(km0,3),'km1':round(km1,3),'lon':p[0],'lat':p[1],'name':st['name']+' 부근','E':val,'W':val})
    rivers=[]
    for wid,w in ways.items():
        if w['tags'].get('waterway')=='river' and w['tags'].get('name') in ('신천','금호강'):
            pts=[nodes[n] for n in w['nodes'] if n in nodes]
            if len(pts)>1:rivers.append({'name':w['tags']['name'],'poly':pts,'width':35 if w['tags']['name']=='신천' else 100})
    data={'total_km':round(total,3),'poly':poly,'stations':stations,'segments':segments,'underpasses':underpasses,'rivers':rivers,'roadWayIds':sorted(set(edgeways)), 'source':'https://www.openstreetmap.org/copyright','fetchedAt':datetime.date.today().isoformat(),'_note':'OSM actual one-carriageway alignment, rendered as a simplified two-way road. Underpass portals from tunnel=yes; vertical dimensions assumed. No model1 risk predictions.'}
    (ROOT/'src/data/sincheon.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    empty={k:[] for k in ('signal','crossing','bus_stop','subway','lamp','tree','artwork','junction')}
    # Grade-separated bridge crossings must never become at-grade intersections.
    (ROOT/'src/data/sincheon_osm.json').write_text(json.dumps({'source':'OpenStreetMap contributors (ODbL)','_note':'Motorroad: no at-grade crosswalks/subway exits on mainline.',**empty},ensure_ascii=False),encoding='utf-8')
    print('route',round(total,3),'km,',len(poly),'points,',len(underpasses),'underpasses',flush=True)
    print(json.dumps(stations,ensure_ascii=False),flush=True)
    print(json.dumps(underpasses,ensure_ascii=False),flush=True)

if __name__=='__main__': main()
