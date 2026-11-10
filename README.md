# MiniBlender Mobile

Editor 3D para celular inspirado no Blender. Roda no navegador e pode ser instalado como app (PWA). Funciona offline e se conecta ao Claude.

Abra `index.html` por um servidor (veja [Rodar](#rodar)) e toque nas abas de baixo:

| Aba | O que faz |
|---|---|
| **Layout** | Adicionar primitivas, mover/girar/escalar, duplicar, lápis 3D |
| **Cena** | Luzes (ponto, spot, sol), câmeras com keyframes, céu em gradiente, neblina, proporção do render (16:9, 9:16, 1:1…) |
| **Editar** | Vértice/aresta/face, mover/**girar**/escalar, **edição proporcional**, extrudar, inset, loop cut, bevel, subdividir, **mesclar por distância**, **preencher (F)**, **tris→quads**, triangular, inverter/recalcular normais, selecionar ligados, separar |
| **Modific.** | Pilha **não-destrutiva**: Mirror, Subdivision Surface, Array, Solidify, Smooth, Displace, Weld, Wireframe, Screw/Torno, Triangulate. Aplicar todos ou um só |
| **Personagem** | **Corpo humano real**: malha do MakeHuman (medidas antropométricas de pessoas reais) com rosto, orelhas, mãos com dedos, pés e olhos. 11 modelos (Homem, Mulher, Atleta, Fisiculturista, Idoso/a, Menino/a…). Sliders de gênero, idade (10–90), músculos, peso, altura, etnia e 20 medidas (busto, cintura, quadril, ombros, braços, pernas, pescoço…). Textura de pele real com tom ajustável, roupa, cor dos olhos, cabelo pintado ou em fios 3D. **Rig de 17 ossos** ajustado às juntas do corpo |
| **Esculpir** | Draw, Clay, Layer, Smooth, Flatten, Crease, Grab, Inflate, Pinch, Snake Hook, **Máscara**; simetria; **pressão da caneta** (força ou raio); **Remesh por voxel** |
| **Material** | PBR, pintura por vértice, editor UV com costuras, mapas Base/Normal/Roughness/Metallic/AO |
| **Nós** | Principled BSDF + **Noise, Voronoi, Xadrez, Tijolos, Gradiente, Color Ramp**, Inverter, Matemática (×, +, −, ÷, ^, mín, máx, onda). As texturas procedurais são calculadas em 3D e gravadas numa textura (sem costura) |
| **Efeitos** | **Natureza**: fogo (línguas de chama + brasas + fumaça + luz tremulando), explosão, fumaça, faíscas, **raio** ramificado com clarão, **chuva** com respingos, neve, fonte de água, **água (lago/mar)** com ondas e reflexo do sol, **gramado** com vento. **Energia (estilo skin de jogo)**: "Skin de energia" (veias pulsando na peça, núcleo com anéis, cristais orbitando, raios na superfície, partículas e sequência de ativação) e "Tiro de energia". Pelo/cabelo, **física de corpo rígido** e **estilhaçar + explodir** |
| **Animar** | Timeline, keyframes, FPS, **gravar vídeo WebM** |
| **Rig / Ossos** | Ossos, pintura de pesos com **mapa de calor**, espelhar pesos/pose E→D, IK de 2 ossos, caminhar/correr/saltar prontos |
| **Render** | Render com bloom, vinheta, aberração, saturação e contraste |
| **Claude 🔌** | Assistente Claude dentro do app, conector MCP e plugins |

Menu ☰: projetos salvos no aparelho, importar GLB/glTF/OBJ e exportar GLB (com animação e modificadores), OBJ e JSON.

## O que mudou nesta versão

### Personagens e efeitos realistas
- **Personagem**: saiu o boneco de cápsulas; entrou a malha humana do MakeHuman (13,5 mil vértices) com os morphs originais. Os fios de cabelo seguem a cabeça na animação. Subdividir o personagem preserva a textura de pele.
- **Caminhar / correr / saltar** refeitos: os braços descem ao lado do corpo e balançam opostos às pernas, cotovelos e joelhos dobram no eixo certo.
- **Partículas** agora são quads instanciados com shader próprio por tipo (antes eram pontos redondos): alinham e esticam com a velocidade.
- **Efeitos novos**: raio, superfície de água, gramado com vento, skin de energia e tiro de energia.

### Correções
- **Salvamento**: o projeto agora é salvo no **IndexedDB**. Antes era o `localStorage` (limite de ~5 MB), que falhava com texturas. Há salvamento automático a cada 30 s e ao sair do app, além de vários projetos com nome ("Salvar como…"). Projetos antigos são migrados sozinhos.
- **Importação**: importa **todas** as malhas do arquivo (antes vinha só a primeira) e **solda os vértices**. Antes cada triângulo ficava solto e a malha rasgava ao esculpir. Também preserva a cor/metal/rugosidade do material e a textura base do GLB, normaliza a escala de modelos gigantes ou minúsculos e permite desfazer a importação.
- **Pesos automáticos do rig**: a distância vértice→osso era calculada errada (a função alterava os próprios vetores no meio da conta) e os ossos estavam deslocados (dobrar o joelho girava a coxa). Agora cada osso move o segmento que sai da sua junta, como no Blender, e mãos, pés e cabeça têm "ponta".
- **Mover pelo eixo da normal/eixo apontando para a câmera** não arremessa mais os vértices para longe.
- **Exportar OBJ** com vários objetos tinha os índices de UV errados.
- **Desfazer** agora cobre material, keyframes, poses do rig e pintura de pesos.

## Rodar

O app são arquivos estáticos (`index.html`, `js/`, `vendor/`). Três jeitos de abrir:

1. **Pelo conector (recomendado)**: `cd mcp-server && npm install && npm start`. O terminal mostra um endereço do tipo `http://192.168.0.10:8765/?mcp=1&t=…`. Abra esse endereço no celular, na mesma rede Wi-Fi, e o app já conecta ao Claude.
2. **GitHub Pages / qualquer hospedagem estática**: publique a pasta e abra pelo navegador. No celular, use "Adicionar à tela inicial" para instalar.
3. **Local**: `python3 -m http.server` na pasta e abra `http://localhost:8000`.

## Conectar com o Claude

Há duas formas, e dá pra usar as duas.

### 1. Assistente dentro do app (precisa de chave da API)
Na aba **Claude 🔌**, cole uma chave da API da Anthropic (crie em console.anthropic.com). Escolha o modelo (Opus 5.5 é o padrão) e converse: *"crie um guerreiro com cabelo longo e fogo nas mãos"*, *"faça uma cena de neve e renderize"*. O Claude usa as mesmas ferramentas do conector, vê a cena por fotos e pode desfazer. A chave fica só no aparelho e o uso é cobrado na sua conta da Anthropic. Usa o SDK oficial `@anthropic-ai/sdk`, empacotado em `vendor/anthropic-sdk.mjs`.

### 2. Conector MCP (Claude Desktop, Claude Code ou claude.ai)
O servidor em `mcp-server/` liga o Claude ao app aberto no navegador:

```
Claude ──MCP──▶ mcp-server (seu PC) ──WebSocket──▶ MiniBlender (celular ou PC)
```

```bash
cd mcp-server
npm install
npm start          # mostra o endereço para abrir o app
```

**Claude Code:**
```bash
claude mcp add miniblender -- node /caminho/para/Miniblender/mcp-server/server.js
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "miniblender": { "command": "node", "args": ["/caminho/para/Miniblender/mcp-server/server.js"] }
  }
}
```
Quando o Claude Desktop/Code inicia o servidor, peça ao Claude: *"use miniblender_status"*. Ele responde com o endereço para abrir o app no celular.

**claude.ai (conector personalizado):** o servidor também responde em `/mcp` (Streamable HTTP). Exponha a porta com um túnel HTTPS (por exemplo `cloudflared tunnel --url http://localhost:8765`) e adicione um conector personalizado com a URL `https://SEU-TUNEL/mcp?token=SEU_TOKEN`.

**Segurança:** o token é gerado uma vez e fica em `~/.miniblender-mcp.json`. Ele é exigido no `/mcp` e na ponte `/bridge`. Opções: `--port 8765`, `--token SEGREDO`, `--no-stdio`.

**Ferramentas disponíveis (31):** `get_scene`, `view_scene` (foto da cena), `add_primitive`, `create_character`, `select_object`, `transform_object`, `delete_object`, `duplicate_object`, `rename_object`, `set_material`, `set_procedural_texture`, `add_modifier`, `apply_modifiers`, `edit_mesh`, `sculpt_stroke`, `paint_vertices`, `add_light`, `set_world`, `set_view`, `add_camera`, `add_particles` (fogo, raio, chuva, água, skin de energia, tiro…), `add_lawn`, `add_fur`, `physics`, `rig`, `set_pose`, `animate`, `render` (imagem final), `project` (salvar/exportar/desfazer), `run_script` (desligado por padrão) e `miniblender_status`. As definições ficam em `js/tools.js` e servem tanto ao app quanto ao servidor.

## Plugins

Um plugin é um arquivo `.js` que chama `MiniBlender.registerPlugin`. Ele pode criar uma aba e **ferramentas que o Claude também usa**. Instale na aba **Claude 🔌 › Plugins**. O plugin fica salvo no aparelho e carrega sozinho.

```js
MiniBlender.registerPlugin({
  name: 'Meu plugin',
  tab: 'Meu',                       // opcional: cria uma aba
  panel(P, api) {                   // P = painel; use row(), chip(), slider()
    P.append(row(chip('Olá', () => toast('oi'))));
  },
  tools: [{                         // opcional: viram ferramentas do Claude/MCP
    name: 'minha_ferramenta',
    description: 'O que ela faz',
    input_schema: { type: 'object', properties: { n: { type: 'integer' } } },
    run(args, api) { return 'resultado'; }
  }],
  init(api) {}                      // opcional
});
```

Exemplo completo: `plugins/exemplo-escada.js` (gerador de escadas retas e caracol).

API: `MiniBlender.run(nome, args)`, `MiniBlender.on(evento, fn)` (eventos: `rebuild`, `meshChanged`, `select`, `frame`, `tick`, `serialize`, `load`, `beforeRender`…), `MiniBlender.connect(url)`.

## Estrutura

```
index.html            app principal (geometria, edição, escultura, material, UV, nós, animação, rig, render, salvar/importar)
js/tools.js           definições das ferramentas (app + MCP)
js/modifiers.js       pilha de modificadores
js/scene.js           luzes, câmeras, mundo
js/effects.js         partículas com shaders, raio, água, gramado, skin de energia, pelo, física
js/character.js       personagem humano (malha MakeHuman + morphs + textura + rig) e remesh por voxel
assets/               human.bin.gz (malha, UVs, morphs, juntas) e texturas de pele
tools/build_human.py  gera os assets a partir dos dados do MakeHuman
js/api.js             API pública, plugins, ponte MCP
js/claude.js          aba Claude (assistente, conector, plugins)
vendor/               Three.js r128 e SDK da Anthropic (offline)
mcp-server/           servidor MCP + ponte WebSocket + servidor do app
plugins/              plugins de exemplo
sw.js, manifest       PWA (instalar e usar offline)
```

Teste ponta a ponta: com o servidor rodando (`node server.js --no-stdio --token testtoken`), rode `node e2e-test.mjs` em `mcp-server/`. Ele precisa do Playwright. O teste abre o app, chama todas as ferramentas pelo MCP e confere o salvamento.

## Créditos e licenças

- **Corpo humano**: malha base, morphs e texturas de pele do [MakeHuman](http://www.makehumancommunity.org) (MakeHuman Team), cujos assets são distribuídos sob **CC0**. O app usa só os dados (via `tools/build_human.py`), nenhum código do MakeHuman.
- **Three.js** r128 (MIT) e **@anthropic-ai/sdk** (MIT), em `vendor/`.

