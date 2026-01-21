import { PackagingData } from '../hooks/usePackagingStateV2';
import { GrupoMontagem, Insumo } from '../../types';

export interface ConcludePedidoV2Data {
  assemblyGroup: GrupoMontagem;
  packagingData: PackagingData;
  user: string;
}

export interface ProductionLaunchDocument {
  tipoEvento: 'conclusao_pedido';
  timestamp: Date;
  usuarioId: string;
  payload: {
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
  };
}

export interface InsumoLaunchDocument {
  tipoMovimento: 'saida';
  tipoInsumo: 'embalagem';
  insumoId: string;
  insumoNome: string;
  quantidade: number;
  unidadeMedida: 'unidades';
  data: Date;
  usuario: string;
  pedidoId: string;
  assemblyGroupId: string;
  origem: 'embalagem_pedido';
  detalhes?: string;
}

export interface ServicoLaunchDocument {
  serviceType: 'embalagem';
  origem: 'pedido' | 'producao' | 'prototipagem' | 'pessoal' | 'outro';
  usuario: string;
  data: Date;
  payload: {
    total: number; // tempo em minutos
    pedidoId: string;
    assemblyGroup: string;
  };
}

/**
 * Calcula a quantidade total dos produtos finais necessários
 */
function calcularQuantidadeTotal(assemblyGroup: GrupoMontagem): number {
  if (!assemblyGroup.produtosFinaisNecessarios?.length) {
    return 0;
  }
  
  return assemblyGroup.produtosFinaisNecessarios.reduce((total, produto) => {
    return total + (produto.quantidade || 0);
  }, 0);
}

/**
 * Gera os documentos para conclusão de pedido na aba Processando Embalagem V2
 */
export function gerarDocumentosConclusaoPedido(data: ConcludePedidoV2Data): {
  productionDocument: ProductionLaunchDocument;
  insumoDocuments: InsumoLaunchDocument[];
  servicoDocument: ServicoLaunchDocument;
} {
  const { assemblyGroup, packagingData, user } = data;

  // Calcular quantidade total dos produtos finais
  const quantidadeTotal = calcularQuantidadeTotal(assemblyGroup);

  // Documento para lancamentosProducao
  const productionDocument: ProductionLaunchDocument = {
    tipoEvento: 'conclusao_pedido',
    timestamp: new Date(),
    usuarioId: user,
    payload: {
      pedidoId: assemblyGroup.pedidoId || packagingData.pedidoId, // ✅ CORREÇÃO: Usar ID real do pedido do grupo de montagem com fallback
      pedidoNumero: assemblyGroup.pedidoNumero || packagingData.pedidoNumero, // ✅ CORREÇÃO: Usar número real do pedido com fallback
      assemblyGroupId: assemblyGroup.id!,
      produtoId: assemblyGroup.produtosFinaisNecessarios?.[0]?.produtoId, // ✅ CORREÇÃO: Usar ID do produto real
      produtoNome: assemblyGroup.produtosFinaisNecessarios?.[0]?.nome || assemblyGroup.targetProductName,
      quantidade: quantidadeTotal,
      usuarioId: user,
      tempoEmbalagem: packagingData.packagingTimeMinutes,
      embalagemId: packagingData.assemblyGroupId,
      insumosEmbalagem: packagingData.selectedInsumos.map((item) => ({
        insumoId: item.insumo.id,
        quantidade: item.quantidade
      })),
      itensConferidos: packagingData.checkedItems
    }
  };

  // Documentos para lancamentosInsumos (consumo de embalagens)
  const insumoDocuments: InsumoLaunchDocument[] = packagingData.selectedInsumos.map((item) => ({
    tipoMovimento: 'saida' as const,
    tipoInsumo: 'embalagem' as const,
    insumoId: item.insumo.id,
    insumoNome: item.insumo.nome,
    quantidade: item.quantidade,
    unidadeMedida: 'unidades' as const,
    data: new Date(),
    usuario: user,
    pedidoId: packagingData.pedidoId,
    assemblyGroupId: assemblyGroup.id!,
    origem: 'embalagem_pedido' as const,
    detalhes: `Consumo de embalagem para pedido ${packagingData.pedidoNumero || packagingData.pedidoId}`
  }));

  // Documento para lancamentosServicos (tempo de embalagem)
  const servicoDocument: ServicoLaunchDocument = {
    serviceType: 'embalagem',
    origem: 'pedido',
    usuario: user,
    data: new Date(),
    payload: {
      total: packagingData.packagingTimeMinutes, // tempo em minutos
      pedidoId: packagingData.pedidoId,
      assemblyGroup: assemblyGroup.id!
    }
  };

  return {
    productionDocument,
    insumoDocuments,
    servicoDocument
  };
}

/**
 * Valida se todos os itens estão disponíveis para embalagem
 */
export function validarDisponibilidadeItens(assemblyGroup: GrupoMontagem): boolean {
  // TODO: Implementar lógica real de validação de disponibilidade
  // Por enquanto, retorna true para teste
  if (!assemblyGroup.produtosFinaisNecessarios) {
    return false;
  }

  return assemblyGroup.produtosFinaisNecessarios.every(produto => {
    return (produto.quantidadeAtendida || 0) >= produto.quantidade;
  });
}

/**
 * Calcula o progresso de embalagem
 */
export function calcularProgressoEmbalagem(packagingData: PackagingData): number {
  const checkedItems = packagingData.checkedItems || {};
  const totalItems = Object.keys(checkedItems).length;
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;

  if (totalItems === 0) return 0;
  return Math.round((checkedCount / totalItems) * 100);
}

/**
 * Formata tempo de embalagem para exibição
 */
export function formatarTempoEmbalagem(minutos: number): string {
  if (minutos < 60) {
    return `${minutos} min`;
  }

  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;

  if (minutosRestantes === 0) {
    return `${horas}h`;
  }

  return `${horas}h ${minutosRestantes}min`;
}

/**
 * Valida se os dados de embalagem são consistentes
 */
export function validarDadosEmbalagem(packagingData: PackagingData): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!packagingData.assemblyGroupId) {
    errors.push('ID do grupo de montagem é obrigatório');
  }

  if (!packagingData.pedidoId) {
    errors.push('ID do pedido é obrigatório');
  }

  if (packagingData.packagingTimeMinutes <= 0) {
    errors.push('Tempo de embalagem deve ser maior que zero');
  }

  if (!packagingData.selectedInsumos || packagingData.selectedInsumos.length === 0) {
    errors.push('Pelo menos um insumo de embalagem deve ser selecionado');
  }

  const checkedItems = packagingData.checkedItems || {};
  const totalItems = Object.keys(checkedItems).length;
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;

  if (totalItems === 0) {
    errors.push('Nenhum item para conferir');
  } else if (checkedCount < totalItems) {
    errors.push('Todos os itens devem ser conferidos');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
