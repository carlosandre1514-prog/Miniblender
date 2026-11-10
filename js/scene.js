'use strict';
/* =====================================================================
   MiniBlender · Cena: luzes, câmeras, mundo (céu, neblina) e proporção
   do render. Tudo salvo no projeto.
   ===================================================================== */
(function(){
const W={lights:[],cams:[],activeCam:-1,lockCam:false,sky:'flat',skyTop:'#2b3b5c',skyBottom:'#0a0a0a',fog:0,fogColor:'#0a0a0a',sunI:2.2,sunAz:40,sunEl:55,ambient:0.35,envI:1,uid:0,sel:-1};
window.WORLD=W;
const lightGroup=new THREE.Group();lightGroup.name='Luzes';scene.add(lightGroup);
const camGroup=new THREE.Group();camGroup.name='Cameras';scene.add(camGroup);
const hemi=scene.children.find(x=>x.isHemisphereLight);

function makeLight(L){
  let l;
  if(L.type==='spot'){l=new THREE.SpotLight(L.color,L.intensity,L.distance||0,(L.angle||35)*Math.PI/180,L.penumbra==null?0.3:L.penumbra,2);l.target.position.fromArray(L.target||[0,0,0]);lightGroup.add(l.target);}
  else if(L.type==='sun'){l=new THREE.DirectionalLight(L.color,L.intensity);l.target.position.fromArray(L.target||[0,0,0]);lightGroup.add(l.target);const c=l.shadow.camera;c.left=c.bottom=-6;c.right=c.top=6;c.near=0.5;c.far=40;}
  else{l=new THREE.PointLight(L.color,L.intensity,L.distance||0,2);}
  l.position.fromArray(L.pos);l.castShadow=!!L.shadow;l.shadow.mapSize.set(1024,1024);l.shadow.bias=-0.0005;
  const hm=new THREE.Mesh(new THREE.SphereGeometry(0.07,12,8),new THREE.MeshBasicMaterial({color:L.color,wireframe:true,depthTest:false}));hm.renderOrder=30;hm.userData.helper=true;l.add(hm);
  L._obj=l;L._helper=hm;lightGroup.add(l);return l;
}
function syncLight(L){
  const l=L._obj;if(!l)return;l.color.set(L.color);l.intensity=L.intensity;l.position.fromArray(L.pos);l.castShadow=!!L.shadow;
  if(l.target)l.target.position.fromArray(L.target||[0,0,0]);if(L.type==='spot'){l.angle=(L.angle||35)*Math.PI/180;l.penumbra=L.penumbra==null?0.3:L.penumbra;}
  if(l.distance!==undefined&&L.type!=='sun')l.distance=L.distance||0;L._helper.material.color.set(L.color);need=true;
}
function removeLight(L){if(L._obj){lightGroup.remove(L._obj);if(L._obj.target)lightGroup.remove(L._obj.target);}}
function addLight(type,silent){
  const t=orb.t,L={id:++W.uid,type,name:({point:'Luz pontual',spot:'Spot',sun:'Sol'})[type]+' '+(W.lights.length+1),color:type==='sun'?'#fff4e0':'#ffffff',intensity:type==='sun'?2:type==='spot'?40:20,
    pos:[t.x+1.5,t.y+2.5,t.z+1.5],target:[t.x,t.y,t.z],shadow:true,distance:0,angle:35,penumbra:0.3};
  W.lights.push(L);makeLight(L);W.sel=W.lights.length-1;
  if(!silent)push(()=>{removeLight(L);W.lights=W.lights.filter(x=>x!==L);renderPanel();need=true;},()=>{W.lights.push(L);makeLight(L);renderPanel();need=true;});
  need=true;return L;
}
window.addSceneLight=addLight;

/* ---- Câmeras: guardam a pose da órbita + FOV, podem ter chaves ---- */
const camPose=()=>({th:orb.th,ph:orb.ph,d:orb.d,t:orb.t.toArray(),fov:cam.fov});
function setPose(p){orb.th=p.th;orb.ph=p.ph;orb.d=p.d;orb.t.fromArray(p.t);if(p.fov){cam.fov=p.fov;cam.updateProjectionMatrix();}applyCam();}
function camHelper(C){
  if(C._h){camGroup.remove(C._h);C._h.geometry.dispose();}
  const s=0.25,z=-0.45,pts=[0,0,0,-s,s*0.6,z, 0,0,0,s,s*0.6,z, 0,0,0,s,-s*0.6,z, 0,0,0,-s,-s*0.6,z, -s,s*0.6,z,s,s*0.6,z, s,s*0.6,z,s,-s*0.6,z, s,-s*0.6,z,-s,-s*0.6,z, -s,-s*0.6,z,-s,s*0.6,z, -s*0.4,s*0.7,z,0,s,z, 0,s,z,s*0.4,s*0.7,z];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  const h=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xffb000}));
  const tmp=new THREE.PerspectiveCamera();const p=C.pose,sn=Math.sin(p.ph),T=new THREE.Vector3().fromArray(p.t);
  tmp.position.set(T.x+p.d*sn*Math.sin(p.th),T.y+p.d*Math.cos(p.ph),T.z+p.d*sn*Math.cos(p.th));tmp.lookAt(T);
  h.position.copy(tmp.position);h.quaternion.copy(tmp.quaternion);h.visible=W.activeCam!==W.cams.indexOf(C);C._h=h;camGroup.add(h);need=true;
}
function addCam(){const C={id:++W.uid,name:'Câmera '+(W.cams.length+1),pose:camPose(),keys:{}};W.cams.push(C);camHelper(C);W.activeCam=W.cams.length-1;refreshHelpers();toast('Câmera criada a partir da vista atual');return C;}
window.addSceneCamera=()=>addCam();
function refreshHelpers(){W.cams.forEach((C,i)=>{if(C._h)C._h.visible=i!==W.activeCam;});$('#camFrame').style.display=W.activeCam>=0?'block':'none';updFrame();need=true;}
function lookThrough(i){W.activeCam=i;if(i>=0)setPose(W.cams[i].pose);refreshHelpers();renderPanel();}
// Moldura de proporção do render (passe-partout) sobre a viewport.
const fr=h('div',{id:'camFrame',style:'position:absolute;inset:0;pointer-events:none;display:none;box-shadow:inset 0 0 0 2px #ffb000'});$('#stage').append(fr);
function updFrame(){
  const a=S.rd.aspect;if(!a||W.activeCam<0){fr.style.cssText+=';left:0;top:0;right:0;bottom:0';return;}
  const r=$('#stage').getBoundingClientRect(),va=r.width/r.height;let w=r.width,hh=r.height;if(a>va)hh=w/a;else w=hh*a;
  fr.style.left=((r.width-w)/2)+'px';fr.style.right=((r.width-w)/2)+'px';fr.style.top=((r.height-hh)/2)+'px';fr.style.bottom=((r.height-hh)/2)+'px';
}
addEventListener('resize',updFrame);
// Mover a vista com a câmera travada atualiza a câmera ativa.
on('tick',()=>{if(W.activeCam>=0&&W.lockCam){const C=W.cams[W.activeCam];const p=camPose();if(JSON.stringify(p)!==JSON.stringify(C.pose)){C.pose=p;}}});
function evalCamKeys(C,f){
  const ks=Object.keys(C.keys||{}).map(Number).sort((a,b)=>a-b);if(!ks.length)return null;
  if(f<=ks[0])return C.keys[ks[0]];if(f>=ks[ks.length-1])return C.keys[ks[ks.length-1]];
  let i=0;while(ks[i+1]<f)i++;const A=C.keys[ks[i]],B=C.keys[ks[i+1]];let t=(f-ks[i])/(ks[i+1]-ks[i]);if(S.smooth)t=t*t*(3-2*t);
  const L=(a,b)=>a+(b-a)*t;return {th:L(A.th,B.th),ph:L(A.ph,B.ph),d:L(A.d,B.d),t:A.t.map((v,j)=>L(v,B.t[j])),fov:L(A.fov,B.fov)};
}
on('frame',f=>{if(W.activeCam<0)return;const C=W.cams[W.activeCam],p=evalCamKeys(C,f);if(p){C.pose=p;setPose(p);}});

/* ---- Mundo ---- */
let skyTex=null;
function applyWorld(){
  sun.intensity=W.sunI;const az=W.sunAz*Math.PI/180,el=W.sunEl*Math.PI/180;sun.position.set(Math.cos(el)*Math.sin(az)*9,Math.sin(el)*9,Math.cos(el)*Math.cos(az)*9);
  if(hemi)hemi.intensity=W.ambient;
  if(W.sky==='gradient'){
    const c=document.createElement('canvas');c.width=2;c.height=256;const x=c.getContext('2d'),gr=x.createLinearGradient(0,0,0,256);gr.addColorStop(0,W.skyTop);gr.addColorStop(1,W.skyBottom);x.fillStyle=gr;x.fillRect(0,0,2,256);
    if(skyTex)skyTex.dispose();skyTex=new THREE.CanvasTexture(c);skyTex.encoding=THREE.sRGBEncoding;scene.background=skyTex;
  }else scene.background=new THREE.Color(S.rd.bg);
  scene.fog=W.fog>0?new THREE.FogExp2(W.fogColor,W.fog):null;
  S.objs.forEach(o=>{o.mat.envMapIntensity=W.envI;o.mat.needsUpdate=true;});need=true;
}
window.applyWorld=applyWorld;
const _applyRender=applyRender;
// applyRender redefine o fundo; reaplica o céu depois.
window.applyRender=function(){_applyRender();applyWorld();};
on('beforeRender',()=>{lightGroup.children.forEach(l=>l.children.forEach(c=>{if(c.userData.helper)c.visible=false;}));camGroup.visible=false;});
on('afterRender',()=>{lightGroup.children.forEach(l=>l.children.forEach(c=>{if(c.userData.helper)c.visible=true;}));camGroup.visible=true;});

/* ---- Salvar / abrir ---- */
const strip=L=>{const o={...L};delete o._obj;delete o._helper;delete o._h;return o;};
on('serialize',d=>{d.world={...W,lights:W.lights.map(strip),cams:W.cams.map(strip)};});
on('clear',()=>{W.lights.forEach(removeLight);W.lights=[];W.cams.forEach(C=>{if(C._h)camGroup.remove(C._h);});W.cams=[];W.activeCam=-1;refreshHelpers();});
on('load',d=>{if(!d.world)return;const w=d.world;Object.assign(W,w,{lights:[],cams:[]});(w.lights||[]).forEach(L=>{W.lights.push(L);makeLight(L);});(w.cams||[]).forEach(C=>{C.keys=C.keys||{};W.cams.push(C);camHelper(C);});
  if(w.rdAspect!==undefined)S.rd.aspect=w.rdAspect;applyWorld();if(W.activeCam>=0&&W.cams[W.activeCam])setPose(W.cams[W.activeCam].pose);refreshHelpers();});
on('serialize',d=>{d.world.rdAspect=S.rd.aspect||0;});
on('boot',applyWorld);

/* ---- Painel ---- */
function v3(label,arr,cb){return ['X','Y','Z'].map((a,k)=>slider(label+' '+a,-15,15,0.05,arr[k],v=>{arr[k]=v;cb();},v=>v.toFixed(2)));}
function panelScene(P){
  P.append(row(lb('Adicionar'),chip('Luz pontual',()=>{addLight('point');renderPanel();}),chip('Spot',()=>{addLight('spot');renderPanel();}),chip('Sol',()=>{addLight('sun');renderPanel();}),chip('Câmera',()=>{addCam();renderPanel();},false,'act')));
  // Luzes
  if(W.lights.length){
    const sel=h('select',{class:'field',onchange:e=>{W.sel=+e.target.value;renderPanel();}});W.lights.forEach((L,i)=>{const op=h('option',{value:i},L.name);if(i===W.sel)op.selected=true;sel.append(op);});
    if(W.sel<0||W.sel>=W.lights.length)W.sel=0;const L=W.lights[W.sel],sy=()=>syncLight(L);
    P.append(row(lb('Luz'),sel,colorIn(L.color,v=>{L.color=v;sy();}),chip('Sombra',()=>{L.shadow=!L.shadow;sy();renderPanel();},L.shadow,'cy'),
      chip('Pôr na vista',()=>{L.pos=cam.position.toArray();L.target=orb.t.toArray();sy();renderPanel();}),
      chip('Mirar no selecionado',()=>{if(S.sel){L.target=S.sel.mesh.getWorldPosition(new THREE.Vector3()).toArray();sy();}}),
      chip('Apagar',()=>{removeLight(L);W.lights.splice(W.sel,1);W.sel=-1;renderPanel();need=true;})));
    P.append(slider('Intensidade',0,L.type==='sun'?10:300,0.1,L.intensity,v=>{L.intensity=v;sy();}));
    if(L.type==='spot')P.append(slider('Abertura',5,85,1,L.angle,v=>{L.angle=v;sy();},v=>v+'°'),slider('Suavidade',0,1,0.01,L.penumbra,v=>{L.penumbra=v;sy();}));
    P.append(...v3('Posição',L.pos,sy));
  }
  // Câmeras
  if(W.cams.length){
    P.append(row(lb('Câmera'),chip('Vista livre',()=>lookThrough(-1),W.activeCam<0,'cy'),...W.cams.map((C,i)=>chip(C.name,()=>lookThrough(i),W.activeCam===i,'cy'))));
    if(W.activeCam>=0){const C=W.cams[W.activeCam];
      P.append(row(chip('Travar câmera na vista',()=>{W.lockCam=!W.lockCam;renderPanel();},W.lockCam,'cy'),chip('Alinhar à vista',()=>{C.pose=camPose();camHelper(C);refreshHelpers();toast('Câmera alinhada');}),
        chip('◆ Chave de câmera',()=>{C.keys[Math.round(S.frame)]=camPose();toast('Chave de câmera no quadro '+Math.round(S.frame));},false,'act'),chip('Limpar chaves',()=>{C.keys={};}),
        chip('Apagar câmera',()=>{if(C._h)camGroup.remove(C._h);W.cams.splice(W.activeCam,1);W.activeCam=-1;refreshHelpers();renderPanel();})));
      P.append(slider('Lente (FOV)',10,110,1,cam.fov,v=>{cam.fov=v;cam.updateProjectionMatrix();C.pose.fov=v;need=true;},v=>v+'°'));
    }
  }
  P.append(row(lb('Proporção do render'),...[[0,'Tela'],[16/9,'16:9'],[9/16,'9:16'],[1,'1:1'],[4/5,'4:5'],[2.39,'Cinema']].map(([a,t])=>chip(t,()=>{S.rd.aspect=a;updFrame();renderPanel();},(S.rd.aspect||0)===a))));
  // Mundo
  P.append(h('div',{class:'lb'},'Mundo'));
  P.append(row(lb('Céu'),chip('Cor sólida',()=>{W.sky='flat';applyWorld();renderPanel();},W.sky==='flat'),chip('Gradiente',()=>{W.sky='gradient';applyWorld();renderPanel();},W.sky==='gradient'),
    W.sky==='gradient'?colorIn(W.skyTop,v=>{W.skyTop=v;applyWorld();}):null,W.sky==='gradient'?colorIn(W.skyBottom,v=>{W.skyBottom=v;applyWorld();}):null));
  P.append(slider('Sol: força',0,8,0.05,W.sunI,v=>{W.sunI=v;applyWorld();}),slider('Sol: direção',0,360,1,W.sunAz,v=>{W.sunAz=v;applyWorld();},v=>v+'°'),slider('Sol: altura',2,90,1,W.sunEl,v=>{W.sunEl=v;applyWorld();},v=>v+'°'),
    slider('Luz ambiente',0,2,0.01,W.ambient,v=>{W.ambient=v;applyWorld();}),slider('Reflexos (HDRI)',0,3,0.01,W.envI,v=>{W.envI=v;applyWorld();}),
    slider('Neblina',0,0.3,0.002,W.fog,v=>{W.fog=v;applyWorld();},v=>v.toFixed(3)),row(lb('Cor da neblina'),colorIn(W.fogColor,v=>{W.fogColor=v;applyWorld();})));
}
PANELS_EXT.scene=panelScene;
TABS.splice(1,0,['scene','Cena']);
})();
