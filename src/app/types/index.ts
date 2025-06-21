// Tipos básicos do sistema de gestão de produção

export interface Insumo {
  id: string;
  nome: string;
  tipo: string; // filamento, tempo, material, etc.
  unidade: string; // kg, horas, unidades, etc.
  custoPorUnidade: number;
  estoqueAtual: number;
  estoqueMinimo: number;
  cor?: string; // para filamentos
  especificacoes?: Record<string, any>;
}

export interface Peca {
  id: string;
  sku: string;
  nome: string;
  insumos: {
    insumoId: string;
    quantidade: number;
  }[];
  tempoImpressao: number; // em horas
  tempoMontagem: number; // em horas
  custoCalculado: number;
  precoSugerido: number;
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
