// Tipos básicos do sistema de gestão de produção
import { FieldValue, Timestamp } from 'firebase/firestore';

export interface PosicaoEstoque {
  recipienteId?: string; // Made optional
  divisao?: { h: number; v: number } | null; // Allow null for consistency
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
  especificacoes?: {
    filamento?: {
      fabricante?: string;
      tipoFilamento?: string;
      fornecedor?: string;
      material?: string;
      numeroSpools?: number;
      tamanhoSpool?: string;
      valorPagoPorSpool?: number;
      spoolNumero?: number;
      autoNumberSpool?: boolean;
      aberto?: boolean;
      dataAbertura?: Timestamp; // Usar apenas um tipo e local para dataAbertura
      pesoBruto?: number;
      pesoLiquido?: number;
      dataUltimaPesagem?: string;
      finalizadoEm?: boolean;
      dataFinalizacao?: string;
      lote?: string;
      dataFabricacao?: string;
      dataCompra?: string;
      operacoes?: string[];
      consumoProducao?: number; // Consumo específico deste spool
      consumoReal?: number;
      cor?: string; // Cor do filamento
      grupoFilamentoId?: string; // Referência ao ID do grupo de filamento
      status?: 'aberto' | 'fechado'; // Status do spool
    };
    embalagem?: {
      tipoEmbalagem?: string;
      materialEmbalagem?: string;
      altura?: number;
      largura?: number;
      profundidade?: number;
      quantidade?: number;
      valorTotalPago?: number;
      valorFrete?: number;
      dataCompraEmbalagem?: string;
    };
    material?: {
      tipoMaterial?: string; // e.g., "cola", "ímã circular", "placa"
      materialAssociado?: string; // e.g., "Acetato de Vinila", "Neodímio", "Aço"
    };
    [key: string]: any; // Allow other arbitrary properties
  };
  estoqueTotal?: number; // Added for consistency with other product types
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
  nome?: string; // Adicionado para facilitar a exibição
  quantidade: number;
  tipo: string; // e.g., 'filamento', 'material', 'tempo', 'outros'
  etapaInstalacao?: 'impressao' | 'montagem'; // Para insumos do tipo 'material'
  isAlternative?: boolean;
  alternativeFilaments?: PecaInsumo[]; // For alternative filament groups
}

export interface OptimizedFilamentItem extends ProductionGroupFilamento {
  aggregatedId: string;
  quantidadeNecessaria?: number;
  estoqueAtual?: number;
}

export interface OptimizedInsumoItem extends ProductionGroupOutroInsumo {
  aggregatedId: string;
  quantidadeNecessaria?: number;
  estoqueAtual?: number;
}

export interface OptimizedGroup {
  id: string;
  partesNoGrupo: { [key: string]: { nome: string; quantidade: number; estoqueAtual?: number; quantidadeNecessaria?: number; hasAssembly?: boolean; } };
  totalPartsQuantity: number; // Renamed from quantidadeTotal
  aggregatedGroupCount: number; // New field to track number of aggregated production groups
  pedidosOrigem: { pedidoId: string; pedidoNumero: string; groupId: string }[];
  sourceName: string;
  tempoImpressaoGrupo: number;
  corFilamento?: string;
  filamentosNecessarios: OptimizedFilamentItem[];
  outrosInsumosNecessarios: OptimizedInsumoItem[];
  insumosProntos: boolean;
  partesProntas: boolean;
  status: ProductionGroup['status']; // Add status property
  parentPecaId?: string;
  parentModeloId?: string | null;
  parentKitId?: string | null;
}

export interface Peca {
  id: string;
  sku: string; // SKU base para todas as partes
  nome: string;
  isComposta: boolean;
  tipoPeca: 'simples' | 'composta_um_grupo_sem_montagem' | 'composta_um_grupo_com_montagem' | 'composta_multiplos_grupos';
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
  consumoFilamento: number; // Adicionado para o consumo de filamento do grupo
  quantidadeMaxima?: number;
}

export interface PecaParte {
  parteId: string;
  nome?: string; // Adicionado para facilitar a exibição no formulário
  quantidade: number;
  identificador?: string; // Adicionado para armazenar o identificador da parte na peça composta
  hasAssembly?: boolean; // Adicionado para indicar se a parte requer montagem
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
  numero: string; // Número do pedido (identificador humano)
  comprador: string; // Nome do comprador
  
  // Produtos do pedido: uma lista dos itens que foram pedidos.
  // Esta lista será mais "estática" e não conterá detalhes dinâmicos de produção.
  produtos: {
    produtoId: string; // ID do produto (Kit, Modelo, Peça)
    tipo: 'kit' | 'modelo' | 'peca'; // Tipo do produto
    nomeProduto: string; // Nome do produto para exibição
    skuProduto: string; // SKU do produto para exibição
    quantidade: number; // Quantidade total deste produto no pedido
    
    // O status de produção de cada item do pedido será *derivado*
    // dos documentos nas coleções de produção (gruposProducaoOtimizados, emMontagemPeca, etc.)
    // e não mais armazenado diretamente aqui.
    // Podemos manter um status de alto nível para exibição rápida, mas ele seria atualizado por uma Cloud Function
    // que agrega o status das tarefas de produção vinculadas.
    statusProducaoItem?: 'aguardando_producao' | 'em_producao' | 'produzido' | 'em_montagem_pecas' | 'em_montagem_modelos' | 'em_montagem_kits' | 'pronto_para_embalagem' | 'concluido' | 'montado'; // Added 'em_montagem_kits'
    gruposImpressaoProducao?: ProductionGroup[]; // Adicionado para rastrear grupos de impressão gerados
    atendimentoEstoqueDetalhado?: { // Adicionado para rastrear atendimento de estoque detalhado
      quantidadeProdutoAtendidaDiretamente?: number;
      partesAtendidas?: { parteId: string; quantidade: number }[];
      pecasAtendidas?: { pecaId: string; quantidade: number }[];
      modelosAtendidos?: { modeloId: string; quantidade: number }[];
    };
  }[]; 

  // Status geral do pedido: também será derivado ou atualizado por uma Cloud Function
  // que agrega o status de todos os itens de produção vinculados.
  status: 'aguardando' | 'em_producao' | 'em_montagem' | 'processando_embalagem' | 'concluido' | 'cancelado';

  dataCriacao: Date | Timestamp;
  dataPrevisao: Date | Timestamp;
  dataConclusao?: Date | Timestamp | null;

  // Custos e tempos totais podem ser agregados e armazenados aqui,
  // mas os detalhes de como esses custos/tempos são calculados virão das coleções de produção.
  custos?: {
    insumos: number;
    tempo: number;
    total: number;
  };
  tempos?: {
    impressao: number;
    montagem: number;
    total: number;
    totalConsumoFilamento?: number;
  };
}

export interface LancamentoProducao {
  id: string;
  tipoEvento: 'criacao_pedido' | 'inicio_impressao' | 'conclusao_impressao' | 'inicio_montagem_peca' | 'conclusao_montagem_peca' | 'inicio_montagem_modelo' | 'conclusao_montagem_modelo' | 'inicio_montagem_kit' | 'conclusao_montagem_kit' | 'inicio_embalagem' | 'conclusao_embalagem';
  timestamp: Timestamp;
  usuarioId: string;
  pedidoId?: string;
  grupoProducaoId?: string; // Se o evento se refere a um grupo de impressão
  tarefaProducaoId?: string; // Se o evento se refere a uma tarefa de montagem/embalagem
  payload: any; // Dados específicos do evento (ex: lista de grupos de impressão do pedido, produtos gerados)
}

export interface StockOption {
  id: string;
  nome: string;
  tipo: 'kit' | 'modelo' | 'peca' | 'parte';
  quantidadeNecessaria: number;
  quantidadeUsarEstoque: number;
  estoqueAtualItem: number;
  quantidadeDisponivel: number; // Added
  posicoesEstoque: PosicaoEstoque[];
  parentId?: string; // For parts, refers to the parent peca
  children?: StockOption[]; // For kits/models/pecas, refers to their components
}

export interface ProductionGroupFilamento extends PecaInsumo {
  id: string; // ID do insumo/grupo de filamento
  nome: string; // Nome do insumo/grupo de filamento
  cor?: string; // Adicionado para a cor do filamento
  estoqueAtualFilamento?: number;
  localEstoqueFilamento?: PosicaoEstoque[];
}

export interface ProductionGroupOutroInsumo extends PecaInsumo {
  id: string; // ID do insumo
  nome: string; // Nome do insumo
  estoqueAtualInsumo?: number;
  localEstoqueInsumo?: PosicaoEstoque[];
}

export interface ProductionGroup {
  id?: string; // ID único para esta instância específica do grupo de produção (optional as it's generated by Firestore)
  sourceId: string; // ID da peça que gerou este grupo de impressão
  sourceType: 'peca'; // O tipo da peça que gerou este grupo (sempre 'peca' para grupos de impressão)
  sourceName: string; // Nome da peça que gerou este grupo
  sourceGrupoImpressaoId?: string; // ID do GrupoImpressao original que gerou este grupo de produção
  pedidosOrigem?: { pedidoId: string; pedidoNumero: string; groupId: string }[]; // New: Store all original group origins
  totalPartsQuantity?: number; // New: Total parts for this specific production group instance
  
  // Links explícitos para a hierarquia do produto pai dentro do PedidoProdutoComProducao
  parentPecaId?: string; // Se este grupo pertence a uma peça
  parentModeloId?: string; // Se este grupo pertence a um modelo (via uma peça)
  parentKitId?: string; // Se este grupo pertence a um kit (via um modelo/peça)

  corFilamento?: string; // Cor principal do filamento para o grupo
  partesNoGrupo: { [parteId: string]: { nome: string; quantidade: number; hasAssembly?: boolean; estoqueAtual?: number; quantidadeNecessaria?: number; localEstoqueItem?: PosicaoEstoque[]; } }; // Changed from items array to map, removed stock fields
  filamentosNecessarios: ProductionGroupFilamento[]; // Filamentos necessários para este grupo
  outrosInsumosNecessarios?: ProductionGroupOutroInsumo[]; // Outros insumos necessários
  tempoImpressaoGrupo: number; // Tempo de impressão para este grupo
  consumoFilamentoGrupo: number; // Consumo de filamento para este grupo
  
  // Status específico deste grupo de impressão
  status: 'aguardando' | 'em_producao' | 'produzido' | 'cancelado_por_estoque' | 'montado'; // 'cancelado_por_estoque' indica que não precisa ser impresso

  // Quantidades para controle de produção e estoque
  quantidadeOriginalGrupo: number; // A quantidade original que este grupo deveria produzir
  quantidadeProduzirGrupo: number; // A quantidade restante a ser produzida para este grupo (após decisões de estoque)
  
  startedAt?: Date | FieldValue | null; // Quando a produção deste grupo começou
  completedAt?: Date | FieldValue | null; // Quando a produção deste grupo foi concluída
  quantidadeMaxima?: number; // Quantidade máxima por lote de impressão (do GrupoImpressao original)
  pedidoId: string; // Adicionado para referência ao pedido
  pedidoNumero: string; // Adicionado para referência ao número do pedido
  timestamp: Timestamp | FieldValue; // Adicionado para registrar a data de criação do grupo otimizado
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
  tipoProduto: 'parte' | 'peca' | 'modelo' | 'kit';
  produtoId: string;
  tipoMovimento: 'entrada' | 'saida' | 'ajuste';
  usuario: string;
  observacao?: string;
  data?: Timestamp;
  locais: {
    recipienteId?: string;
    divisao?: { h: number; v: number } | null; // Allow null
    quantidade: number;
    localId?: string;
  }[];
}

export interface LancamentoInsumo {
  id: string;
  insumoId: string;
  tipoInsumo: 'filamento' | 'material' | 'outros';
  tipoMovimento: 'entrada' | 'saida' | 'ajuste';
  quantidade: number;
  unidadeMedida?: string; // Made optional as it might not be relevant for all insumos in a lancamento
  data?: Timestamp; // Renamed from dataLancamento for consistency
  origem?: string; // Made optional
  detalhes?: string; // Renamed from observacao for consistency
  locais?: (PosicaoEstoque & { divisao?: { h: number; v: number } | null; })[]; // Allow null for divisao
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

export interface Servico {
  id: string;
  nome: string;
  unidade: string;
  custoPorUnidade: number;
}

export interface RelatorioServico {
  id: string; // Formato YYYY-MM
  resumoDiario: {
    [dia: string]: { // Formato DD
      [servicoId: string]: {
        totalQuantidade: number;
        totalCusto: number;
      };
    };
  };
  resumoSemanal: {
    [semana: string]: { // Formato YYYY-WW (ex: 2023-42)
      [servicoId: string]: {
        totalQuantidade: number;
        totalCusto: number;
      };
    };
  };
  resumoMensal: {
    [servicoId: string]: {
      totalQuantidade: number;
      totalCusto: number;
    };
  };
  lancamentosProcessadosIds: string[]; // Para garantir a idempotência
  updatedAt: FieldValue;
}

export interface LancamentoServico {
  servicoId: string;
  pedidoId?: string; // Made optional as it might be linked to an optimized group instead
  optimizedGroupId?: string; // New field for linking to optimized production groups
  quantidade: number;
  data: Timestamp;
  usuario: string;
}

export interface ItemToDebit {
  id: string;
  nome: string;
  quantidadePedido: number;
  estoqueAtualItem: number;
  localEstoqueItem: PosicaoEstoque[];
  type: 'parte' | 'peca' | 'modelo' | 'kit' | 'insumo';
  pedidoId?: string;
  groupId?: string;
  debitType?: 'full' | 'available';
}

export interface ProducedPart {
  parteId: string;
  quantidadeProduzida: number;
  destinoProducao: 'pedido' | 'montagem_avulsa' | 'estoque';
  targetProductId: string; // Made required
  targetProductType: 'peca' | 'modelo' | 'kit'; // Made required
  locais?: {
    recipienteId: string;
    divisao?: { h: number; v: number } | null;
    quantidade: number;
    localId?: string;
  }[];
  tipoProdutoGerado?: 'parte' | 'peca';
  parentPecaId?: string;
  parentModeloId?: string;
  parentKitId?: string;
  sourceName?: string; // Added sourceName
}

export interface ParteParaMontagemAvulsa {
  id?: string;
  parteId: string;
  quantidade: number;
  sourceOptimizedGroupId: string;
  sourcePedidoId?: string;
  timestamp: Timestamp | FieldValue;
}

export interface LancamentoMontagem {
  id?: string; // Firestore generated ID
  tipoEvento: 'entrada_partes_peca' | 'entrada_pecas_modelo' | 'entrada_modelos_kit' | 'conclusao_montagem_peca' | 'conclusao_montagem_modelo' | 'conclusao_montagem_kit';
  timestamp: Timestamp | FieldValue;
  usuarioId: string;
  pedidoId?: string; // Opcional, se vinculado a um pedido
  pedidoNumero?: string; // Adicionado para referência ao número do pedido
  sourceOptimizedGroupId?: string; // Para rastreabilidade da origem da impressão
  payload: {
    destino?: 'pedido' | 'montagem_avulsa' | 'estoque';
    targetProductId: string; // ID da peça/modelo/kit sendo montado
    targetProductType: 'peca' | 'modelo' | 'kit';
    quantidade: number; // Quantidade do item (parte/peça/modelo) que está sendo "movido" para montagem
    parteId?: string; // Se o evento for 'entrada_partes_peca'
    pecaId?: string; // Se o evento for 'entrada_pecas_modelo'
    modeloId?: string; // Se o evento for 'entrada_modelos_kit'
    parentPecaId?: string;
    parentModeloId?: string;
    parentKitId?: string;
    assemblyInstanceId?: string; // ID único da instância de montagem
    sourceName?: string; // Added sourceName
  };
}

export interface GrupoMontagem {
  id?: string; // Firestore generated ID
  pedidoId?: string; // Opcional, se vinculado a um pedido
  pedidoNumero?: string | null;
  targetProductId: string; // ID da peça/modelo/kit que está sendo montado
  targetProductType: 'peca' | 'modelo' | 'kit';
  assemblyInstanceId: string; // ID único para esta instância de montagem
  status: 'aguardando_montagem' | 'em_montagem' | 'montado' | 'cancelado';
  partesNecessarias?: { parteId: string; quantidade: number; quantidadeAtendida: number; }[];
  pecasNecessarias?: { pecaId: string; quantidade: number; quantidadeAtendida: number; }[];
  modelosNecessarios?: { modeloId: string; quantidade: number; quantidadeAtendida: number; }[];
  timestampCriacao: Timestamp | FieldValue;
  timestampInicio?: Timestamp | FieldValue;
  timestampConclusao?: Timestamp | FieldValue;
  isAvulsa: boolean; // true se não vinculado a um pedido específico (montagem avulsa)
  sourceOptimizedGroupId?: string; // Para rastreabilidade
  parentModeloId?: string | null;
  parentKitId?: string | null;
}
