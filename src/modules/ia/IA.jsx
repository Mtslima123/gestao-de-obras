import React from 'react';
import { Icon } from '../../components/Icons';
import { iaService } from './ia.service';

const TIPOS_OBRA = [
  { value: 'residencial_unifamiliar',   label: 'Residencial Unifamiliar' },
  { value: 'residencial_multifamiliar', label: 'Residencial Multifamiliar' },
  { value: 'comercial',                 label: 'Comercial' },
  { value: 'industrial',                label: 'Industrial' },
  { value: 'infraestrutura',            label: 'Infraestrutura' },
  { value: 'reforma',                   label: 'Reforma' },
];

const MOTIVOS_ATRASO = [
  { value: 'chuva',              label: 'Condições climáticas (chuva)' },
  { value: 'falta_material',     label: 'Falta de material' },
  { value: 'mo_insuficiente',    label: 'Mão de obra insuficiente' },
  { value: 'paralisacao',        label: 'Paralisação' },
  { value: 'alteracao_projeto',  label: 'Alteração de projeto' },
  { value: 'outros',             label: 'Outros' },
];

const TABS = [
  { id: 'gerar-cronograma', label: 'Cronograma',        icon: 'calendar' },
  { id: 'gerar-eap',        label: 'EAP',               icon: 'layers' },
  { id: 'analisar-atraso',  label: 'Análise de Atraso', icon: 'alert-triangle' },
  { id: 'replanejar',       label: 'Replanejamento',    icon: 'clock' },
  { id: 'otimizar',         label: 'Otimização',        icon: 'trending-up' },
  { id: 'gerar-relatorio',  label: 'Relatório',         icon: 'file' },
];

// ── Badges de status ──────────────────────────────────────────────────────────

const gravidadeCor = { baixa: 'success', media: 'warning', alta: 'danger', critica: 'danger' };
const statusCor    = { em_dia: 'success', atencao: 'warning', critico: 'danger' };
const riscoCor     = { baixo: 'success', medio: 'warning', alto: 'danger' };

const Badge = ({ value, map }) => (
  <span className={`badge ${map[value] ?? 'info'}`} style={{ textTransform: 'capitalize' }}>
    {value?.replace(/_/g, ' ')}
  </span>
);

// ── Campo de formulário reutilizável ──────────────────────────────────────────

const Field = ({ label, children, hint }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label}
    </label>
    {children}
    {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{hint}</div>}
  </div>
);

const inputStyle = {
  width: '100%',
  padding: '7px 10px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 13,
  background: 'var(--surface)',
  color: 'var(--text)',
  boxSizing: 'border-box',
};

const Select = ({ value, onChange, options }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

// ── Formulários por tab ───────────────────────────────────────────────────────

const FormCronograma = ({ form, set }) => (
  <>
    <Field label="Tipo de Obra">
      <Select value={form.tipoObra} onChange={v => set('tipoObra', v)} options={TIPOS_OBRA} />
    </Field>
    <Field label="Descrição do Projeto" hint="Descreva características relevantes da obra">
      <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)}
        rows={3} style={{ ...inputStyle, resize: 'vertical' }}
        placeholder="Ex: Edifício residencial de 10 pavimentos com 4 apartamentos por andar, estrutura em concreto armado..." />
    </Field>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="Pavimentos">
        <input type="number" min={1} max={100} value={form.quantidadePavimentos}
          onChange={e => set('quantidadePavimentos', e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Prazo (dias)">
        <input type="number" min={30} value={form.prazoDias}
          onChange={e => set('prazoDias', e.target.value)} style={inputStyle} />
      </Field>
    </div>
    <Field label="Calendário de Trabalho" hint="Opcional">
      <input type="text" value={form.calendario} onChange={e => set('calendario', e.target.value)}
        placeholder="Ex: Segunda a sábado, 8h/dia" style={inputStyle} />
    </Field>
    <Field label="Restrições" hint="Opcional">
      <textarea value={form.restricoes} onChange={e => set('restricoes', e.target.value)}
        rows={2} style={{ ...inputStyle, resize: 'vertical' }}
        placeholder="Ex: Terreno com contenção especial, restrição de barulho noturno..." />
    </Field>
  </>
);

const FormEap = ({ form, set }) => (
  <>
    <Field label="Tipo de Obra">
      <Select value={form.tipoObra} onChange={v => set('tipoObra', v)} options={TIPOS_OBRA} />
    </Field>
    <Field label="Descrição do Projeto">
      <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)}
        rows={3} style={{ ...inputStyle, resize: 'vertical' }}
        placeholder="Ex: Galpão industrial de 5.000m², estrutura metálica, pé-direito de 12m..." />
    </Field>
    <Field label="Pavimentos">
      <input type="number" min={1} max={100} value={form.quantidadePavimentos}
        onChange={e => set('quantidadePavimentos', e.target.value)} style={inputStyle} />
    </Field>
    <Field label="Escopo Adicional" hint="Opcional — itens fora do padrão do tipo de obra">
      <textarea value={form.escopo} onChange={e => set('escopo', e.target.value)}
        rows={2} style={{ ...inputStyle, resize: 'vertical' }}
        placeholder="Ex: Inclui área de lazer completa, heliponto, sistema fotovoltaico..." />
    </Field>
  </>
);

const FormAtraso = ({ form, set, obras }) => (
  <>
    {obras?.length > 0 && (
      <Field label="Obra">
        <Select value={form.obraId} onChange={v => set('obraId', v)}
          options={[{ value: '', label: '— Selecione (opcional) —' }, ...obras.map(o => ({ value: String(o.id), label: o.nome }))]} />
      </Field>
    )}
    <Field label="Data de Término Contratual">
      <input type="date" value={form.dataFimObra} onChange={e => set('dataFimObra', e.target.value)} style={inputStyle} />
    </Field>
    <Field label="Atraso Estimado (dias)">
      <input type="number" min={0} value={form.diasAtraso}
        onChange={e => set('diasAtraso', e.target.value)} style={inputStyle} />
    </Field>
    <Field label="Descrição da Situação Atual" hint="Descreva as tarefas atrasadas, causas prováveis e situação do canteiro">
      <textarea value={form.descricaoSituacao} onChange={e => set('descricaoSituacao', e.target.value)}
        rows={4} style={{ ...inputStyle, resize: 'vertical' }}
        placeholder="Ex: Concretagem dos pilares do 5º ao 8º pavimento com 15 dias de atraso por falta de aço. Alvenaria aguardando estrutura..." />
    </Field>
    <Field label="Contexto Adicional" hint="Opcional">
      <textarea value={form.contextoAdicional} onChange={e => set('contextoAdicional', e.target.value)}
        rows={2} style={{ ...inputStyle, resize: 'vertical' }}
        placeholder="Ex: Cliente exige entrega até dezembro, multa contratual de 0,5% ao dia..." />
    </Field>
  </>
);

const FormReplanejar = ({ form, set, obras }) => (
  <>
    {obras?.length > 0 && (
      <Field label="Obra">
        <Select value={form.obraId} onChange={v => set('obraId', v)}
          options={[{ value: '', label: '— Selecione (opcional) —' }, ...obras.map(o => ({ value: String(o.id), label: o.nome }))]} />
      </Field>
    )}
    <Field label="Motivo do Atraso">
      <Select value={form.motivo} onChange={v => set('motivo', v)} options={MOTIVOS_ATRASO} />
    </Field>
    <Field label="Dias Perdidos">
      <input type="number" min={0} value={form.diasPerdidos}
        onChange={e => set('diasPerdidos', e.target.value)} style={inputStyle} />
    </Field>
    <Field label="Descrição do Impacto">
      <textarea value={form.descricaoImpacto} onChange={e => set('descricaoImpacto', e.target.value)}
        rows={3} style={{ ...inputStyle, resize: 'vertical' }}
        placeholder="Ex: Chuvas intensas em fevereiro paralisaram completamente o canteiro por 12 dias. Concretagem suspensa..." />
    </Field>
    <Field label="Tarefas Impactadas" hint="Descreva quais tarefas foram afetadas e em que estágio estão">
      <textarea value={form.descricaoTarefas} onChange={e => set('descricaoTarefas', e.target.value)}
        rows={3} style={{ ...inputStyle, resize: 'vertical' }}
        placeholder="Ex: Estrutura do 6º ao 10º pavimento (45% concluída), alvenaria bloqueada, instalações hidráulicas aguardando..." />
    </Field>
    <Field label="Restrições" hint="Opcional">
      <input type="text" value={form.restricoes} onChange={e => set('restricoes', e.target.value)}
        placeholder="Ex: Sem orçamento para horas extras, entrega final inamovível..." style={inputStyle} />
    </Field>
  </>
);

const FormOtimizar = ({ form, set, obras }) => (
  <>
    {obras?.length > 0 && (
      <Field label="Obra">
        <Select value={form.obraId} onChange={v => set('obraId', v)}
          options={[{ value: '', label: '— Selecione (opcional) —' }, ...obras.map(o => ({ value: String(o.id), label: o.nome }))]} />
      </Field>
    )}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="Prazo Atual (dias)">
        <input type="number" min={0} value={form.prazoAtual}
          onChange={e => set('prazoAtual', e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Prazo Alvo (dias)">
        <input type="number" min={0} value={form.prazoAlvo}
          onChange={e => set('prazoAlvo', e.target.value)} style={inputStyle} />
      </Field>
    </div>
    <Field label="Descrição do Cronograma Atual" hint="Descreva as principais fases e onde há folgas ou paralelismos possíveis">
      <textarea value={form.descricaoCronograma} onChange={e => set('descricaoCronograma', e.target.value)}
        rows={4} style={{ ...inputStyle, resize: 'vertical' }}
        placeholder="Ex: Obra com 8 fases, estrutura no caminho crítico (120 dias), alvenaria e instalações com 20 dias de folga..." />
    </Field>
    <Field label="Restrições" hint="Opcional">
      <textarea value={form.restricoes} onChange={e => set('restricoes', e.target.value)}
        rows={2} style={{ ...inputStyle, resize: 'vertical' }}
        placeholder="Ex: Não é possível adicionar mais mão de obra na estrutura, restrição de barulho aos finais de semana..." />
    </Field>
  </>
);

const FormRelatorio = ({ form, set, obras }) => (
  <>
    {obras?.length > 0 && (
      <Field label="Obra">
        <Select value={form.obraId} onChange={v => set('obraId', v)}
          options={[{ value: '', label: '— Selecione (opcional) —' }, ...obras.map(o => ({ value: String(o.id), label: o.nome }))]} />
      </Field>
    )}
    <Field label="Período do Relatório">
      <input type="text" value={form.periodo} onChange={e => set('periodo', e.target.value)}
        placeholder="Ex: Maio/2026" style={inputStyle} />
    </Field>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="Avanço Físico (%)">
        <input type="number" min={0} max={100} value={form.avancoFisico}
          onChange={e => set('avancoFisico', e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Avanço Financeiro (%)">
        <input type="number" min={0} max={100} value={form.avancoFinanceiro}
          onChange={e => set('avancoFinanceiro', e.target.value)} style={inputStyle} />
      </Field>
    </div>
    <Field label="Situação Geral do Período" hint="Descreva o que aconteceu no período: avanços, problemas, decisões">
      <textarea value={form.descricaoSituacao} onChange={e => set('descricaoSituacao', e.target.value)}
        rows={4} style={{ ...inputStyle, resize: 'vertical' }}
        placeholder="Ex: Concluída a estrutura do 8º pavimento. Iniciada alvenaria nos pavimentos inferiores. Atraso de 5 dias na entrega do aço..." />
    </Field>
  </>
);

// ── Painéis de resultado ──────────────────────────────────────────────────────

const ResultCronograma = ({ resultado }) => {
  const { cronograma, resumo } = resultado;
  return (
    <>
      {resumo && (
        <div className="card" style={{ marginBottom: 12, padding: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Resumo</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand)' }}>{resumo.total_tarefas}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tarefas</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand)' }}>{resumo.prazo_estimado_dias}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dias estimados</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand)' }}>{resumo.fases?.length ?? '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fases</div>
            </div>
          </div>
          {resumo.premissas?.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Premissas</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)' }}>
                {resumo.premissas.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
      {cronograma?.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
            Tarefas ({cronograma.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nome</th>
                  <th>Fase</th>
                  <th className="right">Duração</th>
                  <th>EAP</th>
                  <th>Predecessoras</th>
                </tr>
              </thead>
              <tbody>
                {cronograma.map(t => (
                  <tr key={t.id}>
                    <td className="mono">{t.id}</td>
                    <td className="strong">{t.nome}</td>
                    <td><span className="badge info">{t.fase}</span></td>
                    <td className="right mono">{t.duracao}d</td>
                    <td className="mono">{t.nivel_eap}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {t.predecessoras?.map(p => `${p.id}${p.tipo}`).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};

const ResultEap = ({ resultado }) => {
  const { eap } = resultado;
  if (!eap?.length) return null;
  const indent = { 1: 0, 2: 16, 3: 32 };
  const bgNivel = { 1: 'var(--brand-tint,#e8f0fb)', 2: 'var(--surface)', 3: 'transparent' };
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
        EAP — {eap.length} itens
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Entregável</th>
              <th>Critério de Aceite</th>
            </tr>
          </thead>
          <tbody>
            {eap.map((item, i) => (
              <tr key={i} style={{ background: bgNivel[item.nivel] }}>
                <td className="mono" style={{ fontWeight: item.nivel === 1 ? 700 : 400 }}>{item.codigo}</td>
                <td>
                  <div style={{ paddingLeft: indent[item.nivel] ?? 0, fontWeight: item.nivel === 1 ? 700 : item.nivel === 2 ? 600 : 400 }}>
                    {item.nome}
                  </div>
                  {item.descricao && <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: indent[item.nivel] ?? 0 }}>{item.descricao}</div>}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.entregavel || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.criterio_aceite || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ResultAtraso = ({ resultado }) => {
  const { diagnostico, gargalos, estrategias, alertas } = resultado;
  return (
    <>
      {diagnostico && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Diagnóstico</div>
            <Badge value={diagnostico.gravidade} map={gravidadeCor} />
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 13.5 }}>{diagnostico.resumo_executivo}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Impacto estimado</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{diagnostico.impacto_prazo_dias} dias</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Atraso geral</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{diagnostico.percentual_atraso_geral}%</div>
            </div>
          </div>
        </div>
      )}

      {alertas?.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: '#92400e' }}>
          {alertas.map((a, i) => <div key={i} style={{ display: 'flex', gap: 6 }}><Icon name="alert-triangle" size={13} style={{ marginTop: 1, flexShrink: 0 }} />{a}</div>)}
        </div>
      )}

      {gargalos?.length > 0 && (
        <div className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Gargalos</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Área</th><th>Motivo Provável</th><th>Impacto</th><th className="center">Crítica</th></tr></thead>
              <tbody>
                {gargalos.map((g, i) => (
                  <tr key={i}>
                    <td className="strong">{g.area ?? g.tarefa_nome}</td>
                    <td>{g.motivo_provavel}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.impacto}</td>
                    <td className="center">{g.critica ? <span className="badge danger">Sim</span> : <span className="badge success">Não</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {estrategias?.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Estratégias de Recuperação</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>#</th><th>Ação</th><th className="right">Redução</th><th>Custo</th><th>Viabilidade</th></tr></thead>
              <tbody>
                {estrategias.map((e, i) => (
                  <tr key={i}>
                    <td className="mono">{e.prioridade}</td>
                    <td>
                      <div className="strong">{e.acao}</div>
                      {e.descricao && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.descricao}</div>}
                    </td>
                    <td className="right mono">{e.reducao_dias_estimada}d</td>
                    <td><Badge value={e.custo_adicional} map={riscoCor} /></td>
                    <td><Badge value={e.viabilidade} map={{ alta: 'success', media: 'warning', baixa: 'danger' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};

const ResultReplanejar = ({ resultado }) => {
  const { estrategias, recomendacao_principal, alerta } = resultado;
  return (
    <>
      {recomendacao_principal && (
        <div className="card" style={{ padding: 16, marginBottom: 12, borderLeft: '3px solid var(--brand)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Recomendação Principal
          </div>
          <p style={{ margin: 0, fontSize: 13.5 }}>{recomendacao_principal}</p>
        </div>
      )}
      {alerta && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: '#92400e', display: 'flex', gap: 6 }}>
          <Icon name="alert-triangle" size={13} style={{ marginTop: 1, flexShrink: 0 }} />{alerta}
        </div>
      )}
      {estrategias?.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
            Estratégias ({estrategias.length})
          </div>
          {estrategias.map((e, i) => (
            <div key={i} style={{ padding: '12px 16px', borderBottom: i < estrategias.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', background: 'var(--brand-tint,#e8f0fb)', borderRadius: 4, padding: '2px 7px' }}>
                  #{e.prioridade}
                </span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{e.acao}</span>
                <Badge value={e.impacto_custo} map={riscoCor} />
              </div>
              <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted)' }}>{e.descricao}</p>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Recuperação estimada: <strong>{e.dias_recuperados_estimado} dias</strong> · Impacto na qualidade: <strong>{e.impacto_qualidade}</strong>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

const ResultOtimizar = ({ resultado }) => {
  const { otimizacoes, reducao_total_estimada_dias, novo_prazo_estimado_dias, observacoes } = resultado;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--brand)' }}>-{reducao_total_estimada_dias}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Dias de redução</div>
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--brand)' }}>{novo_prazo_estimado_dias}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Novo prazo (dias)</div>
        </div>
      </div>

      {otimizacoes?.length > 0 && (
        <div className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Otimizações</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Área</th><th>Ação</th><th className="right">Redução</th><th>Risco</th><th>Custo</th></tr></thead>
              <tbody>
                {otimizacoes.map((o, i) => (
                  <tr key={i}>
                    <td className="strong">{o.area_cronograma ?? o.tarefa_nome}</td>
                    <td>
                      <div>{o.acao}</div>
                      {o.justificativa && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.justificativa}</div>}
                    </td>
                    <td className="right mono">{o.reducao_dias}d</td>
                    <td><Badge value={o.risco} map={riscoCor} /></td>
                    <td><Badge value={o.custo_adicional} map={riscoCor} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {observacoes?.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Observações</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-muted)' }}>
            {observacoes.map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        </div>
      )}
    </>
  );
};

const ResultRelatorio = ({ resultado }) => {
  const r = resultado.relatorio;
  if (!r) return null;
  return (
    <>
      <div className="card" style={{ padding: 16, marginBottom: 12, borderLeft: '3px solid var(--brand)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{r.titulo}</div>
          <Badge value={r.status_geral} map={statusCor} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{r.periodo}</div>
        <p style={{ margin: 0, fontSize: 13.5 }}>{r.resumo_executivo}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
        {[
          { label: 'Avanço Físico',       value: `${r.avanco_fisico}%` },
          { label: 'Avanço Financeiro',   value: `${r.avanco_financeiro}%` },
          { label: 'Desvio Físico',       value: `${r.desvio_fisico > 0 ? '+' : ''}${r.desvio_fisico}%` },
          { label: 'Desvio Financeiro',   value: `${r.desvio_financeiro > 0 ? '+' : ''}${r.desvio_financeiro}%` },
        ].map((kpi, i) => (
          <div key={i} className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{kpi.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Realizações</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{r.principais_realizacoes?.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Pendências</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{r.principais_pendencias?.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      </div>

      {r.riscos_identificados?.length > 0 && (
        <div className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Riscos Identificados</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Descrição</th><th>Probabilidade</th><th>Impacto</th></tr></thead>
              <tbody>
                {r.riscos_identificados.map((risco, i) => (
                  <tr key={i}>
                    <td>{risco.descricao}</td>
                    <td><Badge value={risco.probabilidade} map={{ alta: 'danger', media: 'warning', baixa: 'success' }} /></td>
                    <td><Badge value={risco.impacto} map={riscoCor} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {r.acoes_recomendadas?.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Ações Recomendadas</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{r.acoes_recomendadas.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      {r.projecao_termino && (
        <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="flag" size={18} style={{ color: 'var(--brand)' }} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Projeção de Término</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{r.projecao_termino}</div>
          </div>
        </div>
      )}
    </>
  );
};

// Mapeia tab → componente de resultado
const RESULT_PANEL = {
  'gerar-cronograma': ResultCronograma,
  'gerar-eap':        ResultEap,
  'analisar-atraso':  ResultAtraso,
  'replanejar':       ResultReplanejar,
  'otimizar':         ResultOtimizar,
  'gerar-relatorio':  ResultRelatorio,
};

// Monta o payload correto para cada operação
function buildPayload(tab, form, obras) {
  const obraAtual = obras?.find(o => String(o.id) === String(form.obraId));
  const nomeObra  = obraAtual?.nome;

  switch (tab) {
    case 'gerar-cronograma':
      return {
        tipoObra: form.tipoObra,
        descricao: form.descricao,
        quantidadePavimentos: Number(form.quantidadePavimentos) || 1,
        prazoDias: Number(form.prazoDias) || 360,
        calendario: form.calendario || undefined,
        restricoes: form.restricoes || undefined,
      };
    case 'gerar-eap':
      return {
        tipoObra: form.tipoObra,
        descricao: form.descricao,
        quantidadePavimentos: Number(form.quantidadePavimentos) || 1,
        escopo: form.escopo || undefined,
      };
    case 'analisar-atraso':
      return {
        obraId: form.obraId || undefined,
        nomeObra,
        dataFimObra: form.dataFimObra,
        diasAtraso: Number(form.diasAtraso) || 0,
        descricaoSituacao: form.descricaoSituacao,
        contextoAdicional: form.contextoAdicional || undefined,
      };
    case 'replanejar':
      return {
        obraId: form.obraId || undefined,
        nomeObra,
        motivo: form.motivo,
        descricaoImpacto: form.descricaoImpacto,
        diasPerdidos: Number(form.diasPerdidos) || 0,
        descricaoTarefas: form.descricaoTarefas || undefined,
        restricoes: form.restricoes || undefined,
      };
    case 'otimizar':
      return {
        obraId: form.obraId || undefined,
        nomeObra,
        prazoAtual: Number(form.prazoAtual) || 0,
        prazoAlvo: Number(form.prazoAlvo) || 0,
        descricaoCronograma: form.descricaoCronograma,
        restricoes: form.restricoes || undefined,
      };
    case 'gerar-relatorio':
      return {
        obraId: form.obraId || undefined,
        nomeObra,
        periodo: form.periodo,
        avancoFisico: Number(form.avancoFisico) || 0,
        avancoFinanceiro: Number(form.avancoFinanceiro) || 0,
        descricaoSituacao: form.descricaoSituacao,
      };
    default:
      return {};
  }
}

// ── Tela principal ────────────────────────────────────────────────────────────

const IaScreen = ({ obras = [], user }) => {
  const [tab, setTab] = React.useState('gerar-cronograma');
  const [loading, setLoading] = React.useState(false);
  const [resultado, setResultado] = React.useState(null);
  const [erro, setErro] = React.useState(null);
  const [meta, setMeta] = React.useState(null);

  const [form, setForm] = React.useState({
    // campos compartilhados cronograma/eap
    tipoObra: 'residencial_unifamiliar',
    descricao: '',
    quantidadePavimentos: 10,
    prazoDias: 360,
    calendario: '',
    restricoes: '',
    escopo: '',
    // análise de atraso
    obraId: '',
    dataFimObra: '',
    diasAtraso: 0,
    descricaoSituacao: '',
    contextoAdicional: '',
    // replanejamento
    motivo: 'chuva',
    descricaoImpacto: '',
    diasPerdidos: 0,
    descricaoTarefas: '',
    // otimização
    prazoAtual: 0,
    prazoAlvo: 0,
    descricaoCronograma: '',
    // relatório
    avancoFisico: 0,
    avancoFinanceiro: 0,
    periodo: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleTab = (t) => {
    setTab(t);
    setResultado(null);
    setErro(null);
    setMeta(null);
  };

  const executar = async () => {
    setLoading(true);
    setResultado(null);
    setErro(null);
    setMeta(null);

    try {
      const payload = buildPayload(tab, form, obras);
      const { data, error } = await iaService.executar(tab, payload);
      if (error) throw new Error(error.message ?? JSON.stringify(error));
      setResultado(data.resultado);
      setMeta(data.meta);
    } catch (e) {
      setErro(e.message ?? 'Erro ao consultar a IA. Verifique se a Edge Function está publicada e a chave Gemini configurada.');
    } finally {
      setLoading(false);
    }
  };

  const FormPanel = {
    'gerar-cronograma': FormCronograma,
    'gerar-eap':        FormEap,
    'analisar-atraso':  FormAtraso,
    'replanejar':       FormReplanejar,
    'otimizar':         FormOtimizar,
    'gerar-relatorio':  FormRelatorio,
  }[tab];

  const ResultPanel = RESULT_PANEL[tab];

  return (
    <>
      <style>{`@keyframes ia-spin{to{transform:rotate(360deg)}}`}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Assistente IA</h1>
          <div className="page-subtitle">Planejamento e análise inteligente com Google Gemini</div>
        </div>
        <div className="page-actions">
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6 }}>
            <Icon name="sparkle" size={13} />
            Powered by Groq / Llama 3.3
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => handleTab(t.id)} style={{
              padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
              color: tab === t.id ? 'var(--brand)' : 'var(--text-muted)',
              borderBottom: tab === t.id ? '2px solid var(--brand)' : '2px solid transparent',
              fontWeight: tab === t.id ? 600 : 400,
              transition: 'color 0.15s',
            }}>
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid formulário + resultado */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16, alignItems: 'start' }}>

        {/* Formulário */}
        <div className="card" style={{ position: 'sticky', top: 16 }}>
          <div className="card-header">
            <h3 className="card-title">Parâmetros</h3>
          </div>
          <div className="card-body">
            <FormPanel form={form} set={set} obras={obras} />
          </div>
          <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={executar} disabled={loading} style={{ minWidth: 150 }}>
              {loading ? (
                <>
                  <span style={{
                    width: 13, height: 13, border: '2px solid rgba(255,255,255,0.35)',
                    borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block',
                    animation: 'ia-spin 0.7s linear infinite', marginRight: 7,
                  }} />
                  Consultando IA...
                </>
              ) : (
                <>
                  <Icon name="sparkle" size={14} />
                  Executar
                </>
              )}
            </button>
          </div>
        </div>

        {/* Resultado */}
        <div>
          {/* Meta (tokens, custo, tempo) */}
          {meta && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {[
                `${(meta.tokensInput + meta.tokensOutput).toLocaleString()} tokens`,
                `$${meta.custoUsd?.toFixed(5)} USD`,
                `${meta.duracaoMs?.toLocaleString()}ms`,
              ].map((label, i) => (
                <span key={i} style={{
                  fontSize: 11, color: 'var(--text-muted)',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 4, padding: '2px 8px',
                }}>{label}</span>
              ))}
            </div>
          )}

          {/* Erro */}
          {erro && (
            <div className="card" style={{ padding: 16, borderLeft: '3px solid var(--danger, #dc2626)', marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--danger, #dc2626)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Icon name="alert" size={14} /> Erro ao consultar IA
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{erro}</div>
            </div>
          )}

          {/* Resultado */}
          {resultado && <ResultPanel resultado={resultado} />}

          {/* Estado inicial */}
          {!resultado && !erro && !loading && (
            <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--brand-tint, #e8f0fb)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: 'var(--brand)' }}>
                <Icon name="sparkle" size={24} />
              </div>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Pronto para consultar a IA</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 340, margin: '0 auto' }}>
                Preencha os parâmetros ao lado e clique em <strong>Executar</strong> para gerar a análise.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Aviso obrigatório */}
      <div style={{
        marginTop: 20, padding: '10px 16px',
        background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
        fontSize: 12.5, color: '#92400e', display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <Icon name="alert-triangle" size={14} style={{ marginTop: 1, flexShrink: 0 }} />
        <span>As sugestões da IA são orientações técnicas que devem ser revisadas por um engenheiro responsável antes de serem aplicadas. A IA não altera dados do sistema diretamente.</span>
      </div>
    </>
  );
};

export { IaScreen };
