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
