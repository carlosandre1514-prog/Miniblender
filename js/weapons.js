'use strict';
/* =====================================================================
   MiniBlender · Armas e efeitos de arma
   - Modelos prontos (fuzil, pistola, sniper) com a boca do cano e a
     janela de ejeção marcadas (o.ext.weapon).
   - Disparo: clarão na boca, traçante cruzando a cena, fumaça, cápsulas
     ejetadas e faíscas/poeira no impacto. Tudo calculado direto do quadro
     (sem estado), então dá para voltar e avançar a timeline à vontade.
   - Arma fragmentada: a malha se parte em pedaços que flutuam, com as
     rachaduras e o interior brilhando, raios internos e núcleo no centro.
   Usa os ganchos FXK de js/effects.js.
   ===================================================================== */
(function(){
const K=window.FXK,V3=(x,y,z)=>new THREE.Vector3(x,y,z);

/* ---------- modelos de arma (blocos e cilindros, cano no eixo +X) ---------- */
const COL={metal:'#2a2c31',dark:'#17181b',wood:'#7a4a24',poly:'#222326',brass:'#b08d3c',glass:'#3a5f8a'};
function mk(){return {pos:[],col:[],faces:[]};}
function addBox(em,c,s,color,rotZ){
  const o=em.pos.length/3,rgb=hexRgb(color).map(s2l),cs=Math.cos(rotZ||0),sn=Math.sin(rotZ||0);
  for(const [x,y,z] of [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]){const lx=x*s[0]/2,ly=y*s[1]/2;em.pos.push(c[0]+lx*cs-ly*sn,c[1]+lx*sn+ly*cs,c[2]+z*s[2]/2);em.col.push(...rgb);}
  [[4,5,6,7],[1,0,3,2],[5,1,2,6],[0,4,7,3],[3,7,6,2],[0,1,5,4]].forEach(f=>em.faces.push(f.map(v=>v+o)));
}
function addCylX(em,x0,x1,y,z,r,color,n){
  n=n||10;const o=em.pos.length/3,rgb=hexRgb(color).map(s2l);
  for(const x of [x0,x1])for(let j=0;j<n;j++){const a=j/n*Math.PI*2;em.pos.push(x,y+Math.cos(a)*r,z+Math.sin(a)*r);em.col.push(...rgb);}
  for(let j=0;j<n;j++)em.faces.push([o+j,o+(j+1)%n,o+n+(j+1)%n,o+n+j]);
  const a=[],b=[];for(let j=0;j<n;j++){a.push(o+n-1-j);b.push(o+n+j);}em.faces.push(a,b);
}
const WEAPONS={
  rifle:{name:'Fuzil',build(){const e=mk();
    addBox(e,[0,0,0],[0.3,0.07,0.045],COL.metal);addBox(e,[0,0.042,0],[0.28,0.016,0.04],COL.dark);            // caixa da culatra + tampa
    addBox(e,[0.26,0.002,0],[0.22,0.055,0.05],COL.wood);addBox(e,[0.26,0.04,0],[0.2,0.022,0.036],COL.wood);     // guarda-mão
    addCylX(e,0.15,0.62,0.012,0,0.011,COL.dark,10);addCylX(e,0.16,0.45,0.045,0,0.008,COL.dark,8);               // cano e tubo de gás
    addCylX(e,0.62,0.68,0.012,0,0.016,COL.dark,10);                                                               // quebra-chamas
    addBox(e,[0.56,0.045,0],[0.016,0.06,0.012],COL.dark);addBox(e,[0.47,0.03,0],[0.03,0.045,0.03],COL.dark);     // massa de mira e bloco de gás
    addBox(e,[0.1,0.06,0],[0.05,0.018,0.026],COL.dark);                                                           // alça de mira
    addBox(e,[-0.3,-0.02,0],[0.32,0.07,0.04],COL.wood,-0.09);addBox(e,[-0.46,-0.035,0],[0.02,0.11,0.042],COL.dark,-0.09); // coronha
    addBox(e,[-0.1,-0.085,0],[0.045,0.12,0.036],COL.wood,0.3);                                                    // punho
    for(let i=0;i<6;i++){const a=i*0.11;addBox(e,[0.06+Math.sin(a)*0.11*i/2.2,-0.06-i*0.036,0],[0.062,0.042,0.03],COL.metal,a);} // carregador curvo
    addBox(e,[-0.03,-0.055,0],[0.09,0.006,0.02],COL.dark);addBox(e,[-0.075,-0.045,0],[0.006,0.025,0.02],COL.dark);addBox(e,[-0.04,-0.045,0],[0.006,0.022,0.008],COL.dark); // guarda-mato e gatilho
    addBox(e,[0.03,0.018,0.03],[0.035,0.012,0.02],COL.dark);                                                      // alavanca de manejo
    return {em:e,muzzle:[0.69,0.012,0],eject:[0.02,0.03,0.035],scale:1.6};}},
  pistol:{name:'Pistola',build(){const e=mk();
    addBox(e,[0.02,0.02,0],[0.2,0.034,0.03],COL.metal);addBox(e,[0.02,-0.008,0],[0.17,0.024,0.028],COL.poly);     // ferrolho e armação
    addBox(e,[-0.05,-0.075,0],[0.048,0.115,0.03],COL.poly,0.2);addBox(e,[-0.065,-0.135,0],[0.05,0.012,0.032],COL.dark,0.2); // punho e base do carregador
    addCylX(e,0.115,0.13,0.022,0,0.008,COL.dark,10);                                                              // ponta do cano
    addBox(e,[0.035,-0.035,0],[0.07,0.005,0.014],COL.poly);addBox(e,[0.07,-0.027,0],[0.005,0.02,0.014],COL.poly);addBox(e,[0.02,-0.028,0],[0.006,0.018,0.006],COL.dark);
    addBox(e,[0.105,0.041,0],[0.008,0.008,0.006],COL.dark);addBox(e,[-0.07,0.041,0],[0.01,0.008,0.02],COL.dark);  // miras
    return {em:e,muzzle:[0.135,0.022,0],eject:[0,0.035,0.02],scale:1.8};}},
  sniper:{name:'Sniper',build(){const e=mk();
    addBox(e,[0,0,0],[0.34,0.06,0.045],COL.metal);addBox(e,[0.3,-0.005,0],[0.3,0.045,0.05],COL.poly);
    addCylX(e,0.17,0.95,0.012,0,0.012,COL.dark,12);addCylX(e,0.95,1.05,0.012,0,0.02,COL.dark,12);                 // cano longo + freio de boca
    addCylX(e,-0.1,0.24,0.085,0,0.022,COL.dark,12);addCylX(e,0.2,0.3,0.085,0,0.03,COL.dark,12);addCylX(e,-0.16,-0.1,0.085,0,0.027,COL.dark,12); // luneta
    addCylX(e,0.296,0.302,0.085,0,0.026,COL.glass,12);
    addBox(e,[-0.02,0.05,0],[0.02,0.04,0.02],COL.dark);addBox(e,[0.14,0.05,0],[0.02,0.04,0.02],COL.dark);        // anéis
    addBox(e,[-0.34,-0.015,0],[0.36,0.08,0.04],COL.poly,-0.05);addBox(e,[-0.52,-0.025,0],[0.02,0.12,0.045],COL.dark,-0.05);addBox(e,[-0.33,0.04,0],[0.14,0.02,0.035],COL.dark);
    addBox(e,[-0.12,-0.085,0],[0.045,0.12,0.036],COL.poly,0.28);addBox(e,[0.05,-0.07,0],[0.07,0.09,0.03],COL.metal);
    addBox(e,[0.42,-0.1,0.04],[0.012,0.18,0.012],COL.dark,0.25);addBox(e,[0.42,-0.1,-0.04],[0.012,0.18,0.012],COL.dark,0.25); // bipé
    addBox(e,[0.08,0.02,0.035],[0.012,0.012,0.04],COL.dark);                                                       // ferrolho manual
    return {em:e,muzzle:[1.06,0.012,0],eject:[0.04,0.03,0.035],scale:1.5};}}
};
function createWeapon(type,silent){
  const W=WEAPONS[type]||WEAPONS.rifle,B=W.build(),sc=B.scale;
  for(let i=0;i<B.em.pos.length;i++)B.em.pos[i]*=sc;
  const o=createObject(W.name+' '+(S.objs.length+1),B.em,{flat:true});
  o.params.color='#ffffff';o.params.metal=0.55;o.params.rough=0.42;applyMaterial(o);o.mesh.position.set(0,1.1,0);
  o.ext.weapon={type,muzzle:B.muzzle.map(v=>v*sc),eject:B.eject.map(v=>v*sc),dir:[1,0,0]};
  if(!silent){selectObj(o);push(()=>removeObj(o,true),()=>{scene.add(o.mesh);S.objs.push(o);selectObj(o);});$('#fFrame').click();}
  return o;
}
window.createWeapon=createWeapon;window.WEAPONS=WEAPONS;

/* ---------- ponto da boca do cano / ejeção no mundo, no quadro pedido ---------- */
const _m=new THREE.Matrix4(),_p=new THREE.Vector3(),_q=new THREE.Quaternion(),_s=new THREE.Vector3();
// Matriz do emissor no quadro f: se o objeto tem keyframes, usa a pose daquele quadro (o tiro sai de onde a arma estava).
function matrixAt(o,f){
  if(!o)return _m.identity().clone();
  const k=Object.keys(o.keys||{}).length?evalKeys(o,f):null;
  if(!k){o.mesh.updateMatrixWorld(true);return o.mesh.matrixWorld.clone();}
  return new THREE.Matrix4().compose(_p.fromArray(k.p),_q.fromArray(k.q),_s.fromArray(k.s));
}
function gunFrame(sys,f){
  const o=sys.emitter!=null?S.objs.find(x=>x.id===sys.emitter):null,M=matrixAt(o,f),w=o&&o.ext&&o.ext.weapon,of=sys.offset||[0,0,0];
  let mz,ej;
  if(w){mz=w.muzzle;ej=w.eject;}
  else if(o){// sem marcação: usa a ponta +X da caixa da malha
    const P=o.em.pos;let mx=-Infinity,cy=0,cz=0,n=0,ay=0,az=0;for(let i=0;i<P.length;i+=3){if(P[i]>mx)mx=P[i];ay+=P[i+1];az+=P[i+2];n++;}cy=ay/n;cz=az/n;mz=[mx,cy,cz];ej=[mx*0.2,cy,cz];}
  else{mz=[0,1,0];ej=[-0.3,1,0];}
  const O=V3(mz[0]+of[0],mz[1]+of[1],mz[2]+of[2]).applyMatrix4(M),E=V3(ej[0],ej[1],ej[2]).applyMatrix4(M);
  const D=V3(...sys.dir).transformDirection(M),R=V3(0,0,1).transformDirection(M),U=V3(0,1,0).transformDirection(M);
  return {o,O,E,D,R,U};
}
const ray=new THREE.Raycaster();
function hitScan(sys,G,O,D){
  // primeiro alvo na linha de tiro: outros objetos da cena ou o chão (y=0)
  let best={d:sys.range,n:null,hit:false};
  ray.set(O,D);ray.far=sys.range;const list=S.objs.filter(x=>x!==G.o&&x.mesh.visible).map(x=>x.mesh),h=ray.intersectObjects(list,false)[0];
  if(h){best={d:h.distance,n:h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld):D.clone().negate(),hit:true};}
  if(D.y<-1e-4){const t=-O.y/D.y;if(t>0&&t<best.d)best={d:t,n:V3(0,1,0),hit:true};}
  return best;
}
// Sequência de tiros: devolve [quadro do tiro k] para os tiros ainda "vivos" no quadro f.
function shotsAlive(sys,f,lifeFrames){
  const iv=Math.max(1,S.fps*60/Math.max(30,sys.rpm)),out=[],t=f-(sys.startFrame||0);if(t<0)return out;
  if(sys.mode==='single'){const per=Math.max(iv,sys.gap||30);for(let k=Math.floor(t/per);k>=0&&t-k*per<lifeFrames;k--){if(sys.shots&&k>=sys.shots)continue;out.push([k,(sys.startFrame||0)+k*per]);}return out;}
  if(sys.mode==='burst'){const n=Math.max(1,sys.burstCount|0),per=n*iv+(sys.gap||20);
    for(let b=Math.floor(t/per);b>=0&&t-b*per<lifeFrames+n*iv;b--)for(let i=n-1;i>=0;i--){const ft=b*per+i*iv,k=b*n+i;if(ft>t||t-ft>=lifeFrames)continue;if(sys.shots&&k>=sys.shots)continue;out.push([k,(sys.startFrame||0)+ft]);}return out;}
  for(let k=Math.floor(t/iv);k>=0&&t-k*iv<lifeFrames;k--){if(sys.shots&&k>=sys.shots)continue;out.push([k,(sys.startFrame||0)+k*iv]);}
  return out;
}
function buildGun(sys){
  sys._mesh=K.boltMesh();                                   // traçantes
  sys._m2=K.mkMesh('muzzle',{add:true,tall:sys.flashLen||2.2},8);sys._m2.renderOrder=9;
  sys._m3=K.mkMesh('smoke',{add:false,spin:0.8},400);
  sys._m4=K.mkMesh('spark',{add:true,stretch:0.02},1200);
  const cg=new THREE.CylinderGeometry(0.006,0.006,0.03,7);cg.rotateZ(Math.PI/2);
  sys._m5=new THREE.InstancedMesh(cg,new THREE.MeshStandardMaterial({color:0xb08d3c,metalness:0.85,roughness:0.3}),60);sys._m5.frustumCulled=false;sys._m5.castShadow=true;sys._m5.raycast=()=>{};sys._m5.count=0;scene.add(sys._m5);
  sys._light=new THREE.PointLight(0xffc27a,0,8,2);scene.add(sys._light);sys._hits=new Map();
}
const _M=new THREE.Matrix4(),_S1=new THREE.Vector3(1,1,1);
function evalGun(sys,frame){
  const fps=S.fps,g=9.8,segs=[],fl=[],sm=[],sp=[];let casN=0,light=0,lightPos=null;
  const life=Math.max(sys.range/Math.max(1,sys.speed)*fps+0.7*fps,1.6*fps);
  for(const [k,fk] of shotsAlive(sys,frame,life)){
    // um gerador por parte do tiro: assim nenhum sorteio depende do que está visível no quadro
    const age=(frame-fk)/fps,sub=i=>K.rng({_rs:(sys.seed+k*9973+i*7717)|0}),R=sub(0),Rf=sub(1),Rs=sub(2),Rc=sub(3),Ri=sub(4),G=gunFrame(sys,fk);
    // dispersão do tiro
    const D=G.D.clone().addScaledVector(G.U,(R()-0.5)*sys.spreadAim).addScaledVector(G.R,(R()-0.5)*sys.spreadAim).normalize();
    let H=sys._hits.get(k);if(!H||H.f!==fk){H=hitScan(sys,G,G.O,D);H.f=fk;sys._hits.set(k,H);if(sys._hits.size>300)sys._hits.delete(sys._hits.keys().next().value);}
    // clarão (dura ~2 quadros) — três quads cruzados em volta do eixo do cano, para ter volume de qualquer ângulo
    const fa=(frame-fk)/2.2;if(fa<1){const a=Math.pow(1-fa,1.3);fl.push([G.O,D,sys.flashSize*(0.75+0.5*Rf())*(0.6+0.4*a),fa,Rf(),a]);if(a>light){light=a;lightPos=G.O;}}
    // traçante: cabeça brilhante e rastro que apaga
    const dist=sys.speed*age;
    if(dist<H.d+sys.tracerLen&&(k%Math.max(1,sys.tracerEvery|0)===0)){
      const head=Math.min(dist,H.d),tail=Math.max(0,dist-sys.tracerLen),N=5;
      if(head>tail)for(let i=0;i<N;i++){const a0=tail+(head-tail)*i/N,a1=tail+(head-tail)*(i+1)/N,I=Math.pow((i+1)/N,2.2);segs.push([G.O.clone().addScaledVector(D,a0),G.O.clone().addScaledVector(D,a1),sys.tracerWidth*(0.35+0.65*(i+1)/N),I*1.5]);}
    }
    // fumaça da boca
    if(sys.smoke>0&&age<1.3)for(let j=0;j<3;j++){const r=Rs(),dv=V3(Rs()-0.5,Rs()-0.5,Rs()-0.5).multiplyScalar(0.25),t=age;
      const p=G.O.clone().addScaledVector(D,(0.1+0.45*r)*(1-Math.exp(-4*t))).addScaledVector(dv,t).add(V3(0,0.22*t,0));
      sm.push([p,V3(0,0,0),(0.05+0.35*Math.min(1,t*1.4))*(0.7+0.6*r),t/1.3,Rs(),sys.smoke*0.42*(1-t/1.3)]);}
    // cápsula ejetada: balística simples com quique e repouso no chão
    if(sys.casings&&age<1.6&&casN<60){const v=G.R.clone().multiplyScalar(1.6+Rc()*0.8).addScaledVector(G.U,1.3+Rc()*0.6).addScaledVector(G.D,-0.3-Rc()*0.5);
      let p=G.E.clone(),vy=v.y,t=age,y=p.y,landed=false;const tl=(vy+Math.sqrt(vy*vy+2*g*Math.max(0,y)))/g;
      if(t<tl){p.addScaledVector(v,t);p.y=y+vy*t-0.5*g*t*t;}
      else{const t2=t-tl,vb=(g*tl-vy)*0.32,tb=2*vb/g;p.addScaledVector(v,tl);p.x+=v.x*0.4*Math.min(t2,tb+0.25);p.z+=v.z*0.4*Math.min(t2,tb+0.25);if(t2<tb)p.y=0.008+vb*t2-0.5*g*t2*t2;else{p.y=0.008;landed=true;}}
      const ax=V3(Rc()-0.5,Rc(),Rc()-0.5).normalize(),sp0=18+Rc()*14;_q.setFromAxisAngle(landed?V3(0,1,0):ax,landed?sp0:t*sp0);
      _M.compose(p,_q,_S1);sys._m5.setMatrixAt(casN++,_M);}
    // impacto: faíscas + poeira
    const ia=age-H.d/Math.max(1,sys.speed);
    if(H.hit&&ia>=0&&ia<0.7){const HP=G.O.clone().addScaledVector(D,H.d),nrm=H.n,refl=D.clone().sub(nrm.clone().multiplyScalar(2*D.dot(nrm)));
      for(let j=0;j<sys.impactSparks;j++){const v=refl.clone().multiplyScalar(1.2+Ri()*3.2).add(V3(Ri()-0.5,Ri()*0.9,Ri()-0.5).multiplyScalar(2.6)),lf=0.25+Ri()*0.45;if(ia>lf)continue;
        const p=HP.clone().addScaledVector(v,ia);p.y-=0.5*g*ia*ia;if(p.y<0.004)p.y=0.004;sp.push([p,V3(v.x,v.y-g*ia,v.z),0.012,ia/lf,Ri(),1-ia/lf]);}
      for(let j=0;j<2;j++){const r=Ri();sm.push([HP.clone().addScaledVector(nrm,0.05+ia*0.5*(0.5+r)),V3(0,0,0),(0.06+0.5*ia)*(0.6+r),ia/0.7,Ri(),0.38*(1-ia/0.7)]);}
      if(ia<0.08&&0.5>light){light=Math.max(light,0.5*(1-ia/0.08));if(!lightPos)lightPos=HP;}
    }
  }
  K.setSegs(sys._mesh,segs);const bu=sys._mesh.material.uniforms;bu.uC0.value.set(sys.c0).convertSRGBToLinear();bu.uI.value=1;sys._mesh.visible=segs.length>0;
  const put=(mesh,list,c0,c1)=>{const gg=mesh.geometry,P=gg.attributes.iPos.array,Vv=gg.attributes.iVel.array,D=gg.attributes.iData.array,n=Math.min(list.length,gg.attributes.iData.count);
    mesh.material.uniforms.uC0.value.set(c0).convertSRGBToLinear();mesh.material.uniforms.uC1.value.set(c1).convertSRGBToLinear();
    for(let i=0;i<n;i++){const e=list[i];P[3*i]=e[0].x;P[3*i+1]=e[0].y;P[3*i+2]=e[0].z;Vv[3*i]=e[1].x;Vv[3*i+1]=e[1].y;Vv[3*i+2]=e[1].z;D[4*i]=e[2];D[4*i+1]=e[3];D[4*i+2]=e[4];D[4*i+3]=e[5];}
    gg.instanceCount=n;gg.attributes.iPos.needsUpdate=gg.attributes.iVel.needsUpdate=gg.attributes.iData.needsUpdate=true;};
  put(sys._m2,fl,sys.flashColor||'#ffb347','#ff5a1a');sys._m2.material.uniforms.uTall.value=sys.flashLen||2.2;
  put(sys._m3,sm,'#9a948c','#55524e');put(sys._m4,sp,'#fff0c0','#ff7a1a');
  sys._m5.count=casN;sys._m5.instanceMatrix.needsUpdate=true;
  sys._light.intensity=light*sys.flashLight;if(lightPos)sys._light.position.copy(lightPos);
  need=true;
}

/* ---------- Arma (ou qualquer objeto) fragmentada ---------- */
const hidden=new THREE.MeshBasicMaterial({visible:false});
// Malhas com poucas faces grandes (ex.: armas de blocos) quebrariam em placas retas:
// divide cada face em uma grade (sem mudar a forma) até ter faces suficientes para cacos irregulares.
function tessellate(src,target){
  let em={pos:src.pos.slice(),col:src.col.slice(),faces:src.faces.map(f=>f.slice())};
  for(let pass=0;pass<4&&em.faces.length<target;pass++){
    const out={pos:em.pos.slice(),col:em.col.slice(),faces:[]},mid=new Map();
    const mp=(a,b)=>{const k=ekey(a,b);let i=mid.get(k);if(i===undefined){i=out.pos.length/3;for(let c=0;c<3;c++){out.pos.push((em.pos[3*a+c]+em.pos[3*b+c])/2);out.col.push((em.col[3*a+c]+em.col[3*b+c])/2);}mid.set(k,i);}return i;};
    em.faces.forEach(f=>{const n=f.length,ci=out.pos.length/3;for(let c=0;c<3;c++){let p=0,q=0;f.forEach(v=>{p+=em.pos[3*v+c];q+=em.col[3*v+c];});out.pos.push(p/n);out.col.push(q/n);}
      for(let k=0;k<n;k++)out.faces.push([f[k],mp(f[k],f[(k+1)%n]),ci,mp(f[(k+n-1)%n],f[k])]);});
    em=out;
  }
  return em;
}
function buildFracture(sys){
  const o=sys.emitter!=null?S.objs.find(x=>x.id===sys.emitter):null;if(!o)return;sys._obj=o;
  const base=window.modifiedEm?modifiedEm(o):o.em,em=base.faces.length<1500?tessellate(base,1500):base,P=em.pos,F=em.faces,R=K.rng({_rs:sys.seed|0}),bb=new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(P,3)),ctr=bb.getCenter(V3(0,0,0));
  // regiões de Voronoi sobre os centros das faces -> cada região vira um pedaço
  const N=clamp(sys.pieces|0,2,80),seeds=[];for(let i=0;i<N;i++){const f=F[Math.floor(R()*F.length)];seeds.push(V3(P[3*f[0]],P[3*f[0]+1],P[3*f[0]+2]));}
  const groups=seeds.map(()=>[]);F.forEach((f,fi)=>{const c=V3(0,0,0);f.forEach(v=>c.add(V3(P[3*v],P[3*v+1],P[3*v+2])));c.divideScalar(f.length);let b=0,bd=Infinity;seeds.forEach((s,i)=>{const d=s.distanceToSquared(c);if(d<bd){bd=d;b=i;}});groups[b].push(fi);});
  const pos=[],nor=[],col=[],aC=[],aS=[];sys._pieces=[];
  const tri=(a,b,c,n,ca,cb,cc,pc,seed,inner)=>{for(const [p,cl] of [[a,ca],[b,cb],[c,cc]]){pos.push(p.x,p.y,p.z);nor.push(n.x,n.y,n.z);col.push(cl[0],cl[1],cl[2]);aC.push(pc.x,pc.y,pc.z);aS.push(seed,inner);}};
  const th=sys.thick,vp=v=>V3(P[3*v],P[3*v+1],P[3*v+2]),vc=v=>[em.col[3*v],em.col[3*v+1],em.col[3*v+2]];
  groups.forEach(gr=>{if(!gr.length)return;
    const pc=V3(0,0,0);let n=0;gr.forEach(fi=>F[fi].forEach(v=>{pc.add(vp(v));n++;}));pc.divideScalar(n);const seed=R();
    // normal média por vértice dentro do pedaço (para a casca interna) e arestas de borda
    const vn=new Map(),ec=new Map();
    gr.forEach(fi=>{const f=F[fi],fn=V3(...faceNormal(em,f));f.forEach((v,k)=>{(vn.get(v)||vn.set(v,V3(0,0,0)).get(v)).add(fn);const key=ekey(v,f[(k+1)%f.length]);ec.set(key,(ec.get(key)||0)+1);});});
    const inn=v=>vp(v).addScaledVector(vn.get(v).clone().normalize(),-th),dim=[0.05,0.05,0.05];
    gr.forEach(fi=>{const f=F[fi],fn=V3(...faceNormal(em,f)),fi2=fn.clone().negate();
      for(let k=1;k<f.length-1;k++){tri(vp(f[0]),vp(f[k]),vp(f[k+1]),fn,vc(f[0]),vc(f[k]),vc(f[k+1]),pc,seed,0);tri(inn(f[0]),inn(f[k+1]),inn(f[k]),fi2,dim,dim,dim,pc,seed,1);}
      for(let k=0;k<f.length;k++){const a=f[k],b=f[(k+1)%f.length];if(ec.get(ekey(a,b))!==1)continue;const A=vp(a),B=vp(b),Ai=inn(a),Bi=inn(b),rn=B.clone().sub(A).cross(fn).normalize();
        tri(B,A,Ai,rn,dim,dim,dim,pc,seed,1);tri(B,Ai,Bi,rn,dim,dim,dim,pc,seed,1);}});
    sys._pieces.push({c:pc,seed});});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.setAttribute('aC',new THREE.Float32BufferAttribute(aC,3));g.setAttribute('aS',new THREE.Float32BufferAttribute(aS,2));
  const m=new THREE.MeshStandardMaterial({vertexColors:true,color:0xffffff,metalness:o.mat.metalness,roughness:o.mat.roughness});
  sys._u={frSpread:{value:0},frT:K.TIME,frCtr:{value:ctr},frC:{value:new THREE.Color()},frInner:{value:1},frVein:{value:1},frVeinS:{value:3},frDark:{value:0.5}};
  m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,sys._u);
    sh.vertexShader='attribute vec3 aC;attribute vec2 aS;uniform float frSpread,frT;uniform vec3 frCtr;varying float frIn;varying vec3 frP;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      {vec3 frD=aC-frCtr;float frL=length(frD);frD=frL>1e-5?frD/frL:vec3(0.,1.,0.);float frK=frSpread*(0.55+0.9*aS.x);
      vec3 frAx=normalize(vec3(sin(aS.x*40.),cos(aS.x*70.),sin(aS.x*110.)+0.2));float frA=frK*1.4*(aS.x-0.5)+sin(frT*0.8+aS.x*20.)*0.06*min(1.,frSpread*6.);
      vec3 frR=transformed-aC;frR=frR*cos(frA)+cross(frAx,frR)*sin(frA)+frAx*dot(frAx,frR)*(1.-cos(frA));
      transformed=aC+frR+frD*frK+vec3(0.,sin(frT*1.3+aS.x*30.)*0.012*min(1.,frSpread*8.),0.);frIn=aS.y;frP=position;}`);
    sh.fragmentShader='uniform vec3 frC;uniform float frInner,frVein,frVeinS,frDark,frT;varying float frIn;varying vec3 frP;\n'+K.VEIN_GLSL+'\n'+sh.fragmentShader
      .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=mix(1.,0.25,frDark);')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      {vec3 frQ=frP*frVeinS;vec3 frW=frQ+0.4*vec3(vnz(frQ*1.7+frT*0.15),vnz(frQ*1.7+5.),vnz(frQ*1.7+9.-frT*0.1));
      float frA1=1.-abs(vnz(frW)*2.-1.),frB1=1.-abs(vnz(frW*2.1+3.7)*2.-1.);
      float frLn=pow(frA1,14.)+pow(frB1,18.)*0.7,frPl=0.65+0.35*sin(frT*3.5+vnz(frQ*0.8)*12.);
      totalEmissiveRadiance+=(1.-frIn)*(frC*(frLn*3.2+pow(frA1,4.)*0.2)*frPl+vec3(1.)*pow(frA1,42.)*1.6)*frVein;
      // faces internas e de borda: brilho da energia que vaza pelas rachaduras
      totalEmissiveRadiance+=frIn*frC*frInner*(0.8+0.35*sin(frT*4.+frP.x*9.+frP.y*7.))+frIn*vec3(1.)*frInner*0.06;}`);};
  m.customProgramCacheKey=()=>'fracture';
  sys._mesh=new THREE.Mesh(g,m);sys._mesh.castShadow=true;sys._mesh.frustumCulled=false;sys._mesh.raycast=()=>{};o.mesh.add(sys._mesh);sys._ctr=ctr;sys._topo=base.faces.length+':'+base.pos.length;
}
function restoreOriginal(o){if(!o)return;if(o.modMesh)o.modMesh.visible=true;if(o.mesh.material===hidden)o.mesh.material=o.modMesh?o.mesh.material:o.mat;if(window.updateMods)updateMods(o);else o.mesh.material=o.mat;}
K.DESTROY.fracture=sys=>{const o=sys._obj;if(sys._mesh&&o){o.mesh.remove(sys._mesh);sys._mesh.geometry.dispose();sys._mesh.material.dispose();sys._mesh=null;}if(o){o.mesh.material=o.mat;restoreOriginal(o);}sys._obj=null;};
function spreadOf(sys,frame){const L=K.level(sys,frame);return {L,spread:sys.gap+(sys.spread-sys.gap)*L.act};}
function evalFracture(sys,frame){
  const o=sys._obj;if(!o||!sys._mesh)return;
  // a malha mudou (edição/escultura/modificador)? refaz os pedaços
  const em=window.modifiedEm?modifiedEm(o):o.em,topo=em.faces.length+':'+em.pos.length;if(topo!==sys._topo){o.mesh.remove(sys._mesh);sys._mesh.geometry.dispose();buildFracture(sys);}
  // esconde a malha original enquanto o efeito existe (continua selecionável: o raycast usa a geometria)
  if(o.mesh.material!==hidden)o.mesh.material=hidden;if(o.modMesh)o.modMesh.visible=false;
  const {L,spread}=spreadOf(sys,frame),u=sys._u;u.frSpread.value=spread;u.frC.value.set(sys.c0).convertSRGBToLinear();u.frInner.value=sys.inner*(0.35+0.65*L.lvl);u.frVein.value=sys.veins*L.lvl;u.frVeinS.value=sys.veinScale;u.frDark.value=sys.dark*Math.min(1,L.lvl*1.5);
  need=true;
}
// Raios internos: do núcleo até a face de dentro dos pedaços, e entre pedaços vizinhos.
function evalInArcs(sys,frame){
  const fr=FX.systems.find(x=>x.group===sys.group&&x.kind==='fracture'),segs=[];
  if(fr&&fr._obj&&fr._pieces){
    const o=fr._obj,{L,spread}=spreadOf(fr,frame),R=K.rng({_rs:(sys.seed+Math.floor(frame/2)*104729)|0}),M=o.mesh.matrixWorld,C=fr._ctr.clone().applyMatrix4(M),sc=(o.mesh.scale.x+o.mesh.scale.y+o.mesh.scale.z)/3;
    const wp=pc=>{const d=pc.c.clone().sub(fr._ctr);const l=d.length()||1;return pc.c.clone().addScaledVector(d.divideScalar(l),spread*(0.55+0.9*pc.seed)-fr.thick*0.5).applyMatrix4(M);};
    const n=Math.round(sys.count*(0.25+0.75*L.lvl)),P=fr._pieces;
    for(let k=0;k<n;k++){const a=P[Math.floor(R()*P.length)],A=wp(a),toCore=R()<0.6,B=toCore?C:wp(P[Math.floor(R()*P.length)]),len=A.distanceTo(B);if(len<1e-3)continue;
      const pts=K.jagPath(R,A,B,len*sys.jag*0.4,3,1),I=0.45+0.55*R();for(let i=0;i<pts.length-1;i++)segs.push([pts[i],pts[i+1],sys.width*sc*(toCore?1:0.6),I]);}
  }
  K.setSegs(sys._mesh,segs);const u=sys._mesh.material.uniforms;u.uC0.value.set(sys.c0).convertSRGBToLinear();u.uI.value=0.9;sys._mesh.visible=segs.length>0;need=true;
}

/* ---------- bake para exportar em FBX ---------- */
// Fragmentos: um nó por pedaço (filho do objeto), com a mesma abertura/rotação do shader amostrada por quadro.
K.BAKE.fracture=(sys,nF)=>{
  const o=sys._obj;if(!o||!sys._mesh)return [];const g=sys._mesh.geometry,P=g.attributes.position.array,C=g.attributes.color.array,AC=g.attributes.aC.array,AS=g.attributes.aS.array,by=new Map(),glow=hexRgb(sys.c0).map(s2l);
  for(let t=0;t<P.length/9;t++){const i=t*3,key=AC[3*i].toFixed(5)+','+AC[3*i+1].toFixed(5)+','+AC[3*i+2].toFixed(5);let e=by.get(key);if(!e){e={c:[AC[3*i],AC[3*i+1],AC[3*i+2]],seed:AS[2*i],pos:[],col:[],polys:[]};by.set(key,e);}
    const b=e.pos.length/3;for(let k=0;k<3;k++){const j=i+k;e.pos.push(P[3*j]-e.c[0],P[3*j+1]-e.c[1],P[3*j+2]-e.c[2]);const inner=AS[2*j+1]>0.5;e.col.push(...(inner?glow:[C[3*j],C[3*j+1],C[3*j+2]]));}e.polys.push([b,b+1,b+2]);}
  const q=new THREE.Quaternion(),ctr=sys._ctr,out=[];let n=0;
  by.forEach(e=>{const sd=e.seed,d=V3(e.c[0]-ctr.x,e.c[1]-ctr.y,e.c[2]-ctr.z),l=d.length();if(l>1e-5)d.divideScalar(l);else d.set(0,1,0);
    const ax=V3(Math.sin(sd*40),Math.cos(sd*70),Math.sin(sd*110)+0.2).normalize(),frames=[];
    for(let f=0;f<=nF;f++){const t=f/S.fps,sp=spreadOf(sys,f).spread,k=sp*(0.55+0.9*sd),ang=k*1.4*(sd-0.5)+Math.sin(t*0.8+sd*20)*0.06*Math.min(1,sp*6);q.setFromAxisAngle(ax,ang);
      frames.push({p:[e.c[0]+d.x*k,e.c[1]+d.y*k+Math.sin(t*1.3+sd*30)*0.012*Math.min(1,sp*8),e.c[2]+d.z*k],q:q.toArray(),s:[1,1,1]});}
    out.push({name:o.name.replace(/\W+/g,'_')+'_pedaco_'+(++n),parent:o.id,replaces:o.id,geo:{pos:e.pos,polys:e.polys,col:e.col},mat:{color:'#'+o.mat.color.getHexString(),emissive:sys.c0,emissiveI:0.4},frames});});
  return out;
};
// Disparo: uma bala (traçante) e uma cápsula por tiro dentro da timeline.
K.BAKE.gunfire=(sys,nF)=>{
  const out=[],fps=S.fps,g=9.8,iv=Math.max(1,fps*60/Math.max(30,sys.rpm)),shots=[],seen=new Set();
  for(let f=0;f<=nF;f++)for(const [k,fk] of shotsAlive(sys,f,iv+0.5)){if(!seen.has(k)&&shots.length<60){seen.add(k);shots.push([k,fk]);}}
  const cyl=(r,len,n)=>{const pos=[],polys=[];for(const x of [0,len])for(let j=0;j<n;j++){const a=j/n*6.283;pos.push(x,Math.cos(a)*r,Math.sin(a)*r);}for(let j=0;j<n;j++)polys.push([j,(j+1)%n,n+(j+1)%n,n+j]);polys.push([...Array(n).keys()].reverse(),[...Array(n).keys()].map(j=>n+j));return {pos,polys};};
  const bq=new THREE.Quaternion(),X=V3(1,0,0);
  shots.forEach(([k,fk])=>{
    const R=K.rng({_rs:(sys.seed+k*9973)|0}),Rc=K.rng({_rs:(sys.seed+k*9973+3*7717)|0}),G=gunFrame(sys,fk),D=G.D.clone().addScaledVector(G.U,(R()-0.5)*sys.spreadAim).addScaledVector(G.R,(R()-0.5)*sys.spreadAim).normalize(),H=hitScan(sys,G,G.O,D);
    bq.setFromUnitVectors(X,D);const bf=[],cf=[];
    // mesmo gerador (Rc) e mesma ordem do evalGun: a cápsula exportada cai no mesmo lugar da tela
    const v=G.R.clone().multiplyScalar(1.6+Rc()*0.8).addScaledVector(G.U,1.3+Rc()*0.6).addScaledVector(G.D,-0.3-Rc()*0.5),ax=V3(Rc()-0.5,Rc(),Rc()-0.5).normalize(),sp0=18+Rc()*14,cq=new THREE.Quaternion();
    for(let f=0;f<=nF;f++){const age=(f-fk)/fps,dist=sys.speed*age,on=age>=0&&dist<H.d;
      bf.push({p:G.O.clone().addScaledVector(D,Math.max(0,Math.min(dist,H.d)-sys.tracerLen*0.5)).toArray(),q:bq.toArray(),s:on?[1,1,1]:[0,0,0]});
      if(age<0){cf.push({p:G.E.toArray(),q:[0,0,0,1],s:[0,0,0]});continue;}
      const y=G.E.y,vy=v.y,tl=(vy+Math.sqrt(vy*vy+2*g*Math.max(0,y)))/g,p=G.E.clone();let landed=false;
      if(age<tl){p.addScaledVector(v,age);p.y=y+vy*age-0.5*g*age*age;}else{const t2=age-tl,vb=(g*tl-vy)*0.32,tb=2*vb/g;p.addScaledVector(v,tl);p.x+=v.x*0.4*Math.min(t2,tb+0.25);p.z+=v.z*0.4*Math.min(t2,tb+0.25);if(t2<tb)p.y=0.008+vb*t2-0.5*g*t2*t2;else{p.y=0.008;landed=true;}}
      cq.setFromAxisAngle(landed?V3(0,1,0):ax,landed?sp0:age*sp0);cf.push({p:p.toArray(),q:cq.toArray(),s:[1,1,1]});}
    out.push({name:'Bala_'+(k+1),parent:null,geo:cyl(sys.tracerWidth*0.35,sys.tracerLen*0.5,6),mat:{color:sys.c0,emissive:sys.c0,emissiveI:1},frames:bf});
    if(sys.casings)out.push({name:'Capsula_'+(k+1),parent:null,geo:cyl(0.006,0.03,7),mat:{color:'#b08d3c',emissive:'#000000',emissiveI:0},frames:cf});
  });
  return out;
};

/* ---------- registro ---------- */
Object.assign(K.BUILD,{gunfire:buildGun,fracture:buildFracture,inarcs:sys=>{sys._mesh=K.boltMesh();}});
Object.assign(K.EVAL,{gunfire:evalGun,fracture:evalFracture,inarcs:evalInArcs});
K.LOOP.add('gunfire');
K.PRESETS.gunfire={name:'Disparo de arma',hidden:true,layers:[{name:'Disparo',kind:'gunfire',mode:'auto',rpm:600,burstCount:3,gap:20,shots:0,speed:90,range:60,spreadAim:0.012,dir:[1,0,0],
  c0:'#ffb347',tracerEvery:1,tracerLen:4,tracerWidth:0.05,flashSize:0.34,flashLen:2.2,flashColor:'#ffb347',flashLight:14,smoke:1,casings:true,impactSparks:16}]};
K.PRESETS.fracture={name:'Arma fragmentada',hidden:true,layers:[
  {name:'Fragmentos da peça',kind:'fracture',c0:'#a855ff',pieces:26,spread:0.2,gap:0.01,thick:0.022,inner:1.5,veins:1.2,veinScale:5,dark:0.5,idle:0.35,actStart:8,actLen:40},
  {name:'Núcleo interno',kind:'core',c0:'#c58bff',size:0.3,inside:true,idle:0.4,actStart:8,actLen:40,light:{color:'#a060ff',intensity:5,dist:6}},
  {name:'Raios internos',kind:'inarcs',c0:'#d9b8ff',count:12,width:0.014,jag:0.55},
  {name:'Faíscas de energia',kind:'star',rate:30,life:1.3,speed:0.3,dir:[0,1,0],spread:1,gravity:-0.1,drag:0.6,size:0.045,sizeEnd:0,c0:'#e6d0ff',c1:'#7a3dff',a0:1,a1:0,turb:1,add:true,shape:'surface'},
  {name:'Onda de ativação',kind:'star',rate:0,burst:200,life:0.9,speed:2.6,dir:[0,1,0],spread:1,gravity:0,drag:2.6,size:0.07,sizeEnd:0,c0:'#ffffff',c1:'#a855ff',a0:1,a1:0,turb:0.3,add:true,shape:'surface',startFrame:38}]};

/* ---------- painéis ---------- */
const colorRow=(P,s,grp)=>P.append(row(lb('Cor da energia'),colorIn(s.c0,v=>{grp.forEach(x=>{if(x.kind==='star')x.c1=v;else x.c0=v;if(x.light)x.light.color=v;});}),
  ...[['#a855ff','Roxo'],['#3da9ff','Azul'],['#ff4d3d','Vermelho'],['#3dff8a','Verde'],['#ffc13d','Dourado']].map(([c,t])=>chip(t,()=>{grp.forEach(x=>{if(x.kind==='star')x.c1=c;else x.c0=c;if(x.light)x.light.color=c;});renderPanel();}))));
K.PANEL.gunfire=(P,s,sl)=>{
  P.append(row(lb('Modo'),...[['auto','Automático'],['burst','Rajada'],['single','Tiro a tiro']].map(([k,t])=>chip(t,()=>{s.mode=k;renderPanel();},s.mode===k,'cy')),
    chip('Cápsulas',()=>{s.casings=!s.casings;renderPanel();},s.casings,'cy'),lb('Traçante'),colorIn(s.c0,v=>s.c0=v),...[['#ffb347','Laranja'],['#ff3b30','Vermelho'],['#39ff14','Verde'],['#7fd0ff','Azul']].map(([c,t])=>chip(t,()=>{s.c0=c;renderPanel();}))));
  P.append(sl('Cadência (tiros/min)','rpm',30,1500,10),s.mode==='burst'?sl('Tiros por rajada','burstCount',2,10,1):'',s.mode!=='auto'?sl('Pausa (quadros)','gap',2,120,1):'',sl('Total de tiros (0 = sem fim)','shots',0,200,1),sl('Começa no quadro','startFrame',0,S.endFrame,1),
    sl('Velocidade da bala (m/s)','speed',10,400,1),sl('Alcance','range',5,300,1),sl('Dispersão','spreadAim',0,0.15,0.001),
    sl('Traçante: comprimento','tracerLen',0.3,20,0.1),sl('Traçante: espessura','tracerWidth',0.005,0.3,0.001),sl('Traçante a cada N tiros','tracerEvery',1,6,1),
    sl('Clarão: tamanho','flashSize',0.05,2,0.01),sl('Clarão: comprimento','flashLen',0.8,5,0.05),sl('Clarão: luz','flashLight',0,80,0.5),sl('Fumaça','smoke',0,2,0.01),sl('Faíscas no impacto','impactSparks',0,60,1),
    ...['X','Y','Z'].map((a,i)=>slider('Direção '+a,-1,1,0.01,s.dir[i],v=>{s.dir[i]=v;},v=>v.toFixed(2))));
  P.append(h('div',{class:'note'},'O tiro sai da boca do cano da arma emissora (use Posição X/Y/Z para ajustar em modelos importados) e acerta o primeiro objeto ou o chão. Mexa a arma com keyframes: cada bala sai de onde a arma estava no quadro do disparo.'));
};
K.PANEL.fracture=(P,s,sl,grp)=>{
  colorRow(P,s,grp);const all=(k,v)=>grp.forEach(x=>{if(x[k]!==undefined)x[k]=v;});
  P.append(slider('Ativação: começa no quadro',0,S.endFrame,1,s.actStart||0,v=>{all('actStart',v);grp.forEach(x=>{if(x.burst)x.startFrame=v+Math.round((s.actLen||0)*0.75);});}),slider('Ativação: duração (quadros)',0,160,1,s.actLen||0,v=>all('actLen',v)),
    sl('Abertura dos pedaços','spread',0,1.5,0.005),sl('Fresta em repouso','gap',0,0.2,0.001),sl('Brilho em repouso','idle',0,1,0.01),
    slider('Quantidade de pedaços',2,80,1,s.pieces,v=>{s.pieces=v;clearTimeout(s._rt);s._rt=setTimeout(()=>{K.destroy(s);K.build(s);},200);}),
    slider('Espessura dos pedaços',0.005,0.2,0.001,s.thick,v=>{s.thick=v;clearTimeout(s._rt);s._rt=setTimeout(()=>{K.destroy(s);K.build(s);},200);}),
    sl('Brilho interno','inner',0,8,0.05),sl('Veias na superfície','veins',0,5,0.05),sl('Tamanho das veias','veinScale',0.5,14,0.05),sl('Escurecer a peça','dark',0,1,0.01));
  P.append(row(chip('Novo padrão de quebra',()=>{s.seed=Math.floor(Math.random()*1e6);K.destroy(s);K.build(s);})));
  P.append(h('div',{class:'note'},'Toque ▶ na aba Animar: a peça racha, os pedaços se afastam e o núcleo aparece por dentro. A malha original fica guardada — apagar o efeito traz ela de volta inteira.'));
};
K.PANEL.inarcs=(P,s,sl,grp)=>{colorRow(P,s,grp);P.append(sl('Quantidade','count',0,40,1),sl('Espessura','width',0.003,0.1,0.001),sl('Zigue-zague','jag',0,1.5,0.01));};
// Linha "Armas" no topo da aba Efeitos.
K.TOP=(P,add)=>{
  P.append(row(lb('Armas'),...Object.keys(WEAPONS).map(k=>chip(WEAPONS[k].name,()=>{createWeapon(k);renderPanel();toast(WEAPONS[k].name+' criado. Agora toque em Disparo.');})),
    chip('Disparo',()=>{if(!S.sel)return toast('Selecione a arma (ou crie uma ao lado)');add('gunfire');},false,'act'),
    chip('Arma fragmentada',()=>{if(!S.sel)return toast('Selecione a arma (ou qualquer objeto)');add('fracture');},false,'act')));
};
})();
