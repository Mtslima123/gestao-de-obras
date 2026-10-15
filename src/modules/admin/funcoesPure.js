// Regras do catálogo de "Funções" do usuário (Apontador, Engenheiro...), sem React nem Supabase,
// para teste. Só rótulo: não mexe em permissões.

// Nome como será gravado: sem espaços nas pontas nem repetidos no meio.
export const normNome = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

// Chave de comparação: sem acento, sem caixa. Mais rígida que o índice único do banco (que só
// ignora caixa e espaços das pontas), para barrar já na tela "Engenheiro" x "engenheiró".
export const chaveNome = (s) => normNome(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Já existe outra função com esse nome? `ignorarId` é a função que está sendo renomeada.
export const nomeDuplicado = (funcoes, nome, ignorarId = null) => {
  const k = chaveNome(nome);
  return !!k && funcoes.some((f) => String(f.id) !== String(ignorarId) && chaveNome(f.nome) === k);
};

export const ordenarFuncoes = (funcoes) => [...funcoes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

export const nomeDaFuncao = (funcoes, id) => (id == null ? null : funcoes.find((f) => String(f.id) === String(id))?.nome ?? null);

// Quantos usuários usam cada função: Map(idComoTexto -> quantidade). Usuário sem função não conta.
export const contarPorFuncao = (usuarios) => {
  const m = new Map();
  for (const u of usuarios) {
    if (u.funcao_id == null) continue;
    const k = String(u.funcao_id);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};
