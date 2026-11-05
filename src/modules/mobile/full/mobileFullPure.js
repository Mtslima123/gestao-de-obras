// Regras puras da casca mobile do Sistema Completo (sem React, sem navegador), para poderem ser testadas.
// A casca em si fica em MobileFullChrome.jsx; aqui só decisões: quando ligar, o que o menu mostra e o que o
// cabeçalho escreve. Nada daqui altera o desktop nem a tela mobile simplificada.
import { MODULOS, MODULOS_TOPO } from '../../../config/modulos';
import { moduloLiberado, podeVerAba, isAdmin } from '../../../utils/permissions';

// Chave de teste: enquanto o sistema completo mobile não estiver pronto, ele só liga para quem pediu.
// `?mobile=novo` liga e fica guardado no aparelho; `?mobile=antigo` desliga. Sem o parâmetro vale o guardado.
export const CHAVE_STORAGE = 'mob_full';

export const decidirChaveDeTeste = ({ search = '', guardado = null } = {}) => {
  let param = null;
  try { param = new URLSearchParams(search).get('mobile'); } catch { param = null; }
  if (param === 'novo') return { ativa: true, gravar: '1' };
  if (param === 'antigo') return { ativa: false, gravar: null }; // null = apagar o valor guardado
  return { ativa: guardado === '1', gravar: undefined };         // undefined = não mexe no que está guardado
};

// A casca nova só vale no celular (useIsMobile), depois de "Acessar sistema completo" e fora do modo foco
// (Medição/Fotos). Tablet em retrato e desktop seguem no layout de hoje.
export const modoMobileCompleto = ({ chaveAtiva, isMobile, gateLiberado, mobileFocus }) =>
  !!chaveAtiva && !!isMobile && !!gateLiberado && !mobileFocus;

// Telas (views do App) que já têm apresentação mobile própria. As demais continuam sendo a tela do desktop
// dentro do contêiner de rolagem (LegadoMobile). Ao adaptar uma tela nova, incluir a view aqui.
// O Cronograma conta como adaptado porque ele mesmo contém (LegadoMobile) as abas que ainda são do desktop; só a
// aba Orç. × Cronograma, que é outra tela dentro da mesma view, ainda precisa do contêiner de fora.
export const TELAS_ADAPTADAS = ['dashboard', 'obras', 'fisico-financeiro', 'cronograma'];
export const telaJaAdaptada = (view, cronogramaTab) => (
  view === 'cronograma' ? cronogramaTab !== 'orc-x-cron' : TELAS_ADAPTADAS.includes(view)
);

// Barra inferior: os três módulos mais usados + "Mais" (gaveta com o resto). Os ids vêm de config/modulos.
export const DESTINOS_DA_BARRA = ['dashboard', 'obras', 'cronograma'];

// Monta o que a casca mostra, sempre a partir da fonte única (MODULOS) e das permissões:
// módulo sem acesso aparece travado, como na Sidebar do desktop, nunca some.
export const montarNavegacao = (userProfile) => {
  const item = (m, acao) => ({
    id: m.id, label: m.label, icon: m.icon, acao,
    locked: !moduloLiberado(userProfile, m.id),
  });
  // Cronogramas abre sempre no Gantt/Lista (aba 'gantt'), como o sub-item "Cronograma" da Sidebar do desktop:
  // sem isso, quem estivesse em Orç. × Cronograma tocava em Cronogramas e continuava na mesma tela.
  const topo = MODULOS_TOPO.map(m => item(m, m.id === 'cronograma' ? { view: m.id, cronogramaTab: 'gantt' } : { view: m.id }));
  const barra = DESTINOS_DA_BARRA.map(id => topo.find(i => i.id === id)).filter(Boolean);
  const gaveta = topo.filter(i => !DESTINOS_DA_BARRA.includes(i.id));
  // Sub-item de módulo (Orç. × Cronograma): entra logo depois do pai quando o pai está na gaveta; como
  // Cronogramas fica na barra inferior, hoje ele cai no fim da lista de módulos.
  MODULOS.filter(m => m.subDe).forEach(sub => {
    const pos = gaveta.findIndex(i => i.id === sub.subDe);
    const novo = item(sub, { view: sub.subDe, cronogramaTab: sub.id });
    if (pos === -1) gaveta.push(novo); else gaveta.splice(pos + 1, 0, novo);
  });
  const admin = isAdmin(userProfile)
    ? [
        { id: 'admin-usuarios',  label: 'Usuários',             acao: { view: 'admin', adminTab: 'usuarios' } },
        { id: 'admin-auditoria', label: 'Auditoria do Sistema', acao: { view: 'admin', adminTab: 'auditoria' } },
      ]
    : [];
  return { barra, gaveta, admin };
};

// Qual botão da barra inferior fica marcado. Tudo que não está na barra (Orçamentos, Físico Financeiro,
// Mão de Obra, Administração e o sub-item Orç. × Cronograma) marca "Mais".
export const abaDaBarraAtiva = ({ view, cronogramaTab }) => {
  if (view === 'dashboard') return 'dashboard';
  if (view === 'obras' || view === 'obra-detail') return 'obras';
  if (view === 'cronograma') return cronogramaTab === 'orc-x-cron' ? 'mais' : 'cronograma';
  return 'mais';
};

// Qual linha da gaveta fica marcada (mesma ideia, mas por item).
export const itemDaGavetaAtivo = ({ view, cronogramaTab, adminTab }) => {
  if (view === 'orcamentos') return 'orcamentos';
  if (view === 'fisico-financeiro' || view === 'fisico-financeiro-detail') return 'fisico-financeiro';
  if (view === 'mao-de-obra') return 'mao-de-obra';
  if (view === 'cronograma' && cronogramaTab === 'orc-x-cron') return 'orc-x-cron';
  if (view === 'admin') return adminTab === 'auditoria' ? 'admin-auditoria' : 'admin-usuarios';
  return null;
};

// Atalhos para o modo foco já existente (mesmas regras do MobileGate): a Medição precisa do módulo e da aba
// "medicao" do Cronograma, as Fotos do módulo e da aba "fotos" de Obras.
export const atalhosLiberados = (userProfile) => ({
  medicao: moduloLiberado(userProfile, 'cronograma') && podeVerAba(userProfile, 'cronograma', 'medicao'),
  fotos:   moduloLiberado(userProfile, 'obras') && podeVerAba(userProfile, 'obras', 'fotos'),
});

// Cabeçalho compacto a partir do mesmo breadcrumb da Topbar do desktop: título = tela atual; nas telas de
// detalhe (3 níveis ou mais) o pai vira o subtítulo e o botão voltar. Em tela de topo não há voltar,
// quem navega é a barra inferior.
export const cabecalhoDaTela = (breadcrumb) => {
  const lista = (breadcrumb || []).filter(c => c && c.label);
  const atual = lista[lista.length - 1];
  if (!atual) return { titulo: '', subtitulo: null, voltar: null };
  if (lista.length < 3) return { titulo: atual.label, subtitulo: null, voltar: null };
  const pai = lista[lista.length - 2];
  return {
    titulo: atual.label,
    subtitulo: pai.label,
    voltar: typeof pai.onClick === 'function' ? pai.onClick : null,
  };
};

// Tela para onde voltar quando se sai do modo foco aberto pela gaveta: a de antes. Telas de detalhe
// precisam da obra selecionada, que a navegação limpa, então voltam para a lista.
export const telaDeRetornoDoFoco = (view) => {
  if (view === 'obra-detail') return 'obras';
  if (view === 'fisico-financeiro-detail') return 'fisico-financeiro';
  return view || 'dashboard';
};
