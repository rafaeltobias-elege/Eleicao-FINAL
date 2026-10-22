/**
 * Configuração Central de Identidade Visual e Unidade Militar
 * 
 * Para alterar o Batalhão (ex: 22º BPM/I), o Brasão, o CPI ou os textos
 * de cabeçalho e relatórios, basta editar este arquivo.
 */
export const UNIT_CONFIG = {
  // Sigla do Batalhão exibida nos cabeçalhos, títulos e telas
  unitShort: '22º BPM/I',

  // Nome por extenso do Batalhão (usado nos relatórios oficiais e impressões)
  unitFull: 'Vigésimo Segundo Batalhão de Polícia Militar do Interior',

  // Grande Comando Regional
  command: 'CPI-7',

  // Título da Operação Eleitoral
  operationName: 'Eleições 2026',
  turnoBadge: '2º TURNO',

  // Imagem do Brasão de Armas da Unidade (Link web direto ou arquivo em /public)
  crestUrl: '/brasao_22bpmi.png',
  crestFallbackLocal: '/brasao_22bpmi.png',

  // Senha padrão de acesso da P/3 / Supervisão
  defaultPassword: '22bpmip3',
};
