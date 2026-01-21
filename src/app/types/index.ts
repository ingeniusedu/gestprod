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
  pedidoId?: string; // Added pedidoId field
  pedidoNumero?: string;
  isAvulsa?: boolean;
  status?: string;
  sourceOptimizedGroupId?: string; // Added sourceOptimizedGroupId
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
    modelos?: PackagingModelo[]; // Added modelos for compatibility
    pecas?: PackagingPeca[]; // Added pecas for compatibility
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
  id: string;
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
  tipoPeca: 'simples' | 'composta_um_grupo_sem_montagem' | 'composta_um_grupo_com_montagem' | 'composta_multiplos_grupos';
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
  custoCalculado?: number;
  custoCalculadoFilamento?: number;
  custoCalculadoImpressao?: number;
  custoCalculadoMontagem?: number;
  custoCalculadoInsumos?: number;
  precoSugerido?: number;
  tempoMontagem?: number;
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
  custoCalculado?: number;
  custoCalculadoFilamento?: number;
  custoCalculadoImpressao?: number;
  custoCalculadoMontagem?: number;
  custoCalculadoInsumos?: number;
  precoSugerido?: number;
  tempoMontagem?: number;
  tempoMontagemAdicional?: number;
  insumosAdicionais?: {
    insumoId: string;
    quantidade: number;
  }[];
  posicoesEstoque?: PosicaoEstoque[];
  estoqueTotal?: number;
}

export interface Kit {
  id: string;
  nome: string;
  SKU: string;
  // Compatibilidade com estrutura antiga (modelos) e nova (componentes)
  modelos?: {
    modeloId: string;
    quantidade: number;
  }[];
  componentes?: {
    id: string;
    nome: string;
    sku: string;
    quantidade: number;
    tipo: 'modelo' | 'peca';
  }[];
  insumosAdicionais?: {
    insumoId: string;
    nome: string;
    tipo: 'material' | 'tempo' | 'outros' | 'embalagem';
    quantidade: number;
  }[];
  custoCalculado?: number;
  custoCalculadoFilamento?: number;
  custoCalculadoImpressao?: number;
  custoCalculadoMontagem?: number;
  custoCalculadoInsumos?: number;
  precoSugerido?: number;
  tempoMontagem?: number;
  tempoMontagemAdicional?: number;
  consumoFilamento?: number;
  estoqueTotal?: number; // Para compatibilidade com página de estoque
  posicoesEstoque?: PosicaoEstoque[];
}

export interface Insumo {
  id: string;
  nome: string;
  tipo: 'material' | 'tempo' | 'outros' | 'embalagem';
  unidade?: string;
  estoqueTotal?: number;
  estoqueAtual?: number;
  posicoesEstoque?: PosicaoEstoque[];
  // Campos específicos para embalagem
  tipoEmbalagem?: string;
  materialEmbalagem?: string;
  altura?: number;
  largura?: number;
  profundidade?: number;
  dataCompraEmbalagem?: string;
  custoPorUnidade?: number;
  valorFrete?: number;
  valorTotalPago?: number;
  especificacoes?: any;
}

export interface GrupoDeFilamento {
  id: string;
  nome: string;
  cor: string;
  pesoLiquido: number; // Added pesoLiquido
  fabricante?: string; // Added fabricante
  material?: string; // Added material
  estoqueTotalGramas?: number;
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
    estoqueAtual?: number;
  }[];
  outrosInsumosNecessarios: {
    id: string;
    insumoId: string;
    nome: string;
    quantidade: number;
    estoqueAtual?: number;
  }[];
  tempoImpressaoGrupo: number;
  consumoFilamentoGrupo: number;
  quantidadeOriginalGrupo: number;
  quantidadeProduzirGrupo: number;
  quantidadeMaxima?: number;
  pedidoId: string;
  pedidoNumero: string;
  timestamp: any;
  pedidosOrigem: Array<{
    pedidoId: string;
    pedidoNumero: string;
    groupId: string;
    assemblyInstances?: Array<{
      assemblyInstanceId: string;
      atendimentoDetalhado?: any[];
    }>;
  }>;
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
  modelos?: PackagingModelo[];
  pecas?: PackagingPeca[];
  quantidadeAtendida?: number;
  estoqueAtual?: number;
}

export interface PackagingModelo {
  modeloId: string;
  nome: string;
  quantidade: number;
  quantidadeAtendida?: number;
  estoqueAtual?: number;
  pecas?: PackagingPeca[];
}

export interface PackagingPeca {
  pecaId: string;
  nome: string;
  quantidade: number;
  quantidadeAtendida?: number;
  estoqueAtual?: number;
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
  origem?: string; // Added to explicitly state the origin of consumption
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

export interface UsoEstoquePayload {
  pedidoId: string;
  nivelUsado: number;
  produtoRaiz: {
    id: string;
    tipo: 'kit' | 'modelo' | 'peca' | 'parte';
    quantidade: number;
  };
  produtosConsumidos: Array<{
    produtoId: string;
    produtoTipo: 'kit' | 'modelo' | 'peca' | 'parte';
    quantidade: number;
    nivel: number;
  }>;
  posicoesConsumidas: Array<{
    produtoId: string;
    produtoTipo: 'kit' | 'modelo' | 'peca' | 'parte';
    posicaoEstoqueId: string;
    quantidade: number;
  }>;
}

// Payloads específicos para cada tipo de serviço
export interface Impressao3DPayload {
  impressora?: string;
  total: number; // tempo em minutos
  pedidoId?: string;
  optimizedGroupId?: string;
}

export interface MontagemPayload {
  tipo: 'peça' | 'modelo' | 'kit';
  total: number; // tempo em minutos
  pedidoId?: string;
  assemblyGroup?: string;
  productId?: string;
}

export interface EmbalagemPayload {
  total: number; // tempo em minutos
  pedidoId?: string;
  assemblyGroup?: string;
}

export interface LancamentoServico {
  serviceType: "impressao_3d" | "montagem" | "embalagem";
  origem: "pedido" | "producao" | "prototipagem" | "pessoal" | "outro";
  usuario: string;
  data: Timestamp;
  payload: Impressao3DPayload | MontagemPayload | EmbalagemPayload;
}

export interface FilamentSpool {
  id: string;
  grupoFilamentoId: string;
  spoolNumero: number;
  pesoLiquido: number; // Total capacity of the spool
  estoqueAtual: number;
  aberto: boolean;
  dataAbertura?: Timestamp;
  finalizadoEm?: Timestamp;
  isFinalizado: boolean;
  operacoes: string[]; // Array of lancamentoIds
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Other fields copied from GrupoDeFilamento or specific to the spool
  nome: string;
  cor: string;
  fabricante?: string;
  material?: string;
  // Any other relevant fields from the group
}

export interface NotificacaoFrontend {
  id?: string;
  type: 'newSpoolOpened';
  spoolId: string;
  spoolNumero: number;
  grupoFilamentoId: string;
  grupoFilamentoNome: string;
  timestamp: Timestamp;
  read: boolean;
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
