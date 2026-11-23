// Posição da tela do Cronograma ao trocar de aba (Lista, Gantt, Medição Mensal).
//
// Cada aba é desmontada ao sair (só a ativa existe), então a rolagem e a seleção sumiam e a tela voltava
// ao início. Aqui a posição fica num objeto guardado acima das abas: CronogramaFull o segura numa ref, mas ele
// vem de cronogramaCache (`_posicaoTela`), na memória do módulo JavaScript. Assim sobrevive à troca de aba e
// também à troca de MÓDULO (que desmonta o CronogramaFull inteiro), e some sozinho ao recarregar a página
// (F5, "Atualizar" da PWA), de propósito.
//
// Duas fontes, porque o navegador só dá a posição certa em momentos diferentes:
//  - rolagem da PÁGINA (pageY): na troca de aba, gravada por CronogramaFull no clique da aba, ANTES de
//    trocar. Ler no desmonte da aba não serve: o mesmo commit já tirou os cartões de indicador da Medição e
//    o navegador encurtou a página, então o scrollY lido ali viria menor que o que a pessoa deixou. Na saída
//    do módulo, é o cleanup de layout do próprio CronogramaFull que grava (roda antes de o DOM dele sair).
//  - rolagem INTERNA do contêiner da tela (top/left) e `extra` (seleção): gravadas aqui, no desmonte. O
//    efeito de layout roda antes de o React tirar o DOM, então o contêiner ainda tem a posição certa.
import React from 'react';

const TENTATIVAS = 30;   // 30 x 50 ms: tempo máximo esperando o conteúdo crescer até a posição guardada
const INTERVALO_MS = 50;

// A posição só vale para a mesma obra: trocar de obra começa do início.
export function lerPosicao(memoria, chave, obraId) {
  const p = memoria && memoria[chave];
  return p && obraId && p.obraId === obraId ? p : null;
}

// Junta ao que já está guardado (a página entra num momento, a rolagem interna em outro). Obra diferente
// da guardada descarta o antigo, para não misturar a posição de uma obra com a de outra.
export function gravarPosicao(memoria, chave, obraId, parte) {
  if (!memoria || !chave || !obraId) return;
  const atual = memoria[chave] && memoria[chave].obraId === obraId ? memoria[chave] : {};
  memoria[chave] = { ...atual, ...parte, obraId };
}

// O destino só é alcançável quando o conteúdo já cresceu o bastante (a Medição busca os dados antes de
// desenhar as linhas). Antes disso o navegador cortaria a rolagem em 0 e a posição guardada se perderia.
export function alcancaPosicao({ scrollHeight, clientHeight, scrollWidth, clientWidth }, { top = 0, left = 0 }) {
  return scrollHeight - clientHeight >= top - 1 && scrollWidth - clientWidth >= left - 1;
}

// `elementoRef`: contêiner rolável da tela. `coletarExtra`: devolve o que mais guardar (seleção), chamado só
// ao sair. `pular`: não restaura (a tela abriu com um pedido de foco numa tarefa, que manda na rolagem).
// Devolve `salva`, a posição lida na montagem (ou null), para a tela usar em estado inicial.
export function usePosicaoDaTela({ memoriaRef, chave, obraId, elementoRef, coletarExtra, pular = false }) {
  // Lida UMA vez, na montagem: a gravação ao sair troca o objeto guardado.
  const lidaRef = React.useRef(undefined);
  if (lidaRef.current === undefined) lidaRef.current = lerPosicao(memoriaRef?.current, chave, obraId);
  const salva = pular ? null : lidaRef.current;
  // Valores mais recentes para o efeito de saída (ele nasce na montagem e não vê props novas).
  const obraIdRef = React.useRef(obraId); obraIdRef.current = obraId;
  const extraRef = React.useRef(coletarExtra); extraRef.current = coletarExtra;

  React.useLayoutEffect(() => {
    let timer = 0;
    let parou = false;
    // A pessoa mexeu na tela: não disputa a rolagem com ela.
    const parar = () => { parou = true; clearTimeout(timer); };
    const EVENTOS = ['wheel', 'touchstart', 'keydown', 'mousedown'];
    EVENTOS.forEach(ev => window.addEventListener(ev, parar, { capture: true, passive: true }));

    const pageY = salva?.pageY || 0;
    const top = salva?.top || 0;
    const left = salva?.left || 0;
    if (salva && (pageY || top || left)) {
      let tentativa = 0;
      const tentar = () => {
        if (parou) return;
        const el = elementoRef.current;
        const doc = document.documentElement;
        if (pageY && Math.abs(window.scrollY - pageY) > 1) window.scrollTo(0, pageY);
        if (el) {
          if (el.scrollTop !== top) el.scrollTop = top;
          if (el.scrollLeft !== left) el.scrollLeft = left;
        }
        const paginaOk = !pageY || doc.scrollHeight - window.innerHeight >= pageY - 1;
        const internoOk = !el || alcancaPosicao(el, { top, left });
        // Sem o contêiner ainda (Medição carregando) também espera: ele aparece nas tentativas seguintes.
        if ((paginaOk && internoOk && el) || ++tentativa >= TENTATIVAS) return;
        timer = setTimeout(tentar, INTERVALO_MS);
      };
      tentar();
    }

    return () => {
      parar();
      EVENTOS.forEach(ev => window.removeEventListener(ev, parar, { capture: true }));
      const el = elementoRef.current;
      const parte = {};
      // Sem o contêiner (tela ainda carregando ao sair) mantém a rolagem que já estava guardada.
      if (el) { parte.top = el.scrollTop; parte.left = el.scrollLeft; }
      const extra = extraRef.current?.();
      if (extra !== undefined) parte.extra = extra;
      gravarPosicao(memoriaRef?.current, chave, obraIdRef.current, parte);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { salva };
}
