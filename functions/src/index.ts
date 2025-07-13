import {onDocumentWritten, onDocumentCreated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { PosicaoEstoque } from "../../src/app/types"; // Import PosicaoEstoque

admin.initializeApp();
const db = admin.firestore();

export const updateGrupoDeFilamento = onDocumentWritten("insumos/{insumoId}", async (event) => {
  // Get an object with the current document value.
  // If the document does not exist, it has been deleted.
  const document = event.data?.after.exists ? event.data.after.data() : null;
  // Get an object with the previous document value (for update/delete cases)
  const oldDocument = event.data?.before.exists ? event.data.before.data() : null;

    const insumo = document || oldDocument;
    if (!insumo || insumo.tipo !== "filamento") {
      functions.logger.log("Insumo não é um filamento, saindo.");
      return;
    }

    const grupoFilamentoId = insumo.grupoFilamentoId;
    if (!grupoFilamentoId) {
      functions.logger.log(
        `Insumo ${event.params.insumoId} não possui grupoFilamentoId.`
      );
      return;
    }

    // Get all spools in the same group
    const insumosRef = db.collection("insumos");
    const spoolsSnapshot = await insumosRef
      .where("grupoFilamentoId", "==", grupoFilamentoId)
      .get();

    if (spoolsSnapshot.empty) {
      functions.logger.log(
        `Nenhum spool encontrado para o grupo ${grupoFilamentoId}, deletando o grupo.`
      );
      // If no spools are left, delete the group document
      await db.collection("gruposDeFilamento").doc(grupoFilamentoId).delete();
      return;
    }

    let totalGramas = 0;
    let custoTotal = 0;
    const spoolsEmEstoqueIds: string[] = [];

    spoolsSnapshot.forEach((doc) => {
      const spool = doc.data();
      // Priorize estoqueAtual se ele existir, caso contrário, use posicoesEstoque
      const estoqueDoSpool = (spool.estoqueAtual !== undefined && spool.estoqueAtual !== null)
        ? spool.estoqueAtual
        : spool.posicoesEstoque?.reduce(
            (acc: number, pos: { quantidade: number }) => acc + (pos.quantidade || 0),
            0
          ) || 0;

      if (estoqueDoSpool > 0) {
        totalGramas += estoqueDoSpool;
        custoTotal += (spool.custoPorUnidade || 0) * estoqueDoSpool;
        spoolsEmEstoqueIds.push(doc.id);
      }
    });

    const custoMedioPonderado = totalGramas > 0 ? custoTotal / totalGramas : 0;

    const grupoRef = db.collection("gruposDeFilamento").doc(grupoFilamentoId);

    functions.logger.log(
      `Atualizando grupo ${grupoFilamentoId}:`,
      `Custo Médio: ${custoMedioPonderado}`,
      `Estoque Total: ${totalGramas}`,
      `Spools em Estoque IDs: ${spoolsEmEstoqueIds}`
    );

    await grupoRef.set({
      custoMedioPonderado: custoMedioPonderado,
      estoqueTotalGramas: totalGramas,
      spoolsEmEstoqueIds: spoolsEmEstoqueIds,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });


// =================================================================================================
// NEW ARCHITECTURE FUNCTION - gestprodEstoqueManager
// =================================================================================================
export const gestprodEstoqueManager = onDocumentCreated({
    document: "lancamentosEstoque/{lancamentoId}",
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

    const validTipoProduto = ["partes", "pecas", "kits", "modelos"];
    if (!validTipoProduto.includes(tipoProduto)) {
        functions.logger.error(`[${lancamentoId}] Invalid tipoProduto: ${tipoProduto}.`);
        return;
    }

    let mudancaTotal = 0;

    try {
        await db.runTransaction(async (transaction) => {
            functions.logger.log(`[${lancamentoId}] Starting transaction for product ${produtoId}.`);

            // Check if product document exists before proceeding
            const produtoRef = db.doc(`/${tipoProduto}/${produtoId}`);
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
