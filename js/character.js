'use strict';
/* =====================================================================
   MiniBlender · Criador de personagem humanoide + Remesh por voxel
   - Corpo gerado por SDF (cápsulas/elipsoides com união suave) e
     convertido em malha de quads por Surface Nets: pronto para esculpir,
     subdividir e animar.
   - Rig de 17 ossos ajustado às proporções + pesos automáticos.
   - Roupas/cabelo por região (cores de vértice) e olhos.
   - Remesh (voxel) para qualquer malha fechada.
   ===================================================================== */
(function(){
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const CHAR_DEF={height:1.75,build:0.5,muscle:0.3,shoulders:1,hips:1,chest:1,bust:0,belly:0,head:1,neck:1,arms:1,legs:1,
  hair:'curto',skin:'#e0ac8a',shirt:'#3a7bd5',pants:'#2b2f3a',shoes:'#1a1a1a',hairColor:'#2b1a0e',eyes:true,clothes:true,res:72,cartoon:0};
const PRESETS={
  'Adulto':{},
  'Mulher':{height:1.65,shoulders:0.86,hips:1.12,bust:0.7,muscle:0.15,build:0.42,hair:'longo',shirt:'#c2185b'},
  'Homem forte':{height:1.85,shoulders:1.2,muscle:0.9,build:0.65,chest:1.15,hair:'curto',shirt:'#2e7d32'},
  'Criança':{height:1.15,head:1.35,legs:0.85,arms:0.92,build:0.5,muscle:0,shoulders:0.9,hair:'curto',shirt:'#ff9800'},
  'Cartoon':{height:1.3,head:1.9,legs:0.75,arms:0.85,build:0.6,cartoon:1,hair:'volumoso',shirt:'#e53935'},
  'Magro alto':{height:2.0,build:0.25,muscle:0.1,shoulders:0.95,legs:1.08,hair:'careca'},
  'Robusto':{height:1.7,build:0.9,belly:1,muscle:0.2,shoulders:1.1,hips:1.15,hair:'curto',shirt:'#795548'}
};
window.CHAR_PRESETS=PRESETS;

/* ---------- Esqueleto a partir dos parâmetros ---------- */
function joints(c){
  const H=c.height,leg=c.legs,arm=c.arms,ang=24*Math.PI/180,J={};
  // Proporções humanas (fração da altura H): quadril ~0.50H, ombros ~0.80H, topo da cabeça = H.
  J.ankleY=0.045*H;J.hipJ=J.ankleY+0.455*H*leg;
  J.pelvis=V(0,J.hipJ+0.03*H,0);J.spine=J.pelvis.clone().add(V(0,0.09*H,0));J.chest=J.spine.clone().add(V(0,0.09*H,0));
  J.neck=J.chest.clone().add(V(0,0.11*H,0));J.headB=J.neck.clone().add(V(0,0.045*H*c.neck,0));
  J.hr=0.062*H*c.head/(c.cartoon?1.15:1);J.headC=J.headB.clone().add(V(0,J.hr*0.95,0.006*H));
  [-1,1].forEach(s=>{const k=s<0?'E':'D',d=V(s*Math.cos(ang),-Math.sin(ang),0);
    J['sh'+k]=J.chest.clone().add(V(s*0.12*H*c.shoulders,0.085*H,0));J['el'+k]=J['sh'+k].clone().addScaledVector(d,0.165*H*arm);J['wr'+k]=J['el'+k].clone().addScaledVector(d,0.145*H*arm);J['ha'+k]=J['wr'+k].clone().addScaledVector(d,0.095*H*arm);J['dir'+k]=d;
    J['hp'+k]=J.pelvis.clone().add(V(s*0.06*H*c.hips,-0.05*H,0));J['kn'+k]=V(J['hp'+k].x*0.95,J.ankleY+0.235*H*leg,0.006*H);J['an'+k]=V(J['hp'+k].x*0.92,J.ankleY,-0.01*H);J['to'+k]=J['an'+k].clone().add(V(0,-0.03*H,0.11*H));});
  return J;
}
// Rig nos mesmos índices/nomes do rig padrão (as animações prontas e o IK continuam funcionando).
function characterRig(c){
  const J=joints(c),rel=(a,b)=>b.clone().sub(a).toArray();
  const B=[
    {name:'Pelvis',parent:-1,p:J.pelvis.toArray()},{name:'Coluna',parent:0,p:rel(J.pelvis,J.spine)},{name:'Peito',parent:1,p:rel(J.spine,J.chest)},
    {name:'Pescoco',parent:2,p:rel(J.chest,J.neck)},{name:'Cabeca',parent:3,p:rel(J.neck,J.headB),tail:[0,J.hr*2.1,0]},
    {name:'Braco_E',parent:2,p:rel(J.chest,J.shE)},{name:'Antebraco_E',parent:5,p:rel(J.shE,J.elE)},{name:'Mao_E',parent:6,p:rel(J.elE,J.wrE),tail:rel(J.wrE,J.haE)},
    {name:'Braco_D',parent:2,p:rel(J.chest,J.shD)},{name:'Antebraco_D',parent:8,p:rel(J.shD,J.elD)},{name:'Mao_D',parent:9,p:rel(J.elD,J.wrD),tail:rel(J.wrD,J.haD)},
    {name:'Coxa_E',parent:0,p:rel(J.pelvis,J.hpE)},{name:'Canela_E',parent:11,p:rel(J.hpE,J.knE)},{name:'Pe_E',parent:12,p:rel(J.knE,J.anE),tail:rel(J.anE,J.toE)},
    {name:'Coxa_D',parent:0,p:rel(J.pelvis,J.hpD)},{name:'Canela_D',parent:14,p:rel(J.hpD,J.knD)},{name:'Pe_D',parent:15,p:rel(J.knD,J.anD),tail:rel(J.anD,J.toD)}
  ];
  return {bones:B.map(b=>({...b,rot:[0,0,0]})),weights:null,selected:0,poseKeys:{}};
}
window.characterRig=characterRig;

/* ---------- SDF ---------- */
const smin=(a,b,k)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*0.25;};
function rcone(px,py,pz,a,b,r1,r2){const bx=b.x-a.x,by=b.y-a.y,bz=b.z-a.z,qx=px-a.x,qy=py-a.y,qz=pz-a.z,l2=bx*bx+by*by+bz*bz||1;let t=(qx*bx+qy*by+qz*bz)/l2;t=t<0?0:t>1?1:t;const dx=qx-bx*t,dy=qy-by*t,dz=qz-bz*t;return Math.sqrt(dx*dx+dy*dy+dz*dz)-(r1+(r2-r1)*t);}
function ell(px,py,pz,c,rx,ry,rz){const x=(px-c.x)/rx,y=(py-c.y)/ry,z=(pz-c.z)/rz,k0=Math.sqrt(x*x+y*y+z*z),k1=Math.sqrt(x*x/(rx*rx)+y*y/(ry*ry)+z*z/(rz*rz));return k1<1e-9?-Math.min(rx,ry,rz):k0*(k0-1)/k1;}
function bodySDF(c){
  const J=joints(c),H=c.height,t=0.75+c.build*0.6,mu=c.muscle,k=0.045*H,hr=J.hr;
  return (x,y,z)=>{
    let d=ell(x,y,z,J.pelvis.clone().add(V(0,-0.005*H,0)),0.1*H*c.hips*t,0.07*H,0.075*H*t);
    d=smin(d,ell(x,y,z,J.spine,(0.085+c.belly*0.035)*H*t,0.075*H,(0.064+c.belly*0.05)*H*t),k);
    d=smin(d,ell(x,y,z,J.chest.clone().add(V(0,0.035*H,0)),0.11*H*c.shoulders*(0.85+0.15*t)*(1+mu*0.08)*c.chest,0.085*H,0.07*H*t*(1+mu*0.12)*c.chest),k);
    if(c.bust>0)for(const s of [-1,1])d=smin(d,ell(x,y,z,J.chest.clone().add(V(s*0.045*H,0.02*H,0.055*H*t)),0.045*H*c.bust,0.04*H*c.bust,0.04*H*c.bust),0.03*H);
    d=smin(d,rcone(x,y,z,J.chest,J.headB,0.035*H,0.03*H),0.03*H);
    // cabeça + mandíbula + nariz + orelhas
    let hd=ell(x,y,z,J.headC,hr*0.86,hr*1.05,hr*0.98);
    hd=smin(hd,ell(x,y,z,J.headC.clone().add(V(0,-hr*0.55,hr*0.22)),hr*0.55,hr*0.42,hr*0.6),hr*0.35);
    hd=smin(hd,ell(x,y,z,J.headC.clone().add(V(0,-hr*0.12,hr*0.95)),hr*0.12,hr*0.18,hr*0.16),hr*0.12);
    for(const s of [-1,1])hd=smin(hd,ell(x,y,z,J.headC.clone().add(V(s*hr*0.86,-hr*0.05,0)),hr*0.1,hr*0.22,hr*0.14),hr*0.08);
    if(c.hair==='curto'||c.hair==='volumoso'||c.hair==='longo'){
      const g=c.hair==='volumoso'?1.22:1.07,hc=J.headC.clone().add(V(0,hr*0.1,-hr*0.08));
      let hair=ell(x,y,z,hc,hr*0.9*g,hr*1.02*g,hr*1.02*g);
      // corta a parte do rosto e de baixo
      hair=Math.max(hair,-(y-(J.headC.y-hr*0.15)),z-(J.headC.z+hr*0.45)+(y-J.headC.y)*0.6);
      if(c.hair==='longo')hair=smin(hair,ell(x,y,z,J.headC.clone().add(V(0,-hr*0.9,-hr*0.55)),hr*0.95,hr*1.3,hr*0.45),hr*0.3);
      hd=smin(hd,hair,hr*0.1);
    }
    d=smin(d,hd,0.025*H);
    for(const k2 of ['E','D']){
      const r=t*(1+mu*0.25);
      d=smin(d,ell(x,y,z,J['sh'+k2],0.05*H*r,0.045*H*r,0.045*H*r),0.03*H);
      d=smin(d,rcone(x,y,z,J['sh'+k2],J['el'+k2],0.04*H*r,0.031*H*t),0.025*H);
      d=smin(d,rcone(x,y,z,J['el'+k2],J['wr'+k2],0.033*H*t*(1+mu*0.15),0.022*H*t),0.02*H);
      // mão (palma achatada + polegar)
      const w=J['wr'+k2],ha=J['ha'+k2],dir=J['dir'+k2];
      d=smin(d,ell(x,y,z,w.clone().lerp(ha,0.45),0.045*H,0.03*H,0.02*H),0.015*H);
      d=smin(d,rcone(x,y,z,w.clone().lerp(ha,0.6),ha,0.02*H,0.014*H),0.012*H);
      d=smin(d,rcone(x,y,z,w.clone().addScaledVector(dir,0.015*H).add(V(0,0,0.015*H)),w.clone().addScaledVector(dir,0.045*H).add(V(0,-0.01*H,0.035*H)),0.011*H,0.008*H),0.01*H);
      d=smin(d,rcone(x,y,z,J['hp'+k2],J['kn'+k2],0.068*H*t*(1+mu*0.1),0.045*H*t),0.04*H);
      d=smin(d,ell(x,y,z,J['kn'+k2].clone().add(V(0,-0.075*H,-0.012*H)),0.043*H*t*(1+mu*0.15),0.07*H,0.045*H*t*(1+mu*0.15)),0.03*H);
      d=smin(d,rcone(x,y,z,J['kn'+k2],J['an'+k2],0.044*H*t,0.028*H),0.02*H);
      d=smin(d,rcone(x,y,z,J['an'+k2].clone().add(V(0,-0.02*H,-0.01*H)),J['to'+k2],0.03*H,0.026*H),0.02*H);
    }
    return d;
  };
}

/* ---------- Surface Nets: campo escalar -> malha de quads ---------- */
function surfaceNets(field,nx,ny,nz,org,hs){
  const id=(i,j,k)=>i+nx*(j+ny*k),vid=new Int32Array(nx*ny*nz).fill(-1),pos=[];
  const cornerOff=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]],edges=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  for(let k=0;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
    const v=cornerOff.map(o=>field[id(i+o[0],j+o[1],k+o[2])]);let mask=0;for(let c=0;c<8;c++)if(v[c]<0)mask|=1<<c;if(mask===0||mask===255)continue;
    let sx=0,sy=0,sz=0,n=0;for(const [a,b] of edges){if((v[a]<0)===(v[b]<0))continue;const t=v[a]/(v[a]-v[b]),A=cornerOff[a],B=cornerOff[b];sx+=A[0]+(B[0]-A[0])*t;sy+=A[1]+(B[1]-A[1])*t;sz+=A[2]+(B[2]-A[2])*t;n++;}
    vid[id(i,j,k)]=pos.length/3;pos.push(org[0]+(i+sx/n)*hs,org[1]+(j+sy/n)*hs,org[2]+(k+sz/n)*hs);
  }
  const faces=[];
  for(let k=1;k<nz-1;k++)for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){
    const a=field[id(i,j,k)]<0;
    // aresta +X
    if((field[id(i+1,j,k)]<0)!==a){const q=[vid[id(i,j-1,k-1)],vid[id(i,j,k-1)],vid[id(i,j,k)],vid[id(i,j-1,k)]];if(q.every(x=>x>=0))faces.push(a?q:q.slice().reverse());}
    if((field[id(i,j+1,k)]<0)!==a){const q=[vid[id(i-1,j,k-1)],vid[id(i-1,j,k)],vid[id(i,j,k)],vid[id(i,j,k-1)]];if(q.every(x=>x>=0))faces.push(a?q:q.slice().reverse());}
    if((field[id(i,j,k+1)]<0)!==a){const q=[vid[id(i-1,j-1,k)],vid[id(i,j-1,k)],vid[id(i,j,k)],vid[id(i-1,j,k)]];if(q.every(x=>x>=0))faces.push(a?q:q.slice().reverse());}
  }
  return {pos,col:new Array(pos.length).fill(1),faces};
}
window.surfaceNets=surfaceNets;
function sampleField(f,min,max,hs){
  const nx=Math.ceil((max[0]-min[0])/hs)+3,ny=Math.ceil((max[1]-min[1])/hs)+3,nz=Math.ceil((max[2]-min[2])/hs)+3;
  // grade simétrica em X (escultura com simetria fica perfeita)
  const org=[-(nx-1)*hs/2,min[1]-hs,min[2]-hs],F=new Float32Array(nx*ny*nz);
  for(let k=0;k<nz;k++){const z=org[2]+k*hs;for(let j=0;j<ny;j++){const y=org[1]+j*hs;for(let i=0;i<nx;i++)F[i+nx*(j+ny*k)]=f(org[0]+i*hs,y,z);}}
  return {F,nx,ny,nz,org};
}
function eyeball(em,c,r,look){
  const s=cubeGrid(5,p=>{const l=Math.hypot(p[0],p[1],p[2]);return p.map(x=>x/l*r);}),o=em.pos.length/3;
  for(let i=0;i<s.pos.length;i+=3){const z=s.pos[i+2]/r;em.pos.push(s.pos[i]+c.x,s.pos[i+1]+c.y,s.pos[i+2]+c.z);const col=z>0.82?[0.02,0.02,0.02]:z>0.62?[0.25,0.45,0.75]:[0.95,0.95,0.95];em.col.push(...col.map(s2l));}
  s.faces.forEach(f=>em.faces.push(f.map(v=>v+o)));
}
function buildCharacter(c){
  const J=joints(c),H=c.height,hs=H/c.res,sdf=bodySDF(c);
  const xs=Math.max(Math.abs(J.haE.x),Math.abs(J.haD.x))+0.06*H;
  const S0=sampleField(sdf,[-xs,0,-0.22*H],[xs,J.headC.y+J.hr*1.6,0.24*H],hs);
  const em=surfaceNets(S0.F,S0.nx,S0.ny,S0.nz,S0.org,hs);
  laplacianSmooth(em,1,0.35);
  // cores por região
  const rig=characterRig(c),tmp={em,rig};const segs=boneSegments(rig);
  const skin=hexRgb(c.skin).map(s2l),shirt=hexRgb(c.shirt).map(s2l),pants=hexRgb(c.pants).map(s2l),shoes=hexRgb(c.shoes).map(s2l),hairC=hexRgb(c.hairColor).map(s2l);
  const nm=rig.bones.map(b=>b.name);em.col=[];
  for(let v=0;v<em.pos.length/3;v++){
    const p=[em.pos[3*v],em.pos[3*v+1],em.pos[3*v+2]];let best=0,bd=Infinity;segs.forEach(s=>{const d=pointSegDist2(p,s.a,s.e);if(d<bd){bd=d;best=s.i;}});
    const n=nm[best];let col=skin;
    if(c.clothes){
      if(['Pelvis','Coluna','Peito','Braco_E','Braco_D'].includes(n))col=shirt;
      if(n==='Pelvis'&&p[1]<J.pelvis.y+0.01*H)col=pants;
      if(n==='Coxa_E'||n==='Coxa_D'||n==='Canela_E'||n==='Canela_D')col=pants;
      if(n==='Pe_E'||n==='Pe_D')col=p[1]<J.ankleY+0.04*H?shoes:pants;
      if((n==='Braco_E'||n==='Braco_D')){const sh=n.endsWith('E')?J.shE:J.shD,el=n.endsWith('E')?J.elE:J.elD;if(V(...p).distanceTo(sh)>sh.distanceTo(el)*0.55)col=skin;}
    }
    if(n==='Cabeca'&&c.hair!=='careca'){const hc=J.headC,dy=p[1]-hc.y,dz=p[2]-hc.z;if(dy>-J.hr*0.1&&(dz<J.hr*0.35-dy*0.6||dy>J.hr*0.62))col=hairC;if(c.hair==='longo'&&dz<-J.hr*0.2&&dy>-J.hr*1.6)col=hairC;}
    em.col.push(...col);
  }
  if(c.eyes){const er=J.hr*(c.cartoon?0.26:0.15);[-1,1].forEach(s=>eyeball(em,J.headC.clone().add(V(s*J.hr*0.36,J.hr*0.08,J.hr*0.78)),er));}
  return em;
}
window.buildCharacter=buildCharacter;

function createCharacter(params,silent){
  const c={...CHAR_DEF,...(params||{})};const t0=performance.now();const em=buildCharacter(c);
  const o=createObject('Personagem '+(S.objs.length+1),em,{flat:false});o.ext.char=c;o.params.color='#ffffff';o.params.rough=0.65;applyMaterial(o);
  o.rig=characterRig(c);o.rig.weights=autoWeights(o);initRigDeform(o);buildRigViz(o);
  if(!silent){selectObj(o);push(()=>removeObj(o,true),()=>{scene.add(o.mesh);S.objs.push(o);selectObj(o);});$('#fFrame').click();
    toast('Personagem criado: '+em.pos.length/3+' vértices, rig de 17 ossos ('+Math.round(performance.now()-t0)+' ms)',3200);}
  return o;
}
window.createCharacter=createCharacter;
function regenerate(o){
  const c=o.ext.char,before={pos:o.em.pos.slice(),col:o.em.col.slice(),faces:o.em.faces.map(f=>f.slice())},rigB=o.rig?JSON.stringify({bones:o.rig.bones,poseKeys:o.rig.poseKeys}):null;
  const keys=o.rig?o.rig.poseKeys:{};const em=buildCharacter(c);
  if(o.rigPreviewRoot){o.mesh.remove(o.rigPreviewRoot);o.rigPreviewRoot=null;o.rigPreviewBones=null;}
  o.em=em;o.mask=null;o.uvCorners=null;o.uvSeamsInitialized=false;o.uvSeams=[];o.rig=characterRig(c);o.rig.poseKeys=keys;o.rig.weights=null;rebuildGeo(o);
  o.rig.weights=autoWeights(o);initRigDeform(o);buildRigViz(o);applyRigFrame(o,S.frame);
}
let regenT=0;
function panelChar(P){
  P.append(row(lb('Novo'),...Object.keys(PRESETS).map(k=>chip(k,()=>{createCharacter(PRESETS[k]);renderPanel();}))));
  const o=S.sel,c=o&&o.ext&&o.ext.char;
  if(!c){P.append(h('div',{class:'note'},'Toque num modelo acima para criar um personagem humanoide completo (corpo, rosto, olhos, roupas e rig de 17 ossos com pesos). Depois ajuste as proporções aqui, esculpa na aba Esculpir e anime na aba Rig.'));return;}
  const re=()=>{clearTimeout(regenT);regenT=setTimeout(()=>{regenerate(o);hud();},260);};
  const sl=(t,k,a,b,st)=>slider(t,a,b,st,c[k],v=>{c[k]=v;re();},v=>(+v).toFixed(2));
  P.append(h('div',{class:'note'},'Ajustes regeneram a malha (perde a escultura feita depois). Termine as proporções antes de esculpir.'));
  P.append(sl('Altura (m)','height',0.6,2.4,0.01),sl('Peso / massa','build',0,1,0.01),sl('Músculos','muscle',0,1,0.01),sl('Ombros','shoulders',0.7,1.4,0.01),sl('Quadril','hips',0.7,1.4,0.01),
    sl('Peito','chest',0.8,1.3,0.01),sl('Busto','bust',0,1.2,0.01),sl('Barriga','belly',0,1.5,0.01),sl('Cabeça','head',0.7,2.2,0.01),sl('Pescoço','neck',0.4,1.8,0.01),sl('Braços','arms',0.7,1.3,0.01),sl('Pernas','legs',0.6,1.3,0.01));
  P.append(row(lb('Cabelo'),...['careca','curto','volumoso','longo'].map(k=>chip(k,()=>{c.hair=k;re();renderPanel();},c.hair===k)),chip('Olhos',()=>{c.eyes=!c.eyes;re();renderPanel();},c.eyes,'cy'),chip('Roupas',()=>{c.clothes=!c.clothes;re();renderPanel();},c.clothes,'cy'),chip('Estilo cartoon',()=>{c.cartoon=c.cartoon?0:1;re();renderPanel();},!!c.cartoon,'cy')));
  P.append(row(lb('Pele'),colorIn(c.skin,v=>{c.skin=v;re();}),lb('Camisa'),colorIn(c.shirt,v=>{c.shirt=v;re();}),lb('Calça'),colorIn(c.pants,v=>{c.pants=v;re();}),lb('Sapato'),colorIn(c.shoes,v=>{c.shoes=v;re();}),lb('Cabelo'),colorIn(c.hairColor,v=>{c.hairColor=v;re();})));
  P.append(slider('Detalhe (voxels)',40,140,1,c.res,v=>{c.res=v;re();},v=>v+''));
  P.append(row(chip('Ir esculpir',()=>setWs('sculpt'),false,'act'),chip('Animar (Rig)',()=>setWs('rig')),chip('Caminhar',()=>{setWs('rig');makeRigPreset('walk');S.playing=true;renderPanel();}),chip('Congelar (virar malha comum)',()=>{delete o.ext.char;renderPanel();toast('Agora é uma malha comum; o rig continua.');})));
}
PANELS_EXT.char=panelChar;
TABS.splice(TABS.findIndex(t=>t[0]==='sculpt'),0,['char','Personagem']);

/* ---------- Remesh por voxel (malha fechada qualquer) ---------- */
function voxelRemesh(o,res){
  const em=o.em,P=em.pos;const b=new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(P,3)),size=b.getSize(V(0,0,0)),hs=Math.max(size.x,size.y,size.z)/res;
  const pad=2,org=[b.min.x-pad*hs,b.min.y-pad*hs,b.min.z-pad*hs],nx=Math.ceil(size.x/hs)+pad*2+1,ny=Math.ceil(size.y/hs)+pad*2+1,nz=Math.ceil(size.z/hs)+pad*2+1;
  if(nx*ny*nz>9e6)throw new Error('resolução alta demais');
  // Paridade de raios ao longo de Y por coluna (x,z): dentro = número ímpar de cruzamentos abaixo.
  const cols=Array.from({length:nx*nz},()=>[]);
  em.faces.forEach(f=>{for(let k=1;k<f.length-1;k++){const t=[f[0],f[k],f[k+1]],X=t.map(v=>P[3*v]),Y=t.map(v=>P[3*v+1]),Z=t.map(v=>P[3*v+2]);
    const i0=Math.max(0,Math.floor((Math.min(...X)-org[0])/hs)),i1=Math.min(nx-1,Math.ceil((Math.max(...X)-org[0])/hs)),k0=Math.max(0,Math.floor((Math.min(...Z)-org[2])/hs)),k1=Math.min(nz-1,Math.ceil((Math.max(...Z)-org[2])/hs));
    const den=(Z[1]-Z[2])*(X[0]-X[2])+(X[2]-X[1])*(Z[0]-Z[2]);if(Math.abs(den)<1e-14)continue;
    for(let kk=k0;kk<=k1;kk++)for(let ii=i0;ii<=i1;ii++){const px=org[0]+ii*hs+1e-7,pz=org[2]+kk*hs+1.3e-7,a=((Z[1]-Z[2])*(px-X[2])+(X[2]-X[1])*(pz-Z[2]))/den,bb=((Z[2]-Z[0])*(px-X[2])+(X[0]-X[2])*(pz-Z[2]))/den,c=1-a-bb;if(a<0||bb<0||c<0)continue;cols[ii+nx*kk].push(a*Y[0]+bb*Y[1]+c*Y[2]);}
  }});
  let F=new Float32Array(nx*ny*nz);
  for(let kk=0;kk<nz;kk++)for(let ii=0;ii<nx;ii++){const L=cols[ii+nx*kk].sort((a,b)=>a-b);let c=0;for(let j=0;j<ny;j++){const y=org[1]+j*hs;while(c<L.length&&L[c]<y)c++;F[ii+nx*(j+ny*kk)]=(c&1)?-1:1;}}
  // Desfoque 3D (2 passes) para superfície lisa.
  for(let pass=0;pass<2;pass++)for(const ax of [1,nx,nx*ny]){const G=new Float32Array(F.length);for(let i=0;i<F.length;i++){const a=F[i-ax]!==undefined?F[i-ax]:F[i],c=F[i+ax]!==undefined?F[i+ax]:F[i];G[i]=(a+2*F[i]+c)/4;}F=G;}
  const out=surfaceNets(F,nx,ny,nz,org,hs);
  // reaproveita a cor do vértice original mais próximo
  const grid=new Map(),cs=hs*2,key=(x,y,z)=>Math.floor(x/cs)+','+Math.floor(y/cs)+','+Math.floor(z/cs);for(let i=0;i<P.length/3;i++){const k=key(P[3*i],P[3*i+1],P[3*i+2]);(grid.get(k)||grid.set(k,[]).get(k)).push(i);}
  out.col=[];for(let v=0;v<out.pos.length/3;v++){const x=out.pos[3*v],y=out.pos[3*v+1],z=out.pos[3*v+2],cx=Math.floor(x/cs),cy=Math.floor(y/cs),cz=Math.floor(z/cs);let best=-1,bd=Infinity;
    for(let a=-1;a<=1;a++)for(let bq=-1;bq<=1;bq++)for(let c=-1;c<=1;c++){const L=grid.get((cx+a)+','+(cy+bq)+','+(cz+c));if(L)for(const i of L){const d=(P[3*i]-x)**2+(P[3*i+1]-y)**2+(P[3*i+2]-z)**2;if(d<bd){bd=d;best=i;}}}
    out.col.push(...(best>=0?[em.col[3*best],em.col[3*best+1],em.col[3*best+2]]:[1,1,1]));}
  return out;
}
window.voxelRemesh=voxelRemesh;
window.voxelRemeshUI=function(o){
  try{const t0=performance.now();let n=0;editOp(em=>{const r=voxelRemesh(o,S.remeshRes||72);if(!r.faces.length){toast('Remesh vazio: a malha precisa ser fechada (sem buracos)');return false;}em.pos=r.pos;em.col=r.col;em.faces=r.faces;n=r.pos.length/3;});o.mask=null;
    if(n)toast('Remesh: '+n+' vértices em '+Math.round(performance.now()-t0)+' ms');}
  catch(err){toast('Remesh falhou: '+err.message,3500);}
};
})();
