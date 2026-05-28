import React from 'react';
import { Icon } from './Icons';
import { AppData } from '../utils/data';

// Modals, toasts, dropdowns — shared interactive components

// ----- Modal shell -----
const Modal = ({ title, subtitle, onClose, footer, children, size = 'md' }) => {
  React.useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal ' + (size === 'lg' ? 'lg' : size === 'xl' ? 'xl' : '')}>
        <div className="modal-header">
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
  const push = (msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { id, msg, tone: opts.tone || 'success', icon: opts.icon || 'check' }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), opts.duration || 3000);
  };
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
              <label>BDI (%)</label>
              <input placeholder="0,0" defaultValue="25,5" />
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
  const toast = useToast();
  const isEdit = obra !== null;
  const [form, setForm] = React.useState({
    nome:         obra?.nome        || '',
    sigla:        obra?.id          || '',
    responsavel:  obra?.responsavel || '',
    endereco:     obra?.endereco    || '',
    dataPrevista: obra?.previsto    || '',
    // Campos futuros: cliente, tipo, area, orcamento, bdi, risco, observacoes
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.nome.trim()) return;
    let result;
    if (isEdit) {
      result = {
        ...obra,
        nome:        form.nome,
        id:          form.sigla.trim() || obra.id,
        responsavel: form.responsavel,
        endereco:    form.endereco,
        previsto:    form.dataPrevista || obra.previsto,
      };
    } else {
      result = {
        id:               form.sigla.trim() || `OB-${String(Date.now()).slice(-3)}`,
        nome:             form.nome,
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
        responsavel:      form.responsavel,
        equipe:           0,
        alertas:          0,
        contrato:         '',
      };
    }
    onSave(result);
    toast(isEdit ? 'Obra atualizada com sucesso' : 'Obra criada com sucesso', { tone: 'success', icon: 'check' });
  };

  return (
    <Modal
      title={isEdit ? 'Editar obra' : 'Nova obra'}
      subtitle={isEdit ? `Editando: ${obra.nome}` : 'Cadastro de nova obra'}
      onClose={onClose}
      footer={
        <>
          <div className="spacer"></div>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!form.nome.trim()}>
            <Icon name="check" size={14} />{isEdit ? 'Salvar alterações' : 'Criar obra'}
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
        <div className="field">
          <label>Responsável</label>
          <input
            placeholder="Nome do responsável"
            value={form.responsavel}
            onChange={e => set('responsavel', e.target.value)}
          />
        </div>
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
        {/* Campos futuros: cliente, tipo, área, orçamento, BDI, risco, observações */}
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

// ----- Notification panel (dropdown attached to bell icon) -----
const NotifPanel = ({ onClose }) => {
  const D = AppData;
  React.useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.notif-panel') && !e.target.closest('[data-notif-trigger]')) onClose();
    };
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, []);
  return (
    <div className="notif-panel">
      <div className="notif-header">
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Notificações</div>
          <div className="text-xs text-muted" style={{ marginTop: 2 }}>{D.notificacoes.filter(n => !n.lido).length} não lidas</div>
        </div>
        <button className="btn btn-sm btn-subtle" style={{ marginLeft: 'auto' }}>Marcar todas</button>
      </div>
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {D.notificacoes.map((n, i) => (
          <div key={i} className={'alert-item ' + n.tipo} style={{ borderBottom: '1px solid var(--border)', opacity: n.lido ? 0.7 : 1 }}>
            <div className={'alert-pill ' + n.tipo}></div>
            <div className="alert-icon">
              <Icon name={n.tipo === 'danger' ? 'alert-triangle' : n.tipo === 'warning' ? 'alert' : 'bell'} size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="alert-title" style={{ fontSize: 12.5 }}>{n.titulo}</div>
              <div className="alert-sub">{n.sub}</div>
            </div>
            <div className="alert-time">{n.tempo}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: 10, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
        <a style={{ fontSize: 12.5, fontWeight: 500 }}>Ver todas as notificações</a>
      </div>
    </div>
  );
};

// ----- Novo Orçamento modal -----
const NovoOrcamentoModal = ({ onClose }) => {
  const toast = useToast();
  const obras = AppData.obras || [];
  const [form, setForm] = React.useState({
    obra: obras[0]?.nome || '',
    cliente: '',
    versao: 'v1',
    bdi: '26,0',
    status: 'rascunho',
  });
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const onSave = () => {
    if (!form.obra || !form.cliente) return;
    toast('Orçamento criado com sucesso', { tone: 'success', icon: 'check' });
    onClose();
  };
  return (
    <Modal
      title="Novo orçamento"
      subtitle="Preencha os dados iniciais do orçamento"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onSave}>
            <Icon name="check" size={14} />Criar orçamento
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Obra <span className="req">*</span></label>
          <select value={form.obra} onChange={e => upd('obra', e.target.value)}>
            {obras.map(o => <option key={o.id} value={o.nome}>{o.nome}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Cliente <span className="req">*</span></label>
          <input
            placeholder="Nome do cliente"
            value={form.cliente}
            onChange={e => upd('cliente', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Versão</label>
          <input
            placeholder="v1"
            value={form.versao}
            onChange={e => upd('versao', e.target.value)}
          />
        </div>
        <div className="field">
          <label>BDI (%)</label>
          <input
            placeholder="0,0"
            value={form.bdi}
            onChange={e => upd('bdi', e.target.value)}
          />
        </div>
        <div className="field full">
          <label>Status inicial</label>
          <select value={form.status} onChange={e => upd('status', e.target.value)}>
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
