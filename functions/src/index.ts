import {onDocumentWritten, onDocumentCreated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { PosicaoEstoque } from "../../src/app/types"; // Import PosicaoEstoque

admin.initializeApp();
const db = admin.firestore();

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

    const grupoFilamentoId = insumo.grupoFilamentoId;
    if (!grupoFilamentoId) {
      functions.logger.log(
        `[updateGrupoDeFilamento] Insumo ${event.params.insumoId} does not have grupoFilamentoId. Exiting.`
      );
      return;
    }

    functions.logger.log(`[updateGrupoDeFilamento] Processing filament ${event.params.insumoId} for group ${grupoFilamentoId}.`);

    // Get all spools in the same group
    const insumosRef = db.collection("insumos");
    const spoolsSnapshot = await insumosRef
      .where("grupoFilamentoId", "==", grupoFilamentoId)
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

    const { produtoId, tipoProduto, tipoMovimento, locais } = lancamentoData;

    // 1. Validate required fields
    if (!produtoId || !tipoProduto || !tipoMovimento || !Array.isArray(locais) || locais.length === 0) {
        functions.logger.error(`[${lancamentoId}] Invalid lancamento data: Missing or invalid required fields.`, {
            produtoId, tipoProduto, tipoMovimento, locais,
        });
        return;
    }

    const validTipoProduto = ["parte", "peca", "kit", "modelo"];
    if (!validTipoProduto.includes(tipoProduto)) {
        functions.logger.error(`[${lancamentoId}] Invalid tipoProduto: ${tipoProduto}.`);
        return;
    }

    let mudancaTotal = 0;

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

            for (const local of locais) {
                functions.logger.log(`[${lancamentoId}] Processing local:`, local);
                if (!local.recipienteId || !local.quantidade || local.quantidade <= 0) {
                    functions.logger.warn(`[${lancamentoId}] Skipping invalid local entry:`, local);
                    continue; // Skip to the next local
                }

                const quantidadeMovimentada = tipoMovimento === 'saida' ? -local.quantidade : local.quantidade;
                functions.logger.log(`[${lancamentoId}] Quantidade movimentada for this local: ${quantidadeMovimentada}.`);
                mudancaTotal += quantidadeMovimentada;
                functions.logger.log(`[${lancamentoId}] Current mudancaTotal after this local: ${mudancaTotal}.`);

                // Create a unique ID for the position based on recipient and division
                const divisaoString = local.divisao ? `${local.divisao.h}_${local.divisao.v}` : "default";
                const posicaoId = `${local.recipienteId}_${divisaoString}`;

                functions.logger.log(`[${lancamentoId}] Searching for existing position for recipientId: ${local.recipienteId}, divisao:`, local.divisao);

                let existingPosicaoIndex = currentPosicoesEstoque.findIndex(
                    (pos) => {
                        const matchRecipiente = pos.recipienteId === local.recipienteId;
                        const matchDivisao = (
                            (!pos.divisao && !local.divisao) ||
                            (pos.divisao && local.divisao &&
                             pos.divisao.h === local.divisao.h &&
                             pos.divisao.v === local.divisao.v)
                        );
                        functions.logger.log(`[${lancamentoId}] Comparing with existing pos:`, pos, `Match Recipiente: ${matchRecipiente}, Match Divisao: ${matchDivisao}`);
                        return matchRecipiente && matchDivisao;
                    }
                );

                functions.logger.log(`[${lancamentoId}] existingPosicaoIndex found: ${existingPosicaoIndex}`);

                if (existingPosicaoIndex > -1) {
                    // Update existing position
                    currentPosicoesEstoque[existingPosicaoIndex].quantidade += quantidadeMovimentada;
                    functions.logger.log(`[${lancamentoId}] Updated existing position ${posicaoId}. New quantity: ${currentPosicoesEstoque[existingPosicaoIndex].quantidade}`);
                } else {
                    // Add new position
                    currentPosicoesEstoque.push({
                        recipienteId: local.recipienteId,
                        divisao: local.divisao,
                        quantidade: quantidadeMovimentada,
                    });
                    functions.logger.log(`[${lancamentoId}] Added new position ${posicaoId}. Quantity: ${quantidadeMovimentada}`);
                }
            }

            // Filter out positions with quantity <= 0
            currentPosicoesEstoque = currentPosicoesEstoque.filter(pos => pos.quantidade > 0);
            functions.logger.log(`[${lancamentoId}] Final posicoesEstoque:`, currentPosicoesEstoque);

            // Update the total stock and posicoesEstoque on the main product document
            functions.logger.log(`[${lancamentoId}] Updating total stock for product ${produtoId} by ${mudancaTotal}.`);
            transaction.update(produtoRef, {
                estoqueTotal: admin.firestore.FieldValue.increment(mudancaTotal),
                posicoesEstoque: currentPosicoesEstoque, // Update the array directly
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });

        functions.logger.log(`[${lancamentoId}] Transaction for product ${produtoId} completed successfully.`);

    } catch (error) {
        functions.logger.error(`[${lancamentoId}] Transaction failed for product ${produtoId}:`, error);
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
