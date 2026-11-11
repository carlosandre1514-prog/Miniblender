'use strict';
/* =====================================================================
   MiniBlender · Personagem humano realista + Remesh por voxel

   O corpo vem da malha base do MakeHuman (www.makehumancommunity.org,
   assets CC0), modelada a partir de medidas antropométricas reais:
   ~13,5 mil vértices com rosto, orelhas, dedos e olhos. As proporções
   mudam com os morphs originais (gênero, idade, músculo, peso, etnia e
   medidas como busto/cintura/quadril). assets/human.bin.gz é gerado por
   tools/build_human.py.
   - Rig de 17 ossos posicionado pelas juntas da própria malha.
   - Textura de pele real (rosto, lábios, sobrancelhas) com tom ajustável,
     roupas pintadas e olhos.
   ===================================================================== */
(function(){
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
let HUMAN=null,loading=null;
const IMG={};
function loadImage(name){return IMG[name]?Promise.resolve(IMG[name]):new Promise((res,rej)=>{const im=new Image();im.onload=()=>{IMG[name]=im;res(im);};im.onerror=()=>rej(new Error('não consegui carregar assets/'+name+'.jpg'));im.src=mbAsset('assets/'+name+'.jpg');});}
async function loadHuman(){
  if(HUMAN)return HUMAN;if(loading)return loading;
  loading=(async()=>{
    const resp=await fetch(mbAsset('assets/human.bin.gz'));if(!resp.ok)throw new Error('assets/human.bin.gz não encontrado ('+resp.status+')');
    let buf;
    // Alguns servidores já descomprimem .gz sozinhos (Content-Encoding); confere a assinatura gzip.
    const raw=await resp.arrayBuffer(),sig=new Uint8Array(raw,0,2);
    if(sig[0]===0x1f&&sig[1]===0x8b){if(!window.DecompressionStream)throw new Error('Navegador sem DecompressionStream; atualize o navegador');buf=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}else buf=raw;
    const hl=new DataView(buf).getUint32(0,true),head=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,4,hl))),base=4+hl;
    const T={float32:Float32Array,uint16:Uint16Array,int16:Int16Array,uint8:Uint8Array,int8:Int8Array};
    const arr=name=>{const m=head.arrays[name];if(!m)return null;const C=T[m.t];
      if(m.sh){const b=new Uint8Array(buf,base+m.o,m.n*2),out=new C(m.n),ob=new Uint8Array(out.buffer);for(let i=0;i<m.n;i++){ob[2*i]=b[i];ob[2*i+1]=b[m.n+i];}return out;}
      return new C(buf.slice(base+m.o,base+m.o+m.n*C.BYTES_PER_ELEMENT));};
    const H={head,pos:arr('pos'),quads:arr('quads'),fmat:arr('fmat'),uv:arr('uv'),flags:arr('flags'),macro:{},detail:{}};
    head.macro.forEach(m=>{if(m.bits)H.macro[m.name]={v:arr('m_'+m.name),s:m.scale};});
    head.detail.forEach(m=>{H.detail[m.name]={i:arr('d_i_'+m.name),v:arr('d_v_'+m.name),s:m.scale};});
    // UV por canto de triângulo, na ordem em que buildGeo triangula os quads (a,b,c),(a,c,d).
    const nF=head.nF,uc=new Array(nF*6);for(let f=0;f<nF;f++){const q=k=>[H.uv[f*8+k*2]/65535,H.uv[f*8+k*2+1]/65535];uc[f*6]=q(0);uc[f*6+1]=q(1);uc[f*6+2]=q(2);uc[f*6+3]=q(0);uc[f*6+4]=q(2);uc[f*6+5]=q(3);}
    H.uvCorners=uc;H.faces=[];for(let f=0;f<nF;f++)H.faces.push([H.quads[4*f],H.quads[4*f+1],H.quads[4*f+2],H.quads[4*f+3]]);
    H.topology=H.faces.map(f=>f.join(',')).join(';');
    // Couro cabeludo: faces do corpo com 3+ vértices junto do capacete de cabelo E acima da base do crânio
    // (o grupo helper-hair também tem marcadores soltos pelo corpo, que não contam).
    const hj=head.joints.Cabeca;let hy=0;hj.forEach(i=>hy+=H.pos[3*i+1]);hy/=hj.length;H.scalp=new Uint8Array(nF);H.scalpList=[];
    for(let f=0;f<nF;f++){if(H.fmat[f]!==0)continue;const q=H.faces[f];let sc=0,y=0;q.forEach(v=>{if(H.flags[v]&1)sc++;y+=H.pos[3*v+1];});if(sc>=3&&y/4>hy+0.02){H.scalp[f]=1;H.scalpList.push(f);}}
    await Promise.all(['skin_f','skin_m','skin_f_suit','skin_m_suit'].map(loadImage));
    // Completa o couro cabeludo: faces vizinhas (acima da base do crânio) cujo centro cai em cabelo pintado na textura original.
    {const cv2=document.createElement('canvas');cv2.width=cv2.height=256;const cx=cv2.getContext('2d');cx.drawImage(IMG.skin_m_suit,0,0,256,256);const px=cx.getImageData(0,0,256,256).data;
      const dark=f=>{let u=0,v=0;for(let k=0;k<4;k++){u+=H.uv[f*8+2*k];v+=H.uv[f*8+2*k+1];}const x=Math.min(255,u/4/65535*256|0),y=Math.min(255,v/4/65535*256|0),i=(y*256+x)*4;return (px[i]+px[i+1]+px[i+2])/765<0.42;};
      const cy=f=>{let y=0;H.faces[f].forEach(v=>y+=H.pos[3*v+1]);return y/4;};
      for(let pass=0;pass<4;pass++){const vs=new Set();H.scalpList.forEach(f=>H.faces[f].forEach(v=>vs.add(v)));
        for(let f=0;f<nF;f++){if(H.scalp[f]||H.fmat[f]!==0||cy(f)<hy+0.02)continue;if(H.faces[f].some(v=>vs.has(v))&&dark(f)){H.scalp[f]=1;H.scalpList.push(f);}}}}
    HUMAN=H;return H;
  })();
  try{return await loading;}catch(e){loading=null;throw e;}
}
window.loadHuman=loadHuman;

const CHAR_DEF={gender:1,age:25,muscle:0.5,weight:0.5,height:0,race:'caucasian',detail:{},
  skin:'#e3b392',outfit:'roupa',shirt:'#3a7bd5',pants:'#2b2f3a',shoes:'#1c1c1c',hair:'curto',hairColor:'#2b1a0e',eyeColor:'#5b3a1e'};
const PRESETS={
  'Homem':{gender:1},
  'Mulher':{gender:0,shirt:'#c2185b'},
  'Atleta (H)':{gender:1,muscle:0.85,weight:0.45,detail:{'torso-vshape':0.5},outfit:'traje'},
  'Atleta (M)':{gender:0,muscle:0.8,weight:0.4,outfit:'traje'},
  'Fisiculturista':{gender:1,muscle:1,weight:0.55,detail:{'torso-muscle-pectoral':0.8,'torso-muscle-dorsi':0.8,'measure-upperarm-circ':0.6,'torso-vshape':0.8},shirt:'#2e7d32'},
  'Acima do peso':{gender:1,muscle:0.3,weight:1,shirt:'#795548'},
  'Magra':{gender:0,muscle:0.3,weight:0.1,shirt:'#7e57c2'},
  'Idoso':{gender:1,age:75,muscle:0.3,weight:0.55,hairColor:'#c9c9c9',shirt:'#546e7a'},
  'Idosa':{gender:0,age:75,muscle:0.25,weight:0.55,hairColor:'#d6d6d6',shirt:'#5e7f6b'},
  'Menino':{gender:1,age:10,shirt:'#ff9800'},
  'Menina':{gender:0,age:10,shirt:'#ec407a'}
};
window.CHAR_PRESETS=PRESETS;
const SKIN_BY_RACE={caucasian:'#e3b392',asian:'#dcae82',african:'#7b4a2e'};

/* ---------- Pesos dos morphs (mesmas fórmulas do MakeHuman) ---------- */
function macroWeights(c){
  const g=clamp(c.gender,0,1),yrs=clamp(c.age,10,90),a=yrs<25?0.1875+(yrs-10)/15*(0.5-0.1875):0.5+(yrs-25)/65*0.5;
  const age={child:a<0.5?Math.max(0,1-(a-0.1875)*3.2):0,old:a>0.5?(a-0.5)*2:0};age.young=1-age.child-age.old;
  const tri=v=>{const mx=Math.max(0,v*2-1),mn=Math.max(0,1-v*2);return {min:mn,max:mx,average:1-mx-mn};},mu=tri(clamp(c.muscle,0,1)),wt=tri(clamp(c.weight,0,1));
  const race=c.race==='mista'?{caucasian:1/3,asian:1/3,african:1/3}:{caucasian:0,asian:0,african:0,[c.race||'caucasian']:1};
  const W={};
  for(const [gn,gv] of [['female',1-g],['male',g]])for(const an of ['child','young','old']){
    for(const m of ['min','average','max'])for(const w of ['min','average','max'])W[`universal-${gn}-${an}-${m}muscle-${w}weight`]=gv*age[an]*mu[m]*wt[w];
    for(const r in race)W[`${r}-${gn}-${an}`]=gv*age[an]*race[r];
  }
  return W;
}
function morph(c){
  const H=HUMAN,n=H.head.nT,P=new Float32Array(H.pos),W=macroWeights(c);
  for(const k in W){const w=W[k],t=H.macro[k];if(!t||w<1e-4)continue;const s=t.s*w,v=t.v;for(let i=0;i<n*3;i++)P[i]+=v[i]*s;}
  const D={...(c.detail||{})};
  // busto: só faz sentido na proporção feminina
  if(c.bust){D['breast-'+(c.bust>0?'maxcup':'mincup')]=-Math.abs(c.bust)*(1-clamp(c.gender,0,1));}
  for(const k in D){const val=D[k];if(!val)continue;
    const t=k.startsWith('breast-')?H.detail[k]:H.detail[k+(val>0?'-incr':'-decr')];if(!t)continue;const s=t.s*Math.abs(val),ix=t.i,v=t.v;
    for(let j=0;j<ix.length;j++){const i=ix[j]*3;P[i]+=v[3*j]*s;P[i+1]+=v[3*j+1]*s;P[i+2]+=v[3*j+2]*s;}}
  // altura: escala uniforme sobre a altura natural do morph; pés no chão
  let minY=Infinity,maxY=-Infinity;for(let i=0;i<H.head.nR;i++){const y=P[3*i+1];if(y<minY)minY=y;if(y>maxY)maxY=y;}
  const natural=maxY-minY,sc=c.height>0?c.height/natural:1;
  for(let i=0;i<n;i++){P[3*i]*=sc;P[3*i+1]=(P[3*i+1]-minY)*sc;P[3*i+2]*=sc;}
  return {P,height:natural*sc,natural};
}
function jointPos(P){const J={};for(const k in HUMAN.head.joints){const ids=HUMAN.head.joints[k],v=V(0,0,0);ids.forEach(i=>v.add(V(P[3*i],P[3*i+1],P[3*i+2])));J[k]=v.divideScalar(ids.length);}return J;}
// Rig nos mesmos índices/nomes do rig padrão (IK e animações prontas funcionam).
function rigFromJoints(J){
  const rel=(a,b)=>b.clone().sub(a).toArray(),B=[
    {name:'Pelvis',parent:-1,p:J.Pelvis.toArray()},{name:'Coluna',parent:0,p:rel(J.Pelvis,J.Coluna)},{name:'Peito',parent:1,p:rel(J.Coluna,J.Peito)},
    {name:'Pescoco',parent:2,p:rel(J.Peito,J.Pescoco)},{name:'Cabeca',parent:3,p:rel(J.Pescoco,J.Cabeca),tail:rel(J.Cabeca,J.Cabeca_tail)}];
  for(const s of ['E','D']){const i0=B.length;
    B.push({name:'Braco_'+s,parent:2,p:rel(J.Peito,J['Braco_'+s])},{name:'Antebraco_'+s,parent:i0,p:rel(J['Braco_'+s],J['Antebraco_'+s])},{name:'Mao_'+s,parent:i0+1,p:rel(J['Antebraco_'+s],J['Mao_'+s]),tail:rel(J['Mao_'+s],J['Mao_'+s+'_tail'])});}
  for(const s of ['E','D']){const i0=B.length;
    B.push({name:'Coxa_'+s,parent:0,p:rel(J.Pelvis,J['Coxa_'+s])},{name:'Canela_'+s,parent:i0,p:rel(J['Coxa_'+s],J['Canela_'+s])},{name:'Pe_'+s,parent:i0+1,p:rel(J['Canela_'+s],J['Pe_'+s]),tail:rel(J['Pe_'+s],J['Pe_'+s+'_tail'])});}
  return {bones:B.map(b=>({...b,rot:[0,0,0]})),weights:null,selected:0,poseKeys:{}};
}
window.characterRig=c=>HUMAN?rigFromJoints(jointPos(morph(c).P)):null;

/* ---------- Textura: pele real + tom + roupas + cabelo + olhos ---------- */
const TEX=1024;
// Olhos: esclera no retângulo reservado do atlas e uma íris onde o UV da frente de cada olho cai.
function drawEyes(ctx,r,color,irises){
  const x=r[0]*TEX,y=r[1]*TEX,s=r[2]*TEX;
  ctx.fillStyle='#f1ece8';ctx.fillRect(x-2,y-2,s+4,s+4);
  for(const I of irises){
    const cx=I.u*TEX,cy=I.v*TEX,ir=I.r*TEX;
    let g=ctx.createRadialGradient(cx,cy,ir*1.1,cx,cy,ir*3.2);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(200,130,120,.5)');ctx.fillStyle=g;ctx.fillRect(x,y,s,s);
    const c=new THREE.Color(color),hx=k=>'#'+c.clone().multiplyScalar(k).getHexString();
    g=ctx.createRadialGradient(cx,cy,ir*0.25,cx,cy,ir);g.addColorStop(0,hx(1.6));g.addColorStop(0.55,hx(1));g.addColorStop(0.88,hx(0.45));g.addColorStop(1,'#1a120c');ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,ir,0,7);ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.22)';ctx.lineWidth=1;for(let i=0;i<36;i++){const a=i/36*6.283;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*ir*0.42,cy+Math.sin(a)*ir*0.42);ctx.lineTo(cx+Math.cos(a)*ir*0.95,cy+Math.sin(a)*ir*0.95);ctx.stroke();}
    ctx.fillStyle='#050505';ctx.beginPath();ctx.arc(cx,cy,ir*0.42,0,7);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.85)';ctx.beginPath();ctx.arc(cx-ir*0.3,cy-ir*0.3,ir*0.14,0,7);ctx.fill();
  }
}
// Onde fica a pupila no atlas: UV do vértice mais à frente de cada globo ocular e a escala UV/3D ao redor dele.
function irisUV(P){
  const H=HUMAN,out=[];
  for(const m of [1,2]){
    const vs=new Map();for(let f=0;f<H.head.nF;f++){if(H.fmat[f]!==m)continue;for(let k=0;k<4;k++)vs.set(H.faces[f][k],[H.uv[f*8+2*k]/65535,H.uv[f*8+2*k+1]/65535]);}
    let c=V(0,0,0);vs.forEach((_,v)=>c.add(V(P[3*v],P[3*v+1],P[3*v+2])));c.divideScalar(vs.size);
    let front=-1,fz=-Infinity,R=0;vs.forEach((_,v)=>{const z=P[3*v+2];if(z>fz){fz=z;front=v;}R=Math.max(R,V(P[3*v],P[3*v+1],P[3*v+2]).distanceTo(c));});
    const fp=V(P[3*front],P[3*front+1],P[3*front+2]),fu=vs.get(front);let sum=0,n=0;
    vs.forEach((uv,v)=>{if(v===front)return;const d=V(P[3*v],P[3*v+1],P[3*v+2]).distanceTo(fp);if(d<R*0.8&&d>1e-5){sum+=Math.hypot(uv[0]-fu[0],uv[1]-fu[1])/d;n++;}});
    out.push({u:fu[0],v:fu[1],r:(n?sum/n:0.05/R)*R*0.5});
  }
  return out;
}
function facePath(ctx,f){const uv=HUMAN.uv;ctx.moveTo(uv[f*8]/65535*TEX,uv[f*8+1]/65535*TEX);for(let k=1;k<4;k++)ctx.lineTo(uv[f*8+k*2]/65535*TEX,uv[f*8+k*2+1]/65535*TEX);ctx.closePath();}
// Preenche face por face: um caminho único cancelaria faces com UV invertido (regra non-zero) e deixaria buracos.
function fillFaces(ctx,list,color){
  ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.lineJoin='round';
  for(const f of list){ctx.beginPath();facePath(ctx,f);ctx.fill();ctx.stroke();}
}
// Classifica cada face por osso mais próximo (para roupas) usando o rig já ajustado.
function faceRegions(P,rig,J,height){
  const H=HUMAN,segs=boneSegments(rig),nm=rig.bones.map(b=>b.name),R={shirt:[],pants:[],shoes:[],scalp:[],sleeve:[]};
  for(let f=0;f<H.head.nF;f++){
    if(H.fmat[f]!==0)continue;const q=H.faces[f];let x=0,y=0,z=0;q.forEach(v=>{x+=P[3*v];y+=P[3*v+1];z+=P[3*v+2];});x/=4;y/=4;z/=4;
    if(H.scalp[f]){R.scalp.push(f);continue;}
    let best=0,bd=Infinity;const p=[x,y,z];for(const s of segs){const d=pointSegDist2(p,s.a,s.e);if(d<bd){bd=d;best=s.i;}}const n=nm[best];
    if(n==='Pelvis'||n==='Coxa_E'||n==='Coxa_D'||n==='Canela_E'||n==='Canela_D'){
      // cintura: acima do umbigo é camisa
      if(n==='Pelvis'&&y>J.Pelvis.y+(J.Coluna.y-J.Pelvis.y)*0.55)R.shirt.push(f);
      else if((n==='Canela_E'||n==='Canela_D')&&y<J.Pe_E.y+0.035*height)R.shoes.push(f);else R.pants.push(f);
    }else if(n==='Pe_E'||n==='Pe_D')R.shoes.push(f);
    else if(n==='Coluna'||n==='Peito'){if(y<J.Pescoco.y-0.012*height)R.shirt.push(f);}
    else if(n==='Braco_E'||n==='Braco_D'){const s=n.endsWith('E')?'E':'D',sh=J['Braco_'+s],el=J['Antebraco_'+s];if(V(x,y,z).distanceTo(sh)<sh.distanceTo(el)*0.6)R.sleeve.push(f);}
  }
  return R;
}
function buildTexture(c,regions,P){
  const cvs=document.createElement('canvas');cvs.width=cvs.height=TEX;const ctx=cvs.getContext('2d'),male=c.gender>=0.5,suit=c.outfit==='traje';
  ctx.drawImage(IMG['skin_'+(male?'m':'f')+(suit?'_suit':'')],0,0,TEX,TEX);
  // Tom de pele: multiplica só os pixels "cor de pele" (preserva traje, cabelo e lábios).
  const tone=hexRgb(c.skin),ref=[0.87,0.67,0.55],k=tone.map((t,i)=>t/ref[i]),im=ctx.getImageData(0,0,TEX,TEX),d=im.data;
  if(Math.abs(k[0]-1)+Math.abs(k[1]-1)+Math.abs(k[2]-1)>0.03)for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];
    if(r>90&&r>g&&g>=b*0.95&&(r-b)<r*0.62&&(r-b)>r*0.1){const m=Math.min(1,(r-90)/60);d[i]=Math.min(255,r*(1+(k[0]-1)*m));d[i+1]=Math.min(255,g*(1+(k[1]-1)*m));d[i+2]=Math.min(255,b*(1+(k[2]-1)*m));}}
  ctx.putImageData(im,0,0);
  // Cabelo: o couro cabeludo pintado vem da textura do traje (a de pele é careca). Recolore só dentro da máscara do couro cabeludo.
  if(regions.scalp.length&&c.hair!=='careca'){
    const m=document.createElement('canvas');m.width=m.height=TEX;const mx=m.getContext('2d');
    mx.fillStyle='#fff';mx.strokeStyle='#fff';mx.lineWidth=2;for(const f of regions.scalp){mx.beginPath();facePath(mx,f);mx.fill();mx.stroke();}
    mx.globalCompositeOperation='source-in';mx.drawImage(IMG['skin_'+(male?'m':'f')+'_suit'],0,0,TEX,TEX);mx.globalCompositeOperation='source-over';
    const hi=mx.getImageData(0,0,TEX,TEX),hd=hi.data,hc=hexRgb(c.hairColor);
    for(let i=0;i<hd.length;i+=4){if(!hd[i+3])continue;const l=(hd[i]+hd[i+1]+hd[i+2])/765;
      // pixels escuros = fios (recebem a cor escolhida, mantendo o brilho dos fios); claros = pele na linha do cabelo
      if(l<0.45){const t=0.4+l*2.4;hd[i]=Math.min(255,hc[0]*255*t);hd[i+1]=Math.min(255,hc[1]*255*t);hd[i+2]=Math.min(255,hc[2]*255*t);}
      else if(l<0.6){const t=(0.6-l)/0.15,u=0.4+l*2.4;hd[i]=hd[i]*(1-t)+Math.min(255,hc[0]*255*u)*t;hd[i+1]=hd[i+1]*(1-t)+Math.min(255,hc[1]*255*u)*t;hd[i+2]=hd[i+2]*(1-t)+Math.min(255,hc[2]*255*u)*t;hd[i+3]=255*t;}
      else hd[i+3]=0;}
    mx.putImageData(hi,0,0);ctx.drawImage(m,0,0);
  }
  if(c.outfit==='roupa'){fillFaces(ctx,regions.shirt.concat(regions.sleeve),c.shirt);fillFaces(ctx,regions.pants,c.pants);fillFaces(ctx,regions.shoes,c.shoes);
    // leve textura de tecido
    ctx.globalAlpha=0.06;for(let i=0;i<5000;i++){ctx.fillStyle=Math.random()<0.5?'#000':'#fff';ctx.fillRect(Math.random()*TEX,Math.random()*TEX,2,2);}ctx.globalAlpha=1;}
  drawEyes(ctx,HUMAN.head.eyeRect,c.eyeColor,irisUV(P));
  return cvs;
}
function applyCharTexture(o,cvs){
  o._uvCanvas=cvs;if(o._uvTexture)o._uvTexture.dispose();o._uvTexture=new THREE.CanvasTexture(cvs);o._uvTexture.flipY=false;o._uvTexture.encoding=THREE.sRGBEncoding;o._uvTexture.anisotropy=4;
  o.uvData=cvs.toDataURL('image/jpeg',0.9);o.textureData=o.textureData||{};o.textureData.base=o.uvData;o._textureRefs=o._textureRefs||{};o._textureRefs.base=o._uvTexture;
  o.mat.map=o._uvTexture;o.mat.color.set(0xffffff);o.mat.needsUpdate=true;need=true;
}
function buildCharacter(c){
  const H=HUMAN,M=morph(c),P=M.P,nR=H.head.nR,J=jointPos(P),rig=rigFromJoints(J);
  const em={pos:Array.from(P.subarray(0,nR*3)),col:new Array(nR*3).fill(1),faces:H.faces.map(f=>f.slice())};
  return {em,rig,J,P,height:M.height,regions:faceRegions(P,rig,J,M.height)};
}
function setupUV(o){o.uvCorners=HUMAN.uvCorners;o.uvTopology=HUMAN.topology;o.uvMode='unwrap';o.uvSeams=[];o.uvSeamsInitialized=true;setGeometryUV(o,'unwrap');}
function finishChar(o,B,c){
  o.rig=B.rig;o.rig.weights=autoWeights(o);initRigDeform(o);buildRigViz(o);
  applyCharTexture(o,buildTexture(c,B.regions,B.P));o._charHeight=B.height;
  // cabelo 3D opcional: fios só no couro cabeludo
  if(c.hair==='fios'||c.hair==='longo'){o.ext.fur={...(window.FUR_DEF||{}),...(c.hair==='longo'?{length:0.34,droop:2.2,segments:9,count:9000,width:0.004}:{length:0.05,droop:0.6,segments:3,count:9000,width:0.003}),random:0.3,root:'#'+new THREE.Color(c.hairColor).multiplyScalar(0.6).getHexString(),tip:c.hairColor,region:'scalp',seed:7,kind:'hair'};}
  else if(o.ext.fur&&o.ext.fur.region==='scalp')delete o.ext.fur;
  if(window.buildFur)buildFur(o);
}
// Triângulos do couro cabeludo (para o gerador de cabelo em effects.js).
window.charRegionFaces=(o,region)=>(!HUMAN||!o.ext||!o.ext.char||region!=='scalp'||o.em.faces.length!==HUMAN.head.nF)?null:HUMAN.scalpList;

async function createCharacter(params,silent){
  await loadHuman();
  const c={...CHAR_DEF,...(params||{})};c.detail={...(c.detail||{})};if(!params||!params.skin)c.skin=SKIN_BY_RACE[c.race]||c.skin;
  const t0=performance.now(),B=buildCharacter(c);
  const o=createObject('Personagem '+(S.objs.length+1),B.em,{flat:false});o.ext.char=c;o.params.color='#ffffff';o.params.rough=0.62;applyMaterial(o);setupUV(o);
  finishChar(o,B,c);
  if(!silent){selectObj(o);push(()=>removeObj(o,true),()=>{scene.add(o.mesh);S.objs.push(o);selectObj(o);});$('#fFrame').click();
    toast('Personagem criado: '+B.height.toFixed(2)+' m, '+B.em.pos.length/3+' vértices, rig de 17 ossos ('+Math.round(performance.now()-t0)+' ms)',3200);}
  return o;
}
window.createCharacter=createCharacter;
async function regenerate(o){
  await loadHuman();const c=o.ext.char,keys=o.rig?o.rig.poseKeys:{},B=buildCharacter(c);
  if(o.rigPreviewRoot){o.mesh.remove(o.rigPreviewRoot);o.rigPreviewRoot=null;o.rigPreviewBones=null;}
  o.em=B.em;o.mask=null;o.rig=null;o.uvCorners=HUMAN.uvCorners;o.uvTopology=HUMAN.topology;o.uvSeamsInitialized=true;o.uvData=null;
  rebuildGeo(o);setupUV(o);B.rig.poseKeys=keys;finishChar(o,B,c);applyRigFrame(o,S.frame);hud();
}
// Só a textura (cores/roupa/olhos) — não mexe na malha, então preserva a escultura.
async function retexture(o){await loadHuman();const c=o.ext.char,M=morph(c),J=jointPos(M.P),rig=rigFromJoints(J);applyCharTexture(o,buildTexture(c,faceRegions(M.P,rig,J,M.height),M.P));
  if(o.ext.fur&&o.ext.fur.region==='scalp'){o.ext.fur.tip=c.hairColor;o.ext.fur.root='#'+new THREE.Color(c.hairColor).multiplyScalar(0.6).getHexString();buildFur(o);}}
// Ao abrir um projeto salvo, recarrega os dados humanos se houver personagem (para ajustar depois).
on('load',()=>{if(S.objs.some(o=>o.ext&&o.ext.char))loadHuman().catch(()=>{});});

let regenT=0,texT=0;
function panelChar(P){
  const busy=h('span',{class:'note'},loading&&!HUMAN?'Carregando corpo humano…':'');
  P.append(row(lb('Novo'),...Object.keys(PRESETS).map(k=>chip(k,async()=>{try{toast('Montando personagem…',900);await createCharacter(PRESETS[k]);renderPanel();}catch(e){toast('Erro: '+e.message,4000);}})),busy));
  const o=S.sel,c=o&&o.ext&&o.ext.char;
  if(!c){P.append(h('div',{class:'note'},'Corpo humano real: a malha e as proporções vêm do MakeHuman (medidas antropométricas de pessoas reais, licença CC0) — rosto, orelhas, mãos com dedos, pés e olhos. Toque num modelo e ajuste gênero, idade, músculos, peso e medidas. Já vem com rig de 17 ossos.'));return;}
  const re=()=>{clearTimeout(regenT);regenT=setTimeout(()=>regenerate(o).catch(e=>toast('Erro: '+e.message)),220);};
  const tx=()=>{clearTimeout(texT);texT=setTimeout(()=>retexture(o).catch(e=>toast('Erro: '+e.message)),150);};
  const sl=(t,k,a,b,st,fmt)=>slider(t,a,b,st,c[k],v=>{c[k]=v;re();},fmt||(v=>(+v).toFixed(2)));
  const dt=(t,k)=>slider(t,-1,1,0.01,c.detail[k]||0,v=>{c.detail[k]=v;re();},v=>(v>0?'+':'')+(+v).toFixed(2));
  P.append(h('div',{class:'note'},'Corpo: '+(o._charHeight||0).toFixed(2)+' m. Mudar a forma regenera a malha (perde a escultura); cores e roupas não.'));
  P.append(sl('Gênero (M ↔ H)','gender',0,1,0.01),sl('Idade (anos)','age',10,90,1,v=>Math.round(v)+''),sl('Músculos','muscle',0,1,0.01),sl('Peso','weight',0,1,0.01),
    slider('Altura (m)',0,2.3,0.01,c.height,v=>{c.height=v<1?0:v;re();},v=>v<1?'natural':(+v).toFixed(2)));
  P.append(row(lb('Etnia'),...[['caucasian','Caucasiana'],['asian','Asiática'],['african','Africana'],['mista','Mista']].map(([k,t])=>chip(t,()=>{c.race=k;c.skin=SKIN_BY_RACE[k]||c.skin;re();renderPanel();},c.race===k))));
  P.append(h('div',{class:'lb'},'Medidas'));
  P.append(slider('Busto',-1,1,0.01,c.bust||0,v=>{c.bust=v;re();},v=>(+v).toFixed(2)),dt('Peitoral (músculo)','torso-muscle-pectoral'),dt('Costas (dorsais)','torso-muscle-dorsi'),dt('Tronco em V','torso-vshape'),dt('Ombros (largura)','measure-shoulder-dist'),
    dt('Cintura','measure-waist-circ'),dt('Abdômen definido','stomach-tone'),dt('Barriga','stomach-pregnant'),dt('Quadril','measure-hips-circ'),dt('Glúteos','buttocks-volume'),
    dt('Braço (grossura)','measure-upperarm-circ'),dt('Braço (comprimento)','measure-upperarm-length'),dt('Antebraço (comprimento)','measure-lowerarm-length'),
    dt('Coxa (grossura)','measure-thigh-circ'),dt('Panturrilha','measure-calf-circ'),dt('Coxa (comprimento)','measure-upperleg-height'),dt('Canela (comprimento)','measure-lowerleg-height'),
    dt('Pescoço (grossura)','measure-neck-circ'),dt('Pescoço (altura)','measure-neck-height'),dt('Tronco (altura)','measure-napetowaist-dist'));
  P.append(h('div',{class:'lb'},'Aparência'));
  P.append(row(lb('Roupa'),...[['roupa','Camisa e calça'],['traje','Traje'],['pele','Só o corpo']].map(([k,t])=>chip(t,()=>{c.outfit=k;tx();renderPanel();},c.outfit===k))));
  P.append(row(lb('Cabelo'),...[['curto','Curto'],['fios','Curto + fios 3D'],['longo','Longo (fios 3D)'],['careca','Careca']].map(([k,t])=>chip(t,()=>{c.hair=k;re();renderPanel();},c.hair===k))));
  P.append(row(lb('Pele'),colorIn(c.skin,v=>{c.skin=v;tx();}),lb('Olhos'),colorIn(c.eyeColor,v=>{c.eyeColor=v;tx();}),lb('Cabelo'),colorIn(c.hairColor,v=>{c.hairColor=v;tx();}),
    lb('Camisa'),colorIn(c.shirt,v=>{c.shirt=v;tx();}),lb('Calça'),colorIn(c.pants,v=>{c.pants=v;tx();}),lb('Sapato'),colorIn(c.shoes,v=>{c.shoes=v;tx();})));
  P.append(row(chip('Ir esculpir',()=>setWs('sculpt'),false,'act'),chip('Animar (Rig)',()=>setWs('rig')),chip('Caminhar',()=>{setWs('rig');makeRigPreset('walk');S.playing=true;renderPanel();}),chip('Correr',()=>{setWs('rig');makeRigPreset('run');S.playing=true;renderPanel();}),
    chip('Congelar (virar malha comum)',()=>{delete o.ext.char;renderPanel();toast('Agora é uma malha comum; o rig e a textura continuam.');})));
}
PANELS_EXT.char=panelChar;
TABS.splice(TABS.findIndex(t=>t[0]==='sculpt'),0,['char','Personagem']);

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
