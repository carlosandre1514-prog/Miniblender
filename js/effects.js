'use strict';
/* =====================================================================
   MiniBlender · Efeitos realistas
   - Partículas em quads instanciados (não pontos): alinham e esticam com
     a velocidade, giram, e cada tipo tem seu shader procedural:
     chama (línguas de fogo com ruído animado), fumaça (volume com erosão),
     brasas/faíscas (riscos), chuva (riscos + respingos no chão), gotas
     d'água (com brilho), neve, magia, poeira.
   - Fogo e explosão são compostos: chamas + brasas + fumaça + luz que tremula.
   - Raio: relâmpago ramificado (deslocamento do ponto médio) com clarão.
   - Superfície de água: ondas de Gerstner, Fresnel, reflexo do céu e do sol.
   - Gramado/pelo/cabelo: lâminas curvas com variação de cor e vento.
   - Física de corpo rígido e estilhaçar (gravados em keyframes).
   ===================================================================== */
(function(){
const FX={systems:[],uid:0,sel:-1,preview:true,clock:0};
window.FX=FX;
const UP=[0,1,0];
/* Cada preset é uma lista de camadas; a primeira é a principal. */
const PRESETS={
  fire:{name:'Fogo',layers:[
    {name:'Fogo',kind:'flame',rate:75,life:0.9,speed:0.85,dir:UP,spread:0.16,gravity:-1.6,drag:0.7,size:0.62,sizeEnd:0.3,tall:1.55,c0:'#ffc266',c1:'#ff3a08',a0:1,a1:0,turb:0.45,add:true,shape:'surface',light:{color:'#ff8a3c',intensity:5,dist:7,flicker:0.35,up:0.5}},
    {name:'Brasas',kind:'spark',rate:14,life:1.7,speed:1.5,dir:UP,spread:0.45,gravity:-0.5,drag:0.4,size:0.014,sizeEnd:0.006,stretch:0.03,c0:'#ffe0a0',c1:'#ff4a00',a0:1,a1:0,turb:1.8,add:true,shape:'surface'},
    {name:'Fumaça do fogo',kind:'smoke',rate:9,life:3.8,speed:0.75,dir:UP,spread:0.14,gravity:-0.45,drag:0.5,size:0.5,sizeEnd:2.0,c0:'#4a4440',c1:'#222222',a0:0.5,a1:0,turb:0.5,add:false,shape:'surface',spin:0.7,offset:[0,0.55,0]}]},
  smoke:{name:'Fumaça',layers:[{name:'Fumaça',kind:'smoke',rate:14,life:4.5,speed:0.6,dir:UP,spread:0.18,gravity:-0.4,drag:0.5,size:0.35,sizeEnd:2.0,c0:'#8c8c8c',c1:'#3a3a3a',a0:0.5,a1:0,turb:0.55,add:false,shape:'surface',spin:0.6}]},
  sparks:{name:'Faíscas',layers:[{name:'Faíscas',kind:'spark',rate:160,life:1.1,speed:3.6,dir:UP,spread:0.8,gravity:7,drag:0.4,size:0.012,sizeEnd:0.004,stretch:0.035,c0:'#fff2c0',c1:'#ff6a00',a0:1,a1:0.1,turb:0,add:true,shape:'point',ground:'bounce',light:{color:'#ffb060',intensity:2,dist:4,flicker:0.6,up:0.1}}]},
  snow:{name:'Neve',layers:[{name:'Neve',kind:'snow',rate:260,life:8,speed:0.6,dir:[0.05,-1,0],spread:0.12,gravity:0.15,drag:0.9,size:0.03,sizeEnd:0.03,c0:'#ffffff',c1:'#eef4ff',a0:0.95,a1:0.9,turb:0.5,add:false,shape:'sky',areaSize:8,ground:'stick'}]},
  rain:{name:'Chuva',layers:[{name:'Chuva',kind:'rain',rate:1100,life:1.3,speed:9.5,dir:[0.1,-1,0.03],spread:0.012,gravity:3,drag:0,size:0.011,sizeEnd:0.011,stretch:0.05,c0:'#cfe6ff',c1:'#cfe6ff',a0:0.5,a1:0.5,turb:0,add:false,shape:'sky',areaSize:9,ground:'splash'}]},
  water:{name:'Fonte de água',layers:[
    {name:'Água',kind:'drop',rate:520,life:1.7,speed:4.4,dir:UP,spread:0.09,gravity:9.8,drag:0.03,size:0.05,sizeEnd:0.04,stretch:0.022,c0:'#e6f6ff',c1:'#7fc4f0',a0:0.85,a1:0.6,turb:0,add:false,shape:'point',ground:'splash'},
    {name:'Névoa da água',kind:'glow',rate:45,life:1.4,speed:2.2,dir:UP,spread:0.3,gravity:3,drag:1.2,size:0.3,sizeEnd:0.6,c0:'#dff2ff',c1:'#dff2ff',a0:0.1,a1:0,turb:0.4,add:false,shape:'point'}]},
  magic:{name:'Magia',layers:[{name:'Magia',kind:'star',rate:90,life:2,speed:0.5,dir:UP,spread:1,gravity:-0.4,drag:0.3,size:0.11,sizeEnd:0,c0:'#7df9ff',c1:'#b04dff',a0:1,a1:0,turb:1.2,add:true,shape:'surface',swirl:1.5,light:{color:'#7fd0ff',intensity:2.5,dist:5,flicker:0.2,up:0.3}}]},
  explosion:{name:'Explosão',layers:[
    {name:'Explosão',kind:'flame',rate:0,burst:150,life:0.75,speed:3.2,dir:UP,spread:1,gravity:-0.8,drag:3.2,size:1.0,sizeEnd:1.7,tall:1.0,c0:'#ffd78a',c1:'#ff3d00',a0:1,a1:0,turb:0.6,add:true,shape:'point',light:{color:'#ffb060',intensity:40,dist:18,flicker:0.1,up:0.4,decay:5}},
    {name:'Estilhaços',kind:'spark',rate:0,burst:320,life:1.6,speed:9,dir:UP,spread:1,gravity:8,drag:0.6,size:0.016,sizeEnd:0.004,stretch:0.03,c0:'#fff0c0',c1:'#ff5a00',a0:1,a1:0,turb:0,add:true,shape:'point',ground:'bounce'},
    {name:'Fumaça da explosão',kind:'smoke',rate:0,burst:70,life:3.4,speed:2.6,dir:UP,spread:1,gravity:-0.5,drag:2.2,size:0.7,sizeEnd:2.8,c0:'#3a3430',c1:'#151515',a0:0.6,a1:0,turb:0.5,add:false,shape:'point',spin:0.5}]},
  dust:{name:'Poeira / pó',layers:[{name:'Poeira',kind:'glow',rate:60,life:4,speed:0.05,dir:UP,spread:1,gravity:-0.02,drag:0.5,size:0.03,sizeEnd:0.03,c0:'#fff6d6',c1:'#ffdca8',a0:0.7,a1:0,turb:0.25,add:true,shape:'box',areaSize:6}]},
  lightning:{name:'Raio',layers:[{name:'Raio',kind:'bolt',period:38,duration:7,height:6,jag:0.9,branches:5,width:0.16,c0:'#bcd4ff',spreadXZ:1.6,light:{color:'#cfe0ff',intensity:60}}]},
  energy:{name:'Skin de energia',layers:[
    {name:'Veias de energia',kind:'veins',c0:'#a855ff',intensity:1.8,scale:3.5,dark:0.55,idle:0.3,actStart:0,actLen:36},
    {name:'Núcleo',kind:'core',c0:'#b266ff',size:0.9,idle:0.25,actStart:0,actLen:36,light:{color:'#a060ff',intensity:6,dist:8}},
    {name:'Fragmentos',kind:'shards',c0:'#9d4dff',count:22,size:0.1,orbit:1.25,speed:0.5,idle:0.2,actStart:0,actLen:36},
    {name:'Raios na peça',kind:'arcs',c0:'#c9a0ff',count:7,width:0.035,jag:0.5,maxLen:0.9,idle:0.3,actStart:0,actLen:36},
    {name:'Partículas de energia',kind:'star',rate:45,life:1.6,speed:0.35,dir:UP,spread:1,gravity:-0.15,drag:0.5,size:0.07,sizeEnd:0,c0:'#d9b8ff',c1:'#7a3dff',a0:1,a1:0,turb:1,add:true,shape:'surface'},
    {name:'Onda de ativação',kind:'star',rate:0,burst:260,life:1.1,speed:3.2,dir:UP,spread:1,gravity:0,drag:2.5,size:0.1,sizeEnd:0,c0:'#ffffff',c1:'#a855ff',a0:1,a1:0,turb:0.3,add:true,shape:'surface',startFrame:30}]},
  shot:{name:'Tiro de energia',layers:[{name:'Tiro',kind:'beam',c0:'#b266ff',period:24,duration:9,length:8,width:0.16,dir:[1,0,0],light:{color:'#c090ff',intensity:25}}]},
  ocean:{name:'Água (lago/mar)',layers:[{name:'Água',kind:'ocean',size:14,waveH:0.09,waveLen:2.2,speed:1,chop:0.7,deep:'#0b3a55',shallow:'#2a8fa8',foam:0.5,y:0.05}]}
};
window.FX_PRESETS=PRESETS;
const KIND_ID={glow:0,flame:1,smoke:2,spark:3,rain:4,drop:5,ring:6,snow:7,star:8,core:9};
const ALIGN={spark:1,rain:1,drop:1,flame:1};

/* ---------- textura de ruído periódica (ladrilhável) ---------- */
let NOISE=null;
function noiseTex(){
  if(NOISE)return NOISE;const N=128,d=new Uint8Array(N*N*4),h=(x,y,p)=>hash3(((x%p)+p)%p,((y%p)+p)%p,p);
  const vn=(x,y,p)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);return (h(xi,yi,p)*(1-u)+h(xi+1,yi,p)*u)*(1-v)+(h(xi,yi+1,p)*(1-u)+h(xi+1,yi+1,p)*u)*v;};
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){let s=0,a=0.5,p=4;for(let o=0;o<5;o++){s+=vn(x/N*p,y/N*p,p)*a;a*=0.5;p*=2;}const v=clamp(s/0.97,0,1)*255;d.set([v,v,v,255],(y*N+x)*4);}
  NOISE=new THREE.DataTexture(d,N,N,THREE.RGBAFormat);NOISE.wrapS=NOISE.wrapT=THREE.RepeatWrapping;NOISE.magFilter=NOISE.minFilter=THREE.LinearFilter;NOISE.needsUpdate=true;return NOISE;
}
const TIME={value:0};

/* ---------- shaders das partículas ---------- */
const P_VS=`
attribute vec2 corner;attribute vec3 iPos;attribute vec3 iVel;attribute vec4 iData;
uniform float uAlign,uStretch,uTall,uSpin,uGround,uAnchor;
varying vec2 vUv;varying float vAge,vSeed,vAlpha;
void main(){
  vUv=corner+0.5;vAge=iData.y;vSeed=iData.z;vAlpha=iData.w;float size=iData.x;
  if(uGround>0.5){gl_Position=projectionMatrix*viewMatrix*vec4(iPos+vec3(corner.x,0.,corner.y)*size,1.);return;}
  vec4 mv=viewMatrix*vec4(iPos,1.);vec3 vv=(viewMatrix*vec4(iVel,0.)).xyz;float sp=length(vv.xy);
  vec2 up=vec2(0.,1.);if(uAlign>0.5&&sp>1e-4)up=vv.xy/sp;
  vec2 c=corner;
  if(uAlign<0.5&&abs(uSpin)>0.001){float a=vSeed*6.283+vAge*uSpin*(vSeed>0.5?1.:-1.);float cs=cos(a),sn=sin(a);c=vec2(c.x*cs-c.y*sn,c.x*sn+c.y*cs);}
  vec2 right=vec2(up.y,-up.x);float len=size*uTall+uStretch*length(iVel);
  mv.xy+=right*c.x*size+up*(c.y+uAnchor)*len;gl_Position=projectionMatrix*mv;
}`;
const P_FS=`
uniform sampler2D uNoise;uniform vec3 uC0,uC1;uniform float uTime;
varying vec2 vUv;varying float vAge,vSeed,vAlpha;
float nz(vec2 p){return texture2D(uNoise,p).r;}
void main(){
  vec3 col=mix(uC0,uC1,vAge);float a=0.;vec2 p=(vUv-0.5)*2.;float d=length(p);
#if KIND==0
  a=pow(max(0.,1.-d),2.);
#elif KIND==1
  // língua de chama: base larga, ponta fina, bordas comidas por ruído que sobe
  float t=uTime*1.5+vSeed*17.;
  float n1=nz(vec2(vUv.x*0.55+vSeed*3.,vUv.y*0.45-t*0.42));
  float n2=nz(vec2(vUv.x*1.3-vSeed*5.,vUv.y*1.0-t*0.75));
  float x=p.x+(n1-0.5)*1.1*vUv.y;
  float w=mix(0.95,0.1,pow(vUv.y,0.85));
  float body=1.-smoothstep(w*0.25,w,abs(x));
  float top=1.-smoothstep(0.45,1.0,vUv.y+(n2-0.5)*0.55);
  float heat=body*top*smoothstep(0.,0.1,vUv.y)*(0.5+1.0*n2);
  heat*=pow(1.-vAge,0.6)*smoothstep(0.,0.1,vAge);
  // corpo negro: vermelho escuro -> laranja -> amarelo -> quase branco no núcleo
  col=mix(uC1*0.55,uC1,smoothstep(0.05,0.3,heat));col=mix(col,uC0,smoothstep(0.25,0.6,heat));col=mix(col,vec3(1.,0.96,0.82),smoothstep(0.62,1.,heat));
  col*=1.6;a=clamp(heat*1.3,0.,1.);
#elif KIND==2
  // fumaça: nuvem com borda erodida que se dissolve com a idade, mais clara em cima
  float n=nz(vUv*0.55+vSeed*3.+vec2(0.,-uTime*0.025))*0.62+nz(vUv*1.5+vSeed*7.)*0.38;
  float edge=mix(0.28,0.62,vAge);
  a=smoothstep(1.,0.2,d+(n-0.5)*0.9)*smoothstep(edge-0.2,edge+0.22,n+(1.-d)*0.42);
  col*=0.55+0.75*n*(0.55+0.45*vUv.y);a*=smoothstep(0.,0.12,vAge);
#elif KIND==3
  float x=abs(p.x);a=pow(1.-clamp(x,0.,1.),1.5)*smoothstep(0.,0.2,vUv.y)*mix(0.25,1.,vUv.y);col+=vec3(1.,0.9,0.7)*pow(1.-clamp(x,0.,1.),6.)*vUv.y;col*=2.2;
#elif KIND==4
  float x=abs(p.x);a=(1.-x*x)*smoothstep(0.,0.35,vUv.y)*(1.-smoothstep(0.8,1.,vUv.y))*(0.6+0.4*vSeed);
#elif KIND==5
  // gota: borda mais escura (refração), miolo claro e reflexo especular
  if(d>1.)discard;float rim=smoothstep(0.45,1.,d);
  col=mix(uC0,uC1*0.6,rim);float hl=smoothstep(0.42,0.,length(p-vec2(-0.3,0.38)));col+=vec3(hl)*1.5;
  a=(0.3+0.5*rim+hl)*(1.-smoothstep(0.88,1.,d));
#elif KIND==6
  float r=0.15+0.8*vAge;a=smoothstep(0.1,0.,abs(d-r))*(1.-vAge)*(1.-vAge);
#elif KIND==7
  float n=nz(vUv*0.4+vSeed*9.);a=smoothstep(1.,0.15,d+(n-0.5)*0.5);
#elif KIND==8
  float core=pow(max(0.,1.-d),3.);float fl=max(0.,1.-abs(p.x)*9.)*max(0.,1.-abs(p.y)*1.4)+max(0.,1.-abs(p.y)*9.)*max(0.,1.-abs(p.x)*1.4);
  a=core+fl*0.7*(0.6+0.4*sin(uTime*9.+vSeed*40.));col*=1.8;
#elif KIND==9
  // núcleo de energia: centro quente, raios, anéis tracejados girando e redemoinho
  float ang=atan(p.y,p.x)/6.2832,t=uTime;
  float c0=exp(-d*d*20.)*2.6;
  float rays=pow(nz(vec2(ang*4.+vSeed,t*0.22)),3.)*exp(-d*2.4)*2.4;
  float ring1=smoothstep(0.035,0.,abs(d-0.55))*(0.5+0.5*sin(ang*6.2832*6.+t*2.5));
  float ring2=smoothstep(0.018,0.,abs(d-0.78))*step(0.,sin(ang*6.2832*14.-t*1.7));
  float ring3=smoothstep(0.05,0.,abs(d-0.33))*(0.35+0.65*nz(vec2(ang*3.-t*0.2,0.3)));
  float swirl=nz(vec2(ang*2.+d*1.4-t*0.3,d*1.2+t*0.1))*exp(-d*3.)*1.3;
  a=clamp(c0+rays+ring1+ring2+ring3+swirl,0.,4.)*(1.-smoothstep(0.9,1.,d));
  col=mix(uC0,vec3(1.),clamp(c0*0.5+rays*0.15,0.,1.))*1.9;
#endif
  gl_FragColor=vec4(col,a*vAlpha);if(gl_FragColor.a<0.003)discard;
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`;
const MAXP=6000;
function quadGeo(max){
  const g=new THREE.InstancedBufferGeometry();
  g.setAttribute('corner',new THREE.Float32BufferAttribute([-0.5,-0.5,0.5,-0.5,0.5,0.5,-0.5,0.5],2));g.setIndex([0,1,2,0,2,3]);
  g.setAttribute('iPos',new THREE.InstancedBufferAttribute(new Float32Array(max*3),3));g.setAttribute('iVel',new THREE.InstancedBufferAttribute(new Float32Array(max*3),3));g.setAttribute('iData',new THREE.InstancedBufferAttribute(new Float32Array(max*4),4));
  g.instanceCount=0;return g;
}
function partMat(kind,sys){
  return new THREE.ShaderMaterial({vertexShader:P_VS,fragmentShader:P_FS,defines:{KIND:KIND_ID[kind]||0},transparent:true,depthWrite:false,side:THREE.DoubleSide,
    blending:sys.add?THREE.AdditiveBlending:THREE.NormalBlending,
    uniforms:{uNoise:{value:noiseTex()},uTime:TIME,uC0:{value:new THREE.Color()},uC1:{value:new THREE.Color()},uAlign:{value:ALIGN[kind]?1:0},uStretch:{value:sys.stretch||0},uTall:{value:sys.tall||1},uSpin:{value:sys.spin||0},uGround:{value:kind==='ring'?1:0},uAnchor:{value:kind==='flame'?0.42:0}}});
}
function mkMesh(kind,sys,max){const m=new THREE.Mesh(quadGeo(max),partMat(kind,sys));m.frustumCulled=false;m.renderOrder=kind==='smoke'?4:6;m.raycast=()=>{};scene.add(m);return m;}

/* ---------- construção de um sistema ---------- */
function build(sys){
  if(BUILD[sys.kind])return BUILD[sys.kind](sys);
  sys._mesh=mkMesh(sys.kind,sys,MAXP);
  if(sys.ground==='splash'){sys._ring=mkMesh('ring',{add:false},1200);sys._rings=[];}
  if(sys.light){sys._light=new THREE.PointLight(sys.light.color,0,sys.light.dist||0,2);scene.add(sys._light);}
}
function destroy(sys){
  if(sys.kind==='veins')clearVeins(sys);
  ['_mesh','_ring','_light','_flash','_flashQ'].forEach(k=>{const m=sys[k];if(!m)return;scene.remove(m);if(m.geometry)m.geometry.dispose();if(m.material)m.material.dispose();sys[k]=null;});
}
function rebuildMat(sys){if(EVAL[sys.kind]){if(sys.kind==='ocean')oceanUniforms(sys);if(sys.kind==='shards'&&sys._mesh&&sys._mesh.count!==sys.count){destroy(sys);build(sys);}return;}const m=sys._mesh.material;m.blending=sys.add?THREE.AdditiveBlending:THREE.NormalBlending;m.uniforms.uStretch.value=sys.stretch||0;m.uniforms.uTall.value=sys.tall||1;m.uniforms.uSpin.value=sys.spin||0;m.needsUpdate=true;}
function makeSystem(preset,emitterId){
  const P=PRESETS[preset]||PRESETS.fire,group=++FX.uid;let first=null;
  P.layers.forEach((L,i)=>{
    const sys={id:++FX.uid,group,preset,emitter:emitterId==null?null:emitterId,startFrame:0,offset:[0,0,0],areaSize:6,seed:Math.floor(Math.random()*1e6),...JSON.parse(JSON.stringify(L))};
    sys.name=L.name+' '+(FX.systems.filter(s=>s.name.startsWith(L.name)).length+1);
    if(sys.kind==='ocean'||sys.shape==='sky'||sys.shape==='box')sys.emitter=null;
    if(sys.shape==='surface'&&sys.emitter==null)sys.shape='point';
    build(sys);FX.systems.push(sys);resetSim(sys);if(!i){first=sys;FX.sel=FX.systems.length-1;}
  });
  return first;
}
window.makeFX=(preset,emitterId)=>makeSystem(preset,emitterId);
window.fxRebuildMat=s=>rebuildMat(s);
function rng(sys){let s=sys._rs|0;return ()=>{s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;sys._rs=s;return ((t^(t>>>14))>>>0)/4294967296;};}
function resetSim(sys){
  if(EVAL[sys.kind]){sys._simFrame=0;return;}
  sys._p=[];sys._acc=0;sys._t=0;sys._rs=sys.seed;sys._burstDone=false;sys._simFrame=0;sys._rand=rng(sys);if(sys._rings)sys._rings=[];upload(sys);
}
/* ---------- amostragem de superfície (ponderada por área) ---------- */
function sampler(o,faceList){
  const key=(faceList?'r':'a')+o.em.faces.length;if(o._fxS&&o._fxS.key===key&&o._fxS.pos===o.em.pos)return o._fxS;
  const tris=[],acc=[];let A=0;const P=o.em.pos,F=o.em.faces,add=fi=>{const f=F[fi];for(let k=1;k<f.length-1;k++){const a=f[0],b=f[k],c=f[k+1];
    const ux=P[3*b]-P[3*a],uy=P[3*b+1]-P[3*a+1],uz=P[3*b+2]-P[3*a+2],vx=P[3*c]-P[3*a],vy=P[3*c+1]-P[3*a+1],vz=P[3*c+2]-P[3*a+2];
    A+=Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)/2;tris.push(a,b,c);acc.push(A);}};
  if(faceList)faceList.forEach(add);else for(let i=0;i<F.length;i++)add(i);
  return (o._fxS={key,pos:P,tris,acc,A});
}
// Ponto e normal em espaço LOCAL do objeto; devolve também o vértice 'a' do triângulo.
function sampleLocal(o,R,faceList){
  const T=sampler(o,faceList);if(!T.acc.length)return null;const r=R()*T.A;let lo=0,hi=T.acc.length-1;while(lo<hi){const m=(lo+hi)>>1;if(T.acc[m]<r)lo=m+1;else hi=m;}
  const a=T.tris[3*lo],b=T.tris[3*lo+1],c=T.tris[3*lo+2],P=o.em.pos;let u=R(),v=R();if(u+v>1){u=1-u;v=1-v;}const w=1-u-v;
  const p=new THREE.Vector3(P[3*a]*w+P[3*b]*u+P[3*c]*v,P[3*a+1]*w+P[3*b+1]*u+P[3*c+1]*v,P[3*a+2]*w+P[3*b+2]*u+P[3*c+2]*v);
  const n=new THREE.Vector3(...faceNormal(o.em,[a,b,c]));return {p,n,v:a,bary:[w,u,v],tri:[a,b,c]};
}
function emitterBase(sys){const o=sys.emitter!=null?S.objs.find(x=>x.id===sys.emitter):null,b=o?o.mesh.getWorldPosition(new THREE.Vector3()):new THREE.Vector3();const of=sys.offset||[0,0,0];b.x+=of[0];b.y+=of[1];b.z+=of[2];return {o,base:b};}
function spawn(sys,n){
  const R=sys._rand,{o,base}=emitterBase(sys),dir=new THREE.Vector3(...sys.dir).normalize(),of=sys.offset||[0,0,0];
  for(let i=0;i<n&&sys._p.length<MAXP;i++){
    let p=base.clone(),nrm=dir.clone();
    if(sys.shape==='surface'&&o){const s=sampleLocal(o,R);if(s){p=s.p.applyMatrix4(o.mesh.matrixWorld);p.x+=of[0];p.y+=of[1];p.z+=of[2];nrm=s.n.transformDirection(o.mesh.matrixWorld).lerp(dir,0.65).normalize();}}
    else if(sys.shape==='sky'){p.set(base.x+(R()-0.5)*sys.areaSize,base.y+5+R()*1.5,base.z+(R()-0.5)*sys.areaSize);}
    else if(sys.shape==='box'){p.set(base.x+(R()-0.5)*sys.areaSize,base.y+R()*sys.areaSize*0.5,base.z+(R()-0.5)*sys.areaSize);}
    const rnd=new THREE.Vector3(R()*2-1,R()*2-1,R()*2-1).normalize(),v=nrm.clone().lerp(rnd,sys.spread).normalize().multiplyScalar(sys.speed*(0.6+0.8*R()));
    sys._p.push({x:p.x,y:p.y,z:p.z,vx:v.x,vy:v.y,vz:v.z,age:0,life:sys.life*(0.7+0.6*R()),r:R()});
  }
}
function step(sys,dt){
  sys._t+=dt;
  if(sys.burst&&!sys._burstDone){spawn(sys,sys.burst);sys._burstDone=true;}
  if(sys.rate>0){sys._acc+=sys.rate*dt;const n=Math.floor(sys._acc);sys._acc-=n;spawn(sys,n);}
  const g=sys.gravity,dr=Math.exp(-sys.drag*dt),tb=sys.turb,sw=sys.swirl||0,T=sys._t,gm=sys.ground,R=sys._rand;
  const keep=[];for(const q of sys._p){q.age+=dt;if(q.age>=q.life)continue;
    if(q.stuck){keep.push(q);continue;}
    if(tb){const f=1.3;q.vx+=(vnoise3(q.x*f,q.y*f+T,q.z*f)-0.5)*tb*dt*8;q.vy+=(vnoise3(q.x*f+31,q.y*f+T,q.z*f)-0.5)*tb*dt*8;q.vz+=(vnoise3(q.x*f,q.y*f+T,q.z*f+57)-0.5)*tb*dt*8;}
    if(sw){q.vx+=-q.z*sw*dt;q.vz+=q.x*sw*dt;}
    q.vy-=g*dt;q.vx*=dr;q.vy*=dr;q.vz*=dr;q.x+=q.vx*dt;q.y+=q.vy*dt;q.z+=q.vz*dt;
    if(gm&&q.y<0.005){
      if(gm==='splash'){if(sys._rings&&sys._rings.length<1200)sys._rings.push({x:q.x,z:q.z,age:0,life:0.45+0.3*q.r,size:0.1+0.22*q.r});continue;}
      if(gm==='stick'){q.y=0.006;q.vx=q.vy=q.vz=0;q.stuck=true;}
      else{q.y=0.005;q.vy=-q.vy*0.35;q.vx*=0.7;q.vz*=0.7;}
    }
    keep.push(q);}
  sys._p=keep;
  if(sys._rings){const kr=[];for(const r of sys._rings){r.age+=dt;if(r.age<r.life)kr.push(r);}sys._rings=kr;}
}
const C0=new THREE.Color(),C1=new THREE.Color();
function upload(sys){
  const m=sys._mesh;if(!m)return;const g=m.geometry,P=g.attributes.iPos.array,Vv=g.attributes.iVel.array,D=g.attributes.iData.array,n=Math.min(sys._p.length,MAXP);
  m.material.uniforms.uC0.value.set(sys.c0).convertSRGBToLinear();m.material.uniforms.uC1.value.set(sys.c1).convertSRGBToLinear();
  for(let i=0;i<n;i++){const q=sys._p[i],t=q.age/q.life;P[3*i]=q.x;P[3*i+1]=q.y;P[3*i+2]=q.z;Vv[3*i]=q.vx;Vv[3*i+1]=q.vy;Vv[3*i+2]=q.vz;
    D[4*i]=(sys.size+(sys.sizeEnd-sys.size)*t)*(0.7+0.6*q.r);D[4*i+1]=t;D[4*i+2]=q.r;D[4*i+3]=(sys.a0+(sys.a1-sys.a0)*t)*Math.min(1,q.age*14);}
  g.instanceCount=n;g.attributes.iPos.needsUpdate=g.attributes.iVel.needsUpdate=g.attributes.iData.needsUpdate=true;
  if(sys._ring){const rg=sys._ring.geometry,RP=rg.attributes.iPos.array,RD=rg.attributes.iData.array,rn=Math.min(sys._rings.length,1200);
    sys._ring.material.uniforms.uC0.value.set(sys.c0).convertSRGBToLinear();sys._ring.material.uniforms.uC1.value.set(sys.c0).convertSRGBToLinear();
    for(let i=0;i<rn;i++){const r=sys._rings[i];RP[3*i]=r.x;RP[3*i+1]=0.012;RP[3*i+2]=r.z;RD[4*i]=r.size;RD[4*i+1]=r.age/r.life;RD[4*i+2]=0;RD[4*i+3]=0.7;}
    rg.instanceCount=rn;rg.attributes.iPos.needsUpdate=rg.attributes.iData.needsUpdate=true;}
  if(sys._light){const L=sys.light,{o,base}=emitterBase(sys);
    if(o){const bb=new THREE.Box3().setFromObject(o.mesh);base.y=bb.max.y;}
    sys._light.position.set(base.x,base.y+(L.up||0.3),base.z);sys._light.color.set(L.color);
    const fl=1-(L.flicker||0)*(0.5+0.5*Math.sin(sys._t*23.1+sys.seed)*Math.sin(sys._t*7.3)+0.4*(vnoise3(sys._t*9,sys.seed,0)-0.5));
    const live=n>0?Math.min(1,n/12):0;sys._light.intensity=L.intensity*fl*live*(L.decay?Math.exp(-sys._t*L.decay):1);sys._light.distance=L.dist||0;}
  need=true;
}

/* ---------- Raio ---------- */
const B_VS=`
attribute vec2 corner;attribute vec3 iA;attribute vec3 iB;attribute vec2 iW;
varying vec2 vUv;varying float vI;
void main(){
  vUv=corner+0.5;vI=iW.y;vec4 a=viewMatrix*vec4(iA,1.),b=viewMatrix*vec4(iB,1.);
  vec2 d=b.xy-a.xy;float l=length(d);d=l>1e-5?d/l:vec2(0.,1.);vec2 n=vec2(-d.y,d.x);
  vec4 p=mix(a,b,vUv.y);p.xy+=n*corner.x*iW.x+d*(vUv.y-0.5)*iW.x*0.25;gl_Position=projectionMatrix*p;
}`;
const B_FS=`
uniform vec3 uC0;uniform float uI;varying vec2 vUv;varying float vI;
void main(){
  float x=abs(vUv.x-0.5)*2.;float core=exp(-x*x*120.),glow=exp(-x*x*7.)*(1.-x);
  vec3 col=(vec3(1.)*core*4.+uC0*glow*1.3)*vI*uI;gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`;
const BMAX=1400;
// Caminho em zigue-zague por deslocamento do ponto médio (relâmpago).
function jagPath(R,a,b,disp,depth,yk){let pts=[a,b];for(let d=0;d<depth;d++){const np=[pts[0]];for(let i=0;i<pts.length-1;i++){const m=pts[i].clone().add(pts[i+1]).multiplyScalar(0.5);m.x+=(R()-0.5)*disp;m.y+=(R()-0.5)*disp*(yk==null?1:yk);m.z+=(R()-0.5)*disp;np.push(m,pts[i+1]);}pts=np;disp*=0.55;}return pts;}
function boltMesh(){
  const g=new THREE.InstancedBufferGeometry();g.setAttribute('corner',new THREE.Float32BufferAttribute([-0.5,-0.5,0.5,-0.5,0.5,0.5,-0.5,0.5],2));g.setIndex([0,1,2,0,2,3]);
  g.setAttribute('iA',new THREE.InstancedBufferAttribute(new Float32Array(BMAX*3),3));g.setAttribute('iB',new THREE.InstancedBufferAttribute(new Float32Array(BMAX*3),3));g.setAttribute('iW',new THREE.InstancedBufferAttribute(new Float32Array(BMAX*2),2));g.instanceCount=0;
  const m=new THREE.Mesh(g,new THREE.ShaderMaterial({vertexShader:B_VS,fragmentShader:B_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{uC0:{value:new THREE.Color()},uI:{value:0}}}));
  m.frustumCulled=false;m.renderOrder=8;m.raycast=()=>{};scene.add(m);return m;
}
function setSegs(mesh,segs){const g=mesh.geometry,PA=g.attributes.iA.array,PB=g.attributes.iB.array,W=g.attributes.iW.array,n=Math.min(segs.length,BMAX);
  for(let i=0;i<n;i++){const s=segs[i];PA[3*i]=s[0].x;PA[3*i+1]=s[0].y;PA[3*i+2]=s[0].z;PB[3*i]=s[1].x;PB[3*i+1]=s[1].y;PB[3*i+2]=s[1].z;W[2*i]=s[2];W[2*i+1]=s[3];}
  g.instanceCount=n;g.attributes.iA.needsUpdate=g.attributes.iB.needsUpdate=g.attributes.iW.needsUpdate=true;}
function buildBolt(sys){
  sys._mesh=boltMesh();sys._strike=-1;
  sys._light=new THREE.PointLight(sys.light.color,0,0,2);scene.add(sys._light);
  sys._flash=new THREE.HemisphereLight(0xdfe8ff,0x8090b0,0);scene.add(sys._flash);
}
function genBolt(sys,strike){
  const R=rng({_rs:(sys.seed+strike*7919)|0}),{o,base}=emitterBase(sys);let B=base.clone();
  if(o){const bb=new THREE.Box3().setFromObject(o.mesh);B.y=bb.max.y;}else B.y=Math.max(0,B.y);
  B.x+=(R()-0.5)*sys.spreadXZ*(o?0.2:1);B.z+=(R()-0.5)*sys.spreadXZ*(o?0.2:1);
  const A=new THREE.Vector3(B.x+(R()-0.5)*sys.height*0.5,B.y+sys.height,B.z+(R()-0.5)*sys.height*0.5),segs=[];
  const path=(a,b,disp,depth)=>jagPath(R,a,b,disp,depth,0.35);
  const main=path(A,B,sys.jag*sys.height*0.22,6);for(let i=0;i<main.length-1;i++)segs.push([main[i],main[i+1],1,1]);
  for(let k=0;k<sys.branches;k++){const i=4+Math.floor(R()*(main.length*0.7)),s=main[Math.min(i,main.length-2)],t=main[Math.min(i+1,main.length-1)].clone().sub(s).normalize();
    const len=sys.height*(0.12+0.3*R()),side=new THREE.Vector3(R()-0.5,-(0.2+R()*0.6),R()-0.5).normalize().lerp(t,0.35).normalize(),e=s.clone().addScaledVector(side,len);
    const br=path(s,e,sys.jag*len*0.3,4);for(let j=0;j<br.length-1;j++){const f=1-j/br.length;segs.push([br[j],br[j+1],0.55*f+0.15,0.5*f+0.1]);}
    // sub-ramo
    if(R()<0.6){const s2=br[Math.floor(br.length*0.5)],e2=s2.clone().add(new THREE.Vector3(R()-0.5,-R()*0.7,R()-0.5).multiplyScalar(len*0.5)),b2=path(s2,e2,sys.jag*len*0.12,3);for(let j=0;j<b2.length-1;j++)segs.push([b2[j],b2[j+1],0.3,0.3]);}}
  const g=sys._mesh.geometry,PA=g.attributes.iA.array,PB=g.attributes.iB.array,W=g.attributes.iW.array,n=Math.min(segs.length,BMAX);
  for(let i=0;i<n;i++){const s=segs[i];PA.set(s[0].toArray(),3*i);PB.set(s[1].toArray(),3*i);W[2*i]=sys.width*s[2];W[2*i+1]=s[3];}
  g.instanceCount=n;g.attributes.iA.needsUpdate=g.attributes.iB.needsUpdate=g.attributes.iW.needsUpdate=true;
  sys._light.position.copy(A).lerp(B,0.6);
}
const FLICK=[1,0.3,0.95,0.55,0.8,0.3,0.12,0.05];
function evalBolt(sys,frame){
  const f=frame-sys.startFrame,per=Math.max(2,sys.period),k=Math.floor(f/per),ph=f-k*per;let I=0;
  if(f>=0&&ph<sys.duration){if(k!==sys._strike){sys._strike=k;genBolt(sys,k);}const t=ph/sys.duration*(FLICK.length-1),i=Math.floor(t);I=FLICK[i]+(FLICK[Math.min(i+1,FLICK.length-1)]-FLICK[i])*(t-i);}
  sys._mesh.material.uniforms.uI.value=I;sys._mesh.material.uniforms.uC0.value.set(sys.c0).convertSRGBToLinear();sys._mesh.visible=I>0.001;
  sys._light.color.set(sys.light.color);sys._light.intensity=sys.light.intensity*I;sys._flash.intensity=I*sys.light.intensity*0.012;need=true;
}

/* ---------- Superfície de água (lago / mar) ---------- */
const O_VS=`
uniform float uTime,uH,uLen,uChop;varying vec3 vW;varying vec3 vN;varying float vCrest;
vec3 gw(vec2 dir,float len,float amp,float sp,vec3 p,inout vec3 tx,inout vec3 tz){
  float k=6.2832/len,c=sqrt(9.8/k)*sp,f=k*(dot(dir,p.xz)-c*uTime),q=uChop/(k*max(amp,1e-4)*4.);
  float cs=cos(f),sn=sin(f);tx+=vec3(-q*amp*k*dir.x*dir.x*sn,amp*k*dir.x*cs,-q*amp*k*dir.x*dir.y*sn);tz+=vec3(-q*amp*k*dir.x*dir.y*sn,amp*k*dir.y*cs,-q*amp*k*dir.y*dir.y*sn);
  return vec3(q*amp*dir.x*cs,amp*sn,q*amp*dir.y*cs);
}
void main(){
  vec3 p=(modelMatrix*vec4(position,1.)).xyz,tx=vec3(1.,0.,0.),tz=vec3(0.,0.,1.),o=vec3(0.);
  o+=gw(normalize(vec2(1.,0.35)),uLen,uH,1.,p,tx,tz);o+=gw(normalize(vec2(0.6,1.)),uLen*0.62,uH*0.55,1.1,p,tx,tz);
  o+=gw(normalize(vec2(-0.45,0.8)),uLen*0.37,uH*0.32,1.2,p,tx,tz);o+=gw(normalize(vec2(0.9,-0.5)),uLen*0.21,uH*0.18,1.35,p,tx,tz);
  p+=o;vCrest=o.y/max(uH,1e-4);vW=p;vN=normalize(cross(tz,tx));gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
}`;
const O_FS=`
uniform sampler2D uNoise;uniform float uTime,uFoam;uniform vec3 uDeep,uShallow,uZenith,uHorizon,uSunDir,uSunCol;
varying vec3 vW;varying vec3 vN;varying float vCrest;
void main(){
  // ondulação fina: duas camadas de ruído correndo em direções diferentes
  vec2 u1=vW.xz*0.35+vec2(uTime*0.03,uTime*0.02),u2=vW.xz*0.9-vec2(uTime*0.05,-uTime*0.035);float e=0.008;
  float h0=texture2D(uNoise,u1).r+texture2D(uNoise,u2).r*0.5;
  float hx=texture2D(uNoise,u1+vec2(e,0.)).r+texture2D(uNoise,u2+vec2(e,0.)).r*0.5,hz=texture2D(uNoise,u1+vec2(0.,e)).r+texture2D(uNoise,u2+vec2(0.,e)).r*0.5;
  vec3 N=normalize(vN+vec3(-(hx-h0),0.,-(hz-h0))*5.5);
  vec3 V=normalize(cameraPosition-vW);float nv=max(dot(N,V),0.),F=0.02+0.98*pow(1.-nv,5.);
  vec3 R=reflect(-V,N);R.y=abs(R.y);vec3 sky=mix(uHorizon,uZenith,pow(R.y,0.45));
  vec3 body=mix(uDeep,uShallow,clamp(pow(nv,1.5)*0.45+max(vCrest,0.)*0.18,0.,1.));
  float sp=pow(max(dot(R,uSunDir),0.),260.),sp2=pow(max(dot(R,uSunDir),0.),24.)*0.06;
  vec3 col=mix(body,sky,F)+uSunCol*(sp*6.+sp2);
  float foam=smoothstep(1.25,1.85,vCrest+(texture2D(uNoise,vW.xz*0.8+uTime*0.02).r-0.5)*1.1)*uFoam;col=mix(col,vec3(0.92),foam);
  gl_FragColor=vec4(col,mix(0.86,1.,max(F,foam)));
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`;
function buildOcean(sys){
  const seg=Math.min(220,Math.max(60,Math.round(sys.size*14))),g=new THREE.PlaneGeometry(sys.size,sys.size,seg,seg);g.rotateX(-Math.PI/2);
  const m=new THREE.Mesh(g,new THREE.ShaderMaterial({vertexShader:O_VS,fragmentShader:O_FS,transparent:true,side:THREE.DoubleSide,
    uniforms:{uNoise:{value:noiseTex()},uTime:TIME,uH:{value:0.1},uLen:{value:2},uChop:{value:0.7},uFoam:{value:0.5},uDeep:{value:new THREE.Color()},uShallow:{value:new THREE.Color()},uZenith:{value:new THREE.Color()},uHorizon:{value:new THREE.Color()},uSunDir:{value:new THREE.Vector3(0,1,0)},uSunCol:{value:new THREE.Color(1,1,1)}}}));
  m.frustumCulled=false;m.renderOrder=2;m.raycast=()=>{};scene.add(m);sys._mesh=m;sys._size=sys.size;
  // o plano que recebe sombras não pode esconder os vales das ondas
  ground.material.depthWrite=false;oceanUniforms(sys);
}
function oceanUniforms(sys){
  if(sys._size!==sys.size){destroy(sys);buildOcean(sys);return;}
  const u=sys._mesh.material.uniforms,W=window.WORLD||{};u.uH.value=sys.waveH;u.uLen.value=sys.waveLen;u.uChop.value=sys.chop;u.uFoam.value=sys.foam;
  u.uDeep.value.set(sys.deep).convertSRGBToLinear();u.uShallow.value.set(sys.shallow).convertSRGBToLinear();
  // o céu refletido acompanha o mundo: gradiente configurado ou um céu diurno padrão
  if(W.sky==='gradient'){u.uZenith.value.set(W.skyTop).convertSRGBToLinear();u.uHorizon.value.set(W.skyBottom).convertSRGBToLinear().lerp(new THREE.Color(0.7,0.8,0.9),0.35);}
  else{u.uZenith.value.set('#3f6fb5').convertSRGBToLinear();u.uHorizon.value.set('#c4d8ea').convertSRGBToLinear();}
  u.uSunDir.value.copy(sun.position).normalize();u.uSunCol.value.copy(sun.color).multiplyScalar(Math.min(2,sun.intensity*0.6));
  const {base}=emitterBase(sys);sys._mesh.position.set(base.x,base.y+(sys.y||0),base.z);need=true;
}

/* ---------- Skin de energia (estilo "skin lendária"): veias, núcleo, fragmentos, raios e tiro ---------- */
// Nível de ativação na timeline: 'idle' antes de actStart, sobe até 1 em actLen quadros.
function level(sys,frame){const a=sys.actLen>0?clamp((frame-(sys.actStart||0))/sys.actLen,0,1):1,e=a*a*(3-2*a),idle=sys.idle==null?0.3:sys.idle;return {act:e,lvl:idle*(1-e)+e};}
function emitterBox(sys){const {o,base}=emitterBase(sys);if(!o)return {o:null,c:base,r:0.6,h:0.6};const bb=new THREE.Box3().setFromObject(o.mesh),c=bb.getCenter(new THREE.Vector3()),sz=bb.getSize(new THREE.Vector3()),of=sys.offset||[0,0,0];c.x+=of[0];c.y+=of[1];c.z+=of[2];return {o,c,r:Math.max(sz.x,sz.z)/2,h:sz.y/2};}
const VEIN_GLSL=`
float vh(vec3 p){p=fract(p*0.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vnz(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(vh(i),vh(i+vec3(1,0,0)),f.x),mix(vh(i+vec3(0,1,0)),vh(i+vec3(1,1,0)),f.x),f.y),mix(mix(vh(i+vec3(0,0,1)),vh(i+vec3(1,0,1)),f.x),mix(vh(i+vec3(0,1,1)),vh(i+vec3(1,1,1)),f.x),f.y),f.z);}`;
// Veias: injeta no material do objeto um padrão de rachaduras de energia (ruído "ridged") que pulsa e emite luz.
function buildVeins(sys){
  const o=sys.emitter!=null?S.objs.find(x=>x.id===sys.emitter):null;if(!o)return;const m=o.mat;sys._obj=o;
  sys._u={uVeinC:{value:new THREE.Color()},uVeinI:{value:0},uVeinS:{value:sys.scale},uVeinDark:{value:sys.dark},uVeinT:TIME};
  m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,sys._u);
    sh.vertexShader='varying vec3 vVeinP;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvVeinP=position;');
    sh.fragmentShader='varying vec3 vVeinP;uniform vec3 uVeinC;uniform float uVeinI,uVeinS,uVeinDark,uVeinT;\n'+VEIN_GLSL+'\n'+sh.fragmentShader
      .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=mix(1.,0.2,uVeinDark*min(uVeinI,1.));')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      {vec3 veQ=vVeinP*uVeinS;vec3 veW=veQ+0.4*vec3(vnz(veQ*1.7+uVeinT*0.15),vnz(veQ*1.7+5.),vnz(veQ*1.7+9.-uVeinT*0.1));
      float veA=1.-abs(vnz(veW)*2.-1.),veB=1.-abs(vnz(veW*2.1+3.7)*2.-1.);
      float line=pow(veA,14.)+pow(veB,18.)*0.7,glow=pow(veA,4.)*0.2,pulse=0.65+0.35*sin(uVeinT*3.5+vnz(veQ*0.8)*12.);
      totalEmissiveRadiance+=(uVeinC*(line*3.2+glow)*pulse+vec3(1.)*pow(veA,42.)*1.6)*uVeinI;}`);};
  m.customProgramCacheKey=()=>'veins'+sys.id;m.needsUpdate=true;
}
function clearVeins(sys){const o=sys._obj;if(!o)return;o.mat.onBeforeCompile=()=>{};o.mat.customProgramCacheKey=()=>'';o.mat.needsUpdate=true;sys._obj=null;need=true;}
function evalVeins(sys,f){if(!sys._u)return;const L=level(sys,f);sys._u.uVeinC.value.set(sys.c0).convertSRGBToLinear();sys._u.uVeinI.value=sys.intensity*L.lvl;sys._u.uVeinS.value=sys.scale;sys._u.uVeinDark.value=sys.dark;need=true;}
function buildCore(sys){sys._mesh=mkMesh('core',{add:true},1);sys._mesh.renderOrder=7;sys._mesh.material.depthTest=true;if(sys.light){sys._light=new THREE.PointLight(sys.light.color,0,sys.light.dist||0,2);scene.add(sys._light);}}
function evalCore(sys,f){
  const L=level(sys,f),B=emitterBox(sys),g=sys._mesh.geometry,u=sys._mesh.material.uniforms;u.uC0.value.set(sys.c0).convertSRGBToLinear();u.uC1.value.copy(u.uC0.value);
  // fica um pouco à frente do centro, na direção da câmera, para não sumir dentro do objeto
  const p=B.c.clone().add(viewCam().position.clone().sub(B.c).normalize().multiplyScalar(B.o?Math.min(B.r,B.h)*0.9:0));
  g.attributes.iPos.array.set([p.x,p.y,p.z]);g.attributes.iVel.array.set([0,0,0]);g.attributes.iData.array.set([sys.size*(0.35+0.65*L.act)*(1+0.04*Math.sin(TIME.value*5)),0,(sys.seed%100)/100,Math.min(1,L.lvl*1.2)]);
  g.instanceCount=1;g.attributes.iPos.needsUpdate=g.attributes.iData.needsUpdate=true;
  if(sys._light){sys._light.position.copy(p);sys._light.color.set(sys.light.color);sys._light.intensity=sys.light.intensity*L.lvl;}need=true;
}
function buildShards(sys){
  const g=new THREE.OctahedronGeometry(1,0);g.scale(0.38,1,0.38);
  const m=new THREE.MeshStandardMaterial({color:0x2a1c40,emissive:0xffffff,emissiveIntensity:1,metalness:0.5,roughness:0.2,flatShading:true});
  sys._mesh=new THREE.InstancedMesh(g,m,Math.max(1,sys.count|0));sys._mesh.frustumCulled=false;sys._mesh.castShadow=true;sys._mesh.raycast=()=>{};scene.add(sys._mesh);
  const R=rng({_rs:sys.seed|0});sys._sh=[];for(let i=0;i<sys._mesh.count;i++)sys._sh.push({a:R()*6.283,rf:0.75+R()*0.7,hf:(R()-0.5)*1.7,sp:(0.4+R())*(R()<0.5?1:-1),ph:R()*6.283,s:0.5+R(),ax:new THREE.Vector3(R()-0.5,R()-0.5,R()-0.5).normalize(),tw:0.5+R()*2});
}
const _M=new THREE.Matrix4(),_Q=new THREE.Quaternion(),_Sv=new THREE.Vector3(),_Pv=new THREE.Vector3();
function evalShards(sys,f){
  if(!sys._mesh||!sys._sh)return;const L=level(sys,f),B=emitterBox(sys),t=TIME.value,grow=0.3+0.7*L.act,rad=(B.r+0.15)*sys.orbit;
  sys._mesh.material.emissive.set(sys.c0);sys._mesh.material.emissiveIntensity=0.12+0.5*L.lvl;
  sys._sh.forEach((h,i)=>{const a=h.a+t*sys.speed*h.sp;_Pv.set(B.c.x+Math.cos(a)*rad*h.rf*grow,B.c.y+h.hf*(B.h+0.1)*grow+Math.sin(t*1.3+h.ph)*0.05,B.c.z+Math.sin(a)*rad*h.rf*grow);
    _Q.setFromAxisAngle(h.ax,t*h.tw+h.ph);const sc=sys.size*h.s*(0.25+0.75*L.lvl);_Sv.set(sc,sc,sc);_M.compose(_Pv,_Q,_Sv);sys._mesh.setMatrixAt(i,_M);});
  sys._mesh.instanceMatrix.needsUpdate=true;need=true;
}
function buildArcs(sys){sys._mesh=boltMesh();}
function evalArcs(sys,f){
  const L=level(sys,f),B=emitterBox(sys),hold=Math.floor(f/2),R=rng({_rs:(sys.seed+hold*104729)|0}),segs=[],n=Math.round(sys.count*L.lvl);
  for(let k=0;k<n;k++){
    let A,Bp,nA=null;
    if(B.o){const s1=sampleLocal(B.o,R);if(!s1)break;A=s1.p.clone().applyMatrix4(B.o.mesh.matrixWorld);nA=s1.n.clone().transformDirection(B.o.mesh.matrixWorld);
      for(let tr=0;tr<8;tr++){const s2=sampleLocal(B.o,R);Bp=s2.p.clone().applyMatrix4(B.o.mesh.matrixWorld);if(A.distanceTo(Bp)<sys.maxLen)break;}}
    else{A=B.c.clone().add(new THREE.Vector3(R()-0.5,R()-0.5,R()-0.5).normalize().multiplyScalar(B.r));Bp=B.c.clone().add(new THREE.Vector3(R()-0.5,R()-0.5,R()-0.5).normalize().multiplyScalar(B.r));}
    const len=A.distanceTo(Bp);if(len<1e-3)continue;
    // arqueia para fora da superfície
    const mid=A.clone().add(Bp).multiplyScalar(0.5);if(nA)mid.addScaledVector(nA,len*0.25);
    const p1=jagPath(R,A,mid,len*sys.jag*0.35,2),p2=jagPath(R,mid,Bp,len*sys.jag*0.35,2),pts=p1.concat(p2.slice(1)),I=0.5+0.5*R();
    for(let i=0;i<pts.length-1;i++)segs.push([pts[i],pts[i+1],sys.width,I]);
  }
  setSegs(sys._mesh,segs);sys._mesh.material.uniforms.uC0.value.set(sys.c0).convertSRGBToLinear();sys._mesh.material.uniforms.uI.value=0.8;sys._mesh.visible=segs.length>0;need=true;
}
// Tiro: clarão na boca + feixe com filamentos; dispara a cada 'period' quadros.
function buildBeam(sys){sys._mesh=boltMesh();sys._flashQ=mkMesh('star',{add:true},1);sys._flashQ.renderOrder=9;sys._light=new THREE.PointLight(sys.light.color,0,0,2);scene.add(sys._light);}
function evalBeam(sys,frame){
  const f=frame-(sys.startFrame||0),per=Math.max(2,sys.period),k=Math.floor(f/per),t=(f-k*per)/sys.duration,{o,base}=emitterBase(sys),segs=[];let I=0;
  const dir=new THREE.Vector3(...sys.dir);if(o)dir.transformDirection(o.mesh.matrixWorld);dir.normalize();
  if(f>=0&&t<1){I=Math.pow(1-t,1.5);const R=rng({_rs:(sys.seed+k*7919+Math.floor(f))|0}),head=Math.min(1,t*3.5),tail=Math.max(0,t*1.6-0.6),A=base.clone().addScaledVector(dir,sys.length*tail),E=base.clone().addScaledVector(dir,sys.length*head);
    segs.push([A,E,sys.width*(1.2-t*0.6),1]);
    for(let j=0;j<4;j++){const pts=jagPath(R,A,E,sys.width*2.6,4,1);for(let i=0;i<pts.length-1;i++)segs.push([pts[i],pts[i+1],sys.width*0.3,0.55]);}}
  setSegs(sys._mesh,segs);const u=sys._mesh.material.uniforms;u.uC0.value.set(sys.c0).convertSRGBToLinear();u.uI.value=I;sys._mesh.visible=I>0.001;
  const g=sys._flashQ.geometry,fu=sys._flashQ.material.uniforms;fu.uC0.value.set('#ffe6b0').convertSRGBToLinear();fu.uC1.value.set(sys.c0).convertSRGBToLinear();
  g.attributes.iPos.array.set([base.x,base.y,base.z]);g.attributes.iData.array.set([sys.width*14*(0.4+I),Math.min(1,t),0.3,I>0.001?Math.min(1,I*2):0]);g.instanceCount=I>0.001?1:0;g.attributes.iPos.needsUpdate=g.attributes.iData.needsUpdate=true;
  sys._light.position.copy(base);sys._light.color.set(sys.light.color);sys._light.intensity=sys.light.intensity*I;need=true;
}
const BUILD={bolt:buildBolt,ocean:buildOcean,veins:buildVeins,core:buildCore,shards:buildShards,arcs:buildArcs,beam:buildBeam};
const EVAL={bolt:evalBolt,ocean:s=>oceanUniforms(s),veins:evalVeins,core:evalCore,shards:evalShards,arcs:evalArcs,beam:evalBeam};

/* ---------- simulação na timeline ---------- */
function simTo(sys,frame){
  if(EVAL[sys.kind])return EVAL[sys.kind](sys,frame);
  const fps=S.fps,target=Math.max(0,frame-sys.startFrame);
  if(target<sys._simFrame-0.01)resetSim(sys);
  let guard=0;while(sys._simFrame<target-1e-6&&guard++<2000){const d=Math.min(1,target-sys._simFrame);step(sys,d/fps);sys._simFrame+=d;}
  upload(sys);
}
function evalAll(f){TIME.value=f/S.fps;FX.systems.forEach(s=>{if(EVAL[s.kind]||f>=s.startFrame)simTo(s,f);else resetSim(s);});}
on('frame',evalAll);
const _applyFrame=applyFrame;
window.applyFrame=function(f){_applyFrame(f);if(!S.playing)evalAll(f);};
// Pré-visualização ao vivo (aba Efeitos, animação parada): o tempo corre e tudo se move.
on('tick',dt=>{
  if(S.playing||!FX.preview||S.ws!=='fx')return;const live=FX.systems.length||FURS.size;if(!live)return;
  const d=Math.min(dt,0.05);FX.clock+=d;TIME.value=FX.clock;
  FX.systems.forEach(s=>{if(EVAL[s.kind])EVAL[s.kind](s,FX.clock*S.fps+(s.kind==='bolt'||s.kind==='beam'?s.startFrame||0:0));else{step(s,d);upload(s);}});need=true;
});

/* ===== Gramado / pelo / cabelo: lâminas curvas com vento ===== */
const FUR_DEF={kind:'fur',count:3000,length:0.12,segments:4,droop:0.5,random:0.4,width:0.008,comb:0,root:'#5b3a1e',tip:'#d9a066',onlyPainted:false,wind:0.3,clump:0};
const FUR_STYLES={
  pelo:{kind:'fur'},
  grama:{kind:'grass',root:'#24451a',tip:'#7fb648',length:0.2,droop:0.55,width:0.02,count:14000,segments:5,random:0.55,wind:1,clump:0.5},
  cabelo:{kind:'hair',root:'#2b1a0e',tip:'#5c3b22',length:0.3,droop:1.4,width:0.0025,count:9000,segments:7,random:0.35,wind:0.15},
  pelucia:{kind:'fur',root:'#c98b52',tip:'#f3d7b0',length:0.06,droop:0.1,width:0.006,count:8000}
};
window.FUR_STYLES=FUR_STYLES;window.FUR_DEF=FUR_DEF;
const FURS=new Set(),WIND={value:new THREE.Vector3(1,0,0.35).normalize().multiplyScalar(0.05)};
function furMaterial(F){
  const m=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:F.kind==='hair'?0.62:0.85,metalness:0});
  // vento: desloca cada vértice na direção do vento, mais forte na ponta (aWind.x) e defasado por lâmina (aWind.y)
  m.onBeforeCompile=sh=>{sh.uniforms.uTime=TIME;sh.uniforms.uWind=WIND;
    sh.vertexShader='attribute vec2 aWind;uniform float uTime;uniform vec3 uWind;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat ww=sin(uTime*1.6+aWind.y+position.x*1.3+position.z*0.9)*0.6+sin(uTime*3.3+aWind.y*1.7)*0.25+sin(uTime*0.7+position.x*0.4)*0.5;transformed+=uWind*ww*aWind.x;');};
  return m;
}
function buildFur(o){
  if(o._fur){o.mesh.remove(o._fur);o._fur.geometry.dispose();o._fur.material.dispose();o._fur=null;o._furBind=null;}
  FURS.delete(o);const F=o.ext.fur;if(!F||F.on===false)return;
  const kind=F.kind||'fur',R=rng({_rs:F.seed||1234}),pos=[],col=[],nor=[],wind=[],idx=[],bone=[];
  const cr=new THREE.Color(F.root).convertSRGBToLinear(),ct=new THREE.Color(F.tip).convertSRGBToLinear(),dry=new THREE.Color('#b9a44c').convertSRGBToLinear();
  const faces=F.region&&window.charRegionFaces?charRegionFaces(o,F.region):null,seg=clamp(F.segments|0,2,10),W=o.rig&&o.rig.weights;
  // gravidade e "pentear" em espaço local do objeto
  const inv=new THREE.Matrix4().copy(o.mesh.matrixWorld).invert(),grav=new THREE.Vector3(0,-1,0).transformDirection(inv),combD=new THREE.Vector3(0,0,1).transformDirection(inv);
  let clumpC=null,head=null;
  // cabelo de personagem: aproxima a cabeça por uma esfera para os fios contornarem o crânio
  if(kind==='hair'&&faces&&faces.length){const c=new THREE.Vector3();let n=0;faces.forEach(fi=>o.em.faces[fi].forEach(v=>{c.x+=o.em.pos[3*v];c.y+=o.em.pos[3*v+1];c.z+=o.em.pos[3*v+2];n++;}));c.divideScalar(n);
    let r=0;faces.forEach(fi=>o.em.faces[fi].forEach(v=>{r+=Math.hypot(o.em.pos[3*v]-c.x,o.em.pos[3*v+1]-c.y,o.em.pos[3*v+2]-c.z);}));head={c,r:r/n};c.y-=head.r*0.12;}
  for(let s=0;s<F.count;s++){
    let smp=sampleLocal(o,R,faces);if(!smp)break;
    if(F.onlyPainted){const v=smp.v,C=o.em.col;if(C[3*v]>0.95&&C[3*v+1]>0.95&&C[3*v+2]>0.95)continue;}
    const n=smp.n;let p=smp.p;
    // cabelo: nada de fios nascendo na testa/sobrancelhas
    if(head){const rz=(p.z-head.c.z)/head.r,ry=(p.y-head.c.y)/head.r;if(rz>0.2&&ry<0.62-(rz-0.2)*0.55)continue;}
    // tufos: algumas lâminas nascem juntas de um centro
    if(kind==='grass'&&F.clump>0){if(!clumpC||R()<0.22)clumpC=p.clone();else p=clumpC.clone().add(new THREE.Vector3(R()-0.5,0,R()-0.5).multiplyScalar(F.length*0.35*F.clump)).addScaledVector(n,0);}
    const len=F.length*(1-F.random*R())*(kind==='grass'?0.55+0.9*vnoise3(p.x*1.3,p.y,p.z*1.3):1);
    // direção inicial: normal + inclinação aleatória
    const tA=new THREE.Vector3().crossVectors(n,Math.abs(n.y)<0.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)).normalize(),tB=new THREE.Vector3().crossVectors(n,tA),yaw=R()*6.283;
    const lean=(kind==='grass'?0.35:kind==='hair'?0.15:0.25)*F.random*(0.4+R());
    let d=n.clone().addScaledVector(tA,Math.cos(yaw)*lean).addScaledVector(tB,Math.sin(yaw)*lean).normalize();
    // Campo de direção do cabelo: na metade da frente da cabeça os fios vão para trás e para os lados;
    // depois da coroa caem com a gravidade. Perto do crânio o fio corre tangente a ele.
    const flow=head?(pt,dPrev)=>{const rel=pt.clone().sub(head.c).divideScalar(head.r),front=clamp(rel.z+0.3,0,1),dist=rel.length(),rad=rel.clone().normalize();
      const want=new THREE.Vector3(Math.sign(rel.x||1)*0.75*front+(R()-0.5)*0.25,-(0.25+F.droop*0.45)*(1-front*0.8)+0.2*front,-2.3*front);
      if(dist<1.3)want.addScaledVector(rad,-want.dot(rad)).addScaledVector(rad,0.04);
      if(want.lengthSq()<1e-6)want.set(0,-1,0);want.normalize();return dPrev?dPrev.clone().multiplyScalar(0.3).addScaledVector(want,0.7).normalize():want;}:null;
    if(head)d=flow(p,null).addScaledVector(n,0.18).normalize();
    const pts=[p.clone()],dirs=[d.clone()];let q=p.clone();
    for(let k=1;k<=seg;k++){if(head)d=flow(q,d);else d=d.clone().addScaledVector(grav,F.droop*(kind==='hair'?1.1:0.6)/seg).addScaledVector(combD,F.comb/seg);
      if(kind==='hair'&&!head){const into=d.dot(n);if(into<0.05)d.addScaledVector(n,0.05-into);}
      d.normalize();let nq=q.clone().addScaledVector(d,len/seg);
      if(head){const rr=head.r*1.04,dv=nq.clone().sub(head.c),dl=dv.length();if(dl<rr){nq=head.c.clone().addScaledVector(dv.divideScalar(dl||1),rr);d=nq.clone().sub(q).normalize();}}
      q=nq;pts.push(q);dirs.push(d.clone());}
    // eixo da largura: grama gira livre; cabelo/pelo fica "deitado" na superfície
    const side0=kind==='grass'?tA.clone().multiplyScalar(Math.cos(yaw+1.57)).addScaledVector(tB,Math.sin(yaw+1.57)):new THREE.Vector3().crossVectors(dirs[0],n).normalize();
    if(side0.lengthSq()<1e-6)side0.copy(tA);
    const hue=R(),phase=R()*6.283,patch=kind==='grass'?clamp(vnoise3(p.x*0.7+9,0,p.z*0.7)*1.6-0.45,0,1)*0.6:0,br=0.8+0.4*hue;
    const cards=kind==='fur'?[side0,new THREE.Vector3().crossVectors(dirs[0],side0).normalize()]:[side0];
    const bidx=W&&W[smp.v]?W[smp.v].reduce((a,b)=>b.weight>a.weight?b:a).bone:0;
    for(const ax of cards){
      const o0=pos.length/3;
      for(let k=0;k<=seg;k++){const t=k/seg,P=pts[k],ww=F.width*(kind==='grass'?(1-Math.pow(t,1.6))*0.5+0.02:kind==='hair'?(t>0.75?(1-t)*4:1)*0.5:(1-t*0.9));
        // normal: mistura a face da lâmina com a normal da superfície -> iluminação macia, sem "serrilhado"
        const bn=new THREE.Vector3().crossVectors(ax,dirs[k]).normalize().lerp(n,kind==='hair'?0.75:0.65).normalize();
        for(const sg of [-1,1]){pos.push(P.x+ax.x*ww*sg,P.y+ax.y*ww*sg,P.z+ax.z*ww*sg);nor.push(bn.x,bn.y,bn.z);
          const c=cr.clone().lerp(ct,Math.pow(t,0.8));if(patch)c.lerp(dry,patch*t);const ao=kind==='grass'?0.35+0.65*t:0.6+0.4*t;col.push(c.r*br*ao,c.g*br*ao,c.b*br*ao);
          wind.push(t*t*len*(F.wind==null?0.3:F.wind)*(kind==='grass'?6:2),phase);bone.push(bidx);}}
      for(let k=0;k<seg;k++){const a=o0+k*2;idx.push(a,a+1,a+3,a,a+3,a+2);}
    }
  }
  if(!pos.length)return;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('aWind',new THREE.Float32BufferAttribute(wind,2));g.setIndex(idx);
  o._fur=new THREE.Mesh(g,furMaterial(F));o._fur.castShadow=kind!=='grass'&&pos.length<200000;o._fur.receiveShadow=true;o._fur.frustumCulled=false;o._fur.raycast=()=>{};o.mesh.add(o._fur);FURS.add(o);
  // pelo/cabelo acompanha o rig: cada fio fica preso ao osso dominante da raiz
  if(W&&o.rigPreviewBones){o._furBind={bone:Uint16Array.from(bone),rest:Float32Array.from(pos),nrest:Float32Array.from(nor)};deformFur(o);}
  need=true;
}
function deformFur(o){
  const B=o._furBind;if(!B||!o._fur||!o.rigPreviewBones||!o.rigBindInvs)return;
  o.mesh.updateMatrixWorld(true);const invMesh=o.mesh.matrixWorld.clone().invert(),mats=o.rigPreviewBones.map((b,i)=>invMesh.clone().multiply(b.matrixWorld).multiply(o.rigBindInvs[i]).multiply(o.rigBindMeshWorld).elements);
  const P=o._fur.geometry.attributes.position.array,N=o._fur.geometry.attributes.normal.array,r=B.rest,nr=B.nrest;
  for(let i=0,n=B.bone.length;i<n;i++){const e=mats[B.bone[i]]||mats[0],x=r[3*i],y=r[3*i+1],z=r[3*i+2],a=nr[3*i],b=nr[3*i+1],c=nr[3*i+2];
    P[3*i]=e[0]*x+e[4]*y+e[8]*z+e[12];P[3*i+1]=e[1]*x+e[5]*y+e[9]*z+e[13];P[3*i+2]=e[2]*x+e[6]*y+e[10]*z+e[14];
    N[3*i]=e[0]*a+e[4]*b+e[8]*c;N[3*i+1]=e[1]*a+e[5]*b+e[9]*c;N[3*i+2]=e[2]*a+e[6]*b+e[10]*c;}
  o._fur.geometry.attributes.position.needsUpdate=o._fur.geometry.attributes.normal.needsUpdate=true;
}
window.buildFur=buildFur;
let furT=0;
on('rebuild',o=>{if(o.ext&&o.ext.fur)buildFur(o);});
on('meshChanged',o=>{if(o.ext&&o.ext.fur){clearTimeout(furT);furT=setTimeout(()=>buildFur(o),200);}});
on('deform',o=>{if(o._furBind)deformFur(o);});
// Gramado pronto: um chão de terra com grama em cima.
function makeLawn(size){
  size=size||5;const em=planeEm(24);for(let i=0;i<em.pos.length;i+=3){em.pos[i]*=size/2.4;em.pos[i+2]*=size/2.4;em.pos[i+1]=(fbm3(em.pos[i]*0.5,0,em.pos[i+2]*0.5,3,0.5)-0.5)*0.12;}
  const o=createObject('Gramado '+(S.objs.length+1),em,{flat:false});o.params.color='#3b2f1e';o.params.rough=1;applyMaterial(o);
  o.ext.fur={...FUR_DEF,...FUR_STYLES.grama,count:Math.min(30000,Math.round(size*size*1100)),seed:Math.floor(Math.random()*1e6)};buildFur(o);
  selectObj(o);push(()=>removeObj(o,true),()=>{scene.add(o.mesh);S.objs.push(o);selectObj(o);});return o;
}
window.makeLawn=makeLawn;

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
on('serialize',d=>{d.fx={v:2,systems:FX.systems.map(strip)};});
function clearFX(){FX.systems.forEach(destroy);FX.systems=[];FX.sel=-1;}
on('clear',clearFX);
on('load',d=>{if(!d.fx)return;(d.fx.systems||[]).forEach(s=>{
  // projetos antigos (v1) não tinham 'kind': converte pelo preset
  if(!s.kind){const P=PRESETS[s.preset];s.kind=P?P.layers[0].kind:'glow';if(s.ground===true)s.ground='bounce';}
  try{build(s);FX.systems.push(s);resetSim(s);}catch(e){console.warn('efeito',e);}});});
on('remove',o=>{if(o._fur){o.mesh.remove(o._fur);}FURS.delete(o);});
function removeSystem(s,all){const list=all?FX.systems.filter(x=>x.group===s.group):[s];list.forEach(destroy);FX.systems=FX.systems.filter(x=>!list.includes(x));FX.sel=-1;need=true;}
window.fxExplodeAt=p=>{const fx=makeSystem('explosion',null);FX.systems.filter(s=>s.group===fx.group).forEach(s=>{s.offset=p.slice();resetSim(s);});return fx;};

/* ===== Painel ===== */
let physOpt={gravity:9.8,bounce:0.35,friction:0.08,spin:3,kick:0,explode:0,ground:true,collide:true};
function panelFX(P){
  const add=k=>{const s=makeSystem(k,S.sel?S.sel.id:null),grp=FX.systems.filter(x=>x.group===s.group);
    push(()=>{grp.forEach(destroy);FX.systems=FX.systems.filter(x=>!grp.includes(x));renderPanel();need=true;},()=>{grp.forEach(x=>{build(x);FX.systems.push(x);resetSim(x);});renderPanel();});
    renderPanel();toast(PRESETS[k].name+(s.emitter!=null&&S.sel?' em '+S.sel.name:''));};
  P.append(row(lb('Efeitos'),...Object.keys(PRESETS).map(k=>chip(PRESETS[k].name,()=>add(k))),chip('Gramado',()=>{makeLawn(5);renderPanel();toast('Gramado criado');},false,'act')));
  if(FX.systems.length){
    if(FX.sel<0||FX.sel>=FX.systems.length)FX.sel=0;const s=FX.systems[FX.sel];
    const sel=h('select',{class:'field',onchange:e=>{FX.sel=+e.target.value;renderPanel();}});FX.systems.forEach((x,i)=>{const op=h('option',{value:i},x.name);if(i===FX.sel)op.selected=true;sel.append(op);});
    P.append(row(lb('Camada'),sel,chip(FX.preview?'Prévia ao vivo':'Prévia parada',()=>{FX.preview=!FX.preview;renderPanel();},FX.preview,'cy'),chip('Reiniciar',()=>FX.systems.forEach(resetSim)),
      chip('Emissor = selecionado',()=>{FX.systems.filter(x=>x.group===s.group).forEach(x=>{x.emitter=S.sel?S.sel.id:null;resetSim(x);});toast(S.sel?'Emissor: '+S.sel.name:'Emissor: origem');}),
      chip('Apagar camada',()=>{removeSystem(s,false);renderPanel();}),chip('Apagar efeito todo',()=>{removeSystem(s,true);renderPanel();})));
    const sl=(t,k,a,b,st,fmt)=>slider(t,a,b,st,s[k]==null?0:s[k],v=>{s[k]=v;rebuildMat(s);},fmt);
    P.append(...['X','Y','Z'].map((a,i)=>slider('Posição '+a,-10,10,0.05,(s.offset||[0,0,0])[i],v=>{s.offset=s.offset||[0,0,0];s.offset[i]=v;if(s.kind==='ocean')oceanUniforms(s);},v=>v.toFixed(2))));
    if(s.kind==='bolt'){
      P.append(row(lb('Cor'),colorIn(s.c0,v=>s.c0=v),lb('Clarão'),colorIn(s.light.color,v=>s.light.color=v),chip('Novo desenho',()=>{s.seed=Math.floor(Math.random()*1e6);s._strike=-1;})));
      P.append(sl('Intervalo (quadros)','period',4,240,1),sl('Duração (quadros)','duration',2,30,1),sl('Altura','height',1,30,0.1),sl('Zigue-zague','jag',0.1,2.5,0.01),sl('Ramos','branches',0,14,1),sl('Espessura','width',0.02,0.8,0.005),sl('Espalhar no chão','spreadXZ',0,12,0.1),
        slider('Força do clarão',0,300,1,s.light.intensity,v=>s.light.intensity=v),sl('Começa no quadro','startFrame',0,S.endFrame,1));
      P.append(h('div',{class:'note'},'O raio cai no objeto emissor (ou no chão) a cada intervalo. Aumente o Bloom na aba Render para o brilho estourar como em foto.'));
    }else if(['veins','core','shards','arcs','beam'].includes(s.kind)){
      const grp=FX.systems.filter(x=>x.group===s.group),all=(k,v)=>grp.forEach(x=>{if(x[k]!==undefined)x[k]=v;});
      P.append(row(lb('Cor da energia'),colorIn(s.c0,v=>{grp.forEach(x=>{if(x.kind==='star'){x.c1=v;}else x.c0=v;if(x.light)x.light.color=v;});}),h('span',{class:'note'},'muda o efeito todo'),
        ...[['#a855ff','Roxo'],['#3da9ff','Azul'],['#ff4d3d','Vermelho'],['#3dff8a','Verde'],['#ffc13d','Dourado']].map(([c,t])=>chip(t,()=>{grp.forEach(x=>{if(x.kind==='star'){x.c1=c;}else x.c0=c;if(x.light)x.light.color=c;});renderPanel();}))));
      if(s.kind!=='beam')P.append(slider('Ativação: começa no quadro',0,S.endFrame,1,s.actStart||0,v=>{all('actStart',v);grp.forEach(x=>{if(x.burst)x.startFrame=v+Math.round((s.actLen||0)*0.8);});}),slider('Ativação: duração (quadros)',0,120,1,s.actLen||0,v=>all('actLen',v)),sl('Brilho em repouso','idle',0,1,0.01));
      if(s.kind==='veins')P.append(sl('Intensidade','intensity',0,5,0.01),sl('Tamanho das veias','scale',0.5,12,0.05),sl('Escurecer a peça','dark',0,1,0.01));
      if(s.kind==='core')P.append(sl('Tamanho do núcleo','size',0.1,5,0.01),slider('Luz',0,40,0.1,s.light.intensity,v=>s.light.intensity=v));
      if(s.kind==='shards')P.append(sl('Quantidade','count',1,80,1),sl('Tamanho','size',0.02,0.6,0.005),sl('Raio da órbita','orbit',0.5,4,0.01),sl('Velocidade','speed',0,3,0.01));
      if(s.kind==='arcs')P.append(sl('Quantidade','count',0,30,1),sl('Espessura','width',0.005,0.2,0.001),sl('Zigue-zague','jag',0,1.5,0.01),sl('Alcance','maxLen',0.1,4,0.01));
      if(s.kind==='beam')P.append(sl('Intervalo (quadros)','period',4,240,1),sl('Duração (quadros)','duration',2,40,1),sl('Alcance','length',1,40,0.1),sl('Espessura','width',0.02,0.8,0.005),
        ...['X','Y','Z'].map((a,i)=>slider('Direção '+a,-1,1,0.01,s.dir[i],v=>{s.dir[i]=v;})),slider('Clarão',0,150,1,s.light.intensity,v=>s.light.intensity=v));
      P.append(h('div',{class:'note'},s.kind==='beam'?'O tiro sai do objeto emissor (use Posição para pôr na ponta do cano) na direção escolhida.':'Sequência do efeito: toque ▶ na aba Animar — a peça acende, os fragmentos se soltam e o núcleo abre. Aumente o Bloom no Render para o brilho estourar.'));
    }else if(s.kind==='ocean'){
      P.append(row(lb('Fundo'),colorIn(s.deep,v=>{s.deep=v;oceanUniforms(s);}),lb('Raso'),colorIn(s.shallow,v=>{s.shallow=v;oceanUniforms(s);})));
      P.append(sl('Tamanho','size',2,80,0.5),sl('Altura das ondas','waveH',0,0.8,0.005),sl('Comprimento das ondas','waveLen',0.3,12,0.05),sl('Ondas pontudas','chop',0,1.2,0.01),sl('Espuma','foam',0,1,0.01),sl('Nível (altura)','y',-2,5,0.01));
      P.append(h('div',{class:'note'},'A água reflete o céu (aba Cena › Céu gradiente) e o sol (direção e altura do sol). Sol baixo dá o reflexo dourado no horizonte.'));
    }else{
      P.append(row(lb('Forma'),...[['point','Ponto'],['surface','Superfície'],['sky','Céu (área)'],['box','Volume']].map(([k,t])=>chip(t,()=>{s.shape=k;resetSim(s);renderPanel();},s.shape===k,'cy')),
        chip('Aditivo (brilho)',()=>{s.add=!s.add;rebuildMat(s);renderPanel();},s.add,'cy'),
        ...[[null,'Sem chão'],['bounce','Quica'],['splash','Respinga'],['stick','Gruda']].map(([k,t])=>chip(t,()=>{s.ground=k;destroy(s);build(s);resetSim(s);renderPanel();},(s.ground||null)===k))));
      P.append(row(lb('Cores'),colorIn(s.c0,v=>s.c0=v),h('span',{class:'note'},'→'),colorIn(s.c1,v=>s.c1=v),s.light?lb('Luz'):null,s.light?colorIn(s.light.color,v=>s.light.color=v):null));
      P.append(sl('Taxa (por s)','rate',0,3000,1),sl('Explosão (qtd.)','burst',0,4000,10),sl('Vida (s)','life',0.1,10,0.05),sl('Velocidade','speed',0,15,0.05),sl('Espalhamento','spread',0,1,0.01),
        sl('Gravidade','gravity',-10,15,0.05),sl('Arrasto','drag',0,5,0.05),sl('Turbulência','turb',0,4,0.05),sl('Redemoinho','swirl',0,5,0.05),
        sl('Tamanho inicial','size',0,3,0.002),sl('Tamanho final','sizeEnd',0,4,0.002),sl('Esticar com a velocidade','stretch',0,0.2,0.001),sl('Altura da chama','tall',0.5,4,0.05),sl('Giro','spin',0,4,0.05),
        sl('Opacidade inicial','a0',0,1,0.01),sl('Opacidade final','a1',0,1,0.01),sl('Área (céu/volume)','areaSize',1,40,0.5),sl('Começa no quadro','startFrame',0,S.endFrame,1));
      if(s.light)P.append(slider('Luz: força',0,80,0.1,s.light.intensity,v=>s.light.intensity=v),slider('Luz: tremor',0,1,0.01,s.light.flicker||0,v=>s.light.flicker=v));
    }
  }else P.append(h('div',{class:'note'},'Selecione um objeto (Layout) e toque num efeito: fogo e fumaça saem da superfície dele, o raio cai nele. Chuva, neve e água cobrem a cena. Tudo segue a timeline e sai no Render e no vídeo.'));
  // Gramado / pelo
  P.append(h('div',{class:'lb'},'Gramado / pelo / cabelo'));
  const o=S.sel;
  if(o){const F=o.ext.fur,style=k=>{o.ext.fur={...FUR_DEF,...FUR_STYLES[k],seed:Math.floor(Math.random()*1e6)};buildFur(o);renderPanel();};
    P.append(row(F?chip('Remover',()=>{delete o.ext.fur;buildFur(o);renderPanel();},true,'act'):lb('Em '+o.name),chip('Grama',()=>style('grama')),chip('Cabelo',()=>style('cabelo')),chip('Pelo',()=>style('pelo')),chip('Pelúcia',()=>style('pelucia'))));
    if(F){let t;const rb=()=>{clearTimeout(t);t=setTimeout(()=>buildFur(o),140);};
      P.append(row(lb('Raiz'),colorIn(F.root,v=>{F.root=v;rb();}),lb('Ponta'),colorIn(F.tip,v=>{F.tip=v;rb();}),chip('Só onde pintado',()=>{F.onlyPainted=!F.onlyPainted;rb();renderPanel();},F.onlyPainted,'cy'),chip('Novo sorteio',()=>{F.seed=Math.floor(Math.random()*1e6);rb();})));
      P.append(slider('Quantidade',100,60000,100,F.count,v=>{F.count=v;rb();}),slider('Comprimento',0.005,1.5,0.005,F.length,v=>{F.length=v;rb();}),slider('Caimento',0,3,0.01,F.droop,v=>{F.droop=v;rb();}),
        slider('Vento',0,3,0.01,F.wind==null?0.3:F.wind,v=>{F.wind=v;rb();}),slider('Tufos',0,1,0.01,F.clump||0,v=>{F.clump=v;rb();}),slider('Pentear (Z)',-2,2,0.01,F.comb,v=>{F.comb=v;rb();}),slider('Variação',0,1,0.01,F.random,v=>{F.random=v;rb();}),
        slider('Largura',0.001,0.05,0.0005,F.width,v=>{F.width=v;rb();},v=>v.toFixed(4)),slider('Segmentos',2,10,1,F.segments,v=>{F.segments=v;rb();}));
      P.append(h('div',{class:'note'},'“Só onde pintado”: pinte de qualquer cor (aba Material › Pintar na malha) onde quer grama/pelo; o branco fica sem.'));}
  }else P.append(h('div',{class:'note'},'Toque em “Gramado” acima para um gramado pronto, ou selecione um objeto para cobrir de grama, pelo ou cabelo.'));
  // Física
  P.append(h('div',{class:'lb'},'Física (corpo rígido)'));
  P.append(row(chip('Cair e quicar: selecionado',()=>{if(!S.sel)return toast('Selecione um objeto');bakeRigid([S.sel],physOpt);},false,'act'),chip('Todos os objetos',()=>bakeRigid(S.objs.slice(),physOpt)),
    chip('Estilhaçar + explodir',()=>{if(!S.sel)return toast('Selecione um objeto');const c=S.sel.mesh.getWorldPosition(new THREE.Vector3()).toArray(),made=shatter(S.sel,physOpt.pieces||14);bakeRigid(made,{...physOpt,explode:physOpt.explode||4});fxExplodeAt(c);renderPanel();})));
  P.append(row(chip('Chão',()=>{physOpt.ground=!physOpt.ground;renderPanel();},physOpt.ground,'cy'),chip('Colisão entre objetos',()=>{physOpt.collide=!physOpt.collide;renderPanel();},physOpt.collide,'cy')));
  P.append(slider('Gravidade',0,30,0.1,physOpt.gravity,v=>physOpt.gravity=v),slider('Quique',0,0.95,0.01,physOpt.bounce,v=>physOpt.bounce=v),slider('Atrito',0,0.5,0.005,physOpt.friction,v=>physOpt.friction=v),
    slider('Giro',0,15,0.1,physOpt.spin,v=>physOpt.spin=v),slider('Empurrão inicial',0,10,0.1,physOpt.kick,v=>physOpt.kick=v),slider('Explosão (força)',0,15,0.1,physOpt.explode,v=>physOpt.explode=v),slider('Pedaços (estilhaçar)',3,60,1,physOpt.pieces||14,v=>physOpt.pieces=v));
}
PANELS_EXT.fx=panelFX;
TABS.splice(TABS.findIndex(t=>t[0]==='anim'),0,['fx','Efeitos']);
})();
