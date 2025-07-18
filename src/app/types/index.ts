// Tipos básicos do sistema de gestão de produção
import { FieldValue, Timestamp } from 'firebase/firestore';

export interface PosicaoEstoque {
  recipienteId?: string; // Made optional
  divisao?: { h: number; v: number };
  quantidade: number;
  localId?: string; // Adicionado para referência direta
  localNome?: string; // Adicionado para exibição
  posicaoNaGrade?: { x: number; y: number; z: number }; // Adicionado para exibição
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
  especificacoes?: {
    // Filament specific
    fabricante?: string;
    tipoFilamento?: string;
    fornecedor?: string; // Novo campo para fornecedor
    material?: string;
    numeroSpools?: number;
    tamanhoSpool?: string;
    valorPagoPorSpool?: number;
    spoolNumero?: number;
    autoNumberSpool?: boolean;
    aberto?: boolean;
    dataAbertura?: string;
    pesoBruto?: number;
    pesoLiquido?: number;
    dataUltimaPesagem?: string;
    finalizadoEm?: boolean;
    dataFinalizacao?: string;
    lote?: string;
    dataFabricacao?: string;
    dataCompra?: string;
    operacoes?: string[];
    consumoProducao?: number;
    consumoReal?: number;

    // Embalagem specific
    tipoEmbalagem?: string;
    materialEmbalagem?: string;
    altura?: number;
    largura?: number;
    profundidade?: number;
    quantidade?: number;
    valorTotalPago?: number;
    valorFrete?: number;
    dataCompraEmbalagem?: string;

    // Material specific
    tipoMaterial?: string; // e.g., "cola", "ímã circular", "placa"
    materialAssociado?: string; // e.g., "Acetato de Vinila", "Neodímio", "Aço"

    // Tempo specific
    valorHora?: number;

    [key: string]: any; // Allow other arbitrary properties
  };
  grupoFilamentoId?: string; // Referência ao ID do documento na coleção gruposDeFilamento
  estoqueTotal?: number; // Added for consistency with other product types
  status?: 'aberto' | 'fechado'; // Novo campo para spools de filamento
  dataAbertura?: Timestamp; // Novo campo para spools de filamento
  consumoProducao?: number; // Novo campo para registrar consumo na produção
}

export interface GrupoDeFilamento {
  id: string;
  nome: string; // ex: "3D Prime PLA Verde"
  fabricante: string;
  material: string;
  cor: string;
  custoMedioPonderado: number; // custo por grama
  estoqueTotalGramas: number;
  spoolsEmEstoqueIds: string[]; // array com os IDs dos insumos/spools
  updatedAt: any; // Firestore Timestamp
  consumoProducao?: number; // Novo campo para registrar consumo na produção do grupo
}

export interface PecaInsumo {
  insumoId?: string; // For non-filament insumos (e.g., material, tempo, outros)
  grupoFilamentoId?: string; // For filament insumos, ID from a `gruposDeFilamento` document
  quantidade: number;
  tipo: string; // e.g., 'filamento', 'material', 'tempo', 'outros'
  etapaInstalacao?: 'impressao' | 'montagem'; // Para insumos do tipo 'material'
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
  hasAssembly?: boolean; // Added to indicate if the peca requires assembly
}

export interface GrupoImpressao {
  id: string;
  nome: string;
  filamentos: PecaInsumo[]; // This will now strictly contain only filament types
  outrosInsumos?: PecaInsumo[]; // New field for materials, time, others
  partes: PecaParte[];
  tempoImpressao: number;
  quantidadeMaxima?: number;
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
  insumosAdicionais?: {
    insumoId: string;
    quantidade: number;
  }[];
  tempoMontagem: number; // tempo adicional de montagem
  custoCalculado: number;
  precoSugerido: number;
  posicoesEstoque?: PosicaoEstoque[];
  estoqueTotal?: number; // Computed property
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
  estoqueTotal?: number; // Added for consistency
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
    totalConsumoFilamento?: number; // Added this property
  };
  dataCriacao: Date;
  dataPrevisao: Date;
  dataConclusao?: Date;
  productionGroups?: ProductionGroup[]; // New field
}

export interface ProductionGroupInsumo {
  id: string; // Insumo ID
  nome: string;
  quantidade: number;
  tipo: string; // e.g., 'material', 'tempo', 'outros'
  etapaInstalacao?: 'impressao' | 'montagem'; // For materials
  estoqueAtualInsumo?: number; // Current stock of this specific insumo
  localEstoqueInsumo?: PosicaoEstoque[]; // Where the insumo stock is located
}

export interface ProductionGroup {
  id: string; // Unique ID for the production group (e.g., combination of pedidoId and group index)
  sourceId: string; // ID of the original product (peca, modelo, kit)
  sourceType: 'peca' | 'modelo' | 'kit';
  sourceName: string;
  originalPecaId?: string; // New field for original Peca ID
  originalModeloId?: string; // New field for original Modelo ID
  originalKitId?: string; // New field for original Kit ID
  corFilamento?: string; // Main filament color for the group
  items: { // Parts/components within this group
    id: string; // ID of the part/component (e.g., Parte.id)
    nome: string;
    quantidadePedido: number; // Quantity of this item required for the group
    estoqueAtualItem?: number; // Current stock of this specific item
    localEstoqueItem?: PosicaoEstoque[]; // Where the stock is located
    hasAssembly?: boolean; // Added to indicate if this specific item requires assembly
    tipoProduto?: 'parte' | 'peca' | 'modelo' | 'kit' | 'insumo'; // Added to identify product type
  }[];
  filamentosNecessarios: { // Filaments needed for this group
    id: string; // Insumo ID or GrupoDeFilamento ID
    nome: string;
    quantidade: number; // in grams
    tipo: string; // e.g., 'filamento' - Added this property
    estoqueAtualFilamento?: number; // Current stock of this specific filament
    localEstoqueFilamento?: PosicaoEstoque[]; // Where the filament stock is located
  }[];
  outrosInsumosNecessarios?: ProductionGroupInsumo[]; // New field for other insumos
  tempoImpressaoGrupo: number;
  consumoFilamentoGrupo: number;
  status: 'aguardando' | 'em_producao' | 'produzido' | 'em_montagem' | 'montado' | 'concluido';
  pedidoId: string;
  pedidoNumero: string;
  pedidoComprador: string;
  pedidoTotalTempoImpressao: number;
  pedidoTotalConsumoFilamento: number;
  pedidoTotalTempoMontagem: number;
  startedAt?: Date | FieldValue | null; // When production started
  completedAt?: Date | FieldValue | null; // When production completed
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
  id: string;
  sku: string;
  nome: string;
  posicoesEstoque?: PosicaoEstoque[];
  identificador: string;
  hasAssembly?: boolean;
  estoqueTotal?: number;
  // These fields are not part of the Parte document but are used in other contexts.
  quantidade?: number; 
  isNova?: boolean;
}

export interface LancamentoProduto {
  id: string;
  tipoProduto: 'partes' | 'pecas' | 'modelos' | 'kits';
  produtoId: string;
  tipoMovimento: 'entrada' | 'saida' | 'ajuste';
  usuario: string;
  observacao?: string;
  data?: Timestamp;
  locais: {
    recipienteId?: string;
    divisao?: { h: number; v: number };
    quantidade: number;
    localId?: string;
  }[];
}

export interface LancamentoInsumo {
  id: string;
  insumoId: string;
  tipoInsumo: 'filamento' | 'tempo' | 'material' | 'outros';
  tipoMovimento: 'entrada' | 'saida' | 'ajuste';
  quantidade: number;
  unidadeMedida?: string; // Made optional as it might not be relevant for all insumos in a lancamento
  data?: Timestamp; // Renamed from dataLancamento for consistency
  origem?: string; // Made optional
  detalhes?: string; // Renamed from observacao for consistency
  locais?: PosicaoEstoque[];
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
