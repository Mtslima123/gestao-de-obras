import React from 'react';
import { supabase } from '../../../../services/supabase';
import { logger } from '../../../../services/logger';
import { isNetworkError, connectivity, useRetryOnReconnect } from '../../../../utils/connectivity';
import { orcamentosService } from '../../../financeiro/orcamentos.service';
import { vinculoService, itemValor } from '../../../financeiro/vinculoService';
import { fisicoFinanceiroService } from '../../../fisicoFinanceiro/fisicoFinanceiro.service';
import { montarCarteira } from './dashboardMobilePure';

// Carga dos dados do Dashboard na casca mobile: as mesmas 4 consultas do Dashboard do desktop (cronogramas,
// vínculos, orçamentos e último fechamento do Físico Financeiro), só leitura. A montagem por obra está em
// dashboardMobilePure.js. Fica separado do componente para ele só cuidar da apresentação.
export const useCarteiraDashboard = (obrasAtivas) => {
  const [carga, setCarga] = React.useState({ loading: true, erro: null });
  const [retryTick, setRetryTick] = React.useState(0);
  const tentarDeNovo = React.useCallback(() => setRetryTick((t) => t + 1), []);
  useRetryOnReconnect(tentarDeNovo);

  // A chave dos ids, e não o array: a identidade do array muda a cada render do App.
  const obrasKey = obrasAtivas.map(o => o.id).join(',');

  React.useEffect(() => {
    const ids = obrasAtivas.map(o => o.id);
    if (!ids.length) { setCarga({ loading: false, erro: null, vazio: true }); return undefined; }
    let cancelado = false;
    setCarga(c => ({ ...c, loading: true }));

    Promise.all([
      supabase.from('cronogramas').select('obra_id, etapas, baselines, reprogramacoes').in('obra_id', ids),
      vinculoService.listarPorObras(ids),
      orcamentosService.listar(ids),
      fisicoFinanceiroService.buscarUltimosPorObras(ids),
    ]).then(([cronRes, vincRes, orcRes, ffRes]) => {
      if (cancelado) return;
      const erro = cronRes.error || vincRes.error || orcRes.error || ffRes.error;
      if (erro) {
        logger.error('falha ao carregar o dashboard (mobile)', { module: 'dashboard', err: erro });
        if (isNetworkError(erro)) connectivity.reportError(erro);
        setCarga({ loading: false, erro });
        return;
      }
      connectivity.reportSuccess();
      setCarga({
        loading: false, erro: null,
        ...montarCarteira({
          obrasAtivas,
          cronogramas: cronRes.data || [],
          vinculos: vincRes.data || [],
          orcamentos: orcRes.data,
          fechamentos: ffRes.data || [],
          itemValor,
        }),
      });
    }).catch((erro) => {
      // Uma exceção dentro do .then() (formato de dado inesperado) cai aqui em vez de deixar "Carregando…" para sempre.
      if (cancelado) return;
      logger.error('falha ao carregar o dashboard (mobile)', { module: 'dashboard', err: erro });
      if (isNetworkError(erro)) connectivity.reportError(erro);
      setCarga({ loading: false, erro });
    });

    return () => { cancelado = true; };
    // obrasKey em vez de obrasAtivas (ver acima)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obrasKey, retryTick]);

  return { ...carga, tentarDeNovo };
};
