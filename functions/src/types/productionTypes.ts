import * as admin from 'firebase-admin';

export interface ParteProduzidaPayload {
    assemblyInstanceId: string;
    parteId: string;
    quantidade: number;
}

export interface ConclusaoMontagemPecaPayload {
    assemblyGroupId: string;
    targetProductId: string;
    targetProductType: 'peca';
    parentModeloId: string | null;
    parentKitId: string | null;
    usuarioId: string;
}

export interface ConclusaoPedidoPayload {
    pedidoId: string;
    pedidoNumero?: string;
    assemblyGroupId: string;
    produtoId?: string;
    produtoNome?: string;
    quantidade?: number;
    usuarioId: string;
    tempoEmbalagem: number; // tempo em minutos
    embalagemId?: string; // ID do grupo/local de embalagem
    insumosEmbalagem: {
        insumoId: string;
        quantidade: number;
    }[];
    itensConferidos?: Record<string, boolean>;
}

export enum LancamentoProducaoTipoEvento {
    CRIACAO_PEDIDO = 'criacao_pedido',
    INICIO_PRODUCAO = 'inicio_producao',
    CONCLUSAO_PRODUCAO = 'conclusao_producao',
    ENTRADA_PARTES_P_COMPOSTA_UM_CM = 'entrada_partes_p_composta_um_cm',
    ENTRADA_PARTES_P_SIMPLES = 'entrada_partes_p_simples',
    ENTRADA_PECA_EMBALAGEM = 'entrada_peca_embalagem',
    ENTRADA_ESTOQUE_PECA = 'entrada_estoque_peca',
    ENTRADA_PEDIDO_PECA = 'entrada_pedido_peca',
    ENTRADA_PECA_MONTAGEM = 'entrada_peca_montagem',
    ENTRADA_MODELO_MONTAGEM = 'entrada_modelo_montagem',
    ENTRADA_KIT_MONTAGEM = 'entrada_kit_montagem',
    ENTRADA_PARTE_MONTAGEM_PECA = 'entrada_parte_montagem_peca',
    ENTRADA_PECA_MONTAGEM_MODELO = 'entrada_peca_montagem_modelo',
    ENTRADA_PECA_MONTAGEM_KIT = 'entrada_peca_montagem_kit',
    ENTRADA_KIT_EMBALAGEM = 'entrada_kit_embalagem',
    ENTRADA_ESTOQUE_KIT = 'entrada_estoque_kit', // New case
    ENTRADA_PEDIDO_KIT = 'entrada_pedido_kit', // New case
    CONCLUSAO_MONTAGEM_PECA = 'conclusao_montagem_peca',
    CONCLUSAO_MONTAGEM_MODELO = 'conclusao_montagem_modelo',
    CONCLUSAO_MONTAGEM_KIT = 'conclusao_montagem_kit', // Add this
    ENTRADA_MODELO_MONTAGEM_KIT = 'entrada_modelo_montagem_kit',
    ENTRADA_MODELO_EMBALAGEM = 'entrada_modelo_embalagem',
    ENTRADA_ESTOQUE_MODELO = 'entrada_estoque_modelo', // New case
    ENTRADA_PEDIDO_MODELO = 'entrada_pedido_modelo', // New case
    CONCLUSAO_PEDIDO = 'conclusao_pedido', // NEW: Centralized conclusion
    USO_ESTOQUE = 'uso_estoque', // NEW: Uso de estoque durante produção
    ESTOQUE_EXCEDENTE = 'estoque_excedente', // NEW: Lançamento de excedente em estoque
}

export interface ConclusaoMontagemKitPayload {
    assemblyGroupId: string;
    assemblyInstanceId: string;
    targetProductId: string; // The kit ID
    targetProductType: 'kit';
    parentKitId: string | null; // Should be null for top-level kits
    usuarioId: string;
    quantidade: number; // Should be 1 for a kit assembly
    modelosNecessarios?: {
        modeloId: string;
        nome: string;
        quantidade: number;
        atendimentoDetalhado: AtendimentoDetalhado[];
    }[];
}

export interface EntradaPecaMontagemKitPayload {
    assemblyInstanceId: string; // ID da instância do kit pai
    pecaId: string;
    quantidade: number;
    parentKitId: string; // ID do kit pai (targetProductId do GrupoMontagem)
}

export interface EntradaKitEmbalagemPayload {
    assemblyInstanceId: string; // ID da instância do kit
    kitId: string; // ID do kit (targetProductId do GrupoMontagem)
    quantidade: number; // Sempre 1 para uma instância de kit
    locaisDestino?: {
        localId: string;
        tipo: 'estoque' | 'pedido';
    }[];
}

export interface EntradaModeloMontagemKitPayload {
    assemblyInstanceId: string; // ID da instância do kit pai
    modeloId: string;
    quantidade: number;
    parentKitId: string; // ID do kit pai (targetProductId do GrupoMontagem)
}

export interface ConclusaoMontagemModeloPayload {
    assemblyGroupId: string;
    assemblyInstanceId: string;
    targetProductId: string;
    targetProductType: 'modelo';
    parentModeloId: string | null;
    parentKitId: string | null;
    usuarioId: string;
    quantidade: number;
}

export interface LancamentoProducao {
    id: string;
    tipoEvento: LancamentoProducaoTipoEvento;
    timestamp: admin.firestore.Timestamp | admin.firestore.FieldValue;
    usuarioId: string;
    payload: CriacaoPedidoPayload | InicioProducaoPayload | ConclusaoProducaoPayload | EntradaPartesPayload | EntradaPecaEmbalagemPayload | EntradaPecaMontagemPayload | EntradaModeloMontagemPayload | EntradaKitMontagemPayload | ConclusaoMontagemPecaPayload | ConclusaoMontagemModeloPayload | ConclusaoMontagemKitPayload | EntradaPecaMontagemKitPayload | EntradaKitEmbalagemPayload | EntradaModeloMontagemKitPayload | EntradaEstoquePecaPayload | EntradaPedidoPecaPayload | EntradaEstoqueModeloPayload | EntradaPedidoModeloPayload | EntradaEstoqueKitPayload | EntradaPedidoKitPayload | ConclusaoPedidoPayload | UsoEstoquePayload | EstoqueExcedentePayload;
}

export interface CriacaoPedidoPayload {
    pedidoId: string;
    pedidoNumero: string;
    produtos: ProdutoPayload[];
}

export interface InicioProducaoPayload {
    groupId: string;
}

export interface ConclusaoProducaoPayload {
    groupId: string;
    quantidadeProduzida: number;
    locaisDestino?: LocalDestino[];
}

export interface EntradaPartesPayload {
    parentPecaId: string;
    pecaTipoDetalhado: string;
    partesProduzidas: ParteProduzidaPayload[];
}

export interface LocalDestino {
    recipienteId: string;
    divisao: { h: number; v: number } | null;
    quantidade: number;
    localId: string;
}

export interface EntradaPecaEmbalagemPayload {
    assemblyInstanceId: string;
    pecaId: string; // Changed from parteId to pecaId as per requirements
    quantidade: number;
    locaisDestino: { // Made required as per requirements
        localId: string;
        tipo: 'estoque' | 'pedido';
    }[];
}

export interface EntradaPecaMontagemPayload {
    assemblyInstanceId: string;
    pecaId: string;
    quantidade: number;
    parentModeloId: string | null;
    parentKitId: string | null;
}

export interface EntradaModeloMontagemPayload {
    assemblyInstanceId: string;
    modeloId: string;
    quantidade: number;
    parentKitId: string | null;
}

export interface EntradaModeloEmbalagemPayload {
    assemblyInstanceId: string;
    modeloId: string;
    quantidade: number;
    parentKitId: string | null;
    locaisDestino?: { // Made optional as per requirements
        localId: string;
        tipo: 'estoque' | 'pedido';
    }[];
}

export interface EntradaEstoquePecaPayload {
    pecaId: string;
    quantidade: number;
    localId: string;
    assemblyInstanceId: string;
}

export interface EntradaPedidoPecaPayload {
    pecaId: string;
    quantidade: number;
    pedidoId: string;
    assemblyInstanceId: string;
}

export interface EntradaEstoqueModeloPayload {
    modeloId: string;
    quantidade: number;
    localId: string;
    assemblyInstanceId: string;
}

export interface EntradaPedidoModeloPayload {
    modeloId: string;
    quantidade: number;
    pedidoId: string;
    assemblyInstanceId: string;
}

export interface EntradaEstoqueKitPayload {
    kitId: string;
    quantidade: number;
    localId: string;
    assemblyInstanceId: string;
}

export interface EntradaPedidoKitPayload {
    kitId: string;
    quantidade: number;
    pedidoId: string;
    assemblyInstanceId: string;
}

export interface UsoEstoquePayload {
    pedidoId: string;
    // Informações do nível usado
    nivelUsado: number;
    produtoRaiz: {
        id: string;
        tipo: 'kit' | 'modelo' | 'peca' | 'parte';
        quantidade: number;
        // Contexto adicional para determinar próximo evento
        parentModeloId?: string;
        parentKitId?: string;
        assemblyInstanceId?: string;
    };
    // Produtos consumidos (pode ser o raiz ou seus componentes)
    produtosConsumidos: Array<{
        produtoId: string;
        produtoTipo: 'kit' | 'modelo' | 'peca' | 'parte';
        quantidade: number;
        nivel: number;
        // Contexto para eventos downstream
        parentModeloId?: string;
        parentKitId?: string;
        assemblyInstanceId?: string;
    }>;
    // Posições de estoque específicas
    posicoesConsumidas: Array<{
        produtoId: string;
        produtoTipo: 'kit' | 'modelo' | 'peca' | 'parte';
        posicaoEstoqueId: string;
        quantidade: number;
    }>;
    // NOVOS CAMPOS: Grupos afetados mapeados pelo frontend
    gruposMontagemAfetados?: Array<{
        grupoMontagemId: string;
        assemblyInstanceId: string;
        modificacoes: Array<{
            campo: string;
            valor: any;
        }>;
    }>;
    gruposProducaoAfetados?: Array<{
        grupoProducaoId: string;
        assemblyInstances: string[];
        modificacoes: Record<string, any>;
    }>;
    timestamp?: string;
}

export interface EstoqueExcedentePayload {
    produtoId: string;
    produtoTipo: 'parte' | 'peca' | 'modelo' | 'kit';
    quantidade: number;
    localId: string;
    recipienteId: string;
    divisao?: { h: number; v: number } | null;
    observacao?: string;
}

export interface EntradaKitMontagemPayload {
    assemblyInstanceId: string;
    kitId: string;
    quantidade: number;
}

export interface ProdutoPayload {
    produtoId: string;
    nomeProduto: string;
    skuProduto: string;
    tipo: 'kit' | 'modelo' | 'peca';
    quantidade: number;
    custoUnitario: number;
    tempoImpressaoEstimado: number;
    tempoMontagemEstimado: number;
    sourceType: string;
    pecasComponentes?: PecaComponente[];
    modelosComponentes?: ModeloComponente[];
    insumosNecessarios?: InsumoNecessario[];
}

export interface PecaComponente {
    id: string;
    SKU: string;
    nome: string;
    tipo: 'peca';
    quantidade: number;
    custoUnitario: number;
    tipoPecaDetalhado: string;
    tempoImpressaoEstimado: number;
    tempoMontagemEstimado: number;
    gruposImpressao: GrupoImpressao[];
    insumosNecessarios: InsumoNecessario[];
}

export interface ModeloComponente {
    produtoId: string;
    tipo: 'modelo';
    nomeProduto: string;
    skuProduto: string;
    quantidade: number;
    custoUnitario: number;
    tempoImpressaoEstimado: number;
    tempoMontagemEstimado: number;
    sourceType: string;
    pecasComponentes: PecaComponente[];
    insumosNecessarios: InsumoNecessario[];
}

export interface GrupoImpressao {
    id: string;
    nome: string;
    tempoImpressao: number;
    quantidadeMaxima: number;
    filamentos: FilamentoNecessario[];
    outrosInsumos: OutroInsumoNecessario[];
    partes: ParteNecessaria[];
    consumoFilamento?: number;
}

export interface FilamentoNecessario {
    grupoFilamentoId: string;
    quantidade: number;
    tipo: 'filamento';
    alternativeFilaments: any[];
    nome?: string;
    id?: string;
    localEstoqueFilamento?: PosicaoEstoque[]; // Added
}

export interface OutroInsumoNecessario {
    insumoId: string;
    quantidade: number | string;
    tipo: 'material' | 'outros' | 'embalagem'; // Removed 'tempo' - it's a service, not an insumo
    etapaInstalacao: string;
    nome?: string;
    id?: string;
    localEstoqueInsumo?: PosicaoEstoque[]; // Added
}

export interface ParteNecessaria {
    parteId: string;
    sku: string;
    nome: string;
    identificador: string;
    quantidade: number;
    isNova: boolean;
    quantidadeMaxima?: number;
    tempoImpressao?: number;
    hasAssembly?: boolean;
}

export interface InsumoNecessario {
    insumoId: string;
    grupoFilamentoId?: string;
    quantidade: number | string;
    tipo: 'filamento' | 'material';
    alternativeFilaments?: any[];
    nome?: string;
    id?: string;
}

export interface AssemblyInstance {
    assemblyInstanceId: string;
    quantidadeRequerida: number;
    atendimentoDetalhado: AtendimentoDetalhado[];
    parentPecaId: string | null;
    parentModeloId: string | null;
    parentKitId: string | null;
    targetProductId: string; // Adicionado para rastrear o ID do produto alvo
    targetProductType: 'kit' | 'modelo' | 'peca' | 'produto_final'; // Adicionado para rastrear o tipo do produto alvo
    status?: 'embalado' | 'produzido_aguardando_embalagem'; // Adicionado para rastrear o status da instância
    timestampEmbalagem?: admin.firestore.Timestamp; // Adicionado para registrar o timestamp da embalagem
}

export interface AtendimentoDetalhado {
    origem: 'estoque_kit' | 'estoque_modelo' | 'estoque_peca' | 'producao' | 'montagem_modelo';
    quantidade: number;
    timestamp: admin.firestore.Timestamp | admin.firestore.FieldValue | Date;
}

export interface AtendimentoDetalhadoParte {
    origem: 'estoque_parte' | 'producao' | 'montagem_peca';
    quantidade: number;
    timestamp: admin.firestore.Timestamp | admin.firestore.FieldValue | Date;
}

export interface PedidoOrigem {
    pedidoId: string;
    pedidoNumero: string;
    assemblyInstances: AssemblyInstance[];
    groupId?: string;
    parentModeloId?: string | null;
    parentKitId?: string | null;
}

export interface GrupoProducaoOtimizado {
    id?: string;
    status: 'aguardando' | 'em_producao' | 'produzido' | 'atendido_por_estoque' | 'concluido_por_estoque';
    sourceName: string;
    sourceGrupoImpressaoId: string;
    pecaTipoDetalhado: string;
    consumoFilamentoGrupo: number;
    tempoImpressaoGrupo: number;
    quantidadeOriginalGrupo: number;
    quantidadeProduzirGrupo: number;
    quantidadeMaxima?: number;
    totalPartsQuantity: number;
    timestamp?: admin.firestore.Timestamp | admin.firestore.FieldValue;
    startedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue | null;
    completedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue | null;
    partesNoGrupo: {
        [parteId: string]: {
            nome: string;
            quantidade: number;
            hasAssembly: boolean;
        }
    };
    filamentosNecessarios: FilamentoNecessario[];
    outrosInsumosNecessarios: OutroInsumoNecessario[];
    pedidosOrigem: PedidoOrigem[];
    sourceId?: string;
    sourceType?: string;
    parentPecaId?: string;
    parentModeloId?: string | null;
    parentKitId?: string | null;
    pedidoId?: string;
    pedidoNumero?: string;
}

export interface GrupoMontagem {
    id?: string;
    pedidoId: string | null;
    pedidoNumero: string | null;
    targetProductId: string;
    targetProductType: 'peca' | 'modelo' | 'kit' | 'produto_final';
    targetProductName: string;
    assemblyInstanceId: string;
    status: 'aguardando_montagem' | 'em_montagem' | 'montado' | 'cancelado' | 'pronto_para_montagem' | 'produzido_aguardando_embalagem' | 'embalado' | 'concluido_por_estoque';
    timestampCriacao?: admin.firestore.Timestamp | admin.firestore.FieldValue;
    timestampInicio?: admin.firestore.Timestamp | admin.firestore.FieldValue | null;
    timestampConclusao?: admin.firestore.Timestamp | admin.firestore.FieldValue | null;
    isAvulsa: boolean;
    sourceOptimizedGroupId: string | null;
    parentModeloId: string | null;
    parentKitId: string | null;
    pecaTipoDetalhado: string | null;
    partesNecessarias?: { // Changed back to optional array
        parteId: string;
        nome: string;
        quantidade: number;
        atendimentoDetalhado: AtendimentoDetalhadoParte[];
    }[];
    pecasNecessarias?: {
        pecaId: string;
        nome: string;
        quantidade: number;
        atendimentoDetalhado: {
            origem: 'estoque_peca' | 'montagem_peca';
            quantidade: number;
            timestamp: admin.firestore.Timestamp | admin.firestore.FieldValue;
        }[];
    }[];
    modelosNecessarios?: {
        modeloId: string;
        nome: string;
        quantidade: number;
        atendimentoDetalhado: AtendimentoDetalhado[];
    }[];
    produtosFinaisNecessarios?: ProdutoFinalNecessario[];
}

export interface PackagingPeca {
    pecaId: string;
    nome?: string;
    quantidade: number;
    estoqueAtual?: number;
    quantidadeAtendida?: number;
}

export interface PackagingModelo {
    modeloId: string;
    nome?: string;
    quantidade: number;
    estoqueAtual?: number;
    quantidadeAtendida?: number;
    pecas?: PackagingPeca[];
}

export interface ProdutoFinalNecessario {
    produtoId: string;
    nome?: string;
    tipo: 'kit' | 'modelo' | 'peca';
    quantidade: number;
    atendimentoDetalhado?: {
        origem: 'estoque_kit' | 'estoque_modelo' | 'estoque_peca' | 'montagem_kit' | 'montagem_modelo' | 'montagem_peca';
        quantidade: number;
        timestamp: admin.firestore.Timestamp | admin.firestore.FieldValue;
    }[];
    estoqueAtual?: number;
    quantidadeAtendida?: number;
    modelos?: PackagingModelo[];
    pecas?: PackagingPeca[];
}

export interface Pedido {
    id: string;
    numero: string;
    status: string;
    produtos: PedidoProduto[];
    dataCriacao: admin.firestore.Timestamp;
    dataConclusao?: admin.firestore.Timestamp;
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

export interface LancamentoProduto {
    id: string;
    produtoId: string;
    tipoProduto: 'parte' | 'peca' | 'modelo' | 'kit';
    tipoMovimento: 'entrada' | 'saida';
    quantidade?: number;
    usuario: string;
    observacao?: string;
    data: admin.firestore.Timestamp | admin.firestore.FieldValue;
    locais: {
        recipienteId: string;
        localId?: string;
        divisao?: { h: number; v: number } | null;
        quantidade: number;
    }[];
}

export interface ConsolidatedGroup {
    items: {
        [parteId: string]: {
            parte: ParteNecessaria;
            totalQuantidade: number;
            hasAssembly: boolean;
        };
    };
    filamentos: {
        [filamentoId: string]: {
            filamento: FilamentoNecessario;
            totalQuantidade: number;
        };
    };
    outrosInsumos: {
        [insumoId: string]: {
            insumo: OutroInsumoNecessario;
            totalQuantidade: number;
        };
    };
    tempoImpressao: number;
    consumoFilamento: number;
    quantidadeMaxima: number;
    sourcePecaId: string;
    sourcePecaName: string;
    parentModeloId: string | null | undefined;
    parentKitId: string | null | undefined;
    originalGrupoImpressaoId: string;
    pecaTipoDetalhado: string;
    pedidosOrigem: PedidoOrigem[];
    existingDocIds: string[];
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
    // id: string; // Removed id field to allow Firestore to generate it
    insumoId: string;
    tipoInsumo: 'filamento' | 'material' | 'outros' | 'embalagem'; // Removed 'tempo' - it's a service, not an insumo
    tipoMovimento: 'entrada' | 'saida' | 'ajuste'; // Added 'ajuste'
    quantidade: number;
    unidadeMedida: 'gramas' | 'unidades' | 'horas';
    data: admin.firestore.Timestamp;
    detalhes?: string;
    locais?: { recipienteId: string; quantidade: number }[];
    pedidoId?: string;
    origem?: string; // Added to explicitly state the origin of consumption
    usuario?: string; // Added usuario
}

export interface Insumo {
    id: string;
    nome: string;
    tipo: 'filamento' | 'material' | 'outros' | 'embalagem' | 'tempo';
    posicoesEstoque: PosicaoEstoque[];
    // Add other relevant fields if necessary, based on how insumo documents are structured in Firestore
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
    data: admin.firestore.Timestamp;
    payload: Impressao3DPayload | MontagemPayload | EmbalagemPayload;
}

// Interface para a nova coleção de agregação mensal
export interface ServicoMensal {
    serviceType: "impressao_3d" | "montagem" | "embalagem";
    mes_ano: string; // formato: "novembro_2025"
    total: number; // soma de todos os totais (minutos)
    custo_total: number; // soma de todos os custos
    eventos: ServicoEvento[];
    createdAt: admin.firestore.Timestamp;
    updatedAt: admin.firestore.Timestamp;
}

export interface ServicoEvento {
    id: string;
    origem: "pedido" | "producao" | "prototipagem" | "pessoal" | "outro";
    pedidoId?: string | null;
    optimizedGroupId?: string | null;
    assemblyGroup?: string | null;
    total: number; // tempo em minutos
    custo: number; // valor monetário
    data: admin.firestore.Timestamp;
    usuario: string;
}
