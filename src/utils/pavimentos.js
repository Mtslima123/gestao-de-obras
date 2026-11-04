// Regras de nome/ordem de pavimento, compartilhadas entre a Medição Mensal e as Fotos.
// Puro (sem React/Supabase), testável em node.

// Chave de comparação de nome de pavimento: ignora espaço nas pontas ou duplicado e
// maiúscula/minúscula. É o que faz " 1° tipo/puc" (espaço a mais, vindo da tarefa) ser o
// mesmo pavimento que "1° tipo/puc" (cadastro), e " puc" ser o "PUC" cadastrado. Acento
// continua valendo: "térreo" e "Terreo" são cadastros diferentes. Vazio vira "—".
export function chavePavimento(nome) {
  const k = String(nome ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  return k || '—';
}

const naturalCmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });

// Erros de "coluna/função ainda não existe no banco" (migration da ordem dos pavimentos
// que o TI aplica à parte). Os serviços de pavimentos caem na ordem de cadastro (id) no
// primeiro e avisam que depende do TI no segundo.
export const colunaAusente = (error) =>
  !!error && (error.code === 'PGRST204' || error.code === '42703' || /column .* (of .* )?(does not exist|not found)/i.test(error.message || ''));
export const funcaoAusente = (error) =>
  !!error && (error.code === 'PGRST202' || /function .* does not exist/i.test(error.message || ''));

// Botões subir/descer do cadastro de pavimentos: lista nova com o item da posição
// `indice` trocado com o vizinho (delta -1 sobe, +1 desce). Fora dos limites devolve a
// MESMA lista (quem chama compara pra saber se mudou).
export function moverNaLista(lista, indice, delta) {
  const alvo = indice + delta;
  if (indice < 0 || indice >= lista.length || alvo < 0 || alvo >= lista.length) return lista;
  const nova = [...lista];
  [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
  return nova;
}

// Arrastar para mover: lista nova com o item da posição `de` levado para a posição `para`, e os
// demais se acomodando (arrastar para baixo deixa o item depois do alvo, para cima, antes dele). Igual
// de, ou posição fora da lista, devolve a MESMA lista (quem chama compara pra saber se mudou).
export function moverParaIndice(lista, de, para) {
  if (de === para || de < 0 || para < 0 || de >= lista.length || para >= lista.length) return lista;
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item);
  return nova;
}

// ─── Mover vários de uma vez (janela "Ordem dos pavimentos") ─────────────────────────────
// `selecionados` é um Set (ou lista) de nomes. Todas devolvem a MESMA lista quando nada muda
// (quem chama compara pra saber se há algo a gravar) e nunca alteram a lista recebida.
const comoSet = (s) => (s instanceof Set ? s : new Set(s));
const mesmaOrdem = (a, b) => a.length === b.length && a.every((p, i) => p === b[i]);

// Sobe (delta < 0) ou desce (delta > 0) os selecionados uma posição: cada um troca com o vizinho
// não selecionado. Quem já está na ponta não passa dela, e o bloco encostado nela também fica;
// os demais continuam andando. A ordem relativa entre os selecionados nunca muda.
export function moverSelecionados(lista, selecionados, delta) {
  const sel = comoSet(selecionados);
  const nova = [...lista];
  let mudou = false;
  const trocar = (i, j) => { [nova[i], nova[j]] = [nova[j], nova[i]]; mudou = true; };
  if (delta < 0) {
    for (let i = 1; i < nova.length; i += 1) {
      if (sel.has(nova[i]) && !sel.has(nova[i - 1])) trocar(i, i - 1);
    }
  } else {
    for (let i = nova.length - 2; i >= 0; i -= 1) {
      if (sel.has(nova[i]) && !sel.has(nova[i + 1])) trocar(i, i + 1);
    }
  }
  return mudou ? nova : lista;
}

// Arrastar: os selecionados saem de onde estão e caem juntos, como um bloco e na ordem em que
// já estavam, antes do alvo (`depois` falso) ou depois dele (`depois` verdadeiro: arrastar para
// baixo). Soltar sobre um dos próprios selecionados, ou num nome que não está na lista, não faz nada.
export function moverSelecionadosPara(lista, selecionados, nomeAlvo, depois) {
  const sel = comoSet(selecionados);
  if (sel.has(nomeAlvo) || !lista.includes(nomeAlvo)) return lista;
  const grupo = lista.filter(p => sel.has(p));
  if (grupo.length === 0) return lista;
  const resto = lista.filter(p => !sel.has(p));
  const i = resto.indexOf(nomeAlvo) + (depois ? 1 : 0);
  const nova = [...resto.slice(0, i), ...grupo, ...resto.slice(i)];
  return mesmaOrdem(nova, lista) ? lista : nova;
}

// "Ao topo" / "Ao fim": leva os selecionados para uma ponta, juntos e na ordem em que estavam.
export function moverSelecionadosExtremo(lista, selecionados, onde) {
  const sel = comoSet(selecionados);
  const grupo = lista.filter(p => sel.has(p));
  const resto = lista.filter(p => !sel.has(p));
  const nova = onde === 'topo' ? [...grupo, ...resto] : [...resto, ...grupo];
  return mesmaOrdem(nova, lista) ? lista : nova;
}

// Shift + clique: os nomes entre duas linhas, inclusive as duas. Sem a âncora (nunca clicou antes,
// ou ela saiu da lista), vale só a linha clicada; sem a linha clicada, nada.
export function intervaloNaLista(lista, ancora, nome) {
  const fim = lista.indexOf(nome);
  if (fim === -1) return [];
  const inicio = lista.indexOf(ancora);
  if (inicio === -1) return [nome];
  return lista.slice(Math.min(inicio, fim), Math.max(inicio, fim) + 1);
}

// Nome do pavimento duplicado: "X (cópia)", "X (cópia 2)"... sem repetir um nome que já
// existe (mesma regra de comparação do cadastro, ver chavePavimento) e cabendo nos 60
// caracteres do campo.
export function nomeDaCopia(nome, existentes = []) {
  const usados = new Set(existentes.map(chavePavimento));
  const base = String(nome ?? '').replace(/\s+/g, ' ').trim();
  for (let n = 1; ; n += 1) {
    const sufixo = n === 1 ? ' (cópia)' : ` (cópia ${n})`;
    const candidato = base.slice(0, 60 - sufixo.length).trimEnd() + sufixo;
    if (!usados.has(chavePavimento(candidato))) return candidato;
  }
}

// A cópia entra logo abaixo do original (no fim, se o original não estiver na lista).
export function inserirDepois(lista, referencia, novo) {
  const i = lista.indexOf(referencia);
  return i === -1 ? [...lista, novo] : [...lista.slice(0, i + 1), novo, ...lista.slice(i + 1)];
}

// Opções de Pavimento: primeiro os pavimentos cadastrados na obra, na ordem de cadastro
// (`ordemCadastro`, vem da tabela de cadastro ordenada por id); depois os que aparecem em
// `usados` com nome DIFERENTE de qualquer cadastro, em ordem natural ("2" antes de "10");
// "—" (sem pavimento) sempre por último. Nome igual ao de um cadastrado (ver chavePavimento)
// não aparece de novo: prevalece o do cadastro. Devolve só os que aparecem em `usados`.
export function ordenarPavimentos(usados, ordemCadastro = []) {
  const usadas = new Set(usados.map(chavePavimento));
  const vistos = new Set();
  const cadastrados = [];
  ordemCadastro.forEach(p => {
    const k = chavePavimento(p);
    if (k === '—' || vistos.has(k) || !usadas.has(k)) return;
    vistos.add(k);
    cadastrados.push(String(p).replace(/\s+/g, ' ').trim());
  });
  const novos = new Map();
  usados.forEach(p => {
    const k = chavePavimento(p);
    if (k === '—' || vistos.has(k) || novos.has(k)) return;
    novos.set(k, String(p).replace(/\s+/g, ' ').trim());
  });
  const resto = [...novos.values()].sort(naturalCmp);
  return [...cadastrados, ...resto, ...(usadas.has('—') ? ['—'] : [])];
}

// Todos os pavimentos que aparecem nas tarefas do cronograma (a coluna Pavimento da Lista), não só
// os de um mês: é a lista da janela "Ordem dos pavimentos" da Medição, que organiza a ordem uma
// vez para todos os meses. Sem repetir (mesma chave de comparação de chavePavimento), na ordem
// atual (cadastro primeiro, depois os novos em ordem natural) e sem o "sem pavimento".
export function pavimentosDoCronograma(etapas, ordemCadastro = []) {
  return ordenarPavimentos((etapas || []).map(e => e.pavimento), ordemCadastro).filter(p => p !== '—');
}

// Posição de um pavimento na ordem de cadastro: 0, 1, 2... para os cadastrados; os que não
// estão no cadastro vêm depois de todos (mesma posição, desempate fica com quem chama) e
// "sem pavimento" por último.
export function posicaoPavimento(ordemCadastro = []) {
  const pos = new Map();
  ordemCadastro.forEach(p => {
    const k = chavePavimento(p);
    if (k !== '—' && !pos.has(k)) pos.set(k, pos.size);
  });
  const fora = pos.size;
  return (nome) => {
    const k = chavePavimento(nome);
    if (k === '—') return fora + 1;
    return pos.has(k) ? pos.get(k) : fora;
  };
}

// Ordem da galeria de fotos: data (mais recente primeiro, sem data por último), depois
// pavimento na ordem de cadastro, depois a foto mais recente primeiro. Pavimentos fora do
// cadastro ficam depois dos cadastrados, em ordem natural. `id` fecha o desempate, para a
// paginação por posição ser estável entre uma busca e outra.
export function ordenarFotosPorPavimento(fotos, ordemCadastro = []) {
  const pos = posicaoPavimento(ordemCadastro);
  return [...fotos].sort((a, b) => {
    const da = a.data || '';
    const db = b.data || '';
    if (da !== db) {
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? 1 : -1;
    }
    const pa = pos(a.pavimento);
    const pb = pos(b.pavimento);
    if (pa !== pb) return pa - pb;
    if (pa === pos('__fora_do_cadastro__')) {
      const n = naturalCmp(String(a.pavimento ?? '').trim(), String(b.pavimento ?? '').trim());
      if (n !== 0) return n;
    }
    const ca = a.created_at || '';
    const cb = b.created_at || '';
    if (ca !== cb) return ca < cb ? 1 : -1;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  });
}

// Nome do arquivo ao baixar uma foto: "Pavimento - dd-mm-aaaa.ext". Data com hífen porque
// "/" não pode em nome de arquivo; tira também os outros caracteres proibidos no Windows.
// Sem pavimento ou sem data, usa só o que tiver; sem nenhum dos dois, "foto-<id>".
export function nomeArquivoFoto(foto, ext = 'jpg') {
  const pav = String(foto?.pavimento || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(foto?.data || '');
  const data = m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  const base = [pav, data].filter(Boolean).join(' - ') || `foto-${foto?.id ?? ''}`;
  return `${base}.${ext}`;
}

// Garante nomes únicos dentro do .zip: repetidos ganham " (2)", " (3)"... antes da extensão
// (zip com dois arquivos de mesmo nome sobrescreve um com o outro ao extrair).
export function nomesUnicos(nomes) {
  const usados = new Map();
  return nomes.map(nome => {
    const chave = nome.toLowerCase();
    const n = (usados.get(chave) || 0) + 1;
    usados.set(chave, n);
    if (n === 1) return nome;
    const i = nome.lastIndexOf('.');
    return i > 0 ? `${nome.slice(0, i)} (${n})${nome.slice(i)}` : `${nome} (${n})`;
  });
}
