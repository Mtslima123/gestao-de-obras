import React from 'react';
import { PALETA_ANOTACAO, lerAnotacao, escreverAnotacao, textoPuroDaAnotacao } from './medicaoMensalPure';

// Editor da anotação da medição: campo de texto editável do navegador (contenteditable) com uma barra de
// negrito e cor. Fica separado do MedicaoMensal.jsx porque tem lógica própria de seleção e leitura do DOM.
//
// Não é controlado: o campo é montado uma vez a partir de `valor` e, a cada digitação, `onChange` recebe
// o texto no formato gravado (ver lerAnotacao/escreverAnotacao). Nada que vem do banco entra como HTML: o
// campo é montado só com nós de texto, e o que o navegador deixa lá dentro (negrito e cor aplicados pela
// barra, colagem etc.) é lido de volta por lerCampo, que só guarda negrito e as cores da paleta.

const CORES = new Map(PALETA_ANOTACAO.filter(c => c.hex).map(c => [c.hex, c.hex]));

// Cor em qualquer formato que o navegador devolva (#rgb, #rrggbb, rgb(...)) -> hex da paleta, ou null
// (fora da paleta = cor padrão do campo).
function corDaPaleta(css) {
  const s = String(css || '').trim().toLowerCase();
  let hex = null;
  let m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) hex = `#${m[1]}`;
  else if ((m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s))) hex = `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  else if ((m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s))) {
    hex = `#${[m[1], m[2], m[3]].map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`;
  }
  return hex ? (CORES.get(hex.toUpperCase()) ?? null) : null;
}

// Hex #rrggbb de qualquer cor do navegador (para pintar com a "cor padrão" do campo).
function paraHex(css) {
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(String(css || '').trim().toLowerCase());
  return m ? `#${[m[1], m[2], m[3]].map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}` : '#000000';
}

const BLOCOS = new Set(['DIV', 'P', 'LI', 'UL', 'OL']);

// Formato de um elemento do campo, herdando o do pai: negrito por <b>/<strong> ou font-weight, e cor por
// style.color ou <font color>. Cor que não é da paleta vale como "padrão" (null) e anula a herdada.
function formatoDe(el, herdado) {
  let negrito = herdado.negrito || el.nodeName === 'B' || el.nodeName === 'STRONG';
  let cor = herdado.cor;
  const peso = el.style?.fontWeight;
  if (peso) negrito = peso === 'bold' || peso === 'bolder' || Number(peso) >= 600;
  if (el.style?.color) cor = corDaPaleta(el.style.color);
  if (el.nodeName === 'FONT' && el.getAttribute('color')) cor = corDaPaleta(el.getAttribute('color'));
  return { negrito, cor };
}

// Campo -> parágrafos de trechos { texto, negrito, cor }. Cada <div>/<p> é uma linha; <br> também quebra,
// menos o que fica sozinho no fim de um bloco (é só o marcador que o navegador põe em linha vazia).
export function lerCampo(raiz) {
  const paras = [];
  let atual = [];
  let aberta = false; // a linha em curso já começou (mesmo vazia)
  const fechar = () => { paras.push(atual); atual = []; aberta = false; };
  const visitar = (no, formato) => {
    if (no.nodeType === 3) {
      const texto = no.nodeValue.replace(/ /g, ' ').replace(/[​﻿]/g, '');
      if (texto) { atual.push({ texto, negrito: formato.negrito, cor: formato.cor }); aberta = true; }
      return;
    }
    if (no.nodeType !== 1) return;
    if (no.nodeName === 'BR') {
      const fimDeBloco = !no.nextSibling && (no.parentNode === raiz || BLOCOS.has(no.parentNode.nodeName));
      if (fimDeBloco) aberta = true; else fechar();
      return;
    }
    const bloco = BLOCOS.has(no.nodeName);
    if (bloco) { if (aberta || atual.length) fechar(); aberta = true; }
    const novo = formatoDe(no, formato);
    no.childNodes.forEach(filho => visitar(filho, novo));
    if (bloco && (aberta || atual.length)) fechar();
  };
  raiz.childNodes.forEach(no => visitar(no, { negrito: false, cor: null }));
  if (aberta || atual.length) fechar();
  return paras;
}

// Monta o campo a partir do texto gravado: uma <div> por linha, trechos em <b> e <span style="color">,
// sempre por nós de texto (nunca innerHTML).
function montarCampo(raiz, valor) {
  raiz.textContent = '';
  lerAnotacao(valor).forEach(p => {
    const linha = document.createElement('div');
    if (!p.length) linha.appendChild(document.createElement('br'));
    p.forEach(t => {
      let no = document.createTextNode(t.texto);
      if (t.cor) { const s = document.createElement('span'); s.style.color = t.cor; s.appendChild(no); no = s; }
      if (t.negrito) { const b = document.createElement('b'); b.appendChild(no); no = b; }
      linha.appendChild(no);
    });
    raiz.appendChild(linha);
  });
}

export function EditorAnotacao({ valor, onChange, somenteLeitura = false, desabilitado = false, autoFocus = false, placeholder = '', rotulo = 'Texto' }) {
  const campoRef = React.useRef(null);
  const editavel = !somenteLeitura && !desabilitado;
  const [vazio, setVazio] = React.useState(() => !textoPuroDaAnotacao(valor));
  const [negritoAtivo, setNegritoAtivo] = React.useState(false);
  const [corAtiva, setCorAtiva] = React.useState(null);

  // Monta o campo uma vez só: depois disso o navegador é quem mexe no conteúdo (React não gerencia os filhos).
  React.useLayoutEffect(() => {
    const campo = campoRef.current;
    montarCampo(campo, valor);
    if (autoFocus && !somenteLeitura) {
      campo.focus();
      const faixa = document.createRange();
      faixa.selectNodeContents(campo);
      faixa.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(faixa);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A barra mostra o formato de onde está o cursor (ou a seleção).
  React.useEffect(() => {
    if (!editavel) return undefined;
    const atualizar = () => {
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode || !campoRef.current?.contains(sel.anchorNode)) return;
      try {
        setNegritoAtivo(document.queryCommandState('bold'));
        setCorAtiva(corDaPaleta(document.queryCommandValue('foreColor')));
      } catch { /* navegador sem queryCommand: a barra só não destaca o botão */ }
    };
    document.addEventListener('selectionchange', atualizar);
    return () => document.removeEventListener('selectionchange', atualizar);
  }, [editavel]);

  const emitir = () => {
    const paras = lerCampo(campoRef.current);
    setVazio(!paras.some(p => p.some(t => t.texto)));
    onChange?.(escreverAnotacao(paras));
  };

  // Comandos da barra. O botão não pode roubar o foco do campo (onMouseDown com preventDefault), senão a
  // seleção se perde e o teclado do celular fecha. document.execCommand é antigo, mas é o que todos os
  // navegadores ainda fazem com contenteditable, já com desfazer e refazer.
  const comando = (nome, valorCmd) => {
    const campo = campoRef.current;
    if (!campo || !editavel) return;
    if (document.activeElement !== campo) campo.focus();
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(nome, false, valorCmd);
    } catch { /* ignora: nada muda */ }
    emitir();
    try {
      setNegritoAtivo(document.queryCommandState('bold'));
      setCorAtiva(corDaPaleta(document.queryCommandValue('foreColor')));
    } catch { /* idem */ }
  };
  const aplicarCor = (hex) => comando('foreColor', hex || paraHex(getComputedStyle(campoRef.current).color));
  const segurarFoco = (ev) => ev.preventDefault();

  return (
    <div className="rt-wrap">
      {editavel && (
        <div className="rt-barra" role="toolbar" aria-label="Formatação do texto">
          <button type="button" className={`rt-btn${negritoAtivo ? ' on' : ''}`} aria-pressed={negritoAtivo}
            aria-label="Negrito" title="Negrito (Ctrl+B)" onMouseDown={segurarFoco} onClick={() => comando('bold')}>
            <b>N</b>
          </button>
          <span className="rt-sep" aria-hidden="true" />
          {PALETA_ANOTACAO.map(c => (
            <button key={c.id} type="button" className={`rt-cor${corAtiva === c.hex ? ' on' : ''}${c.hex ? '' : ' padrao'}`}
              style={c.hex ? { '--rt-cor': c.hex } : undefined} aria-pressed={corAtiva === c.hex}
              aria-label={`Cor do texto: ${c.nome}`} title={c.nome} onMouseDown={segurarFoco} onClick={() => aplicarCor(c.hex)} />
          ))}
        </div>
      )}
      <div
        ref={campoRef}
        className={`rt-campo${editavel ? '' : ' so-leitura'}`}
        contentEditable={editavel}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={rotulo}
        aria-readonly={!editavel}
        spellCheck
        data-placeholder={placeholder}
        data-vazio={vazio ? '1' : undefined}
        onInput={emitir}
        // Colar entra sempre como texto simples: sem trazer fonte, cor ou HTML de fora.
        onPaste={ev => {
          ev.preventDefault();
          const texto = ev.clipboardData?.getData('text/plain') || '';
          if (texto) document.execCommand('insertText', false, texto);
        }}
        onDrop={ev => ev.preventDefault()}
        // Itálico e sublinhado não existem aqui: sem o atalho, o texto não ficaria "formatado" só na tela.
        onKeyDown={ev => { if ((ev.ctrlKey || ev.metaKey) && ['i', 'u'].includes(ev.key.toLowerCase())) ev.preventDefault(); }}
      />
    </div>
  );
}
