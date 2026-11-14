import React from 'react';
import { Icon } from '../../../../components/Icons';
import { rotuloObra } from '../../../maoDeObra/efetivo/efetivoStore';
import { rotuloMes } from './maoDeObraMobilePure';

// Cabeçalho da Mão de Obra no celular: obra, período e as abas em chips (as mesmas abas liberadas do desktop). Devolve
// um fragmento de propósito: as abas são `position: sticky` e só prendem sob o cabeçalho da casca se forem filhas
// diretas da tela inteira (um sticky não sai do bloco do pai).
// No Painel (todas as obras, com o próprio seletor de mês) obra e período não aparecem, como no desktop.
const MaoDeObraCabecalhoMobile = ({
  mostrarObraEPeriodo = true, obras = [], obraId = '', onTrocarObra,
  listaPeriodo = [], mesAbs = '', onMes, carregado = false, semPeriodoTexto = 'Sem períodos',
  abas = [], abaAtual, onAba, onGerenciarMeses,
}) => (
  <>
    {mostrarObraEPeriodo && (
      <div className="mfs-mo-topo">
        <label className="mfs-mo-campo"><span>Obra</span>
          <select className="input mfs-select" value={obraId} onChange={(e) => onTrocarObra?.(e.target.value)}>
            {obras.map((o) => <option key={o.id} value={o.id}>{rotuloObra(o)}</option>)}
          </select>
        </label>
        <div className="mfs-mo-periodo">
          <label className="mfs-mo-campo"><span>Período</span>
            <select className="input mfs-select" value={mesAbs} disabled={!listaPeriodo.length} onChange={(e) => onMes?.(+e.target.value)}>
              {carregado && !listaPeriodo.length && <option value="">{semPeriodoTexto}</option>}
              {listaPeriodo.map((m) => <option key={m.abs} value={m.abs}>{rotuloMes(m)}</option>)}
            </select>
          </label>
          {onGerenciarMeses && (
            <button type="button" className="btn mfs-mo-meses" onClick={onGerenciarMeses}>
              <Icon name="calendar" size={16} stroke={2.2} />Meses
            </button>
          )}
        </div>
      </div>
    )}
    <div className="mfs-abas" role="tablist" aria-label="Seções da Mão de Obra">
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={abaAtual === a.id} className={'mfs-aba' + (abaAtual === a.id ? ' active' : '')} onClick={() => onAba?.(a.id)}>
          {a.label}
        </button>
      ))}
    </div>
  </>
);

export { MaoDeObraCabecalhoMobile };
