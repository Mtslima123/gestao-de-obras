// medicaoSync.js — preenchimento da Medição pela fila do aparelho (services/offlineQueue.js).
// Cada mudança de % medido, visto ou observação é guardada primeiro no aparelho (só o
// campo mudado, com o valor que o banco tinha), e o envio aplica isso por cima do que
// está no banco na hora (ver mesclarRascunho em medicaoMensalPure.js). Funciona igual com
// e sem internet: com internet sai em menos de 1s, sem internet espera a conexão voltar.
// Arquivo próprio porque o envio precisa estar registrado desde o boot (main.jsx), pra
// subir mesmo com a Medição fechada, e o Cronograma/Medição é carregado sob demanda.
import { offlineQueue } from '../../services/offlineQueue';
import { offlineCache } from '../../services/offlineCache';
import { medicaoMensalService } from './medicaoMensal.service';
import {
  registrarAlteracoes, mesclarRascunho, rebaseAlteracoes, descartarCampos, classificarMedicaoNoBanco,
} from './medicaoMensalPure';
import { ehFalhaPassageira } from '../../utils/offlinePure';

const TIPO = 'medicao-rascunho';
const chaveDe = (obraId, mes) => `${obraId}|${mes}`;

// Rede "sem sinal" deixa a requisição pendente em vez de falhar.
const comLimite = (promessa, ms) => Promise.race([
  promessa,
  new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { timeout: true, message: 'tempo esgotado esperando a rede' } }), ms)),
]);

const falhaPassageiraOuNao = (error, etapa, status) => {
  const comStatus = status != null ? { ...error, status: error?.status ?? status } : error;
  return Object.assign(new Error(`${etapa}: ${error?.message || 'falha'}`), { passageira: ehFalhaPassageira(comStatus), causa: comStatus });
};
// Recusa que não adianta repetir: o item vai pra "revisar" com o motivo e o detalhe que a
// Medição mostra na faixa (ver avisoPendencia em MedicaoMensal.jsx).
const recusa = (mensagem, detalhe) => Object.assign(new Error(mensagem), { passageira: false, detalhe });

const mesTexto = (mes) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
const dataTexto = (iso) => { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return ''; } };

// Quem quer saber do registro novo depois de um envio (a Medição aberta remonta a tela).
const ouvintes = new Set();
const avisar = (evento) => ouvintes.forEach((fn) => { try { fn(evento); } catch { /* segue */ } });

// Junta os pedidos de envio de várias teclas seguidas num só (antes era o autosave de 800ms).
let timerEnvio = null;
const agendarEnvio = () => {
  clearTimeout(timerEnvio);
  timerEnvio = setTimeout(() => { timerEnvio = null; offlineQueue.flush(); }, 800);
};

// A medição guardada no aparelho (modo foco) acompanha o banco mesmo com a Medição
// fechada: senão, no próximo offline, ela abriria com os valores de antes do envio.
async function atualizarCacheDoAparelho(obraId, mes, registro) {
  const chave = chaveDe(obraId, mes);
  if (await offlineCache.ler('medicao', chave)) await offlineCache.gravar('medicao', chave, { registro });
}

async function enviar(payload, ctx) {
  const { obraId, mes } = payload;
  let updatedAtAnterior = null;
  // Até 3 voltas: entre ler e gravar outra pessoa pode gravar (a gravação condicional
  // afeta 0 linhas); aí relê e junta de novo.
  for (let volta = 0; volta < 3; volta += 1) {
    const est = await comLimite(medicaoMensalService.buscarEstadoAtual(obraId, mes), 15000);
    if (est.error) throw falhaPassageiraOuNao(est.error, 'Conferência da medição', est.status);
    const reg = est.data;
    const situacao = classificarMedicaoNoBanco(reg, payload.baseId);
    if (situacao === 'excluida') {
      throw recusa(`A medição de ${mesTexto(mes)} foi excluída antes das suas alterações chegarem. Elas não foram enviadas.`, { tipo: 'excluida' });
    }
    if (situacao === 'fechada') {
      const aprovada = reg.status === 'aprovada';
      const quem = aprovada ? reg.aprovada_por : reg.fechada_por;
      const quando = aprovada ? reg.aprovada_em : reg.fechada_em;
      throw recusa(
        `A medição de ${mesTexto(mes)} foi ${aprovada ? 'aprovada' : 'fechada'}${quem ? ` por ${quem}` : ''}${quando ? ` em ${dataTexto(quando)}` : ''} antes das suas alterações chegarem. Elas não foram enviadas. Peça para reabrir a medição.`,
        { tipo: 'fechada' },
      );
    }
    // Releu e nada mudou desde a gravação que afetou 0 linhas: não foi outra pessoa, foi o
    // RLS barrando a edição (ex.: aba somente leitura).
    if (volta > 0 && reg.updated_at === updatedAtAnterior) {
      throw recusa('Sem permissão para editar esta medição. Fale com o administrador.', { tipo: 'sem-permissao' });
    }
    const { itens, conflitos } = mesclarRascunho(reg.itens || [], payload.alteracoes);
    const mudou = JSON.stringify(itens) !== JSON.stringify(reg.itens || []);
    const recusaConflito = () => {
      const n = new Set(conflitos.map((c) => String(c.id))).size;
      return recusa(
        `${n} tarefa${n > 1 ? 's foram alteradas' : ' foi alterada'} por outra pessoa antes das suas alterações chegarem.`,
        { tipo: 'conflito', conflitos },
      );
    };
    // Só conflito e nada mais a mandar: espera a pessoa decidir.
    if (conflitos.length && !mudou) throw recusaConflito();
    // A pessoa saiu e mandou apagar enquanto isso corria.
    if (ctx?.aindaNaFila && !(await ctx.aindaNaFila())) return null;
    // Com conflito, grava mesmo assim o que NÃO conflita (os itens mesclados mantêm o valor
    // do banco nos campos em conflito): um conflito numa tarefa não segura o resto do mês.
    const r = mudou
      ? await comLimite(medicaoMensalService.salvarRascunhoCondicional({ id: reg.id, itens, updatedAtEsperado: reg.updated_at }), 15000)
      : { data: reg, error: null };
    if (r.error) throw falhaPassageiraOuNao(r.error, 'Envio da medição', r.status);
    if (r.data) {
      await atualizarCacheDoAparelho(obraId, mes, r.data).catch(() => {});
      avisar({ chave: chaveDe(obraId, mes), registro: r.data });
      // Tira o que foi enviado; ficam os campos em conflito (não foram) e o que a pessoa
      // mudou durante o envio (rebaseado no valor que acabou de subir).
      const enviadas = descartarCampos(payload.alteracoes, conflitos);
      const fim = ctx?.finalizar
        ? await ctx.finalizar((atual) => {
          const restantes = rebaseAlteracoes(atual.alteracoes, enviadas);
          return Object.keys(restantes).length ? { ...atual, alteracoes: restantes, baseId: r.data.id } : null;
        })
        : null;
      if (conflitos.length) throw recusaConflito(); // o item (só com os conflitos) vai pra "revisar"
      return fim;
    }
    updatedAtAnterior = reg.updated_at;
  }
  // Mudou 3 vezes seguidas no meio: passageiro, tenta de novo daqui a pouco.
  throw Object.assign(new Error('A medição está sendo alterada agora por outra pessoa. Tentando de novo.'), { passageira: true });
}

offlineQueue.registrarHandler(TIPO, enviar);

export const medicaoSync = {
  // Guarda mudanças de campo da Medição. `registro`: o registro do banco em que a pessoa
  // está mexendo (do banco ou do cache do aparelho); `mudancas`: ver registrarAlteracoes.
  async registrarEdicoes({ obraId, mes, registro, mudancas }) {
    await offlineQueue.atualizarOuCriar(TIPO, chaveDe(obraId, mes), (atual) => ({
      obraId,
      mes,
      // Medição a que as mudanças se referem: se ela for excluída e aberta de novo (id
      // novo), as mudanças não são aplicadas na outra.
      baseId: atual?.baseId ?? registro?.id ?? null,
      alteracoes: registrarAlteracoes(atual?.alteracoes, mudancas, registro?.itens || []),
    }), {
      // As mudanças guardadas eram de uma medição que foi excluída e aberta de novo: não
      // mistura (iriam junto pra "excluída" e nunca subiriam); recomeça na medição nova.
      reiniciar: (item) => item.payload?.baseId != null && registro?.id != null && String(item.payload.baseId) !== String(registro.id),
      // Esperando a pessoa resolver um conflito: a edição nova volta o item pra fila, e o
      // envio manda o que não conflita (o conflito volta a aparecer até ser resolvido).
      reativar: (item) => item.status === 'revisar' && item.detalhe?.tipo === 'conflito',
    });
    agendarEnvio();
  },

  lerPendente: (obraId, mes) => offlineQueue.lerPorChave(TIPO, chaveDe(obraId, mes)),

  // Conflito resolvido em bloco. 'meus': a base de cada campo em conflito passa a ser o
  // valor que a pessoa viu no sistema, e o meu entra por cima (se mudar de novo antes de
  // chegar, é conflito de novo). 'sistema': esquece os campos em conflito.
  async resolverConflito(item, escolha) {
    const conflitos = item?.detalhe?.conflitos || [];
    await offlineQueue.reativar(item.id, (p) => {
      if (escolha === 'meus') {
        const alteracoes = JSON.parse(JSON.stringify(p.alteracoes || {}));
        conflitos.forEach((c) => {
          const alvo = alteracoes[String(c.id)]?.campos?.[c.campo];
          if (alvo) alvo.base = c.sistema;
        });
        return { ...p, alteracoes };
      }
      const alteracoes = descartarCampos(p.alteracoes, conflitos);
      return Object.keys(alteracoes).length ? { ...p, alteracoes } : null;
    });
  },

  descartar: (item) => (item ? offlineQueue.descartar(item.id) : Promise.resolve()),

  // Fechar (e incluir/remover tarefa) precisa do banco já com tudo o que foi preenchido:
  // manda agora e espera até `ms`. Devolve true se não sobrou nada guardado pra este mês.
  // Fila que não abre (IndexedDB bloqueado) = nada guardado nela: as edições foram direto.
  async enviarAntesDeFechar(obraId, mes, ms = 10000) {
    const ler = () => medicaoSync.lerPendente(obraId, mes).catch(() => null);
    if (!(await ler())) return true;
    clearTimeout(timerEnvio);
    await Promise.race([offlineQueue.flush(), new Promise((r) => setTimeout(r, ms))]);
    return !(await ler());
  },

  subscribe(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
  chave: chaveDe,
  TIPO,
};
