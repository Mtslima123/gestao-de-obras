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
