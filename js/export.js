'use strict';
/* =====================================================================
   MiniBlender · Exportação de efeitos
   - FBX (ASCII 7.4): malhas, cores por vértice, UVs, materiais (cor e
     emissão) e ANIMAÇÃO por nó. As camadas de efeito que são malha
     (pedaços da arma fragmentada, cristais, balas, cápsulas) viram nós
     animados quadro a quadro. Abre em Blender, Unity, Unreal, Godot, Maya.
   - Flipbook (folha de sprites PNG com transparência): para o que é
     shader/partícula e não cabe num FBX — clarão, fumaça, faíscas, raios,
     núcleo de energia, fogo. É o formato que os motores de jogo usam.
   ===================================================================== */
(function(){
const K=window.FXK;
const lin2s=v=>v<=0.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-0.055;
const fmt=v=>{const r=Math.round(v*1e5)/1e5;return Object.is(r,-0)?'0':String(r);};
const safe=n=>String(n).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w\-]+/g,'_');

/* ---------- monta a lista de nós a exportar ---------- */
function collectNodes(opts){
  const nF=Math.round(S.endFrame),nodes=[],replaced=new Set(),baked=[];
  // camadas de efeito com malha
  if(opts.effects!==false&&window.FX)for(const sys of FX.systems){const fn=K.BAKE[sys.kind];if(!fn)continue;try{for(const n of fn(sys,nF)){baked.push(n);if(n.replaces!=null)replaced.add(n.replaces);}}catch(e){console.warn('bake',sys.kind,e);}}
  const byObj=new Map();
  for(const o of S.objs){
    const hasKeys=Object.keys(o.keys||{}).length>1,frames=[];
    if(hasKeys)for(let f=0;f<=nF;f++){const k=evalKeys(o,f);frames.push({p:k.p,q:k.q,s:k.s});}
    const m=o.mesh,node={name:safe(o.name),parent:null,rest:{p:m.position.toArray(),q:m.quaternion.toArray(),s:m.scale.toArray()},frames:hasKeys?frames:null,mat:{color:o.params.color,emissive:o.params.emis,emissiveI:o.params.emis==='#000000'?0:o.params.emisI,texture:null},geo:null};
    if(!replaced.has(o.id)){// objeto fragmentado exporta só os pedaços (o nó vira um vazio que os carrega)
      const useMod=o.modMesh&&window.modifiedEm,em=useMod?modifiedEm(o):o.em;
      // posições atuais (pose do rig incluída) quando não há modificadores
      let pos=em.pos;if(!useMod){const g=m.geometry,pa=g.attributes.position,rm=renderMap(g);pos=em.pos.slice();for(let i=0;i<pos.length/3;i++){const k=rm.start[i];if(k<rm.start[i+1]){const c=rm.list[k];pos[3*i]=pa.getX(c);pos[3*i+1]=pa.getY(c);pos[3*i+2]=pa.getZ(c);}}}
      const uvf=!useMod&&o.uvTopology===em.faces.map(f=>f.join(',')).join(';')?faceCornerUVs(em.faces,o.uvCorners):null;
      node.geo={pos,polys:em.faces,col:em.col,uvf,smooth:!o.flat};
      if(uvf&&o.textureData&&o.textureData.base){node.mat.texture=safe(o.name)+'_base.png';node.texData=o.textureData.base;}
    }
    nodes.push(node);byObj.set(o.id,node);
  }
  for(const b of baked){const par=b.parent!=null?byObj.get(b.parent):null;
    nodes.push({name:safe(b.name),parent:par||null,rest:b.frames[0],frames:b.frames,mat:{color:b.mat.color,emissive:b.mat.emissive,emissiveI:b.mat.emissiveI,texture:null},geo:{pos:b.geo.pos,polys:b.geo.polys,col:b.geo.col||null,uvf:null,smooth:false}});}
  return {nodes,nF};
}

/* ---------- escritor FBX ASCII ---------- */
function buildFBX(opts){
  const {nodes,nF}=collectNodes(opts||{}),fps=S.fps;let uid=1000000;const id=()=>++uid;
  const O=[],C=[],counts={Model:0,Geometry:0,Material:0,Texture:0,Video:0,AnimationStack:0,AnimationLayer:0,AnimationCurveNode:0,AnimationCurve:0};
  const arr=(name,a,ind)=>`${ind}${name}: *${a.length} {\n${ind}\ta: ${a.join(',')}\n${ind}}\n`;
  const KT=46186158000,e3=new THREE.Euler(),q4=new THREE.Quaternion();
  // FBX usa Euler XYZ extrínseco (R = Rz·Ry·Rx) = ordem 'ZYX' do three.js
  const eul=q=>{e3.setFromQuaternion(q4.fromArray(q),'ZYX');return [e3.x*180/Math.PI,e3.y*180/Math.PI,e3.z*180/Math.PI];};
  const stackId=id(),layerId=id();let anyAnim=false;
  for(const n of nodes){
    n.id=id();counts.Model++;const r=n.rest,er=eul(r.q);
    O.push(`\tModel: ${n.id}, "Model::${n.name}", "${n.geo?'Mesh':'Null'}" {\n\t\tVersion: 232\n\t\tProperties70:  {\n\t\t\tP: "RotationOrder", "enum", "", "",0\n\t\t\tP: "InheritType", "enum", "", "",1\n\t\t\tP: "DefaultAttributeIndex", "int", "Integer", "",0\n`+
      `\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",${r.p.map(fmt).join(',')}\n\t\t\tP: "Lcl Rotation", "Lcl Rotation", "", "A",${er.map(fmt).join(',')}\n\t\t\tP: "Lcl Scaling", "Lcl Scaling", "", "A",${r.s.map(fmt).join(',')}\n\t\t}\n\t\tShading: T\n\t\tCulling: "CullingOff"\n\t}\n`);
    C.push(`\tC: "OO",${n.id},${n.parent?n.parent.id:0}\n`);
  }
  for(const n of nodes){
    if(n.geo){
      const G=n.geo,gid=id(),V=G.pos,pvi=[],nrm=[],cols=[],uvs=[];counts.Geometry++;
      // normais: suaves (média por vértice) ou planas (por face)
      const nV=V.length/3,vn=new Float32Array(V.length),fnl=[];
      for(const f of G.polys){let nx=0,ny=0,nz=0;for(let k=0;k<f.length;k++){const a=f[k],b=f[(k+1)%f.length];nx+=(V[3*a+1]-V[3*b+1])*(V[3*a+2]+V[3*b+2]);ny+=(V[3*a+2]-V[3*b+2])*(V[3*a]+V[3*b]);nz+=(V[3*a]-V[3*b])*(V[3*a+1]+V[3*b+1]);}
        const l=Math.hypot(nx,ny,nz)||1;fnl.push([nx/l,ny/l,nz/l]);if(G.smooth)for(const v of f){vn[3*v]+=nx;vn[3*v+1]+=ny;vn[3*v+2]+=nz;}}
      if(G.smooth)for(let i=0;i<nV;i++){const l=Math.hypot(vn[3*i],vn[3*i+1],vn[3*i+2])||1;vn[3*i]/=l;vn[3*i+1]/=l;vn[3*i+2]/=l;}
      G.polys.forEach((f,fi)=>{f.forEach((v,k)=>{pvi.push(k===f.length-1?-v-1:v);
          if(G.smooth)nrm.push(fmt(vn[3*v]),fmt(vn[3*v+1]),fmt(vn[3*v+2]));else nrm.push(...fnl[fi].map(fmt));
          if(G.col)cols.push(fmt(lin2s(G.col[3*v])),fmt(lin2s(G.col[3*v+1])),fmt(lin2s(G.col[3*v+2])),1);
          if(G.uvf)uvs.push(fmt(G.uvf[fi][k][0]),fmt(1-G.uvf[fi][k][1]));});});
      let s=`\tGeometry: ${gid}, "Geometry::${n.name}", "Mesh" {\n`+arr('Vertices',Array.from(V,fmt),'\t\t')+arr('PolygonVertexIndex',pvi,'\t\t')+'\t\tGeometryVersion: 124\n';
      s+=`\t\tLayerElementNormal: 0 {\n\t\t\tVersion: 101\n\t\t\tName: ""\n\t\t\tMappingInformationType: "ByPolygonVertex"\n\t\t\tReferenceInformationType: "Direct"\n`+arr('Normals',nrm,'\t\t\t')+'\t\t}\n';
      if(G.col)s+=`\t\tLayerElementColor: 0 {\n\t\t\tVersion: 101\n\t\t\tName: "Col"\n\t\t\tMappingInformationType: "ByPolygonVertex"\n\t\t\tReferenceInformationType: "Direct"\n`+arr('Colors',cols,'\t\t\t')+'\t\t}\n';
      if(G.uvf)s+=`\t\tLayerElementUV: 0 {\n\t\t\tVersion: 101\n\t\t\tName: "UVMap"\n\t\t\tMappingInformationType: "ByPolygonVertex"\n\t\t\tReferenceInformationType: "Direct"\n`+arr('UV',uvs,'\t\t\t')+'\t\t}\n';
      s+=`\t\tLayerElementMaterial: 0 {\n\t\t\tVersion: 101\n\t\t\tName: ""\n\t\t\tMappingInformationType: "AllSame"\n\t\t\tReferenceInformationType: "IndexToDirect"\n\t\t\tMaterials: *1 {\n\t\t\t\ta: 0\n\t\t\t}\n\t\t}\n`;
      s+=`\t\tLayer: 0 {\n\t\t\tVersion: 100\n\t\t\tLayerElement:  {\n\t\t\t\tType: "LayerElementNormal"\n\t\t\t\tTypedIndex: 0\n\t\t\t}\n\t\t\tLayerElement:  {\n\t\t\t\tType: "LayerElementMaterial"\n\t\t\t\tTypedIndex: 0\n\t\t\t}\n`+
        (G.col?`\t\t\tLayerElement:  {\n\t\t\t\tType: "LayerElementColor"\n\t\t\t\tTypedIndex: 0\n\t\t\t}\n`:'')+(G.uvf?`\t\t\tLayerElement:  {\n\t\t\t\tType: "LayerElementUV"\n\t\t\t\tTypedIndex: 0\n\t\t\t}\n`:'')+'\t\t}\n\t}\n';
      O.push(s);C.push(`\tC: "OO",${gid},${n.id}\n`);
      const mid=id(),dc=hexRgb(n.mat.color),ec=hexRgb(n.mat.emissive||'#000000');counts.Material++;
      O.push(`\tMaterial: ${mid}, "Material::${n.name}_mat", "" {\n\t\tVersion: 102\n\t\tShadingModel: "phong"\n\t\tMultiLayer: 0\n\t\tProperties70:  {\n\t\t\tP: "DiffuseColor", "Color", "", "A",${dc.map(fmt).join(',')}\n\t\t\tP: "DiffuseFactor", "Number", "", "A",1\n`+
        `\t\t\tP: "EmissiveColor", "Color", "", "A",${ec.map(fmt).join(',')}\n\t\t\tP: "EmissiveFactor", "Number", "", "A",${fmt(n.mat.emissiveI||0)}\n\t\t\tP: "SpecularColor", "Color", "", "A",0.2,0.2,0.2\n\t\t\tP: "Shininess", "Number", "", "A",25\n\t\t}\n\t}\n`);
      C.push(`\tC: "OO",${mid},${n.id}\n`);
      if(n.mat.texture){const tid=id(),vid=id();counts.Texture++;counts.Video++;
        O.push(`\tVideo: ${vid}, "Video::${n.name}_tex", "Clip" {\n\t\tType: "Clip"\n\t\tProperties70:  {\n\t\t\tP: "Path", "KString", "XRefUrl", "", "${n.mat.texture}"\n\t\t}\n\t\tUseMipMap: 0\n\t\tFilename: "${n.mat.texture}"\n\t\tRelativeFilename: "${n.mat.texture}"\n\t}\n`+
          `\tTexture: ${tid}, "Texture::${n.name}_tex", "" {\n\t\tType: "TextureVideoClip"\n\t\tVersion: 202\n\t\tTextureName: "Texture::${n.name}_tex"\n\t\tMedia: "Video::${n.name}_tex"\n\t\tFileName: "${n.mat.texture}"\n\t\tRelativeFilename: "${n.mat.texture}"\n\t\tModelUVTranslation: 0,0\n\t\tModelUVScaling: 1,1\n\t\tTexture_Alpha_Source: "None"\n\t\tCropping: 0,0,0,0\n\t}\n`);
        C.push(`\tC: "OP",${tid},${mid}, "DiffuseColor"\n\tC: "OO",${vid},${tid}\n`);}
    }
    // animação: só para canais que realmente mudam
    if(n.frames&&n.frames.length>1){
      const T=n.frames.map(f=>f.p),Sc=n.frames.map(f=>f.s),R=[];let prev=null;
      for(const f of n.frames){const e=eul(f.q);if(prev)for(let c=0;c<3;c++){while(e[c]-prev[c]>180)e[c]-=360;while(e[c]-prev[c]<-180)e[c]+=360;}R.push(e);prev=e;}
      const times=n.frames.map((_,i)=>Math.round(i/fps*KT));
      const chan=(kind,vals,prop)=>{if(!vals.some(v=>v.some((x,c)=>Math.abs(x-vals[0][c])>1e-6)))return;anyAnim=true;const cn=id();counts.AnimationCurveNode++;
        O.push(`\tAnimationCurveNode: ${cn}, "AnimCurveNode::${kind}", "" {\n\t\tProperties70:  {\n\t\t\tP: "d|X", "Number", "", "A",${fmt(vals[0][0])}\n\t\t\tP: "d|Y", "Number", "", "A",${fmt(vals[0][1])}\n\t\t\tP: "d|Z", "Number", "", "A",${fmt(vals[0][2])}\n\t\t}\n\t}\n`);
        C.push(`\tC: "OO",${cn},${layerId}\n\tC: "OP",${cn},${n.id}, "${prop}"\n`);
        ['X','Y','Z'].forEach((ax,c)=>{const cid=id();counts.AnimationCurve++;
          O.push(`\tAnimationCurve: ${cid}, "AnimCurve::", "" {\n\t\tDefault: ${fmt(vals[0][c])}\n\t\tKeyVer: 4008\n`+arr('KeyTime',times,'\t\t')+arr('KeyValueFloat',vals.map(v=>fmt(v[c])),'\t\t')+
            `\t\tKeyAttrFlags: *1 {\n\t\t\ta: 24836\n\t\t}\n\t\tKeyAttrDataFloat: *4 {\n\t\t\ta: 0,0,255790911,0\n\t\t}\n\t\tKeyAttrRefCount: *1 {\n\t\t\ta: ${times.length}\n\t\t}\n\t}\n`);
          C.push(`\tC: "OP",${cid},${cn}, "d|${ax}"\n`);});};
      chan('T',T,'Lcl Translation');chan('R',R,'Lcl Rotation');chan('S',Sc,'Lcl Scaling');
    }
  }
  if(anyAnim){counts.AnimationStack=1;counts.AnimationLayer=1;const end=Math.round(nF/fps*KT);
    O.push(`\tAnimationStack: ${stackId}, "AnimStack::MiniBlender", "" {\n\t\tProperties70:  {\n\t\t\tP: "LocalStop", "KTime", "Time", "",${end}\n\t\t\tP: "ReferenceStop", "KTime", "Time", "",${end}\n\t\t}\n\t}\n\tAnimationLayer: ${layerId}, "AnimLayer::BaseLayer", "" {\n\t}\n`);
    C.push(`\tC: "OO",${layerId},${stackId}\n`);}
  const d=new Date(),defs=Object.entries(counts).filter(([,c])=>c>0).map(([t,c])=>`\tObjectType: "${t}" {\n\t\tCount: ${c}\n\t}\n`).join('');
  const text=`; FBX 7.4.0 project file\n; Exportado pelo MiniBlender Mobile\n; ----------------------------------------------------\n\nFBXHeaderExtension:  {\n\tFBXHeaderVersion: 1003\n\tFBXVersion: 7400\n\tCreationTimeStamp:  {\n\t\tVersion: 1000\n\t\tYear: ${d.getFullYear()}\n\t\tMonth: ${d.getMonth()+1}\n\t\tDay: ${d.getDate()}\n\t\tHour: ${d.getHours()}\n\t\tMinute: ${d.getMinutes()}\n\t\tSecond: ${d.getSeconds()}\n\t\tMillisecond: 0\n\t}\n\tCreator: "MiniBlender Mobile"\n}\n`+
    `GlobalSettings:  {\n\tVersion: 1000\n\tProperties70:  {\n\t\tP: "UpAxis", "int", "Integer", "",1\n\t\tP: "UpAxisSign", "int", "Integer", "",1\n\t\tP: "FrontAxis", "int", "Integer", "",2\n\t\tP: "FrontAxisSign", "int", "Integer", "",1\n\t\tP: "CoordAxis", "int", "Integer", "",0\n\t\tP: "CoordAxisSign", "int", "Integer", "",1\n\t\tP: "OriginalUpAxis", "int", "Integer", "",1\n\t\tP: "OriginalUpAxisSign", "int", "Integer", "",1\n\t\tP: "UnitScaleFactor", "double", "Number", "",100\n\t\tP: "OriginalUnitScaleFactor", "double", "Number", "",100\n\t\tP: "TimeMode", "enum", "", "",${fps===30?6:fps===60?3:fps===24?11:fps===25?10:14}\n\t\tP: "CustomFrameRate", "double", "Number", "",${fps}\n\t\tP: "TimeSpanStart", "KTime", "Time", "",0\n\t\tP: "TimeSpanStop", "KTime", "Time", "",${Math.round(nF/fps*KT)}\n\t}\n}\n`+
    `Documents:  {\n\tCount: 1\n\tDocument: ${id()}, "Scene", "Scene" {\n\t\tProperties70:  {\n\t\t\tP: "SourceObject", "object", "", ""\n\t\t\tP: "ActiveAnimStackName", "KString", "", "", "MiniBlender"\n\t\t}\n\t\tRootNode: 0\n\t}\n}\nReferences:  {\n}\n`+
    `Definitions:  {\n\tVersion: 100\n\tCount: ${Object.values(counts).reduce((a,b)=>a+b,0)+1}\n\tObjectType: "GlobalSettings" {\n\t\tCount: 1\n\t}\n${defs}}\n\nObjects:  {\n${O.join('')}}\n\nConnections:  {\n${C.join('')}}\n\nTakes:  {\n\tCurrent: "MiniBlender"\n}\n`;
  return {text,nodes,animated:anyAnim,textures:nodes.filter(n=>n.texData).map(n=>({name:n.mat.texture,data:n.texData}))};
}
window.buildFBX=buildFBX;
function exportFBX(opts){
  const cur=S.frame;let r;try{r=buildFBX(opts);}finally{applyFrame(cur);}
  dl(safe(S.projectName||'miniblender')+'.fbx',new Blob([r.text],{type:'application/octet-stream'}));
  r.textures.forEach((t,i)=>setTimeout(()=>fetch(t.data).then(x=>x.blob()).then(b=>dl(t.name,b)),400*(i+1)));
  const meshes=r.nodes.filter(n=>n.geo).length;
  toast('FBX exportado: '+meshes+' malha(s)'+(r.animated?', com animação ('+Math.round(S.endFrame)+' quadros)':'')+(r.textures.length?' + '+r.textures.length+' textura(s)':''),4000);return r;
}
window.exportFBX=exportFBX;

/* ---------- Flipbook: folha de sprites com transparência ---------- */
const FB={cols:6,rows:6,size:256,from:0,to:-1,onlyFx:true};
async function buildFlipbook(o){
  o={...FB,...(o||{})};const n=o.cols*o.rows,from=o.from,to=o.to<0?S.endFrame:o.to,sz=o.size,cur=S.frame,playing=S.playing;S.playing=false;
  const sheet=document.createElement('canvas');sheet.width=o.cols*sz;sheet.height=o.rows*sz;const sx=sheet.getContext('2d'),cell=document.createElement('canvas');cell.width=cell.height=sz;const cx=cell.getContext('2d');
  const rt=new THREE.WebGLRenderTarget(sz,sz);rt.texture.encoding=THREE.sRGBEncoding;
  const c=viewCam(),oldA=c.aspect,bg=scene.background,fog=scene.fog,cc=renderer.getClearColor(new THREE.Color()),ca=renderer.getClearAlpha();
  const hide=[grid,axesH,selBox,ground],vis=hide.map(x=>x.visible);hide.forEach(x=>x.visible=false);
  // "só o efeito": esconde os objetos que não são parte de um efeito (os fragmentados continuam, pois os pedaços SÃO o efeito)
  const frac=new Set(FX.systems.filter(s=>s.kind==='fracture'&&s._obj).map(s=>s._obj)),hid=[];
  if(o.onlyFx)S.objs.forEach(ob=>{if(!frac.has(ob)&&ob.mesh.visible){ob.mesh.visible=false;hid.push(ob);}});
  scene.background=null;scene.fog=null;renderer.setClearColor(0x000000,0);c.aspect=1;c.updateProjectionMatrix();emit('beforeRender');
  try{
    const buf=new Uint8Array(sz*sz*4);
    for(let i=0;i<n;i++){
      const f=n>1?from+(to-from)*i/(n-1):from;S.frame=f;applyFrame(f);if(K.evalAll)K.evalAll(f);
      renderer.setRenderTarget(rt);renderer.clear();renderer.render(scene,c);renderer.readRenderTargetPixels(rt,0,0,sz,sz,buf);
      const im=cx.createImageData(sz,sz),d=im.data;
      for(let y=0;y<sz;y++){const src=(sz-1-y)*sz*4,dst=y*sz*4;for(let x=0;x<sz*4;x+=4){const r=buf[src+x],g=buf[src+x+1],b=buf[src+x+2];
        // efeitos aditivos (brilho) não gravam alfa: usa o brilho como alfa e tira a pré-multiplicação
        const a=Math.max(buf[src+x+3],r,g,b);if(a>0){const k=255/a;d[dst+x]=Math.min(255,r*k);d[dst+x+1]=Math.min(255,g*k);d[dst+x+2]=Math.min(255,b*k);d[dst+x+3]=a;}}}
      cx.putImageData(im,0,0);sx.drawImage(cell,(i%o.cols)*sz,Math.floor(i/o.cols)*sz);
      if(i%6===5)await new Promise(r=>setTimeout(r,0));
    }
  }finally{
    renderer.setRenderTarget(null);renderer.setClearColor(cc,ca);scene.background=bg;scene.fog=fog;c.aspect=oldA;c.updateProjectionMatrix();emit('afterRender');
    hide.forEach((x,i)=>x.visible=vis[i]);hid.forEach(ob=>ob.mesh.visible=true);rt.dispose();S.frame=cur;applyFrame(cur);S.playing=playing;need=true;
  }
  return {canvas:sheet,cols:o.cols,rows:o.rows,frames:n,size:sz,from,to,fps:S.fps};
}
window.buildFlipbook=buildFlipbook;
async function exportFlipbook(o){
  toast('Gerando flipbook…',60000);await new Promise(r=>setTimeout(r,40));
  const r=await buildFlipbook(o),name=`${safe(S.projectName||'efeito')}_flipbook_${r.cols}x${r.rows}_${r.size}px`;
  r.canvas.toBlob(b=>dl(name+'.png',b),'image/png');
  // metadados para montar no motor de jogo
  const meta={image:name+'.png',columns:r.cols,rows:r.rows,frames:r.frames,frame_size:r.size,fps:Math.round(r.frames/Math.max(1e-6,(r.to-r.from)/r.fps)*100)/100,duration_s:Math.round((r.to-r.from)/r.fps*1000)/1000,alpha:'straight',order:'esquerda→direita, cima→baixo'};
  setTimeout(()=>dl(name+'.json',new Blob([JSON.stringify(meta,null,1)],{type:'application/json'})),500);
  toast('Flipbook exportado: '+r.frames+' quadros em '+r.cols+'×'+r.rows+' ('+r.canvas.width+'×'+r.canvas.height+' px)',4000);return r;
}
window.exportFlipbook=exportFlipbook;

/* ---------- painel (fim da aba Efeitos) e menu ---------- */
K.BOTTOM=P=>{
  P.append(h('div',{class:'lb'},'Exportar efeito'));
  P.append(row(chip('FBX (malhas + animação)',()=>exportFBX(),false,'act'),chip('Flipbook PNG (brilho e partículas)',()=>exportFlipbook(),false,'act')));
  P.append(row(lb('Flipbook'),...[[4,4],[6,6],[8,8]].map(([c,r])=>chip(c+'×'+r,()=>{FB.cols=c;FB.rows=r;renderPanel();},FB.cols===c)),lb('Quadro'),...[128,256,512].map(s=>chip(s+'px',()=>{FB.size=s;renderPanel();},FB.size===s)),
    chip('Só o efeito',()=>{FB.onlyFx=!FB.onlyFx;renderPanel();},FB.onlyFx,'cy')));
  P.append(slider('Flipbook: do quadro',0,S.endFrame,1,FB.from,v=>FB.from=v),slider('Flipbook: até o quadro',0,S.endFrame,1,FB.to<0?S.endFrame:FB.to,v=>FB.to=v));
  P.append(h('div',{class:'note'},'FBX leva o que é malha: pedaços da arma fragmentada, cristais, balas e cápsulas, com a animação quadro a quadro, cores e emissão. Brilho, clarão, fumaça, faíscas e raios são shader/partícula e não existem dentro de um FBX — para eles use o Flipbook (PNG transparente + .json com colunas/linhas/fps), que é o que Unity, Unreal e Godot usam. O flipbook é tirado da vista atual.'));
};
})();
