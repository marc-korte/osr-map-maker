'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Use the production generator and drawing paths. UI/storage effects are mocked;
// geometry assertions below operate on independently sampled canvas commands.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `production source section: ${start}`);
  return html.slice(a, b);
}
function declaration(name) {
  const found = html.match(new RegExp(`const ${name}=[^\\n]+`));
  assert.ok(found, `production declaration: ${name}`);
  return found[0];
}
const context = vm.createContext({ window: {}, console, Math, document: { getElementById: () => null } });
vm.runInContext(`
${['WILD_OPTS_DEF','PPI','DUN_CELL','WILD_HEX','LEG_W','WILD_MIN','MODE_FIELDS','modeFields','mapScale','MAX_KEY_NUMBER'].map(declaration).join('\n')}
const M={mode:'wild',cols:20,rows:20,view:'gm',title:'Fixture',milesPerHex:1,showLegend:true,hex:{},sites:[],syms:[],town:null};
let _pre=null;
const noop=()=>{},beginChange=noop,clearSel=noop,render=noop,save=noop,commitChange=noop,buildTools=noop,maybeFit=noop,toast=noop;
const titleIsAuto=()=>false,og=o=>!(M.view==='player'&&o&&o.gm),hexName=t=>typeof t==='string'?t:t?.n||'';
const strokeKind=d=>['border','trail','river'].includes(d.kind)?d.kind:'road';
const HEX_FILL=.62,PAP='#fff',INK='#000';
${section('function validKeyNumber(', '// generate-option defaults')}
${section('function layout(){', '// ---------- primitives ----------')}
${section('function pageW(', 'function fitCanvas(){')}
${section('function segD2(', 'function strokeD2(')}
${section('function strokeD2(', 'function pickStrokeD(')}
${section('function smoothPath(', 'function drawStroke(')}
${section('function drawStroke(', 'function selGlow(')}
${section('function legendAnchorWild(', '// settlements / landmarks:')}
${section('const hexId=', 'function selDesc(')}
${section('let _rng=Math.random;', 'let lastDunRooms=')}
window.generate=(seed,options={})=>{
 const {cols=20,rows=20,showLegend=true,milesPerHex=1,...opts}=options;
 M.cols=M.colsW=cols;M.rows=M.rowsW=rows;M.showLegend=showLegend;M.milesPerHex=milesPerHex;
 M.wildOpts={...WILD_OPTS_DEF,...opts};genWild(seed);
 return JSON.parse(JSON.stringify({model:M,layout:layout(),reserve:[...legendReserveWild(layout())]}));
};
window.roadPath=(g,d)=>roadStrokePath(g,d);
window.bridges=(g,arr)=>drawBridges(g,arr);
window.strokeDistance2=(d,x,y)=>strokeD2(d,x,y);
window.artPlacement=(t,L)=>wildArtPlacement(t,L);
window.artBounds=(t,c,r,L)=>wildArtBounds(t,c,r,L);
window.drawRoad=(g,d)=>drawStroke(g,d);
window.compose=(map)=>{
 M.cols=M.colsW=map.model.cols;M.rows=M.rowsW=map.model.rows;M.showLegend=map.model.showLegend;M.hex=JSON.parse(JSON.stringify(map.model.hex));M.drawsW=JSON.parse(JSON.stringify(map.model.drawsW));
 composeWildTerrain(map.layout);
 return JSON.parse(JSON.stringify({...map,model:{...map.model,hex:M.hex}}));
};
window.geographyRoad=(seed,options={})=>{
 M.cols=M.colsW=9;M.rows=M.rowsW=9;M.showLegend=false;M.sites=[];M.drawsW=[];M.hex={};
 const elevation={};
 for(let r=0;r<M.rows;r++)for(let c=0;c<M.cols;c++){
  const key=c+','+r,ridge=options.ridge&&c>=3&&c<=5&&r>=3&&r<=5;
  M.hex[key]=ridge?'Mountains':options.art?{n:'Grassland',rot:options.rot||0,art:{...options.art}}:'Grassland';
  elevation[key]=ridge?.95:.1;
 }
 const landmarks=options.landmarks||[];
 for(const landmark of landmarks)M.hex[landmark.c+','+landmark.r]=landmark.type||'Ruins';
 const L=layout(),original=[hcenter(1,4,L),hcenter(7,4,L)],reserve=new Set(options.reserve||[]);
 seedRng(seed);
 const routed=makeWildRoadRouter(L,M.hex,reserve,new Set(Object.keys(M.hex)),{seed,elevation,settlements:[],landmarks})(original,[0,1]);
 M.drawsW=[{...routed,kind:'road',route:'terrain-road',roadClass:'major'}];
 const before=JSON.parse(JSON.stringify(M.hex));
 if(options.compose)composeWildTerrain(L);
 return JSON.parse(JSON.stringify({model:M,layout:L,reserve:[...reserve],original,before,elevation}));
};
`, context, {filename:'production-wilderness-generator.js'});
const generate=(seed,options)=>JSON.parse(JSON.stringify(context.window.generate(seed,options)));

function roadPoints(d, spacing=1) {
  const points=[];let at;
  const g={beginPath(){},moveTo(x,y){at=[x,y];points.push(at);},lineTo(x,y){const a=at,n=Math.max(1,Math.ceil(Math.hypot(x-a[0],y-a[1])/spacing));for(let i=1;i<=n;i++)points.push([a[0]+(x-a[0])*i/n,a[1]+(y-a[1])*i/n]);at=[x,y];},
    quadraticCurveTo(cx,cy,x,y){const a=at,n=Math.max(8,Math.ceil((Math.hypot(cx-a[0],cy-a[1])+Math.hypot(x-cx,y-cy))/spacing));for(let i=1;i<=n;i++){const t=i/n,s=1-t;points.push([s*s*a[0]+2*s*t*cx+t*t*x,s*s*a[1]+2*s*t*cy+t*t*y]);}at=[x,y];}};
  context.window.roadPath(g,d);return points;
}
function roadCommands(d){
  const commands=[];let at;
  context.window.roadPath({beginPath(){},moveTo(x,y){at=[x,y];},lineTo(x,y){const end=[x,y];if(Math.hypot(x-at[0],y-at[1])>1e-7)commands.push({kind:'line',start:at,end});at=end;},quadraticCurveTo(cx,cy,x,y){const end=[x,y];commands.push({kind:'curve',start:at,control:[cx,cy],end});at=end;}},d);
  return commands;
}
function assertTangentContinuity(commands){
  const tangent=(command,start)=>{const a=start?command.start:(command.control||command.start),b=start?(command.control||command.end):command.end;return[b[0]-a[0],b[1]-a[1]];};
  for(let i=1;i<commands.length;i++){
    const a=tangent(commands[i-1],false),b=tangent(commands[i],true),length=Math.hypot(...a)*Math.hypot(...b);
    if(length>1e-8)assert((a[0]*b[0]+a[1]*b[1])/length>=Math.cos(Math.PI/90),'free-corridor line/curve joins have continuous tangents rather than visible angular nicks');
  }
}
function bridges(draws) {
  const hits=[];let p;
  const noop=()=>{},g={save:noop,restore:noop,translate(x,y){p=[x,y];},rotate(a){hits.push([...p,a]);},fillRect:noop,beginPath:noop,moveTo:noop,lineTo:noop,stroke:noop};
  context.window.bridges(g,draws);return hits;
}
function center(c,r,L){return [L.ox+L.hw*(c+.5*(r&1)),L.oy+1.5*L.size*r];}
const terrainName=t=>typeof t==='string'?t:t?.n||'';
const movableTerrain=new Set(['Grassland','Forest','HeavyForest','Evergreen','Hills','ForestedHills','EvergreenHills','Mountains','ForestedMountains','SnowMountains','Desert','RockyDesert','Badlands','Jungle','Marsh','Swamp']);
function artwork(t,c,r,L){
  const name=terrainName(t),art=movableTerrain.has(name)&&typeof t==='object'&&t.art?t.art:{dx:0,dy:0,scale:1};
  assert(Number.isFinite(art.dx)&&Number.isFinite(art.dy)&&Number.isFinite(art.scale)&&art.scale>=0&&art.scale<=1,'artwork placement is finite and bounded');
  const degrees=typeof t==='object'&&Number.isFinite(t.rot)?((t.rot%360)+360)%360:0,angle=degrees*Math.PI/180,cs=Math.abs(Math.cos(angle)),sn=Math.abs(Math.sin(angle));
  const [x,y]=center(c,r,L),hw=L.size*art.scale*(.5208*cs+.4712*sn),hh=L.size*art.scale*(.4712*cs+.5208*sn);
  const w=L.size*.5208*art.scale,h=L.size*.4712*art.scale,co=Math.cos(angle),si=Math.sin(angle);
  const corners=[[-w,-h],[w,-h],[w,h],[-w,h]].map(([dx,dy])=>[x+art.dx+dx*co-dy*si,y+art.dy+dx*si+dy*co]);
  return {x:x+art.dx,y:y+art.dy,hw,hh,scale:art.scale,art,corners};
}
function linearPoints(pts,spacing=2){const result=[pts[0]];for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/spacing));for(let n=1;n<=count;n++)result.push([a[0]+(b[0]-a[0])*n/count,a[1]+(b[1]-a[1])*n/count]);}return result;}
function nearestHex(p,map){const {model:M,layout:L}=map,r0=Math.round((p[1]-L.oy)/(1.5*L.size));let result=null,dist=Infinity;for(let r=r0-1;r<=r0+1;r++){if(r<0||r>=M.rows)continue;const c0=Math.round((p[0]-L.ox)/L.hw-.5*(r&1));for(let c=c0-1;c<=c0+1;c++){if(c<0||c>=M.cols)continue;const q=center(c,r,L),d=(p[0]-q[0])**2+(p[1]-q[1])**2;if(d<dist){result=[c,r];dist=d;}}}return dist<L.size**2?result:null;}
function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function polylineDistance(p,pts){let d=Infinity;for(let i=1;i<pts.length;i++)d=Math.min(d,segmentDistance(p,pts[i-1],pts[i]));return d;}
function neighbors(c,r,cols,rows){return ((r&1)?[[1,0],[-1,0],[0,-1],[1,-1],[0,1],[1,1]]:[[1,0],[-1,0],[-1,-1],[0,-1],[-1,1],[0,1]]).map(([x,y])=>[c+x,r+y]).filter(([x,y])=>x>=0&&x<cols&&y>=0&&y<rows);}
function onHex(p,c,r,L,margin=0){const q=center(c,r,L),x=p[0]-q[0],y=p[1]-q[1],a=L.hw/2+margin+1e-7;return Math.abs(x)<=a&&Math.abs(x*.5+y*Math.sqrt(3)/2)<=a&&Math.abs(-x*.5+y*Math.sqrt(3)/2)<=a;}
function hexAt(p,map){const h=nearestHex(p,map);if(!h)return null;return [h,...neighbors(...h,map.model.cols,map.model.rows)].find(([c,r])=>onHex(p,c,r,map.layout))||null;}
function crossing(a,b,c,d){const x=b[0]-a[0],y=b[1]-a[1],rx=d[0]-c[0],ry=d[1]-c[1],det=x*ry-y*rx;if(Math.abs(det)<1e-9)return null;const t=((c[0]-a[0])*ry-(c[1]-a[1])*rx)/det,u=((c[0]-a[0])*y-(c[1]-a[1])*x)/det;return t>=0&&t<=1&&u>=0&&u<=1?[a[0]+t*x,a[1]+t*y]:null;}
function riverSegments(rivers){const bins=new Map(),B=64;
  for(const river of rivers)for(let i=1;i<river.pts.length;i++){const a=river.pts[i-1],b=river.pts[i],seg=[a,b];for(let x=Math.floor(Math.min(a[0],b[0])/B);x<=Math.floor(Math.max(a[0],b[0])/B);x++)for(let y=Math.floor(Math.min(a[1],b[1])/B);y<=Math.floor(Math.max(a[1],b[1])/B);y++){const k=x+','+y;if(!bins.has(k))bins.set(k,[]);bins.get(k).push(seg);}}
  return (a,b=a,pad=0)=>{const found=new Set();for(let x=Math.floor((Math.min(a[0],b[0])-pad)/B);x<=Math.floor((Math.max(a[0],b[0])+pad)/B);x++)for(let y=Math.floor((Math.min(a[1],b[1])-pad)/B);y<=Math.floor((Math.max(a[1],b[1])+pad)/B);y++)for(const seg of bins.get(x+','+y)||[])found.add(seg);return [...found];};
}
function checkCrossings(roads,rivers,decks){const near=riverSegments(rivers);
  for(const road of roads){const ps=roadPoints(road,1);let run=0;for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i];
    for(const[c,d]of near(a,b)){const q=crossing(a,b,c,d);if(q)assert.ok(decks.some(p=>Math.hypot(p[0]-q[0],p[1]-q[1])<.2),'every actual rendered road/river crossing has a bridge');}
    const distance=Math.min(...near(b,b,5).map(([c,d])=>segmentDistance(b,c,d))),deckDistance=Math.min(...decks.map(p=>Math.hypot(p[0]-b[0],p[1]-b[1])));
    if(distance<4.8&&deckDistance>15)run+=Math.hypot(b[0]-a[0],b[1]-a[1]);else run=0;
    assert.ok(run<16,'road does not follow the river channel away from a bridge');
  }}
}
function hasMeaningfulAlternate(roads,samples,L){
  const adjacency=roads.map(()=>[]);
  for(let i=0;i<roads.length;i++)for(let j=i+1;j<roads.length;j++)if([roads[i].pts[0],roads[i].pts.at(-1)].some(p=>polylineDistance(p,samples[j])<.2)||[roads[j].pts[0],roads[j].pts.at(-1)].some(p=>polylineDistance(p,samples[i])<.2)){adjacency[i].push(j);adjacency[j].push(i);}
  for(let i=0;i<roads.length;i++){
    const a=roads[i].pts[0],b=roads[i].pts.at(-1);
    if(Math.hypot(b[0]-a[0],b[1]-a[1])<L.hw*.8)continue;
    const starts=roads.map((_,j)=>j!==i&&polylineDistance(a,samples[j])<.2?j:-1).filter(j=>j>=0),ends=new Set(roads.map((_,j)=>j!==i&&polylineDistance(b,samples[j])<.2?j:-1).filter(j=>j>=0));
    if(!starts.length||!ends.size)continue;
    const seen=new Set(starts),queue=starts.slice();for(let at=0;at<queue.length;at++)for(const next of adjacency[queue[at]])if(next!==i&&!seen.has(next)){seen.add(next);queue.push(next);}
    if(![...ends].some(end=>seen.has(end)))continue;
    // Both ends remain connected after deleting the candidate. Its interior
    // must occupy genuinely different ground, rather than repainting the tree.
    if(samples[i].some((p,n)=>n%6===0&&Math.min(...samples.map((other,j)=>j===i?Infinity:polylineDistance(p,other)))>L.size*.3))return true;
  }
  return false;
}

function checkMap(map,climate='temperate',regions=true){
  const {model:M,layout:L}=map,res=new Set(map.reserve),draws=M.drawsW,roads=draws.filter(d=>d.kind==='road'),rivers=draws.filter(d=>d.kind==='river'),samples=roads.map(d=>roadPoints(d,2)),decks=bridges(draws),townTypes=new Set(['Castle','Town','Village','Keep']),towns=M.sites.filter(s=>townTypes.has(terrainName(M.hex[[s.c,s.r]])));
  const artCache=new Map(),artAt=(c,r)=>{const key=c+','+r;if(!artCache.has(key))artCache.set(key,artwork(M.hex[key],c,r,L));return artCache.get(key);};
  for(const s of M.sites){assert.ok(!res.has(String([s.c,s.r])),'sites avoid the key reserve');if(s.water)assert.equal(terrainName(M.hex[[s.c,s.r]]),'Water','water-body name stays anchored in its actual body');else{assert.notEqual(terrainName(M.hex[[s.c,s.r]]),'Water','landmark stands on land');assert.ok(s.name&&s.notes&&s.n,'landmark has runnable keyed notes');assert(!M.hex[[s.c,s.r]]?.art,'real keyed landmarks and settlements keep their centered artwork');}}
  for(const[key,t]of Object.entries(M.hex))if(movableTerrain.has(terrainName(t))){const[c,r]=key.split(',').map(Number),a=artAt(c,r);
    assert.deepEqual(JSON.parse(JSON.stringify(context.window.artPlacement(t,L))),a.art,'actual drawing placement uses the persisted terrain artwork metadata');
    if(a.scale)for(const p of a.corners)assert(onHex(p,c,r,L),'ordinary artwork stays inside its own travel hex');
  }
  if(regions)for(const entry of Object.values(M.hex)){
    const t=terrainName(entry);
    const illegal=climate==='arid'?['Forest','HeavyForest','Evergreen','Marsh','Jungle','SnowMountains']:climate==='cold'?['Desert','RockyDesert','Forest','HeavyForest','Jungle','Marsh','Mountains','ForestedMountains']:['Desert','RockyDesert','Jungle','SnowMountains'];
    assert.ok(!illegal.includes(t),`${climate} terrain excludes ${t}`);
  }
  for(const ps of samples)for(const p of ps){const h=hexAt(p,map);assert.ok(h,'road remains in the map field');assert.notEqual(terrainName(M.hex[h]),'Water','road does not cross a lake or sea');assert.ok(!res.has(String(h)),'road avoids the key reserve');
    for(let r=h[1]-1;r<=h[1]+1;r++)for(let c=h[0]-1;c<=h[0]+1;c++){const t=M.hex[[c,r]],name=terrainName(t),blocked=c<0||r<0||c>=M.cols||r>=M.rows||name==='Water'||res.has(String([c,r]));
      if(blocked)assert.ok(!onHex(p,c,r,L,2.7-1e-6),'full road casing clears shore, frame and key reserve');
      else if(t&&name!=='Blank'){const a=artAt(c,r);if(a.scale)assert.ok(Math.abs(p[0]-a.x)>=a.hw+2.7-1e-6||Math.abs(p[1]-a.y)>=a.hh+2.7-1e-6,'full road casing avoids the final composed artwork footprint');}
    }
  }
  for(const b of decks){assert.ok(Math.min(...samples.map(ps=>polylineDistance(b,ps)))<.12,'bridge deck lies on the rendered road');assert.ok(Math.min(...rivers.map(rv=>polylineDistance(b,rv.pts)))<1e-6,'bridge deck lies on a river');}
  for(const road of roads)for(const p of[road.pts[0],road.pts.at(-1)])assert.ok(Math.min(...rivers.map(rv=>polylineDistance(p,rv.pts)))>=7-1e-6,'shared junctions and settlement approaches stand outside the river channel');
  checkCrossings(roads,rivers,decks);
  for(let i=0;i<rivers.length;i++){
    const rv=rivers[i],p=rv.pts.at(-1),h=hexAt(p,map);
    assert.ok(!h||terrainName(M.hex[h])==='Water'||rivers.slice(0,i).some(main=>polylineDistance(p,main.pts)<1e-6),'river drains to shore, outside the frame or an earlier downstream river');
    for(const p of linearPoints(rv.pts)){const h=nearestHex(p,map);if(!h)continue;for(const[c,r]of[h,...neighbors(...h,M.cols,M.rows)]){const t=M.hex[[c,r]],name=terrainName(t);if(t&&name!=='Blank'&&name!=='Water'){const a=artAt(c,r);if(a.scale)assert.ok(Math.abs(p[0]-a.x)>=a.hw+3.8-1e-6||Math.abs(p[1]-a.y)>=a.hh+3.8-1e-6,'full river casing avoids final terrain artwork and fixed landmark footprints');}}}
  }
  // Check connected components independently of the generator's planned MST.
  const land=new Map();let nc=0;
  for(let r=0;r<M.rows;r++)for(let c=0;c<M.cols;c++){const k=String([c,r]);if(land.has(k)||terrainName(M.hex[k])==='Water'||res.has(k))continue;const q=[[c,r]],id=nc++;land.set(k,id);for(let i=0;i<q.length;i++)for(const h of neighbors(...q[i],M.cols,M.rows)){const n=String(h);if(!land.has(n)&&terrainName(M.hex[n])!=='Water'&&!res.has(n)){land.set(n,id);q.push(h);}}}
  const par=roads.map((_,i)=>i),root=i=>{while(par[i]!==i)i=par[i];return i;},join=(a,b)=>{par[root(a)]=root(b);},ends=new Map();
  for(let i=0;i<roads.length;i++)for(const p of[roads[i].pts[0],roads[i].pts.at(-1)]){const k=p.map(n=>Math.round(n*1000)).join(',');if(ends.has(k))join(i,ends.get(k));else ends.set(k,i);}
  const access=towns.map(t=>{const ids=[];samples.forEach((ps,i)=>{if(ps.some(p=>onHex(p,t.c,t.r,L)))ids.push(root(i));});return new Set(ids);});
  for(let a=0;a<towns.length;a++)for(let b=a+1;b<towns.length;b++)if(land.get(String([towns[a].c,towns[a].r]))===land.get(String([towns[b].c,towns[b].r])))assert.ok([...access[a]].some(id=>access[b].has(id)),'settlements on one landmass share an actual connected road network');
  return {roads,rivers,samples,decks,land,towns};
}

module.exports={generate,roadPoints,bridges,center,nearestHex,segmentDistance,polylineDistance,neighbors,checkMap,crossing,hasMeaningfulAlternate};
if (require.main===module) {
  test('wilderness generation is deterministic',()=>{assert.deepEqual(generate('logic-wilderness-repeat'),generate('logic-wilderness-repeat'));});
  test('generated road hierarchy connects settlements and reachable local services deterministically',()=>{
    let majorCount=0,minorCount=0,servedBranches=0,alternateNetworks=0;
    for(const seed of ['h7323f32','geography-hierarchy-a','geography-hierarchy-b','geography-loop-a']){
      const options=seed==='geography-loop-a'?{cols:16,rows:16,water:'dry',terrain:'smooth',settlements:'many',features:'few',rivers:'none'}:{cols:9,rows:12,geography:'regions',climate:'temperate',water:'normal',terrain:'normal',settlements:seed==='h7323f32'?'some':'many',features:'many',rivers:'some'};
      const map=generate(seed,options),same=generate(seed,options);
      assert.deepEqual(same,map,'geography, road classes and artwork reproduce from the same seed');
      const {roads,samples,land}=checkMap(map),major=roads.map((road,i)=>road.roadClass==='major'?i:-1).filter(i=>i>=0),minor=roads.map((road,i)=>road.roadClass==='minor'?i:-1).filter(i=>i>=0);
      if(hasMeaningfulAlternate(roads,samples,map.layout))alternateNetworks++;
      assert(roads.every(road=>road.route==='terrain-road'&&['major','minor'].includes(road.roadClass)),'fresh roads declare their transport role');
      majorCount+=major.length;minorCount+=minor.length;
      const connected=new Set(major);
      for(;;){const before=connected.size;for(const i of minor)if(!connected.has(i)&&[...connected].some(j=>[roads[i].pts[0],roads[i].pts.at(-1)].some(p=>polylineDistance(p,samples[j])<.2)||[roads[j].pts[0],roads[j].pts.at(-1)].some(p=>polylineDistance(p,samples[i])<.2)))connected.add(i);if(connected.size===before)break;}
      assert(minor.every(i=>connected.has(i)),'minor branches actually join the principal road network');
      const principal=map.model.sites.filter(site=>['Castle','Town','Keep'].includes(terrainName(map.model.hex[[site.c,site.r]])));
      for(const site of principal)if(principal.some(other=>other!==site&&land.get(String([other.c,other.r]))===land.get(String([site.c,site.r]))))assert(major.some(i=>samples[i].some(p=>onHex(p,site.c,site.r,map.layout))),'principal settlements on one landmass receive real major-road access');
      for(const i of minor)if(map.model.sites.some(site=>['Village','Mine','Tower','Ruins'].includes(terrainName(map.model.hex[[site.c,site.r]]))&&samples[i].some(p=>onHex(p,site.c,site.r,map.layout))))servedBranches++;
    }
    assert(majorCount>0&&minorCount>0&&servedBranches>0,'the hierarchy includes both an actual trunk network and local service branches');
    assert(alternateNetworks>0,'some useful alternate links actually form distinct playable cycles instead of collapsing onto existing roads');
  });
  test('routing follows geography and destinations rather than ordinary terrain pictures',()=>{
    const fixture=options=>JSON.parse(JSON.stringify(context.window.geographyRoad('purposeful-geography',options))),flat=fixture({}),road=flat.model.drawsW[0],points=roadPoints(road,1),[a,b]=flat.original;
    const length=ps=>ps.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-ps[i][0],p[1]-ps[i][1]),0),chord=Math.hypot(b[0]-a[0],b[1]-a[1]);
    assert(length(points)<=chord*1.05,'uniform open land permits an efficient straight course without a required wiggle');
    assert(Math.max(...points.map(p=>segmentDistance(p,a,b)))<=flat.layout.size*.1,'ordinary centered terrain symbols do not force a road into hex-edge lanes');
    assert.deepEqual(road.pts[0],a);assert.deepEqual(road.pts.at(-1),b);assertTangentContinuity(roadCommands(road));
    assert.deepEqual(fixture({}).model.drawsW,flat.model.drawsW,'the geographic plan replays independently of previous map state');
    const restyled=fixture({art:{dx:8,dy:-5,scale:.5},rot:90});
    assert.deepEqual(restyled.model.drawsW,flat.model.drawsW,'moving, shrinking, or rotating ordinary art does not move the geographic road');
    const ridge=fixture({ridge:true}),ridgePoints=roadPoints(ridge.model.drawsW[0],1);
    const exposed=ps=>ps.slice(1).reduce((sum,p,i)=>{const mid=[(p[0]+ps[i][0])/2,(p[1]+ps[i][1])/2],h=nearestHex(mid,ridge);return sum+(h&&ridge.elevation[String(h)]>.8?Math.hypot(p[0]-ps[i][0],p[1]-ps[i][1]):0);},0);
    assert(exposed(ridgePoints)<exposed(linearPoints(ridge.original,1))*.6,'a short lowland bypass avoids most of an unnecessary high mountain crossing');
    assert(length(ridgePoints)<chord*1.65,'terrain preference does not create an arbitrary map-spanning detour');
    const fixed=fixture({landmarks:[{c:4,r:4,type:'Ruins'}]}),q=center(4,4,fixed.layout);
    for(const p of roadPoints(fixed.model.drawsW[0],1))assert(Math.abs(p[0]-q[0])>=fixed.layout.size*.5208+2.7-1e-6||Math.abs(p[1]-q[1])>=fixed.layout.size*.4712+2.7-1e-6,'a real fixed landmark retains its full centered clearance');
    const reserved=fixture({reserve:['4,4']});for(const p of roadPoints(reserved.model.drawsW[0],1))assert(!onHex(p,4,4,reserved.layout,2.7-1e-6),'world routing still respects the complete reserved hex');
  });
  test('terrain composition preserves geography and persisted road geometry while clearing final artwork',()=>{
    const raw=JSON.parse(JSON.stringify(context.window.geographyRoad('composed-road',{}))),composed=JSON.parse(JSON.stringify(context.window.compose(raw)));
    assert.deepEqual(composed.model.drawsW,raw.model.drawsW,'composition changes the artwork rather than the planned road');
    assert(Object.values(composed.model.hex).some(t=>typeof t==='object'&&t.art),'a road through ordinary centered symbols causes actual artwork adjustment');
    for(const key of Object.keys(raw.model.hex))assert.equal(terrainName(composed.model.hex[key]),terrainName(raw.model.hex[key]),'travel terrain remains the same after composition');
    assert.deepEqual(composed.model.hex['0,0'],raw.model.hex['0,0'],'collision-free legacy artwork stays centered and unchanged');
    checkMap(composed,'temperate',false);
    const saved=JSON.parse(JSON.stringify(composed));assert.deepEqual(saved,composed);checkMap(saved,'temperate',false);
    assert.deepEqual(JSON.parse(JSON.stringify(context.window.compose(saved))),composed,'reloading/recomposing does not progressively shift artwork');
    const clear=JSON.parse(JSON.stringify(raw));clear.model.drawsW=[];
    assert.deepEqual(JSON.parse(JSON.stringify(context.window.compose(clear))).model.hex,clear.model.hex,'a collision-free legacy map does not gain unnecessary art metadata');
    for(const rot of [1e308,-1e308,90]){const bounds=context.window.artBounds({n:'Forest',rot,art:{dx:0,dy:0,scale:.54}},4,4,raw.layout);assert(Object.values(bounds).every(Number.isFinite),'finite imported rotations cannot overflow artwork drawing bounds');}
  });
  test('new wilderness roads keep modest corner fillets along their broad route',()=>{
    let curves=0;
    for(const[seed,options]of[
      ['h7323f32',{cols:9,rows:12}],
      ['logic-wild-11',{cols:9,rows:12,water:'dry',rivers:'many',settlements:'many'}],
      ['logic-wild-13',{cols:20,rows:20,water:'normal',geography:'classic',rivers:'many',settlements:'many'}]
    ]){
      const map=generate(seed,options),limit=map.layout.size*.2;
      for(const road of map.model.drawsW.filter(road=>road.kind==='road')){
        assert((road.cuts||[]).every(cut=>Number.isFinite(cut)&&cut<=limit+1e-6),'fresh route data stores small verified corner trims');
        for(const command of roadCommands(road))if(command.kind==='curve'){
          curves++;
          assert(Math.hypot(command.control[0]-command.start[0],command.control[1]-command.start[1])<=limit+1e-6&&Math.hypot(command.end[0]-command.control[0],command.end[1]-command.control[1])<=limit+1e-6,'actual painted corner curves stay small relative to a hex instead of making wide rounded turns');
        }
      }
    }
    assert(curves>0,'the check exercises actual generated corner curves');
    const painted=road=>{const calls=[],state={dash:[]},g=new Proxy(state,{get(target,key){if(key in target)return target[key];return(...args)=>{if(key==='setLineDash')target.dash=Array.from(args[0]);if(key==='stroke')calls.push({ink:target.strokeStyle,width:target.lineWidth,dash:target.dash.slice(),cap:target.lineCap});};},set(target,key,value){target[key]=value;return true;}});context.window.drawRoad(g,road);return calls;};
    const base={kind:'road',route:'terrain-road',pts:[[0,0],[100,0]],cuts:[0,0]},major=painted({...base,roadClass:'major'}),minor=painted({...base,roadClass:'minor'});
    assert.equal(major.length,2);assert.equal(minor.length,2);
    assert(major[1].width>minor[1].width&&major[1].dash.length===0&&minor[1].dash.length>0,'actual trunk and local road strokes have a visible hierarchy');
    for(const strokes of[major,minor])assert(strokes[0].ink==='#fff'&&strokes[0].width>strokes[1].width&&strokes[0].width<=5.4,'both modern road classes fit inside the physically cleared paper casing');
    for(const route of[undefined,'icon-clear','natural-clear']){const legacy=painted({...base,route,roadClass:'minor'});assert.equal(legacy[0].width,5.4);assert.equal(legacy[1].width,2.6);assert.deepEqual(legacy[1].dash,[9,4],'legacy road linework is preserved');}
  });
  test('road selection and erasure measure the actual natural and manual curves',()=>{
    const natural={kind:'road',route:'natural-clear',pts:[[0,0],[100,0],[100,100]],cuts:[0,32,0]};
    assert(context.window.strokeDistance2(natural,92,8)<.03,'a painted natural-curve midpoint is pickable');
    assert(context.window.strokeDistance2(natural,100,0)>50,'the absent control-polygon corner is not a ghost road hit');
    const manual={pts:[[0,0],[100,100],[200,0]]};
    assert(context.window.strokeDistance2(manual,87.5,62.5)<.03,'legacy/manual smoothed roads use their painted quadratic too');
    assert(context.window.strokeDistance2(manual,100,100)>25,'an undrawn manual control point cannot steal selection');
    for(const kind of ['border','trail','river'])assert.equal(context.window.strokeDistance2({...manual,kind},100,100),0,kind+' retains its existing polyline hit semantics');
    assert.equal(context.window.strokeDistance2({kind:'road',pts:[[7,9]]},10,13),25,'single-point road marks retain their point-distance behavior');
    const geographic={kind:'road',route:'terrain-road',roadClass:'major',pts:[[0,0],[100,0],[100,100]],cuts:[0,6,0]};
    assert(context.window.strokeDistance2(geographic,98.5,1.5)<.03,'new geographic road picking follows its actual corner curve');
  });
  for(const climate of ['temperate','arid','cold'])for(const water of ['dry','normal','wet','coastal'])for(const [cols,rows] of [[9,12],[20,20]])test(`regional wilderness ${climate}/${water} ${cols}×${rows}: spatial rules`,()=>{
    for(const seed of ['logic-wild-2','logic-wild-9'])checkMap(generate(seed,{cols,rows,climate,water,settlements:'many',features:'many',rivers:'many'}),climate);
  });
  for(const water of ['dry','normal','wet','coastal'])for(const [cols,rows]of [[8,8],[20,20]])test(`classic wilderness ${water} ${cols}×${rows}: transport and water remain coherent`,()=>{
    for(const seed of ['logic-wild-0','logic-wild-13'])checkMap(generate(seed,{cols,rows,water,geography:'classic',settlements:'many',features:'many',rivers:'many'}),'temperate',false);
  });
  for(const [name,road,river,count]of[
    ['actual curve crosses, control polygon misses',{pts:[[0,0],[100,100],[200,0]]},[[100,55],[100,75]],1],
    ['control polygon crosses, actual curve misses',{pts:[[0,0],[100,100],[200,0]]},[[100,85],[100,110]],0],
    ['curve crosses the same river twice',{pts:[[0,0],[100,100],[200,0]]},[[0,40],[200,40]],2],
    ['generated corner fillet crosses',{pts:[[0,0],[100,0],[100,100]],route:'icon-clear',cuts:[0,6,0]},[[90,2],[110,2]],1],
    ['broad natural bend crosses',{pts:[[0,0],[100,0],[100,100]],route:'natural-clear',cuts:[0,30,0]},[[80,4],[110,4]],1],
    ['geography-first road corner crosses',{pts:[[0,0],[100,0],[100,100]],route:'terrain-road',roadClass:'minor',cuts:[0,6,0]},[[90,2],[110,2]],1]
  ])test(`bridges follow the rendered path: ${name}`,()=>{
    const hits=bridges([{kind:'road',...road},{kind:'river',pts:river}]);assert.equal(hits.length,count);
    for(const h of hits)assert.ok(polylineDistance(h,roadPoints(road,.1))<.1,'bridge follows actual quadratic path instead of its control polygon');
  });
  test('nearby distinct river crossings retain both bridges',()=>{
    const hits=bridges([{kind:'road',pts:[[0,0],[100,0]]},{kind:'river',pts:[[40,-10],[40,10]]},{kind:'river',pts:[[55,-10],[55,10]]}]);
    assert.equal(hits.length,2);for(let i=0;i<hits.length;i++)assert.ok(Math.hypot(hits[i][0]-[40,55][i],hits[i][1])<1e-6);
  });
  for(const [cols,rows,water,seed]of[[9,12,'dry',8],[9,12,'dry',9],[20,20,'normal',13],[35,40,'dry',9],[35,40,'dry',11],[35,40,'normal',8]])test(`river-bank route regression ${cols}×${rows}/${water}/logic-wild-${seed}`,()=>{
    checkMap(generate('logic-wild-'+seed,{cols,rows,water,rivers:'many',settlements:'many',features:'many'}));
  });
  test('three-way road junction moves onto a dry bank before its branches are routed',()=>{
    checkMap(generate('logic-wild-11',{cols:20,rows:20,water:'dry',rivers:'many',settlements:'many'}));
  });
}
