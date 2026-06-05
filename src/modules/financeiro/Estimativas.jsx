import React from 'react';
import { Icon } from '../../components/Icons';
import { AppData } from '../../utils/data';
import { supabase } from '../../services/supabase';
import { formatBRL, formatNum, formatPct } from '../../utils/formatters';
import {
  ESTIM_PROJETOS_REF, ESTIM_FLOORS_BASE, ESTIM_PROJETOS_ESPEC,
  ESTIM_ELEVADORES_REF, ESTIM_FUNDACAO_REF, ESTIM_PROPOSTAS_PROJ,
  ESTIM_IMPLANTACAO_BASE, ESTIM_IMPLANTACAO_DEFAULT, ESTIM_INCORPORACAO_DEFAULT,
} from './estimativasData';

// Estimativas — calculadora paramétrica de custos de obra
const { brl: brlES } = AppData;

// ----- Helpers -----
const fmtR    = (n) => formatBRL(n, 0);
const fmtR2   = (n) => formatBRL(n, 2);
const fmtNumES = (n, d = 2) => formatNum(n, d);
const fmtPctES = (n) => formatPct(n);

const calcItemsTotal = (items, fator) =>
  (items || []).filter(i => !i.isGroup).reduce((s, i) => s + (i.incc || 0) * fator, 0);

// ===========================================================
// MAIN ESTIMATIVAS SCREEN
// ===========================================================
const EstimativasScreen = () => {
  const [subtab, setSubtab] = React.useState(() => sessionStorage.getItem('estim_subtab') || 'nova');
  React.useEffect(() => { sessionStorage.setItem('estim_subtab', subtab); }, [subtab]);
  const [editingEstim, setEditingEstim] = React.useState(null);
  const [savedItems, setSavedItems] = React.useState([]);
  const [saveTrigger, setSaveTrigger] = React.useState(0);
  const [clearTrigger, setClearTrigger] = React.useState(0);
  const [refObras, setRefObras] = React.useState(ESTIM_PROJETOS_REF.map(p => ({ ...p })));

  React.useEffect(() => {
    supabase.from('estimativas_base').select('id, dados').eq('tipo', 'estimativa').order('id', { ascending: false })
      .then(({ data }) => setSavedItems((data || []).map(r => ({ ...r.dados, _dbId: r.id }))));

    const ch = supabase.channel('estim_salvas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estimativas_base', filter: 'tipo=eq.estimativa' }, p => {
        if (p.eventType === 'INSERT') setSavedItems(s => [{ ...p.new.dados, _dbId: p.new.id }, ...s]);
        else if (p.eventType === 'UPDATE') setSavedItems(s => s.map(e => e._dbId === p.new.id ? { ...p.new.dados, _dbId: p.new.id } : e));
        else if (p.eventType === 'DELETE') setSavedItems(s => s.filter(e => e._dbId !== p.old.id));
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);
  const fixedHeaderRef = React.useRef(null);
  const [spacerH, setSpacerH] = React.useState(170);
  React.useLayoutEffect(() => {
    if (fixedHeaderRef.current) setSpacerH(fixedHeaderRef.current.offsetHeight);
  }, [subtab, editingEstim]);

  const handleEditar = (estim) => {
    setEditingEstim(estim);
    setSubtab('nova');
  };

  const handleNova = () => {
    setEditingEstim(null);
    setSubtab('nova');
  };

  const handleSalvar = async (novoItem) => {
    const { error } = await supabase.from('estimativas_base').insert({ tipo: 'estimativa', dados: novoItem });
    if (error) {
      console.error('Erro ao salvar estimativa:', error);
      alert('Erro ao salvar: ' + error.message);
      return;
    }
    setEditingEstim(null);
    setSubtab('salvas');
  };

  return (
    <>
      <div ref={fixedHeaderRef} style={{ position: 'fixed', top: 52, left: 100, right: 0, zIndex: 99, background: 'var(--bg-app)' }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">Estimativas</h1>
            <div className="page-subtitle">Estimativa paramétrica de custos com base em projetos históricos · INCC Abr/2026 — 1.259,652</div>
          </div>
          <div className="page-actions">
            {subtab === 'nova' && (
              <>
                <button className="btn btn-ghost" style={{ color: '#e53e3e' }} onClick={() => setClearTrigger(t => t + 1)}>
                  <Icon name="refresh-cw" size={14} />Limpar dados
                </button>
                <button className="btn btn-ghost" onClick={() => {}}>
                  <Icon name="download" size={14} />Exportar
                </button>
                <button className="btn btn-primary" onClick={() => setSaveTrigger(t => t + 1)}>
                  <Icon name="check" size={14} />Salvar
                </button>
                <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 2px' }} />
              </>
            )}
            <button className="btn btn-primary" onClick={handleNova}><Icon name="plus" size={15} />Nova estimativa</button>
          </div>
        </div>
        <div className="tabs" style={{ boxShadow: '0 1px 0 var(--border)' }}>
          {[
            { id: 'nova',   label: editingEstim ? 'Editando estimativa' : 'Estimativa atual' },
            { id: 'salvas', label: 'Estimativas salvas' },
            { id: 'base',   label: 'Base de dados' },
          ].map(t => (
            <button key={t.id} className={'tab' + (subtab === t.id ? ' active' : '')} onClick={() => setSubtab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: spacerH }} />

      {subtab === 'nova' && <EstimativaAtual key={editingEstim ? editingEstim.id : '__nova__'} initialData={editingEstim} onSalvar={handleSalvar} saveTrigger={saveTrigger} clearTrigger={clearTrigger} refObras={refObras} />}
      {subtab === 'salvas' && <EstimativasSalvas items={savedItems} onEditar={handleEditar} />}
      <div style={{ display: subtab === 'base' ? '' : 'none' }}><BaseDados refObras={refObras} setRefObras={setRefObras} /></div>
    </>
  );
};

// ===========================================================
// ACCORDION GROUP COMPONENT
// ===========================================================
const AccordionGroup = ({ id, label, color, value, inccFator, open, onToggle, children, isSummary }) => {
  const hasContent = !isSummary && !!children;
  return (
    <div style={{
      background: isSummary ? (color + '0c') : 'var(--surface)',
      borderRadius: 'var(--r-lg)',
      border: isSummary ? ('1px solid ' + color + '30') : '1px solid var(--border)',
      overflow: 'hidden',
      boxShadow: isSummary ? 'none' : 'var(--shadow-xs)',
      borderLeft: '3px solid ' + color,
    }}>
      <button
        type="button"
        onClick={hasContent ? () => onToggle(id) : undefined}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: (isSummary ? '11px' : '13px') + ' 18px',
          background: 'none',
          border: 'none',
          cursor: hasContent ? 'pointer' : 'default',
          textAlign: 'left',
          fontFamily: 'inherit',
        }}
      >
        {hasContent ? (
          <div style={{
            width: 20, height: 20, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 5,
            background: open ? color : 'var(--bg-app)',
            color: open ? '#fff' : 'var(--text-muted)',
            transition: 'background 0.18s ease, color 0.18s ease',
          }}>
            <div style={{
              display: 'flex', lineHeight: 0,
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
            }}>
              <Icon name="chevron-right" size={11} />
            </div>
          </div>
        ) : (
          <div style={{ width: 20, flexShrink: 0 }} />
        )}

        <span style={{
          flex: 1,
          fontWeight: isSummary ? 700 : 600,
          fontSize: 13,
          color: isSummary ? color : 'var(--text)',
          fontFamily: 'var(--font-sans)',
          letterSpacing: isSummary ? '0.005em' : 0,
        }}>{label}</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {inccFator != null && !isSummary && (
            <span style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-faint)',
              background: 'var(--bg-app)',
              padding: '2px 7px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
            }}>INCC ×{fmtNumES(inccFator, 4)}</span>
          )}
          {value != null && (
            <span style={{
              fontSize: isSummary ? 14.5 : 13,
              fontWeight: isSummary ? 700 : 600,
              fontFamily: 'var(--font-mono)',
              color: isSummary ? color : 'var(--text-soft)',
              minWidth: 155,
              textAlign: 'right',
              letterSpacing: '-0.01em',
            }}>{fmtR(value)}</span>
          )}
        </div>
      </button>

      {hasContent && (
        <div style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ===========================================================
// CONFIRM DELETE ROW — renderiza dentro de <tbody>
// ===========================================================
const ConfirmDeleteRow = ({ conf, label, colSpan, onConfirm, onCancel }) => {
  if (!conf) return null;
  const isStep2 = conf.step === 2;
  return (
    <tr style={{
      background: isStep2 ? 'rgba(229,62,62,0.06)' : 'rgba(245,158,11,0.06)',
    }}>
      <td colSpan={colSpan} style={{ padding: '8px 14px', borderTop: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Icon name="alert" size={13} style={{ flexShrink: 0, color: isStep2 ? '#e53e3e' : '#d97706' }} />
          <span style={{
            flex: 1, fontSize: 12, fontWeight: 500,
            color: isStep2 ? '#c53030' : '#92400e',
          }}>
            {isStep2
              ? `Ação irreversível. Confirmar exclusão definitiva de "${label}"?`
              : `Excluir "${label}"?`}
          </span>
          <button
            className="btn btn-sm"
            style={{
              background: isStep2 ? '#e53e3e' : '#d97706',
              color: '#fff', border: 'none',
              padding: '4px 12px', fontSize: 11.5,
            }}
            onClick={onConfirm}
          >
            {isStep2 ? 'Excluir definitivamente' : 'Confirmar exclusão'}
          </button>
          <button className="btn btn-sm btn-ghost" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  );
};

// ===========================================================
// SUB: ESTIMATIVA ATUAL — calculadora
// ===========================================================
const EstimativaAtual = ({ initialData, onSalvar, saveTrigger, clearTrigger, refObras }) => {
  const initRefId = initialData
    ? (refObras.find(p => p.nome.startsWith(initialData.ref))?.id || null)
    : null;
  const [refId, setRefId] = React.useState(initRefId);
  const ref = refObras.find(p => p.id === refId);

  const inccAtual = 1259.652;
  const inccFator = ref ? inccAtual / ref.inccBase : 0;

  const [estim, setEstim] = React.useState({
    nome: '',
    endereco: '',
    areaConstruida: 0,
    areaProjTorre: 0,
    numPavtos: 0,
    numSubsolos: 0,
    numElevadores: 0,
    numParadas: 0,
    perimetroTorre: 0,
    alturaPredio: 0,
    prazoObra: 0,
    tipoFundacao: '',
    floors: [],
    custoConstrucaoM2: 0,
    custoFachadaM2: 0,
    custoElevador: 0,
    custoEnsaios: 0,
    custoAdminM2: 0,
    fachadaArea: 0,
    taxaAdm: 0,
    implantacaoItems: ESTIM_IMPLANTACAO_DEFAULT.map(i => ({ ...i, checked: false })),
    incorporacaoItems: ESTIM_INCORPORACAO_DEFAULT.map(i => ({ ...i, incc: 0 })),
    projetosItems: ESTIM_PROJETOS_ESPEC.map(p => ({ ...p, checked: false })),
  });

  // ----- Estado de confirmação de exclusão -----
  const [delConf, setDelConf] = React.useState(null); // { id, step, type, label }

  // ----- Estado de grupos expandidos (Incorporação) -----
  const [incorpExpGroups, setIncorpExpGroups] = React.useState(new Set(['incorp-mob']));

  // ----- Estado para save/clear confirmações -----
  const [saveConf, setSaveConf] = React.useState(false);
  const [clearConf, setClearConf] = React.useState(null); // null, 1, 2

  // ----- Triggers externos (botões do header) -----
  React.useEffect(() => { if (saveTrigger > 0) setSaveConf(true); }, [saveTrigger]);
  React.useEffect(() => { if (clearTrigger > 0) setClearConf(1); }, [clearTrigger]);

  // ----- Scroll position preservation (prevent jumping) -----
  const scrollYRef = React.useRef(0);
  const isScrollLockedRef = React.useRef(false);

  React.useLayoutEffect(() => {
    if (isScrollLockedRef.current && scrollYRef.current > 0) {
      window.scrollTo(0, scrollYRef.current);
      isScrollLockedRef.current = false;
    }
  });

  const preserveScroll = (callback) => {
    scrollYRef.current = window.scrollY;
    isScrollLockedRef.current = true;
    callback();
  };

  // ----- Auto-calculate numParadas = numPavimentos - 1 -----
  React.useLayoutEffect(() => {
    if (!estim.numPavtos) return;
    const newParadas = Math.max(1, estim.numPavtos - 1);
    if (newParadas !== estim.numParadas) {
      isScrollLockedRef.current = false;
      setEstim(s => ({ ...s, numParadas: newParadas }));
    }
  }, [estim.numPavtos]);

  // ----- Updaters genéricos -----
  const upd = (k, v) => preserveScroll(() => setEstim(s => ({ ...s, [k]: v })));

  // ----- Floors -----
  const updFloor = (id, k, v) => preserveScroll(() => setEstim(s => ({
    ...s,
    floors: s.floors.map(f => f.id === id ? { ...f, [k]: k === 'label' ? v : (parseFloat(v) || 0) } : f),
  })));
  const addFloor = () => {
    const newId = 'floor-' + Date.now();
    preserveScroll(() => setEstim(s => ({ ...s, floors: [...s.floors, { id: newId, label: 'Novo Pavimento', coef: '', area: '' }] })));
  };
  const deleteFloor = (id) => {
    preserveScroll(() => setEstim(s => ({ ...s, floors: s.floors.filter(f => f.id !== id) })));
  };
  const moveFloor = (id, dir) => {
    preserveScroll(() => {
      setEstim(s => {
        const idx = s.floors.findIndex(f => f.id === id);
        if (idx < 0) return s;
        const newIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= s.floors.length) return s;
        const arr = [...s.floors];
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        return { ...s, floors: arr };
      });
    });
  };

  // ----- Implantação -----
  const updImplItem = (id, k, v) => preserveScroll(() => setEstim(s => ({
    ...s,
    implantacaoItems: s.implantacaoItems.map(i => i.id === id ? { ...i, [k]: k === 'label' ? v : (parseFloat(v) || 0) } : i),
  })));
  const addImplItem = () => {
    const newId = 'impl-' + Date.now();
    preserveScroll(() => setEstim(s => ({ ...s, implantacaoItems: [...s.implantacaoItems, { id: newId, label: 'Novo Item', incc: 0 }] })));
  };
  const deleteImplItem = (id) => {
    preserveScroll(() => setEstim(s => ({ ...s, implantacaoItems: s.implantacaoItems.filter(i => i.id !== id) })));
  };
  const moveImplItem = (id, dir) => {
    preserveScroll(() => {
      setEstim(s => {
        const idx = s.implantacaoItems.findIndex(i => i.id === id);
        if (idx < 0) return s;
        const newIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= s.implantacaoItems.length) return s;
        const arr = [...s.implantacaoItems];
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        return { ...s, implantacaoItems: arr };
      });
    });
  };

  // ----- Incorporação -----
  const updIncorpItem = (id, k, v) => preserveScroll(() => setEstim(s => ({
    ...s,
    incorporacaoItems: s.incorporacaoItems.map(i => i.id === id ? { ...i, [k]: k === 'label' ? v : (parseFloat(v) || 0) } : i),
  })));
  const addIncorpItem = () => {
    const newId = 'incorp-' + Date.now();
    preserveScroll(() => setEstim(s => ({ ...s, incorporacaoItems: [...s.incorporacaoItems, { id: newId, label: 'Novo Item', incc: 0 }] })));
  };
  const addIncorpGroup = () => {
    const newId = 'incorp-g-' + Date.now();
    preserveScroll(() => setEstim(s => ({ ...s, incorporacaoItems: [...s.incorporacaoItems, { id: newId, label: 'Novo Grupo', isGroup: true }] })));
  };
  const addIncorpSubitem = (parentId) => {
    const newId = 'incorp-s-' + Date.now();
    preserveScroll(() => {
      setEstim(s => {
        const items = [...s.incorporacaoItems];
        let lastIdx = items.findIndex(i => i.id === parentId);
        for (let j = lastIdx + 1; j < items.length; j++) {
          if (items[j].parentId === parentId) lastIdx = j;
          else break;
        }
        items.splice(lastIdx + 1, 0, { id: newId, label: 'Novo Sub-Item', incc: 0, parentId });
        return { ...s, incorporacaoItems: items };
      });
    });
  };
  const deleteIncorpItem = (id) => {
    preserveScroll(() => {
      setEstim(s => ({
        ...s,
        incorporacaoItems: s.incorporacaoItems.filter(i => i.id !== id && i.parentId !== id),
      }));
    });
  };
  const moveIncorpItem = (id, dir) => {
    preserveScroll(() => {
      setEstim(s => {
        const idx = s.incorporacaoItems.findIndex(i => i.id === id);
        if (idx < 0) return s;
        const item = s.incorporacaoItems[idx];
        let newIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= s.incorporacaoItems.length) return s;
        // Don't move across parent boundaries
        const isSubItem = !!item.parentId;
        const targetItem = s.incorporacaoItems[newIdx];
        const targetIsSubItem = !!targetItem.parentId;
        if (isSubItem !== targetIsSubItem || (isSubItem && item.parentId !== targetItem.parentId)) return s;
        const arr = [...s.incorporacaoItems];
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        return { ...s, incorporacaoItems: arr };
      });
    });
  };
  const toggleIncorpGroup = (id) => {
    preserveScroll(() => {
      setIncorpExpGroups(s => {
        const next = new Set(s);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    });
  };

  // ----- Projetos -----
  const toggleProj = (id) => {
    preserveScroll(() => {
      setEstim(s => ({
        ...s,
        projetosItems: s.projetosItems.map(p => p.id === id ? { ...p, checked: !p.checked } : p),
      }));
    });
  };
  const updProjetoItem = (id, k, v) => preserveScroll(() => setEstim(s => ({
    ...s,
    projetosItems: s.projetosItems.map(p => p.id === id ? { ...p, [k]: k === 'esp' ? v : (parseFloat(v) || 0) } : p),
  })));
  const addProjetoItem = () => {
    const newId = Date.now();
    preserveScroll(() => setEstim(s => ({ ...s, projetosItems: [...s.projetosItems, { id: newId, esp: 'Nova Especialidade', rs_m2: 0, checked: true }] })));
  };
  const deleteProjetoItem = (id) => {
    preserveScroll(() => setEstim(s => ({ ...s, projetosItems: s.projetosItems.filter(p => p.id !== id) })));
  };
  const moveProjetoItem = (id, dir) => {
    preserveScroll(() => {
      setEstim(s => {
        const idx = s.projetosItems.findIndex(p => p.id === id);
        if (idx < 0) return s;
        const newIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= s.projetosItems.length) return s;
        const arr = [...s.projetosItems];
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        return { ...s, projetosItems: arr };
      });
    });
  };

  // ----- Dispatcher de exclusão definitiva -----
  const commitDelete = () => {
    if (!delConf) return;
    const { type, id } = delConf;
    preserveScroll(() => {
      if (type === 'floor')  deleteFloor(id);
      else if (type === 'impl')   deleteImplItem(id);
      else if (type === 'incorp') deleteIncorpItem(id);
      else if (type === 'proj')   deleteProjetoItem(id);
    });
    preserveScroll(() => setDelConf(null));
  };
  const showDeleteConfirm = (id, type, label) => {
    preserveScroll(() => setDelConf({ id, step: 1, type, label }));
  };
  const confirmStep = () => {
    if (!delConf) return;
    if (delConf.step === 1) {
      preserveScroll(() => setDelConf({ ...delConf, step: 2 }));
    } else {
      commitDelete();
    }
  };
  const cancelDelete = () => {
    preserveScroll(() => setDelConf(null));
  };

  // ----- CÁLCULOS -----
  const areaEqTotal    = estim.floors.reduce((sum, f) => sum + (parseFloat(f.area) || 0) * (parseFloat(f.coef) || 0), 0);
  const custoConstrucao= areaEqTotal * estim.custoConstrucaoM2 * inccFator;
  const custoFachada   = estim.fachadaArea * estim.custoFachadaM2 * inccFator;
  const custoElevadores= estim.custoElevador * estim.numElevadores * inccFator;
  const custoInfra     = ref && estim.areaConstruida > 0 ? (ref.custoInfra * (estim.areaConstruida / ref.areaConstruida)) * inccFator : 0;
  const custoImplantacao = calcItemsTotal(estim.implantacaoItems, inccFator);
  const custoEnsaios   = estim.custoEnsaios * inccFator;
  const custoAdmin     = estim.areaConstruida * estim.custoAdminM2 * inccFator;

  const custoProjetos = estim.projetosItems
    .filter(p => p.checked)
    .reduce((s, p) => s + (p.rs_m2 || 0) * estim.areaConstruida * inccFator, 0);

  const subtotal   = custoConstrucao + custoFachada + custoElevadores + custoInfra +
                     custoImplantacao + custoEnsaios + custoAdmin + custoProjetos;
  const taxaAdmRS  = subtotal * estim.taxaAdm;
  const incorpRS   = calcItemsTotal(estim.incorporacaoItems, inccFator);
  const totalFinal = subtotal + taxaAdmRS + incorpRS;
  const custoFinalM2 = estim.areaConstruida > 0 ? totalFinal / estim.areaConstruida : 0;

  const sections = [
    { label: 'Construção da obra',      value: custoConstrucao,  color: '#014386' },
    { label: 'Projetos & consultorias', value: custoProjetos,    color: '#1858a3' },
    { label: 'Infraestrutura',          value: custoInfra,       color: '#3d7fc9' },
    { label: 'Fachada',                 value: custoFachada,     color: '#5a98d8' },
    { label: 'Elevadores',              value: custoElevadores,  color: '#7eb4e8' },
    { label: 'Implantação',             value: custoImplantacao, color: '#b3711a' },
    { label: 'Ensaios',                 value: custoEnsaios,     color: '#1f8b5c' },
    { label: 'Administração',           value: custoAdmin,       color: '#8a95ad' },
    { label: 'Taxa adm. (10%)',         value: taxaAdmRS,        color: '#9b59b6' },
    { label: 'Incorporação',            value: incorpRS,         color: '#d97757' },
  ];

  // ----- Accordion state -----
  const ALL_GROUPS = ['config','info','construcao','implantacao','projetos','infra','elevadores','fachada','ensaios','admin','incorporacao','extras'];
  const [openGroups, setOpenGroups] = React.useState(new Set(['info','construcao','projetos']));

  const toggleGroup = (id) => {
    preserveScroll(() => {
      setOpenGroups(s => {
        const next = new Set(s);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    });
  };
  const allOpen  = openGroups.size === ALL_GROUPS.length;
  const toggleAll = () => {
    preserveScroll(() => {
      setOpenGroups(allOpen ? new Set() : new Set(ALL_GROUPS));
    });
  };
  const isOpen   = (id) => openGroups.has(id);


  const bodyPad  = { padding: '16px 18px 18px' };
  const flushWrap = { overflowX: 'auto' };

  // Dark header style for item tables
  const darkTh = {
    background: '#014386',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    padding: '9px 14px',
    borderBottom: 'none',
    whiteSpace: 'nowrap',
  };

  // Inline-editable label input style
  const inlineInput = {
    border: 'none', background: 'transparent', width: '100%',
    padding: 0, fontSize: 'inherit', fontFamily: 'inherit',
    color: 'inherit', outline: 'none',
  };

  return (
    <div className="stack">

      {/* ===== Banner de edição ===== */}
      {initialData && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderRadius:'var(--r-lg)', background:'#fffbeb', border:'1px solid #f6ad55', fontSize:13 }}>
          <Icon name="edit" size={14} style={{ color:'#d97706', flexShrink:0 }} />
          <span style={{ color:'#92400e' }}>Editando: <strong>{initialData.nome}</strong> · {initialData.rev} · {initialData.id}</span>
        </div>
      )}

      {/* ===== KPIs ===== */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label"><div className="kpi-icon"><Icon name="calculator" size={16} /></div>Custo total estimado</div>
          <div className="kpi-value num" style={{ fontSize: 24, marginTop: 8, color: 'var(--brand)' }}>{fmtR(totalFinal)}</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">Subtotal + adm + incorporação</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label"><div className="kpi-icon"><Icon name="building" size={16} /></div>Custo / m²</div>
          <div className="kpi-value num" style={{ fontSize: 24, marginTop: 8 }}>{fmtR2(custoFinalM2)}</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">Base: {fmtNumES(estim.areaConstruida, 0)} m²</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label"><div className="kpi-icon"><Icon name="layers" size={16} /></div>Área equivalente</div>
          <div className="kpi-value num" style={{ fontSize: 24, marginTop: 8 }}>{fmtNumES(areaEqTotal, 0)}<span className="unit">m²</span></div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">Ponderada por coeficientes</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: '14px 18px' }}>
          <div className="kpi-label"><div className="kpi-icon"><Icon name="trending-up" size={16} /></div>Fator INCC</div>
          <div className="kpi-value num" style={{ fontSize: 24, marginTop: 8 }}>{fmtNumES(inccFator, 4)}</div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>
            <span className="kpi-foot-text">INCC atual / INCC ref {ref && `(${fmtNumES(ref.inccBase, 3)})`}</span>
          </div>
        </div>
      </div>

      {/* ===== Expand / Collapse controls ===== */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, fontFamily: 'var(--font-sans)' }}>
          {openGroups.size} de {ALL_GROUPS.length} seções abertas
        </span>
        <button className="btn btn-sm btn-ghost" onClick={toggleAll}>
          <Icon name={allOpen ? 'chevron-up' : 'chevron-down'} size={13} />
          {allOpen ? 'Recolher todos' : 'Expandir todos'}
        </button>
      </div>

      {/* ===== 1. Configuração ===== */}
      <AccordionGroup id="config" open={isOpen("config")} onToggle={toggleGroup} label="Configuração" color="#6b7890">
        <div style={bodyPad}>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field">
              <label>Projeto de referência</label>
              <select value={refId || ''} onChange={e => {
                const newId = e.target.value ? +e.target.value : null;
                setRefId(newId);
                if (newId) {
                  const sel = refObras.find(p => p.id === newId);
                  if (sel) {
                    let newFloors;
                    if (sel.coefPavimentos && sel.coefPavimentos.length > 0) {
                      // usa exatamente os pavimentos cadastrados na obra de referência
                      newFloors = sel.coefPavimentos.map(p => ({
                        id: 'floor-' + p.id,
                        label: p.label,
                        coef: p.coef,
                        area: 0,
                      }));
                    } else {
                      // fallback para projetos legados sem coefPavimentos
                      const coefMap = {
                        subsolo:       sel.coefSubsolo   ?? 1.20,
                        semienterrado: sel.coefSemiEnt   ?? 1.08,
                        terreo:        sel.coefTerreo    ?? 1.00,
                        intermediario: 0.95,
                        tipo:          sel.coefTipo      ?? 1.00,
                        cobertura:     sel.coefCobertura ?? 0.85,
                        caixaAgua:     sel.coefCxAgua    ?? 0.50,
                      };
                      newFloors = ESTIM_FLOORS_BASE.map(f => ({
                        ...f,
                        id: 'floor-' + f.id,
                        coef: coefMap[f.id] ?? f.coef,
                      }));
                    }
                    setEstim(s => ({ ...s, floors: newFloors }));
                  }
                }
              }}>
                <option value="">Selecionar</option>
                {refObras.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Tipo</label>
              <input readOnly value={ref?.tipo || ''} style={{ background: 'var(--bg-app)', color: 'var(--text-muted)' }} />
            </div>
          </div>
          {ref && (
            <>
              <div style={{ display: 'flex', gap: 0, marginTop: 14, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {[
                  { label: 'INCC atual (Abr/2026)', val: '1.259,652', highlight: true },
                  { label: 'INCC base (ref.)',       val: fmtNumES(ref.inccBase, 3) },
                  { label: 'Fator de correção',       val: fmtNumES(inccFator, 4) + '×', brand: true },
                  { label: 'Área ref. (m²)',          val: fmtNumES(ref.areaConstruida, 0) },
                ].map((item, i) => (
                  <div key={i} style={{
                    flex: 1, padding: '10px 14px',
                    borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                    background: item.highlight ? 'var(--brand-50)' : 'var(--bg-app)',
                  }}>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>{item.label}</div>
                    <div style={{
                      fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700,
                      color: item.brand ? 'var(--brand)' : item.highlight ? 'var(--brand)' : 'var(--text)',
                      letterSpacing: '-0.01em',
                    }}>{item.val}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 20px', fontSize: 12.5 }}>
                <RefRow label="Fundação" v={ref.fundacao} />
                <RefRow label="Elevadores" v={`${ref.numElevadores} (${ref.numParadas} paradas)`} />
                <RefRow label="Pavimentos / subsolos" v={`${ref.numPavtos} / ${ref.numSubsolos}`} />
                <RefRow label="Custo construção/m²" v={fmtR2(ref.custoConstrucaoM2)} mono strong />
              </div>
            </>
          )}
        </div>
      </AccordionGroup>

      {/* ===== 2. Informações do Empreendimento ===== */}
      <AccordionGroup id="info" open={isOpen("info")} onToggle={toggleGroup} label="Informações do Empreendimento" color="#1858a3">
        <div style={bodyPad}>
          {/* Linha 1: Nome + Endereço */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)', marginBottom: 12 }}>
            <div className="field">
              <label>Nome do Projeto</label>
              <input value={estim.nome} onChange={e => upd('nome', e.target.value)} />
            </div>
            <div className="field">
              <label>Endereço</label>
              <input value={estim.endereco} onChange={e => upd('endereco', e.target.value)} />
            </div>
          </div>
          {/* Linha 2: 4 colunas — dimensões */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--gap)', marginBottom: 12 }}>
            <NumField label="Área construída (m²)" v={estim.areaConstruida} on={v => upd('areaConstruida', v)} />
            <NumField label="Área proj. torre (m²)" v={estim.areaProjTorre} on={v => upd('areaProjTorre', v)} />
            <NumField label="Perímetro torre (m)" v={estim.perimetroTorre} on={v => upd('perimetroTorre', v)} dec={0} />
            <NumField label="Altura do prédio (m)" v={estim.alturaPredio} on={v => upd('alturaPredio', v)} dec={0} />
          </div>
          {/* Linha 3: 4 colunas — pavimentos e prazos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--gap)', marginBottom: 12 }}>
            <NumField label="Nº de pavimentos" v={estim.numPavtos} on={v => upd('numPavtos', v)} dec={0} />
            <NumField label="Nº de subsolos" v={estim.numSubsolos} on={v => upd('numSubsolos', v)} dec={0} />
            <NumField label="Prazo da obra (meses)" v={estim.prazoObra} on={v => upd('prazoObra', v)} dec={0} />
            <NumField label="Nº de elevadores" v={estim.numElevadores} on={v => upd('numElevadores', v)} dec={0} />
          </div>
          {/* Linha 4: Paradas + Fundação */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)' }}>
            <NumField label="Nº de paradas / elevador" v={estim.numParadas} on={v => upd('numParadas', v)} dec={0} />
            <div className="field">
              <label>Tipo de Fundação</label>
              <select value={estim.tipoFundacao} onChange={e => upd('tipoFundacao', e.target.value)}>
                <option value="">— Selecione —</option>
                {['Estaca Hélice Contínua','Estaca Raiz','Sapata Armada','Estaca Escavada','Radier','Tubulão a Céu Aberto'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </AccordionGroup>

      {/* ===== 3. Custo de Construção ===== */}
      <AccordionGroup id="construcao" open={isOpen("construcao")} onToggle={toggleGroup} label="Custo de Construção" color="#014386" value={custoConstrucao} inccFator={inccFator}>
        <div style={{ padding: '16px 18px 12px' }}>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 16 }}>
            <NumField label="Construção / m² (R$)" v={estim.custoConstrucaoM2} on={v => upd('custoConstrucaoM2', v)} />
            <div className="field">
              <label>Área equivalente total</label>
              <input readOnly value={fmtNumES(areaEqTotal, 1) + ' m²'} style={{ background: 'var(--bg-app)', color: 'var(--text-muted)' }} />
            </div>
          </div>
        </div>
        <div style={flushWrap}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={darkTh}>Pavimento</th>
                <th style={{ ...darkTh, textAlign: 'right' }}>Área real (m²)</th>
                <th style={{ ...darkTh, textAlign: 'center' }}>Coeficiente</th>
                <th style={{ ...darkTh, textAlign: 'right' }}>Área equiv. (m²)</th>
                <th style={{ ...darkTh, textAlign: 'right' }}>Custo na construção</th>
                <th style={{ ...darkTh, width: 76 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {estim.floors.map((f) => {
                const areaEq    = (parseFloat(f.area) || 0) * (parseFloat(f.coef) || 0);
                const custoFloor = areaEq * estim.custoConstrucaoM2 * inccFator;
                return (
                  <React.Fragment key={f.id}>
                    <tr>
                      <td className="strong">
                        <input value={f.label} onChange={e => updFloor(f.id, 'label', e.target.value)}
                          style={{ ...inlineInput, fontWeight: 600, minWidth: 130 }} />
                      </td>
                      <td className="right">
                        <input className="input num" value={f.area}
                          onChange={e => updFloor(f.id, 'area', e.target.value)}
                          style={{ width: 100, height: 30, textAlign: 'right', padding: '0 8px' }} />
                      </td>
                      <td className="center">
                        <input className="input num" value={f.coef}
                          onChange={e => updFloor(f.id, 'coef', e.target.value)}
                          style={{ width: 80, height: 30, textAlign: 'center', padding: '0 8px' }} />
                      </td>
                      <td className="right mono num strong">{fmtNumES(areaEq, 1)}</td>
                      <td className="right mono num">{fmtR(custoFloor)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                          <button className="icon-btn" style={{ width: 26, height: 26 }} title="Mover para cima"
                            onClick={() => moveFloor(f.id, 'up')}>
                            <Icon name="chevron-up" size={12} />
                          </button>
                          <button className="icon-btn" style={{ width: 26, height: 26 }} title="Mover para baixo"
                            onClick={() => moveFloor(f.id, 'down')}>
                            <Icon name="chevron-down" size={12} />
                          </button>
                          <button className="icon-btn" style={{ width: 26, height: 26, color: delConf && delConf.id === f.id ? '#e53e3e' : 'var(--text-faint)' }}
                            onClick={() => preserveScroll(() => setDelConf({ id: f.id, step: 1, type: 'floor', label: f.label }))}>
                            <Icon name="trash" size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {delConf && delConf.id === f.id && (
                      <ConfirmDeleteRow conf={delConf} label={f.label} colSpan={6}
                        onConfirm={confirmStep} onCancel={cancelDelete} />
                    )}
                  </React.Fragment>
                );
              })}
              <tr style={{ background: 'var(--brand-tint)' }}>
                <td className="strong" style={{ color: 'var(--brand)' }}>TOTAL</td>
                <td className="right mono num strong" style={{ color: 'var(--brand)' }}>
                  {fmtNumES(estim.floors.reduce((s, f) => s + (parseFloat(f.area) || 0), 0), 0)}
                </td>
                <td></td>
                <td className="right mono num strong" style={{ color: 'var(--brand)' }}>{fmtNumES(areaEqTotal, 1)}</td>
                <td className="right mono num strong" style={{ color: 'var(--brand)' }}>{fmtR(custoConstrucao)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 18px 14px' }}>
          <button className="btn btn-sm btn-ghost" onClick={addFloor}>
            <Icon name="plus" size={13} />Adicionar pavimento
          </button>
        </div>
      </AccordionGroup>

      {/* ===== 4. Implantação da Obra ===== */}
      <AccordionGroup id="implantacao" open={isOpen("implantacao")} onToggle={toggleGroup} label="Implantação da Obra" color="#b3711a" value={custoImplantacao} inccFator={inccFator}>
        <div style={flushWrap}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ ...darkTh, width: 36, textAlign: 'center' }}>#</th>
                <th style={darkTh}>Descrição</th>
                <th style={{ ...darkTh, textAlign: 'right' }}>Valor INCC</th>
                <th style={{ ...darkTh, textAlign: 'right' }}>Valor R$</th>
                <th style={{ ...darkTh, width: 76 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {estim.implantacaoItems.map((item, idx) => (
                <React.Fragment key={item.id}>
                  <tr>
                    <td className="center mono text-muted" style={{ fontSize: 11 }}>{idx + 1}</td>
                    <td>
                      <input value={item.label} onChange={e => updImplItem(item.id, 'label', e.target.value)}
                        style={{ ...inlineInput, minWidth: 160 }} />
                    </td>
                    <td className="right">
                      <input className="input num" value={item.incc}
                        onChange={e => updImplItem(item.id, 'incc', e.target.value)}
                        style={{ width: 120, height: 28, textAlign: 'right', padding: '0 8px' }} />
                    </td>
                    <td className="right mono num">{fmtR((item.incc || 0) * inccFator)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                        <button className="icon-btn" style={{ width: 26, height: 26 }} title="Mover para cima"
                          onClick={() => moveImplItem(item.id, 'up')}>
                          <Icon name="chevron-up" size={12} />
                        </button>
                        <button className="icon-btn" style={{ width: 26, height: 26 }} title="Mover para baixo"
                          onClick={() => moveImplItem(item.id, 'down')}>
                          <Icon name="chevron-down" size={12} />
                        </button>
                        <button className="icon-btn" style={{ width: 26, height: 26, color: delConf && delConf.id === item.id ? '#e53e3e' : 'var(--text-faint)' }}
                          onClick={() => preserveScroll(() => setDelConf({ id: item.id, step: 1, type: 'impl', label: item.label }))}>
                          <Icon name="trash" size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {delConf && delConf.id === item.id && (
                    <ConfirmDeleteRow conf={delConf} label={item.label} colSpan={5}
                      onConfirm={confirmStep} onCancel={cancelDelete} />
                  )}
                </React.Fragment>
              ))}
              <tr style={{ background: 'var(--bg-app)' }}>
                <td></td>
                <td className="strong" style={{ color: '#b3711a' }}>TOTAL IMPLANTAÇÃO</td>
                <td></td>
                <td className="right mono num strong" style={{ color: '#b3711a' }}>{fmtR(custoImplantacao)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 18px 14px' }}>
          <button className="btn btn-sm btn-ghost" onClick={addImplItem}>
            <Icon name="plus" size={13} />Adicionar item
          </button>
        </div>
      </AccordionGroup>

      {/* ===== 5. Projetos e Consultorias ===== */}
      <AccordionGroup id="projetos" open={isOpen("projetos")} onToggle={toggleGroup} label="Projetos e Consultorias" color="#1f8b5c" value={custoProjetos} inccFator={inccFator}>
        <div style={{ padding: '12px 18px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            {estim.projetosItems.filter(p => p.checked).length} de {estim.projetosItems.length} especialidades selecionadas
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => preserveScroll(() => setEstim(s => ({ ...s, projetosItems: s.projetosItems.map(p => ({ ...p, checked: true })) })))}>
              Selecionar todos
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => preserveScroll(() => setEstim(s => ({ ...s, projetosItems: s.projetosItems.map(p => ({ ...p, checked: false })) })))}>
              Limpar
            </button>
          </div>
        </div>
        <div style={{ ...flushWrap, marginTop: 10 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ ...darkTh, width: 50, textAlign: 'center' }}>Incluir</th>
                <th style={darkTh}>Especialidade</th>
                <th style={{ ...darkTh, textAlign: 'right' }}>R$ / m² (base ref.)</th>
                <th style={{ ...darkTh, textAlign: 'right' }}>Subtotal corrigido (INCC)</th>
                <th style={{ ...darkTh, textAlign: 'right' }}>% sobre área</th>
                <th style={{ ...darkTh, width: 76 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {estim.projetosItems.map(p => {
                const checked = p.checked;
                const subt    = (p.rs_m2 || 0) * estim.areaConstruida * inccFator;
                return (
                  <React.Fragment key={p.id}>
                    <tr style={{ opacity: checked ? 1 : 0.55 }}>
                      <td className="center">
                        <div className={'switch' + (checked ? ' on' : '')}
                          onClick={() => toggleProj(p.id)} style={{ margin: '0 auto' }}></div>
                      </td>
                      <td className="strong">
                        <input value={p.esp} onChange={e => updProjetoItem(p.id, 'esp', e.target.value)}
                          style={{ ...inlineInput, fontWeight: 600, minWidth: 160 }} />
                      </td>
                      <td className="right">
                        <input className="input num" value={p.rs_m2}
                          onChange={e => updProjetoItem(p.id, 'rs_m2', e.target.value)}
                          style={{ width: 90, height: 28, textAlign: 'right', padding: '0 8px' }} />
                      </td>
                      <td className="right mono num strong">{checked ? fmtR(subt) : '—'}</td>
                      <td className="right mono num text-muted">{checked && custoConstrucao > 0 ? ((subt / custoConstrucao) * 100).toFixed(2) + '%' : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                          <button className="icon-btn" style={{ width: 26, height: 26 }} title="Mover para cima"
                            onClick={() => moveProjetoItem(p.id, 'up')}>
                            <Icon name="chevron-up" size={12} />
                          </button>
                          <button className="icon-btn" style={{ width: 26, height: 26 }} title="Mover para baixo"
                            onClick={() => moveProjetoItem(p.id, 'down')}>
                            <Icon name="chevron-down" size={12} />
                          </button>
                          <button className="icon-btn" style={{ width: 26, height: 26, color: delConf && delConf.id === p.id ? '#e53e3e' : 'var(--text-faint)' }}
                            onClick={() => preserveScroll(() => setDelConf({ id: p.id, step: 1, type: 'proj', label: p.esp }))}>
                            <Icon name="trash" size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {delConf && delConf.id === p.id && (
                      <ConfirmDeleteRow conf={delConf} label={p.esp} colSpan={6}
                        onConfirm={confirmStep} onCancel={cancelDelete} />
                    )}
                  </React.Fragment>
                );
              })}
              <tr style={{ background: 'var(--brand-tint)' }}>
                <td></td>
                <td className="strong" style={{ color: 'var(--brand)' }}>TOTAL PROJETOS</td>
                <td></td>
                <td className="right mono num strong" style={{ color: 'var(--brand)' }}>{fmtR(custoProjetos)}</td>
                <td className="right mono num strong" style={{ color: 'var(--brand)' }}>{subtotal > 0 ? ((custoProjetos / subtotal) * 100).toFixed(2) + '%' : '—'}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 18px 14px' }}>
          <button className="btn btn-sm btn-ghost" onClick={addProjetoItem}>
            <Icon name="plus" size={13} />Adicionar especialidade
          </button>
        </div>
      </AccordionGroup>

      {/* ===== 6. Infraestrutura ===== */}
      <AccordionGroup id="infra" open={isOpen("infra")} onToggle={toggleGroup} label="Infraestrutura" color="#3d7fc9" value={custoInfra} inccFator={inccFator}>
        <div style={bodyPad}>
          {ref && (
            <div style={{ padding: '12px 16px', background: 'var(--bg-app)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, marginBottom: 14 }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>Calculado por proporção de área em relação ao projeto de referência, corrigido pelo INCC.</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>Custo infra ref.</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtR(ref.custoInfra)}</div>
                </div>
                <div style={{ color: 'var(--text-muted)', alignSelf: 'center', fontSize: 11 }}>
                  × ({fmtNumES(estim.areaConstruida, 0)} / {fmtNumES(ref.areaConstruida, 0)} m²)
                </div>
                <div style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>×</div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>Fator INCC</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtNumES(inccFator, 4)}</div>
                </div>
                <div style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>=</div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>Valor corrigido</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#3d7fc9' }}>{fmtR(custoInfra)}</div>
                </div>
              </div>
            </div>
          )}
          {ref && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Fator de área: {fmtNumES(estim.areaConstruida / ref.areaConstruida, 4)}×
              &nbsp;·&nbsp;Para ajustar, altere a área construída em <strong>Informações do Empreendimento</strong>.
            </div>
          )}
        </div>
      </AccordionGroup>

      {/* ===== 7. Elevadores ===== */}
      <AccordionGroup id="elevadores" open={isOpen("elevadores")} onToggle={toggleGroup} label="Elevadores" color="#5a8dee" value={custoElevadores} inccFator={inccFator}>
        <div style={bodyPad}>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <NumField label="Nº de elevadores" v={estim.numElevadores} on={v => upd('numElevadores', v)} dec={0} />
            <NumField label="Nº de paradas" v={estim.numParadas} on={v => upd('numParadas', v)} dec={0} />
            <NumField label="Custo por unidade (R$)" v={estim.custoElevador} on={v => upd('custoElevador', v)} dec={0} />
          </div>
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--bg-app)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5 }}>
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>Custo base (unitário × qtd)</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtR(estim.custoElevador * estim.numElevadores)}</div>
              </div>
              <div style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>× INCC {fmtNumES(inccFator, 4)} =</div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>Total corrigido</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#5a8dee' }}>{fmtR(custoElevadores)}</div>
              </div>
            </div>
          </div>
        </div>
      </AccordionGroup>

      {/* ===== 8. Fachada ===== */}
      <AccordionGroup id="fachada" open={isOpen("fachada")} onToggle={toggleGroup} label="Fachada" color="#7b5ea7" value={custoFachada} inccFator={inccFator}>
        <div style={bodyPad}>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <NumField label="Área de fachada (m²)" v={estim.fachadaArea} on={v => upd('fachadaArea', v)} dec={0} />
            <NumField label="Custo fachada / m² (R$)" v={estim.custoFachadaM2} on={v => upd('custoFachadaM2', v)} />
          </div>
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--bg-app)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5 }}>
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>Custo base (área × unitário)</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtR(estim.fachadaArea * estim.custoFachadaM2)}</div>
              </div>
              <div style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>× INCC {fmtNumES(inccFator, 4)} =</div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>Total corrigido</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#7b5ea7' }}>{fmtR(custoFachada)}</div>
              </div>
            </div>
          </div>
        </div>
      </AccordionGroup>

      {/* ===== 9. Ensaios + Sistemas ===== */}
      <AccordionGroup id="ensaios" open={isOpen("ensaios")} onToggle={toggleGroup} label="Ensaios + Sistemas" color="#2da88a" value={custoEnsaios} inccFator={inccFator}>
        <div style={bodyPad}>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <NumField label="Ensaios e laudos (R$)" v={estim.custoEnsaios} on={v => upd('custoEnsaios', v)} dec={0} />
            <div className="field">
              <label>Total corrigido (INCC)</label>
              <input readOnly value={fmtR(custoEnsaios)} style={{ background: 'var(--bg-app)', color: '#2da88a', fontFamily: 'var(--font-mono)', fontWeight: 700 }} />
            </div>
          </div>
        </div>
      </AccordionGroup>

      {/* ===== 10. Administração ===== */}
      <AccordionGroup id="admin" open={isOpen("admin")} onToggle={toggleGroup} label="Administração" color="#8a95ad" value={custoAdmin} inccFator={inccFator}>
        <div style={bodyPad}>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <NumField label="Administração / m² (R$)" v={estim.custoAdminM2} on={v => upd('custoAdminM2', v)} />
            <div className="field">
              <label>Total corrigido (INCC)</label>
              <input readOnly value={fmtR(custoAdmin)} style={{ background: 'var(--bg-app)', color: '#8a95ad', fontFamily: 'var(--font-mono)', fontWeight: 700 }} />
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            Base: {fmtNumES(estim.areaConstruida, 0)} m² × R$ {fmtNumES(estim.custoAdminM2)} / m² × {fmtNumES(inccFator, 4)} (INCC)
          </div>
        </div>
      </AccordionGroup>

      {/* ===== 11. Custo Total s/ Incorporação — SUMMARY ===== */}
      <AccordionGroup id="total1" label="Custo Total s/ Incorporação" color="#014386" value={subtotal} isSummary />

      {/* ===== 12. Incorporação ===== */}
      <AccordionGroup id="incorporacao" open={isOpen("incorporacao")} onToggle={toggleGroup} label="Incorporação" color="#d97757" value={incorpRS}>
        <div style={flushWrap}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ ...darkTh, width: 40, textAlign: 'center' }}>Ordem</th>
                <th style={darkTh}>Item</th>
                <th style={{ ...darkTh, textAlign: 'right' }}>Custo INCC</th>
                <th style={{ ...darkTh, textAlign: 'right' }}>Custo R$</th>
                <th style={{ ...darkTh, width: 104, textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let rowIdx = 0;
                return estim.incorporacaoItems.map((item) => {
                  const isVisible = !item.parentId || incorpExpGroups.has(item.parentId);
                  if (!isVisible) return null;

                  if (item.isGroup) {
                    const groupExpanded = incorpExpGroups.has(item.id);
                    const subItems = estim.incorporacaoItems.filter(i => i.parentId === item.id);
                    const groupTotal = subItems.reduce((s, i) => s + (i.incc || 0) * inccFator, 0);
                    rowIdx++;
                    return (
                      <React.Fragment key={item.id}>
                        <tr style={{ background: 'var(--brand-50)' }}>
                          <td className="center mono text-muted" style={{ fontSize: 11 }}>{rowIdx}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button className="icon-btn" style={{ width: 22, height: 22, flexShrink: 0 }}
                                onClick={() => toggleIncorpGroup(item.id)}>
                                <div style={{
                                  display: 'flex', lineHeight: 0,
                                  transform: groupExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.2s',
                                }}>
                                  <Icon name="chevron-right" size={11} />
                                </div>
                              </button>
                              <input value={item.label} onChange={e => updIncorpItem(item.id, 'label', e.target.value)}
                                style={{ ...inlineInput, fontWeight: 600, color: 'var(--brand)', minWidth: 160 }} />
                            </div>
                          </td>
                          <td></td>
                          <td className="right mono num strong" style={{ color: 'var(--brand)' }}>{fmtR(groupTotal)}</td>
                          <td className="center">
                            <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                              <button className="icon-btn" style={{ width: 26, height: 26 }} title="Adicionar sub-item"
                                onClick={() => { addIncorpSubitem(item.id); setIncorpExpGroups(s => new Set([...s, item.id])); }}>
                                <Icon name="plus" size={12} />
                              </button>
                              <button className="icon-btn" style={{ width: 26, height: 26, color: delConf && delConf.id === item.id ? '#e53e3e' : 'var(--text-faint)' }}
                                onClick={() => preserveScroll(() => setDelConf({ id: item.id, step: 1, type: 'incorp', label: item.label }))}>
                                <Icon name="trash" size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {delConf && delConf.id === item.id && (
                          <ConfirmDeleteRow conf={delConf} label={item.label} colSpan={5}
                            onConfirm={confirmStep} onCancel={cancelDelete} />
                        )}
                      </React.Fragment>
                    );
                  }

                  // Item regular ou sub-item
                  const isSubItem = !!item.parentId;
                  if (!isSubItem) rowIdx++;
                  return (
                    <React.Fragment key={item.id}>
                      <tr>
                        <td className="center mono text-muted" style={{ fontSize: 11 }}>
                          {isSubItem ? '' : rowIdx}
                        </td>
                        <td style={{ paddingLeft: isSubItem ? 40 : 14 }}>
                          <input value={item.label} onChange={e => updIncorpItem(item.id, 'label', e.target.value)}
                            style={{ ...inlineInput, fontSize: isSubItem ? 12.5 : 13, minWidth: 160 }} />
                        </td>
                        <td className="right">
                          <input className="input num" value={item.incc}
                            onChange={e => updIncorpItem(item.id, 'incc', e.target.value)}
                            style={{ width: 120, height: 28, textAlign: 'right', padding: '0 8px' }} />
                        </td>
                        <td className="right mono num">{fmtR((item.incc || 0) * inccFator)}</td>
                        <td className="center">
                          <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                            <button className="icon-btn" style={{ width: 26, height: 26 }} title="Mover para cima"
                              onClick={() => moveIncorpItem(item.id, 'up')}>
                              <Icon name="chevron-up" size={12} />
                            </button>
                            <button className="icon-btn" style={{ width: 26, height: 26 }} title="Mover para baixo"
                              onClick={() => moveIncorpItem(item.id, 'down')}>
                              <Icon name="chevron-down" size={12} />
                            </button>
                            <button className="icon-btn" style={{ width: 26, height: 26, color: delConf && delConf.id === item.id ? '#e53e3e' : 'var(--text-faint)' }}
                              onClick={() => preserveScroll(() => setDelConf({ id: item.id, step: 1, type: 'incorp', label: item.label }))}>
                              <Icon name="trash" size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {delConf && delConf.id === item.id && (
                        <ConfirmDeleteRow conf={delConf} label={item.label} colSpan={5}
                          onConfirm={confirmStep} onCancel={cancelDelete} />
                      )}
                    </React.Fragment>
                  );
                });
              })()}
              <tr style={{ background: 'var(--bg-app)' }}>
                <td></td>
                <td className="strong" style={{ color: '#d97757' }}>TOTAL INCORPORAÇÃO</td>
                <td></td>
                <td className="right mono num strong" style={{ color: '#d97757' }}>{fmtR(incorpRS)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 18px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-ghost" onClick={addIncorpItem}>
            <Icon name="plus" size={13} />Adicionar item
          </button>
          <button className="btn btn-sm btn-ghost" onClick={addIncorpGroup}>
            <Icon name="plus" size={13} />Adicionar grupo
          </button>
        </div>
      </AccordionGroup>

      {/* ===== 13. Extras ===== */}
      <AccordionGroup id="extras" open={isOpen("extras")} onToggle={toggleGroup} label="Extras (Taxa de Administração)" color="#9b59b6" value={taxaAdmRS}>
        <div style={bodyPad}>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <NumField label="Taxa de administração (%)" v={estim.taxaAdm * 100} on={v => upd('taxaAdm', v / 100)} suffix="%" />
            <div className="field">
              <label>Valor calculado</label>
              <input readOnly value={fmtR(taxaAdmRS)} style={{ background: 'var(--bg-app)', color: '#9b59b6', fontFamily: 'var(--font-mono)', fontWeight: 700 }} />
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            Base de cálculo: {fmtR(subtotal)} (subtotal direto) × {fmtPctES(estim.taxaAdm)}
          </div>
        </div>
      </AccordionGroup>

      {/* ===== 14. Custo Total s/ Taxa de Administração — SUMMARY ===== */}
      <AccordionGroup id="total2" label="Custo Total s/ Taxa de Administração" color="#013a76" value={subtotal + incorpRS} isSummary />

      {/* ===== 15. Custo Total c/ Taxa de Administração — SUMMARY ===== */}
      <AccordionGroup id="total3" label="Custo Total c/ Taxa de Administração" color="#014386" value={totalFinal} isSummary />

      {/* ===== Bottom: Distribution + Actions ===== */}
      <div className="grid-cols-3-2" style={{ marginTop: 4 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Composição financeira</div>
              <div className="card-subtitle">Desdobramento das seções até o total final</div>
            </div>
            <button className="icon-btn"><Icon name="dots" size={16} /></button>
          </div>
          <div className="card-body flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Seção</th>
                  <th className="right">Valor</th>
                  <th className="right">% subtotal</th>
                  <th style={{ width: 180 }}>Participação</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s, i) => (
                  <tr key={i}>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }}></span>
                        <span className="strong">{s.label}</span>
                      </span>
                    </td>
                    <td className="right mono num strong">{fmtR(s.value)}</td>
                    <td className="right mono num text-muted">{subtotal > 0 ? ((s.value / subtotal) * 100).toFixed(1) + '%' : '—'}</td>
                    <td>
                      <div className="progress" style={{ height: 5 }}>
                        <span style={{ width: sections[0].value > 0 ? ((s.value / sections[0].value) * 100) + '%' : '0%', background: s.color }}></span>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                  <td className="strong">Subtotal direto</td>
                  <td className="right mono num strong">{fmtR(subtotal)}</td>
                  <td className="right mono num">100,0%</td>
                  <td></td>
                </tr>
                <tr style={{ background: 'var(--brand-tint)' }}>
                  <td className="strong" style={{ color: 'var(--brand)', fontSize: 14 }}>TOTAL FINAL</td>
                  <td className="right mono num strong" style={{ color: 'var(--brand)', fontSize: 14 }}>{fmtR(totalFinal)}</td>
                  <td className="right mono num strong" style={{ color: 'var(--brand)' }}>—</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Distribuição</div>
          </div>
          <div className="card-body">
            <DistRing sections={sections} total={subtotal} />
          </div>
        </div>
      </div>

      {/* ===== Save Confirmation Modal ===== */}
      {saveConf && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: '24px',
            maxWidth: 400, boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
              Salvar estimativa?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 20 }}>
              A estimativa será salva com o nome "<strong>{estim.nome}</strong>". Você poderá recuperá-la posteriormente na aba de <strong>Estimativas salvas</strong>.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => preserveScroll(() => setSaveConf(false))}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={() => {
                setSaveConf(false);
                if (onSalvar && ref) {
                  const today = new Date().toLocaleDateString('pt-BR');
                  onSalvar({
                    id: 'EST-' + String(Date.now()).slice(-4),
                    nome: estim.nome,
                    ref: ref.nome,
                    area: estim.areaConstruida,
                    total: totalFinal,
                    m2: custoFinalM2,
                    status: 'rascunho',
                    data: today,
                    rev: 'REV-00',
                    parentId: null,
                  });
                }
              }}>
                Confirmar e salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Clear Confirmation Modal ===== */}
      {clearConf && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: '24px',
            maxWidth: 400, boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
              Limpar dados?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 20 }}>
              Todos os dados serão removidos e a estimativa retornará à configuração inicial. Esta ação não pode ser desfeita.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => preserveScroll(() => setClearConf(false))}>
                Cancelar
              </button>
              <button className="btn" style={{ background: '#e53e3e', color: '#fff', border: 'none' }} onClick={() => {
                setRefId(null);
                setOpenGroups(new Set(['info']));
                setIncorpExpGroups(new Set());
                setDelConf(null);
                setEstim({
                  nome: '',
                  endereco: '',
                  areaConstruida: 0,
                  areaProjTorre: 0,
                  numPavtos: 0,
                  numSubsolos: 0,
                  numElevadores: 0,
                  numParadas: 0,
                  perimetroTorre: 0,
                  alturaPredio: 0,
                  prazoObra: 0,
                  tipoFundacao: '',
                  floors: [],
                  custoConstrucaoM2: 0,
                  custoFachadaM2: 0,
                  custoElevador: 0,
                  custoEnsaios: 0,
                  custoAdminM2: 0,
                  fachadaArea: 0,
                  taxaAdm: 0,
                  implantacaoItems: ESTIM_IMPLANTACAO_DEFAULT.map(i => ({ ...i, checked: false })),
                  incorporacaoItems: ESTIM_INCORPORACAO_DEFAULT.map(i => ({ ...i, incc: 0 })),
                  projetosItems: ESTIM_PROJETOS_ESPEC.map(p => ({ ...p, checked: false })),
                });
                setClearConf(false);
              }}>
                Limpar dados
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ----- Helpers de campo -----
const NumField = ({ label, v, on, dec = 2, suffix }) => (
  <div className="field">
    <label>{label}</label>
    <div className="field-prefix" style={{ position: 'relative' }}>
      <input
        type="text"
        value={v || ''}
        onChange={e => on(parseFloat(e.target.value.replace(',', '.')) || 0)}
        className="num"
      />
      {suffix && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>{suffix}</span>}
    </div>
  </div>
);

const RefRow = ({ label, v, mono, strong }) => (
  <div className="row" style={{ justifyContent: 'space-between' }}>
    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    <span className={(mono ? 'mono num ' : '') + (strong ? 'fw-700' : 'fw-600')} style={{ color: 'var(--text)' }}>{v}</span>
  </div>
);

// ----- Distribution donut for sections -----
const DistRing = ({ sections, total }) => {
  const size = 200, cx = size / 2, cy = size / 2, r = 80, r2 = 56;
  let acc = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <svg width={size} height={size}>
        {total > 0 && sections.map((s, i) => {
          const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
          acc += s.value;
          const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
          const large = (end - start) > Math.PI ? 1 : 0;
          const x1 = cx + Math.cos(start) * r;
          const y1 = cy + Math.sin(start) * r;
          const x2 = cx + Math.cos(end) * r;
          const y2 = cy + Math.sin(end) * r;
          const x3 = cx + Math.cos(end) * r2;
          const y3 = cy + Math.sin(end) * r2;
          const x4 = cx + Math.cos(start) * r2;
          const y4 = cy + Math.sin(start) * r2;
          return (
            <path key={i}
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r2} ${r2} 0 ${large} 0 ${x4} ${y4} Z`}
              fill={s.color} />
          );
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text-muted)" letterSpacing="0.06em">SUBTOTAL</text>
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--text)" letterSpacing="-0.01em" fontFamily="var(--font-mono)">{fmtR(total).replace('R$ ', '')}</text>
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5 }}>
        {sections.slice(0, 8).map((s, i) => (
          <div key={i} className="row" style={{ justifyContent: 'space-between' }}>
            <span className="row" style={{ gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }}></span>
              <span style={{ color: 'var(--text-soft)' }}>{s.label}</span>
            </span>
            <span className="mono num fw-600">{total > 0 ? ((s.value / total) * 100).toFixed(1) + '%' : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ===========================================================
// MODAL DE CONFIRMAÇÃO GENÉRICO (2 passos)
// ===========================================================
const ConfirmModal1 = ({ title, msg, confirmLabel = 'Confirmar', onConfirm, onCancel }) => (
  <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000 }}>
    <div style={{ background:'var(--surface)',borderRadius:'var(--r-lg)',padding:24,maxWidth:400,width:'100%',boxShadow:'var(--shadow-lg)',border:'1px solid var(--border)' }}>
      <div style={{ fontSize:15,fontWeight:700,marginBottom:8,color:'var(--text)' }}>{title}</div>
      <div style={{ fontSize:13,color:'var(--text-soft)',marginBottom:20 }}>{msg}</div>
      <div style={{ display:'flex',gap:10,justifyContent:'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
);

const ConfirmModal2 = ({ title, msg1, msg2, onConfirm, onCancel }) => {
  const [step, setStep] = React.useState(1);
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000 }}>
      <div style={{ background:'var(--surface)',borderRadius:'var(--r-lg)',padding:24,maxWidth:400,width:'100%',boxShadow:'var(--shadow-lg)',border:'1px solid var(--border)' }}>
        <div style={{ fontSize:15,fontWeight:700,marginBottom:8,color:step===2?'#c53030':'var(--text)' }}>{title}</div>
        <div style={{ fontSize:13,color:step===2?'#c53030':'var(--text-soft)',marginBottom:20 }}>{step===1?msg1:msg2}</div>
        <div style={{ display:'flex',gap:10,justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          {step===1
            ? <button className="btn btn-ghost" style={{color:'#d97706'}} onClick={()=>setStep(2)}>Confirmar exclusão</button>
            : <button className="btn" style={{background:'#e53e3e',color:'#fff',border:'none'}} onClick={onConfirm}>Excluir definitivamente</button>
          }
        </div>
      </div>
    </div>
  );
};

// ===========================================================
// Hook de sincronização das bases com Supabase (CRUD + tempo real)
const useBaseSupabase = (tipo) => {
  const [items,   setItems]   = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.from('estimativas_base').select('id, dados').eq('tipo', tipo).order('id')
      .then(({ data }) => {
        setItems((data || []).map(r => ({ ...r.dados, id: r.id })));
        setLoading(false);
      });

    const channel = supabase.channel('base_' + tipo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estimativas_base', filter: `tipo=eq.${tipo}` }, payload => {
        if (payload.eventType === 'INSERT')
          setItems(s => [...s, { ...payload.new.dados, id: payload.new.id }]);
        else if (payload.eventType === 'UPDATE')
          setItems(s => s.map(i => i.id === payload.new.id ? { ...payload.new.dados, id: payload.new.id } : i));
        else if (payload.eventType === 'DELETE')
          setItems(s => s.filter(i => i.id !== payload.old.id));
      }).subscribe();

    return () => supabase.removeChannel(channel);
  }, [tipo]);

  const inserir  = (dados) => supabase.from('estimativas_base').insert({ tipo, dados });
  const atualizar = (id, dados) => supabase.from('estimativas_base').update({ dados }).eq('id', id);
  const excluir  = async (id) => {
    const { error } = await supabase.from('estimativas_base').delete().eq('id', id);
    if (!error) setItems(s => s.filter(i => i.id !== id));
  };
  const refresh  = () => supabase.from('estimativas_base').select('id, dados').eq('tipo', tipo).order('id')
    .then(({ data }) => setItems((data || []).map(r => ({ ...r.dados, id: r.id }))));

  return { items, loading, inserir, atualizar, excluir, refresh };
};

// ===========================================================
// Hook de drag-and-drop para modais
const useDrag = (defaultW, defaultH) => {
  const nodeRef = React.useRef(null);
  const dragging = React.useRef(false);
  const offset = React.useRef({ x: 0, y: 0 });
  const [pos, setPos] = React.useState(() => ({
    x: Math.max(0, Math.round((window.innerWidth  - defaultW) / 2)),
    y: Math.max(0, Math.round((window.innerHeight - defaultH) / 4)),
  }));

  React.useEffect(() => {
    const move = (e) => {
      if (!dragging.current) return;
      const el = nodeRef.current;
      const w = el ? el.offsetWidth  : defaultW;
      const h = el ? el.offsetHeight : defaultH;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - w,  e.clientX - offset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - offset.current.y)),
      });
    };
    const up = () => { dragging.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup',   up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  const handleDown = (e) => {
    if (e.target.closest('button')) return;
    dragging.current = true;
    const r = nodeRef.current?.getBoundingClientRect() ?? { left: pos.x, top: pos.y };
    offset.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    e.preventDefault();
  };

  return { pos, nodeRef, handleDown };
};

// MODAL GENÉRICO DE FORMULÁRIO
// ===========================================================
const FormModal = ({ title, fields, values, onChange, onSave, onCancel }) => {
  const { pos, nodeRef, handleDown } = useDrag(460, 460);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:1000 }}>
      <div ref={nodeRef} style={{
        position:'fixed', left:pos.x, top:pos.y,
        background:'var(--surface)', borderRadius:'var(--r-lg)',
        width:460, minWidth:300, maxWidth:'calc(100vw - 32px)',
        boxShadow:'var(--shadow-lg)', border:'1px solid var(--border)',
        height:'fit-content', minHeight:200, maxHeight:'calc(100vh - 32px)',
        overflow:'hidden', resize:'both', display:'flex', flexDirection:'column',
      }}>
        <div onMouseDown={handleDown} style={{
          padding:'13px 18px', background:'#014386', color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          cursor:'move', userSelect:'none', flexShrink:0,
          borderRadius:'var(--r-lg) var(--r-lg) 0 0',
        }}>
          <span style={{ fontSize:14, fontWeight:700 }}>{title}</span>
          <button onClick={onCancel} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.7)', cursor:'pointer', fontSize:20, lineHeight:1, padding:'0 4px' }}>×</button>
        </div>
        <div style={{ padding:20, overflowY:'auto', flex:1 }}>
          <div className="form-grid" style={{ gridTemplateColumns:'1fr 1fr', marginBottom:20 }}>
            {fields.map(f => (
              <div key={f.key} className="field" style={f.full ? { gridColumn:'1/-1' } : {}}>
                <label>{f.label}</label>
                {f.type === 'combobox' ? (
                  <>
                    <input list={'dl-' + f.key} value={values[f.key] || ''} onChange={e => onChange(f.key, e.target.value)} placeholder="Digite ou selecione…" />
                    <datalist id={'dl-' + f.key}>
                      {(f.options || []).map(o => <option key={o} value={o} />)}
                    </datalist>
                  </>
                ) : f.type === 'select' ? (
                  <select value={values[f.key] || ''} onChange={e => onChange(f.key, e.target.value)}>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} value={values[f.key] || ''}
                    onChange={e => onChange(f.key, f.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)} />
                )}
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Estilo para tabela com scroll e cabeçalho fixo
const tblScrollWrap = { overflowX:'auto' };
const tblBody = { display:'block', maxHeight:380, overflowY:'auto' };
const tblHead = { display:'table', width:'100%', tableLayout:'fixed' };
const tblTr   = { display:'table', width:'100%', tableLayout:'fixed' };

// ===========================================================
// SUB: ESTIMATIVAS SALVAS
// ===========================================================
const ESTIM_SALVAS_INIT = [
  { id:'EST-001', nome:'Estimativa Obra H — v3',  ref:'Projeto Ref. A', area:14200, total:82480000,  m2:5808, status:'aprovada',  data:'12/05/2026', rev:'REV-00', parentId:null },
  { id:'EST-002', nome:'Estimativa Obra I',        ref:'Projeto Ref. B', area:8200,  total:41280000,  m2:5034, status:'rascunho',  data:'08/05/2026', rev:'REV-00', parentId:null },
  { id:'EST-003', nome:'Estimativa Obra J — v1',  ref:'Projeto Ref. D', area:22500, total:156400000, m2:6951, status:'rascunho',  data:'02/05/2026', rev:'REV-00', parentId:null },
  { id:'EST-004', nome:'Estimativa Obra B — v2',  ref:'Projeto Ref. A', area:22100, total:126800000, m2:5738, status:'aprovada',  data:'15/12/2024', rev:'REV-00', parentId:null },
  { id:'EST-005', nome:'Estimativa Obra G',        ref:'Projeto Ref. C', area:4200,  total:14800000,  m2:3524, status:'aprovada',  data:'20/08/2023', rev:'REV-00', parentId:null },
  { id:'EST-006', nome:'Estimativa Obra K — v4',  ref:'Projeto Ref. B', area:9400,  total:38200000,  m2:4064, status:'arquivada', data:'14/04/2025', rev:'REV-00', parentId:null },
];

const statusBadge = (s) => {
  const map = { aprovada:'success', rascunho:'warning', arquivada:'neutral' };
  const label = { aprovada:'Aprovada', rascunho:'Rascunho', arquivada:'Arquivada' };
  return <span className={'badge '+(map[s]||'neutral')}><span className="dot"></span>{label[s]||s}</span>;
};

const EstimativasSalvas = ({ onEditar, items }) => {
  const today = new Date().toLocaleDateString('pt-BR');
  const [filter,   setFilter]   = React.useState('todas');
  const [search,   setSearch]   = React.useState('');
  const [delConf,  setDelConf]  = React.useState(null);
  const [revConf,  setRevConf]  = React.useState(null);

  const filtered = items.filter(e => {
    const matchFilter = filter==='todas' || e.status===filter;
    const matchSearch = !search || e.nome.toLowerCase().includes(search.toLowerCase()) || (e.id||'').toString().toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const changeStatus = async (id, status) => {
    const item = items.find(e => e.id === id);
    if (!item) return;
    const { _dbId, ...dados } = item;
    await supabase.from('estimativas_base').update({ dados: { ...dados, status } }).eq('id', _dbId);
  };

  const excluir = async (id) => {
    const toDelete = items.filter(e => e.id === id || e.parentId === id);
    for (const e of toDelete) {
      await supabase.from('estimativas_base').delete().eq('id', e._dbId);
    }
    setDelConf(null);
  };

  const criarRevisao = async (item) => {
    const irmãos = items.filter(e => e.parentId===item.parentId || e.id===item.parentId || e.parentId===item.id || e.id===item.id);
    const maxRev  = irmãos.reduce((max, e) => {
      const n = parseInt((e.rev||'REV-00').replace('REV-',''));
      return n>max ? n : max;
    }, 0);
    const novoRev = 'REV-' + String(maxRev+1).padStart(2,'0');
    const { _dbId, ...dados } = item;
    await supabase.from('estimativas_base').insert({ tipo: 'estimativa', dados: {
      ...dados,
      id: 'EST-' + String(Date.now()).slice(-4),
      nome: item.nome.replace(/ — REV-\d+$/,'') + ' — ' + novoRev,
      rev: novoRev,
      parentId: item.parentId || item.id,
      status: 'rascunho',
      data: today,
    }});
  };

  const counts = { todas: items.length, aprovada: items.filter(e=>e.status==='aprovada').length, rascunho: items.filter(e=>e.status==='rascunho').length, arquivada: items.filter(e=>e.status==='arquivada').length };

  return (
    <div className="stack">
      {revConf && (
        <ConfirmModal1
          title="Criar revisão?"
          msg={`Será criada uma nova revisão de "${revConf.nome}" com status Rascunho.`}
          confirmLabel="Criar revisão"
          onConfirm={() => { criarRevisao(revConf); setRevConf(null); }}
          onCancel={() => setRevConf(null)}
        />
      )}
      {delConf && (
        <ConfirmModal2
          title="Excluir estimativa?"
          msg1={`A estimativa "${delConf.nome}" será removida permanentemente. Esta ação não pode ser desfeita.`}
          msg2="Atenção: todas as revisões vinculadas também serão excluídas. Confirme para prosseguir."
          onConfirm={() => excluir(delConf.id)}
          onCancel={() => setDelConf(null)}
        />
      )}

      <div className="card" style={{ padding:'14px 18px' }}>
        <div className="row" style={{ gap:12, flexWrap:'wrap' }}>
          <div className="filters" style={{ flex:1 }}>
            {[
              { id:'todas',    label:'Todas' },
              { id:'aprovada', label:'Aprovadas' },
              { id:'rascunho', label:'Rascunhos' },
              { id:'arquivada',label:'Arquivadas' },
            ].map(f => (
              <button key={f.id} className={'chip'+(filter===f.id?' active':'')} onClick={()=>setFilter(f.id)}>
                {f.label} <span style={{color:'var(--text-faint)'}}>·</span> {counts[f.id]}
              </button>
            ))}
          </div>
          <input className="input input-search" placeholder="Buscar estimativa…" value={search} onChange={e=>setSearch(e.target.value)} style={{ minWidth:220 }} />
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX:'auto' }}>
          <table className="tbl" style={{ minWidth:860 }}>
            <thead>
              <tr>
                <th style={{ minWidth:90 }}>Código</th>
                <th style={{ minWidth:200 }}>Estimativa</th>
                <th style={{ minWidth:120 }}>Revisão</th>
                <th style={{ minWidth:140 }}>Projeto referência</th>
                <th className="right" style={{ minWidth:90 }}>Área (m²)</th>
                <th className="right" style={{ minWidth:100 }}>Custo / m²</th>
                <th className="right" style={{ minWidth:120 }}>Total estimado</th>
                <th style={{ minWidth:140 }}>Status</th>
                <th style={{ minWidth:90 }}>Data</th>
                <th style={{ minWidth:130 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign:'center', padding:24, color:'var(--text-muted)' }}>Nenhuma estimativa encontrada.</td></tr>
              )}
              {filtered.map(e => (
                <tr key={e.id}>
                  <td className="strong mono" style={{ fontSize:12 }}>{e.id}</td>
                  <td className="strong" style={{ maxWidth:200 }}>
                    <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.nome}</div>
                    {e.parentId && <div style={{ fontSize:11, color:'var(--text-faint)', marginTop:1 }}>Revisão de {e.parentId}</div>}
                  </td>
                  <td><span className="badge neutral" style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{e.rev}</span></td>
                  <td className="text-soft" style={{ fontSize:12 }}>{e.ref}</td>
                  <td className="right mono num">{fmtNumES(e.area, 0)}</td>
                  <td className="right mono num">{fmtR2(e.m2)}</td>
                  <td className="right strong num">{fmtR(e.total)}</td>
                  <td>
                    <select
                      value={e.status}
                      onChange={ev => changeStatus(e.id, ev.target.value)}
                      style={{ fontSize:12, padding:'3px 6px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', cursor:'pointer', fontFamily:'var(--font-sans)' }}
                    >
                      <option value="rascunho">Rascunho</option>
                      <option value="aprovada">Aprovada</option>
                      <option value="arquivada">Arquivada</option>
                    </select>
                  </td>
                  <td className="mono text-muted" style={{ fontSize:11 }}>{e.data}</td>
                  <td>
                    <div className="row" style={{ gap:3, justifyContent:'flex-end' }}>
                      <button className="icon-btn" style={{ width:28,height:28 }} title="Editar" onClick={()=>onEditar&&onEditar(e)}>
                        <Icon name="edit" size={13} />
                      </button>
                      <button className="icon-btn" style={{ width:28,height:28 }} title="Criar revisão" onClick={()=>setRevConf(e)}>
                        <Icon name="refresh-cw" size={13} />
                      </button>
                      <button className="icon-btn" style={{ width:28,height:28,color:'#e53e3e' }} title="Excluir" onClick={()=>setDelConf(e)}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ===========================================================
// SUB: BASE DE DADOS — obras / projetos / elevadores / fundação
// ===========================================================
const BaseDados = ({ refObras, setRefObras }) => {
  const [section, setSection] = React.useState(() => sessionStorage.getItem('base_section') || 'obras');
  React.useEffect(() => { sessionStorage.setItem('base_section', section); }, [section]);
  const sections = [
    { id:'obras',        label:'Obras de referência', icon:'building' },
    { id:'projetos',     label:'Propostas de projeto', icon:'file' },
    { id:'elevadores',   label:'Elevadores',           icon:'layers' },
    { id:'fundacao',     label:'Fundações',            icon:'shield' },
    { id:'implantacao',  label:'Implantação',          icon:'tool' },
  ];
  return (
    <div className="stack">
      <div className="card" style={{ padding:'12px 14px' }}>
        <div className="filters">
          {sections.map(s => (
            <button key={s.id} className={'chip'+(section===s.id?' active':'')} onClick={()=>setSection(s.id)}>
              <Icon name={s.icon} size={13} />{s.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: section === 'obras'       ? '' : 'none' }}><BaseObras items={refObras} setItems={setRefObras} /></div>
      <div style={{ display: section === 'projetos'    ? '' : 'none' }}><BaseProjetos /></div>
      <div style={{ display: section === 'elevadores'  ? '' : 'none' }}><BaseElevadores /></div>
      <div style={{ display: section === 'fundacao'    ? '' : 'none' }}><BaseFundacao /></div>
      <div style={{ display: section === 'implantacao' ? '' : 'none' }}><BaseImplantacao /></div>
    </div>
  );
};

// ---------- NOVA OBRA MODAL ----------
const OBRAS_COEF_DEFAULT = [
  { id:'subsolo',   label:'Subsolo',    coef:1.2  },
  { id:'semi-ent',  label:'Semi-ent.',  coef:1.08 },
  { id:'terreo',    label:'Térreo',     coef:1.0  },
  { id:'tipo',      label:'Pvto Tipo',  coef:1.0  },
  { id:'cobertura', label:'Cobertura',  coef:0.85 },
  { id:'cxAgua',    label:"Cx. d'Água", coef:0.5  },
];

const NovaObraModal = ({ onSave, onCancel, initialData }) => {
  const [form, setForm] = React.useState(initialData ? {
    nome: initialData.nome || '',
    tipo: initialData.tipo || '',
    anoBase: initialData.anoBase || '',
    cidade: initialData.cidade || '',
    inccBase: initialData.inccBase || '',
    areaConstruida: initialData.areaConstruida || 0,
    areaProjTorre: initialData.areaProjTorre || 0,
    perimetroTorre: initialData.perimetroTorre || 0,
    numPavtos: initialData.numPavtos || 0,
    numTorres: initialData.numTorres || 0,
    numSubsolos: initialData.numSubsolos || 0,
    fundacao: initialData.fundacao || '—',
    numElevadores: initialData.numElevadores || 0,
    numParadas: initialData.numParadas || 0,
    coefPavimentos: initialData.coefPavimentos || [],
    observacoes: initialData.observacoes || '',
  } : {
    nome:'', tipo:'', anoBase:'', cidade:'', inccBase:'',
    areaConstruida:0, areaProjTorre:0, perimetroTorre:0, numPavtos:0,
    numTorres:0, numSubsolos:0, fundacao:'—', numElevadores:0, numParadas:0,
    coefPavimentos: [],
    observacoes:'',
  });

  const upd = (k,v) => setForm(s=>({...s,[k]:v}));
  const updCoef = (id,field,v) => setForm(s=>({...s, coefPavimentos: s.coefPavimentos.map(p=> p.id===id ? {...p,[field]: field==='coef'?(parseFloat(v)||0):v} : p)}));
  const addCoef = () => { const newId='pav-'+Date.now(); setForm(s=>({...s, coefPavimentos:[...s.coefPavimentos,{id:newId,label:'Novo Pavimento',coef:1.0}]})); };
  const removeCoef = (id) => setForm(s=>({...s, coefPavimentos:s.coefPavimentos.filter(p=>p.id!==id)}));

  const { pos, nodeRef, handleDown } = useDrag(760, 500);
  const sec = { fontSize:10.5, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--brand)', marginBottom:12, marginTop:20, borderBottom:'1px solid var(--brand-50)', paddingBottom:5 };
  const nf = (k, isInt) => <input type="number" step={isInt?1:'0.01'} value={form[k]} onChange={e=>{ const v=e.target.value; upd(k,v===''?'':(isInt?parseInt:parseFloat)(v)||0); }} style={{width:'100%'}} />;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:1000}}>
      <div ref={nodeRef} style={{position:'fixed',left:pos.x,top:pos.y,background:'var(--surface)',borderRadius:'var(--r-lg)',width:'calc(100% - 32px)',maxWidth:760,boxShadow:'var(--shadow-lg)',border:'1px solid var(--border)',overflow:'hidden',maxHeight:'92vh',display:'flex',flexDirection:'column'}}>

        <div onMouseDown={handleDown} style={{background:'#014386',color:'#fff',padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'move',userSelect:'none',flexShrink:0}}>
          <div>
            <div style={{fontWeight:700,fontSize:15}}>{initialData ? 'Editar Obra' : 'Nova Obra'}</div>
            <div style={{fontSize:11.5,color:'rgba(255,255,255,0.65)',marginTop:2}}>Todos os custos em UNIDADES INCC (R$ ÷ INCC_base do período)</div>
          </div>
          <button onClick={onCancel} style={{background:'none',border:'none',color:'rgba(255,255,255,0.7)',cursor:'pointer',fontSize:20,lineHeight:1,padding:'0 4px'}}>×</button>
        </div>

        <div style={{padding:'4px 20px 20px',overflowY:'auto',flex:1}}>

          <div style={sec}>Identificação</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:12,marginBottom:12}}>
            <div className="field"><label>Nome</label><input value={form.nome} onChange={e=>upd('nome',e.target.value)} /></div>
            <div className="field"><label>Tipo</label>
              <select value={form.tipo} onChange={e=>upd('tipo',e.target.value)} style={{minWidth:160}}>
                <option value="">— Selecione —</option>
                {['Alto Padrão','Médio Padrão','Popular/Econômico','Comercial'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field"><label>Ano Base</label><input type="number" value={form.anoBase} onChange={e=>upd('anoBase',parseInt(e.target.value)||2026)} style={{width:90}} /></div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="field"><label>Cidade</label><input value={form.cidade} onChange={e=>upd('cidade',e.target.value)} /></div>
            <div className="field">
              <label>INCC Base <span style={{fontWeight:400,color:'var(--text-muted)'}}>· Índice do ano-base</span></label>
              <input type="number" value={form.inccBase} onChange={e=>upd('inccBase',parseFloat(e.target.value)||0)} />
            </div>
          </div>

          <div style={sec}>Parâmetros Físicos</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:12}}>
            <div className="field"><label>Área Construída (m²)</label>{nf('areaConstruida',true)}</div>
            <div className="field"><label>Área Proj. Torre (m²)</label>{nf('areaProjTorre',true)}</div>
            <div className="field"><label>Perímetro Torre (m)</label>{nf('perimetroTorre',true)}</div>
            <div className="field"><label>Nº Total Pavtos</label>{nf('numPavtos',true)}</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
            <div className="field"><label>Nº Subsolos</label>{nf('numSubsolos',true)}</div>
            <div className="field"><label>Tipo de Fundação</label>
              <select value={form.fundacao} onChange={e=>upd('fundacao',e.target.value)}>
                {['—','Estaca Hélice Contínua','Estaca Raiz','Sapata Armada','Estaca Escavada','Radier','Tubulão','Perfil Metálico'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field"><label>Nº Elevadores</label>{nf('numElevadores',true)}</div>
            <div className="field"><label>Nº Paradas/Elev.</label>{nf('numParadas',true)}</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
            <div className="field"><label>Nº Torres</label>{nf('numTorres',true)}</div>
          </div>

          <div style={sec}>Coeficientes por Pavimento</div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:4}}>
            {form.coefPavimentos.map(p=>(
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:6,background:'var(--bg-app)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 10px',minWidth:110}}>
                <div style={{flex:1}}>
                  <input value={p.label} onChange={e=>updCoef(p.id,'label',e.target.value)}
                    style={{border:'none',background:'transparent',width:'100%',fontSize:11.5,fontWeight:600,color:'var(--text-soft)',outline:'none',marginBottom:4,padding:0,fontFamily:'var(--font-sans)'}} />
                  <input type="number" step="0.01" value={p.coef} onChange={e=>updCoef(p.id,'coef',e.target.value)}
                    style={{border:'none',background:'transparent',width:'100%',fontSize:14,fontFamily:'var(--font-mono)',color:'var(--brand)',outline:'none',padding:0,fontWeight:700}} />
                </div>
                {form.coefPavimentos.length > 1 && (
                  <button onClick={()=>removeCoef(p.id)}
                    style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-faint)',padding:'0 2px',lineHeight:1,fontSize:16}}>×</button>
                )}
              </div>
            ))}
            <button onClick={addCoef}
              style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4,background:'none',border:'1.5px dashed var(--border)',borderRadius:8,padding:'8px 14px',cursor:'pointer',color:'var(--text-muted)',fontSize:12,minWidth:110,fontFamily:'var(--font-sans)'}}>
              <Icon name="plus" size={13} />Pavimento
            </button>
          </div>

          <div style={sec}>Observações</div>
          <textarea value={form.observacoes} onChange={e=>upd('observacoes',e.target.value)} rows={3}
            style={{width:'100%',borderRadius:6,border:'1px solid var(--border)',padding:'8px 10px',fontSize:13,fontFamily:'var(--font-sans)',color:'var(--text)',background:'var(--surface)',resize:'vertical',outline:'none',boxSizing:'border-box'}} />
        </div>

        <div style={{padding:'12px 20px',borderTop:'1px solid var(--border)',display:'flex',gap:10,justifyContent:'flex-end',background:'var(--bg-app)'}}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={()=>{ if(form.nome.trim()) onSave(form); }}>{initialData ? 'Salvar alterações' : 'Salvar obra'}</button>
        </div>
      </div>
    </div>
  );
};

// ---------- BASE OBRAS ----------
const BaseObras = ({ items, setItems }) => {
  const [showForm, setShowForm] = React.useState(false);
  const [editItem, setEditItem] = React.useState(null);
  const [delConf,  setDelConf]  = React.useState(null);

  const salvar = (form) => {
    const findCoef = (id, fallback) => form.coefPavimentos.find(p=>p.id===id)?.coef ?? fallback;
    setItems(s=>[...s, {
      ...form, id:Date.now(),
      custoConstrucaoM2:0, custoInfra:0, custoImplantacao:0, custoProjetosM2:0,
      custoElevador:0, custoFachadaM2:0, custoEnsaios:0, custoAdminM2:0, pctIncorporacao:0,
      coefSubsolo:   findCoef('subsolo',   1.20),
      coefSemiEnt:   findCoef('semi-ent',  1.08),
      coefTerreo:    findCoef('terreo',    1.00),
      coefTipo:      findCoef('tipo',      1.00),
      coefCobertura: findCoef('cobertura', 0.85),
      coefCxAgua:    findCoef('cxAgua',    0.50),
    }]);
    setShowForm(false);
  };

  const salvarEdicao = (form) => {
    setItems(s => s.map(i => i.id === editItem.id ? { ...i, ...form } : i));
    setEditItem(null);
  };

  const excluir = (id) => { setItems(s=>s.filter(i=>i.id!==id)); setDelConf(null); };

  return (
    <div className="card">
      {showForm && <NovaObraModal onSave={salvar} onCancel={()=>setShowForm(false)} />}
      {editItem  && <NovaObraModal initialData={editItem} onSave={salvarEdicao} onCancel={()=>setEditItem(null)} />}
      {delConf && <ConfirmModal2 title="Excluir obra?" msg1={`Excluir "${delConf.nome}"?`} msg2="Ação irreversível." onConfirm={()=>excluir(delConf.id)} onCancel={()=>setDelConf(null)} />}

      <div className="card-header">
        <div><div className="card-title">Obras de referência</div><div className="card-subtitle">Empreendimentos históricos usados como base paramétrica</div></div>
        <div className="card-actions">
          <button className="btn btn-sm btn-primary" onClick={()=>setShowForm(true)}><Icon name="plus" size={13} />Nova obra</button>
        </div>
      </div>
      <div style={{overflowX:'auto',overflowY:'auto',maxHeight:360}}>
        <table className="tbl" style={{minWidth:700}}>
          <thead style={{position:'sticky',top:0,background:'var(--surface)',zIndex:1}}>
            <tr>
              <th>Projeto</th><th>Tipo</th><th>Cidade</th>
              <th className="right">Área (m²)</th><th className="center">Pav.</th>
              <th>Fundação</th><th className="right">INCC base</th>
              <th style={{width:72}}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(p=>(
              <tr key={p.id}>
                <td className="strong">{p.nome}</td>
                <td><span className="badge info">{p.tipo}</span></td>
                <td className="text-soft">{p.cidade}</td>
                <td className="right mono num">{fmtNumES(p.areaConstruida,0)}</td>
                <td className="center mono num">{p.numPavtos}</td>
                <td className="text-soft">{p.fundacao}</td>
                <td className="right mono num text-muted">{fmtNumES(p.inccBase,2)}</td>
                <td className="center">
                  <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                    <button className="icon-btn" style={{width:26,height:26}} title="Editar" onClick={()=>setEditItem(p)}><Icon name="edit" size={12} /></button>
                    <button className="icon-btn" style={{width:26,height:26,color:'#e53e3e'}} title="Excluir" onClick={()=>setDelConf(p)}><Icon name="trash" size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ===========================================================
// CONFIG DE COLUNAS POR BASE (usada em Import/Export)
// ===========================================================
const BASE_CONFIGS = {
  proposta: {
    nome: 'Propostas de Projeto', arquivo: 'propostas-projeto',
    colunas: [
      { key:'esp',        label:'Especialidade',       tipo:'texto',  obrigatorio:true  },
      { key:'projetista', label:'Projetista',           tipo:'texto',  obrigatorio:false },
      { key:'obra',       label:'Obra',                 tipo:'texto',  obrigatorio:false },
      { key:'proposta',   label:'Proposta (R$)',        tipo:'numero', obrigatorio:false },
      { key:'rs_m2',      label:'R$/m²',                tipo:'numero', obrigatorio:false },
      { key:'inccBase',   label:'INCC Base',            tipo:'numero', obrigatorio:false },
      { key:'incc_m2',    label:'INCC/m²',              tipo:'numero', obrigatorio:false },
      { key:'mes',        label:'Mês/Ano',              tipo:'texto',  obrigatorio:false },
    ],
    exemplo: { esp:'Projeto de Arquitetura', projetista:'João Silva', obra:'Edifício Alpha', proposta:300000, rs_m2:15.5, inccBase:1259.65, incc_m2:0.012, mes:'2024-01' },
  },
  elevador: {
    nome: 'Elevadores', arquivo: 'elevadores',
    colunas: [
      { key:'obra',    label:'Obra',                tipo:'texto',  obrigatorio:true  },
      { key:'marca',   label:'Marca',               tipo:'texto',  obrigatorio:false },
      { key:'paradas', label:'Nº Paradas',          tipo:'numero', obrigatorio:false },
      { key:'qt',      label:'Qt. Elevadores',      tipo:'numero', obrigatorio:false },
      { key:'valor',   label:'Valor Fechado (R$)',  tipo:'numero', obrigatorio:false },
      { key:'mes',     label:'Mês',                 tipo:'texto',  obrigatorio:false },
      { key:'incc',    label:'INCC Base',           tipo:'numero', obrigatorio:false },
    ],
    exemplo: { obra:'Edifício Alpha', marca:'OTIS', paradas:12, qt:2, valor:480000, mes:'2024-01', incc:1259.65 },
  },
  fundacao: {
    nome: 'Fundações', arquivo: 'fundacoes',
    colunas: [
      { key:'fund',    label:'Tipo de Fundação',   tipo:'texto',  obrigatorio:true  },
      { key:'obra',    label:'Obra',                tipo:'texto',  obrigatorio:false },
      { key:'area',    label:'Área Terreno (m²)',   tipo:'numero', obrigatorio:false },
      { key:'pavtos',  label:'Qt. Pavimentos',      tipo:'numero', obrigatorio:false },
      { key:'custo',   label:'Custo (R$)',          tipo:'numero', obrigatorio:false },
      { key:'inccBase',label:'INCC Base',           tipo:'numero', obrigatorio:false },
      { key:'mes',     label:'Mês',                 tipo:'texto',  obrigatorio:false },
    ],
    exemplo: { fund:'Estaca Hélice', obra:'Edifício Alpha', area:1200, pavtos:15, custo:850000, inccBase:1259.65, mes:'2024-01' },
  },
  implantacao: {
    nome: 'Implantação', arquivo: 'implantacao',
    colunas: [
      { key:'item',      label:'Item',                 tipo:'texto',  obrigatorio:true  },
      { key:'obs',       label:'Observação / Fórmula', tipo:'texto',  obrigatorio:false },
      { key:'qtd',       label:'Qtd.',                 tipo:'numero', obrigatorio:false },
      { key:'unid',      label:'Unidade',              tipo:'texto',  obrigatorio:false },
      { key:'precoRS',   label:'Preço Unit. (R$)',     tipo:'numero', obrigatorio:false },
      { key:'precoIncc', label:'Preço Unit. (INCC)',   tipo:'numero', obrigatorio:false },
    ],
    exemplo: { item:'Barracão de Obra', obs:'ÁREA DO TERRENO', qtd:300, unid:'M2', precoRS:907.69, precoIncc:0.84 },
  },
};

const exportarBase = (tipo, items) => {
  const cfg = BASE_CONFIGS[tipo];
  const headers = cfg.colunas.map(c => c.label);
  const linhas = items.length > 0
    ? items.map(item => cfg.colunas.map(c => item[c.key] ?? ''))
    : [cfg.colunas.map(c => cfg.exemplo[c.key] ?? '')];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...linhas]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, cfg.nome);
  XLSX.writeFile(wb, `${cfg.arquivo}.xlsx`);
};

// ===========================================================
// MODAL DE IMPORTAÇÃO
// ===========================================================
const ImportModal = ({ tipo, onImportar, onCancel, onSuccess }) => {
  const [drag,       setDrag]       = React.useState(false);
  const [preview,    setPreview]    = React.useState(null);
  const [importando, setImportando] = React.useState(false);
  const [resultado,  setResultado]  = React.useState(null);
  const inputRef = React.useRef(null);
  const cfg = BASE_CONFIGS[tipo];

  const processFile = (file) => {
    setPreview(null); setResultado(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb  = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!raw.length) { setPreview({ erroHeader: 'Planilha vazia.' }); return; }
        const headers = raw[0].map(h => String(h).trim());
        const obrigatorios = cfg.colunas.filter(c => c.obrigatorio).map(c => c.label);
        const faltando = obrigatorios.filter(l => !headers.includes(l));
        if (faltando.length) { setPreview({ erroHeader: `Colunas obrigatórias ausentes: ${faltando.join(', ')}` }); return; }
        const valid = [], invalid = [];
        raw.slice(1).forEach((row, idx) => {
          if (row.every(c => c === '' || c == null)) return;
          const item = {};
          let ok = true;
          cfg.colunas.forEach(col => {
            const ci    = headers.indexOf(col.label);
            const v     = ci >= 0 ? row[ci] : '';
            const rawV  = String(v ?? '').trim();
            item[col.key] = col.tipo === 'numero' ? (parseFloat(v) || 0) : rawV;
            if (!rawV) ok = false;
          });
          if (ok) valid.push(item);
          else    invalid.push({ linha: idx + 2, item });
        });
        setPreview({ valid, invalid, erroHeader: null });
      } catch(err) { setPreview({ erroHeader: 'Erro ao ler arquivo: ' + err.message }); }
    };
    reader.readAsArrayBuffer(file);
  };

  const removeFromPreview = (isValid, idx) => {
    setPreview(p => ({
      ...p,
      valid:   isValid  ? p.valid.filter((_,i) => i !== idx)  : p.valid,
      invalid: !isValid ? p.invalid.filter((_,i) => i !== idx) : p.invalid,
    }));
  };

  const handleImportar = async () => {
    const total = (preview?.valid?.length || 0) + (preview?.invalid?.length || 0);
    if (!total) return;
    setImportando(true);
    const rows = [
      ...(preview.valid.map(dados => ({ tipo, dados }))),
      ...(preview.invalid.map(e => ({ tipo, dados: { ...e.item, _status: 'incompleto' } }))),
    ];
    const { error } = await supabase.from('estimativas_base').insert(rows);
    setImportando(false);
    if (error) { setResultado({ erro: error.message }); return; }
    onSuccess?.();
  };

  const dropZone = {
    border: `2px dashed ${drag ? 'var(--brand)' : 'var(--border)'}`,
    borderRadius: 'var(--r-lg)', padding: 40, textAlign: 'center', cursor: 'pointer',
    background: drag ? 'var(--brand-50,#e8f0fb)' : 'var(--bg-app)', transition: 'all 0.15s',
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--surface)', borderRadius:'var(--r-lg)', width:'calc(100% - 32px)', maxWidth:720, maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'var(--shadow-lg)', border:'1px solid var(--border)' }}>

        <div style={{ padding:'13px 18px', background:'#014386', color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <span style={{ fontSize:14, fontWeight:700 }}>Importar — {cfg.nome}</span>
          <button onClick={onCancel} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.7)', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:20 }}>
          {resultado ? (
            resultado.erro
              ? <div style={{ padding:16, background:'#fff5f5', borderRadius:'var(--r-lg)', border:'1px solid #fed7d7', color:'#c53030', fontSize:13 }}><strong>Erro:</strong> {resultado.erro}</div>
              : <div style={{ padding:16, background:'#f0fff4', borderRadius:'var(--r-lg)', border:'1px solid #9ae6b4', color:'#276749', fontSize:13, textAlign:'center' }}>
                  <Icon name="check" size={20} style={{ marginBottom:8, display:'block', margin:'0 auto 8px' }} />
                  <strong>{resultado.ok} {resultado.ok === 1 ? 'item importado' : 'itens importados'} com sucesso!</strong>
                </div>
          ) : !preview ? (
            <div style={dropZone}
              onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
              onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)processFile(f);}}
              onClick={()=>inputRef.current.click()}
            >
              <input ref={inputRef} type="file" accept=".xlsx" style={{ display:'none' }} onChange={e=>{if(e.target.files[0])processFile(e.target.files[0]);e.target.value='';}} />
              <Icon name="upload" size={28} style={{ color:'var(--text-muted)', display:'block', margin:'0 auto 12px' }} />
              <div style={{ fontSize:14, fontWeight:600 }}>Arraste um arquivo .xlsx aqui</div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:6 }}>ou clique para selecionar</div>
            </div>
          ) : preview.erroHeader ? (
            <div style={{ padding:16, background:'#fff5f5', borderRadius:'var(--r-lg)', border:'1px solid #fed7d7', color:'#c53030', fontSize:13 }}>
              <strong>Erro:</strong> {preview.erroHeader}
            </div>
          ) : (
            <div>
              <div style={{ marginBottom:12, display:'flex', gap:8, alignItems:'center' }}>
                <span className="badge success">{preview.valid.length} válidos</span>
                {preview.invalid.length > 0 && <span className="badge warning">{preview.invalid.length} incompletos</span>}
                <span style={{ fontSize:11.5, color:'var(--text-muted)' }}>· Campos obrigatórios em vermelho · Incompletos serão importados com status "Incompleto"</span>
              </div>
              <div style={{ overflowX:'auto', maxHeight:380, overflowY:'auto' }}>
                <table className="tbl">
                  <thead style={{ position:'sticky', top:0, background:'var(--surface)', zIndex:1 }}>
                    <tr>
                      <th style={{ width:36 }}>#</th>
                      {cfg.colunas.map(c => <th key={c.key}>{c.label}{c.obrigatorio ? ' *' : ''}</th>)}
                      <th style={{ width:90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.valid.map((item, i) => (
                      <tr key={i}>
                        <td className="mono text-muted" style={{ fontSize:11 }}>{i+1}</td>
                        {cfg.colunas.map(c => <td key={c.key} style={{ fontSize:12 }}>{item[c.key] !== '' && item[c.key] != null ? item[c.key] : '—'}</td>)}
                        <td>
                          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                            <span className="badge success">OK</span>
                            <button className="icon-btn" style={{ width:22,height:22,color:'#e53e3e' }} title="Remover linha" onClick={() => removeFromPreview(true, i)}>
                              <Icon name="trash" size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {preview.invalid.map((e, i) => (
                      <tr key={'err'+i} style={{ background:'#fffbeb' }}>
                        <td className="mono text-muted" style={{ fontSize:11 }}>{e.linha}</td>
                        {cfg.colunas.map(c => (
                          <td key={c.key} style={{ fontSize:12, color: cfg.colunas.find(col=>col.key===c.key)?.obrigatorio && !e.item[c.key] ? '#e53e3e' : undefined }}>
                            {e.item[c.key] !== '' && e.item[c.key] != null ? e.item[c.key] : '—'}
                          </td>
                        ))}
                        <td>
                          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                            <span className="badge warning" style={{ whiteSpace:'nowrap' }}>Incompleto</span>
                            <button className="icon-btn" style={{ width:22,height:22,color:'#e53e3e' }} title="Remover linha" onClick={() => removeFromPreview(false, i)}>
                              <Icon name="trash" size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:8, justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <button className="btn btn-ghost btn-sm" onClick={()=>exportarBase(tipo,[])} style={{ fontSize:12 }}>
            <Icon name="download" size={12} />Baixar modelo
          </button>
          <div style={{ display:'flex', gap:8 }}>
            {preview && !preview.erroHeader && !resultado && (
              <button className="btn btn-ghost btn-sm" onClick={()=>setPreview(null)}>Trocar arquivo</button>
            )}
            <button className="btn btn-ghost" onClick={onCancel}>{resultado ? 'Fechar' : 'Cancelar'}</button>
            {((preview?.valid?.length || 0) + (preview?.invalid?.length || 0)) > 0 && !resultado && (
              <button className="btn btn-primary" onClick={handleImportar} disabled={importando}>
                {importando ? <span className="login-spinner" /> : (
                  <>
                    <Icon name="upload" size={13} />
                    Importar {(preview.valid.length + preview.invalid.length)} {(preview.valid.length + preview.invalid.length) === 1 ? 'item' : 'itens'}
                    {preview.invalid.length > 0 && <span style={{ fontSize:10, opacity:0.8, marginLeft:4 }}>({preview.invalid.length} incompleto{preview.invalid.length > 1 ? 's' : ''})</span>}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- BASE PROJETOS ----------
const BaseProjetos = () => {
  const { items, loading, inserir, atualizar, excluir: excluirDb } = useBaseSupabase('proposta');
  const [showForm,   setShowForm]   = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [editItem,   setEditItem]   = React.useState(null);
  const [delConf,    setDelConf]    = React.useState(null);
  const [search,     setSearch]     = React.useState('');
  const [filterEsp,setFilterEsp]= React.useState('');
  const [filterObra,setFilterObra]= React.useState('');

  const emptyForm = { esp:'', projetista:'', obra:'', area:null, proposta:0, rs_m2:0, inccBase:0, incc_m2:0, mes:'' };
  const [form, setForm] = React.useState(emptyForm);
  const updF = (k,v) => setForm(s=>({...s,[k]:v}));

  const startEdit = (item) => { const { id, ...rest } = item; setForm({...emptyForm, ...rest}); setEditItem(item); setShowForm(true); };

  const esps  = [...new Set(items.map(i=>i.esp))].sort();
  const obras = [...new Set(items.map(i=>i.obra).filter(Boolean))].sort();

  const filtered = items.filter(i => {
    const txt = (search||'').toLowerCase();
    const matchS = !txt || i.esp.toLowerCase().includes(txt) || (i.projetista||'').toLowerCase().includes(txt) || (i.obra||'').toLowerCase().includes(txt);
    const matchE = !filterEsp  || i.esp  === filterEsp;
    const matchO = !filterObra || i.obra === filterObra;
    return matchS && matchE && matchO;
  });

  const salvar = async () => {
    if (!form.esp.trim()) return;
    if (editItem) { await atualizar(editItem.id, form); setEditItem(null); }
    else { await inserir(form); }
    setForm(emptyForm); setShowForm(false);
  };
  const excluir = async (id) => { await excluirDb(id); setDelConf(null); };

  return (
    <div className="card">
      {showForm && (
        <FormModal title={editItem ? "Editar proposta de projeto" : "Nova proposta de projeto"}
          fields={[
            { key:'esp', label:'Especialidade', type:'combobox', full:true,
              options: [...new Set([...esps, 'Projeto de Arquitetura','Projeto de Execução','Projeto de Fundação','Projeto de Estrutura','Projeto de Instalações','Projeto de Ar Condicionado','Projeto de Incêndio','Projeto de Impermeabilização','Projeto de Piscina','Gestão de Projetos','Consultoria Acústica','Consultoria Estrutural'])].sort() },
            { key:'projetista',label:'Projetista' },
            { key:'obra',      label:'Obra' },
            { key:'proposta',  label:'Proposta (R$)', type:'number' },
            { key:'rs_m2',     label:'R$/m²', type:'number' },
            { key:'inccBase',  label:'INCC base', type:'number' },
            { key:'incc_m2',   label:'INCC/m²', type:'number' },
            { key:'mes',       label:'Mês/Ano', type:'month' },
          ]}
          values={form} onChange={updF} onSave={salvar} onCancel={() => { setShowForm(false); setEditItem(null); }} />
      )}
      {delConf && <ConfirmModal2 title="Excluir proposta?" msg1={`Excluir proposta de "${delConf.esp}"?`} msg2="Ação irreversível." onConfirm={()=>excluir(delConf.id)} onCancel={()=>setDelConf(null)} />}
      {showImport && <ImportModal tipo="proposta" onImportar={inserir} onCancel={() => setShowImport(false)} onSuccess={() => { setShowImport(false); refresh(); }} />}

      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', letterSpacing:'0.06em', textTransform:'uppercase', marginRight:4 }}>Projetos</span>
        <input className="input input-search" placeholder="Projetista, obra ou especialidade…" value={search} onChange={e=>setSearch(e.target.value)} style={{ flex:1, minWidth:200 }} />
        <select className="input" value={filterEsp} onChange={e=>setFilterEsp(e.target.value)} style={{ minWidth:160, fontSize:12 }}>
          <option value="">Todas especialidades</option>
          {esps.map(e=><option key={e} value={e}>{e}</option>)}
        </select>
        <select className="input" value={filterObra} onChange={e=>setFilterObra(e.target.value)} style={{ minWidth:130, fontSize:12 }}>
          <option value="">Todas obras</option>
          {obras.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
        <div className="card-actions">
          <button className="btn btn-sm btn-ghost" onClick={() => exportarBase('proposta', items)}><Icon name="download" size={12} />Exportar</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowImport(true)}><Icon name="upload" size={12} />Importar</button>
          <button className="btn btn-sm btn-primary" onClick={()=>setShowForm(true)}><Icon name="plus" size={13} />Nova Proposta</button>
        </div>
      </div>

      <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:360 }}>
        <table className="tbl" style={{ minWidth:820 }}>
          <thead style={{ position:'sticky', top:0, background:'var(--surface)', zIndex:1 }}>
            <tr>
              <th>Especialidade</th><th>Projetista</th><th>Obra</th>
              <th className="right">Área (m²)</th><th className="right">Proposta (R$)</th>
              <th className="right">R$/m²</th><th className="right">INCC base</th>
              <th className="right">R$/M2/INCC</th><th>Mês</th>
              <th style={{ width:72 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10} style={{ textAlign:'center', padding:20, color:'var(--text-muted)' }}>Nenhum registro encontrado.</td></tr>}
            {filtered.map(p => (
              <tr key={p.id} style={p._status==='incompleto'?{background:'#fffbeb'}:{}}>
                <td className="strong" style={{ fontSize:12 }}>{p.esp}</td>
                <td style={{ fontSize:12 }}>{p.projetista||'—'}</td>
                <td style={{ fontSize:12, color:'var(--brand)' }}>{p.obra||'—'}</td>
                <td className="right mono num text-muted">{p.area ? fmtNumES(p.area,0) : '—'}</td>
                <td className="right mono num strong">{fmtR2(p.proposta)}</td>
                <td className="right mono num">{fmtR2(p.rs_m2)}</td>
                <td className="right mono num text-muted">{fmtNumES(p.inccBase,2)}</td>
                <td className="right mono num" style={{ fontSize:11 }}>{(p.rs_m2 && p.inccBase) ? (p.rs_m2 / p.inccBase).toFixed(6) : '—'}</td>
                <td className="text-muted" style={{ fontSize:11, whiteSpace:'nowrap' }}>{p.mes||'—'}</td>
                <td className="center">
                  <div style={{ display:'flex', gap:4, justifyContent:'center', alignItems:'center' }}>
                    {p._status==='incompleto' && <span className="badge warning" style={{ fontSize:10 }}>Incompleto</span>}
                    <button className="icon-btn" style={{ width:26,height:26 }} title="Editar" onClick={()=>startEdit(p)}><Icon name="edit" size={12} /></button>
                    <button className="icon-btn" style={{ width:26,height:26,color:'#e53e3e' }} title="Excluir" onClick={()=>setDelConf(p)}><Icon name="trash" size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding:'8px 16px', fontSize:11.5, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
        Total: {filtered.length} proposta(s) · Os dados são salvos automaticamente no navegador.
      </div>
    </div>
  );
};

// ---------- BASE ELEVADORES ----------
const BaseElevadores = () => {
  const inccAtual = 1259.652;
  const { items, loading, inserir, atualizar, excluir: excluirDb } = useBaseSupabase('elevador');
  const [showForm,   setShowForm]   = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [editItem,   setEditItem]   = React.useState(null);
  const [delConf,    setDelConf]    = React.useState(null);
  const [filterObra, setFilterObra] = React.useState('');
  const [filterMarca,setFilterMarca]= React.useState('');

  const obras  = [...new Set(items.map(i=>i.obra).filter(Boolean))].sort();
  const marcas = [...new Set(items.map(i=>i.marca).filter(Boolean))].sort();

  const filtered = items.filter(i =>
    (!filterObra  || i.obra  === filterObra) &&
    (!filterMarca || i.marca === filterMarca)
  );

  const emptyForm = { obra:'', marca:'OTIS', paradas:0, qt:0, valor:0, mes:'', incc:0 };
  const [form, setForm] = React.useState(emptyForm);
  const updF = (k,v) => setForm(s=>({...s,[k]:v}));

  const startEdit = (item) => { const { id, ...rest } = item; setForm({...emptyForm, ...rest}); setEditItem(item); setShowForm(true); };

  const salvar = async () => {
    if (!form.obra.trim()) return;
    if (editItem) { await atualizar(editItem.id, form); setEditItem(null); }
    else { await inserir(form); }
    setForm(emptyForm); setShowForm(false);
  };
  const excluir = async (id) => { await excluirDb(id); setDelConf(null); };

  return (
    <div className="card">
      {showForm && (
        <FormModal title={editItem ? "Editar Elevador" : "Novo Elevador"}
          fields={[
            { key:'obra',   label:'Obra', full:true },
            { key:'marca',  label:'Marca', type:'select', options:['OTIS','ATLAS','TK ELEVADORES','Thyssen','Kone','Schindler'] },
            { key:'paradas',label:'Nº paradas', type:'number' },
            { key:'qt',     label:'Qt. elevadores', type:'number' },
            { key:'valor',  label:'Valor fechado (R$)', type:'number' },
            { key:'mes',    label:'Mês', type:'month' },
            { key:'incc',   label:'INCC base', type:'number' },
          ]}
          values={form} onChange={updF} onSave={salvar} onCancel={() => { setShowForm(false); setEditItem(null); }} />
      )}
      {delConf && <ConfirmModal2 title="Excluir elevador?" msg1={`Excluir registro de "${delConf.obra}"?`} msg2="Ação irreversível." onConfirm={()=>excluir(delConf.id)} onCancel={()=>setDelConf(null)} />}
      {showImport && <ImportModal tipo="elevador" onImportar={inserir} onCancel={() => setShowImport(false)} onSuccess={() => { setShowImport(false); refresh(); }} />}

      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', letterSpacing:'0.06em', textTransform:'uppercase', marginRight:4 }}>Elevadores</span>
        <select className="input" value={filterObra} onChange={e=>setFilterObra(e.target.value)} style={{ minWidth:140, fontSize:12 }}>
          <option value="">Todas as obras</option>
          {obras.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
        <select className="input" value={filterMarca} onChange={e=>setFilterMarca(e.target.value)} style={{ minWidth:140, fontSize:12 }}>
          <option value="">Todas as marcas</option>
          {marcas.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <span style={{ marginLeft:'auto', fontSize:11.5, color:'var(--text-muted)' }}>{filtered.length} registros</span>
        <div className="card-actions" style={{ marginLeft:0 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => exportarBase('elevador', items)}><Icon name="download" size={12} />Exportar</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowImport(true)}><Icon name="upload" size={12} />Importar</button>
          <button className="btn btn-sm btn-primary" onClick={()=>setShowForm(true)}><Icon name="plus" size={13} />Novo Elevador</button>
        </div>
      </div>

      <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:360 }}>
        <table className="tbl" style={{ minWidth:860 }}>
          <thead style={{ position:'sticky', top:0, background:'var(--surface)', zIndex:1 }}>
            <tr>
              <th>Obra</th><th>Marca</th><th className="center">Nº Paradas</th>
              <th className="center">Qt. Elevadores</th><th className="right">Valor Fechado (R$)</th>
              <th className="right">Val./Parada/Elev. (R$)</th><th>Mês</th>
              <th className="right">INCC</th><th className="right">Val./Parada/Elev. (INCC)</th>
              <th style={{ width:72 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10} style={{ textAlign:'center', padding:20, color:'var(--text-muted)' }}>Nenhum registro encontrado.</td></tr>}
            {filtered.map(e => {
              const valParada    = (e.valor && e.paradas && e.qt) ? e.valor / (e.paradas * e.qt) : null;
              const valParadaIncc= (valParada && e.incc) ? valParada / e.incc : null;
              return (
                <tr key={e.id} style={e._status==='incompleto'?{background:'#fffbeb'}:{}}>
                  <td className="strong">{e.obra}</td>
                  <td>{e.marca ? <span className="badge neutral">{e.marca}</span> : '—'}</td>
                  <td className="center mono num">{e.paradas ?? '—'}</td>
                  <td className="center mono num">{e.qt ?? '—'}</td>
                  <td className="right mono num strong">{e.valor ? fmtR2(e.valor) : '—'}</td>
                  <td className="right mono num">{valParada ? fmtR2(valParada) : '—'}</td>
                  <td className="mono text-muted" style={{ fontSize:11 }}>{e.mes||'—'}</td>
                  <td className="right mono num text-muted">{e.incc ? fmtNumES(e.incc,3) : '—'}</td>
                  <td className="right mono num">{valParadaIncc ? fmtNumES(valParadaIncc,2) : '—'}</td>
                  <td className="center">
                    <div style={{ display:'flex', gap:4, justifyContent:'center', alignItems:'center' }}>
                      {e._status==='incompleto' && <span className="badge warning" style={{ fontSize:10 }}>Incompleto</span>}
                      <button className="icon-btn" style={{ width:26,height:26 }} title="Editar" onClick={()=>startEdit(e)}><Icon name="edit" size={12} /></button>
                      <button className="icon-btn" style={{ width:26,height:26,color:'#e53e3e' }} title="Excluir" onClick={()=>setDelConf(e)}><Icon name="trash" size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding:'8px 16px', fontSize:11.5, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
        {filtered.length} registro(s) · Fórmula: Valor Fechado ÷ (Nº Paradas × Qt. Elevadores) ÷ INCC Base
      </div>
    </div>
  );
};

// ---------- BASE FUNDAÇÃO ----------
const BaseFundacao = () => {
  const inccAtual = 1259.652;
  const { items, loading, inserir, atualizar, excluir: excluirDb } = useBaseSupabase('fundacao');
  const [showForm,   setShowForm]   = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [editItem,   setEditItem]   = React.useState(null);
  const [delConf,    setDelConf]    = React.useState(null);
  const [filterObra, setFilterObra] = React.useState('');
  const [filterTipo, setFilterTipo] = React.useState('');

  const obras = [...new Set(items.map(i=>i.obra).filter(Boolean))].sort();
  const tipos = [...new Set(items.map(i=>i.fund).filter(Boolean))].sort();

  const filtered = items.filter(i =>
    (!filterObra || i.obra === filterObra) &&
    (!filterTipo || i.fund === filterTipo)
  );

  const emptyForm = { fund:'Estaca Hélice', obra:'', area:0, pavtos:0, custo:0, inccBase:0, mes:'' };
  const [form, setForm] = React.useState(emptyForm);
  const updF = (k,v) => setForm(s=>({...s,[k]:v}));

  const startEdit = (item) => { const { id, ...rest } = item; setForm({...emptyForm, ...rest}); setEditItem(item); setShowForm(true); };

  const salvar = async () => {
    if (!form.obra.trim()) return;
    if (editItem) { await atualizar(editItem.id, form); setEditItem(null); }
    else { await inserir(form); }
    setForm(emptyForm); setShowForm(false);
  };
  const excluir = async (id) => { await excluirDb(id); setDelConf(null); };

  return (
    <div className="card">
      {showForm && (
        <FormModal title={editItem ? "Editar Fundação" : "Nova Fundação"}
          fields={[
            { key:'fund',    label:'Tipo de fundação', type:'select', options:['Estaca Hélice','Estaca Raiz','Sapata','Perfil Metálico','Estaca Escavada','Radier','Tubulão a Céu Aberto'], full:true },
            { key:'obra',    label:'Obra' },
            { key:'area',    label:'Área terreno (m²)', type:'number' },
            { key:'pavtos',  label:'Qt. pavimentos', type:'number' },
            { key:'custo',   label:'Custo (R$)', type:'number' },
            { key:'inccBase',label:'INCC base', type:'number' },
            { key:'mes',     label:'Mês', type:'month' },
          ]}
          values={form} onChange={updF} onSave={salvar} onCancel={() => { setShowForm(false); setEditItem(null); }} />
      )}
      {delConf && <ConfirmModal2 title="Excluir fundação?" msg1={`Excluir registro de "${delConf.obra}"?`} msg2="Ação irreversível." onConfirm={()=>excluir(delConf.id)} onCancel={()=>setDelConf(null)} />}
      {showImport && <ImportModal tipo="fundacao" onImportar={inserir} onCancel={() => setShowImport(false)} onSuccess={() => { setShowImport(false); refresh(); }} />}

      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', letterSpacing:'0.06em', textTransform:'uppercase', marginRight:4 }}>Fundação</span>
        <select className="input" value={filterObra} onChange={e=>setFilterObra(e.target.value)} style={{ minWidth:140, fontSize:12 }}>
          <option value="">Todas as obras</option>
          {obras.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
        <select className="input" value={filterTipo} onChange={e=>setFilterTipo(e.target.value)} style={{ minWidth:140, fontSize:12 }}>
          <option value="">Todos os tipos</option>
          {tipos.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ marginLeft:'auto', fontSize:11.5, color:'var(--text-muted)' }}>{filtered.length} registros</span>
        <div className="card-actions" style={{ marginLeft:0 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => exportarBase('fundacao', items)}><Icon name="download" size={12} />Exportar</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowImport(true)}><Icon name="upload" size={12} />Importar</button>
          <button className="btn btn-sm btn-primary" onClick={()=>setShowForm(true)}><Icon name="plus" size={13} />Nova Fundação</button>
        </div>
      </div>

      <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:360 }}>
        <table className="tbl" style={{ minWidth:760 }}>
          <thead style={{ position:'sticky', top:0, background:'var(--surface)', zIndex:1 }}>
            <tr>
              <th>Obra</th><th>Fundação</th>
              <th className="right">Área Terreno (m²)</th><th className="center">Qt. Pavimentos</th>
              <th className="right">Custo (R$)</th><th className="right">INCC Base</th>
              <th className="right">Custo (INCC)</th><th className="right">Coef. INCC/m²/Pav.</th>
              <th className="center">Mês</th>
              <th style={{ width:72 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10} style={{ textAlign:'center', padding:20, color:'var(--text-muted)' }}>Nenhum registro encontrado.</td></tr>}
            {filtered.map(f => {
              const custoIncc = (f.custo && f.inccBase) ? f.custo / f.inccBase : 0;
              const coef      = (custoIncc && f.area && f.pavtos) ? custoIncc / (f.area * f.pavtos) : 0;
              return (
                <tr key={f.id} style={f._status==='incompleto'?{background:'#fffbeb'}:{}}>
                  <td className="strong">{f.obra}</td>
                  <td style={{ color:'var(--brand)', fontSize:12 }}>{f.fund}</td>
                  <td className="right mono num">{fmtNumES(f.area,2)}</td>
                  <td className="center mono num">{f.pavtos}</td>
                  <td className="right mono num strong">{fmtR2(f.custo)}</td>
                  <td className="right mono num text-muted">{fmtNumES(f.inccBase,3)}</td>
                  <td className="right mono num">{fmtNumES(custoIncc,2)}</td>
                  <td className="right mono num"><span className="badge info">{coef.toFixed(3)}</span></td>
                  <td className="center mono" style={{ fontSize:12, color:'var(--text-muted)' }}>{f.mes || '—'}</td>
                  <td className="center">
                    <div style={{ display:'flex', gap:4, justifyContent:'center', alignItems:'center' }}>
                      {f._status==='incompleto' && <span className="badge warning" style={{ fontSize:10 }}>Incompleto</span>}
                      <button className="icon-btn" style={{ width:26,height:26 }} title="Editar" onClick={()=>startEdit(f)}><Icon name="edit" size={12} /></button>
                      <button className="icon-btn" style={{ width:26,height:26,color:'#e53e3e' }} title="Excluir" onClick={()=>setDelConf(f)}><Icon name="trash" size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding:'8px 16px', fontSize:11.5, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
        {filtered.length} registro(s) · Coeficiente = Custo (INCC) ÷ Área Terreno ÷ Qt. Pavimentos
      </div>
    </div>
  );
};

// ---------- BASE IMPLANTAÇÃO ----------
const BaseImplantacao = () => {
  const { items, loading, inserir, atualizar, excluir: excluirDb } = useBaseSupabase('implantacao');
  const [showForm,   setShowForm]   = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [editItem,   setEditItem]   = React.useState(null);
  const [delConf,    setDelConf]    = React.useState(null);
  const [search,  setSearch]  = React.useState('');

  const filtered = items.filter(i =>
    !search || (i.item||'').toLowerCase().includes(search.toLowerCase()) || (i.obs||'').toLowerCase().includes(search.toLowerCase())
  );

  const emptyForm = { obs:'', item:'', qtd:0, unid:'M2', precoRS:0, precoIncc:0 };
  const [form, setForm] = React.useState(emptyForm);
  const updF = (k,v) => setForm(s=>({...s,[k]:v}));

  const startEdit = (item) => { const { id, ...rest } = item; setForm({...emptyForm, ...rest}); setEditItem(item); setShowForm(true); };

  const salvar = async () => {
    if (!form.item.trim()) return;
    if (editItem) { await atualizar(editItem.id, form); setEditItem(null); }
    else { await inserir(form); }
    setForm(emptyForm); setShowForm(false);
  };
  const excluir = async (id) => { await excluirDb(id); setDelConf(null); };

  return (
    <div className="card">
      {showForm && (
        <FormModal title={editItem ? "Editar Item de Implantação" : "Novo Item de Implantação"}
          fields={[
            { key:'obs',       label:'Observação / Fórmula', full:true },
            { key:'item',      label:'Item', full:true },
            { key:'qtd',       label:'Qtd.', type:'number' },
            { key:'unid',      label:'Unidade', type:'select', options:['M2','M','UN','VB','KG','L'] },
            { key:'precoRS',   label:'Preço Unit. (R$)', type:'number' },
            { key:'precoIncc', label:'Preço Unit. (INCC)', type:'number' },
          ]}
          values={form} onChange={updF} onSave={salvar} onCancel={() => { setShowForm(false); setEditItem(null); }} />
      )}
      {delConf && <ConfirmModal2 title="Excluir item?" msg1={`Excluir "${delConf.item}"?`} msg2="Ação irreversível." onConfirm={()=>excluir(delConf.id)} onCancel={()=>setDelConf(null)} />}
      {showImport && <ImportModal tipo="implantacao" onImportar={inserir} onCancel={() => setShowImport(false)} onSuccess={() => { setShowImport(false); refresh(); }} />}

      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', letterSpacing:'0.06em', textTransform:'uppercase', marginRight:4 }}>Implantação</span>
        <input className="input input-search" placeholder="Buscar item ou observação…" value={search} onChange={e=>setSearch(e.target.value)} style={{ flex:1, minWidth:200 }} />
        <span style={{ fontSize:11.5, color:'var(--text-muted)' }}>{filtered.length} itens</span>
        <div className="card-actions" style={{ marginLeft:0 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => exportarBase('implantacao', items)}><Icon name="download" size={12} />Exportar</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowImport(true)}><Icon name="upload" size={12} />Importar</button>
          <button className="btn btn-sm btn-primary" onClick={()=>setShowForm(true)}><Icon name="plus" size={13} />Novo Item</button>
        </div>
      </div>

      <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:360 }}>
        <table className="tbl" style={{ minWidth:760 }}>
          <thead style={{ position:'sticky', top:0, background:'var(--surface)', zIndex:1 }}>
            <tr>
              <th>Observação</th><th>Item</th>
              <th className="right">Qtd.</th><th>Unid.</th>
              <th className="right">Preço Unit. (R$)</th><th className="right">Preço Unit. (INCC)</th>
              <th className="right">Total (INCC)</th>
              <th style={{ width:72 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign:'center', padding:20, color:'var(--text-muted)' }}>Nenhum item encontrado.</td></tr>}
            {filtered.map(i => (
              <tr key={i.id} style={i._status==='incompleto'?{background:'#fffbeb'}:{}}>
                <td className="text-muted" style={{ fontSize:11 }}>{i.obs}</td>
                <td className="strong" style={{ fontSize:12 }}>{i.item}</td>
                <td className="right mono num">{fmtNumES(i.qtd,2)}</td>
                <td className="mono" style={{ fontSize:11 }}>{i.unid}</td>
                <td className="right mono num">{fmtR2(i.precoRS)}</td>
                <td className="right mono num">{fmtNumES(i.precoIncc,4)}</td>
                <td className="right mono num strong">{fmtNumES(i.qtd * i.precoIncc, 2)}</td>
                <td className="center">
                  <div style={{ display:'flex', gap:4, justifyContent:'center', alignItems:'center' }}>
                    {i._status==='incompleto' && <span className="badge warning" style={{ fontSize:10 }}>Incompleto</span>}
                    <button className="icon-btn" style={{ width:26,height:26 }} title="Editar" onClick={()=>startEdit(i)}><Icon name="edit" size={12} /></button>
                    <button className="icon-btn" style={{ width:26,height:26,color:'#e53e3e' }} title="Excluir" onClick={()=>setDelConf(i)}><Icon name="trash" size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export { EstimativasScreen };
