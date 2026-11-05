import React from 'react';
import { Icon } from '../../../components/Icons';
import { NotifPanel } from '../../../components/Modals';
import { notificacoesService, notifBus } from '../../../services/notificacoes.service';
import { logger } from '../../../services/logger';
import {
  CHAVE_STORAGE, decidirChaveDeTeste, montarNavegacao, abaDaBarraAtiva, itemDaGavetaAtivo,
  atalhosLiberados, cabecalhoDaTela,
} from './mobileFullPure';
import './mobileFull.css';

// Casca mobile do Sistema Completo: cabeçalho compacto + barra inferior + gaveta "Mais". Entra no lugar da
// Sidebar e da Topbar do desktop (ver App.jsx) só quando modoMobileCompleto é verdadeiro; o conteúdo das
// telas é o mesmo. Todo o estilo está em mobileFull.css, com prefixo .mfs-* e sobrescritas sob html.mob-full.

// Lê a chave de teste uma única vez, ao abrir o app, e guarda a escolha no aparelho. É lida antes do login
// de propósito: o SSO redireciona e a URL volta sem o parâmetro, então o valor precisa já estar guardado.
export const lerChaveMobileFull = () => {
  let guardado = null;
  try { guardado = localStorage.getItem(CHAVE_STORAGE); } catch { /* storage indisponível */ }
  const { ativa, gravar } = decidirChaveDeTeste({ search: window.location.search, guardado });
  try {
    if (gravar === null) localStorage.removeItem(CHAVE_STORAGE);
    else if (gravar !== undefined) localStorage.setItem(CHAVE_STORAGE, gravar);
  } catch { /* sem storage: vale só nesta carga */ }
  return ativa;
};

// Marca o <html> enquanto a casca está montada. Precisa ser no html (e não numa div do app) porque o Modal
// é renderizado por portal direto no body, e as sobrescritas de .modal/.toast valem para ele também.
// useLayoutEffect: a classe entra antes da primeira pintura, sem piscar o layout do desktop.
const useClasseMobFull = () => {
  React.useLayoutEffect(() => {
    document.documentElement.classList.add('mob-full');
    return () => document.documentElement.classList.remove('mob-full');
  }, []);
};

// Mesma contagem de notificações não lidas da Topbar do desktop. Fica copiada aqui (e não extraída de
// Chrome.jsx) para não mexer em arquivo que o desktop usa.
const useNaoLidas = (painelAberto) => {
  const [naoLidas, setNaoLidas] = React.useState(0);
  const atualizar = React.useCallback(async () => {
    try { const { count } = await notificacoesService.contarNaoLidas(); setNaoLidas(count || 0); }
    catch (err) { setNaoLidas(0); logger.warn('falha ao contar notificacoes nao lidas', { module: 'notificacoes', action: 'contarNaoLidas', err }); }
  }, []);
  // Atualiza ao montar e sempre que o painel fecha (depois de marcar como lida).
  React.useEffect(() => { if (!painelAberto) atualizar(); }, [painelAberto, atualizar]);
  React.useEffect(() => notifBus.subscribe(atualizar), [atualizar]);
  React.useEffect(() => {
    const tick = () => { if (!document.hidden) atualizar(); };
    const id = setInterval(tick, 20000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [atualizar]);
  return { naoLidas, atualizar };
};

// A classe "topbar" é de propósito: Cronograma, Lista, Medição e useCardCongelado medem a altura da
// `.topbar` para posicionar cabeçalhos fixos; sem ela caem num valor padrão de 60px.
const MobileFullHeader = ({ breadcrumb }) => {
  const { titulo, subtitulo, voltar } = cabecalhoDaTela(breadcrumb);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const { naoLidas, atualizar } = useNaoLidas(notifOpen);
  return (
    <header className="topbar mfs-header">
      {voltar ? (
        <button type="button" className="mfs-icone" onClick={voltar} aria-label={`Voltar para ${subtitulo}`}>
          <Icon name="chevron-left" size={22} />
        </button>
      ) : (
        <img className="mfs-marca" src="/assets/soter-mark-white.png" alt="" width="24" height="24" />
      )}
      <div className="mfs-titulos">
        {subtitulo && <div className="mfs-subtitulo">{subtitulo}</div>}
        <div className="mfs-titulo" role="heading" aria-level={1}>{titulo}</div>
      </div>
      <div className="mfs-sino">
        <button type="button" className="mfs-icone" data-notif-trigger onClick={() => setNotifOpen(o => !o)} aria-label="Notificações">
          <Icon name="bell" size={20} />
          {naoLidas > 0 && <span className="mfs-ponto" />}
        </button>
        {notifOpen && <NotifPanel onClose={() => setNotifOpen(false)} onChange={atualizar} />}
      </div>
    </header>
  );
};

const SEM_ACESSO = 'Sem acesso a este módulo. Fale com o administrador.';

const Linha = ({ icone, rotulo, ativo, travado, perigo, semSeta, titulo, onClick }) => (
  <button
    type="button"
    className={'mfs-linha' + (ativo ? ' active' : '') + (travado ? ' locked' : '') + (perigo ? ' danger' : '')}
    aria-current={ativo ? 'page' : undefined}
    aria-disabled={travado || undefined}
    title={travado ? (titulo || SEM_ACESSO) : undefined}
    onClick={travado ? undefined : onClick}
  >
    <span className="mfs-linha-icone"><Icon name={icone} size={19} /></span>
    <span className="mfs-linha-rotulo">{rotulo}</span>
    {!semSeta && <Icon name="chevron-right" size={16} className="mfs-linha-seta" />}
  </button>
);

const MobileFullNav = ({
  view, cronogramaTab, adminTab, userProfile, user, obras = [],
  onNavigate, onCronogramaTabChange, onAdminTabChange, onAbrirFoco, onVoltarInicio, onLogout,
}) => {
  useClasseMobFull();
  const [gavetaAberta, setGavetaAberta] = React.useState(false);
  const [escolhendoObra, setEscolhendoObra] = React.useState(null); // null | 'medicao' | 'fotos'
  const nav = React.useMemo(() => montarNavegacao(userProfile), [userProfile]);
  const abaAtiva = abaDaBarraAtiva({ view, cronogramaTab });
  const itemAtivo = itemDaGavetaAtivo({ view, cronogramaTab, adminTab });
  const atalhos = atalhosLiberados(userProfile);

  const fechar = React.useCallback(() => { setGavetaAberta(false); setEscolhendoObra(null); }, []);

  // Esc fecha a gaveta e a rolagem da página fica travada enquanto ela está aberta (mesmo cuidado do Modal).
  React.useEffect(() => {
    if (!gavetaAberta) return undefined;
    const onEsc = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', onEsc);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onEsc); document.body.style.overflow = anterior; };
  }, [gavetaAberta, fechar]);

  // Navega sempre pelos handlers do App (handleNavigate etc.), assim as chaves nav_* da sessão seguem valendo.
  const ir = (acao) => {
    onNavigate(acao.view);
    if (acao.cronogramaTab) onCronogramaTabChange?.(acao.cronogramaTab);
    if (acao.adminTab) onAdminTabChange?.(acao.adminTab);
    fechar();
  };

  // Medição e Fotos não são copiadas: abrem o modo foco que já existe. Com mais de uma obra, pergunta qual.
  const abrirAtalho = (destino) => {
    if (!obras.length) return;
    if (obras.length === 1) { onAbrirFoco(destino, obras[0]); fechar(); return; }
    setEscolhendoObra(destino);
  };
  const escolherObra = (obra) => { onAbrirFoco(escolhendoObra, obra); fechar(); };

  const nome = userProfile?.nome || user?.email || '—';
  const papel = userProfile?.perfil === 'admin' ? 'Administrador' : 'Usuário';
  const semObra = !obras.length;

  return (
    <>
      <nav className="mfs-nav" aria-label="Navegação principal">
        {nav.barra.map(it => (
          <button
            key={it.id}
            type="button"
            className={'mfs-nav-item' + (abaAtiva === it.id ? ' active' : '') + (it.locked ? ' locked' : '')}
            aria-current={abaAtiva === it.id ? 'page' : undefined}
            aria-disabled={it.locked || undefined}
            title={it.locked ? SEM_ACESSO : undefined}
            onClick={it.locked ? undefined : () => ir(it.acao)}
          >
            <span className="mfs-nav-icone"><Icon name={it.icon} size={21} /></span>
            <span className="mfs-nav-rotulo">{it.label}</span>
          </button>
        ))}
        <button
          type="button"
          className={'mfs-nav-item' + (abaAtiva === 'mais' || gavetaAberta ? ' active' : '')}
          aria-expanded={gavetaAberta}
          aria-haspopup="dialog"
          onClick={() => setGavetaAberta(a => !a)}
        >
          <span className="mfs-nav-icone"><Icon name="dots" size={21} /></span>
          <span className="mfs-nav-rotulo">Mais</span>
        </button>
      </nav>

      {gavetaAberta && (
        <div className="mfs-sheet-backdrop" onClick={(e) => e.target === e.currentTarget && fechar()}>
          <div className="mfs-sheet" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="mfs-sheet-alca" aria-hidden="true" />
            {escolhendoObra ? (
              <div className="mfs-sheet-corpo">
                <button type="button" className="mfs-voltar" onClick={() => setEscolhendoObra(null)}>
                  <Icon name="chevron-left" size={16} />Voltar
                </button>
                <div className="mfs-sheet-titulo">Escolha a obra</div>
                {obras.map(o => (
                  <Linha key={o.id} icone="building" rotulo={o.nome} onClick={() => escolherObra(o)} />
                ))}
              </div>
            ) : (
              <>
                <div className="mfs-usuario">
                  <div className="mfs-avatar">{nome[0]?.toUpperCase() ?? '?'}</div>
                  <div className="mfs-usuario-textos">
                    <div className="mfs-usuario-nome">{nome}</div>
                    <div className="mfs-usuario-papel">{papel}</div>
                  </div>
                  <button type="button" className="mfs-icone mfs-icone-escuro" onClick={fechar} aria-label="Fechar menu">
                    <Icon name="x" size={20} />
                  </button>
                </div>
                <div className="mfs-sheet-corpo">
                  <div className="mfs-secao">Módulos</div>
                  {nav.gaveta.map(it => (
                    <Linha key={it.id} icone={it.icon} rotulo={it.label} ativo={itemAtivo === it.id} travado={it.locked} onClick={() => ir(it.acao)} />
                  ))}
                  {nav.admin.length > 0 && (
                    <>
                      <div className="mfs-secao">Administração</div>
                      {nav.admin.map(it => (
                        <Linha key={it.id} icone={it.id === 'admin-usuarios' ? 'users' : 'shield'} rotulo={it.label} ativo={itemAtivo === it.id} onClick={() => ir(it.acao)} />
                      ))}
                    </>
                  )}
                  <div className="mfs-secao">Atalhos</div>
                  <Linha
                    icone="measure" rotulo="Medição Mensal"
                    travado={!atalhos.medicao || semObra}
                    titulo={semObra ? 'Nenhuma obra disponível.' : undefined}
                    onClick={() => abrirAtalho('medicao')}
                  />
                  <Linha
                    icone="camera" rotulo="Fotos"
                    travado={!atalhos.fotos || semObra}
                    titulo={semObra ? 'Nenhuma obra disponível.' : undefined}
                    onClick={() => abrirAtalho('fotos')}
                  />
                  <div className="mfs-secao">Conta</div>
                  <Linha icone="layers" rotulo="Voltar ao início simplificado" onClick={() => { fechar(); onVoltarInicio(); }} />
                  <Linha icone="log-out" rotulo="Sair" perigo semSeta onClick={() => { fechar(); onLogout(); }} />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

// Envolve as telas do desktop que ainda não têm versão mobile num contêiner com rolagem horizontal contida.
// Com `ativo` falso (desktop, MobileGate, chave desligada) devolve os filhos como estão, sem criar elemento
// nenhum, então o DOM do desktop não muda.
const LegadoMobile = ({ ativo, children }) => (ativo ? <div className="mfs-legado">{children}</div> : <>{children}</>);

// Envolve uma tela já adaptada à casca mobile e dá a ela as classes .mfs-tela e .mfs-tela-<nome>, que o CSS usa
// para ajustar telas que já são cards por CSS (Obras, Físico Financeiro) sem duplicar a lógica delas. Com `ativo`
// falso devolve os filhos como estão, sem elemento nenhum.
const TelaMobile = ({ ativo, nome, children }) => (
  ativo ? <div className={`mfs-tela mfs-tela-${nome}`}>{children}</div> : <>{children}</>
);

export { MobileFullHeader, MobileFullNav, LegadoMobile, TelaMobile };
