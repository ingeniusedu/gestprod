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
    payload: CriacaoPedidoPayload | InicioProducaoPayload | ConclusaoProducaoPayload | EntradaPartesPayload | EntradaPecaEmbalagemPayload | EntradaPecaMontagemPayload | EntradaModeloMontagemPayload | EntradaKitMontagemPayload | ConclusaoMontagemPecaPayload | ConclusaoMontagemModeloPayload | ConclusaoMontagemKitPayload | EntradaPecaMontagemKitPayload | EntradaKitEmbalagemPayload | EntradaModeloMontagemKitPayload | EntradaEstoquePecaPayload | EntradaPedidoPecaPayload | EntradaEstoqueModeloPayload | EntradaPedidoModeloPayload | EntradaEstoqueKitPayload | EntradaPedidoKitPayload;
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
}

export interface OutroInsumoNecessario {
    insumoId: string;
    quantidade: number | string;
    tipo: 'material';
    etapaInstalacao: string;
    nome?: string;
    id?: string;
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
    status: 'aguardando' | 'em_producao' | 'produzido' | 'atendido_por_estoque';
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
    status: 'aguardando_montagem' | 'em_montagem' | 'montado' | 'cancelado' | 'pronto_para_montagem' | 'produzido_aguardando_embalagem' | 'embalado';
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
    data: admin.firestore.Timestamp;
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
