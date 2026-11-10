'use strict';
/* =====================================================================
   MiniBlender · Aba "Claude": assistente embutido + conector MCP + plugins
   - Assistente: conversa com o Claude pela API da Anthropic (SDK oficial,
     vendor/anthropic-sdk.mjs) usando as ferramentas de js/tools.js.
   - Conector MCP: liga o app ao servidor mcp-server/ para que o Claude
     Desktop, Claude Code ou claude.ai controlem o app.
   - Plugins: instale arquivos .js que chamam MiniBlender.registerPlugin.
   ===================================================================== */
(function(){
const API=window.MiniBlender;
const LS={get:(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:v;}catch(e){return d;}},set:(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}}};
const C={key:LS.get('mb.claudeKey',''),model:LS.get('mb.claudeModel','claude-opus-5-5'),effort:LS.get('mb.claudeEffort','medium'),sendView:LS.get('mb.claudeView','1')==='1',
  msgs:[],log:[],busy:false,abort:null,client:null,mod:null};
const MODELS=[['claude-opus-5-5','Opus 5.5 (padrão)'],['claude-sonnet-5-5','Sonnet 5.5 (rápido)'],['claude-haiku-5-5','Haiku 5.5 (econômico)']];
const SYSTEM=`Você é o assistente 3D do MiniBlender Mobile, um editor 3D no celular inspirado no Blender.
Você controla o app pelas ferramentas. Unidades em metros, eixo Y para cima, chão em y=0. Rotações em graus.
Como trabalhar:
- Comece com get_scene para saber o que existe e os IDs.
- Monte cenas em passos pequenos e confira com view_scene depois de mudanças visuais importantes (ou render para a imagem final).
- Personagens: create_character (já vem com rig de 17 ossos), depois set_pose/animate. Esculpir: sculpt_stroke com pontos na superfície (use bounds de get_scene).
- Efeitos: add_particles (fogo, fumaça, faíscas, neve, chuva, magia, explosão, água, poeira), add_fur, physics.
- Prefira modificadores (add_modifier) a operações destrutivas quando fizer sentido.
- Tudo pode ser desfeito pelo usuário (botão ↶).
Responda em português do Brasil, curto e direto, dizendo o que você fez.`;

async function sdk(){
  if(C.mod)return C.mod;
  C.mod=await import(new URL('vendor/anthropic-sdk.mjs',document.baseURI).href);return C.mod;
}
function toApiContent(blocks){return blocks.map(b=>b.type==='image'?{type:'image',source:{type:'base64',media_type:b.mediaType||'image/jpeg',data:b.data}}:{type:'text',text:b.text});}
function tools(){return MB_TOOLS.filter(t=>t.name!=='run_script'||API.allowScripts).map(t=>({name:t.name,description:t.description,input_schema:t.input_schema}));}
function addLog(kind,txt){C.log.push({kind,txt});if(C.log.length>300)C.log.shift();drawLog();}
let logEl=null;
function drawLog(){
  if(!logEl||!logEl.isConnected)return;logEl.innerHTML='';
  C.log.forEach(m=>{const st={user:'align-self:flex-end;background:#0d1a0b;border-color:#39ff14',ai:'background:#121a1d;border-color:#00e5ff',tool:'color:#8b8b8b;font-size:11px;border-style:dashed',err:'border-color:#ff453a;color:#ff8a80'}[m.kind]||'';
    logEl.append(h('div',{style:'border:1px solid var(--ln);border-radius:10px;padding:7px 9px;white-space:pre-wrap;max-width:92%;user-select:text;-webkit-user-select:text;'+st},m.txt));});
  logEl.scrollTop=logEl.scrollHeight;
}
async function send(textIn){
  if(C.busy)return;if(!C.key)return toast('Coloque sua chave da API da Anthropic primeiro');
  const content=[];
  if(C.sendView){try{content.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:snapshotScene(640,true,0.8)}});}catch(e){}}
  content.push({type:'text',text:textIn});C.msgs.push({role:'user',content});addLog('user',textIn);
  C.busy=true;C.abort=new AbortController();renderPanel();
  try{
    const mod=await sdk(),Anthropic=mod.default;
    if(!C.client||C.client._k!==C.key){C.client=new Anthropic({apiKey:C.key,dangerouslyAllowBrowser:true});C.client._k=C.key;}
    for(let it=0;it<30;it++){
      const params={model:C.model,max_tokens:16000,system:[{type:'text',text:SYSTEM,cache_control:{type:'ephemeral'}}],tools:tools(),messages:C.msgs,
        thinking:{type:'adaptive'},output_config:{effort:C.effort}};
      // Fallback automático no servidor quando um classificador recusa (Opus/Sonnet 5.5).
      if(C.model!=='claude-haiku-5-5'){params.betas=['server-side-fallback-2026-07-01'];params.fallbacks='default';}
      const resp=await C.client.beta.messages.create(params,{signal:C.abort.signal});
      C.msgs.push({role:'assistant',content:resp.content});
      resp.content.forEach(b=>{if(b.type==='text'&&b.text.trim())addLog('ai',b.text.trim());});
      if(resp.stop_reason==='refusal'){addLog('err','O Claude recusou este pedido'+(resp.stop_details&&resp.stop_details.explanation?': '+resp.stop_details.explanation:'.'));break;}
      if(resp.stop_reason==='max_tokens'){addLog('err','Resposta cortada (limite de tokens).');break;}
      if(resp.stop_reason==='pause_turn')continue;
      if(resp.stop_reason!=='tool_use')break;
      const results=[];
      for(const b of resp.content){if(b.type!=='tool_use')continue;
        addLog('tool','🔧 '+b.name+' '+JSON.stringify(b.input).slice(0,140));
        const r=await API.run(b.name,b.input);
        results.push({type:'tool_result',tool_use_id:b.id,content:toApiContent(r.content),is_error:r.isError||undefined});
        if(r.isError)addLog('err',r.content[0].text);
      }
      C.msgs.push({role:'user',content:results});
    }
  }catch(err){
    const m=C.mod||{};
    if(err&&err.name==='AbortError'||(m.APIUserAbortError&&err instanceof m.APIUserAbortError))addLog('err','Interrompido.');
    else if(m.AuthenticationError&&err instanceof m.AuthenticationError)addLog('err','Chave da API inválida (401). Confira em console.anthropic.com.');
    else if(m.RateLimitError&&err instanceof m.RateLimitError)addLog('err','Limite de uso atingido (429). Tente de novo em instantes.');
    else if(m.APIConnectionError&&err instanceof m.APIConnectionError)addLog('err','Sem conexão com a API da Anthropic.');
    else if(m.APIError&&err instanceof m.APIError)addLog('err','Erro da API ('+err.status+'): '+err.message);
    else addLog('err','Erro: '+(err&&err.message||err));
    // remove a última pergunta sem resposta para manter o histórico válido
    while(C.msgs.length&&C.msgs[C.msgs.length-1].role==='user'&&!C.msgs[C.msgs.length-1].content.some(x=>x.type==='tool_result'))C.msgs.pop();
    if(C.msgs.length&&C.msgs[C.msgs.length-1].role==='assistant'&&C.msgs[C.msgs.length-1].content.some(x=>x.type==='tool_use'))C.msgs.pop();
  }finally{C.busy=false;C.abort=null;renderPanel();}
}

function panelClaude(P){
  // --- Assistente ---
  P.append(h('div',{class:'lb'},'Assistente Claude (no app)'));
  logEl=h('div',{style:'display:flex;flex-direction:column;gap:6px;max-height:26vh;min-height:60px;overflow-y:auto;padding:4px;background:#070707;border:1px solid var(--ln);border-radius:10px'});
  if(!C.log.length)logEl.append(h('div',{class:'note'},'Peça coisas como: “crie um guerreiro forte com cabelo longo e coloque fogo nas mãos”, “faça uma cena de neve com 3 árvores”, “anime o personagem andando e renderize”.'));
  P.append(logEl);drawLog();
  const ta=h('textarea',{rows:2,placeholder:C.key?'Escreva para o Claude…':'Primeiro coloque a chave da API abaixo',style:'width:100%;background:var(--card2);color:var(--t);border:1px solid var(--ln);border-radius:10px;padding:9px;font:inherit;resize:vertical;user-select:text;-webkit-user-select:text'});
  ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();go();}});
  const go=()=>{const v=ta.value.trim();if(!v)return;ta.value='';send(v);};
  P.append(ta,row(chip(C.busy?'Pensando…':'Enviar',go,false,'act'),C.busy?chip('Parar',()=>C.abort&&C.abort.abort()):null,chip('Foto da vista',()=>{C.sendView=!C.sendView;LS.set('mb.claudeView',C.sendView?'1':'0');renderPanel();},C.sendView,'cy'),
    chip('Nova conversa',()=>{C.msgs=[];C.log=[];renderPanel();}),chip('Permitir scripts',()=>{API.allowScripts=!API.allowScripts;LS.set('mb.allowScripts',API.allowScripts?'1':'0');renderPanel();},API.allowScripts,'cy')));
  const key=h('input',{type:'password',class:'field',placeholder:'sk-ant-…',value:C.key,style:'flex:1;max-width:100%',onchange:e=>{C.key=e.target.value.trim();LS.set('mb.claudeKey',C.key);toast(C.key?'Chave salva neste aparelho':'Chave removida');}});
  const msel=h('select',{class:'field',onchange:e=>{C.model=e.target.value;LS.set('mb.claudeModel',C.model);}});MODELS.forEach(([v,t])=>{const o=h('option',{value:v},t);if(v===C.model)o.selected=true;msel.append(o);});
  P.append(row(lb('Chave API'),key),row(lb('Modelo'),msel,lb('Esforço'),...['low','medium','high'].map(e=>chip({low:'baixo',medium:'médio',high:'alto'}[e],()=>{C.effort=e;LS.set('mb.claudeEffort',e);renderPanel();},C.effort===e,'cy'))));
  P.append(h('div',{class:'note'},'A chave fica só neste aparelho (armazenamento do navegador) e vai direto para api.anthropic.com. Crie uma em console.anthropic.com › API Keys. O uso é cobrado na sua conta da Anthropic.'));
  // --- Conector MCP ---
  P.append(h('div',{class:'lb'},'Conector MCP (Claude Desktop / Claude Code / claude.ai)'));
  const url=h('input',{class:'field',placeholder:'ws://IP-DO-PC:8765/bridge?t=TOKEN',value:API.wsUrl||LS.get('mb.mcpUrl',''),style:'flex:1;max-width:100%'});
  P.append(row(url,API.ws?chip('Desligar',()=>{API.disconnect();renderPanel();}):chip('Conectar',()=>{API.connect(url.value.trim());},false,'act')));
  P.append(h('div',{class:'note'},'Estado: '+API.wsState+'. No PC rode “npm install” e “npm start” na pasta mcp-server. Ele mostra o endereço; abra-o no celular (mesma rede Wi-Fi) e o app conecta sozinho. Depois adicione o servidor no Claude — passo a passo no README.'));
  // --- Plugins ---
  P.append(h('div',{class:'lb'},'Plugins'));
  const fileIn=h('input',{type:'file',accept:'.js,text/javascript',hidden:true,onchange:e=>{const f=e.target.files[0];if(!f)return;f.text().then(code=>{API.installPlugin(code,f.name);renderPanel();});e.target.value='';}});
  P.append(fileIn,row(chip('Instalar plugin (.js)',()=>fileIn.click(),false,'act'),chip('Instalar de URL',async()=>{const u=prompt('URL do plugin .js');if(!u)return;try{const r=await fetch(u);if(!r.ok)throw new Error(r.status);API.installPlugin(await r.text(),u);renderPanel();}catch(e){toast('Falha ao baixar: '+e.message);}}),
    chip('Exemplo',async()=>{try{const r=await fetch(new URL('plugins/exemplo-escada.js',document.baseURI));API.installPlugin(await r.text(),'exemplo-escada.js');renderPanel();}catch(e){toast('Exemplo indisponível');}})));
  const list=API.savedPlugins();
  list.forEach(p=>P.append(row(h('span',{class:'note',style:'flex:1'},'🧩 '+p.label+(API.plugins.length?'':'')),chip('Remover',()=>{API.removePlugin(p.label);renderPanel();}))));
  if(!list.length)P.append(h('div',{class:'note'},'Plugins são arquivos .js que chamam MiniBlender.registerPlugin({...}) para criar abas e ferramentas novas — que o Claude também pode usar. Instale só plugins em que você confia: eles rodam dentro do app.'));
}
on('bridge',()=>{if(S.ws==='claude')renderPanel();});
PANELS_EXT.claude=panelClaude;
TABS.push(['claude','Claude 🔌']);
})();
