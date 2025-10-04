import { Pedido, PedidoProduto, Peca, Modelo, Kit, Parte, GrupoDeFilamento, Insumo, ProductionGroup, PosicaoEstoque, AtendimentoDetalhadoItem } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { serverTimestamp } from 'firebase/firestore';

export const formatTime = (minutes: number): string => {
  if (minutes === 0) return '0h 0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
};

export const formatFilament = (grams: number): string => {
  if (grams === 0) return '0g';
  if (grams < 1000) return `${grams.toFixed(2)}g`;
  return `${(grams / 1000).toFixed(2)}kg`;
};

export const calculateEffectiveQuantityFulfilledByComponents = (
  produto: PedidoProduto,
  allPecasData: Peca[],
  allModelsData: Modelo[],
  allKitsData: Kit[]
): number => {
  if (!produto.atendimentoEstoqueDetalhado) return 0;

  let minFulfilledRatio = 1; // Represents the minimum ratio of any component fulfilled

  if (produto.tipo === 'kit' && produto.atendimentoEstoqueDetalhado.modelosAtendidos) {
    const kitDetails = allKitsData.find(k => k.id === produto.produtoId);
    if (!kitDetails || !kitDetails.modelos) return 0;

    for (const modelRef of kitDetails.modelos) {
      const modelAttended = produto.atendimentoEstoqueDetalhado.modelosAtendidos.find(m => m.modeloId === modelRef.modeloId);
      if (modelRef.quantidade > 0) {
        const ratio = (modelAttended?.quantidade || 0) / modelRef.quantidade;
        minFulfilledRatio = Math.min(minFulfilledRatio, ratio);
      } else {
        minFulfilledRatio = 0;
      }
    }
  } else if (produto.tipo === 'modelo' && produto.atendimentoEstoqueDetalhado.pecasAtendidas) {
    const modeloDetails = allModelsData.find((m: Modelo) => m.id === produto.produtoId);
    if (!modeloDetails) return 0;

    for (const pecaRef of modeloDetails.pecas) {
      const pecaAttended = produto.atendimentoEstoqueDetalhado.pecasAtendidas.find(p => p.pecaId === pecaRef.pecaId);
      if (pecaRef.quantidade > 0) {
        const ratio = (pecaAttended?.quantidade || 0) / pecaRef.quantidade;
        minFulfilledRatio = Math.min(minFulfilledRatio, ratio);
      } else {
        minFulfilledRatio = 0;
      }
    }
  } else if (produto.tipo === 'peca' && produto.atendimentoEstoqueDetalhado.partesAtendidas) {
    const pecaDetails = allPecasData.find(p => p.id === produto.produtoId);
    if (!pecaDetails) return 0;

    const allPartsNeededForPeca: { parteId: string; quantidade: number }[] = [];
    pecaDetails.gruposImpressao.forEach(gi => {
      gi.partes.forEach(parte => {
        const existing = allPartsNeededForPeca.find(p => p.parteId === parte.parteId);
        if (existing) {
          existing.quantidade += parte.quantidade;
        } else {
          allPartsNeededForPeca.push({ parteId: parte.parteId, quantidade: parte.quantidade });
        }
      });
    });

    for (const parteRef of allPartsNeededForPeca) {
      const parteAttended = produto.atendimentoEstoqueDetalhado.partesAtendidas.find(p => p.parteId === parteRef.parteId);
      if (parteRef.quantidade > 0) {
        const ratio = (parteAttended?.quantidade || 0) / parteRef.quantidade;
        minFulfilledRatio = Math.min(minFulfilledRatio, ratio);
      } else {
        minFulfilledRatio = 0;
      }
    }
  } else {
    return 0;
  }

  return Math.min(produto.quantidade, minFulfilledRatio * produto.quantidade);
};

export const generateProductionGroupsForProduct = (
  produtoPedido: PedidoProduto,
  pedido: Pedido,
  allPecasData: Peca[],
  allModelsData: Modelo[],
  allKitsData: Kit[],
  allPartes: Parte[],
  allFilamentGroups: GrupoDeFilamento[],
  allInsumosData: Insumo[]
): ProductionGroup[] => {
  const generatedGroups: ProductionGroup[] = [];
  const { produtoId, tipo, quantidade, atendimentoEstoqueDetalhado } = produtoPedido;

  const quantidadeAtendida = atendimentoEstoqueDetalhado?.quantidadeProdutoAtendidaDiretamente || 0;
  const quantidadeAProduzir = quantidade - quantidadeAtendida;
  if (quantidadeAProduzir <= 0) {
    return [];
  }

  const allPrintGroupsNeeded: {
    grupo: any; // GrupoImpressao type
    totalQuantity: number;
    sourceName: string;
    sourceType: 'peca';
    parentPecaId?: string;
    parentModeloId?: string;
    parentKitId?: string;
    pecaTipoDetalhado?: Peca['tipoPeca'];
  }[] = [];

  if (tipo === 'peca') {
    const pecaDetails = allPecasData.find(p => p.id === produtoId);
    if (pecaDetails?.gruposImpressao) {
      pecaDetails.gruposImpressao.forEach(gi => {
        allPrintGroupsNeeded.push({
          grupo: gi,
          totalQuantity: quantidadeAProduzir,
          sourceName: pecaDetails.nome,
          sourceType: 'peca',
          parentPecaId: pecaDetails.id,
          pecaTipoDetalhado: pecaDetails.tipoPeca,
        });
      });
    }
  } else if (tipo === 'modelo') {
    const modeloDetails = allModelsData.find((m: Modelo) => m.id === produtoId);
    if (modeloDetails?.pecas) {
      for (const pecaRef of modeloDetails.pecas) {
        const pecaDetails = allPecasData.find(p => p.id === pecaRef.pecaId);
        if (pecaDetails?.gruposImpressao) {
          pecaDetails.gruposImpressao.forEach(gi => {
            allPrintGroupsNeeded.push({
              grupo: gi,
              totalQuantity: quantidadeAProduzir * pecaRef.quantidade,
              sourceName: pecaDetails.nome,
              sourceType: 'peca',
              parentPecaId: pecaDetails.id,
              parentModeloId: modeloDetails.id,
              pecaTipoDetalhado: pecaDetails.tipoPeca,
            });
          });
        }
      }
    }
  } else if (tipo === 'kit') {
    const kitDetails = allKitsData.find(k => k.id === produtoId);
    if (kitDetails?.modelos) {
      for (const modeloRef of kitDetails.modelos) {
        const modeloDetails = allModelsData.find((m: Modelo) => m.id === modeloRef.modeloId);
        if (modeloDetails?.pecas) {
          for (const pecaRef of modeloDetails.pecas) {
            const pecaDetails = allPecasData.find(p => p.id === pecaRef.pecaId);
            if (pecaDetails?.gruposImpressao) {
              pecaDetails.gruposImpressao.forEach(gi => {
                allPrintGroupsNeeded.push({
                  grupo: gi,
                  totalQuantity: quantidadeAProduzir * modeloRef.quantidade * pecaRef.quantidade,
                  sourceName: pecaDetails.nome,
                  sourceType: 'peca',
                  parentPecaId: pecaDetails.id,
                  parentModeloId: modeloDetails.id,
                  parentKitId: kitDetails.id,
                  pecaTipoDetalhado: pecaDetails.tipoPeca,
                });
              });
            }
          }
        }
      }
    }
  }

  for (const { grupo, totalQuantity, sourceName, sourceType, parentPecaId, parentModeloId, parentKitId, pecaTipoDetalhado } of allPrintGroupsNeeded) {
    const limit = grupo.quantidadeMaxima || 1;
    let remainingQuantity = totalQuantity;

    while (remainingQuantity > 0) {
      const quantityForThisRun = Math.min(remainingQuantity, limit);
      const productionGroup: ProductionGroup = {
        id: uuidv4(),
        sourceId: parentPecaId!,
        sourceType: 'peca',
        sourceName: sourceName,
        parentPecaId: parentPecaId,
        parentModeloId: parentModeloId,
        parentKitId: parentKitId,
        pecaTipoDetalhado: pecaTipoDetalhado || 'simples',
        corFilamento: allFilamentGroups.find(fg => fg.id === grupo.filamentos[0]?.grupoFilamentoId)?.cor || 'N/A',
        partesNoGrupo: grupo.partes.reduce((acc: { [parteId: string]: { nome: string; quantidade: number; hasAssembly?: boolean; } }, parte: { parteId: string; quantidade: number; hasAssembly?: boolean; }) => {
          const parteDetails = allPartes.find(p => p.id === parte.parteId);
          acc[parte.parteId] = {
            nome: parteDetails?.nome || 'N/A',
            quantidade: parte.quantidade * quantityForThisRun,
            hasAssembly: parte.hasAssembly || false,
          };
          return acc;
        }, {}),
        filamentosNecessarios: grupo.filamentos.map((f: { grupoFilamentoId: string; quantidade: number; }) => ({
          ...f,
          id: f.grupoFilamentoId!,
          nome: allFilamentGroups.find(fg => fg.id === f.grupoFilamentoId)?.nome || 'Desconhecido',
          quantidade: f.quantidade * quantityForThisRun,
        })),
        outrosInsumosNecessarios: (grupo.outrosInsumos || []).map((i: { insumoId: string; quantidade: number; }) => ({
          ...i,
          id: i.insumoId!,
          nome: allInsumosData.find(ins => ins.id === i.insumoId)?.nome || 'Desconhecido',
          quantidade: i.quantidade * quantityForThisRun,
        })),
        tempoImpressaoGrupo: grupo.tempoImpressao * quantityForThisRun,
        consumoFilamentoGrupo: grupo.filamentos.reduce((acc: number, f: { quantidade: number; }) => acc + f.quantidade, 0) * quantityForThisRun,
        status: 'aguardando',
        quantidadeOriginalGrupo: totalQuantity,
        quantidadeProduzirGrupo: quantityForThisRun,
        quantidadeMaxima: grupo.quantidadeMaxima,
        pedidoId: pedido.id,
        pedidoNumero: pedido.numero,
        timestamp: serverTimestamp(),
      };
      generatedGroups.push(productionGroup);
      remainingQuantity -= quantityForThisRun;
    }
  }
  return generatedGroups;
};

type StockStatus = 'full_stock' | 'partial_stock' | 'no_stock';

export const getGroupStockStatus = (group: ProductionGroup): StockStatus => {
  let hasAnyZeroStock = false;
  let hasAnyInsufficientStock = false;

  for (const parteId in group.partesNoGrupo) {
    const parteInfo = group.partesNoGrupo[parteId];
    const currentStock = parteInfo.estoqueAtual ?? 0;
    if (currentStock < (parteInfo.quantidadeNecessaria ?? 0)) {
      hasAnyInsufficientStock = true;
      if (currentStock === 0) {
        hasAnyZeroStock = true;
      }
    }
  }

  for (const filamento of group.filamentosNecessarios) {
    const currentStock = filamento.estoqueAtualFilamento ?? 0;
    if (currentStock < filamento.quantidade) {
      hasAnyInsufficientStock = true;
      if (currentStock === 0) {
        hasAnyZeroStock = true;
      }
    }
  }

  for (const insumo of (group.outrosInsumosNecessarios || [])) {
    const currentStock = insumo.estoqueAtualInsumo ?? 0;
    if (currentStock < insumo.quantidade) {
      hasAnyInsufficientStock = true;
      if (currentStock === 0) {
        hasAnyZeroStock = true;
      }
    }
  }

  if (hasAnyZeroStock) {
    return 'no_stock';
  } else if (hasAnyInsufficientStock) {
    return 'partial_stock';
  } else {
    return 'full_stock';
  }
};

export const canConcludePedido = (pedido: Pedido): { canConclude: boolean; message: string | null } => {
  for (const produto of pedido.produtos) {
    if (produto.statusProducaoItem !== 'pronto_para_embalagem' && produto.statusProducaoItem !== 'concluido') {
      return { canConclude: false, message: `Produto "${produto.nomeProduto}" não está pronto para embalagem ou concluído.` };
    }
  }
  return { canConclude: true, message: null };
};

export const formatLocation = (posicoes: PosicaoEstoque[]): string => {
  if (!posicoes || posicoes.length === 0) return 'N/A';
  
  const locations = posicoes.map(pos => {
    const localName = pos.localNome || 'Desconhecido';
    const coords = pos.posicaoNaGrade ? `(X:${pos.posicaoNaGrade.x}, Y:${pos.posicaoNaGrade.y}, Z:${pos.posicaoNaGrade.z})` : '';
    const division = pos.divisao ? ` (H:${pos.divisao.h}, V:${pos.divisao.v})` : '';
    return `${localName} ${coords}${division}`;
  });

  return [...new Set(locations)].join('; ');
};
