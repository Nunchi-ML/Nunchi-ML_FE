"""Prepare local dashboard map context from already downloaded OSM sources."""
import json, math, xml.etree.ElementTree as ET
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
KLON=111320*math.cos(math.radians(35.866))
def xz(lon,lat):return [round((lon-128.59)*KLON,1),round(-(lat-35.866)*110940,1)]
def simplify(points,minimum=7):
    out=[]
    for p in points:
        if not out or math.dist(p,out[-1])>=minimum:out.append(p)
    if points and out[-1]!=points[-1]:out.append(points[-1])
    return out
def main():
    result={}
    for road in ('dalgu','sincheon'):
        route=json.loads((ROOT/f'src/data/{road}.json').read_text(encoding='utf-8'))
        line=[xz(lon,lat) for lon,lat in route['poly']]
        def near(points):
            # Source ways may cross a corridor with distant endpoints; inspect segment midpoints too.
            samples=points+[[(a[0]+b[0])/2,(a[1]+b[1])/2] for a,b in zip(points,points[1:])]
            return any(min(math.dist(p,q) for q in line)<650 for p in samples)
        ways={}
        if road=='sincheon':
            nodes={}; rawways={}
            for path in (ROOT/'scripts/.sincheon_cache').glob('*.osm'):
                root=ET.fromstring(path.read_bytes())
                for n in root.findall('node'):nodes[int(n.attrib['id'])]=xz(float(n.attrib['lon']),float(n.attrib['lat']))
                for w in root.findall('way'):rawways[w.attrib['id']]=({t.attrib['k']:t.attrib['v'] for t in w.findall('tag')},[int(n.attrib['ref']) for n in w.findall('nd')])
            for wid,(tags,ids) in rawways.items():ways[wid]=(tags,[nodes[n] for n in ids if n in nodes])
        else:
            for e in json.loads((ROOT/'scripts/.osm_cache.json').read_text(encoding='utf-8')):
                if e.get('type')=='way':ways[e['id']]=(e.get('tags',{}),[xz(p['lon'],p['lat']) for p in e.get('geometry',[])])
        roads=[]; parks=[]
        for tags,points in ways.values():
            hw=tags.get('highway'); park=tags.get('leisure') in ('park','garden','playground')
            if not hw and not park:continue
            if hw and hw not in ('motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','tertiary','residential','unclassified','service'):continue
            points=simplify(points)
            if len(points)<2 or not near(points):continue
            item={'p':points,'name':tags.get('name','')}
            if park and len(points)>3:parks.append(item)
            elif hw:roads.append({**item,'rank':3 if hw in ('motorway','trunk','primary') else 2 if hw in ('secondary','tertiary') else 1})
        result[road]={'roads':roads,'parks':parks}
        print(road,'roads',len(roads),'parks',len(parks),flush=True)
    out=ROOT/'src/data/navigation_context.json'
    out.write_text(json.dumps({'source':'OpenStreetMap contributors (ODbL)',**result},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('map context KB',out.stat().st_size//1024)
if __name__=='__main__':main()
