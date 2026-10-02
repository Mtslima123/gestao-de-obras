// fotos.service.js — gravação das fotos da obra pela fila do aparelho
// (services/offlineQueue.js): a foto é guardada primeiro no celular e enviada quando há
// internet. Arquivo próprio porque o envio precisa estar registrado desde o boot
// (main.jsx), pra subir mesmo com a aba Fotos fechada, e ObraDetail é carregado sob demanda.
import { supabase } from '../../services/supabase';
import { offlineQueue } from '../../services/offlineQueue';
import { logger } from '../../services/logger';
import { arquivoJaExiste, ehFalhaPassageira } from '../../utils/offlinePure';

const BUCKET = 'obras-images';

// Rede "sem sinal" deixa a requisição pendente em vez de falhar. Se o tempo esgota e ela
// chega mesmo assim depois, o reenvio reconhece (arquivo 409, linha já existente).
const comLimite = (promessa, ms) => Promise.race([
  promessa,
  new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { timeout: true, message: 'tempo esgotado esperando a rede' } }), ms)),
]);

// Erro já classificado pra fila: passageira tenta de novo depois, definitiva vira "revisar".
// `status`: o postgrest-js deixa o HTTP fora do objeto de erro (na resposta), e sem ele um
// 503/500 passageiro do servidor seria tratado como definitivo.
const falha = (error, etapa, status) => {
  const comStatus = status != null ? { ...error, status: error?.status ?? status } : error;
  // Corpo HTML (gateway fora do ar) não cabe como motivo na miniatura.
  const msg = String(error?.message || '').trim().startsWith('<')
    ? `servidor indisponível${status ? ` (HTTP ${status})` : ''}`
    : error?.message;
  return Object.assign(
    new Error(msg ? `${etapa}: ${msg}` : etapa),
    { passageira: ehFalhaPassageira(comStatus), causa: comStatus },
  );
};

const montarPayload = (obraId, metadados, { blob, thumbBlob }) => {
  // Caminho no Storage nasce aqui, e não no envio: é ele que torna o reenvio idempotente.
  // Sufixo aleatório além do timestamp: fotos do mesmo lote caem no mesmo milissegundo.
  const storagePath = `obras/${obraId}/fotos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  return {
    obraId,
    storagePath,
    thumbPath: storagePath.replace(/\.jpg$/, '_thumb.jpg'),
    blob,
    thumbBlob,
    data: metadados.data,
    pavimento: metadados.pavimento,
    descricao: metadados.descricao || '',
  };
};

export const fotosService = {
  // Guarda um lote no aparelho (uma foto por item: a falha de envio de uma não segura as
  // outras) e já pede o envio. `lote`: [{ blob, thumbBlob }] já comprimidos.
  // Devolve { guardadas, enviadasDireto }. Se o aparelho não deixa guardar (IndexedDB
  // bloqueado, sem espaço) e há internet, envia direto, como era antes da fila.
  async enfileirar(obraId, metadados, lote) {
    const payloads = lote.map((f) => montarPayload(obraId, metadados, f));
    try {
      await offlineQueue.enfileirarLote('foto', payloads);
    } catch (err) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw err;
      logger.warn('fila do aparelho indisponível, enviando foto direto', { module: 'fotos', action: 'enfileirar', err });
      // Segue mesmo se uma falhar: quem chama fecha o modal e diz quantas subiram, pra um
      // "salvar de novo" não duplicar as que já foram.
      let enviadasDireto = 0;
      for (const p of payloads) {
        try { await fotosService.enviarDaFila(p); enviadasDireto += 1; }
        catch (e) { logger.error('falha ao enviar foto direto', { module: 'fotos', action: 'enfileirar', err: e }); }
      }
      return { guardadas: 0, enviadasDireto, falharam: payloads.length - enviadasDireto };
    }
    // Pede ao navegador pra não apagar a fila quando o aparelho ficar sem espaço. Melhor
    // esforço: o Chrome pode negar, e aí vale a política normal dele.
    try { navigator.storage?.persist?.(); } catch { /* sem suporte */ }
    offlineQueue.flush();
    return { guardadas: payloads.length, enviadasDireto: 0 };
  },

  // Envio de um item da fila. Pode rodar mais de uma vez pro mesmo item (rede caiu depois
  // de o servidor gravar): cada passo reconhece o que já foi feito.
  async enviarDaFila(p, { aindaNaFila } = {}) {
    // Blob que o navegador não consegue mais ler não adianta reenviar: vira "revisar" na hora.
    try { await p.blob.slice(0, 1).arrayBuffer(); }
    catch { throw Object.assign(new Error('A foto guardada no aparelho não pode mais ser lida.'), { passageira: false }); }

    const up = await comLimite(
      supabase.storage.from(BUCKET).upload(p.storagePath, p.blob, { contentType: 'image/jpeg', upsert: false }),
      60000,
    );
    if (up.error && !arquivoJaExiste(up.error)) throw falha(up.error, 'Envio da foto');

    // Miniatura é "melhor esforço": sem ela a galeria usa a foto inteira. Mas falha de rede
    // aqui para e tenta o item inteiro depois (a foto já enviada volta como 409).
    let thumbnailPath = null;
    if (p.thumbBlob) {
      const th = await comLimite(
        supabase.storage.from(BUCKET).upload(p.thumbPath, p.thumbBlob, { contentType: 'image/jpeg', upsert: false }),
        60000,
      );
      if (!th.error || arquivoJaExiste(th.error)) thumbnailPath = p.thumbPath;
      else if (ehFalhaPassageira(th.error)) throw falha(th.error, 'Envio da miniatura');
    }

    // A pessoa saiu e mandou apagar enquanto o arquivo subia: não publica, e tira do Storage
    // o que já subiu (melhor esforço).
    if (aindaNaFila && !(await aindaNaFila())) {
      supabase.storage.from(BUCKET).remove([p.storagePath, p.thumbPath]).catch(() => {});
      return;
    }

    // Sem UNIQUE em storage_path no banco (seria DDL, com o TI): confere antes de inserir
    // pra um reenvio não duplicar a foto (nem a notificação/auditoria que o insert gera).
    const existe = await comLimite(
      supabase.from('fotos_obra').select('id').eq('obra_id', p.obraId).eq('storage_path', p.storagePath).maybeSingle(),
      15000,
    );
    if (existe.error) throw falha(existe.error, 'Conferência da foto', existe.status);
    if (existe.data) return;

    // Bucket privado: a exibição é por URL assinada gerada do storage_path. A coluna `url`
    // é legada e NOT NULL: guarda o próprio path.
    const ins = await comLimite(
      supabase.from('fotos_obra').insert({
        obra_id: p.obraId, url: p.storagePath, storage_path: p.storagePath, thumbnail_path: thumbnailPath,
        data: p.data, pavimento: p.pavimento, descricao: p.descricao,
      }),
      15000,
    );
    if (ins.error) throw falha(ins.error, 'Registro da foto', ins.status);
  },
};

offlineQueue.registrarHandler('foto', (payload, ctx) => fotosService.enviarDaFila(payload, ctx));
