// Dados de referência para a calculadora paramétrica de estimativas
// Separados do componente para facilitar atualização sem tocar na lógica de negócio

export const ESTIM_PROJETOS_REF = [
  { id: 1, nome: 'Projeto Ref. A — Alto Padrão', tipo: 'Alto Padrão', cidade: 'Cidade A',
    inccBase: 1578.45, areaConstruida: 12500, areaProjTorre: 420, numPavtos: 22, numSubsolos: 2,
    perimetroTorre: 88, fundacao: 'Estaca Hélice Contínua', numElevadores: 3, numParadas: 24,
    custoConstrucaoM2: 4850, custoInfra: 1250000, custoImplantacao: 185000,
    custoProjetosM2: 125, custoElevador: 245000, custoFachadaM2: 580,
    custoEnsaios: 87000, custoAdminM2: 148, pctIncorporacao: 0.062,
    coefSubsolo: 1.25, coefSemiEnt: 1.10, coefTerreo: 1.00, coefTipo: 1.00, coefCobertura: 0.85, coefCxAgua: 0.50 },
  { id: 2, nome: 'Projeto Ref. B — Médio Padrão', tipo: 'Médio Padrão', cidade: 'Cidade B',
    inccBase: 1456.78, areaConstruida: 8200, areaProjTorre: 310, numPavtos: 16, numSubsolos: 1,
    perimetroTorre: 72, fundacao: 'Estaca Hélice Contínua', numElevadores: 2, numParadas: 17,
    custoConstrucaoM2: 3980, custoInfra: 890000, custoImplantacao: 132000,
    custoProjetosM2: 98, custoElevador: 198000, custoFachadaM2: 420,
    custoEnsaios: 64000, custoAdminM2: 112, pctIncorporacao: 0.055,
    coefSubsolo: 1.20, coefSemiEnt: 1.08, coefTerreo: 1.00, coefTipo: 1.00, coefCobertura: 0.80, coefCxAgua: 0.50 },
  { id: 3, nome: 'Projeto Ref. C — Popular', tipo: 'Popular/Econômico', cidade: 'Cidade C',
    inccBase: 1352.14, areaConstruida: 5400, areaProjTorre: 245, numPavtos: 12, numSubsolos: 0,
    perimetroTorre: 62, fundacao: 'Sapata Armada', numElevadores: 1, numParadas: 12,
    custoConstrucaoM2: 3150, custoInfra: 620000, custoImplantacao: 95000,
    custoProjetosM2: 72, custoElevador: 165000, custoFachadaM2: 310,
    custoEnsaios: 42000, custoAdminM2: 88, pctIncorporacao: 0.048,
    coefSubsolo: 1.15, coefSemiEnt: 1.05, coefTerreo: 1.00, coefTipo: 1.00, coefCobertura: 0.75, coefCxAgua: 0.45 },
  { id: 4, nome: 'Projeto Ref. D — Comercial', tipo: 'Comercial', cidade: 'Cidade A',
    inccBase: 1645.32, areaConstruida: 9800, areaProjTorre: 380, numPavtos: 18, numSubsolos: 3,
    perimetroTorre: 95, fundacao: 'Estaca Raiz', numElevadores: 4, numParadas: 21,
    custoConstrucaoM2: 5250, custoInfra: 1580000, custoImplantacao: 210000,
    custoProjetosM2: 145, custoElevador: 285000, custoFachadaM2: 650,
    custoEnsaios: 102000, custoAdminM2: 162, pctIncorporacao: 0.070,
    coefSubsolo: 1.30, coefSemiEnt: 1.15, coefTerreo: 1.00, coefTipo: 1.00, coefCobertura: 0.90, coefCxAgua: 0.55 },
];

export const ESTIM_FLOORS_BASE = [
  { id: 'subsolo',       label: '1º Subsolo',         coef: 1.20, area: 410 },
  { id: 'semienterrado', label: 'Semienterrado',      coef: 1.08, area: 380 },
  { id: 'terreo',        label: 'Térreo',             coef: 1.00, area: 360 },
  { id: 'intermediario', label: 'Pav. Intermediário', coef: 0.95, area: 320 },
  { id: 'tipo',          label: 'Pavimento Tipo',     coef: 1.00, area: 320 },
  { id: 'cobertura',     label: 'Cobertura',          coef: 0.85, area: 280 },
  { id: 'caixaAgua',     label: "Caixa d'Água",       coef: 0.50, area: 90  },
];

export const ESTIM_PROJETOS_ESPEC = [
  { id: 1,  esp: 'Projeto de Arquitetura',           rs_m2: 14.13 },
  { id: 2,  esp: 'Projeto de Execução',              rs_m2: 17.50 },
  { id: 3,  esp: 'Projeto de Fundação',              rs_m2: 11.58 },
  { id: 4,  esp: 'Projeto de Estrutura',             rs_m2: 22.40 },
  { id: 5,  esp: 'Projeto de Instalações',           rs_m2: 18.20 },
  { id: 6,  esp: 'Projeto de Ar Condicionado',       rs_m2: 6.85  },
  { id: 7,  esp: 'Projeto de Incêndio',              rs_m2: 4.40  },
  { id: 8,  esp: 'Projeto de Impermeabilização',     rs_m2: 3.20  },
  { id: 9,  esp: 'Projeto de Piscina',               rs_m2: 1.80  },
  { id: 10, esp: 'Gestão de Projetos',               rs_m2: 9.50  },
  { id: 11, esp: 'Consultoria Acústica',             rs_m2: 1.40  },
  { id: 12, esp: 'Consultoria Estrutural',           rs_m2: 2.10  },
];

export const ESTIM_ELEVADORES_REF = [
  { obra:'PIEMONTE',     marca:'OTIS',          paradas:9,  qt:2, valor:321247,   mes:'2021-09', incc:939.699  },
  { obra:'MEDITERRÂNEO', marca:'OTIS',          paradas:10, qt:4, valor:680000,   mes:'2021-09', incc:939.699  },
  { obra:'MUD 333',      marca:'OTIS',          paradas:18, qt:2, valor:507496,   mes:'2021-09', incc:939.699  },
  { obra:'TARSILA',      marca:'TK ELEVADORES', paradas:13, qt:4, valor:799000,   mes:'2022-11', incc:1046.896 },
  { obra:'THE EDGE',     marca:'OTIS',          paradas:19, qt:8, valor:2392000,  mes:'2023-10', incc:1082.104 },
  { obra:'ATTRIUM',      marca:'ATLAS',         paradas:18, qt:2, valor:578000,   mes:'2024-05', incc:1101.389 },
  { obra:'VISI',         marca:'ATLAS',         paradas:13, qt:2, valor:467000,   mes:'2024-05', incc:1101.389 },
  { obra:'BCO',          marca:'ATLAS',         paradas:20, qt:3, valor:1107000,  mes:'2024-08', incc:1134.780 },
  { obra:'H23',          marca:'OTIS',          paradas:18, qt:2, valor:760595,   mes:'2025-01', incc:1159.536 },
  { obra:'AAZ',          marca:'ATLAS',         paradas:18, qt:4, valor:1550000,  mes:'2024-08', incc:1134.780 },
  { obra:'CST',          marca:'',             paradas:null,qt:null,valor:null,   mes:'',        incc:null     },
];

export const ESTIM_FUNDACAO_REF = [
  { obra:'TARSILA',     fund:'Estaca Hélice',  area:2001.99, pavtos:14, custo:3464321.12, inccBase:981.244  },
  { obra:'THE EDGE',    fund:'Estaca Raiz',    area:2582.61, pavtos:20, custo:7034366.54, inccBase:981.244  },
  { obra:'THE EDGE',    fund:'Sapata',         area:1404.73, pavtos:20, custo:2576449.13, inccBase:981.244  },
  { obra:'ATTRIUM',     fund:'Perfil Metálico',area:895.72,  pavtos:19, custo:3324579.09, inccBase:1075.540 },
  { obra:'MEDITERRÂNEO',fund:'Sapata',         area:1921.43, pavtos:7,  custo:1314429.68, inccBase:805.356  },
  { obra:'VISI',        fund:'Estaca Hélice',  area:587.70,  pavtos:14, custo:1566202.74, inccBase:1095.738 },
];

export const ESTIM_PROPOSTAS_PROJ = [
  { id:1,  esp:'Projeto de Arquitetura', projetista:'Sérgio Lopes',  obra:'The Edge',     area:null, proposta:300000.00,   rs_m2:0, inccBase:790.33,  incc_m2:0.007576, mes:'Jun/2020' },
  { id:2,  esp:'Projeto de Arquitetura', projetista:'Flávio Bassan', obra:'The Edge',     area:null, proposta:535500.00,   rs_m2:0, inccBase:839.38,  incc_m2:0.012730, mes:'Nov/2020' },
  { id:3,  esp:'Projeto de Arquitetura', projetista:'Virtual',       obra:'The Edge',     area:null, proposta:567828.00,   rs_m2:0, inccBase:799.59,  incc_m2:0.014359, mes:'Jul/2020' },
  { id:4,  esp:'Projeto de Arquitetura', projetista:'Sérgio Lopes',  obra:'Tarsila',      area:null, proposta:209856.00,   rs_m2:0, inccBase:939.70,  incc_m2:0.012419, mes:'Ago/2021' },
  { id:5,  esp:'Projeto de Arquitetura', projetista:'Sérgio Lopes',  obra:'Attrium',      area:null, proposta:149670.00,   rs_m2:0, inccBase:1051.63, incc_m2:0.013439, mes:'Dez/2022' },
  { id:6,  esp:'Projeto de Arquitetura', projetista:'Flávio Bassan', obra:'Visi',         area:null, proposta:144000.00,   rs_m2:0, inccBase:1013.16, incc_m2:0.028590, mes:'Mai/2022' },
  { id:7,  esp:'Projeto de Arquitetura', projetista:'Virtual',       obra:'Mediterrâneo', area:null, proposta:245826.52,   rs_m2:0, inccBase:713.33,  incc_m2:0.024486, mes:'Set/2017' },
  { id:8,  esp:'Projeto de Arquitetura', projetista:'Virtual',       obra:'Piemonte',     area:null, proposta:71979.77,    rs_m2:0, inccBase:691.79,  incc_m2:0.025297, mes:'Jan/2017' },
  { id:9,  esp:'Projeto de Arquitetura', projetista:'Conde Caldas',  obra:'Castilho',     area:null, proposta:1107397.44,  rs_m2:0, inccBase:1219.47, incc_m2:0.025389, mes:'Jul/2025' },
  { id:10, esp:'Projeto de Arquitetura', projetista:'Virtual',       obra:'Maestro',      area:null, proposta:167749.40,   rs_m2:0, inccBase:1178.39, incc_m2:0.011032, mes:'Mar/2025' },
  { id:11, esp:'Projeto de Execução',    projetista:'Virtual',       obra:'The Edge',     area:null, proposta:992098.62,   rs_m2:0, inccBase:880.27,  incc_m2:0.019880, mes:'Mar/2021' },
];

export const ESTIM_IMPLANTACAO_BASE = [
  { id:1,  obs:'ÁREA DO TERRENO',          item:'LIMPEZA DO TERRENO',                                               qtd:1072.70,  unid:'M2', precoRS:18.63,    precoIncc:0.0200  },
  { id:2,  obs:'ÁREA DO TERRENO',          item:'BARRACÃO',                                                          qtd:300.00,   unid:'M2', precoRS:907.69,   precoIncc:0.8400  },
  { id:3,  obs:'FRENTE DA OBRA',           item:'TAPUME',                                                            qtd:22.36,    unid:'M',  precoRS:1007.40,  precoIncc:0.9400  },
  { id:4,  obs:'VERBA',                    item:'PLACAS PROVISÓRIAS',                                                qtd:1.00,     unid:'VB', precoRS:25000.00, precoIncc:23.2400 },
  { id:5,  obs:'PERÍMETRO DA TORRE × 2,5', item:'PESTANA SALVA VIDAS - PRINCIPAL',                                  qtd:137.14,   unid:'M',  precoRS:382.94,   precoIncc:0.3600  },
  { id:6,  obs:'PERÍMETRO DA TORRE',       item:'TELA DE SEGURANÇA (LARANJA)',                                       qtd:117.14,   unid:'M',  precoRS:85.84,    precoIncc:0.0800  },
  { id:7,  obs:'1,15 × P. TORRE × ALTURA', item:'TELA DE PROTEÇÃO (FACHADA)',                                       qtd:6961.86,  unid:'M2', precoRS:3.20,     precoIncc:0.0000  },
  { id:8,  obs:'Nº DE BLOCOS',             item:'INTEGRAÇÃO DOS SUPORTES DO BALANCIM COM FITA - TELA DE FACHADA',   qtd:1.00,     unid:'UN', precoRS:1337.20,  precoIncc:1.2400  },
  { id:9,  obs:'1,15 × P. TORRE × ALTURA', item:'MO INSTALAÇÃO DE TELA DE FACHADA (ÚNICA ETAPA)',                  qtd:6961.86,  unid:'M2', precoRS:0.75,     precoIncc:0.0000  },
];

export const ESTIM_IMPLANTACAO_DEFAULT = [
  { id: 'impl-1', label: 'Limpeza do Terreno',        incc: 0 },
  { id: 'impl-2', label: 'Barracão de Obra',          incc: 0 },
  { id: 'impl-3', label: 'Tapume',                    incc: 0 },
  { id: 'impl-4', label: 'Placas Provisórias',        incc: 0 },
  { id: 'impl-5', label: 'Itens de Segurança',        incc: 0 },
  { id: 'impl-6', label: 'Placa de Obra',             incc: 0 },
  { id: 'impl-7', label: 'Instalações Provisórias',   incc: 0 },
];

export const ESTIM_INCORPORACAO_DEFAULT = [
  { id: 'incorp-1',     label: 'Construção do Stand de Vendas',           incc: 0 },
  { id: 'incorp-2',     label: 'Projeto de Stand de Vendas',              incc: 0 },
  { id: 'incorp-3',     label: 'Solo Criado',                             incc: 0 },
  { id: 'incorp-4',     label: 'Demolição',                               incc: 0 },
  { id: 'incorp-5',     label: 'Licença de Obras/Taxas',                  incc: 0 },
  { id: 'incorp-mob',   label: 'Mobiliário e Decoração das Áreas Comuns', isGroup: true },
  { id: 'incorp-mob-1', label: 'Iluminação',                              incc: 0, parentId: 'incorp-mob' },
  { id: 'incorp-mob-2', label: 'Mobiliário',                              incc: 0, parentId: 'incorp-mob' },
  { id: 'incorp-mob-3', label: 'Marcenaria',                              incc: 0, parentId: 'incorp-mob' },
  { id: 'incorp-mob-4', label: 'Adornos + Mobiliários Externos',          incc: 0, parentId: 'incorp-mob' },
  { id: 'incorp-mob-5', label: 'Espelhos',                                incc: 0, parentId: 'incorp-mob' },
  { id: 'incorp-mob-6', label: 'Aparelhos de Ginástica',                  incc: 0, parentId: 'incorp-mob' },
  { id: 'incorp-mob-7', label: 'Brinquedos Espaço Kids',                  incc: 0, parentId: 'incorp-mob' },
  { id: 'incorp-mob-8', label: 'Eletrodomésticos',                        incc: 0, parentId: 'incorp-mob' },
  { id: 'incorp-mob-9', label: 'Painel Artístico',                        incc: 0, parentId: 'incorp-mob' },
  { id: 'incorp-mob-10',label: 'Sistema de Som',                          incc: 0, parentId: 'incorp-mob' },
  { id: 'incorp-mob-11',label: 'Aromatizador',                            incc: 0, parentId: 'incorp-mob' },
  { id: 'incorp-6',     label: 'Projeto de Decoração',                    incc: 0 },
  { id: 'incorp-7',     label: 'Projeto de Fachada',                      incc: 0 },
  { id: 'incorp-8',     label: 'Levantamento Topográfico',                incc: 0 },
  { id: 'incorp-9',     label: 'Laudo de Vistoria Prévia',                incc: 0 },
  { id: 'incorp-10',    label: 'Elaboração NB-140',                       incc: 0 },
  { id: 'incorp-11',    label: 'Consultoria Quadro NB',                   incc: 0 },
];
