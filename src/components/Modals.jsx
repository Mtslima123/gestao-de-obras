import React from 'react';
import { Icon } from './Icons';
import { AppData } from '../utils/data';
import { orcamentosService } from '../modules/financeiro/orcamentos.service';
import { notificacoesService } from '../services/notificacoes.service';

// Modals, toasts, dropdowns — shared interactive components

// ----- Modal shell -----
const Modal = ({ title, subtitle, onClose, footer, children, size = 'md', draggable = false }) => {
  const nodeRef  = React.useRef(null);
  const dragging = React.useRef(false);
  const offset   = React.useRef({ x: 0, y: 0 });
  const [pos, setPos] = React.useState(null);

  React.useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, []);

  React.useEffect(() => {
    if (!draggable || !nodeRef.current) return;
    const el = nodeRef.current;
    setPos({
      x: Math.max(0, Math.round((window.innerWidth  - el.offsetWidth)  / 2)),
      y: Math.max(0, Math.round((window.innerHeight - el.offsetHeight) / 4)),
    });
  }, [draggable]);

  React.useEffect(() => {
    if (!draggable) return;
    const move = (e) => {
      if (!dragging.current) return;
      const el = nodeRef.current;
      const w = el ? el.offsetWidth  : 600;
      const h = el ? el.offsetHeight : 400;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - w,       e.clientX - offset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - h - 8,   e.clientY - offset.current.y)),
      });
    };
    const up = () => { dragging.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup',   up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup',   up);
    };
  }, [draggable]);

  const handleHeaderDown = (e) => {
    if (!draggable || e.target.closest('button')) return;
    dragging.current = true;
    const r = nodeRef.current?.getBoundingClientRect() ?? { left: pos?.x ?? 0, top: pos?.y ?? 0 };
    offset.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    e.preventDefault();
  };

  const sizeClass = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : size === 'xl' ? 'xl' : '';
  const modalStyle = draggable && pos ? { position: 'fixed', left: pos.x, top: pos.y, margin: 0 } : {};
  const headerStyle = draggable ? { cursor: 'grab', userSelect: 'none' } : {};

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={nodeRef} className={'modal ' + sizeClass} style={modalStyle}>
        <div className="modal-header" style={headerStyle} onMouseDown={handleHeaderDown}>
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          <button className="modal-close" onClick={onClose}><Icon name="dots" size={16} style={{ display: 'none' }} />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

// ----- Toast manager -----
const ToastContext = React.createContext(null);
const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = React.useState([]);
  // Referência estável: evita que cada toast (entrada e auto-remoção após 3s) mude o valor
  // do contexto e force re-render de todo o app. setToasts já é funcional, então deps = [].
  const push = React.useCallback((msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { id, msg, tone: opts.tone || 'success', icon: opts.icon || 'check' }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), opts.duration || 3000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={'toast ' + (t.tone !== 'success' ? t.tone : '')}>
            <div className="toast-icon"><Icon name={t.icon} size={13} stroke={2.5} /></div>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
const useToast = () => React.useContext(ToastContext);

// ----- Nova Obra modal -----
const NovaObraModal = ({ onClose }) => {
  const toast = useToast();
  const [tipo, setTipo] = React.useState('vertical');
  const [step, setStep] = React.useState(1);
  const onSave = () => {
    toast('Nova obra criada com sucesso', { tone: 'success', icon: 'check' });
    onClose();
  };
  return (
    <Modal
      title="Nova obra"
      subtitle={`Etapa ${step} de 2 · Cadastro inicial`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: step >= 1 ? 'var(--brand)' : 'var(--border-strong)' }}></div>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: step >= 2 ? 'var(--brand)' : 'var(--border-strong)' }}></div>
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          {step === 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(2)}>Continuar <Icon name="arrow-right" size={14} /></button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>Voltar</button>
              <button className="btn btn-primary" onClick={onSave}><Icon name="check" size={14} />Criar obra</button>
            </>
          )}
        </>
      }
    >
      {step === 1 && (
        <div className="stack">
          <div className="form-grid">
            <div className="field full">
              <label>Nome da obra <span className="req">*</span></label>
              <input placeholder="Ex.: Obra H" defaultValue="Obra H" />
            </div>
            <div className="field">
              <label>Código <span className="req">*</span></label>
              <div className="field-prefix">
                <span className="prefix">OB-</span>
                <input placeholder="008" defaultValue="008" />
              </div>
            </div>
            <div className="field">
              <label>Cliente <span className="req">*</span></label>
              <select defaultValue="theta">
                <option value="">Selecione um cliente…</option>
                <option value="alfa">Cliente Alfa S.A.</option>
                <option value="beta">Cliente Beta Ltda.</option>
                <option value="theta">Cliente Theta</option>
                <option value="novo">+ Novo cliente</option>
              </select>
            </div>
            <div className="field full">
              <label>Tipo de obra</label>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {[
                  { id: 'vertical', label: 'Incorporação Vertical' },
                  { id: 'horizontal', label: 'Residencial Horizontal' },
                  { id: 'comercial', label: 'Comercial' },
                  { id: 'industrial', label: 'Industrial' },
                  { id: 'saude', label: 'Saúde' },
                  { id: 'inst', label: 'Institucional' },
                  { id: 'lot', label: 'Loteamento' },
                ].map(t => (
                  <button key={t.id} className={'chip' + (tipo === t.id ? ' active' : '')}
                    onClick={() => setTipo(t.id)}>{t.label}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Área construída (m²)</label>
              <input type="text" placeholder="0" defaultValue="12.480" />
            </div>
            <div className="field">
              <label>Endereço</label>
              <input placeholder="Endereço completo" defaultValue="Endereço 08 — Cidade H / UF" />
            </div>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <div className="form-grid">
            <div className="field">
              <label>Início previsto <span className="req">*</span></label>
              <input type="date" defaultValue="2026-07-01" />
            </div>
            <div className="field">
              <label>Entrega prevista <span className="req">*</span></label>
              <input type="date" defaultValue="2028-12-30" />
            </div>
            <div className="field">
              <label>Orçamento inicial</label>
              <div className="field-prefix">
                <span className="prefix">R$</span>
                <input placeholder="0,00" defaultValue="42.180.000,00" />
              </div>
            </div>
            <div className="field">
              <label>Responsável técnico</label>
              <select defaultValue="01">
                <option value="01">Responsável 01</option>
                <option value="02">Responsável 02</option>
                <option value="03">Responsável 03</option>
              </select>
            </div>
            <div className="field">
              <label>Categoria de risco</label>
              <div className="segmented">
                <button className="active">Baixo</button>
                <button>Médio</button>
                <button>Alto</button>
              </div>
            </div>
            <div className="field full">
              <label>Observações</label>
              <textarea placeholder="Notas sobre a obra…"></textarea>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ----- ObraFormModal (criar ou editar obra) -----
const ObraFormModal = ({ obra = null, onClose, onSave }) => {
  const isEdit = obra !== null;
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    nome:         obra?.nome        || '',
    sigla:        obra?.sigla || obra?.id || '',
    status:       obra?.status      || 'em_andamento',
    endereco:     obra?.endereco    || '',
    dataPrevista: obra?.previsto    || '',
    // Campos futuros: cliente, tipo, area, orcamento, risco, observacoes
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.nome.trim() || saving) return;
    let result;
    if (isEdit) {
      result = {
        ...obra,
        nome:        form.nome,
        sigla:       form.sigla.trim() || obra.sigla || obra.id,
        status:      form.status,
        endereco:    form.endereco,
        previsto:    form.dataPrevista || obra.previsto,
        // id não é sobrescrito — permanece imutável
      };
    } else {
      result = {
        sigla: form.sigla.trim() || '',
        nome:  form.nome,
        tipo:             'Incorporação Vertical',
        cliente:          '',
        endereco:         form.endereco,
        area:             0,
        orcamento:        0,
        gasto:            0,
        avancoFisico:     0,
        avancoFinanceiro: 0,
        inicio:           new Date().toISOString().slice(0, 10),
        previsto:         form.dataPrevista || new Date().toISOString().slice(0, 10),
        status:           'em_andamento',
        risco:            'baixo',
        etapaAtual:       'Em planejamento',
        equipe:           0,
        alertas:          0,
        contrato:         '',
      };
    }
    setSaving(true);
    await onSave(result); // erro/sucesso reais são tratados e sinalizados por quem chama (toast + fechamento do modal)
    setSaving(false);
  };

  return (
    <Modal
      title={isEdit ? 'Editar obra' : 'Nova obra'}
      subtitle={isEdit ? `Editando: ${obra.nome}` : 'Cadastro de nova obra'}
      onClose={onClose}
      footer={
        <>
          <div className="spacer"></div>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!form.nome.trim() || saving}>
            <Icon name="check" size={14} />{saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar obra'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field full">
          <label>Nome da obra <span className="req">*</span></label>
          <input
            placeholder="Ex.: Residencial Aurora"
            value={form.nome}
            onChange={e => set('nome', e.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label>Sigla / Código</label>
          <input
            placeholder="Ex.: OB-008"
            value={form.sigla}
            onChange={e => set('sigla', e.target.value)}
            maxLength={12}
          />
        </div>
        {isEdit && (
          <div className="field">
            <label>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="em_andamento">Em execução</option>
              <option value="concluida">Concluída</option>
            </select>
          </div>
        )}
        <div className="field full">
          <label>Endereço</label>
          <input
            placeholder="Endereço completo"
            value={form.endereco}
            onChange={e => set('endereco', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Data do cliente (entrega)</label>
          <input
            type="date"
            value={form.dataPrevista}
            onChange={e => set('dataPrevista', e.target.value)}
          />
        </div>
        {/* Campos futuros: cliente, tipo, área, orçamento, risco, observações */}
      </div>
    </Modal>
  );
};

// ----- Nova Medição modal -----
const NovaMedicaoModal = ({ onClose }) => {
  const toast = useToast();
  const [progresso, setProgresso] = React.useState(64);
  const onSave = () => {
    toast('Medição 13 enviada para aprovação', { tone: 'success', icon: 'check' });
    onClose();
  };
  return (
    <Modal
      title="Novo boletim de medição"
      subtitle="Boletim nº 13 · Obra A"
      onClose={onClose}
      footer={
        <>
          <div className="spacer"></div>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-ghost">Salvar rascunho</button>
          <button className="btn btn-primary" onClick={onSave}><Icon name="check" size={14} />Enviar para aprovação</button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <div className="field">
            <label>Período inicial</label>
            <input type="date" defaultValue="2026-05-01" />
          </div>
          <div className="field">
            <label>Período final</label>
            <input type="date" defaultValue="2026-05-31" />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Avanço físico medido — {progresso}%
          </label>
          <input type="range" min="0" max="100" value={progresso}
            onChange={(e) => setProgresso(+e.target.value)}
            style={{ width: '100%', accentColor: 'var(--brand)', marginTop: 6 }} />
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
            <span>0%</span><span>Avanço anterior: 60%</span><span>100%</span>
          </div>
        </div>

        <div className="card" style={{ background: 'var(--surface-muted)', borderRadius: 10 }}>
          <div className="card-body" style={{ padding: 14 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>Valor a medir</span>
              <span className="mono num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand)' }}>
                R$ {((progresso - 60) * 0.84 * 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <span className="text-xs text-muted">{progresso - 60}% × R$ 845.000 / ponto percentual</span>
              <span className="text-xs text-muted">Retenção 5% aplicada</span>
            </div>
          </div>
        </div>

        <div className="form-grid">
          <div className="field full">
            <label>Anexos</label>
            <div style={{ border: '2px dashed var(--border-strong)', borderRadius: 10, padding: '20px 14px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Icon name="image" size={20} style={{ color: 'var(--text-muted)' }} />
              <div style={{ fontSize: 13, marginTop: 6 }}>Arraste arquivos ou <a style={{ color: 'var(--brand)' }}>selecione</a></div>
              <div className="text-xs" style={{ marginTop: 2 }}>PDF, imagens, planilhas · até 20MB cada</div>
            </div>
          </div>
          <div className="field full">
            <label>Observações</label>
            <textarea placeholder="Justificativas, divergências, observações de campo…"></textarea>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ----- Solicitar compra modal -----
const SolicitarCompraModal = ({ insumo, onClose }) => {
  const toast = useToast();
  const onSave = () => {
    toast('Pedido de compra enviado a 3 fornecedores', { tone: 'success', icon: 'check' });
    onClose();
  };
  return (
    <Modal
      title="Solicitação de compra"
      subtitle={insumo ? insumo.item : 'Novo pedido'}
      onClose={onClose}
      footer={
        <>
          <div className="spacer"></div>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onSave}><Icon name="truck" size={14} />Enviar pedido</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Quantidade</label>
          <div className="field-prefix">
            <input defaultValue={insumo ? (insumo.minimo * 2) : '0'} />
            <span className="prefix" style={{ right: 12, left: 'auto', color: 'var(--text-muted)' }}>{insumo ? insumo.un : ''}</span>
          </div>
          <div className="hint">Sugerido: 2× nível mínimo</div>
        </div>
        <div className="field">
          <label>Urgência</label>
          <div className="segmented">
            <button>Baixa</button>
            <button className="active">Normal</button>
            <button>Urgente</button>
          </div>
        </div>
        <div className="field full">
          <label>Fornecedores cotados</label>
          <div className="stack" style={{ gap: 8 }}>
            {['Fornecedor 01', 'Fornecedor 03', 'Fornecedor 05'].map((f, i) => (
              <div key={i} className="row" style={{
                padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, gap: 12,
                background: 'var(--surface)',
              }}>
                <div className="switch on"></div>
                <span style={{ fontWeight: 500 }}>{f}</span>
                <span className="text-xs text-muted">· última cotação R$ {(245 + i * 32).toLocaleString('pt-BR')}/un</span>
                <span className="badge success" style={{ marginLeft: 'auto' }}><span className="dot"></span>Homologado</span>
              </div>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Local de entrega</label>
          <select>
            <option>Canteiro Obra A</option>
            <option>Canteiro Obra B</option>
            <option>Almoxarifado central</option>
          </select>
        </div>
        <div className="field">
          <label>Data desejada</label>
          <input type="date" defaultValue="2026-05-26" />
        </div>
        <div className="field full">
          <label>Observações</label>
          <textarea placeholder="Especificações, condições especiais…"></textarea>
        </div>
      </div>
    </Modal>
  );
};

// Tempo relativo curto em pt-BR a partir de um ISO timestamp.
const tempoRel = (iso) => {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return 'agora';
  const min = Math.floor(s / 60); if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); if (h < 24) return `${h} h`;
  const dias = Math.floor(h / 24); if (dias < 7) return `${dias} d`;
  return d.toLocaleDateString('pt-BR');
};

// ----- Notification panel (dropdown attached to bell icon) -----
const NotifPanel = ({ onClose, onChange }) => {
  const [items, setItems]     = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await notificacoesService.listar(30);
    setItems(error ? [] : (data || []));
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.notif-panel') && !e.target.closest('[data-notif-trigger]')) onClose();
    };
    const tid = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(tid); document.removeEventListener('click', handler); };
  }, [onClose]);

  const naoLidas = items.filter(n => !n.lido).length;

  const marcarTodas = async () => {
    if (!naoLidas) return;
    await notificacoesService.marcarTodasLidas();
    await load();
    onChange && onChange();
  };

  const abrirItem = async (n) => {
    if (!n.lido) {
      await notificacoesService.marcarLida(n.id);
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, lido: true } : x));
      onChange && onChange();
    }
  };

  return (
    <div className="notif-panel">
      <div className="notif-header">
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Notificações</div>
          <div className="text-xs text-muted" style={{ marginTop: 2 }}>{naoLidas} não lida{naoLidas === 1 ? '' : 's'}</div>
        </div>
        <button className="btn btn-sm btn-subtle" style={{ marginLeft: 'auto' }} onClick={marcarTodas} disabled={!naoLidas}>Marcar todas</button>
      </div>
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)' }}>Carregando…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-faint)' }}>
            <Icon name="bell" size={22} style={{ opacity: 0.5 }} />
            <div style={{ marginTop: 8, fontSize: 12.5 }}>Nenhuma notificação por aqui</div>
          </div>
        ) : items.map((n) => (
          <div key={n.id} className={'alert-item ' + n.tipo} onClick={() => abrirItem(n)}
            style={{ borderBottom: '1px solid var(--border)', opacity: n.lido ? 0.6 : 1, cursor: 'pointer' }}>
            <div className={'alert-pill ' + n.tipo}></div>
            <div className="alert-icon">
              <Icon name={n.tipo === 'danger' ? 'alert-triangle' : n.tipo === 'warning' ? 'alert' : 'bell'} size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="alert-title" style={{ fontSize: 12.5 }}>{n.titulo}</div>
              <div className="alert-sub">{n.subtitulo}</div>
            </div>
            <div className="alert-time">{tempoRel(n.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ----- Novo Orçamento modal -----
const NovoOrcamentoModal = ({ onClose, obras = [], user, onCreated }) => {
  const toast = useToast();
  const [usedObraIds, setUsedObraIds] = React.useState(null); // null = carregando
  const [form, setForm] = React.useState({
    obra_id: '',
    versao: 'v1',
    status: 'rascunho',
  });
  const [loading, setLoading] = React.useState(false);

  // Obras que já têm orçamento são ocultadas (1 orçamento por obra; novas versões via "Criar revisão")
  React.useEffect(() => {
    orcamentosService.listar().then(({ data }) => {
      setUsedObraIds(new Set((data || []).map(o => String(o.obra_id))));
    }).catch(err => console.error('[orcamento] falha ao listar orçamentos existentes', err));
  }, []);

  const obrasDisponiveis = React.useMemo(
    () => usedObraIds ? obras.filter(o => !usedObraIds.has(String(o.id))) : [],
    [obras, usedObraIds]
  );

  // Seleciona a primeira obra disponível quando a lista fica pronta / muda
  React.useEffect(() => {
    if (obrasDisponiveis.length && !obrasDisponiveis.some(o => o.id === form.obra_id)) {
      setForm(f => ({ ...f, obra_id: obrasDisponiveis[0].id }));
    }
  }, [obrasDisponiveis]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleObraChange = (obraId) => {
    setForm(f => ({ ...f, obra_id: obraId }));
  };

  const onSave = async () => {
    if (!form.obra_id) {
      toast('Selecione uma obra', { tone: 'error', icon: 'alert' });
      return;
    }
    const novoId = 'OR-' + String(Date.now()).slice(-4);
    setLoading(true);
    const { error } = await orcamentosService.criar({
      id: novoId,
      obra_id: form.obra_id,
      cliente: '',
      versao: form.versao || 'v1',
      status: form.status,
      valor: 0,
      data: new Date().toISOString().slice(0, 10),
    }, user?.id);
    setLoading(false);
    if (error) {
      toast('Erro ao criar orçamento: ' + error.message, { tone: 'error', icon: 'alert' });
      return;
    }
    toast('Orçamento criado com sucesso', { tone: 'success', icon: 'check' });
    if (onCreated) onCreated();
    onClose();
  };

  // Carregando a lista de obras já usadas (evita piscar o estado vazio durante a busca)
  if (usedObraIds === null) {
    return (
      <Modal
        title="Novo orçamento"
        subtitle="Carregando obras…"
        onClose={onClose}
        footer={<button className="btn btn-ghost" onClick={onClose}>Fechar</button>}
      >
        <div className="text-muted" style={{ textAlign: 'center', padding: '32px 0', fontSize: 13 }}>
          Carregando obras disponíveis…
        </div>
      </Modal>
    );
  }

  // Estado vazio: nenhuma obra cadastrada, ou todas já têm orçamento
  if (obrasDisponiveis.length === 0) {
    const semObras = obras.length === 0;
    return (
      <Modal
        title="Novo orçamento"
        subtitle={semObras ? 'Nenhuma obra disponível' : 'Todas as obras já têm orçamento'}
        onClose={onClose}
        footer={<button className="btn btn-ghost" onClick={onClose}>Fechar</button>}
      >
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Icon name="hard-hat" size={36} style={{ color: 'var(--text-faint)' }} />
          <div style={{ marginTop: 12, fontWeight: 600 }}>
            {semObras ? 'Cadastre uma obra primeiro' : 'Nenhuma obra sem orçamento'}
          </div>
          <div className="text-muted" style={{ marginTop: 6, fontSize: 13 }}>
            {semObras
              ? 'Todo orçamento precisa estar vinculado a uma obra.'
              : 'Cada obra já possui um orçamento. Para criar outra versão, use "Criar revisão" no orçamento existente.'}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Novo orçamento"
      subtitle="Preencha os dados iniciais do orçamento"
      onClose={onClose}
      draggable
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={onSave}
            disabled={loading}
          >
            <Icon name="check" size={14} />
            {loading ? 'Salvando…' : 'Criar orçamento'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field full">
          <label>Obra <span className="req">*</span></label>
          <select value={form.obra_id} onChange={e => handleObraChange(e.target.value)}>
            {obrasDisponiveis.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Versão</label>
          <input
            placeholder="v1"
            value={form.versao}
            onChange={e => setForm(f => ({ ...f, versao: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Status inicial</label>
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="rascunho">Rascunho</option>
            <option value="pendente">Pendente</option>
            <option value="aprovado">Aprovado</option>
          </select>
        </div>
      </div>
    </Modal>
  );
};

export { Modal, ToastProvider, useToast, NovaObraModal, ObraFormModal, NovaMedicaoModal, SolicitarCompraModal, NotifPanel, NovoOrcamentoModal };
