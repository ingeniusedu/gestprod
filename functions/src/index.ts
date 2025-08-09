import {onDocumentWritten, onDocumentCreated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { PosicaoEstoque, Pedido, GrupoImpressao, ProductionGroup, Peca, Modelo, Kit, PecaParte, PecaInsumo, LancamentoServico, Servico } from "../../src/app/types"; // Import necessary types
import { getWeek } from 'date-fns';


admin.initializeApp();
const db = admin.firestore();

// Helper function to extract all GrupoImpressao from a product structure
const extractAllGruposImpressao = (
  products: Pedido['produtos'],
  allPecas: Peca[],
  allModelos: Modelo[],
  allKits: Kit[]
): { grupo: GrupoImpressao; parentPecaId?: string; parentModeloId?: string; parentKitId?: string; pecaName: string; }[] => {
  const allGrupos: { grupo: GrupoImpressao; parentPecaId?: string; parentModeloId?: string; parentKitId?: string; pecaName: string; }[] = [];

  products.forEach(product => {
    if (product.tipo === 'peca') {
      const peca = allPecas.find(p => p.id === product.produtoId);
      if (peca) {
        peca.gruposImpressao.forEach(grupo => {
          allGrupos.push({ grupo, parentPecaId: peca.id, pecaName: peca.nome });
        });
      }
    } else if (product.tipo === 'modelo') {
      const modelo = allModelos.find(m => m.id === product.produtoId);
      if (modelo) {
        modelo.pecas.forEach(modeloPeca => {
          const peca = allPecas.find(p => p.id === modeloPeca.pecaId);
          if (peca) {
            peca.gruposImpressao.forEach(grupo => {
              // Multiply part quantities by the model's quantity in the order
              const adjustedGrupo = {
                ...grupo,
                partes: grupo.partes.map(parte => ({
                  ...parte,
                  quantidade: parte.quantidade * modeloPeca.quantidade * product.quantidade,
                })),
                filamentos: grupo.filamentos.map(fil => ({
                  ...fil,
                  quantidade: fil.quantidade * modeloPeca.quantidade * product.quantidade,
                })),
                outrosInsumos: (grupo.outrosInsumos || []).map(ins => ({
                  ...ins,
                  quantidade: ins.quantidade * modeloPeca.quantidade * product.quantidade,
                })),
                tempoImpressao: grupo.tempoImpressao * modeloPeca.quantidade * product.quantidade,
                consumoFilamento: grupo.consumoFilamento * modeloPeca.quantidade * product.quantidade,
              };
              allGrupos.push({ grupo: adjustedGrupo, parentPecaId: peca.id, parentModeloId: modelo.id, pecaName: peca.nome });
            });
          }
        });
      }
    } else if (product.tipo === 'kit') {
      const kit = allKits.find(k => k.id === product.produtoId);
      if (kit) {
        kit.modelos.forEach(kitModelo => {
          const modelo = allModelos.find(m => m.id === kitModelo.modeloId);
          if (modelo) {
            modelo.pecas.forEach(modeloPeca => {
              const peca = allPecas.find(p => p.id === modeloPeca.pecaId);
              if (peca) {
                peca.gruposImpressao.forEach(grupo => {
                  // Multiply part quantities by the kit's quantity and then by the model's quantity in the kit AND by the product's quantity in the pedido
                  const adjustedGrupo = {
                    ...grupo,
                    partes: grupo.partes.map(parte => ({
                      ...parte,
                      quantidade: parte.quantidade * kitModelo.quantidade * modeloPeca.quantidade * product.quantidade,
                    })),
                    filamentos: grupo.filamentos.map(fil => ({
                      ...fil,
                      quantidade: fil.quantidade * kitModelo.quantidade * modeloPeca.quantidade * product.quantidade,
                    })),
                    outrosInsumos: (grupo.outrosInsumos || []).map(ins => ({
                      ...ins,
                      quantidade: ins.quantidade * kitModelo.quantidade * modeloPeca.quantidade * product.quantidade,
                    })),
                    tempoImpressao: grupo.tempoImpressao * kitModelo.quantidade * modeloPeca.quantidade * product.quantidade,
                    consumoFilamento: grupo.consumoFilamento * kitModelo.quantidade * modeloPeca.quantidade * product.quantidade,
                  };
                  allGrupos.push({ grupo: adjustedGrupo, parentPecaId: peca.id, parentModeloId: modelo.id, parentKitId: kit.id, pecaName: peca.nome });
                });
              }
            });
          }
        });
      }
    }
  });
  return allGrupos;
};

// Helper function to optimize and split GrupoImpressao into ProductionGroup
// Helper function to optimize and split GrupoImpressao into ProductionGroup
// This function now takes the original groupId from the Pedido document to ensure ID consistency.
const optimizeAndSplitGruposImpressao = (
  newGrupos: { grupo: GrupoImpressao; parentPecaId?: string; parentModeloId?: string; parentKitId?: string; pecaName: string; }[],
  currentPedidoId: string,
  currentPedidoNumero: string,
  existingProductionGroups: ProductionGroup[]
): { newOrUpdatedGroups: ProductionGroup[]; groupsToDelete: string[] } => {
  const newOrUpdatedGroups: ProductionGroup[] = [];
  const consolidatedGroups = new Map<string, {
    items: { [parteId: string]: { parte: PecaParte; totalQuantidade: number; hasAssembly?: boolean; } };
    filamentos: { [filamentoId: string]: { filamento: PecaInsumo; totalQuantidade: number; } };
    outrosInsumos: { [insumoId: string]: { insumo: PecaInsumo; totalQuantidade: number; } };
    tempoImpressao: number;
    consumoFilamento: number;
    quantidadeMaxima: number;
    sourcePecaId: string;
    sourcePecaName: string;
    parentModeloId?: string;
    parentKitId?: string;
    originalGrupoImpressaoId: string; // Store the original GrupoImpressao ID
    pedidosOrigem: { pedidoId: string; pedidoNumero: string; groupId: string }[];
    existingDocIds: string[]; // To store IDs of existing ProductionGroups if consolidated
  }>();

  const updatedGroupIds = new Set<string>(); // Declare updatedGroupIds here
  const allExistingGroupIds = new Set<string>();

  // Process existing groups first to populate consolidatedGroups map
  existingProductionGroups.forEach(existingGroup => {
    allExistingGroupIds.add(existingGroup.id!); // Collect all existing IDs

    let consolidationKey: string;
    if (existingGroup.quantidadeMaxima === 1) {
      consolidationKey = `${existingGroup.sourceId}-${existingGroup.sourceGrupoImpressaoId}-${existingGroup.id}`;
    } else {
      const partsKey = Object.keys(existingGroup.partesNoGrupo).map(parteId => {
        const parte = existingGroup.partesNoGrupo[parteId];
        return `${parteId}:${parte.nome}`;
      }).sort().join('|');
      const filamentsKey = existingGroup.filamentosNecessarios.map(f => `${f.grupoFilamentoId || f.insumoId}:${f.nome}`).sort().join('|');
      const outrosInsumosKey = (existingGroup.outrosInsumosNecessarios || []).map(o => `${o.insumoId}:${o.nome}`).sort().join('|');
      consolidationKey = `${partsKey}-${filamentsKey}-${outrosInsumosKey}`;
    }

    if (!consolidatedGroups.has(consolidationKey)) {
      consolidatedGroups.set(consolidationKey, {
        items: {},
        filamentos: {},
        outrosInsumos: {},
        tempoImpressao: 0,
        consumoFilamento: 0,
        quantidadeMaxima: existingGroup.quantidadeMaxima || Infinity,
        sourcePecaId: existingGroup.sourceId,
        sourcePecaName: existingGroup.sourceName,
        parentModeloId: existingGroup.parentModeloId,
        parentKitId: existingGroup.parentKitId,
        originalGrupoImpressaoId: existingGroup.sourceGrupoImpressaoId || '',
        pedidosOrigem: [],
        existingDocIds: [], // Initialize as an empty array
      });
    }

    const consolidated = consolidatedGroups.get(consolidationKey)!;
    if (existingGroup.id) {
      consolidated.existingDocIds.push(existingGroup.id); // Add existing ID to the array
    }

    // Add existing group's parts, filaments, insumos, and origins
    Object.keys(existingGroup.partesNoGrupo).forEach(parteId => {
      const parte = existingGroup.partesNoGrupo[parteId];
      if (!consolidated.items[parteId]) {
          consolidated.items[parteId] = { parte: { parteId: parteId, nome: parte.nome || '', quantidade: 0, hasAssembly: parte.hasAssembly }, totalQuantidade: 0, hasAssembly: parte.hasAssembly };
      }
      consolidated.items[parteId].totalQuantidade += parte.quantidade;
    });
    existingGroup.filamentosNecessarios.forEach(fil => {
      const id = fil.grupoFilamentoId || fil.insumoId!;
      if (!consolidated.filamentos[id]) {
        consolidated.filamentos[id] = { filamento: fil, totalQuantidade: 0 };
      }
      consolidated.filamentos[id].totalQuantidade += fil.quantidade;
    });
    (existingGroup.outrosInsumosNecessarios || []).forEach(ins => {
      const id = ins.insumoId!;
      if (!consolidated.outrosInsumos[id]) {
        consolidated.outrosInsumos[id] = { insumo: ins, totalQuantidade: 0 };
      }
      consolidated.outrosInsumos[id].totalQuantidade += ins.quantidade;
    });
    consolidated.tempoImpressao += existingGroup.tempoImpressaoGrupo;
    consolidated.consumoFilamento += existingGroup.consumoFilamentoGrupo;
    consolidated.pedidosOrigem.push(...(existingGroup.pedidosOrigem || []));
  });

  // Separate new groups into single-unit and multi-unit for distinct processing
  const singleUnitNewGroups: typeof newGrupos = [];
  const multiUnitNewGroups: typeof newGrupos = [];

  newGrupos.forEach(newGrupoData => {
    if (newGrupoData.grupo.quantidadeMaxima === 1) {
      singleUnitNewGroups.push(newGrupoData);
    } else {
      multiUnitNewGroups.push(newGrupoData);
    }
  });

  // Process single-unit new groups directly
  singleUnitNewGroups.forEach(({ grupo, parentPecaId, parentModeloId, parentKitId, pecaName }) => {
    // For each unit requested in this single-unit group, create a separate production group
    for (let i = 0; i < grupo.partes[0].quantidade; i++) { // Assuming quantity is 1 for these groups, but iterating based on it for robustness
      const newProductionGroup: ProductionGroup = {
        id: undefined, // Let Firestore generate a new ID
        sourceId: parentPecaId || '',
        sourceType: 'peca',
        sourceName: pecaName,
        sourceGrupoImpressaoId: grupo.id,
        ...(parentModeloId && { parentModeloId: parentModeloId }),
        ...(parentKitId && { parentKitId: parentKitId }),
        partesNoGrupo: Object.values(grupo.partes).reduce((acc, parte) => {
          acc[parte.parteId] = {
            nome: parte.nome || '',
            quantidade: parte.quantidade, // Quantity is 1 for max_quantity=1 groups
            hasAssembly: parte.hasAssembly || false,
          };
          return acc;
        }, {} as { [parteId: string]: { nome: string; quantidade: number; hasAssembly?: boolean; } }),
        filamentosNecessarios: grupo.filamentos.map(fil => ({
          id: fil.grupoFilamentoId || fil.insumoId!,
          nome: fil.nome || '',
          ...fil,
          quantidade: fil.quantidade, // Quantity is original for max_quantity=1 groups
        })),
        outrosInsumosNecessarios: (grupo.outrosInsumos || []).map(ins => ({
          id: ins.insumoId!,
          nome: ins.nome || '',
          ...ins,
          quantidade: ins.quantidade, // Quantity is original for max_quantity=1 groups
        })),
        tempoImpressaoGrupo: grupo.tempoImpressao,
        consumoFilamentoGrupo: grupo.consumoFilamento,
        status: 'aguardando',
        quantidadeOriginalGrupo: grupo.partes[0].quantidade, // Should be 1
        quantidadeProduzirGrupo: grupo.partes[0].quantidade, // Should be 1
        quantidadeMaxima: 1, // Explicitly set to 1
        pedidoId: currentPedidoId,
        pedidoNumero: currentPedidoNumero,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        pedidosOrigem: [{ pedidoId: currentPedidoId, pedidoNumero: currentPedidoNumero, groupId: grupo.id }],
        totalPartsQuantity: grupo.partes[0].quantidade, // Should be 1
      };
      newOrUpdatedGroups.push(newProductionGroup);
    }
  });

  // Process multi-unit new groups and existing groups for consolidation
  multiUnitNewGroups.forEach(({ grupo, parentPecaId, parentModeloId, parentKitId, pecaName }) => {
    const partsKey = grupo.partes.map(p => `${p.parteId}:${p.nome || ''}`).sort().join('|');
    const filamentsKey = grupo.filamentos.map(f => `${f.grupoFilamentoId || f.insumoId}:${f.nome || ''}`).sort().join('|');
    const outrosInsumosKey = (grupo.outrosInsumos || []).map(o => `${o.insumoId}:${o.nome || ''}`).sort().join('|');
    const consolidationKey = `${partsKey}-${filamentsKey}-${outrosInsumosKey}`;

    if (!consolidatedGroups.has(consolidationKey)) {
      consolidatedGroups.set(consolidationKey, {
        items: {},
        filamentos: {},
        outrosInsumos: {},
        tempoImpressao: 0,
        consumoFilamento: 0,
        quantidadeMaxima: grupo.quantidadeMaxima || Infinity,
        sourcePecaId: parentPecaId || '',
        sourcePecaName: pecaName,
        parentModeloId: parentModeloId,
        parentKitId: parentKitId,
        originalGrupoImpressaoId: grupo.id,
        pedidosOrigem: [],
        existingDocIds: [], // Initialize existingDocIds for new entries
      });
    }

    const consolidated = consolidatedGroups.get(consolidationKey)!;

    // Add the current group's origin to the consolidated group's origins
    consolidated.pedidosOrigem.push({ pedidoId: currentPedidoId, pedidoNumero: currentPedidoNumero, groupId: grupo.id });

    // Aggregate parts
    grupo.partes.forEach(parte => {
      if (!consolidated.items[parte.parteId]) {
        consolidated.items[parte.parteId] = { parte, totalQuantidade: 0, hasAssembly: parte.hasAssembly };
      }
      consolidated.items[parte.parteId].totalQuantidade += parte.quantidade;
    });

    // Aggregate filaments
    grupo.filamentos.forEach(filamento => {
      const id = filamento.grupoFilamentoId || filamento.insumoId!;
      if (!consolidated.filamentos[id]) {
        consolidated.filamentos[id] = { filamento, totalQuantidade: 0 };
      }
      consolidated.filamentos[id].totalQuantidade += filamento.quantidade;
    });

    // Aggregate other insumos
    (grupo.outrosInsumos || []).forEach(insumo => {
      const id = insumo.insumoId!;
      if (!consolidated.outrosInsumos[id]) {
        consolidated.outrosInsumos[id] = { insumo, totalQuantidade: 0 };
      }
      consolidated.outrosInsumos[id].totalQuantidade += insumo.quantidade;
    });

    consolidated.tempoImpressao += grupo.tempoImpressao;
    consolidated.consumoFilamento += grupo.consumoFilamento;
    consolidated.quantidadeMaxima = Math.min(consolidated.quantidadeMaxima, grupo.quantidadeMaxima || Infinity);
  });

  // Finalize and split consolidated groups into new ProductionGroup documents
  consolidatedGroups.forEach((consolidated) => {
    const totalOriginalQuantity = Object.values(consolidated.items).reduce((sum, item) => sum + item.totalQuantidade, 0);
    let remainingQuantity = totalOriginalQuantity;
    let existingDocIdIndex = 0; // Keep track of which existing ID to use

    while (remainingQuantity > 0) {
      const quantityToProduce = Math.min(remainingQuantity, consolidated.quantidadeMaxima);

      const newProductionGroup: ProductionGroup = {
        id: consolidated.existingDocIds[existingDocIdIndex] || undefined, // Use existing ID or undefined
        sourceId: consolidated.sourcePecaId,
        sourceType: 'peca',
        sourceName: consolidated.sourcePecaName,
        sourceGrupoImpressaoId: consolidated.originalGrupoImpressaoId,
        ...(consolidated.parentModeloId && { parentModeloId: consolidated.parentModeloId }),
        ...(consolidated.parentKitId && { parentKitId: consolidated.parentKitId }),
        partesNoGrupo: Object.values(consolidated.items).reduce((acc, item) => {
          acc[item.parte.parteId] = {
            nome: item.parte.nome || '',
            quantidade: Math.ceil(item.totalQuantidade * (quantityToProduce / totalOriginalQuantity)),
            hasAssembly: item.hasAssembly || false,
          };
          return acc;
        }, {} as { [parteId: string]: { nome: string; quantidade: number; hasAssembly?: boolean; } }),
        filamentosNecessarios: Object.values(consolidated.filamentos).map(fil => ({
          id: fil.filamento.grupoFilamentoId || fil.filamento.insumoId!,
          nome: fil.filamento.nome || '',
          ...fil.filamento,
          quantidade: Math.ceil(fil.totalQuantidade * (quantityToProduce / totalOriginalQuantity)),
        })),
        outrosInsumosNecessarios: Object.values(consolidated.outrosInsumos).map(ins => ({
          id: ins.insumo.insumoId!,
          nome: ins.insumo.nome || '',
          ...ins.insumo,
          quantidade: Math.ceil(ins.totalQuantidade * (quantityToProduce / totalOriginalQuantity)),
        })),
        tempoImpressaoGrupo: consolidated.tempoImpressao * (quantityToProduce / totalOriginalQuantity),
        consumoFilamentoGrupo: consolidated.consumoFilamento * (quantityToProduce / totalOriginalQuantity),
        status: 'aguardando',
        quantidadeOriginalGrupo: totalOriginalQuantity,
        quantidadeProduzirGrupo: quantityToProduce,
        quantidadeMaxima: consolidated.quantidadeMaxima === Infinity ? undefined : consolidated.quantidadeMaxima,
        pedidoId: consolidated.pedidosOrigem[0]?.pedidoId || currentPedidoId,
        pedidoNumero: consolidated.pedidosOrigem[0]?.pedidoNumero || currentPedidoNumero,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        pedidosOrigem: consolidated.pedidosOrigem,
        totalPartsQuantity: quantityToProduce,
      };
      newOrUpdatedGroups.push(newProductionGroup);
      if (newProductionGroup.id) {
        updatedGroupIds.add(newProductionGroup.id);
      }
      remainingQuantity -= quantityToProduce;
      existingDocIdIndex++; // Move to the next existing ID for the next split group
    }
  });

  const groupsToDelete: string[] = Array.from(allExistingGroupIds).filter(id => !updatedGroupIds.has(id));

  return { newOrUpdatedGroups, groupsToDelete };
};


export const updateGrupoDeFilamento = onDocumentWritten("insumos/{insumoId}", async (event) => {
  const FUNCTION_VERSION = "1.0.2"; // Updated for deployment verification
  functions.logger.log(`[updateGrupoDeFilamento - START] (Version: ${FUNCTION_VERSION}) Triggered for insumoId: ${event.params.insumoId}`);
  functions.logger.log(`[updateGrupoDeFilamento - START] (Version: ${FUNCTION_VERSION}) Event type: ${event.data?.after.exists ? (event.data.before.exists ? 'update' : 'create') : 'delete'}`);

  const document = event.data?.after.exists ? event.data.after.data() : null;
  const oldDocument = event.data?.before.exists ? event.data.before.data() : null;

    const insumo = document || oldDocument;
    if (!insumo) {
      functions.logger.log(`[updateGrupoDeFilamento] Insumo document is null, likely deleted. Exiting.`);
      return;
    }
    if (insumo.tipo !== "filamento") {
      functions.logger.log(`[updateGrupoDeFilamento] Insumo ${event.params.insumoId} is not a filament, exiting.`);
      return;
    }

    const grupoFilamentoId = insumo.especificacoes?.grupoFilamentoId;
    if (!grupoFilamentoId) {
      functions.logger.log(
        `[updateGrupoDeFilamento] Insumo ${event.params.insumoId} does not have especificacoes.grupoFilamentoId. Exiting.`
      );
      return;
    }

    functions.logger.log(`[updateGrupoDeFilamento] Processing filament ${event.params.insumoId} for group ${grupoFilamentoId}.`);

    // Get all spools in the same group
    const insumosRef = db.collection("insumos");
    const spoolsSnapshot = await insumosRef
      .where("especificacoes.grupoFilamentoId", "==", grupoFilamentoId)
      .get();

    if (spoolsSnapshot.empty) {
      functions.logger.log(
        `[updateGrupoDeFilamento] No spools found for group ${grupoFilamentoId}, deleting the group.`
      );
      // If no spools are left, delete the group document
      await db.collection("gruposDeFilamento").doc(grupoFilamentoId).delete();
      return;
    }

    let totalGramas = 0;
    let custoTotal = 0;
    let totalConsumoProducao = 0;
    let totalConsumoReal = 0;
    const spoolsEmEstoqueIds: string[] = [];

    spoolsSnapshot.forEach((doc) => {
      const spool = doc.data();
      const estoqueDoSpool = spool.estoqueAtual || 0; // Use estoqueAtual directly

      if (estoqueDoSpool > 0) {
        totalGramas += estoqueDoSpool;
        custoTotal += (spool.custoPorUnidade || 0) * estoqueDoSpool;
        spoolsEmEstoqueIds.push(doc.id);
      }
      totalConsumoProducao += spool.consumoProducao || 0;
      totalConsumoReal += spool.consumoReal || 0;
    });

    const custoMedioPonderado = totalGramas > 0 ? custoTotal / totalGramas : 0;

    const grupoRef = db.collection("gruposDeFilamento").doc(grupoFilamentoId);

    functions.logger.log(
      `[updateGrupoDeFilamento] Updating group ${grupoFilamentoId}:`,
      `Custo Médio: ${custoMedioPonderado}`,
      `Estoque Total: ${totalGramas}`,
      `Spools em Estoque IDs: ${spoolsEmEstoqueIds}`,
      `Consumo Produção: ${totalConsumoProducao}`,
      `Consumo Real: ${totalConsumoReal}`
    );

    await grupoRef.set({
      custoMedioPonderado: custoMedioPonderado,
      estoqueTotalGramas: totalGramas,
      spoolsEmEstoqueIds: spoolsEmEstoqueIds,
      consumoProducao: totalConsumoProducao,
      consumoReal: totalConsumoReal,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });


// =================================================================================================
// NEW ARCHITECTURE FUNCTION - gestprodEstoqueManager
// =================================================================================================
export const processLancamentoProduto = onDocumentCreated({
    document: "lancamentosProdutos/{lancamentoId}",
    region: "us-central1",
}, async (event) => {
    const lancamentoId = event.params.lancamentoId;
    const lancamentoData = event.data?.data();

    functions.logger.log(`[${lancamentoId}] Starting stock update based on new architecture.`);
    functions.logger.log(`[${lancamentoId}] Type of lancamentoData.locais:`, typeof lancamentoData?.locais); // Debugging
    functions.logger.log(`[${lancamentoId}] Value of lancamentoData.locais:`, lancamentoData?.locais); // Debugging

    if (!lancamentoData) {
        functions.logger.error(`[${lancamentoId}] Document data is empty. Aborting.`);
        return;
    }

    const { produtoId, tipoProduto, tipoMovimento, locais, quantidade } = lancamentoData;

    functions.logger.log(`[${lancamentoId}] Debug: produtoId: ${produtoId}, tipoProduto: ${tipoProduto}, tipoMovimento: ${tipoMovimento}`);
    functions.logger.log(`[${lancamentoId}] Debug: locais (type: ${typeof locais}, value:`, locais, `), quantidade (type: ${typeof quantidade}, value: ${quantidade})`);

    // 1. Validate required fields
    if (!produtoId || !tipoProduto || !tipoMovimento) {
        functions.logger.error(`[${lancamentoId}] Invalid lancamento data: Missing core fields.`, {
            produtoId, tipoProduto, tipoMovimento,
        });
        return;
    }

    // Validate that either 'locais' or 'quantidade' is present
    const hasLocais = Array.isArray(locais) && locais.length > 0;
    const hasQuantidade = typeof quantidade === "number" && quantidade > 0;

    functions.logger.log(`[${lancamentoId}] Debug: hasLocais: ${hasLocais}, hasQuantidade: ${hasQuantidade}`);

    if (!hasLocais && !hasQuantidade) {
        functions.logger.error(`[${lancamentoId}] Invalid lancamento data: Must have either 'locais' or 'quantidade'.`, {
            produtoId, tipoProduto, tipoMovimento, locais, quantidade,
        });
        return;
    }

    const validTipoProduto = ["parte", "peca", "kit", "modelo"];
    if (!validTipoProduto.includes(tipoProduto)) {
        functions.logger.error(`[${lancamentoId}] Invalid tipoProduto: ${tipoProduto}.`);
        return;
    }

    try {
        await db.runTransaction(async (transaction) => {
            functions.logger.log(`[${lancamentoId}] Starting transaction for product ${produtoId}.`);

            // Check if product document exists before proceeding
            const produtoRef = db.doc(`/${tipoProduto}s/${produtoId}`);
            const produtoDoc = await transaction.get(produtoRef);
            if (!produtoDoc.exists) {
                throw new Error(`Product document with ID ${produtoId} in collection ${tipoProduto} does not exist.`);
            }

            let currentPosicoesEstoque = (produtoDoc.data()?.posicoesEstoque || []) as PosicaoEstoque[];
            functions.logger.log(`[${lancamentoId}] Current posicoesEstoque before update:`, currentPosicoesEstoque);

            if (hasLocais) {
                functions.logger.log(`[${lancamentoId}] Processing ${locais.length} local entries.`);
                for (const local of locais) {
                    if (!local.recipienteId || !local.quantidade || local.quantidade <= 0) {
                        functions.logger.warn(`[${lancamentoId}] Skipping invalid local entry:`, local);
                        continue;
                    }

                    const quantidadeMovimentada = tipoMovimento === 'saida' ? -local.quantidade : local.quantidade;
                    const divisaoString = local.divisao ? `${local.divisao.h}_${local.divisao.v}` : "default";
                    const posicaoId = `${local.recipienteId}_${divisaoString}`;

                    let existingPosicaoIndex = currentPosicoesEstoque.findIndex(
                        (pos) => pos.recipienteId === local.recipienteId &&
                                 ((!pos.divisao && !local.divisao) || // Both are null/undefined
                                  (pos.divisao && local.divisao && // Both exist and compare properties
                                   pos.divisao.h === local.divisao.h &&
                                   pos.divisao.v === local.divisao.v))
                    );

                    if (existingPosicaoIndex > -1) {
                        if (tipoMovimento === 'saida' && currentPosicoesEstoque[existingPosicaoIndex].quantidade < local.quantidade) {
                            throw new Error(`Not enough stock in position ${posicaoId}. Available: ${currentPosicoesEstoque[existingPosicaoIndex].quantidade}, Required: ${local.quantidade}`);
                        }
                        currentPosicoesEstoque[existingPosicaoIndex].quantidade += quantidadeMovimentada;
                    } else if (tipoMovimento === 'entrada') {
                        currentPosicoesEstoque.push({
                            recipienteId: local.recipienteId,
                            divisao: local.divisao,
                            quantidade: quantidadeMovimentada,
                        });
                    } else {
                        throw new Error(`Attempted to withdraw from non-existent stock position ${posicaoId}.`);
                    }
                }
            } else if (hasQuantidade) {
                if (tipoMovimento === 'saida') {
                    functions.logger.log(`[${lancamentoId}] Processing general quantity debit of ${quantidade}.`);
                    let quantidadeADebitar = quantidade;
                    const estoqueTotalDisponivel = currentPosicoesEstoque.reduce((acc, pos) => acc + pos.quantidade, 0);

                    if (estoqueTotalDisponivel < quantidadeADebitar) {
                        throw new Error(`Not enough total stock for product ${produtoId}. Available: ${estoqueTotalDisponivel}, Required: ${quantidadeADebitar}`);
                    }

                    // Debit from available positions
                    for (const pos of currentPosicoesEstoque) {
                        if (quantidadeADebitar <= 0) break;
                        const debitAmount = Math.min(pos.quantidade, quantidadeADebitar);
                        pos.quantidade -= debitAmount;
                        quantidadeADebitar -= debitAmount;
                    }
                } else { // 'entrada' or 'ajuste'
                    // This is an ambiguous operation. An entry must have a destination to maintain consistency.
                    throw new Error("Stock entry ('entrada' or 'ajuste') without specific 'locais' is not allowed to ensure data consistency.");
                }
            }

            // Filter out positions with quantity <= 0
            const finalPosicoesEstoque = currentPosicoesEstoque.filter(pos => pos.quantidade > 0);

            // Recalculate total stock from the sum of positions to ensure consistency
            const newEstoqueTotal = finalPosicoesEstoque.reduce((acc, pos) => acc + pos.quantidade, 0);

            functions.logger.log(`[${lancamentoId}] Updating product ${produtoId}. New total stock: ${newEstoqueTotal}.`);

            const updateData: { [key: string]: any } = {
                estoqueTotal: newEstoqueTotal,
                posicoesEstoque: finalPosicoesEstoque,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            transaction.update(produtoRef, updateData);
        });

        functions.logger.log(`[${lancamentoId}] Transaction for product ${produtoId} completed successfully.`);

    } catch (error) {
        functions.logger.error(`[${lancamentoId}] Transaction failed for product ${produtoId}:`, error);
    }
});

// =================================================================================================
// NEW ARCHITECTURE FUNCTION - processLancamentoProducao
// =================================================================================================
export const processLancamentoProducao = onDocumentCreated({
  document: "lancamentosProducao/{lancamentoId}",
  region: "us-central1",
}, async (event) => {
  const FUNCTION_VERSION = "1.0.0";
  const lancamentoId = event.params.lancamentoId;
  functions.logger.log(`[${lancamentoId}] TRIGGERED: processLancamentoProducao v${FUNCTION_VERSION}. Event ID: ${event.id}`);
  const lancamentoData = event.data?.data();

  if (!lancamentoData) {
    functions.logger.error(`[${lancamentoId}] Document data is empty. Aborting.`);
    return;
  }

  const { tipoEvento, payload, pedidoId, pedidoNumero } = lancamentoData;

  if (tipoEvento === 'criacao_pedido') {
    if (!payload || !Array.isArray(payload.produtos) || !pedidoId || !pedidoNumero) {
      functions.logger.error(`[${lancamentoId}] Invalid payload or missing pedidoId/pedidoNumero for criacao_pedido event.`);
      return;
    }

    try {
      // Fetch all necessary product definitions (Pecas, Modelos, Kits)
      const [pecasSnapshot, modelosSnapshot, kitsSnapshot] = await Promise.all([
        db.collection('pecas').get(),
        db.collection('modelos').get(),
        db.collection('kits').get(),
      ]);

      const allPecas = pecasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Peca[];
      const allModelos = modelosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Modelo[];
      const allKits = kitsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Kit[];

      // 1. Extract all GrupoImpressao instances from the payload
      const allGruposImpressao = extractAllGruposImpressao(payload.produtos, allPecas, allModelos, allKits);
      functions.logger.log(`[${lancamentoId}] Extracted ${allGruposImpressao.length} raw GrupoImpressao instances.`);

      // Fetch existing 'aguardando' production groups for potential aggregation
      const existingGroupsSnapshot = await db.collection('gruposProducaoOtimizados')
        .where('status', '==', 'aguardando')
        .get();
      const existingProductionGroups = existingGroupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProductionGroup[];
      functions.logger.log(`[${lancamentoId}] Found ${existingProductionGroups.length} existing 'aguardando' production groups.`);

      // 2. Optimize and split into ProductionGroup documents, considering existing groups
      const { newOrUpdatedGroups, groupsToDelete } = optimizeAndSplitGruposImpressao(
        allGruposImpressao,
        pedidoId,
        pedidoNumero,
        existingProductionGroups
      );
      functions.logger.log(`[${lancamentoId}] Generated ${newOrUpdatedGroups.length} new/updated ProductionGroup documents and ${groupsToDelete.length} groups to delete.`);

      // 3. Create/Update/Delete documents in gruposProducaoOtimizados collection
      const firestoreBatch = db.batch();
      const gruposProducaoOtimizadosRef = db.collection('gruposProducaoOtimizados');

      newOrUpdatedGroups.forEach(group => {
        if (group.id) {
          // If group has an ID, it's an update to an existing group
          firestoreBatch.set(gruposProducaoOtimizadosRef.doc(group.id), group, { merge: true });
        } else {
          // If group does not have an ID, it's a new group
          const docRef = gruposProducaoOtimizadosRef.doc();
          group.id = docRef.id;
          firestoreBatch.set(docRef, group);
        }
      });

      groupsToDelete.forEach(groupId => {
        firestoreBatch.delete(gruposProducaoOtimizadosRef.doc(groupId));
      });

      await firestoreBatch.commit();
      functions.logger.log(`[${lancamentoId}] Successfully processed production groups (created/updated: ${newOrUpdatedGroups.length}, deleted: ${groupsToDelete.length}).`);

    } catch (error) {
      functions.logger.error(`[${lancamentoId}] Error processing criacao_pedido event:`, error);
    }
  } else if (tipoEvento === 'iniciar_producao') {
    const { optimizedGroupId } = payload;

    if (!optimizedGroupId) {
      functions.logger.error(`[${lancamentoId}] Invalid payload for iniciar_producao event: Missing optimizedGroupId.`);
      return;
    }

    try {
      const groupRef = db.collection('gruposProducaoOtimizados').doc(optimizedGroupId);
      await groupRef.update({
        status: 'em_producao',
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      functions.logger.log(`[${lancamentoId}] Successfully updated production group ${optimizedGroupId} to 'em_producao'.`);
    } catch (error) {
      functions.logger.error(`[${lancamentoId}] Error updating production group status for ${optimizedGroupId}:`, error);
    }
  } else if (tipoEvento === 'conclusao_impressao') {
    const { optimizedGroupId, producedParts, pedidosOrigem, sourceName } = payload;

    if (!optimizedGroupId || !producedParts || !pedidosOrigem || !sourceName) {
      functions.logger.error(`[${lancamentoId}] Invalid payload for conclusao_impressao event: Missing required fields.`);
      return;
    }

    try {
      const batch = db.batch();

      // 1. Atualizar o status do OptimizedGroup para 'produzido'
      const optimizedGroupRef = db.collection('gruposProducaoOtimizados').doc(optimizedGroupId);
      batch.update(optimizedGroupRef, {
        status: 'produzido',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      functions.logger.log(`[${lancamentoId}] OptimizedGroup ${optimizedGroupId} status updated to 'produzido'.`);

      // Fetch all pecas to determine tipoPeca for status updates
      const pecasSnapshot = await db.collection('pecas').get();
      const allPecas = pecasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Peca[];

      // 2. Iterar sobre os pedidos de origem e atualizar os status
      for (const origem of pedidosOrigem) {
        const pedidoRef = db.collection('pedidos').doc(origem.pedidoId);
        const pedidoDoc = await pedidoRef.get();

        if (!pedidoDoc.exists) {
          functions.logger.warn(`[${lancamentoId}] Pedido ${origem.pedidoId} não encontrado para atualização.`);
          continue;
        }

        const pedidoData = pedidoDoc.data() as Pedido;
        let updatedProdutosPromises = pedidoData.produtos.map(async (produto) => { // Made the map callback async
          if (produto.gruposImpressaoProducao) {
            const updatedGruposImpressaoProducao = produto.gruposImpressaoProducao.map(originalGroup => {
              if (originalGroup.id === origem.groupId) {
                return {
                  ...originalGroup,
                  status: 'produzido', // Marcar grupo original como produzido
                  completedAt: admin.firestore.FieldValue.serverTimestamp(),
                };
              }
              return originalGroup;
            });

            // Recalcular statusProducaoItem para este produto
            const allGroupsProducedForThisProduct = updatedGruposImpressaoProducao.every(g => g.status === 'produzido');
            if (allGroupsProducedForThisProduct) {
              const peca = allPecas.find(p => p.id === produto.produtoId);
              let nextStatusForProduct: Pedido['produtos'][number]['statusProducaoItem'] = 'pronto_para_embalagem';

              // Check if any part in the original production group requires assembly
              const originalOptimizedGroup = await optimizedGroupRef.get();
              const originalOptimizedGroupData = originalOptimizedGroup.data() as ProductionGroup;
              const hasAssemblyParts = Object.values(originalOptimizedGroupData.partesNoGrupo).some(p => p.hasAssembly);

              if (peca?.tipoPeca === 'composta_um_grupo_com_montagem' || peca?.tipoPeca === 'composta_multiplos_grupos' || hasAssemblyParts) {
                nextStatusForProduct = 'em_montagem_pecas';
              }
              // Lógica para excedente destinado à montagem
              interface ProducedPart {
                parteId: string;
                quantidadeProduzida: number;
                destinoExcedente?: 'montagem' | 'estoque';
              }
              const partesExcedentesParaMontagem = (producedParts as ProducedPart[]).filter(
                (p: ProducedPart) => p.destinoExcedente === 'montagem' && p.parteId in originalOptimizedGroupData.partesNoGrupo
              );

              if (partesExcedentesParaMontagem.length > 0) {
                let currentAtendimentoEstoqueDetalhado = produto.atendimentoEstoqueDetalhado || {};
                let currentPartesAtendidas = currentAtendimentoEstoqueDetalhado.partesAtendidas || [];

                for (const excedenteParte of partesExcedentesParaMontagem) {
                  const parteInfo = originalOptimizedGroupData.partesNoGrupo[excedenteParte.parteId];
                  const expectedQuantity = parteInfo.quantidade;
                  const excessQuantity = excedenteParte.quantidadeProduzida - expectedQuantity;

                  if (excessQuantity > 0) {
                    const existingEntryIndex = currentPartesAtendidas.findIndex(
                      (item: { parteId: string; }) => item.parteId === excedenteParte.parteId
                    );

                    if (existingEntryIndex > -1) {
                      currentPartesAtendidas[existingEntryIndex].quantidade += excessQuantity;
                    } else {
                      currentPartesAtendidas.push({ parteId: excedenteParte.parteId, quantidade: excessQuantity });
                    }
                  }
                }
                currentAtendimentoEstoqueDetalhado = {
                  ...currentAtendimentoEstoqueDetalhado,
                  partesAtendidas: currentPartesAtendidas,
                };
                return { ...produto, gruposImpressaoProducao: updatedGruposImpressaoProducao, statusProducaoItem: nextStatusForProduct, atendimentoEstoqueDetalhado: currentAtendimentoEstoqueDetalhado };
              }

              return { ...produto, gruposImpressaoProducao: updatedGruposImpressaoProducao, statusProducaoItem: nextStatusForProduct }; // Retorno final do map
            }
            return { ...produto, gruposImpressaoProducao: updatedGruposImpressaoProducao };
          }
          return produto;
        });

        let updatedProdutos = await Promise.all(updatedProdutosPromises);

        // Recalcular status geral do pedido
        let newPedidoStatus = pedidoData.status;
        const allProductsDone = updatedProdutos.every(p => p.statusProducaoItem === 'concluido' || p.statusProducaoItem === 'pronto_para_embalagem');
        if (allProductsDone) {
          newPedidoStatus = 'processando_embalagem';
        } else {
          const anyInProduction = updatedProdutos.some(p =>
            p.statusProducaoItem === 'em_producao' ||
            p.statusProducaoItem === 'em_montagem_pecas' ||
            p.statusProducaoItem === 'em_montagem_modelos' ||
            p.gruposImpressaoProducao?.some(g => g.status === 'em_producao')
          );
          if (anyInProduction) {
            newPedidoStatus = 'em_producao';
          }
        }

        batch.update(pedidoRef, { produtos: updatedProdutos, status: newPedidoStatus });
      }

      await batch.commit();
      functions.logger.log(`[${lancamentoId}] Successfully processed conclusao_impressao event for optimized group ${optimizedGroupId}.`);

    } catch (error) {
      functions.logger.error(`[${lancamentoId}] Error processing conclusao_impressao event for optimized group ${optimizedGroupId}:`, error);
    }
  } else {
    functions.logger.log(`[${lancamentoId}] Event type is not 'criacao_pedido', 'iniciar_producao', or 'conclusao_impressao'. Skipping.`);
    return;
  }
});

// =================================================================================================
// NEW ARCHITECTURE FUNCTION - processLancamentoInsumo
// =================================================================================================
export const processLancamentoInsumo = onDocumentCreated({
    document: "lancamentosInsumos/{lancamentoId}",
    region: "us-central1",
}, async (event) => {
    const FUNCTION_VERSION = "2.2.0"; // Incremented version for tracking
    const lancamentoId = event.params.lancamentoId;
    functions.logger.log(`[${lancamentoId}] TRIGGERED: processLancamentoInsumo v${FUNCTION_VERSION}. Event ID: ${event.id}`);
    const lancamentoData = event.data?.data();

    functions.logger.log(`[${lancamentoId}] Starting insumo stock update (Version: ${FUNCTION_VERSION}).`);
    functions.logger.log(`[${lancamentoId}] Received data:`, JSON.stringify(lancamentoData, null, 2));

    if (!lancamentoData) {
        functions.logger.error(`[${lancamentoId}] Document data is empty. Aborting.`);
        return;
    }

    const { insumoId, tipoInsumo, tipoMovimento, locais } = lancamentoData; // Destructure 'locais'

    if (!insumoId || !tipoInsumo || !tipoMovimento || !Array.isArray(locais)) {
        functions.logger.error(`[${lancamentoId}] Invalid lancamento data: Missing required fields or 'locais' is not an array.`);
        return;
    }

    const insumoRef = db.collection("insumos").doc(insumoId);

    try {
        if (tipoInsumo === "filamento") {
            // Manter a lógica antiga para filamentos
            await db.runTransaction(async (transaction) => {
                const insumoDoc = await transaction.get(insumoRef);
                if (!insumoDoc.exists) throw new Error(`Filament spool ${insumoId} not found.`);
                
                const currentData = insumoDoc.data();
                let newEstoque = currentData?.estoqueAtual || 0;
                // For filaments, 'quantidade' is expected directly in lancamentoData
                const quantidade = lancamentoData.quantidade || 0; 

                if (tipoMovimento === "saida") newEstoque -= quantidade;
                else if (tipoMovimento === "entrada") newEstoque += quantidade;
                else if (tipoMovimento === "ajuste") newEstoque = quantidade;

                transaction.update(insumoRef, {
                    estoqueAtual: newEstoque,
                    operacoes: admin.firestore.FieldValue.arrayUnion(lancamentoId),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            });
            functions.logger.log(`[${lancamentoId}] Legacy filament logic completed for ${insumoId}.`);

        } else {
            // Logic for other insumo types (materials, packaging, etc.)
            functions.logger.log(`[${lancamentoId}] Applying stock logic for non-filament insumo ${insumoId}.`);
            
            await db.runTransaction(async (transaction) => {
                const insumoDoc = await transaction.get(insumoRef);
                if (!insumoDoc.exists) {
                    throw new Error(`Insumo document ${insumoId} not found.`);
                }

                let currentPosicoesEstoque = (insumoDoc.data()?.posicoesEstoque || []) as PosicaoEstoque[];
                functions.logger.log(`[${lancamentoId}] Current posicoesEstoque before update:`, currentPosicoesEstoque);

                // Collect all localInsumo documents first (READS)
                const localInsumoRefs = new Map<string, admin.firestore.DocumentReference>();
                const localInsumoDataMap = new Map<string, admin.firestore.DocumentData>();

                for (const local of locais) {
                    if (!local.localId || !local.quantidade || local.quantidade <= 0) {
                        functions.logger.warn(`[${lancamentoId}] Skipping invalid local entry:`, local);
                        continue;
                    }
                    const ref = db.collection("locaisInsumos").doc(local.localId);
                    localInsumoRefs.set(local.localId, ref);
                    const doc = await transaction.get(ref);
                    if (!doc.exists) {
                        functions.logger.warn(`[${lancamentoId}] Local de insumo ${local.localId} not found. Skipping update for this local.`);
                        continue;
                    }
                    localInsumoDataMap.set(local.localId, doc.data()!); // Use non-null assertion as doc.exists is checked
                }

                // Process stock changes for insumo
                for (const local of locais) {
                    if (!local.localId || !local.quantidade || local.quantidade <= 0) {
                        continue;
                    }

                    let quantidadeMovimentada = 0;
                    if (tipoMovimento === 'saida') {
                        quantidadeMovimentada = -local.quantidade;
                    } else if (tipoMovimento === 'entrada') {
                        quantidadeMovimentada = local.quantidade;
                    } else if (tipoMovimento === 'ajuste') {
                        const existingPos = currentPosicoesEstoque.find(
                            (pos) => pos.localId === local.localId &&
                                     pos.recipienteId === local.recipienteId &&
                                     ((!pos.divisao && !local.divisao) ||
                                      (pos.divisao && local.divisao &&
                                       pos.divisao.h === local.divisao.h &&
                                       pos.divisao.v === local.divisao.v))
                        );
                        const currentPosQuantity = existingPos ? existingPos.quantidade : 0;
                        quantidadeMovimentada = local.quantidade - currentPosQuantity;
                    } else {
                        continue;
                    }

                    let existingPosicaoIndex = currentPosicoesEstoque.findIndex(
                        (pos) => {
                            const matchLocal = pos.localId === local.localId;
                            const matchRecipiente = pos.recipienteId === local.recipienteId;
                            const matchDivisao = (
                                (!pos.divisao && !local.divisao) ||
                                (pos.divisao && local.divisao &&
                                 pos.divisao.h === local.divisao.h &&
                                 pos.divisao.v === local.divisao.v)
                            );
                            return matchLocal && matchRecipiente && matchDivisao;
                        }
                    );

                    if (existingPosicaoIndex > -1) {
                        currentPosicoesEstoque[existingPosicaoIndex].quantidade += quantidadeMovimentada;
                    } else {
                        currentPosicoesEstoque.push({
                            localId: local.localId,
                            recipienteId: local.recipienteId,
                            divisao: local.divisao,
                            quantidade: quantidadeMovimentada,
                        });
                    }
                }

                currentPosicoesEstoque = currentPosicoesEstoque.filter(pos => pos.quantidade > 0);
                const newEstoqueAtual = currentPosicoesEstoque.reduce((sum, pos) => sum + pos.quantidade, 0);

                // Perform all writes after all reads
                transaction.update(insumoRef, {
                    estoqueAtual: newEstoqueAtual,
                    posicoesEstoque: currentPosicoesEstoque,
                    operacoes: admin.firestore.FieldValue.arrayUnion(lancamentoId),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                for (const local of locais) {
                    if (!local.localId || !local.quantidade || local.quantidade <= 0) {
                        continue;
                    }
                    const localInsumoRef = localInsumoRefs.get(local.localId);
                    const localInsumoData = localInsumoDataMap.get(local.localId);

                    if (!localInsumoRef || !localInsumoData) {
                        continue;
                    }
                    const tipoLocal = localInsumoData.tipo;

                    if (tipoLocal === 'armario' || tipoLocal === 'prateleira') {
                        transaction.update(localInsumoRef, {
                            ocupantes: admin.firestore.FieldValue.arrayUnion({
                                recipienteId: local.recipienteId,
                                divisao: local.divisao,
                                insumoId: insumoId,
                                quantidade: local.quantidade,
                            }),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    } else {
                        transaction.update(localInsumoRef, {
                            ocupantes: [{
                                recipienteId: local.recipienteId,
                                divisao: local.divisao,
                                insumoId: insumoId,
                                quantidade: local.quantidade,
                            }],
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    }
                }
            });
            functions.logger.log(`[${lancamentoId}] Stock updated for insumo ${insumoId}.`);
        }
    } catch (error) {
        functions.logger.error(`[${lancamentoId}] Transaction failed for insumo ${insumoId}:`, error);
    }
});

// =================================================================================================
// NEW ARCHITECTURE FUNCTION - processarLancamentoServico
// =================================================================================================
export const processarLancamentoServico = onDocumentCreated({
    document: "lancamentosServicos/{lancamentoId}",
    region: "us-central1",
}, async (event) => {
    const FUNCTION_VERSION = "1.0.0";
    const lancamentoId = event.params.lancamentoId;
    const lancamento = event.data?.data() as LancamentoServico;

    functions.logger.log(`[${lancamentoId}] TRIGGERED: processarLancamentoServico v${FUNCTION_VERSION}.`);

    if (!lancamento) {
        functions.logger.error(`[${lancamentoId}] Document data is empty. Aborting.`);
        return;
    }

    const { servicoId, quantidade, data } = lancamento;

    if (!servicoId || !quantidade || !data) {
        functions.logger.error(`[${lancamentoId}] Invalid lancamento data: Missing servicoId, quantidade, or data.`);
        return;
    }

    try {
        // 1. Get service cost
        const servicoRef = db.collection("servicos").doc(servicoId);
        const servicoDoc = await servicoRef.get();
        if (!servicoDoc.exists) {
            functions.logger.error(`[${lancamentoId}] Service with ID ${servicoId} not found.`);
            return;
        }
        const servico = servicoDoc.data() as Servico;
        const custoTotalLancamento = servico.custoPorUnidade * quantidade;

        // 2. Prepare date formats
        const date = data.toDate();
        const reportId = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
        const dayKey = String(date.getDate()).padStart(2, '0'); // DD
        const weekKey = `${date.getFullYear()}-${getWeek(date, { weekStartsOn: 1 })}`; // YYYY-WW

        // 3. Run transaction
        const reportRef = db.collection("relatoriosServicos").doc(reportId);

        await db.runTransaction(async (transaction) => {
            const reportDoc = await transaction.get(reportRef);

            if (reportDoc.exists) {
                const processedIds = reportDoc.data()?.lancamentosProcessadosIds || [];
                if (processedIds.includes(lancamentoId)) {
                    functions.logger.warn(`[${lancamentoId}] Lancamento already processed. Skipping.`);
                    return;
                }
            }

            // Use dot notation for nested field updates
            const dailyQtyPath = `resumoDiario.${dayKey}.${servicoId}.totalQuantidade`;
            const dailyCostPath = `resumoDiario.${dayKey}.${servicoId}.totalCusto`;
            const weeklyQtyPath = `resumoSemanal.${weekKey}.${servicoId}.totalQuantidade`;
            const weeklyCostPath = `resumoSemanal.${weekKey}.${servicoId}.totalCusto`;
            const monthlyQtyPath = `resumoMensal.${servicoId}.totalQuantidade`;
            const monthlyCostPath = `resumoMensal.${servicoId}.totalCusto`;

            const updateData = {
                [dailyQtyPath]: admin.firestore.FieldValue.increment(quantidade),
                [dailyCostPath]: admin.firestore.FieldValue.increment(custoTotalLancamento),
                [weeklyQtyPath]: admin.firestore.FieldValue.increment(quantidade),
                [weeklyCostPath]: admin.firestore.FieldValue.increment(custoTotalLancamento),
                [monthlyQtyPath]: admin.firestore.FieldValue.increment(quantidade),
                [monthlyCostPath]: admin.firestore.FieldValue.increment(custoTotalLancamento),
                lancamentosProcessadosIds: admin.firestore.FieldValue.arrayUnion(lancamentoId),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                id: reportId, // Ensure the ID is set
            };

            transaction.set(reportRef, updateData, { merge: true });
        });

        functions.logger.log(`[${lancamentoId}] Successfully processed service launch and updated report ${reportId}.`);

    } catch (error) {
        functions.logger.error(`[${lancamentoId}] Error processing service launch:`, error);
    }
});
