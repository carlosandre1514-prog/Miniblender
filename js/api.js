'use strict';
/* =====================================================================
   MiniBlender · API pública, plugins e ponte MCP (WebSocket)
   window.MiniBlender.run(nome, args)  -> executa uma ferramenta
   window.MiniBlender.registerPlugin({...}) -> adiciona aba/ferramentas
   window.MiniBlender.connect('ws://IP:8765') -> liga ao servidor MCP
   ===================================================================== */
(function(){
const deg=x=>x*180/Math.PI,rad=x=>x*Math.PI/180,r3=a=>a.map(v=>Math.round(v*1000)/1000);
const text=t=>[{type:'text',text:typeof t==='string'?t:JSON.stringify(t,null,1)}];
function getObj(a,optional){
  a=a||{};let o=null;
  if(a.id!=null)o=S.objs.find(x=>x.id===a.id);else if(a.name)o=S.objs.find(x=>x.name===a.name);else o=S.sel;
  if(!o&&!optional)throw new Error(a.id!=null?'Objeto id '+a.id+' não existe (use get_scene)':'Nenhum objeto selecionado; informe id');
  return o;
}
function withSel(o,fn){if(S.sel!==o)selectObj(o);return fn();}
function setTRS(o,a){
  const m=o.mesh,p0=m.position.clone(),q0=m.quaternion.clone(),s0=m.scale.clone();
  if(a.position)m.position.fromArray(a.position);if(a.rotation_deg)m.rotation.set(...a.rotation_deg.map(rad));if(a.scale)m.scale.fromArray(a.scale);
  const p1=m.position.clone(),q1=m.quaternion.clone(),s1=m.scale.clone();
  push(()=>{m.position.copy(p0);m.quaternion.copy(q0);m.scale.copy(s0);hud();need=true;},()=>{m.position.copy(p1);m.quaternion.copy(q1);m.scale.copy(s1);hud();need=true;});hud();need=true;
}
function describe(o){
  const e=new THREE.Euler().setFromQuaternion(o.mesh.quaternion),b=new THREE.Box3().setFromObject(o.mesh);
  return {id:o.id,name:o.name,selected:o===S.sel,vertices:o.em.pos.length/3,faces:o.em.faces.length,position:r3(o.mesh.position.toArray()),rotation_deg:r3([e.x,e.y,e.z].map(deg)),scale:r3(o.mesh.scale.toArray()),
    bounds:{min:r3(b.min.toArray()),max:r3(b.max.toArray())},material:o.params,modifiers:(o.ext.mods||[]).map(m=>m.type+(m.on===false?' (off)':'')),
    rig:o.rig?{bones:o.rig.bones.map(b=>b.name),pose_keys:Object.keys(o.rig.poseKeys||{}).map(Number)}:null,character:!!(o.ext&&o.ext.char),fur:!!(o.ext&&o.ext.fur),keyframes:Object.keys(o.keys).map(Number)};
}
// Foto da cena (JPEG base64) por render-target, sem precisar de preserveDrawingBuffer.
function snapshot(width,hideHelpers,quality){
  const R=cv.getBoundingClientRect(),asp=S.rd.aspect||(R.width/R.height)||1,W=clamp(width||768,128,1600),H=Math.round(W/asp),c=viewCam(),oldA=c.aspect;
  const rt=new THREE.WebGLRenderTarget(W,H);rt.texture.encoding=THREE.sRGBEncoding;
  const hide=hideHelpers!==false?[grid,axesH,selBox]:[],vis=hide.map(x=>x.visible);hide.forEach(x=>x.visible=false);
  c.aspect=asp;c.updateProjectionMatrix();emit('beforeRender');
  try{renderer.setRenderTarget(rt);renderer.render(scene,c);const buf=new Uint8Array(W*H*4);renderer.readRenderTargetPixels(rt,0,0,W,H,buf);
    const cvs=document.createElement('canvas');cvs.width=W;cvs.height=H;const ctx=cvs.getContext('2d'),im=ctx.createImageData(W,H);for(let y=0;y<H;y++)im.data.set(buf.subarray((H-1-y)*W*4,(H-y)*W*4),y*W*4);ctx.putImageData(im,0,0);
    return cvs.toDataURL('image/jpeg',quality||0.85).split(',')[1];}
  finally{renderer.setRenderTarget(null);emit('afterRender');hide.forEach((x,i)=>x.visible=vis[i]);c.aspect=oldA;c.updateProjectionMatrix();rt.dispose();need=true;}
}
window.snapshotScene=snapshot;
function procGraph(o,a){
  const g={nodes:[{id:1,type:'out',x:470,y:30,params:{}}],links:[],next:2},A=a.color_a||'#d0d0d0',B=a.color_b||'#303030',sc=a.scale||4;
  if(a.texture==='none'){o.graph=null;o._proc&&bakeProcedural(o);applyMaterial(o);return;}
  const add=(type,params,x,y)=>{const n={id:g.next++,type,x,y,params:{...NDEF[type].params(),...params}};g.nodes.push(n);return n;};
  let src;
  if(a.texture==='checker')src=add('checker',{scale:sc,a:A,b:B},20,30);
  else if(a.texture==='bricks')src=add('bricks',{scale:sc,a:A,m:B},20,30);
  else{const t=a.texture==='voronoi'?add('voronoi',{scale:sc},20,30):a.texture==='gradient'?add('gradient',{}, 20,30):add('noise',{scale:sc,detail:5,rough:0.55},20,30);
    src=add('ramp',{a:B,b:A,p0:0.2,p1:0.8},240,30);g.links.push({from:t.id,to:{node:src.id,sock:'fac'}});
    if(a.roughness_from_texture){const inv=add('invert',{},240,160);g.links.push({from:t.id,to:{node:inv.id,sock:'in'}});g.links.push({from:inv.id,to:{node:1,sock:'rough'}});}}
  g.links.push({from:src.id,to:{node:1,sock:'base'}});o.graph=g;applyMaterial(o);
}
const H={
  get_scene(){
    const W=window.WORLD||{},FXs=window.FX?FX.systems:[];
    return text({objects:S.objs.map(describe),selected:S.sel?S.sel.id:null,tab:S.ws,timeline:{frame:Math.round(S.frame),end_frame:S.endFrame,fps:S.fps,playing:S.playing},
      lights:(W.lights||[]).map(L=>({name:L.name,type:L.type,position:L.pos,color:L.color,intensity:L.intensity})),cameras:(W.cams||[]).map((C,i)=>({name:C.name,active:i===W.activeCam})),
      particles:FXs.map(s=>({name:s.name,preset:s.preset,emitter:s.emitter})),world:{sky:W.sky,fog:W.fog,sun:W.sunI},project:S.projectName,units:'metros, Y para cima, chão em y=0'});
  },
  view_scene(a){return [{type:'image',mediaType:'image/jpeg',data:snapshot(a.width||768,a.hide_helpers)},{type:'text',text:'Vista atual ('+S.objs.length+' objetos).'}];},
  add_primitive(a){
    const o=addPrim(a.type);if(a.name)o.name=a.name;if(a.color){o.params.color=a.color;applyMaterial(o);}
    if(a.position||a.rotation_deg||a.scale){if(a.position)o.mesh.position.fromArray(a.position);if(a.rotation_deg)o.mesh.rotation.set(...a.rotation_deg.map(rad));if(a.scale)o.mesh.scale.fromArray(a.scale);}
    hud();renderPanel();need=true;return text({created:describe(o)});
  },
  async create_character(a){const p={...(a.preset&&window.CHAR_PRESETS?CHAR_PRESETS[a.preset]:{}),...(a.params||{})};if(a.params&&a.params.detail)p.detail={...((CHAR_PRESETS[a.preset]||{}).detail||{}),...a.params.detail};
    const o=await createCharacter(p);if(a.position)o.mesh.position.fromArray(a.position);renderPanel();return text({created:describe(o),height_m:+(o._charHeight||0).toFixed(2),tip:'Use set_pose/animate para animar; sculpt_stroke para esculpir.'});},
  select_object(a){const o=getObj(a);selectObj(o);return text('Selecionado: '+o.name+' (id '+o.id+')');},
  transform_object(a){const o=getObj(a);setTRS(o,a);return text(describe(o));},
  delete_object(a){const o=getObj(a);removeObj(o);push(()=>{scene.add(o.mesh);S.objs.push(o);selectObj(o);},()=>removeObj(o,true));return text('Apagado: '+o.name);},
  duplicate_object(a){const o=getObj(a);selectObj(o);const em={pos:o.em.pos.slice(),col:o.em.col.slice(),faces:o.em.faces.map(f=>f.slice())},c=createObject(o.name+' cópia',em,{flat:o.flat});
    c.mesh.position.copy(o.mesh.position).add(new THREE.Vector3(...(a.offset||[0.5,0,0.5])));c.mesh.quaternion.copy(o.mesh.quaternion);c.mesh.scale.copy(o.mesh.scale);c.params={...o.params};c.graph=o.graph?JSON.parse(JSON.stringify(o.graph)):null;c.ext=JSON.parse(JSON.stringify({...o.ext,char:undefined}));applyMaterial(c);emit('rebuild',c);selectObj(c);
    push(()=>removeObj(c,true),()=>{scene.add(c.mesh);S.objs.push(c);selectObj(c);});return text({created:describe(c)});},
  rename_object(a){const o=getObj(a),old=o.name;o.name=a.name;push(()=>{o.name=old;hud();},()=>{o.name=a.name;hud();});hud();return text('Renomeado para '+a.name);},
  set_material(a){const o=getObj(a),P=o.params,b=JSON.stringify(P);
    if(a.color)P.color=a.color;if(a.metalness!=null)P.metal=a.metalness;if(a.roughness!=null)P.rough=a.roughness;if(a.emission)P.emis=a.emission;if(a.emission_strength!=null)P.emisI=a.emission_strength;if(a.opacity!=null)P.alpha=a.opacity;
    if(a.flat_shading!=null){o.flat=a.flat_shading;o.mat.flatShading=o.flat;o.mat.needsUpdate=true;}
    const af=JSON.stringify(P);push(()=>{o.params=JSON.parse(b);applyMaterial(o);},()=>{o.params=JSON.parse(af);applyMaterial(o);});applyMaterial(o);renderPanel();return text({material:o.params});},
  set_procedural_texture(a){const o=getObj(a);procGraph(o,a);return text('Textura '+a.texture+' aplicada (nós na aba Nós).');},
  add_modifier(a){const o=getObj(a),T=MOD_TYPES[a.type];if(!T)throw new Error('tipo inválido');o.ext.mods=o.ext.mods||[];o.ext.mods.push({type:a.type,on:true,...T.def(),...(a.params||{})});updateMods(o);renderPanel();
    return text({modifiers:o.ext.mods,result_vertices:o.modMesh?o.modMesh.userData.vcount:null});},
  apply_modifiers(a){const o=getObj(a);withSel(o,()=>applyModifiers(o));return text(describe(o));},
  edit_mesh(a){const o=getObj(a);withSel(o,()=>{
    const op=a.op,amt=a.amount;
    if(op==='subdivide')doSubdiv();
    else if(op==='triangulate')editOp(em=>triangulate(em));
    else if(op==='tris_to_quads')editOp(em=>{trisToQuads(em,amt||15);});
    else if(op==='recalc_normals')editOp(em=>recalcNormals(em));
    else if(op==='flip_normals')editOp(em=>flipFaces(em));
    else if(op==='smooth')editOp(em=>laplacianSmooth(em,Math.max(1,Math.round(amt||2)),0.5));
    else if(op==='merge_by_distance')editOp(em=>{mergeByDistance(em,amt||0.001);});
    else if(op==='remesh'){S.remeshRes=a.resolution||S.remeshRes;voxelRemeshUI(o);}
    else if(op==='inset_all')editOp(em=>insetFaces(em,em.faces.map((_,i)=>i),amt||0.2));
    else if(op==='extrude_all_faces_along_normal')editOp(em=>{const sel=em.faces.map((_,i)=>i);const N0=sel.map(fi=>faceNormal(em,em.faces[fi]));extrudeFaces(em,sel);
      const mv=new Map();sel.forEach((fi,k)=>em.faces[fi].forEach(v=>{const m=mv.get(v)||[0,0,0,0];m[0]+=N0[k][0];m[1]+=N0[k][1];m[2]+=N0[k][2];m[3]++;mv.set(v,m);}));
      mv.forEach((m,v)=>{const l=Math.hypot(m[0],m[1],m[2])||1,d=amt||0.1;em.pos[3*v]+=m[0]/l*d;em.pos[3*v+1]+=m[1]/l*d;em.pos[3*v+2]+=m[2]/l*d;});});
    else throw new Error('op desconhecida');
  });return text({op:a.op,vertices:o.em.pos.length/3,faces:o.em.faces.length});},
  sculpt_stroke(a){const o=getObj(a);selectObj(o);const keep={r:S.radius,s:S.strength,sub:S.subtract,sym:S.sym};
    S.radius=a.radius||0.15;S.strength=a.strength==null?0.5:a.strength;S.subtract=!!a.subtract;if(a.symmetry!=null)S.sym=a.symmetry;
    const g={o,touched:new Map(),tc:new Map(),kind:a.brush,pr:1,layerBase:new Map(),color:[1,1,1]};
    try{(a.points||[]).forEach(pt=>{const hL=o.mesh.worldToLocal(new THREE.Vector3(...pt));brushDab(g,hL,new THREE.Vector3(0,1,0));});G=g;strokeEnd();}
    finally{G=null;S.radius=keep.r;S.strength=keep.s;S.subtract=keep.sub;S.sym=keep.sym;}
    return text({brush:a.brush,vertices_moved:g.touched.size});},
  paint_vertices(a){const o=getObj(a),c=hexRgb(a.color).map(s2l);
    if(a.fill){const idx=[...Array(o.em.pos.length/3).keys()],b=idx.map(i=>[o.em.col[3*i],o.em.col[3*i+1],o.em.col[3*i+2]]),af=idx.map(()=>c.slice());setColList(o,idx,af);push(()=>setColList(o,idx,b),()=>setColList(o,idx,af));return text('Objeto pintado');}
    const keep={r:S.radius,s:S.strength};S.radius=a.radius||0.15;S.strength=1;const g={o,touched:new Map(),tc:new Map(),kind:'paint',pr:1,color:c,layerBase:new Map()};
    try{(a.points||[]).forEach(pt=>brushCore(g,o.mesh.worldToLocal(new THREE.Vector3(...pt)),new THREE.Vector3()));G=g;strokeEnd();}finally{G=null;S.radius=keep.r;S.strength=keep.s;}
    return text({painted_vertices:g.tc.size});},
  add_light(a){const L=addSceneLight(a.type);if(a.position)L.pos=a.position;if(a.target)L.target=a.target;if(a.color)L.color=a.color;if(a.intensity!=null)L.intensity=a.intensity;if(a.shadow!=null)L.shadow=a.shadow;
    const l=L._obj;l.color.set(L.color);l.intensity=L.intensity;l.position.fromArray(L.pos);l.castShadow=!!L.shadow;if(l.target)l.target.position.fromArray(L.target);need=true;renderPanel();return text({light:{name:L.name,type:L.type,position:L.pos}});},
  set_world(a){const W=WORLD;if(a.sky)W.sky=a.sky;if(a.sky_top)W.skyTop=a.sky_top;if(a.sky_bottom)W.skyBottom=a.sky_bottom;if(a.background)S.rd.bg=a.background;if(a.sun_strength!=null)W.sunI=a.sun_strength;
    if(a.sun_azimuth_deg!=null)W.sunAz=a.sun_azimuth_deg;if(a.sun_elevation_deg!=null)W.sunEl=a.sun_elevation_deg;if(a.ambient!=null)W.ambient=a.ambient;if(a.reflections!=null)W.envI=a.reflections;if(a.fog!=null)W.fog=a.fog;if(a.fog_color)W.fogColor=a.fog_color;
    applyRender();renderPanel();return text('Mundo atualizado');},
  set_view(a){if(a.frame_object!=null){selectObj(getObj({id:a.frame_object}));$('#fFrame').click();}
    if(a.target)orb.t.fromArray(a.target);if(a.azimuth_deg!=null)orb.th=rad(a.azimuth_deg);if(a.elevation_deg!=null)orb.ph=clamp(rad(90-a.elevation_deg),0.05,Math.PI-0.05);if(a.distance!=null)orb.d=a.distance;
    if(a.fov){cam.fov=a.fov;cam.updateProjectionMatrix();}applyCam();return text({target:r3(orb.t.toArray()),distance:orb.d});},
  add_camera(){const C=addSceneCamera();renderPanel();return text('Câmera “'+C.name+'” criada a partir da vista atual e ativada.');},
  add_particles(a){if(!FX_PRESETS[a.preset])throw new Error('preset inválido');const em=a.emitter_id!=null?getObj({id:a.emitter_id}).id:null;
    const s=makeFX(a.preset,em),grp=FX.systems.filter(x=>x.group===s.group);if(a.offset)grp.forEach(x=>x.offset=a.offset.slice());Object.assign(s,a.params||{});grp.forEach(x=>fxRebuildMat(x));applyFrame(S.frame);renderPanel();
    return text({effect:s.name,layers:grp.map(x=>x.name),emitter:s.emitter,tip:'O efeito anima na timeline: use animate set_frame (ex.: 30) antes de view_scene/render para vê-lo formado.'});},
  add_lawn(a){const o=makeLawn(a.size||5);if(a.position)o.mesh.position.fromArray(a.position);if(a.count){o.ext.fur.count=a.count;buildFur(o);}renderPanel();return text({created:describe(o)});},
  add_fur(a){const o=getObj(a);const F=o.ext.fur={...FUR_DEF,...(FUR_STYLES[a.style||'pelo']||{}),seed:Math.floor(Math.random()*1e6)};
    if(a.count)F.count=a.count;if(a.length)F.length=a.length;if(a.root)F.root=a.root;if(a.tip)F.tip=a.tip;buildFur(o);renderPanel();return text({fur:F});},
  physics(a){let list=(a.ids||[]).map(id=>getObj({id}));if(!list.length)list=S.sel?[S.sel]:S.objs.slice();
    const opt={gravity:a.gravity||9.8,bounce:a.bounce==null?0.35:a.bounce,friction:0.08,spin:a.spin==null?3:a.spin,kick:0,explode:a.explode||0,ground:true,collide:true};
    if(a.shatter){const made=shatterObject(list[0],a.pieces||14);opt.explode=opt.explode||4;bakeRigid(made,opt);return text({pieces:made.length,frames:S.endFrame});}
    bakeRigid(list,opt);return text({objects:list.map(o=>o.name),frames:S.endFrame,tip:'animate action=play para ver'});},
  rig(a){const o=getObj(a);selectObj(o);createRig();return text({bones:o.rig.bones.map(b=>b.name)});},
  set_pose(a){const o=getObj(a);if(!o.rig)throw new Error('Objeto sem rig (use rig)');const r=ensureRig(o);if(a.reset)r.bones.forEach(b=>b.rot=[0,0,0]);
    const miss=[];Object.entries(a.bones||{}).forEach(([n,v])=>{const b=r.bones.find(x=>x.name===n);if(!b)return miss.push(n);b.rot=v.map(rad);});refreshRigViz(o);
    if(a.key_frame!=null){S.frame=a.key_frame;selectObj(o);insertRigKey();}need=true;return text({ok:true,unknown_bones:miss});},
  animate(a){const o=getObj(a,true);
    if(a.end_frame)S.endFrame=a.end_frame;if(a.fps)S.fps=a.fps;
    switch(a.action){
      case 'key_transform':if(!o)throw new Error('sem objeto');if(a.frame!=null){S.frame=a.frame;applyFrame(S.frame);}if(a.position)o.mesh.position.fromArray(a.position);if(a.rotation_deg)o.mesh.rotation.set(...a.rotation_deg.map(rad));if(a.scale)o.mesh.scale.fromArray(a.scale);selectObj(o);insertKey();break;
      case 'rig_walk':case 'rig_run':case 'rig_jump':if(!o||!o.rig)throw new Error('objeto precisa de rig');selectObj(o);makeRigPreset(a.action.slice(4));break;
      case 'play':S.playing=true;break;case 'stop':S.playing=false;break;
      case 'set_frame':S.frame=a.frame||0;applyFrame(S.frame);break;
      case 'clear_keys':if(o){o.keys={};if(o.rig)o.rig.poseKeys={};}break;
    }renderPanel();return text({frame:Math.round(S.frame),end_frame:S.endFrame,fps:S.fps,playing:S.playing});},
  render(a){const r=S.rd;['bloom','exposure','saturation','contrast','vignette'].forEach(k=>{if(a[k]!=null)r[{saturation:'sat',contrast:'con',vignette:'vig'}[k]||k]=a[k];});applyRender();
    return new Promise((res,rej)=>{renderImage({res:a.width||960,cb:c=>{const data=c.toDataURL('image/jpeg',0.9).split(',')[1];if(a.download)c.toBlob(b=>dl('render.png',b),'image/png');res([{type:'image',mediaType:'image/jpeg',data},{type:'text',text:'Render '+c.width+'x'+c.height}]);},err:rej});});},
  async project(a){switch(a.action){
    case 'save':await saveLocal(false,a.name);return text('Salvo no aparelho como '+S.projectName);
    case 'new':saveLocal(true);clearScene();S.projectName=a.name||'Sem título';addPrim('cube',true);selectObj(S.objs[0]);return text('Projeto novo');
    case 'export_glb':exportGLB();return text('GLB exportado (download)');case 'export_obj':exportOBJ();return text('OBJ exportado');
    case 'export_json':dl((S.projectName||'projeto')+'.json',new Blob([JSON.stringify(serializeAll())],{type:'application/json'}));return text('JSON exportado');
    case 'undo':doUndo();return text('Desfeito');case 'redo':doRedo();return text('Refeito');
    case 'set_tab':setWs(a.tab);return text('Aba '+a.tab);}},
  run_script(a){if(!API.allowScripts)throw new Error('Scripts desativados. O usuário precisa ligar “Permitir scripts” na aba Claude.');
    // eslint-disable-next-line no-new-func
    const v=(0,eval)(a.code);return text(v===undefined?'ok':(()=>{try{return JSON.stringify(v).slice(0,4000);}catch(e){return String(v);}})());}
};
const API={
  version:'2.0',tools:MB_TOOLS,handlers:H,plugins:[],
  allowScripts:(()=>{try{return localStorage.getItem('mb.allowScripts')==='1';}catch(e){return false;}})(),
  // Executa uma ferramenta; sempre devolve {content:[...], isError}
  async run(name,args){
    const fn=H[name];if(!fn)return {content:text('Ferramenta desconhecida: '+name),isError:true};
    try{const out=await fn(args||{});need=true;API.log(name,args,false);return {content:out,isError:false};}
    catch(err){API.log(name,args,true,err);return {content:text('Erro: '+(err&&err.message||err)),isError:true};}
  },
  logs:[],log(name,args,err,e){API.logs.push({t:Date.now(),name,args,err:!!err,msg:e&&e.message});if(API.logs.length>200)API.logs.shift();emit('apiCall',name,args,err);},
  on,emit,
  // Plugins: {name, tab?:'Rótulo', panel?(P,api), tools?:[{name,description,input_schema,run(args,api)}], init?(api)}
  registerPlugin(p){
    if(!p||!p.name)throw new Error('plugin sem nome');if(API.plugins.some(x=>x.name===p.name))return;
    API.plugins.push(p);
    (p.tools||[]).forEach(t=>{MB_TOOLS.push({name:t.name,description:'[plugin '+p.name+'] '+t.description,input_schema:t.input_schema||{type:'object',properties:{}}});H[t.name]=args=>{const r=t.run(args,API);return Promise.resolve(r).then(v=>Array.isArray(v)&&v[0]&&v[0].type?v:text(v===undefined?'ok':v));};});
    if(p.panel){const key='plug_'+p.name.replace(/\W+/g,'_');PANELS_EXT[key]=P=>p.panel(P,API);TABS.push([key,p.tab||p.name]);renderTabs();}
    if(p.init)try{p.init(API);}catch(e){console.error(e);}
    API.bridgeHello();toast('Plugin “'+p.name+'” carregado');
  },
  /* ---------- Ponte MCP ---------- */
  ws:null,wsUrl:'',wsState:'desligado',
  connect(url){
    API.disconnect(true);API.wsUrl=url;try{localStorage.setItem('mb.mcpUrl',url);}catch(e){}
    let ws;try{ws=new WebSocket(url);}catch(e){API.wsState='erro: '+e.message;emit('bridge');return;}
    API.ws=ws;API.wsState='conectando…';emit('bridge');
    ws.onopen=()=>{API.wsState='conectado';API.bridgeHello();emit('bridge');toast('Conector MCP ligado: '+url);};
    ws.onclose=()=>{if(API.ws===ws){API.ws=null;API.wsState='desligado';emit('bridge');if(API.autoRe)setTimeout(()=>{if(!API.ws&&API.autoRe)API.connect(API.wsUrl);},3000);}};
    ws.onerror=()=>{API.wsState='erro de conexão';emit('bridge');};
    ws.onmessage=async ev=>{let m;try{m=JSON.parse(ev.data);}catch(e){return;}
      if(m.type==='call'){toast('🔌 Claude: '+m.name,1200);const r=await API.run(m.name,m.args);ws.send(JSON.stringify({type:'result',id:m.id,content:r.content,isError:r.isError}));}
      else if(m.type==='ping')ws.send(JSON.stringify({type:'pong'}));};
    API.autoRe=true;
  },
  disconnect(silent){API.autoRe=false;if(API.ws){try{API.ws.close();}catch(e){}API.ws=null;}API.wsState='desligado';if(!silent)emit('bridge');},
  bridgeHello(){if(API.ws&&API.ws.readyState===1)API.ws.send(JSON.stringify({type:'hello',app:'MiniBlender Mobile',version:API.version,tools:MB_TOOLS}));}
};
window.MiniBlender=API;

/* ---------- Plugins salvos (URL ou arquivo .js) ---------- */
function loadPluginCode(code,label){const s=document.createElement('script');s.src=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));s.dataset.plugin=label;document.body.append(s);}
function savedPlugins(){try{return JSON.parse(localStorage.getItem('mb.plugins')||'[]');}catch(e){return [];}}
function storePlugins(l){try{localStorage.setItem('mb.plugins',JSON.stringify(l));}catch(e){toast('Plugin grande demais para guardar');}}
API.installPlugin=(code,label)=>{const l=savedPlugins().filter(x=>x.label!==label);l.push({label,code});storePlugins(l);loadPluginCode(code,label);};
API.removePlugin=label=>{storePlugins(savedPlugins().filter(x=>x.label!==label));toast('Removido. Recarregue o app.');};
API.savedPlugins=savedPlugins;
on('boot',()=>{savedPlugins().forEach(p=>loadPluginCode(p.code,p.label));
  // Se o app foi aberto pelo servidor MCP (http://IP:8765), conecta sozinho.
  const q=new URLSearchParams(location.search),auto=q.get('mcp'),tok=q.get('t')||window.MB_BRIDGE_TOKEN||'';let url=null;try{url=localStorage.getItem('mb.mcpUrl');}catch(e){}
  const here=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/bridge?t='+encodeURIComponent(tok);
  if(auto&&auto!=='1')API.connect(auto);
  else if((auto==='1'||window.MB_SERVED_BY_BRIDGE)&&tok)API.connect(here);
  else if(url)API.connect(url);
});
})();
