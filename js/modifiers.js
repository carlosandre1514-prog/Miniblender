'use strict';
/* =====================================================================
   MiniBlender · Modificadores não-destrutivos (pilha por objeto)
   Mirror, Subdivision Surface, Array, Solidify, Smooth, Displace,
   Weld, Wireframe e Screw (torno). A malha base (o.em) nunca é alterada
   até você tocar em "Aplicar".
   ===================================================================== */
(function(){
const MOD_TYPES={
  mirror:{title:'Mirror',def:()=>({axis:'x',merge:true,tol:0.002})},
  subsurf:{title:'Subdivision Surface',def:()=>({levels:1})},
  array:{title:'Array',def:()=>({count:3,ox:1.1,oy:0,oz:0,relative:true})},
  solidify:{title:'Solidify',def:()=>({thick:0.05})},
  smooth:{title:'Smooth',def:()=>({iters:3,factor:0.5})},
  displace:{title:'Displace (ruído)',def:()=>({strength:0.08,scale:3})},
  weld:{title:'Weld',def:()=>({dist:0.001})},
  wireframe:{title:'Wireframe',def:()=>({thick:0.02})},
  screw:{title:'Screw / Torno',def:()=>({steps:24,angle:360,axis:'y',height:0})},
  triangulate:{title:'Triangulate',def:()=>({})}
};
window.MOD_TYPES=MOD_TYPES;
const cage=new THREE.MeshBasicMaterial({visible:false});
const copyEm=em=>({pos:em.pos.slice(),col:em.col.slice(),faces:em.faces.map(f=>f.slice())});
const mods=o=>(o.ext.mods=o.ext.mods||[]);
const active=o=>mods(o).some(m=>m.on!==false);

// Posições atuais (inclui deformação do rig e traços de escultura em andamento).
function livePositions(o){
  const g=o.mesh.geometry,pa=g.attributes.position,rm=renderMap(g),n=o.em.pos.length/3,out=o.em.pos.slice();
  for(let i=0;i<n;i++){const k=rm.start[i];if(k<rm.start[i+1]){const c=rm.list[k];out[3*i]=pa.getX(c);out[3*i+1]=pa.getY(c);out[3*i+2]=pa.getZ(c);}}
  return out;
}
function vertexNormals(em){
  const n=em.pos.length/3,N=new Float32Array(n*3);
  em.faces.forEach(f=>{const fn=faceNormal(em,f);f.forEach(v=>{N[3*v]+=fn[0];N[3*v+1]+=fn[1];N[3*v+2]+=fn[2];});});
  for(let i=0;i<n;i++){const l=Math.hypot(N[3*i],N[3*i+1],N[3*i+2])||1;N[3*i]/=l;N[3*i+1]/=l;N[3*i+2]/=l;}return N;
}
function bbox(em){const a=[Infinity,Infinity,Infinity],b=[-Infinity,-Infinity,-Infinity];for(let i=0;i<em.pos.length;i+=3)for(let c=0;c<3;c++){a[c]=Math.min(a[c],em.pos[i+c]);b[c]=Math.max(b[c],em.pos[i+c]);}return {min:a,max:b,size:b.map((v,i)=>Math.max(1e-6,v-a[i]))};}
const AXI={x:0,y:1,z:2},KEEP_UV=new Set(['subsurf','smooth','displace']);

const OPS={
  mirror(em,m){
    const ax=AXI[m.axis||'x'],n=em.pos.length/3,remap=new Int32Array(n);
    for(let i=0;i<n;i++){const p=[em.pos[3*i],em.pos[3*i+1],em.pos[3*i+2]];
      if(m.merge&&Math.abs(p[ax])<=m.tol){remap[i]=i;em.pos[3*i+ax]=0;continue;}
      p[ax]=-p[ax];remap[i]=em.pos.length/3;em.pos.push(...p);em.col.push(em.col[3*i],em.col[3*i+1],em.col[3*i+2]);}
    const F=em.faces.length;for(let k=0;k<F;k++)em.faces.push(em.faces[k].slice().reverse().map(v=>remap[v]));
    // Remove faces duplicadas que ficam exatamente no plano de espelho.
    const seen=new Set();em.faces=em.faces.filter(f=>{const key=f.slice().sort((a,b)=>a-b).join(',');if(seen.has(key))return false;seen.add(key);return true;});
  },
  subsurf(em,m){for(let l=0;l<clamp(m.levels|0,0,4);l++){if(em.faces.length*4>200000)break;const r=catmull(em);em.pos=r.pos;em.col=r.col;em.faces=r.faces;if(em.uvf)em.uvf=catmullFaceUVs(em.uvf);}},
  array(em,m){
    const b=bbox(em),off=m.relative?[m.ox*b.size[0],m.oy*b.size[1],m.oz*b.size[2]]:[m.ox,m.oy,m.oz],n=em.pos.length/3,F=em.faces.slice(),base=em.pos.slice(),bc=em.col.slice();
    for(let c=1;c<clamp(m.count|0,1,64);c++){const o0=em.pos.length/3;for(let i=0;i<n;i++){em.pos.push(base[3*i]+off[0]*c,base[3*i+1]+off[1]*c,base[3*i+2]+off[2]*c);em.col.push(bc[3*i],bc[3*i+1],bc[3*i+2]);}F.forEach(f=>em.faces.push(f.map(v=>v+o0)));}
  },
  solidify(em,m){
    const n=em.pos.length/3,N=vertexNormals(em),t=m.thick,F=em.faces.slice(),cnt=new Map();
    for(let i=0;i<n;i++){em.pos.push(em.pos[3*i]-N[3*i]*t,em.pos[3*i+1]-N[3*i+1]*t,em.pos[3*i+2]-N[3*i+2]*t);em.col.push(em.col[3*i],em.col[3*i+1],em.col[3*i+2]);}
    F.forEach(f=>{em.faces.push(f.slice().reverse().map(v=>v+n));for(let k=0;k<f.length;k++){const key=ekey(f[k],f[(k+1)%f.length]);cnt.set(key,(cnt.get(key)||0)+1);}});
    F.forEach(f=>{for(let k=0;k<f.length;k++){const a=f[k],b=f[(k+1)%f.length];if(cnt.get(ekey(a,b))===1)em.faces.push([b,a,a+n,b+n]);}});
  },
  smooth(em,m){laplacianSmooth(em,clamp(m.iters|0,1,30),m.factor);},
  displace(em,m){const N=vertexNormals(em),n=em.pos.length/3,sc=m.scale;for(let i=0;i<n;i++){const d=(fbm3(em.pos[3*i]*sc+11,em.pos[3*i+1]*sc+7,em.pos[3*i+2]*sc+3,4,0.5)-0.5)*2*m.strength;em.pos[3*i]+=N[3*i]*d;em.pos[3*i+1]+=N[3*i+1]*d;em.pos[3*i+2]+=N[3*i+2]*d;}},
  weld(em,m){mergeByDistance(em,m.dist);},
  triangulate(em){triangulate(em);},
  wireframe(em,m){
    // Cada aresta vira uma barra quadrada (como o modificador Wireframe).
    const P=em.pos,edges=new Map();em.faces.forEach(f=>{for(let k=0;k<f.length;k++){const a=f[k],b=f[(k+1)%f.length];edges.set(ekey(a,b),[a,b]);}});
    const out={pos:[],col:[],faces:[]},t=m.thick;
    edges.forEach(([a,b])=>{
      const A=new THREE.Vector3(P[3*a],P[3*a+1],P[3*a+2]),B=new THREE.Vector3(P[3*b],P[3*b+1],P[3*b+2]),d=B.clone().sub(A).normalize();
      const u=new THREE.Vector3(Math.abs(d.y)<0.9?0:1,Math.abs(d.y)<0.9?1:0,0).cross(d).normalize().multiplyScalar(t),w=d.clone().cross(u).normalize().multiplyScalar(t);
      const o0=out.pos.length/3,cs=[u.clone().add(w),u.clone().sub(w),u.clone().negate().sub(w),u.clone().negate().add(w)];
      [A,B].forEach((p,pi)=>cs.forEach(c=>{out.pos.push(p.x+c.x,p.y+c.y,p.z+c.z);const s=pi?b:a;out.col.push(em.col[3*s],em.col[3*s+1],em.col[3*s+2]);}));
      for(let k=0;k<4;k++){const k1=(k+1)%4;out.faces.push([o0+k,o0+k1,o0+4+k1,o0+4+k]);}
    });
    em.pos=out.pos;em.col=out.col;em.faces=out.faces;
  },
  screw(em,m){
    // Torno: gira o perfil (ex.: um plano ou meia-silhueta) em volta do eixo, criando vasos, copos, colunas…
    const ax=AXI[m.axis||'y'],steps=clamp(m.steps|0,3,128),ang=m.angle*Math.PI/180,full=Math.abs(m.angle)>=359.9,n=em.pos.length/3;
    const edges=new Map();em.faces.forEach(f=>{for(let k=0;k<f.length;k++){const a=f[k],b=f[(k+1)%f.length];edges.set(ekey(a,b),[a,b]);}});
    const base=em.pos.slice(),bc=em.col.slice(),out={pos:[],col:[],faces:[]},rings=full?steps:steps+1;
    for(let s=0;s<rings;s++){const a=ang*s/steps,c=Math.cos(a),sn=Math.sin(a),hy=m.height*s/steps;
      for(let i=0;i<n;i++){let x=base[3*i],y=base[3*i+1],z=base[3*i+2],p;
        if(ax===1)p=[x*c+z*sn,y+hy,-x*sn+z*c];else if(ax===0)p=[x+hy,y*c-z*sn,y*sn+z*c];else p=[x*c-y*sn,x*sn+y*c,z+hy];
        out.pos.push(...p);out.col.push(bc[3*i],bc[3*i+1],bc[3*i+2]);}}
    for(let s=0;s<steps;s++){const s0=s*n,s1=((s+1)%rings)*n;edges.forEach(([a,b])=>out.faces.push([s0+a,s0+b,s1+b,s1+a]));}
    em.pos=out.pos;em.col=out.col;em.faces=out.faces;mergeByDistance(em,1e-5);
  }
};

function evalMods(o){
  const em=copyEm(o.em);em.pos=livePositions(o);
  // UVs por canto de face acompanham os modificadores que sabem levá-los (Subdivision, Smooth, Displace).
  em.uvf=o.mat.map&&o.uvTopology===o.em.faces.map(f=>f.join(',')).join(';')?faceCornerUVs(o.em.faces,o.uvCorners):null;
  o._modWarn=null;
  for(const m of mods(o)){if(m.on===false)continue;const f=OPS[m.type];
    // Proteção para celular: não passa de ~250 mil faces (evita travar o app).
    if(em.faces.length>250000){o._modWarn='Resultado grande demais: modificadores a partir de “'+(MOD_TYPES[m.type]||{}).title+'” foram pulados.';break;}
    if(f){try{f(em,m);if(!KEEP_UV.has(m.type))em.uvf=null;}catch(err){console.warn('mod',m.type,err);}}}
  if(o._modWarn)toast(o._modWarn,3000);
  return em;
}
// UV por projeção em caixa (triplanar) para a malha avaliada.
function boxUV(g){
  const p=g.attributes.position,n=g.attributes.normal,uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));let u,v;
    if(ax>=ay&&ax>=az){u=p.getZ(i);v=p.getY(i);}else if(ay>=az){u=p.getX(i);v=p.getZ(i);}else{u=p.getX(i);v=p.getY(i);}uv[2*i]=u*0.5+0.5;uv[2*i+1]=v*0.5+0.5;}
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('uv2',new THREE.BufferAttribute(uv.slice(),2));
}
function updateMods(o){
  if(!o||!o.mesh)return;
  if(!active(o)){o._modEm=null;o._modCorners=null;if(o.modMesh){o.mesh.remove(o.modMesh);o.modMesh.geometry.dispose();o.modMesh=null;if(o.graph&&o.graph.links.length)scheduleBake(o);}if(o.mesh.material!==o.mat)o.mesh.material=o.mat;need=true;return;}
  const em=evalMods(o),g=buildGeo(em);
  // Com textura (procedural/imagem) a malha avaliada ganha atlas UV próprio; sem textura, projeção em caixa (rápida).
  const textured=(o.graph&&o.graph.links.length)||(o.textureData&&o.textureData.base);
  if(em.uvf){const uc=cornersFromFaceUVs(em.uvf),uv=new Float32Array(uc.length*2);uc.forEach((q,i)=>{uv[2*i]=q[0];uv[2*i+1]=q[1];});g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('uv2',new THREE.BufferAttribute(uv.slice(),2));o._modEm=em;o._modCorners=uc;}
  else if(textured&&em.faces.length<60000){const fake={em,uvSeams:[],uvSeamsInitialized:false,mesh:{geometry:g}};uvUnwrap(fake);o._modEm=em;o._modCorners=fake.uvCorners;}
  else{boxUV(g);o._modEm=null;o._modCorners=null;}
  if(!o.modMesh){o.modMesh=new THREE.Mesh(g,o.mat);o.modMesh.castShadow=o.modMesh.receiveShadow=true;o.modMesh.raycast=()=>{};o.modMesh.name=o.mesh.name+'_mod';o.mesh.add(o.modMesh);}
  else{o.modMesh.geometry.dispose();o.modMesh.geometry=g;}
  o.modMesh.userData.vcount=em.pos.length/3;o.modMesh.userData.fcount=em.faces.length;
  o.mesh.material=cage;need=true;
  if(o.graph&&o.graph.links.length)scheduleBake(o);
}
window.updateMods=updateMods;
window.modifiedEm=o=>active(o)?evalMods(o):o.em;
let pending=new Set(),raf=0;
function later(o,heavyOk){
  if(!heavyOk&&o.modMesh&&o.modMesh.userData.vcount>40000)return;// traço ao vivo: pula se for pesado
  pending.add(o);if(!raf)raf=requestAnimationFrame(()=>{raf=0;pending.forEach(updateMods);pending.clear();});
}
on('rebuild',o=>{if(o.ext&&o.ext.mods&&o.ext.mods.length)later(o,true);});
on('meshChanged',o=>{if(active(o))later(o,true);});
on('dirty',o=>{if(active(o))later(o,false);});
on('deform',o=>{if(active(o))later(o,false);});
on('remove',o=>{if(o.modMesh){o.modMesh.geometry.dispose();}});

function applyAll(o){
  if(!active(o))return toast('Nenhum modificador ativo');
  const em=evalMods(o),before=JSON.stringify(mods(o));
  editOp(e=>{e.pos=em.pos;e.col=em.col;e.faces=em.faces;});
  o.ext.mods=[];updateMods(o);const after='[]';
  push(()=>{o.ext.mods=JSON.parse(before);updateMods(o);renderPanel();},()=>{o.ext.mods=JSON.parse(after);updateMods(o);renderPanel();});
  renderPanel();toast('Modificadores aplicados na malha');
}
window.applyModifiers=applyAll;

function modUndo(o,fn){const b=JSON.stringify(mods(o));fn();const a=JSON.stringify(mods(o));if(a===b)return;push(()=>{o.ext.mods=JSON.parse(b);updateMods(o);renderPanel();},()=>{o.ext.mods=JSON.parse(a);updateMods(o);renderPanel();});}
function panelMods(P){
  const o=S.sel;if(!o){P.append(h('div',{class:'note'},'Selecione um objeto na aba Layout.'));return;}
  P.append(row(lb('Adicionar'),...Object.keys(MOD_TYPES).map(k=>chip(MOD_TYPES[k].title,()=>{modUndo(o,()=>mods(o).push({type:k,on:true,...MOD_TYPES[k].def()}));updateMods(o);renderPanel();}))));
  const list=mods(o);
  if(!list.length)P.append(h('div',{class:'note'},'Modificadores mudam a forma sem destruir a malha original — como no Blender. Ex.: Mirror + Subdivision para modelar metade de um personagem e ver o resultado liso.'));
  let t;const ch=()=>{clearTimeout(t);t=setTimeout(()=>updateMods(o),60);};
  list.forEach((m,i)=>{
    const T=MOD_TYPES[m.type]||{title:m.type};
    P.append(row(h('b',{style:'color:var(--c);flex:0 0 auto'},(i+1)+'. '+T.title),
      chip(m.on===false?'Desligado':'Ligado',()=>{modUndo(o,()=>m.on=m.on===false);updateMods(o);renderPanel();},m.on!==false,'cy'),
      chip('↑',()=>{if(i>0)modUndo(o,()=>{list.splice(i-1,0,list.splice(i,1)[0]);});updateMods(o);renderPanel();}),
      chip('↓',()=>{if(i<list.length-1)modUndo(o,()=>{list.splice(i+1,0,list.splice(i,1)[0]);});updateMods(o);renderPanel();}),
      chip('Aplicar só este',()=>{const keep=list.slice();list.forEach((x,j)=>{if(j>i)x._off=x.on,x.on=false;});const em=evalMods(o);list.forEach((x,j)=>{if(j>i)x.on=x._off;delete x._off;});editOp(e=>{e.pos=em.pos;e.col=em.col;e.faces=em.faces;});o.ext.mods=keep.slice(i+1);updateMods(o);renderPanel();}),
      chip('✕',()=>{modUndo(o,()=>list.splice(i,1));updateMods(o);renderPanel();})));
    const ax=k=>row(lb('Eixo'),...['x','y','z'].map(a=>chip(a.toUpperCase(),()=>{m[k]=a;updateMods(o);renderPanel();},m[k]===a,'cy')));
    if(m.type==='mirror')P.append(ax('axis'),row(chip('Mesclar no centro',()=>{m.merge=!m.merge;updateMods(o);renderPanel();},m.merge,'cy')));
    if(m.type==='subsurf')P.append(slider('Níveis',0,4,1,m.levels,v=>{m.levels=v;ch();}));
    if(m.type==='array')P.append(slider('Cópias',1,40,1,m.count,v=>{m.count=v;ch();}),slider('Desloc. X',-3,3,0.01,m.ox,v=>{m.ox=v;ch();}),slider('Desloc. Y',-3,3,0.01,m.oy,v=>{m.oy=v;ch();}),slider('Desloc. Z',-3,3,0.01,m.oz,v=>{m.oz=v;ch();}),row(chip('Relativo ao tamanho',()=>{m.relative=!m.relative;updateMods(o);renderPanel();},m.relative,'cy')));
    if(m.type==='solidify')P.append(slider('Espessura',-0.5,0.5,0.005,m.thick,v=>{m.thick=v;ch();}));
    if(m.type==='smooth')P.append(slider('Repetições',1,30,1,m.iters,v=>{m.iters=v;ch();}),slider('Fator',0,1,0.01,m.factor,v=>{m.factor=v;ch();}));
    if(m.type==='displace')P.append(slider('Força',-0.5,0.5,0.005,m.strength,v=>{m.strength=v;ch();}),slider('Escala',0.2,20,0.1,m.scale,v=>{m.scale=v;ch();}));
    if(m.type==='weld')P.append(slider('Distância',0.0001,0.1,0.0001,m.dist,v=>{m.dist=v;ch();},v=>v.toFixed(4)));
    if(m.type==='wireframe')P.append(slider('Espessura',0.002,0.1,0.001,m.thick,v=>{m.thick=v;ch();},v=>v.toFixed(3)));
    if(m.type==='screw')P.append(ax('axis'),slider('Passos',3,128,1,m.steps,v=>{m.steps=v;ch();}),slider('Ângulo',10,720,1,m.angle,v=>{m.angle=v;ch();},v=>v+'°'),slider('Altura (rosca)',-3,3,0.01,m.height,v=>{m.height=v;ch();}));
  });
  if(list.length){
    const mm=o.modMesh;P.append(row(chip('Aplicar todos',()=>applyAll(o),false,'act'),mm?h('span',{class:'note'},'Resultado: '+mm.userData.vcount+'v '+mm.userData.fcount+'f'):null));
    P.append(h('div',{class:'note'},'Edição e escultura continuam na malha base (a “gaiola”); o resultado aparece na hora. Exportar GLB/OBJ já inclui os modificadores.'));
  }
}
PANELS_EXT.mods=panelMods;
TABS.splice(TABS.findIndex(t=>t[0]==='edit')+1,0,['mods','Modific.']);
})();
