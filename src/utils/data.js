// Mock data — Gestão de Obras (PT-BR · dados genéricos)
export const AppData = (function () {
  const obras = [
    {
      id: 'OB-001',
      nome: 'Obra A',
      tipo: 'Incorporação Vertical',
      cliente: 'Cliente Alfa S.A.',
      endereco: 'Endereço 01 — Cidade A / UF',
      area: 18420,
      orcamento: 84500000,
      gasto: 51230000,
      avancoFisico: 62,
      avancoFinanceiro: 60,
      inicio: '2024-03-04',
      previsto: '2026-09-30',
      status: 'em_andamento',
      risco: 'medio',
      etapaAtual: 'Estrutura — pavimento 8',
      responsavel: 'Responsável 01',
      equipe: 142,
      alertas: 3,
      contrato: 'CT-2024-001',
    },
    {
      id: 'OB-002',
      nome: 'Obra B',
      tipo: 'Comercial',
      cliente: 'Cliente Beta Ltda.',
      endereco: 'Endereço 02 — Cidade B / UF',
      area: 22100,
      orcamento: 126800000,
      gasto: 38040000,
      avancoFisico: 28,
      avancoFinanceiro: 30,
      inicio: '2025-01-15',
      previsto: '2027-06-15',
      status: 'em_andamento',
      risco: 'baixo',
      etapaAtual: 'Fundação — estaca raiz',
      responsavel: 'Responsável 02',
      equipe: 89,
      alertas: 1,
      contrato: 'CT-2025-007',
    },
    {
      id: 'OB-003',
      nome: 'Obra C',
      tipo: 'Galpão Industrial',
      cliente: 'Cliente Gama Logística',
      endereco: 'Endereço 03 — Cidade C / UF',
      area: 64500,
      orcamento: 47200000,
      gasto: 44150000,
      avancoFisico: 94,
      avancoFinanceiro: 93,
      inicio: '2024-06-10',
      previsto: '2026-05-25',
      status: 'em_andamento',
      risco: 'baixo',
      etapaAtual: 'Acabamento — pintura e piso',
      responsavel: 'Responsável 03',
      equipe: 48,
      alertas: 0,
      contrato: 'CT-2024-014',
    },
    {
      id: 'OB-004',
      nome: 'Obra D',
      tipo: 'Residencial Horizontal',
      cliente: 'Cliente Delta Realty',
      endereco: 'Endereço 04 — Cidade D / UF',
      area: 9800,
      orcamento: 32600000,
      gasto: 23320000,
      avancoFisico: 74,
      avancoFinanceiro: 72,
      inicio: '2024-02-20',
      previsto: '2026-04-10',
      status: 'em_andamento',
      risco: 'alto',
      etapaAtual: 'Acabamento interno',
      responsavel: 'Responsável 04',
      equipe: 67,
      alertas: 5,
      contrato: 'CT-2024-009',
    },
    {
      id: 'OB-005',
      nome: 'Obra E',
      tipo: 'Saúde',
      cliente: 'Cliente Épsilon Saúde',
      endereco: 'Endereço 05 — Cidade E / UF',
      area: 14200,
      orcamento: 98300000,
      gasto: 76074000,
      avancoFisico: 78,
      avancoFinanceiro: 77,
      inicio: '2024-04-08',
      previsto: '2026-07-30',
      status: 'em_andamento',
      risco: 'medio',
      etapaAtual: 'Instalações hospitalares',
      responsavel: 'Responsável 05',
      equipe: 118,
      alertas: 2,
      contrato: 'CT-2024-012',
    },
    {
      id: 'OB-006',
      nome: 'Obra F',
      tipo: 'Institucional',
      cliente: 'Cliente Zeta — Prefeitura',
      endereco: 'Endereço 06 — Cidade F / UF',
      area: 4200,
      orcamento: 14800000,
      gasto: 14210000,
      avancoFisico: 100,
      avancoFinanceiro: 96,
      inicio: '2023-08-15',
      previsto: '2025-12-20',
      status: 'concluida',
      risco: 'baixo',
      etapaAtual: 'Entregue',
      responsavel: 'Responsável 06',
      equipe: 0,
      alertas: 0,
      contrato: 'CT-2023-022',
    },
    {
      id: 'OB-007',
      nome: 'Obra G',
      tipo: 'Loteamento',
      cliente: 'Cliente Eta Engenharia',
      endereco: 'Endereço 07 — Cidade G / UF',
      area: 142000,
      orcamento: 28400000,
      gasto: 4260000,
      avancoFisico: 15,
      avancoFinanceiro: 15,
      inicio: '2025-09-01',
      previsto: '2027-08-30',
      status: 'em_andamento',
      risco: 'baixo',
      etapaAtual: 'Terraplenagem',
      responsavel: 'Responsável 07',
      equipe: 34,
      alertas: 1,
      contrato: 'CT-2025-031',
    },
  ];

  const obraAtual = obras[0];

  // Cronograma por obra — cada chave é um obraId
  const cronograma = {
    'OB-001': [
      { id: 'E1',  etapa: 'Serviços preliminares',  inicio: 0,   dur: 60,  status: 'done',     avanco: 100, dep: [],                                                      milestone: false, nivel: 0, parentId: null, isGroup: false, collapsed: false, responsavel: 'Carlos Melo',   customCols: {}, custo: 2340000,  restricaoTipo: 'asap', restricaoData: '' },
      { id: 'E2',  etapa: 'Fundação',                inicio: 60,  dur: 120, status: 'done',     avanco: 100, dep: [{id:'E1',tipo:'TI',lag:0}],                                    milestone: false, nivel: 0, parentId: null, isGroup: false, collapsed: false, responsavel: 'Ana Souza',    customCols: {}, custo: 7980000,  restricaoTipo: 'asap', restricaoData: '' },
      { id: 'E3',  etapa: 'Supra-estrutura',         inicio: 150, dur: 270, status: 'done',     avanco: 100, dep: [{id:'E2',tipo:'TI',lag:0}],                                    milestone: false, nivel: 0, parentId: null, isGroup: false, collapsed: false, responsavel: 'Ricardo Lima',  customCols: {}, custo: 18420000, restricaoTipo: 'asap', restricaoData: '' },
      { id: 'E4',  etapa: 'Alvenaria',               inicio: 240, dur: 210, status: 'late',     avanco: 78,  dep: [{id:'E3',tipo:'TI',lag:0}],                                    milestone: false, nivel: 0, parentId: null, isGroup: false, collapsed: false, responsavel: 'Fernanda Cruz', customCols: {}, custo: 6180000,  restricaoTipo: 'asap', restricaoData: '' },
      { id: 'E5',  etapa: 'Instalações elétricas',   inicio: 330, dur: 240, status: 'late',     avanco: 54,  dep: [{id:'E4',tipo:'TI',lag:0}],                                    milestone: false, nivel: 0, parentId: null, isGroup: false, collapsed: false, responsavel: 'Paulo Rocha',   customCols: {}, custo: 4860000,  restricaoTipo: 'asap', restricaoData: '' },
      { id: 'E6',  etapa: 'Instalações hidráulicas', inicio: 360, dur: 210, status: 'late',     avanco: 48,  dep: [{id:'E4',tipo:'TI',lag:0}],                                    milestone: false, nivel: 0, parentId: null, isGroup: false, collapsed: false, responsavel: 'Mariana Dias',  customCols: {}, custo: 3920000,  restricaoTipo: 'asap', restricaoData: '' },
      { id: 'E7',  etapa: 'Esquadrias',              inicio: 420, dur: 120, status: 'upcoming', avanco: 18,  dep: [{id:'E4',tipo:'TI',lag:0}],                                    milestone: false, nivel: 0, parentId: null, isGroup: false, collapsed: false, responsavel: '',              customCols: {}, custo: 4280000,  restricaoTipo: 'asap', restricaoData: '' },
      { id: 'E8',  etapa: 'Revestimentos',           inicio: 450, dur: 180, status: 'upcoming', avanco: 5,   dep: [{id:'E5',tipo:'TI',lag:0},{id:'E6',tipo:'TI',lag:0}],          milestone: false, nivel: 0, parentId: null, isGroup: false, collapsed: false, responsavel: '',              customCols: {}, custo: 8420000,  restricaoTipo: 'asap', restricaoData: '' },
      { id: 'E9',  etapa: 'Pintura',                 inicio: 570, dur: 120, status: 'upcoming', avanco: 0,   dep: [{id:'E8',tipo:'TI',lag:0}],                                    milestone: false, nivel: 0, parentId: null, isGroup: false, collapsed: false, responsavel: '',              customCols: {}, custo: 2680000,  restricaoTipo: 'asap', restricaoData: '' },
      { id: 'E10', etapa: 'Paisagismo',              inicio: 660, dur: 90,  status: 'upcoming', avanco: 0,   dep: [],                                                              milestone: false, nivel: 0, parentId: null, isGroup: false, collapsed: false, responsavel: '',              customCols: {}, custo: 800000,   restricaoTipo: 'asap', restricaoData: '' },
      { id: 'E11', etapa: 'Entrega final',           inicio: 720, dur: 60,  status: 'upcoming', avanco: 0,   dep: [{id:'E9',tipo:'TI',lag:0},{id:'E10',tipo:'TI',lag:0}],          milestone: true,  nivel: 0, parentId: null, isGroup: false, collapsed: false, responsavel: 'Carlos Melo',   customCols: {}, custo: 620000,   restricaoTipo: 'asap', restricaoData: '' },
    ],
  };

  const avancoSerie = [
    { m: 'Mai/25', fis:  8, fin:  7 },
    { m: 'Jun/25', fis: 14, fin: 12 },
    { m: 'Jul/25', fis: 20, fin: 18 },
    { m: 'Ago/25', fis: 27, fin: 25 },
    { m: 'Set/25', fis: 33, fin: 31 },
    { m: 'Out/25', fis: 39, fin: 37 },
    { m: 'Nov/25', fis: 44, fin: 43 },
    { m: 'Dez/25', fis: 49, fin: 48 },
    { m: 'Jan/26', fis: 53, fin: 52 },
    { m: 'Fev/26', fis: 56, fin: 55 },
    { m: 'Mar/26', fis: 60, fin: 58 },
    { m: 'Abr/26', fis: 62, fin: 60 },
  ];

  const faturamentoSerie = [
    { m: 'Mai', v: 12.8 }, { m: 'Jun', v: 14.2 }, { m: 'Jul', v: 11.6 },
    { m: 'Ago', v: 15.4 }, { m: 'Set', v: 18.2 }, { m: 'Out', v: 16.8 },
    { m: 'Nov', v: 19.4 }, { m: 'Dez', v: 22.1 }, { m: 'Jan', v: 17.6 },
    { m: 'Fev', v: 20.4 }, { m: 'Mar', v: 23.8 }, { m: 'Abr', v: 21.6 },
  ];

  const distribuicaoStatus = [
    { label: 'Em andamento', value: 14, color: '#014386' },
    { label: 'Planejamento', value: 4,  color: '#3d7fc9' },
    { label: 'Pausadas',     value: 2,  color: '#b3711a' },
    { label: 'Concluídas',   value: 7,  color: '#1f8b5c' },
  ];

  const alertas = [
    { tipo: 'danger',  titulo: 'Atraso crítico — Obra D',          sub: 'Etapa de acabamento 12 dias atrás do cronograma', tempo: 'há 2h' },
    { tipo: 'warning', titulo: 'Insumo abaixo do mínimo — Insumo 05', sub: 'Obra: Obra A',                                  tempo: 'há 5h' },
    { tipo: 'warning', titulo: 'Medição 12 pendente de aprovação',  sub: 'Obra B',                                          tempo: 'hoje' },
    { tipo: 'info',    titulo: 'Novo contrato anexado — Fornecedor 04', sub: 'Aditivo 02 disponível para revisão',         tempo: 'ontem' },
    { tipo: 'info',    titulo: 'Vistoria agendada',                 sub: 'Obra E — 28/05 às 09h',                           tempo: 'ontem' },
  ];

  const eventos = [
    { dia: '21', mes: 'MAI', titulo: 'Reunião de planejamento — Obra A',   hora: '09:00 — 10:30', tipo: 'reuniao' },
    { dia: '22', mes: 'MAI', titulo: 'Entrega de aço — Obra B',            hora: '07:30',         tipo: 'entrega' },
    { dia: '23', mes: 'MAI', titulo: 'Vistoria — Obra E',                  hora: '09:00',         tipo: 'vistoria' },
    { dia: '26', mes: 'MAI', titulo: 'Medição 13 — Obra A',                hora: '14:00',         tipo: 'medicao' },
    { dia: '28', mes: 'MAI', titulo: 'Aprovação aditivo — Cliente Beta',   hora: '11:00',         tipo: 'aprovacao' },
  ];

  // Orçamento (SINAPI-like composition)
  const orcamentoItens = [
    { codigo: '01', nivel: 0, item: 'Serviços preliminares', un: '—', quant: 1, unit: 0, total: 2340000, peso: 2.8 },
      { codigo: '01.01', nivel: 1, item: 'Mobilização e desmobilização', un: 'VB', quant: 1, unit: 1240000, total: 1240000, peso: 1.5 },
      { codigo: '01.02', nivel: 1, item: 'Canteiro de obras',            un: 'M²', quant: 480, unit: 2292, total: 1100000, peso: 1.3 },
    { codigo: '02', nivel: 0, item: 'Fundação',              un: '—', quant: 1, unit: 0, total: 7980000, peso: 9.4 },
      { codigo: '02.01', nivel: 1, item: 'Escavação mecanizada',         un: 'M³', quant: 4820, unit: 280, total: 1349600, peso: 1.6 },
      { codigo: '02.02', nivel: 1, item: 'Estaca raiz Ø 410mm',          un: 'M',  quant: 3240, unit: 1620, total: 5248800, peso: 6.2 },
      { codigo: '02.03', nivel: 1, item: 'Bloco de coroamento',          un: 'M³', quant: 386, unit: 3580, total: 1381600, peso: 1.6 },
    { codigo: '03', nivel: 0, item: 'Estrutura de concreto',  un: '—', quant: 1, unit: 0, total: 18420000, peso: 21.8 },
      { codigo: '03.01', nivel: 1, item: 'Pilares e vigas',              un: 'M³', quant: 1840, unit: 4820, total: 8869000, peso: 10.5 },
      { codigo: '03.02', nivel: 1, item: 'Lajes',                        un: 'M²', quant: 14820, unit: 645, total: 9560000, peso: 11.3 },
    { codigo: '04', nivel: 0, item: 'Alvenaria',              un: '—', quant: 1, unit: 0, total: 6180000, peso: 7.3 },
      { codigo: '04.01', nivel: 1, item: 'Alvenaria de vedação',         un: 'M²', quant: 28400, unit: 168, total: 4771200, peso: 5.6 },
      { codigo: '04.02', nivel: 1, item: 'Verga e contraverga',          un: 'M',  quant: 3820, unit: 369, total: 1409400, peso: 1.7 },
    { codigo: '05', nivel: 0, item: 'Instalações elétricas',  un: '—', quant: 1, unit: 0, total: 4860000, peso: 5.7 },
    { codigo: '06', nivel: 0, item: 'Instalações hidráulicas',un: '—', quant: 1, unit: 0, total: 3920000, peso: 4.6 },
    { codigo: '07', nivel: 0, item: 'Esquadrias',             un: '—', quant: 1, unit: 0, total: 4280000, peso: 5.1 },
    { codigo: '08', nivel: 0, item: 'Revestimentos',          un: '—', quant: 1, unit: 0, total: 8420000, peso: 10.0 },
    { codigo: '09', nivel: 0, item: 'Pintura',                un: '—', quant: 1, unit: 0, total: 2680000, peso: 3.2 },
    { codigo: '10', nivel: 0, item: 'Instalações especiais',  un: '—', quant: 1, unit: 0, total: 6420000, peso: 7.6 },
    { codigo: '11', nivel: 0, item: 'BDI (Bonificação)',      un: '—', quant: 1, unit: 0, total: 19000000, peso: 22.5, bdi: true },
  ];

  // Lista de orçamentos
  const orcamentosLista = [
    { id: 'OR-001', obra: 'Obra A', cliente: 'Cliente Alfa S.A.',     versao: 'v3',  valor: 84500000, bdi: 28.4, status: 'aprovado', data: '12/03/2024' },
    { id: 'OR-002', obra: 'Obra B', cliente: 'Cliente Beta Ltda.',    versao: 'v2',  valor: 126800000, bdi: 26.0, status: 'aprovado', data: '08/12/2024' },
    { id: 'OR-005', obra: 'Obra H', cliente: 'Cliente Theta',         versao: 'v1',  valor: 42180000, bdi: 25.5, status: 'pendente', data: '04/05/2026' },
    { id: 'OR-006', obra: 'Obra I', cliente: 'Cliente Iota',          versao: 'v2',  valor: 9420000,  bdi: 24.0, status: 'pendente', data: '11/05/2026' },
    { id: 'OR-008', obra: 'Obra J', cliente: 'Cliente Kappa',         versao: 'v1',  valor: 156400000, bdi: 27.8, status: 'rascunho', data: '15/05/2026' },
    { id: 'OR-009', obra: 'Obra K', cliente: 'Cliente Lambda',        versao: 'v4',  valor: 28200000,  bdi: 26.5, status: 'rejeitado', data: '02/04/2026' },
  ];

  // Contratos
  const contratos = [
    { id: 'CT-2024-001', obra: 'Obra A', parte: 'Cliente Alfa S.A.',      tipo: 'Obra principal',  valor: 84500000, vigencia: '04/03/2024 — 30/09/2026', aditivos: 2, status: 'vigente' },
    { id: 'CT-2024-014', obra: 'Obra C', parte: 'Cliente Gama Logística', tipo: 'Obra principal',  valor: 47200000, vigencia: '10/06/2024 — 25/05/2026', aditivos: 1, status: 'vigente' },
    { id: 'CT-2025-007', obra: 'Obra B', parte: 'Cliente Beta Ltda.',     tipo: 'Obra principal',  valor: 126800000, vigencia: '15/01/2025 — 15/06/2027', aditivos: 0, status: 'vigente' },
    { id: 'CT-2024-009', obra: 'Obra D', parte: 'Cliente Delta Realty',   tipo: 'Obra principal',  valor: 32600000, vigencia: '20/02/2024 — 10/04/2026', aditivos: 3, status: 'vigente' },
    { id: 'CT-SUB-038',  obra: 'Obra A', parte: 'Fornecedor 02',          tipo: 'Subcontratação',  valor: 6180000,  vigencia: '05/04/2024 — 30/09/2025', aditivos: 1, status: 'vigente' },
    { id: 'CT-SUB-041',  obra: 'Obra A', parte: 'Fornecedor 04',          tipo: 'Subcontratação',  valor: 2410000,  vigencia: '12/05/2024 — 28/02/2026', aditivos: 0, status: 'pendente' },
    { id: 'CT-2023-022', obra: 'Obra F', parte: 'Cliente Zeta',           tipo: 'Obra principal',  valor: 14800000, vigencia: '15/08/2023 — 20/12/2025', aditivos: 2, status: 'encerrado' },
  ];

  function brl(n, { compact = false } = {}) {
    if (compact) {
      if (Math.abs(n) >= 1_000_000) return 'R$ ' + (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
      if (Math.abs(n) >= 1_000) return 'R$ ' + (n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil';
    }
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  return {
    obras, obraAtual, cronograma, cronogramaCustomCols: [], baselines: {},
    avancoSerie, faturamentoSerie, distribuicaoStatus, alertas, eventos,
    orcamentoItens, orcamentosLista, contratos,
    brl,
  };
})();
