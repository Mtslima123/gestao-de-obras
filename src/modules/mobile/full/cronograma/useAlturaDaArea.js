import React from 'react';

// Altura que uma área rolável deve ter para ocupar o que sobra da tela: do topo dela até a barra inferior, menos uma
// reserva (por exemplo uma legenda logo abaixo). Assim a página não rola junto com a área. O rodapé reservado é o
// padding inferior real do .content (barra + área segura do aparelho). Devolve [ref, altura, medir]; o ref vai no
// elemento que marca o topo da área. No celular deitado o piso é menor, porque a conta natural dá quase nada.
export const useAlturaDaArea = ({ reserva = 0, minima = 260, minimaPaisagem = 200 } = {}) => {
  const areaRef = React.useRef(null);
  const [altura, setAltura] = React.useState(420);
  const medir = React.useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    const topo = area.getBoundingClientRect().top + window.scrollY;
    const conteudo = area.closest('.content');
    const rodape = conteudo ? (parseFloat(getComputedStyle(conteudo).paddingBottom) || 76) : 76;
    const piso = window.innerHeight <= 500 ? minimaPaisagem : minima;
    setAltura(Math.max(piso, Math.round(window.innerHeight - topo - rodape - reserva)));
  }, [reserva, minima, minimaPaisagem]);
  React.useLayoutEffect(() => {
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('orientationchange', medir);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('orientationchange', medir);
    };
  }, [medir]);
  return [areaRef, altura, medir];
};
