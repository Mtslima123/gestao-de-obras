import React from 'react';

// Físico Financeiro — lista de obras (mirror simplificado de ObrasList.jsx: aqui não
// precisa de capa/avanço físico/busca/filtro, só entrar na obra pra importar/ver o
// fechamento do mês). `obras` já vem filtrada por permissão pelo App.jsx (obrasVisiveis)
// — não recalcular aqui.
const FisicoFinanceiroList = ({ onOpenObra, obras = [] }) => {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Físico Financeiro</h1>
        </div>
      </div>

      <div className="obra-card-grid">
        {obras.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)', fontSize: 14 }}>
            Nenhuma obra cadastrada.
          </div>
        )}
        {obras.map((o) => (
          <div
            key={o.id}
            className="obra-card"
            style={{ paddingTop: 18 }}
            onClick={() => onOpenObra(o)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenObra(o); } }}
          >
            <div className="obra-card-head">
              <div style={{ flex: 1 }}>
                <div className="obra-card-id">{(o.sigla && o.sigla !== o.id) ? o.sigla : ' '}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', marginBottom: 3 }}>
                  ID: {o.id.length > 12 ? o.id.slice(0, 12) + '…' : o.id}
                </div>
                <div className="obra-card-name">{o.nome}</div>
              </div>
              <span className={'badge ' + (o.status === 'concluida' ? 'success' : 'info')} style={{ flexShrink: 0 }}>
                {o.status === 'concluida' ? 'Concluída' : 'Em execução'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

export { FisicoFinanceiroList };
