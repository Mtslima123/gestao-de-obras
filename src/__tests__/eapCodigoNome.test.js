// Separação de "código EAP colado no nome" usada na importação de EAP.
// O código da planilha serve só para descobrir a hierarquia — o WBS exibido é sempre
// gerado pelo sistema (computeAllWBS, a partir do parentId).
// Roda em node (sem browser). Executar: npm test
import { describe, it, expect } from 'vitest';

// Mesma expressão de cronogramaModais.jsx (separarCodigoNome). Duplicada aqui de
// propósito: o parser vive dentro do componente do modal e não é exportado.
const separar = (texto) => {
  const t = String(texto ?? '').trim();
  const m = t.match(/^(\d+(?:\.\d+)*)(?:\s*[-–—:]\s*|[).]?\s+)(.+)$/);
  if (!m) return { code: '', name: t };
  return { code: m[1], name: m[2].trim() };
};

describe('separarCodigoNome', () => {
  it('separa código e nome com espaço', () => {
    expect(separar('1.2.1 Fundação')).toEqual({ code: '1.2.1', name: 'Fundação' });
  });

  it('aceita hífen, travessão e dois-pontos como separador', () => {
    expect(separar('1.1 - Tapume')).toEqual({ code: '1.1', name: 'Tapume' });
    expect(separar('1.1 – Tapume')).toEqual({ code: '1.1', name: 'Tapume' });
    expect(separar('2: Alvenaria')).toEqual({ code: '2', name: 'Alvenaria' });
  });

  it('aceita ponto e parêntese depois do código', () => {
    expect(separar('3. Instalações')).toEqual({ code: '3', name: 'Instalações' });
    expect(separar('3.1) Elétrica')).toEqual({ code: '3.1', name: 'Elétrica' });
  });

  it('código de um nível só', () => {
    expect(separar('1 Resumo')).toEqual({ code: '1', name: 'Resumo' });
  });

  it('código profundo', () => {
    expect(separar('1.2.3.4.5 Piso do subsolo')).toEqual({ code: '1.2.3.4.5', name: 'Piso do subsolo' });
  });

  it('nome sem código fica intacto', () => {
    expect(separar('Limpeza de terreno')).toEqual({ code: '', name: 'Limpeza de terreno' });
  });

  // A armadilha: o nome não pode ser confundido com código nem perder o começo.
  it('não trata número no meio do nome como código', () => {
    expect(separar('Piso e paredes do subsolo 2')).toEqual({ code: '', name: 'Piso e paredes do subsolo 2' });
  });

  it('preserva número que faz parte do nome depois do código', () => {
    expect(separar('1.3.2 Tipo 2')).toEqual({ code: '1.3.2', name: 'Tipo 2' });
  });

  it('linha que é só um código não vira tarefa sem nome', () => {
    // Sem nome depois do código, não há o que separar: devolve o texto cru e quem
    // chama descarta (o parser ignora item sem nome).
    expect(separar('1.2.1')).toEqual({ code: '', name: '1.2.1' });
  });

  it('trata vazio e nulo', () => {
    expect(separar('')).toEqual({ code: '', name: '' });
    expect(separar(null)).toEqual({ code: '', name: '' });
  });

  it('ignora espaços em volta', () => {
    expect(separar('   1.4   Cisterna  ')).toEqual({ code: '1.4', name: 'Cisterna' });
  });
});
