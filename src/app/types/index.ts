import { Timestamp } from 'firebase/firestore';
import { LocalProduto, LocalInsumo, Recipiente } from './mapaEstoque';

// Add ConcludeData interface
export interface ConcludeData {
  group: OptimizedGroup;
  producedParts: {
    parteId: string;
    quantidadeProduzida: number;
    destinoExcedente?: 'estoque' | 'montagem';
    locais?: {
      recipienteId: string;
      divisao?: { h: number; v: number } | null;
      quantidade: number;
    }[];
  }[];
}

// Add other interfaces as needed
export interface OptimizedGroup {
  id: string;
  status: 'aguardando' | 'em_producao' | 'produzido';
  sourceName: string;
  totalPartsQuantity: number;
  tempoImpressaoGrupo: number;
  pedidosOrigem: { pedidoId: string; pedidoNumero: string; groupId: string }[];
  partesNoGrupo: Record<string, { nome: string; quantidade: number; estoqueAtual?: number; quantidadeNecessaria?: number; hasAssembly?: boolean }>;
  filamentosNecessarios: {
    id: string;
    nome: string;
    quantidade: number;
    estoqueAtual?: number;
    quantidadeNecessaria?: number;
    localEstoqueFilamento?: { recipienteId: string; quantidade: number }[];
  }[];
  outrosInsumosNecessarios: {
    id: string;
    nome: string;
    tipo: 'material' | 'tempo' | 'outros' | 'embalagem';
    quantidade: number;
    etapaInstalacao: string;
    estoqueAtual?: number;
    quantidadeNecessaria?: number;
    localEstoqueInsumo?: { recipienteId: string; quantidade: number }[];
  }[];
  insumosProntos: boolean;
  partesProntas: boolean;
  aggregatedGroupCount?: number;
  corFilamento?: string;
  pecaTipoDetalhado?: string;
  parentPecaId?: string;
  parentModeloId?: string;
  parentKitId?: string;
}

export interface GrupoMontagem {
  id?: string;
  assemblyInstanceId?: string;
  targetProductId?: string;
  targetProductName?: string;
  targetProductType?: string;
  parentModeloId?: string;
  parentKitId?: string;
  pedidoNumero?: string;
  isAvulsa?: boolean;
  status?: string;
  payload?: {
    quantidade?: number;
  };
  partesNecessarias?: {
    parteId: string;
    nome: string;
    quantidade: number;
    quantidadeAtendida?: number;
    estoqueAtual?: number;
    atendimentoDetalhado?: {
      origem: string;
      quantidade: number;
      timestamp: Timestamp;
    }[];
  }[];
  pecasNecessarias?: {
    pecaId: string;
    nome?: string;
    quantidade: number;
    quantidadeAtendida?: number;
    estoqueAtual?: number;
    atendimentoDetalhado?: {
      origem: string;
      quantidade: number;
      timestamp: Timestamp;
    }[];
  }[];
  modelosNecessarios?: {
    modeloId: string;
    nome: string;
    quantidade: number;
    quantidadeAtendida?: number;
    estoqueAtual?: number;
    atendimentoDetalhado?: AtendimentoDetalhadoItem[]; // Added atendimentoDetalhado
  }[];
  produtosFinaisNecessarios?: {
    produtoId: string;
    nome: string;
    quantidade: number;
    quantidadeAtendida?: number;
    tipo: 'peca' | 'modelo' | 'kit'; // Changed type to union
  }[];
}

export interface Pedido {
  id: string;
  numero: string;
  status: string;
  produtos: PedidoProduto[];
  dataCriacao: Timestamp;
  dataConclusao?: Timestamp;
}

export interface PedidoProduto {
  produtoId: string;
  skuProduto: string;
  nomeProduto: string;
  tipo: 'peca' | 'modelo' | 'kit';
  quantidade: number;
  statusProducaoItem?: string;
  gruposImpressao?: {
    partes?: {
      parteId: string;
      sku: string;
      nome: string;
      quantidade: number;
    }[];
  }[];
  gruposImpressaoProducao?: GrupoImpressao[];
  modelosComponentes?: ModeloComponente[];
  pecasComponentes?: PecaComponente[];
  atendimentoEstoqueDetalhado?: {
    partesAtendidas?: { parteId: string; quantidade: number }[];
  };
}

export interface ModeloComponente {
  produtoId: string;
  skuProduto: string;
  nomeProduto: string;
  quantidade: number;
  pecasComponentes?: PecaComponente[];
}

export interface PecaComponente {
  SKU: string;
  nome: string;
  quantidade: number;
  gruposImpressao?: GrupoImpressao[];
}

export interface GrupoImpressao {
  id?: string;
  status?: string;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  partes?: {
    parteId: string;
    sku: string;
    nome: string;
    quantidade: number;
  }[];
}

export interface Peca {
  id: string;
  nome: string;
  tipoPeca: string;
  SKU: string;
  estoqueTotal?: number;
  posicoesEstoque?: PosicaoEstoque[];
  gruposImpressao: {
    quantidadeMaxima?: number;
    tempoImpressao: number;
    partes: {
      parteId: string;
      quantidade: number;
      hasAssembly?: boolean;
    }[];
    filamentos: {
      grupoFilamentoId: string;
      quantidade: number;
    }[];
    outrosInsumos?: {
      insumoId: string;
      quantidade: number;
    }[];
  }[];
}

export interface Parte {
  id: string;
  nome: string;
  sku: string;
}

export interface Modelo {
  id: string;
  nome: string;
  SKU: string;
  pecas: {
    pecaId: string;
    quantidade: number;
  }[];
}

export interface Kit {
  id: string;
  nome: string;
  SKU: string;
  modelos: {
    modeloId: string;
    quantidade: number;
  }[];
}

export interface Insumo {
  id: string;
  nome: string;
  tipo: 'material' | 'tempo' | 'outros';
  estoqueTotal?: number;
  estoqueAtual?: number;
  posicoesEstoque?: PosicaoEstoque[];
}

export interface GrupoDeFilamento {
  id: string;
  nome: string;
  estoqueTotalGramas?: number;
  cor?: string;
}

export interface PecaInsumo {
  insumoId: string;
  quantidade: number;
}

export interface PecaParte {
  parteId: string;
  quantidade: number;
}

export interface ProductionGroup {
  id: string;
  sourceId: string;
  sourceType: 'peca';
  sourceName: string;
  parentPecaId?: string;
  parentModeloId?: string;
  parentKitId?: string;
  pecaTipoDetalhado: string;
  corFilamento: string;
  status: 'aguardando' | 'em_producao' | 'produzido';
  partesNoGrupo: Record<string, {
    nome: string;
    quantidade: number;
    hasAssembly?: boolean;
    estoqueAtual?: number;
    quantidadeNecessaria?: number;
  }>;
  filamentosNecessarios: {
    id: string;
    grupoFilamentoId: string;
    nome: string;
    quantidade: number;
    estoqueAtualFilamento?: number;
  }[];
  outrosInsumosNecessarios: {
    id: string;
    insumoId: string;
    nome: string;
    quantidade: number;
    estoqueAtualInsumo?: number;
  }[];
  tempoImpressaoGrupo: number;
  consumoFilamentoGrupo: number;
  quantidadeOriginalGrupo: number;
  quantidadeProduzirGrupo: number;
  quantidadeMaxima?: number;
  pedidoId: string;
  pedidoNumero: string;
  timestamp: any;
}

export interface ProductionGroupFilamento {
  id: string;
  quantidade: number;
}

export interface ProductionGroupOutroInsumo {
  id: string;
  quantidade: number;
}

export interface Historico {
  id: string;
  data: Timestamp;
}

export interface Configuracoes {
  id: string;
}

export interface DashboardMetrics {
  id: string;
}

export interface AlertaEstoque {
  id: string;
}

export interface Produto {
  id: string;
}

export interface Servico {
  id: string;
  custoPorUnidade: number;
}

export interface ItemToDebit {
  id: string;
  nome: string;
  quantidadePedido: number;
  estoqueAtualItem?: number;
  localEstoqueItem?: PosicaoEstoque[];
  type: string;
  pedidoId?: string;
  groupId?: string;
}

export interface LancamentoMontagem {
  id: string;
}

export interface ProdutoFinalNecessario {
  produtoId: string;
  nome: string;
  quantidade: number;
  tipo: 'peca' | 'modelo' | 'kit';
}

export interface PackagingModelo {
  modeloId: string;
  nome: string;
  quantidade: number;
}

export interface PackagingPeca {
  pecaId: string;
  nome: string;
  quantidade: number;
}

export interface AtendimentoDetalhadoItem {
  origem: string;
  quantidade: number;
  timestamp: Timestamp;
}

export interface SummaryItem {
  documentId: string;
  sku: string;
  produtoNome: string;
  tipo: 'parte' | 'peca' | 'modelo' | 'kit';
  emEstoque: number;
  necessario: number;
  aguardando: number;
  emProducao: number;
  emMontagemPeca: number;
  emMontagemModelo: number;
  emMontagemKit: number;
  processandoEmbalagem: number;
  finalizado: number;
  children?: SummaryItem[];
  level: number;
}

export interface PosicaoEstoque {
  recipienteId?: string;
  localId?: string;
  divisao?: { h: number; v: number } | null;
  quantidade: number;
  localNome?: string;
  posicaoNaGrade?: {
    x: number;
    y: number;
    z: number;
  };
}

export interface LancamentoInsumo {
  id: string;
  insumoId: string;
  tipoInsumo: 'filamento' | 'material' | 'outros';
  tipoMovimento: 'entrada' | 'saida';
  quantidade: number;
  unidadeMedida: 'gramas' | 'unidades' | 'horas';
  data: Timestamp;
  detalhes?: string;
  locais?: { recipienteId: string; quantidade: number }[];
  pedidoId?: string;
}

export interface LancamentoProduto {
  id: string;
  produtoId: string;
  tipoProduto: 'parte' | 'peca' | 'modelo' | 'kit';
  tipoMovimento: 'entrada' | 'saida';
  quantidade?: number;
  usuario: string;
  observacao?: string;
  data: Timestamp;
  locais: {
    recipienteId: string;
    localId?: string;
    divisao?: { h: number; v: number } | null;
    quantidade: number;
  }[];
}

export interface LancamentoServico {
  servicoId: 'impressao_3d' | 'embalagem';
  optimizedGroupId?: string;
  pedidoId?: string;
  quantidade: number;
  data: Timestamp;
  usuario: string;
}

export interface AllProductsData {
  pecas: Peca[];
  partes: Parte[];
  modelos: Modelo[];
  kits: Kit[];
  insumos: Insumo[];
  filamentGroups: GrupoDeFilamento[];
  locaisProdutos: LocalProduto[];
  locaisInsumos: LocalInsumo[];
  recipientes: Recipiente[];
  assemblyGroups: {
    id?: string;
    targetProductId?: string;
    targetProductType?: string;
    status?: string;
    payload?: {
      quantidade?: number;
    };
  }[];
}
