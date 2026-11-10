'use strict';
/* =====================================================================
   MiniBlender · Efeitos: sistemas de partículas (fogo, fumaça, faíscas,
   neve, chuva, magia, explosão, água), pelo/cabelo, física de corpo
   rígido (cair/quicar, bake em keyframes) e estilhaçar objetos.
   ===================================================================== */
(function(){
const FX={systems:[],uid:0,sel:-1,preview:true};
window.FX=FX;
const PRESETS={
  fire:{name:'Fogo',rate:180,life:0.9,speed:0.6,dir:[0,1,0],spread:0.25,gravity:-1.2,drag:0.4,size:0.35,sizeEnd:0.04,c0:'#ffd23f',c1:'#ff2a00',a0:1,a1:0,turb:0.7,add:true,shape:'surface',sprite:'soft'},
  smoke:{name:'Fumaça',rate:40,life:3.2,speed:0.45,dir:[0,1,0],spread:0.3,gravity:-0.35,drag:0.6,size:0.3,sizeEnd:1.3,c0:'#8a8a8a',c1:'#202020',a0:0.55,a1:0,turb:0.5,add:false,shape:'surface',sprite:'smoke'},
  sparks:{name:'Faíscas',rate:120,life:1.2,speed:3,dir:[0,1,0],spread:0.9,gravity:6,drag:0.5,size:0.06,sizeEnd:0.02,c0:'#fff2a0',c1:'#ff6a00',a0:1,a1:0.2,turb:0,add:true,shape:'point',sprite:'spark',ground:true},
  snow:{name:'Neve',rate:150,life:7,speed:0.15,dir:[0,-1,0],spread:0.2,gravity:0.25,drag:0.8,size:0.06,sizeEnd:0.06,c0:'#ffffff',c1:'#dfefff',a0:0.95,a1:0.8,turb:0.35,add:false,shape:'sky',sprite:'soft',ground:true},
  rain:{name:'Chuva',rate:500,life:1.1,speed:9,dir:[0,-1,0],spread:0.02,gravity:4,drag:0,size:0.035,sizeEnd:0.035,c0:'#a8d4ff',c1:'#a8d4ff',a0:0.7,a1:0.5,turb:0,add:false,shape:'sky',sprite:'soft'},
  magic:{name:'Magia',rate:110,life:2,speed:0.5,dir:[0,1,0],spread:1,gravity:-0.4,drag:0.3,size:0.12,sizeEnd:0,c0:'#00e5ff',c1:'#b04dff',a0:1,a1:0,turb:1.3,add:true,shape:'surface',sprite:'spark',swirl:1.5},
  explosion:{name:'Explosão',rate:0,burst:900,life:1.6,speed:4.5,dir:[0,1,0],spread:1,gravity:1,drag:2.2,size:0.45,sizeEnd:1.6,c0:'#fff3b0',c1:'#ff3d00',a0:1,a1:0,turb:0.8,add:true,shape:'point',sprite:'soft'},
  water:{name:'Fonte de água',rate:260,life:1.6,speed:4,dir:[0,1,0],spread:0.12,gravity:9.8,drag:0.05,size:0.07,sizeEnd:0.05,c0:'#5ac8fa',c1:'#e0f6ff',a0:0.9,a1:0.3,turb:0,add:false,shape:'point',sprite:'soft',ground:true},
  dust:{name:'Poeira / pó',rate:60,life:4,speed:0.05,dir:[0,1,0],spread:1,gravity:-0.02,drag:0.5,size:0.03,sizeEnd:0.03,c0:'#fff6d6',c1:'#ffdca8',a0:0.8,a1:0,turb:0.25,add:true,shape:'box',sprite:'soft'}
};
window.FX_PRESETS=PRESETS;
window.makeFX=(preset,emitterId)=>makeSystem(preset,emitterId);
window.fxRebuildMat=s=>rebuildMat(s);
const SPR={};
function sprite(kind){
  if(SPR[kind])return SPR[kind];const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
  if(kind==='spark'){const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(0.15,'rgba(255,255,255,.9)');g.addColorStop(0.4,'rgba(255,255,255,.15)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);}
  else if(kind==='smoke'){for(let i=0;i<14;i++){const px=20+Math.random()*24,py=20+Math.random()*24,r=10+Math.random()*14,g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'rgba(255,255,255,.35)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);}}
  else{const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(0.5,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);}
  return (SPR[kind]=new THREE.CanvasTexture(c));
}
const VS=`attribute float size;attribute vec4 rgba;varying vec4 vC;uniform float uScale;
void main(){vC=rgba;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*uScale/max(0.05,-mv.z);gl_Position=projectionMatrix*mv;}`;
const FS=`uniform sampler2D map;varying vec4 vC;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(vC.rgb,vC.a*t.a);if(gl_FragColor.a<0.004)discard;}`;
const MAXP=6000;
function makeSystem(preset,emitterId){
  const P=PRESETS[preset]||PRESETS.fire;
  const sys={id:++FX.uid,preset,name:P.name+' '+(FX.systems.length+1),emitter:emitterId==null?null:emitterId,startFrame:0,offset:[0,0,0],areaSize:6,seed:Math.floor(Math.random()*1e6),...JSON.parse(JSON.stringify(P))};
  delete sys.name;sys.name=P.name+' '+(FX.systems.length+1);
  build(sys);FX.systems.push(sys);FX.sel=FX.systems.length-1;resetSim(sys);return sys;
}
function build(sys){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(MAXP*3),3));g.setAttribute('size',new THREE.BufferAttribute(new Float32Array(MAXP),1));g.setAttribute('rgba',new THREE.BufferAttribute(new Float32Array(MAXP*4),4));g.setDrawRange(0,0);
  const m=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:FS,uniforms:{map:{value:sprite(sys.sprite)},uScale:{value:600}},transparent:true,depthWrite:false,blending:sys.add?THREE.AdditiveBlending:THREE.NormalBlending});
  const pts=new THREE.Points(g,m);pts.frustumCulled=false;pts.renderOrder=5;scene.add(pts);sys._pts=pts;
}
function rebuildMat(sys){const m=sys._pts.material;m.blending=sys.add?THREE.AdditiveBlending:THREE.NormalBlending;m.uniforms.map.value=sprite(sys.sprite);m.needsUpdate=true;}
function rng(sys){let s=sys._rs|0;return ()=>{s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;sys._rs=s;return ((t^(t>>>14))>>>0)/4294967296;};}
function resetSim(sys){sys._p=[];sys._acc=0;sys._t=0;sys._rs=sys.seed;sys._burstDone=false;sys._simFrame=0;sys._rand=rng(sys);upload(sys);}
// Amostra um ponto na superfície do emissor (ponderado por área).
function surfaceSample(sys,o,R){
  if(!o._fxArea||o._fxAreaN!==o.em.faces.length){const tris=[],acc=[];let A=0;const P=o.em.pos;o.em.faces.forEach(f=>{for(let k=1;k<f.length-1;k++){const a=f[0],b=f[k],c=f[k+1];const ab=new THREE.Vector3(P[3*b]-P[3*a],P[3*b+1]-P[3*a+1],P[3*b+2]-P[3*a+2]),ac=new THREE.Vector3(P[3*c]-P[3*a],P[3*c+1]-P[3*a+1],P[3*c+2]-P[3*a+2]);A+=ab.cross(ac).length()/2;tris.push([a,b,c]);acc.push(A);}});o._fxArea={tris,acc,A};o._fxAreaN=o.em.faces.length;}
  const T=o._fxArea;if(!T.tris.length)return null;const r=R()*T.A;let lo=0,hi=T.acc.length-1;while(lo<hi){const m=(lo+hi)>>1;if(T.acc[m]<r)lo=m+1;else hi=m;}
  const [a,b,c]=T.tris[lo],P=o.em.pos;let u=R(),v=R();if(u+v>1){u=1-u;v=1-v;}const w=1-u-v;
  const p=new THREE.Vector3(P[3*a]*w+P[3*b]*u+P[3*c]*v,P[3*a+1]*w+P[3*b+1]*u+P[3*c+1]*v,P[3*a+2]*w+P[3*b+2]*u+P[3*c+2]*v).applyMatrix4(o.mesh.matrixWorld);
  const n=new THREE.Vector3(...faceNormal(o.em,[a,b,c])).transformDirection(o.mesh.matrixWorld);return {p,n};
}
function spawn(sys,n){
  const R=sys._rand,o=sys.emitter!=null?S.objs.find(x=>x.id===sys.emitter):null;
  const base=o?o.mesh.getWorldPosition(new THREE.Vector3()):new THREE.Vector3();base.add(new THREE.Vector3(...sys.offset));
  const dir=new THREE.Vector3(...sys.dir).normalize();
  for(let i=0;i<n&&sys._p.length<MAXP;i++){
    let p=base.clone(),nrm=dir.clone();
    if(sys.shape==='surface'&&o){const s=surfaceSample(sys,o,R);if(s){p=s.p.add(new THREE.Vector3(...sys.offset));nrm=s.n.lerp(dir,0.5).normalize();}}
    else if(sys.shape==='sky'){p.set(base.x+(R()-0.5)*sys.areaSize,base.y+4+R()*0.5,base.z+(R()-0.5)*sys.areaSize);}
    else if(sys.shape==='box'){p.set(base.x+(R()-0.5)*sys.areaSize,base.y+R()*sys.areaSize*0.5,base.z+(R()-0.5)*sys.areaSize);}
    const rnd=new THREE.Vector3(R()*2-1,R()*2-1,R()*2-1).normalize(),v=nrm.clone().lerp(rnd,sys.spread).normalize().multiplyScalar(sys.speed*(0.6+0.8*R()));
    sys._p.push({x:p.x,y:p.y,z:p.z,vx:v.x,vy:v.y,vz:v.z,age:0,life:sys.life*(0.7+0.6*R()),r:R()});
  }
}
const C0=new THREE.Color(),C1=new THREE.Color();
function step(sys,dt){
  sys._t+=dt;
  if(sys.burst&&!sys._burstDone){spawn(sys,sys.burst);sys._burstDone=true;}
  if(sys.rate>0){sys._acc+=sys.rate*dt;const n=Math.floor(sys._acc);sys._acc-=n;spawn(sys,n);}
  const g=sys.gravity,dr=Math.exp(-sys.drag*dt),tb=sys.turb,sw=sys.swirl||0,T=sys._t;
  const keep=[];for(const q of sys._p){q.age+=dt;if(q.age>=q.life)continue;
    if(tb){const f=1.3;q.vx+=(vnoise3(q.x*f,q.y*f+T,q.z*f)-0.5)*tb*dt*8;q.vy+=(vnoise3(q.x*f+31,q.y*f+T,q.z*f)-0.5)*tb*dt*8;q.vz+=(vnoise3(q.x*f,q.y*f+T,q.z*f+57)-0.5)*tb*dt*8;}
    if(sw){const vx=-q.z*sw,vz=q.x*sw;q.vx+=vx*dt;q.vz+=vz*dt;}
    q.vy-=g*dt;q.vx*=dr;q.vy*=dr;q.vz*=dr;q.x+=q.vx*dt;q.y+=q.vy*dt;q.z+=q.vz*dt;
    if(sys.ground&&q.y<0){q.y=0;q.vy=-q.vy*0.3;q.vx*=0.7;q.vz*=0.7;}
    keep.push(q);}
  sys._p=keep;
}
function upload(sys){
  const g=sys._pts.geometry,P=g.attributes.position.array,Sz=g.attributes.size.array,Cc=g.attributes.rgba.array,n=Math.min(sys._p.length,MAXP);
  C0.set(sys.c0).convertSRGBToLinear();C1.set(sys.c1).convertSRGBToLinear();
  for(let i=0;i<n;i++){const q=sys._p[i],t=q.age/q.life;P[3*i]=q.x;P[3*i+1]=q.y;P[3*i+2]=q.z;Sz[i]=(sys.size+(sys.sizeEnd-sys.size)*t)*(0.7+0.6*q.r);
    Cc[4*i]=C0.r+(C1.r-C0.r)*t;Cc[4*i+1]=C0.g+(C1.g-C0.g)*t;Cc[4*i+2]=C0.b+(C1.b-C0.b)*t;Cc[4*i+3]=(sys.a0+(sys.a1-sys.a0)*t)*Math.min(1,q.age*12);}
  g.setDrawRange(0,n);g.attributes.position.needsUpdate=g.attributes.size.needsUpdate=g.attributes.rgba.needsUpdate=true;need=true;
}
function uScale(hpx){return hpx/(2*Math.tan(viewCam().fov*Math.PI/360));}
// Simulação determinística por quadro: volta no tempo = re-simula do começo.
function simTo(sys,frame){
  const fps=S.fps,target=Math.max(0,frame-sys.startFrame);
  if(target<sys._simFrame-0.01)resetSim(sys);
  let guard=0;while(sys._simFrame<target-1e-6&&guard++<2000){const d=Math.min(1,target-sys._simFrame);step(sys,d/fps);sys._simFrame+=d;}
  upload(sys);
}
on('frame',f=>FX.systems.forEach(s=>{if(f>=s.startFrame)simTo(s,f);else{resetSim(s);}}));
const _applyFrame=applyFrame;
window.applyFrame=function(f){_applyFrame(f);if(!S.playing)FX.systems.forEach(s=>{if(f>=s.startFrame)simTo(s,f);else resetSim(s);});};
// Pré-visualização em tempo real quando a animação está parada.
on('tick',dt=>{
  const hpx=renderer.getDrawingBufferSize(new THREE.Vector2()).y;FX.systems.forEach(s=>{s._pts.material.uniforms.uScale.value=uScale(hpx);});
  if(!S.playing&&FX.preview&&S.ws==='fx'&&FX.systems.length){FX.systems.forEach(s=>{step(s,Math.min(dt,0.05));upload(s);});}
});
on('beforeRender',()=>{const R=cv.getBoundingClientRect(),asp=S.rd.aspect||R.width/R.height,L=S.rd.res,H=asp>=1?Math.round(L/asp):L;FX.systems.forEach(s=>s._pts.material.uniforms.uScale.value=uScale(H));});

/* ===== Pelo / cabelo: cartões cruzados ao longo das normais ===== */
const FUR_DEF={count:3000,length:0.12,segments:4,droop:0.5,random:0.4,width:0.008,comb:0,root:'#5b3a1e',tip:'#d9a066',onlyPainted:false};
function buildFur(o){
  if(o._fur){o.mesh.remove(o._fur);o._fur.geometry.dispose();o._fur=null;}
  const F=o.ext.fur;if(!F||F.on===false)return;
  const R=rng({_rs:F.seed||1234}),pos=[],col=[],idx=[],cr=new THREE.Color(F.root),ct=new THREE.Color(F.tip);
  const tmp={};for(let s=0;s<F.count;s++){
    const smp=surfaceSampleLocal(o,R);if(!smp)break;
    if(F.onlyPainted){const c=smp.c;if(c[0]>0.95&&c[1]>0.95&&c[2]>0.95)continue;}
    const len=F.length*(1-F.random*R()),dir=smp.n.clone(),grav=new THREE.Vector3(0,-1,0),comb=new THREE.Vector3(0,0,1);
    let p=smp.p.clone(),seg=F.segments,side=new THREE.Vector3().crossVectors(dir,Math.abs(dir.y)<0.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)).normalize();
    const pts=[p.clone()];let d=dir.clone();
    for(let k=1;k<=seg;k++){d.addScaledVector(grav,F.droop*0.6/seg).addScaledVector(comb,F.comb/seg).normalize();p=p.clone().addScaledVector(d,len/seg);pts.push(p);}
    const w=F.width;[side,new THREE.Vector3().crossVectors(dir,side).normalize()].forEach(ax=>{
      const o0=pos.length/3;pts.forEach((q,k)=>{const t=k/seg,ww=w*(1-t*0.9);pos.push(q.x-ax.x*ww,q.y-ax.y*ww,q.z-ax.z*ww,q.x+ax.x*ww,q.y+ax.y*ww,q.z+ax.z*ww);const c=cr.clone().lerp(ct,t);col.push(c.r,c.g,c.b,c.r,c.g,c.b);});
      for(let k=0;k<seg;k++){const a=o0+k*2;idx.push(a,a+1,a+3,a,a+3,a+2);}
    });
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:0.75});
  o._fur=new THREE.Mesh(g,m);o._fur.castShadow=true;o._fur.raycast=()=>{};o.mesh.add(o._fur);need=true;
}
function surfaceSampleLocal(o,R){
  const s=surfaceSample(null,o,R);if(!s)return null;const inv=new THREE.Matrix4().copy(o.mesh.matrixWorld).invert();
  const p=s.p.applyMatrix4(inv),n=s.n.transformDirection(inv);
  // cor de vértice mais próxima (para "pelo só onde pintado")
  let best=0,bd=Infinity;const P=o.em.pos;for(let i=0;i<P.length/3;i+=Math.max(1,Math.floor(P.length/3/400))){const d=(P[3*i]-p.x)**2+(P[3*i+1]-p.y)**2+(P[3*i+2]-p.z)**2;if(d<bd){bd=d;best=i;}}
  return {p,n,c:[o.em.col[3*best],o.em.col[3*best+1],o.em.col[3*best+2]]};
}
window.buildFur=buildFur;
window.FUR_STYLES={pelo:{},grama:{root:'#1f4d14',tip:'#8fd14f',length:0.25,droop:0.2,width:0.01,count:5000},cabelo:{root:'#2b1a0e',tip:'#5c3b22',length:0.35,droop:1.2,width:0.006,count:4000,segments:6},pelucia:{root:'#c98b52',tip:'#f3d7b0',length:0.06,droop:0.1,width:0.006,count:8000}};
window.FUR_DEF=FUR_DEF;
let furT=0;
on('rebuild',o=>{if(o.ext&&o.ext.fur)buildFur(o);});
on('meshChanged',o=>{if(o.ext&&o.ext.fur){clearTimeout(furT);furT=setTimeout(()=>buildFur(o),200);}});

/* ===== Física de corpo rígido (bake em keyframes) ===== */
function bakeRigid(list,opt){
  const fps=S.fps,frames=S.endFrame,g=opt.gravity,bounce=opt.bounce,fric=opt.friction,bodies=list.map(o=>{
    o.mesh.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(o.mesh),sph=b.getBoundingSphere(new THREE.Sphere());
    const c=o.mesh.position.clone();return {o,p:c.clone(),v:new THREE.Vector3(...(opt.kick?[(Math.random()-0.5)*opt.kick,Math.random()*opt.kick*0.5,(Math.random()-0.5)*opt.kick]:[0,0,0])),
      q:o.mesh.quaternion.clone(),w:new THREE.Vector3((Math.random()-0.5)*opt.spin,(Math.random()-0.5)*opt.spin,(Math.random()-0.5)*opt.spin),r:sph.radius,bottom:c.y-b.min.y,center:sph.center.clone().sub(c)};
  });
  // Explosão radial a partir do centro do grupo.
  if(opt.explode){const cc=new THREE.Vector3();bodies.forEach(b=>cc.add(b.p));cc.divideScalar(bodies.length);bodies.forEach(b=>{const d=b.p.clone().add(b.center).sub(cc);if(d.lengthSq()<1e-6)d.set(Math.random()-0.5,1,Math.random()-0.5);b.v.addScaledVector(d.normalize(),opt.explode*(0.6+Math.random()*0.8));b.v.y+=opt.explode*0.4;});}
  const before=list.map(o=>JSON.stringify(o.keys)),sub=4,dt=1/fps/sub;
  list.forEach(o=>o.keys={});
  for(let f=0;f<=frames;f++){
    bodies.forEach(b=>{b.o.keys[f]={p:b.p.toArray(),q:b.q.toArray(),s:b.o.mesh.scale.toArray()};});
    for(let s=0;s<sub;s++){
      bodies.forEach(b=>{b.v.y-=g*dt;b.p.addScaledVector(b.v,dt);
        const wq=new THREE.Quaternion(b.w.x*dt*0.5,b.w.y*dt*0.5,b.w.z*dt*0.5,0).multiply(b.q);b.q.set(b.q.x+wq.x,b.q.y+wq.y,b.q.z+wq.z,b.q.w+wq.w).normalize();
        if(opt.ground&&b.p.y-b.bottom<0){b.p.y=b.bottom;if(b.v.y<0)b.v.y=-b.v.y*bounce;b.v.x*=1-fric;b.v.z*=1-fric;b.w.multiplyScalar(1-fric*0.6);if(Math.abs(b.v.y)<0.05)b.v.y=0;}
      });
      if(opt.collide)for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){const A=bodies[i],B=bodies[j],ca=A.p.clone().add(A.center),cb=B.p.clone().add(B.center),d=cb.sub(ca),L=d.length(),m=(A.r+B.r)*0.8;
        if(L>0&&L<m){const n=d.divideScalar(L),pen=(m-L)/2;A.p.addScaledVector(n,-pen);B.p.addScaledVector(n,pen);const rv=B.v.clone().sub(A.v).dot(n);if(rv<0){const imp=n.multiplyScalar(-(1+bounce)*rv/2);A.v.sub(imp);B.v.add(imp);}}}
    }
  }
  const after=list.map(o=>JSON.stringify(o.keys));
  push(()=>{list.forEach((o,i)=>o.keys=JSON.parse(before[i]));applyFrame(S.frame);},()=>{list.forEach((o,i)=>o.keys=JSON.parse(after[i]));applyFrame(S.frame);});
  S.frame=0;applyFrame(0);toast('Física calculada em '+(frames+1)+' quadros. Toque ▶ na aba Animar.');
}
window.bakeRigid=bakeRigid;
// Estilhaçar: divide a malha em pedaços por regiões (Voronoi nos centros das faces).
function shatter(o,pieces){
  const em=o.em,P=em.pos,F=em.faces,b=new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(P,3)),R=rng({_rs:777});
  const seeds=[];for(let i=0;i<pieces;i++)seeds.push(new THREE.Vector3(b.min.x+R()*(b.max.x-b.min.x),b.min.y+R()*(b.max.y-b.min.y),b.min.z+R()*(b.max.z-b.min.z)));
  const groups=seeds.map(()=>[]);F.forEach((f,fi)=>{const c=new THREE.Vector3();f.forEach(v=>c.add(new THREE.Vector3(P[3*v],P[3*v+1],P[3*v+2])));c.divideScalar(f.length);let best=0,bd=Infinity;seeds.forEach((s,i)=>{const d=s.distanceToSquared(c);if(d<bd){bd=d;best=i;}});groups[best].push(fi);});
  const made=[];groups.forEach((gr,i)=>{if(!gr.length)return;const part={pos:P.slice(),col:em.col.slice(),faces:gr.map(fi=>F[fi].slice())};compact(part);
    // centraliza o pivô do pedaço
    const c=new THREE.Vector3();for(let k=0;k<part.pos.length;k+=3)c.add(new THREE.Vector3(part.pos[k],part.pos[k+1],part.pos[k+2]));c.divideScalar(part.pos.length/3);for(let k=0;k<part.pos.length;k+=3){part.pos[k]-=c.x;part.pos[k+1]-=c.y;part.pos[k+2]-=c.z;}
    // Solidify leve para os pedaços não serem cascas finas
    const n=part.pos.length/3,N=new Float32Array(n*3);part.faces.forEach(f=>{const fn=faceNormal(part,f);f.forEach(v=>{N[3*v]+=fn[0];N[3*v+1]+=fn[1];N[3*v+2]+=fn[2];});});
    const th=0.03,cnt=new Map(),F2=part.faces.slice();for(let v=0;v<n;v++){const l=Math.hypot(N[3*v],N[3*v+1],N[3*v+2])||1;part.pos.push(part.pos[3*v]-N[3*v]/l*th,part.pos[3*v+1]-N[3*v+1]/l*th,part.pos[3*v+2]-N[3*v+2]/l*th);part.col.push(part.col[3*v],part.col[3*v+1],part.col[3*v+2]);}
    F2.forEach(f=>{part.faces.push(f.slice().reverse().map(v=>v+n));for(let k=0;k<f.length;k++){const key=ekey(f[k],f[(k+1)%f.length]);cnt.set(key,(cnt.get(key)||0)+1);}});F2.forEach(f=>{for(let k=0;k<f.length;k++){const a=f[k],bb=f[(k+1)%f.length];if(cnt.get(ekey(a,bb))===1)part.faces.push([bb,a,a+n,bb+n]);}});
    const c2=createObject(o.name+' caco '+(i+1),part,{flat:true});c2.params={...o.params};applyMaterial(c2);c.applyMatrix4(o.mesh.matrixWorld);c2.mesh.position.copy(c);c2.mesh.quaternion.copy(o.mesh.quaternion);c2.mesh.scale.copy(o.mesh.scale);made.push(c2);});
  scene.remove(o.mesh);S.objs=S.objs.filter(x=>x!==o);
  push(()=>{made.forEach(m=>removeObj(m,true));scene.add(o.mesh);S.objs.push(o);selectObj(o);},()=>{removeObj(o,true);made.forEach(m=>{scene.add(m.mesh);S.objs.push(m);});selectObj(made[0]);});
  selectObj(made[0]);return made;
}
window.shatterObject=shatter;

/* ===== Salvar ===== */
const strip=s=>{const o={};for(const k in s)if(!k.startsWith('_'))o[k]=s[k];return o;};
on('serialize',d=>{d.fx={systems:FX.systems.map(strip)};});
function clearFX(){FX.systems.forEach(s=>{scene.remove(s._pts);s._pts.geometry.dispose();});FX.systems=[];FX.sel=-1;}
on('clear',clearFX);
on('load',d=>{if(!d.fx)return;(d.fx.systems||[]).forEach(s=>{build(s);FX.systems.push(s);resetSim(s);});});
on('remove',o=>{if(o._fur){o.mesh.remove(o._fur);}});

/* ===== Painel ===== */
let physOpt={gravity:9.8,bounce:0.35,friction:0.08,spin:3,kick:0,explode:0,ground:true,collide:true};
function panelFX(P){
  P.append(row(lb('Partículas'),...Object.keys(PRESETS).map(k=>chip(PRESETS[k].name,()=>{const s=makeSystem(k,S.sel?S.sel.id:null);const ref=s;push(()=>{scene.remove(ref._pts);FX.systems=FX.systems.filter(x=>x!==ref);renderPanel();need=true;},()=>{scene.add(ref._pts);FX.systems.push(ref);renderPanel();});renderPanel();toast(PRESETS[k].name+(S.sel?' emitindo de '+S.sel.name:' na origem'));}))));
  if(FX.systems.length){
    if(FX.sel<0||FX.sel>=FX.systems.length)FX.sel=0;const s=FX.systems[FX.sel];
    const sel=h('select',{class:'field',onchange:e=>{FX.sel=+e.target.value;renderPanel();}});FX.systems.forEach((x,i)=>{const op=h('option',{value:i},x.name);if(i===FX.sel)op.selected=true;sel.append(op);});
    P.append(row(lb('Sistema'),sel,chip(FX.preview?'Prévia ao vivo':'Prévia parada',()=>{FX.preview=!FX.preview;renderPanel();},FX.preview,'cy'),chip('Reiniciar',()=>resetSim(s)),
      chip('Emissor = selecionado',()=>{s.emitter=S.sel?S.sel.id:null;resetSim(s);toast(S.sel?'Emissor: '+S.sel.name:'Emissor: origem');}),chip('Apagar',()=>{scene.remove(s._pts);FX.systems.splice(FX.sel,1);FX.sel=-1;renderPanel();need=true;})));
    P.append(row(lb('Forma'),...[['point','Ponto'],['surface','Superfície'],['sky','Céu (área)'],['box','Volume']].map(([k,t])=>chip(t,()=>{s.shape=k;resetSim(s);renderPanel();},s.shape===k,'cy')),
      chip('Aditivo (brilho)',()=>{s.add=!s.add;rebuildMat(s);renderPanel();},s.add,'cy'),chip('Colide no chão',()=>{s.ground=!s.ground;renderPanel();},!!s.ground,'cy')));
    P.append(row(lb('Cores'),colorIn(s.c0,v=>s.c0=v),h('span',{class:'note'},'→'),colorIn(s.c1,v=>s.c1=v),lb('Sprite'),...['soft','spark','smoke'].map(k=>chip(({soft:'Suave',spark:'Faísca',smoke:'Nuvem'})[k],()=>{s.sprite=k;rebuildMat(s);renderPanel();},s.sprite===k))));
    P.append(slider('Taxa (por s)',0,1500,1,s.rate,v=>s.rate=v),slider('Explosão (qtd.)',0,4000,10,s.burst||0,v=>{s.burst=v;}),slider('Vida (s)',0.1,10,0.05,s.life,v=>s.life=v),slider('Velocidade',0,15,0.05,s.speed,v=>s.speed=v),slider('Espalhamento',0,1,0.01,s.spread,v=>s.spread=v),
      slider('Gravidade',-10,15,0.05,s.gravity,v=>s.gravity=v),slider('Arrasto',0,5,0.05,s.drag,v=>s.drag=v),slider('Turbulência',0,4,0.05,s.turb,v=>s.turb=v),slider('Redemoinho',0,5,0.05,s.swirl||0,v=>s.swirl=v),
      slider('Tamanho inicial',0,3,0.005,s.size,v=>s.size=v),slider('Tamanho final',0,3,0.005,s.sizeEnd,v=>s.sizeEnd=v),slider('Opacidade inicial',0,1,0.01,s.a0,v=>s.a0=v),slider('Opacidade final',0,1,0.01,s.a1,v=>s.a1=v),
      slider('Área (céu/volume)',1,30,0.5,s.areaSize,v=>s.areaSize=v),slider('Começa no quadro',0,S.endFrame,1,s.startFrame,v=>s.startFrame=v));
  }else P.append(h('div',{class:'note'},'Selecione um objeto (Layout) e toque num efeito para ele emitir partículas da superfície. As partículas seguem a timeline e saem no Render e no vídeo.'));
  // Pelo
  P.append(h('div',{class:'lb'},'Pelo / cabelo / grama'));
  const o=S.sel;
  if(o){const F=o.ext.fur;
    P.append(row(chip(F?'Remover pelo':'Adicionar pelo em '+o.name,()=>{if(F){delete o.ext.fur;buildFur(o);}else{o.ext.fur={...FUR_DEF,seed:Math.floor(Math.random()*1e6)};buildFur(o);}renderPanel();},!!F,'act'),
      F?chip('Grama',()=>{Object.assign(F,{root:'#1f4d14',tip:'#8fd14f',length:0.25,droop:0.2,width:0.01,count:5000});buildFur(o);renderPanel();}):null,
      F?chip('Cabelo',()=>{Object.assign(F,{root:'#2b1a0e',tip:'#5c3b22',length:0.35,droop:1.2,width:0.006,count:4000,segments:6});buildFur(o);renderPanel();}):null,
      F?chip('Pelúcia',()=>{Object.assign(F,{root:'#c98b52',tip:'#f3d7b0',length:0.06,droop:0.1,width:0.006,count:8000});buildFur(o);renderPanel();}):null));
    if(F){let t;const rb=()=>{clearTimeout(t);t=setTimeout(()=>buildFur(o),120);};
      P.append(row(lb('Raiz'),colorIn(F.root,v=>{F.root=v;rb();}),lb('Ponta'),colorIn(F.tip,v=>{F.tip=v;rb();}),chip('Só onde pintado',()=>{F.onlyPainted=!F.onlyPainted;rb();renderPanel();},F.onlyPainted,'cy'),chip('Novo sorteio',()=>{F.seed=Math.floor(Math.random()*1e6);rb();})));
      P.append(slider('Quantidade',100,20000,100,F.count,v=>{F.count=v;rb();}),slider('Comprimento',0.01,1.5,0.005,F.length,v=>{F.length=v;rb();}),slider('Caimento',0,3,0.01,F.droop,v=>{F.droop=v;rb();}),
        slider('Pentear (Z)',-2,2,0.01,F.comb,v=>{F.comb=v;rb();}),slider('Variação',0,1,0.01,F.random,v=>{F.random=v;rb();}),slider('Espessura',0.001,0.05,0.001,F.width,v=>{F.width=v;rb();},v=>v.toFixed(3)),slider('Segmentos',2,10,1,F.segments,v=>{F.segments=v;rb();}));
      P.append(h('div',{class:'note'},'“Só onde pintado”: pinte de qualquer cor (aba Material › Pintar na malha) onde quer pelo; o branco fica sem.'));}
  }else P.append(h('div',{class:'note'},'Selecione um objeto para adicionar pelo, cabelo ou grama.'));
  // Física
  P.append(h('div',{class:'lb'},'Física (corpo rígido)'));
  P.append(row(chip('Cair e quicar: selecionado',()=>{if(!S.sel)return toast('Selecione um objeto');bakeRigid([S.sel],physOpt);},false,'act'),chip('Todos os objetos',()=>bakeRigid(S.objs.slice(),physOpt)),
    chip('Estilhaçar + explodir',()=>{if(!S.sel)return toast('Selecione um objeto');const made=shatter(S.sel,physOpt.pieces||14);bakeRigid(made,{...physOpt,explode:physOpt.explode||4});const fx=makeSystem('explosion',null);fx.offset=made[0].mesh.position.toArray();resetSim(fx);renderPanel();})));
  P.append(row(chip('Chão',()=>{physOpt.ground=!physOpt.ground;renderPanel();},physOpt.ground,'cy'),chip('Colisão entre objetos',()=>{physOpt.collide=!physOpt.collide;renderPanel();},physOpt.collide,'cy')));
  P.append(slider('Gravidade',0,30,0.1,physOpt.gravity,v=>physOpt.gravity=v),slider('Quique',0,0.95,0.01,physOpt.bounce,v=>physOpt.bounce=v),slider('Atrito',0,0.5,0.005,physOpt.friction,v=>physOpt.friction=v),
    slider('Giro',0,15,0.1,physOpt.spin,v=>physOpt.spin=v),slider('Empurrão inicial',0,10,0.1,physOpt.kick,v=>physOpt.kick=v),slider('Explosão (força)',0,15,0.1,physOpt.explode,v=>physOpt.explode=v),slider('Pedaços (estilhaçar)',3,60,1,physOpt.pieces||14,v=>physOpt.pieces=v));
  P.append(h('div',{class:'note'},'A física é gravada como keyframes (de 0 até a duração da aba Animar), então dá para editar, renderizar e exportar no GLB.'));
}
PANELS_EXT.fx=panelFX;
TABS.splice(TABS.findIndex(t=>t[0]==='anim'),0,['fx','Efeitos']);
})();
