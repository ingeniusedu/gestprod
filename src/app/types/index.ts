// Tipos básicos do sistema de gestão de produção

export interface PosicaoEstoque {
  recipienteId: string;
  divisao?: { h: number; v: number };
  quantidade: number;
}

export interface Insumo {
  id: string;
  nome: string;
  tipo: string; // filamento, tempo, material, etc.
  unidade: string; // kg, horas, unidades, etc.
  custoPorUnidade: number;
  posicoesEstoque?: PosicaoEstoque[];
  estoqueMinimo: number;
  cor?: string; // para filamentos
  especificacoes?: Record<string, any>;
  grupoFilamento?: string; // Fabricante, Material e Cor (para filamentos)
}

export interface PecaInsumo {
  insumoId?: string; // For non-filament insumos (e.g., material, tempo, outros)
  grupoFilamento?: string; // For filament insumos (Fabricante, Material, Cor)
  quantidade: number;
  tipo: string; // e.g., 'filamento', 'material', 'tempo', 'outros'
  isAlternative?: boolean;
  alternativeFilaments?: PecaInsumo[]; // For alternative filament groups
}

export interface Peca {
  id: string;
  sku: string; // SKU base para todas as partes
  nome: string;
  isComposta: boolean;
  gruposImpressao: GrupoImpressao[];
  tempoMontagem: number; // tempo adicional de montagem para a peça
  custoCalculado: number;
  precoSugerido: number;
  posicoesEstoque?: PosicaoEstoque[];
  estoqueTotal?: number; // Computed property
}

export interface GrupoImpressao {
  id: string;
  nome: string;
  filamentos: {
    principal: PecaInsumo;
    alternativos?: PecaInsumo[];
  };
  partes: Parte[]; // Changed to use Parte interface directly
  tempoImpressao: number;
}

export interface PecaParte {
  parteId: string;
  nome?: string; // Adicionado para facilitar a exibição no formulário
  quantidade: number;
  identificador?: string; // Adicionado para armazenar o identificador da parte na peça composta
}

export interface Modelo {
  id: string;
  sku: string;
  nome: string;
  pecas: {
    pecaId: string;
    quantidade: number;
  }[];
  tempoMontagem: number; // tempo adicional de montagem
  custoCalculado: number;
  precoSugerido: number;
  posicoesEstoque?: PosicaoEstoque[];
}

export interface Kit {
  id: string;
  sku: string;
  nome: string;
  modelos: {
    modeloId: string;
    quantidade: number;
  }[];
  tempoMontagem: number; // tempo adicional de montagem
  custoCalculado: number;
  precoSugerido: number;
  posicoesEstoque?: PosicaoEstoque[];
}

export interface Pedido {
  id: string;
  numero: string;
  comprador: string;
  produtos: {
    tipo: 'kit' | 'modelo' | 'peca';
    produtoId: string;
    quantidade: number;
  }[];
  status: 'aguardando' | 'em_producao' | 'concluido';
  etapas: {
    impressao: Record<string, 'aguardando' | 'iniciado' | 'concluido'>;
    montagem: Record<string, 'aguardando' | 'iniciado' | 'concluido'>;
    embalagem: Record<string, 'aguardando' | 'iniciado' | 'concluido'>;
    faturamento: Record<string, 'aguardando' | 'iniciado' | 'concluido'>;
    envio: Record<string, 'aguardando' | 'iniciado' | 'concluido'>;
  };
  custos: {
    insumos: number;
    tempo: number;
    total: number;
  };
  tempos: {
    impressao: number;
    montagem: number;
    total: number;
  };
  dataCriacao: Date;
  dataPrevisao: Date;
  dataConclusao?: Date;
}

export interface Historico {
  id: string;
  tipo: 'pedido' | 'produto' | 'insumo' | 'estoque';
  objetoId: string;
  acao: 'criado' | 'editado' | 'excluido';
  dadosAnteriores?: Record<string, any>;
  dadosNovos?: Record<string, any>;
  timestamp: Date;
  usuario: string;
}

export interface Configuracoes {
  margemLucro: number; // percentual
  valorHoraTrabaho: number;
  alertasEmail: boolean;
  configuracoesPDF: Record<string, any>;
}

// Tipos para componentes de UI
export interface DashboardMetrics {
  pedidosEmAndamento: number;
  pedidosConcluidos: number;
  insumosComEstoqueBaixo: number;
  custoTotalMes: number;
  receitaTotalMes: number;
}

export interface AlertaEstoque {
  insumoId: string;
  nome: string;
  estoqueAtual: number;
  estoqueMinimo: number;
  percentualRestante: number;
}

export interface Parte {
  id?: string; // Made optional as it's only assigned after adding to Firestore
  sku: string;
  nome: string;
  quantidade: number; // Adicionado para uso em GrupoImpressao.partes
  isNova?: boolean; // Adicionado para uso em GrupoImpressao.partes
  posicoesEstoque?: PosicaoEstoque[];
  identificador: string; // Novo campo para o identificador específico da parte
}

export interface EstoqueLancamento {
  id: string;
  tipoProduto: 'parte' | 'peca' | 'modelo' | 'kit' | 'insumo'; // Tipo do item movimentado
  produtoId: string; // ID do item (Parte, Peca, Modelo, Kit, Insumo)
  quantidade: number; // Quantidade movimentada
  tipoMovimento: 'entrada' | 'saida' | 'ajuste'; // Tipo de movimento (adição, remoção, correção)
  data: Date; // Data do lançamento
  usuario: string; // Usuário que realizou o lançamento
  observacao?: string; // Observações adicionais
}

export interface Produto {
  id: string;
  nome: string;
  sku: string;
  posicoesEstoque?: PosicaoEstoque[];
  recipienteId?: string; // This can be deprecated later
  tipoProduto: 'parte' | 'peca' | 'modelo' | 'kit' | 'insumo';
  // Computed property, not stored in Firestore
  estoqueTotal?: number;
}
