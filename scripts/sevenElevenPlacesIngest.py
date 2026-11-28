# 7-Eleven / Speedway GA store search (Google Places API New, Text Search REST).
# Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
#
# Usage (from repo root):
#   set -a && . ./.env && set +a
#   python3 -I scripts/sevenElevenPlacesIngest.py <out_dir>
# Writes <out_dir>/ingest_result.json; load it with the SQL generator in
# docs/SEVEN_ELEVEN_LAYER.md. ~406 requests (203 grid cells x 2 brands).
#
# The browser Maps key is referrer-restricted, hence the Referer header.
import json, subprocess, sys, os, re
S=sys.argv[1]; KEY=os.environ['VITE_GOOGLE_MAPS_API_KEY']
FIELDS='places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.types,places.addressComponents'
GA=(30.35,-85.61,35.01,-80.75)  # s,w,n,e
BRANDS=[{'name':'Speedway','query':'Speedway gas station'},{'name':'7-Eleven','query':'7-Eleven'}]
MAXREQ=400; MAXDEPTH=3
POLY=[(34.99,-85.61),(34.99,-83.11),(34.6,-82.85),(33.95,-82.6),(33.6,-82.2),(33.35,-81.85),(32.6,-81.4),(32.05,-80.85),(31.0,-81.35),(30.71,-81.45),(30.62,-82.0),(30.57,-84.86),(31.0,-85.0),(32.0,-85.06),(32.86,-85.18)]
def inpoly(lat,lng):
    c=False; n=len(POLY)
    for i in range(n):
        y1,x1=POLY[i]; y2,x2=POLY[(i+1)%n]
        if (y1>lat)!=(y2>lat) and lng < (x2-x1)*(lat-y1)/(y2-y1)+x1: c=not c
    return c
STEP=0.3; GRID=[]
s0,w0,n0,e0=GA; la=s0
while la<n0:
    lo=w0
    while lo<e0:
        cell=(la,lo,min(la+STEP,n0),min(lo+STEP,e0))
        pts=[(cell[0]+fy*(cell[2]-cell[0]),cell[1]+fx*(cell[3]-cell[1])) for fy in (0,.5,1) for fx in (0,.5,1)]
        if any(inpoly(*p) for p in pts): GRID.append(cell)
        lo+=STEP
    la+=STEP
print('grid cells',len(GRID))
def norm(s): return re.sub(r'[^a-z0-9]','',s.lower())
def search(q,cell):
    s,w,n,e=cell
    body=json.dumps({'textQuery':q,'pageSize':20,'locationRestriction':{'rectangle':{'low':{'latitude':s,'longitude':w},'high':{'latitude':n,'longitude':e}}}})
    out=subprocess.check_output(['curl','-s','-X','POST','https://places.googleapis.com/v1/places:searchText','-H','Content-Type: application/json','-H',f'X-Goog-Api-Key: {KEY}','-H','Referer: https://ovis.oculusrep.com/','-H',f'X-Goog-FieldMask: {FIELDS}','-d',body])
    d=json.loads(out)
    if 'error' in d: raise SystemExit(f"API error: {d['error']}")
    return d.get('places',[])
result={}
for b in BRANDS:
    req=0; raw={}; trunc=False
    stack=[(c,0) for c in GRID]
    while stack:
        cell,depth=stack.pop()
        if req>=MAXREQ: trunc=True; break
        ps=search(b['query'],cell); req+=1
        for p in ps: raw[p['id']]=p
        if len(ps)>=20:
            if depth>=MAXDEPTH: trunc=True; continue
            s,w,n,e=cell; ml=(s+n)/2; mg=(w+e)/2
            stack+= [((s,w,ml,mg),depth+1),((s,mg,ml,e),depth+1),((ml,w,n,mg),depth+1),((ml,mg,n,e),depth+1)]
    keep=[]; rej={}
    for p in raw.values():
        name=p.get('displayName',{}).get('text','')
        st=next((c['shortText'] for c in p.get('addressComponents',[]) if 'administrative_area_level_1' in c['types']),None)
        why=None
        if st!='GA': why='not GA'
        elif norm(b['name']) not in norm(name): why='name'
        elif not set(p.get('types',[]))&{'gas_station','convenience_store'}: why='type'
        if why: rej.setdefault(why,[]).append(name); continue
        keep.append({'place_id':p['id'],'name':name,'lat':p['location']['latitude'],'lng':p['location']['longitude'],'address':p.get('formattedAddress'),'status':p.get('businessStatus','OPERATIONAL'),'phone':p.get('nationalPhoneNumber'),'website':p.get('websiteUri')})
    result[b['name']]={'requests':req,'truncated':trunc,'raw':len(raw),'kept':keep,'rejected':{k:sorted(set(v))[:15] for k,v in rej.items()},'rejected_counts':{k:len(v) for k,v in rej.items()}}
    print(b['name'],'requests',req,'truncated',trunc,'raw',len(raw),'kept',len(keep),result[b['name']]['rejected_counts'])
    from collections import Counter
    print('  names kept:',Counter(k['name'] for k in keep).most_common(8)); print('  status:',Counter(k['status'] for k in keep))
    print('  rejected name samples:',result[b['name']]['rejected'].get('name',[])[:15])
json.dump(result,open(f'{S}/ingest_result.json','w'),indent=1)
