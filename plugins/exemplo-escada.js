/* Plugin de exemplo do MiniBlender: gerador de escadas.
   Mostra como criar uma aba nova e uma ferramenta que o Claude também pode usar.
   Instale pela aba "Claude 🔌" › Plugins › Exemplo (ou "Instalar plugin (.js)"). */
MiniBlender.registerPlugin({
  name: 'Escadas',
  tab: 'Escadas',
  // Aba própria: P é o painel, api é o MiniBlender.
  panel(P, api) {
    const st = this.state || (this.state = { steps: 8, width: 1.2, rise: 0.18, run: 0.28, spiral: false });
    P.append(slider('Degraus', 2, 40, 1, st.steps, v => st.steps = v));
    P.append(slider('Largura', 0.3, 4, 0.05, st.width, v => st.width = v));
    P.append(slider('Altura do degrau', 0.05, 0.4, 0.01, st.rise, v => st.rise = v));
    P.append(slider('Profundidade', 0.1, 0.6, 0.01, st.run, v => st.run = v));
    P.append(row(chip('Caracol', () => { st.spiral = !st.spiral; renderPanel(); }, st.spiral, 'cy'),
      chip('Criar escada', () => api.run('make_stairs', st), false, 'act')));
  },
  // Ferramentas: aparecem para o assistente Claude e para o conector MCP.
  tools: [{
    name: 'make_stairs',
    description: 'Cria uma escada reta ou caracol como um único objeto.',
    input_schema: { type: 'object', properties: { steps: { type: 'integer' }, width: { type: 'number' }, rise: { type: 'number' }, run: { type: 'number' }, spiral: { type: 'boolean' } } },
    run(a) {
      const n = a.steps || 8, w = a.width || 1.2, ri = a.rise || 0.18, ru = a.run || 0.28, em = { pos: [], col: [], faces: [] };
      for (let i = 0; i < n; i++) {
        const box = cubeGrid(1, p => p), o = em.pos.length / 3, ang = a.spiral ? i * 0.4 : 0;
        for (let k = 0; k < box.pos.length; k += 3) {
          let x = box.pos[k] * w / 2, y = (box.pos[k + 1] + 1) / 2 * ri * (i + 1), z = box.pos[k + 2] * ru / 2 + (a.spiral ? 0 : i * ru);
          if (a.spiral) { x += w / 2 + 0.15; const c = Math.cos(ang), s = Math.sin(ang); [x, z] = [x * c - z * s, x * s + z * c]; }
          em.pos.push(x, y, z); em.col.push(1, 1, 1);
        }
        box.faces.forEach(f => em.faces.push(f.map(v => v + o)));
      }
      const ob = createObject('Escada', em, { flat: true });
      ob.params.color = '#b08a5a'; applyMaterial(ob); selectObj(ob);
      push(() => removeObj(ob, true), () => { scene.add(ob.mesh); S.objs.push(ob); selectObj(ob); });
      return 'Escada criada com ' + n + ' degraus (id ' + ob.id + ')';
    }
  }]
});
