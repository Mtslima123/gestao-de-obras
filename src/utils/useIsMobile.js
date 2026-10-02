import React from 'react';

// Hook compartilhado de detecção de mobile (extraído de MedicaoMensal.jsx, que foi o
// primeiro lugar a precisar trocar de "casca" visual abaixo de um breakpoint).
const MOBILE_BREAKPOINT = 768;

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
  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  );
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange));
  }, [breakpoint]);
  return isMobile;
}
