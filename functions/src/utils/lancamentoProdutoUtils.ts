import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { 
    PosicaoEstoque 
} from "../../../src/app/types";

export async function processLancamentoProdutoUtil(event: any) {
    const FUNCTION_VERSION = "2.2.0";
    const db = admin.firestore();
    const lancamentoId = event.params.lancamentoId;

    functions.logger.log(`[${lancamentoId}] TRIGGERED: processLancamentoProduto v${FUNCTION_VERSION}. Event ID: ${event.id}`);
    const lancamentoData = event.data?.data();

    if (!lancamentoData) {
        functions.logger.error(`[${lancamentoId}] Document data is empty. Aborting.`);
        return;
    }

    const { produtoId, tipoProduto, tipoMovimento, locais, quantidade } = lancamentoData;

    if (!produtoId || !tipoProduto || !tipoMovimento) {
        functions.logger.error(`[${lancamentoId}] Invalid lancamento data: Missing core fields.`, {
            produtoId, tipoProduto, tipoMovimento,
        });
        return;
    }

    const hasLocais = Array.isArray(locais) && locais.length > 0;
    const hasQuantidade = typeof quantidade === "number" && quantidade > 0;

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
            const produtoRef = db.doc(`/${tipoProduto}s/${produtoId}`);
            const produtoDoc = await transaction.get(produtoRef);
            if (!produtoDoc.exists) {
                throw new Error(`Product document with ID ${produtoId} in collection ${tipoProduto} does not exist.`);
            }

            let currentPosicoesEstoque = (produtoDoc.data()?.posicoesEstoque || []) as PosicaoEstoque[];

            if (hasLocais) {
                for (const local of locais) {
                    if (!local.recipienteId || !local.quantidade || local.quantidade <= 0) {
                        functions.logger.warn(`[${lancamentoId}] Skipping invalid local entry:`, local);
                        continue;
                    }

                    const quantidadeMovimentada = tipoMovimento === 'saida' ? -local.quantidade : local.quantidade;
                    const divisaoString = local.divisao ? `${local.divisao.h}_${local.divisao.v}` : '';
                    const posicaoId = local.divisao ? `${local.localId}_${divisaoString}` : local.localId;

                    let existingPosicaoIndex = currentPosicoesEstoque.findIndex(
                        (pos) => pos.localId === local.localId &&
                                 pos.recipienteId === local.recipienteId &&
                                 ((!pos.divisao && !local.divisao) ||
                                  (pos.divisao && local.divisao &&
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
                            localId: local.localId,
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
                    let quantidadeADebitar = quantidade;
                    const estoqueTotalDisponivel = currentPosicoesEstoque.reduce((acc, pos) => acc + pos.quantidade, 0);

                    if (estoqueTotalDisponivel < quantidadeADebitar) {
                        throw new Error(`Not enough total stock for product ${produtoId}. Available: ${estoqueTotalDisponivel}, Required: ${quantidadeADebitar}`);
                    }

                    for (const pos of currentPosicoesEstoque) {
                        if (quantidadeADebitar <= 0) break;
                        const debitAmount = Math.min(pos.quantidade, quantidadeADebitar);
                        pos.quantidade -= debitAmount;
                        quantidadeADebitar -= debitAmount;
                    }
                } else {
                    throw new Error("Stock entry ('entrada' or 'ajuste') without specific 'locais' is not allowed to ensure data consistency.");
                }
            }

            currentPosicoesEstoque = currentPosicoesEstoque.filter(pos => pos.quantidade > 0);
            const newEstoqueTotal = currentPosicoesEstoque.reduce((acc, pos) => acc + pos.quantidade, 0);

            const updateData: { [key: string]: any } = {
                estoqueTotal: newEstoqueTotal,
                posicoesEstoque: currentPosicoesEstoque,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            transaction.update(produtoRef, updateData);
        });
    } catch (error) {
        functions.logger.error(`[${lancamentoId}] Transaction failed for product ${produtoId}:`, error);
    }
}
// Force redeploy
