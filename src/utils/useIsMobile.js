import React from 'react';

// Hook compartilhado de detecção de mobile (extraído de MedicaoMensal.jsx, que foi o
// primeiro lugar a precisar trocar de "casca" visual abaixo de um breakpoint).
const MOBILE_BREAKPOINT = 768;

// Regra do "é celular?" sem tocar em window, para testar. Só a largura da janela não basta:
// com o celular deitado (câmera das Fotos) ou com o Chrome em "Versão para computador" a janela
// passa de 768px, e o modo foco caía na tabela clássica ("aparência de site"). O que não muda
// nesses casos é a tela física pequena com o toque como entrada principal. Notebook com mouse
// (pointer fine) e tablet grande (menor lado acima do limite) continuam como estavam.
export function ehLayoutMobile({ largura, toque, menorLadoTela, limite = MOBILE_BREAKPOINT }) {
  if (largura <= limite) return true;
  return !!toque && Number.isFinite(menorLadoTela) && menorLadoTela > 0 && menorLadoTela <= limite;
}

// "Versão para computador" do Chrome do celular: o navegador se apresenta como Linux de mesa (sem
// Android) e abre a página numa janela larga, mas a tela continua pequena e de toque. Tablet e
// celular normais trazem "Android" no user agent, então não entram aqui.
export function ehSiteDeComputadorNoToque({ userAgent, largura, toque, menorLadoTela, limite = MOBILE_BREAKPOINT }) {
  const ua = String(userAgent || '');
  if (!/Chrome\//.test(ua) || !/Linux/.test(ua) || /Android|iPhone|iPad|CrOS/.test(ua)) return false;
  return !!toque && largura > limite
    && Number.isFinite(menorLadoTela) && menorLadoTela > 0 && menorLadoTela <= limite;
}

// Leitura do ambiente atual (navegador). Fica à parte para as funções acima não dependerem de window.
export function lerAmbienteDeTela() {
  if (typeof window === 'undefined') return { largura: Infinity, toque: false, menorLadoTela: NaN, userAgent: '' };
  const s = window.screen;
  return {
    largura: window.innerWidth,
    toque: !!window.matchMedia?.('(pointer: coarse)').matches,
    menorLadoTela: s ? Math.min(s.width, s.height) : NaN,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
}

// Aparelho cuja entrada principal é o toque (celular, tablet). `pointer: coarse` olha o
// ponteiro PRIMÁRIO: notebook com tela touch e mouse/touchpad continua "fine", então
// não cai aqui. Usado pra mostrar os atalhos mobile (MobileGate) também no tablet.
export function useIsTouchDevice() {
  const query = '(pointer: coarse)';
  const [isTouch, setIsTouch] = React.useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
  );
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsTouch(mq.matches);
    onChange();
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange));
  }, []);
  return isTouch;
}

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const calcular = () => typeof window !== 'undefined' && ehLayoutMobile({ ...lerAmbienteDeTela(), limite: breakpoint });
  const [isMobile, setIsMobile] = React.useState(calcular);
  React.useEffect(() => {
    // resize cobre girar o aparelho; o matchMedia de largura sozinho só avisa ao cruzar o
    // limite e não olha a tela física. O setState com o mesmo valor não renderiza de novo.
    const atualizar = () => setIsMobile(calcular());
    atualizar();
    window.addEventListener('resize', atualizar);
    window.addEventListener('orientationchange', atualizar);
    return () => {
      window.removeEventListener('resize', atualizar);
      window.removeEventListener('orientationchange', atualizar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakpoint]);
  return isMobile;
}
