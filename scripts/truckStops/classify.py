# Truck Stops layer import, step: classify. See docs/TRUCK_STOPS_LAYER.md.
# Usage: python3 -I scripts/truckStops/classify.py <work_dir>   (expects <work_dir>/truck/)
import json,sys,re
from collections import Counter,defaultdict
S=sys.argv[1]; R=json.load(open(f'{S}/truck/raw.json'))
allp={}
for v in R.values():
    for p in v['raw']: allp[p['id']]=p
def st(p): return next((c.get('shortText') for c in p.get('addressComponents',[]) if 'administrative_area_level_1' in c.get('types',[])),None)
def brand(n):
    l=n.lower()
    if 'flying j' in l: return 'Flying J'
    if re.search(r"\bpilot\b",l) and ('travel' in l or l.strip()=='pilot' or 'flying' in l): return 'Pilot'
    if re.search(r"\blove'?s\b",l) and ('travel' in l or 'country' in l or l.startswith("love")): return "Love's"
    if re.search(r"\bpetro\b",l) and ('stopping' in l or 'travel' in l or l.strip()=='petro'): return 'TA / Petro'
    if re.search(r"^ta\b|\bta (travel|express)|travelcenters of america",l): return 'TA / Petro'
    if re.search(r"quiktrip|^qt\b",l): return 'QuikTrip'
    if re.search(r"buc-?ee",l): return "Buc-ee's"
    return None
by=defaultdict(list); other=Counter()
for p in allp.values():
    if st(p)!='GA': continue
    n=p.get('displayName',{}).get('text',''); b=brand(n)
    if b: by[b].append(p)
    else: other[n]+=1
for b,v in by.items():
    print(f'== {b}: {len(v)}', Counter(p['displayName']['text'] for p in v).most_common(8))
    print('   types:', Counter(t for p in v for t in p.get('types',[]) if t in ('truck_stop','gas_station','convenience_store','rest_stop','restaurant')).most_common())
print('unclassified sample:', [n for n,_ in other.most_common(30)])
json.dump({b:v for b,v in by.items()},open(f'{S}/truck/classified.json','w'))
qt=by.get('QuikTrip',[])
print('QT truck_stop typed:', sum('truck_stop' in p.get('types',[]) for p in qt))
for p in qt:
    if 'truck_stop' in p.get('types',[]) or 'travel' in p['displayName']['text'].lower(): print('  ', p['displayName']['text'],'|',p.get('formattedAddress'))
