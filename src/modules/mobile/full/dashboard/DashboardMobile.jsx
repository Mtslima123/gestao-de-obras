import React from 'react';
import { Icon } from '../../../../components/Icons';
import { AppData } from '../../../../utils/data';
import { friendlyError } from '../../../../utils/friendlyError';
import { isNetworkError } from '../../../../utils/connectivity';
import { OfflineFallback } from '../../../../components/OfflineFallback';
import { mesCurto, formatBRL, formatNum } from '../../../../utils/formatters';
import { computeKPIs } from '../../../fisicoFinanceiro/fisicoFinanceiroPure';
import { CurvaSObra } from '../../../dashboard/CurvaSObra';
import { useCarteiraDashboard } from './useCarteiraDashboard';
import {
  obrasAtivasDe, ordenarPorTermino, escolherObraFF, resumoFisicoFinanceiro, indicadoresFF, corCss,
} from './dashboardMobilePure';

const { brl } = AppData;

// Dashboard Executivo na casca mobile. Mesmos dados e mesmas contas do desktop, em coluna única:
// totais da carteira, Físico Financeiro da obra escolhida, Curva S e um cartão por obra no lugar da tabela
// de 6 colunas. Sem Dashboard.jsx no meio: o estilo dele é inline e não dá para reorganizar por CSS.
const DashboardMobile = ({ obras = [] }) => {
  const obrasAtivas = obrasAtivasDe(obras);
  const [obraFiltro, setObraFiltro] = React.useState(null);
  const {
    loading, erro, vazio, porObra = [], curvaPorObra = {}, orcamentoTotal = 0,
    fechamentosPorObra = {}, mesFechamentoPorObra = {}, tentarDeNovo,
  } = useCarteiraDashboard(obrasAtivas);

  const areaTotal = porObra.reduce((s, o) => s + (o.area || 0), 0);
  const obraId = escolherObraFF({ obrasAtivas, obraFiltro, fechamentosPorObra });
  const obraSelecionada = obrasAtivas.find(o => o.id === obraId) || null;
  const kpisFF = computeKPIs(fechamentosPorObra[obraId] || []);
  const indicadores = indicadoresFF(kpisFF);
  const curvaObra = curvaPorObra[obraId];
  const erroDeRede = erro && isNetworkError(erro);

  if (erroDeRede) return <OfflineFallback onRetry={tentarDeNovo} />;

  if (vazio) {
    return (
      <div className="card"><div className="card-body mfs-aviso">
        Nenhuma obra liberada para o seu usuário. Peça ao administrador para vincular as obras ao seu perfil.
      </div></div>
    );
  }

  return (
    <div className="mfs-dash">
      {erro && (
        <div className="card"><div className="card-body mfs-aviso mfs-aviso-erro">
          Não foi possível carregar os dados da carteira: {friendlyError(erro)}
        </div></div>
      )}

      {/* Totais da carteira: o orçamento em destaque, com obras ativas e área ao lado */}
      <section className="mfs-kpis" aria-label="Totais da carteira">
        <div className="mfs-kpi mfs-kpi-destaque">
          <div className="mfs-kpi-rotulo"><span className="mfs-kpi-icone"><Icon name="briefcase" size={16} /></span>Orçamento total</div>
          <div className="mfs-kpi-valor">{loading ? '—' : brl(orcamentoTotal, { compact: true })}</div>
        </div>
        <div className="mfs-kpi">
          <div className="mfs-kpi-rotulo"><span className="mfs-kpi-icone"><Icon name="building" size={16} /></span>Obras ativas</div>
          <div className="mfs-kpi-valor">{obrasAtivas.length}<span className="mfs-kpi-unidade">em execução</span></div>
        </div>
        <div className="mfs-kpi">
          <div className="mfs-kpi-rotulo"><span className="mfs-kpi-icone"><Icon name="maximize" size={16} /></span>Área construída</div>
          <div className="mfs-kpi-valor">{loading ? '—' : formatNum(areaTotal)}{!loading && <span className="mfs-kpi-unidade">m²</span>}</div>
        </div>
      </section>

      {/* Físico Financeiro: último fechamento importado da obra escolhida */}
      <section aria-label="Físico Financeiro">
        <div className="mfs-secao-topo">
          <h2 className="mfs-secao-titulo">Físico Financeiro</h2>
          {obraSelecionada && mesFechamentoPorObra[obraId] && (
            <span className="mfs-secao-detalhe">Fechamento de {mesCurto(mesFechamentoPorObra[obraId])}</span>
          )}
        </div>
        <select className="input mfs-select" value={obraId} onChange={(e) => setObraFiltro(e.target.value)} aria-label="Obra">
          {obrasAtivas.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        {!kpisFF ? (
          <div className="card"><div className="card-body mfs-aviso">
            {loading ? 'Carregando…' : obraSelecionada
              ? `${obraSelecionada.nome} ainda não tem fechamento importado.`
              : 'Nenhuma obra disponível.'}
          </div></div>
        ) : (
          <div className="mfs-ff-grid">
            {indicadores.map(i => (
              <div className="mfs-kpi" key={i.chave}>
                <div className="mfs-kpi-rotulo"><span className="mfs-kpi-icone"><Icon name={i.icone} size={16} /></span>{i.rotulo}</div>
                <div className="mfs-kpi-valor" style={{ color: corCss(i.cor) }}>{formatNum(i.pct)}<span className="mfs-kpi-unidade">%</span></div>
                <div className="mfs-kpi-rodape">{formatBRL(i.real)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Curva S da obra escolhida: o mesmo gráfico do desktop, que continua com a largura mínima dele e rola na
          horizontal dentro do cartão. */}
      <section aria-label="Curva S">
        {loading ? (
          <div className="card"><div className="card-body mfs-aviso">Carregando…</div></div>
        ) : (
          <CurvaSObra key={obraId} obraId={obraId} {...(curvaObra || {})} />
        )}
      </section>

      {/* Avanço físico × financeiro: um cartão por obra, da que termina primeiro para a última */}
      <section aria-label="Avanço físico e financeiro por obra">
        <h2 className="mfs-secao-titulo">Avanço Físico × Financeiro</h2>
        {loading && <div className="card"><div className="card-body mfs-aviso">Carregando…</div></div>}
        <div className="mfs-obras">
          {!loading && ordenarPorTermino(porObra).map((o) => {
            const ff = resumoFisicoFinanceiro(fechamentosPorObra[o.id]);
            return (
              <article className="mfs-obra" key={o.id}>
                <header className="mfs-obra-topo">
                  <div className="mfs-obra-nome">
                    <strong>{o.nome}</strong>
                    <span className="mono">{o.sigla}</span>
                  </div>
                  {ff
                    ? <span className="badge info">{mesCurto(mesFechamentoPorObra[o.id])}</span>
                    : <span className="badge neutral">Sem fechamento</span>}
                </header>
                <div className="mfs-obra-avanco">
                  <div className="mfs-linha-rotulo-valor"><span>Avanço físico (cronograma)</span><strong>{formatNum(o.avanco)}%</strong></div>
                  <div className={'progress' + (o.avanco >= 100 ? ' success' : '')}>
                    <span style={{ width: Math.min(100, o.avanco) + '%' }}></span>
                  </div>
                </div>
                <dl className="mfs-metricas">
                  <div><dt>Exec. físico</dt><dd>{ff ? `${formatNum(ff.execFisico)}%` : '—'}</dd></div>
                  <div><dt>Gasto</dt><dd>{ff ? `${formatNum(ff.gastoPct)}%` : '—'}</dd></div>
                  <div><dt>Delta</dt><dd style={ff ? { color: corCss(ff.cor), fontWeight: 700 } : undefined}>{ff ? `${ff.delta >= 0 ? '+' : ''}${formatNum(ff.delta)}%` : '—'}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export { DashboardMobile };
