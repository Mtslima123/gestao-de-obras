// TaskFormPanel — painel inferior "Formulário de Tarefa" do Gantt (estilo MS Project),
// aberto pelo checkbox "Detalhes" da aba Exibir. Mostra/edita só os campos que têm
// lógica real por trás no motor de agendamento (scheduleEngine.js) — sem sub-grade de
// Recursos nem "Controlada pelo empenho"/"Tipo de tarefa" (não existem neste sistema).
import React from 'react';
import { Icon } from '../../components/Icons';
import { offsetToISO, taskEnd } from './cronogramaDateUtils';
import { commitFieldChange, autoScheduleFromDeps, computeGroupValues } from './scheduleEngine';

const DEP_TIPOS = ['TI', 'TT', 'II', 'IT'];
const PANEL_H = 220;

const labelSt = { fontSize: 10.5, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3, display: 'block' };
const thSt = { padding: '5px 8px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-faint)', textAlign: 'right', borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' };
const tdSt = { padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))' };

export const TaskFormPanel = ({ task, etapas, onCommit, readOnly = false, canPrev, canNext, onPrev, onNext }) => {
  const [novoPredId, setNovoPredId] = React.useState('');
  const groupVals = React.useMemo(() => computeGroupValues(etapas), [etapas]);

  if (!task) {
    return (
      <div style={{ height: PANEL_H, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-faint)', fontSize: 13, flexShrink: 0 }}>
        Selecione uma tarefa para ver os detalhes
      </div>
    );
  }

  const locked = readOnly || task.isGroup;
  const gv = task.isGroup ? groupVals[task.id] : null;
  const eInicio = gv ? gv.inicio : task.inicio;
  const eDur    = gv ? gv.dur    : task.dur;
  const eAvanco = gv ? gv.avanco : task.avanco;
  const eFim    = offsetToISO(taskEnd({ ...task, inicio: eInicio, dur: eDur }));

  const save = (field, value) => onCommit(commitFieldChange(etapas, task.id, field, value));
  const setDep = (novoDep) => onCommit(autoScheduleFromDeps(etapas.map(e => (e.id === task.id ? { ...e, dep: novoDep } : e))));
  const updatePred = (idx, patch) => setDep(task.dep.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  const removePred = (idx) => setDep((task.dep || []).filter((_, i) => i !== idx));
  const addPred = () => {
    const ref = (novoPredId || '').trim();
    if (!ref) return;
    const found = etapas.find(e => String(e.displayId) === ref) || etapas.find(e => e.id === ref);
    if (!found || found.id === task.id || (task.dep || []).some(d => d.id === found.id)) { setNovoPredId(''); return; }
    setDep([...(task.dep || []), { id: found.id, tipo: 'TI', lag: 0 }]);
    setNovoPredId('');
  };

  const inputSt = { height: 26, fontSize: 12.5, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 6, background: locked ? 'var(--surface-muted)' : 'var(--surface)', width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ height: PANEL_H, flexShrink: 0, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '10px 16px', gap: 8, overflow: 'hidden', maxWidth: 900, width: '100%', margin: '0 auto' }}>
      {/* Linha 1 */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 180 }}>
          <label style={labelSt}>Nome</label>
          <input key={task.id + '_nome'} style={inputSt} disabled={locked}
            defaultValue={task.etapa}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            onBlur={e => e.target.value.trim() && e.target.value !== task.etapa && save('etapa', e.target.value)} />
        </div>
        <div style={{ width: 90 }}>
          <label style={labelSt}>Duração</label>
          <input key={task.id + '_dur'} type="number" min={1} style={inputSt} disabled={locked}
            defaultValue={eDur}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            onBlur={e => save('duracaoDias', e.target.value)} />
        </div>
        <div style={{ width: 90 }}>
          <label style={labelSt}>% concluída</label>
          <input key={task.id + '_avanco'} type="number" min={0} max={100} style={inputSt} disabled={locked}
            defaultValue={eAvanco}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            onBlur={e => save('avanco', e.target.value)} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, whiteSpace: 'nowrap', paddingBottom: 6, cursor: locked ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={task.modo === 'manual'} disabled={locked}
            onChange={e => save('modo', e.target.checked ? 'manual' : 'auto')} style={{ accentColor: 'var(--brand)' }} />
          Agendada Manualmente
        </label>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 28 }} disabled={!canPrev} onClick={onPrev}>← Anterior</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 28 }} disabled={!canNext} onClick={onNext}>Próxima →</button>
        </div>
      </div>

      {/* Linha 2 */}
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ width: 150 }}>
          <label style={labelSt}>Início</label>
          <input type="date" style={inputSt} disabled={locked}
            value={offsetToISO(eInicio)} onChange={e => save('inicio', e.target.value)} />
        </div>
        <div style={{ width: 150 }}>
          <label style={labelSt}>Término</label>
          <input type="date" style={inputSt} disabled={locked}
            value={eFim} onChange={e => save('fim', e.target.value)} />
        </div>
      </div>

      {/* Predecessoras */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={thSt}>Id</th>
              <th style={{ ...thSt, textAlign: 'left' }}>Nome da predecessora</th>
              <th style={thSt}>Tipo</th>
              <th style={thSt}>Latência</th>
              <th style={{ ...thSt, width: 24 }}></th>
            </tr>
          </thead>
          <tbody>
            {(task.dep || []).map((d, i) => {
              const pred = etapas.find(e => e.id === d.id);
              return (
                <tr key={i}>
                  <td style={tdSt}>{pred?.displayId ?? d.id}</td>
                  <td style={{ ...tdSt, textAlign: 'left' }}>{pred?.etapa ?? '—'}</td>
                  <td style={tdSt}>
                    <select value={d.tipo || 'TI'} disabled={locked} onChange={e => updatePred(i, { tipo: e.target.value })}
                      style={{ fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 4 }}>
                      {DEP_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={tdSt}>
                    <input type="number" value={d.lag ?? 0} disabled={locked}
                      onChange={e => updatePred(i, { lag: parseInt(e.target.value, 10) || 0 })}
                      style={{ width: 46, fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 4, textAlign: 'right' }} /> d
                  </td>
                  <td style={tdSt}>
                    {!locked && (
                      <button onClick={() => removePred(i)} title="Remover predecessora"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                        <Icon name="x" size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!locked && (
              <tr>
                <td colSpan={5} style={{ ...tdSt, textAlign: 'left' }}>
                  <input placeholder="Id da tarefa predecessora + Enter" value={novoPredId}
                    onChange={e => setNovoPredId(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addPred(); }}
                    style={{ width: '100%', border: 'none', outline: 'none', fontSize: 12, background: 'transparent' }} />
                </td>
              </tr>
            )}
            {!(task.dep || []).length && locked && (
              <tr><td colSpan={5} style={{ ...tdSt, textAlign: 'center', color: 'var(--text-faint)' }}>Sem predecessoras</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
