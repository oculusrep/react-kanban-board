# Truck Stops layer import, step: finalize. See docs/TRUCK_STOPS_LAYER.md.
# Usage: python3 -I scripts/truckStops/finalize.py <work_dir>   (expects <work_dir>/truck/)
import json,sys,re,math
S=sys.argv[1]; C=json.load(open(f'{S}/truck/classified.json'))
EXCL=re.compile(r'\b(ATM|Truck Service|Truck Care|Truck Solutions|Automotive|Distribution|Division Office|Kitchens|Under Construction|Home Near)\b',re.I)
def ok(b,p):
    n=p['displayName']['text']
    if EXCL.search(n): return False
    if b=='TA / Petro' and re.fullmatch(r'petro',n.strip(),re.I): return False
    if b=='QuikTrip' and 'truck_stop' not in p.get('types',[]): return False
    return True
def km(a,b):
    la1,lo1,la2,lo2=map(math.radians,(a['location']['latitude'],a['location']['longitude'],b['location']['latitude'],b['location']['longitude']))
    h=math.sin((la2-la1)/2)**2+math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 6371*2*math.asin(math.sqrt(h))
def score(p):
    t=p.get('types',[]); n=p['displayName']['text']
    return ('truck_stop' in t)*4+('gas_station' in t)*2+('convenience_store' in t)+('Travel Center' in n or 'Travel Stop' in n or 'Stopping Center' in n)*3-len(n)/100
rows=[]
for b,ps in C.items():
    keep=[]
    for p in sorted([p for p in ps if ok(b,p)],key=score,reverse=True):
        if any(km(p,k)<0.5 for k in keep): continue
        keep.append(p)
    for p in keep:
        rows.append({'brand':b,'place_id':p['id'],'name':p['displayName']['text'],'address':p.get('formattedAddress'),
                     'lat':p['location']['latitude'],'lng':p['location']['longitude'],'status':p.get('businessStatus','OPERATIONAL')})
json.dump(rows,open(f'{S}/truck/rows.json','w'),indent=1)
from collections import Counter
print(Counter(r['brand'] for r in rows)); print(len(rows),'total')
for r in rows:
    if r['brand'] in ('TA / Petro',"Buc-ee's",'QuikTrip','Flying J') or r['status']!='OPERATIONAL': print(' ',r['brand'],'|',r['name'],'|',r['address'],'|',r['status'])
