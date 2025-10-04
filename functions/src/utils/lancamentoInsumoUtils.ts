import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { 
    PosicaoEstoque 
} from "../../../src/app/types";

export async function processLancamentoInsumoUtil(event: any) {
    const FUNCTION_VERSION = "2.2.0";
    const db = admin.firestore();
    const lancamentoId = event.params.lancamentoId;

    functions.logger.log(`[${lancamentoId}] TRIGGERED: processLancamentoInsumo v${FUNCTION_VERSION}. Event ID: ${event.id}`);
    const lancamentoData = event.data?.data();

    if (!lancamentoData) {
        functions.logger.error(`[${lancamentoId}] Document data is empty. Aborting.`);
        return;
    }

    const { insumoId, tipoInsumo, tipoMovimento, locais } = lancamentoData;

    if (!insumoId || !tipoInsumo || !tipoMovimento || !Array.isArray(locais)) {
        functions.logger.error(`[${lancamentoId}] Invalid lancamento data: Missing required fields or 'locais' is not an array.`);
        return;
    }

    const insumoRef = db.collection("insumos").doc(insumoId);

    try {
        if (tipoInsumo === "filamento") {
            await db.runTransaction(async (transaction) => {
                const insumoDoc = await transaction.get(insumoRef);
                if (!insumoDoc.exists) throw new Error(`Filament spool ${insumoId} not found.`);
                
                const currentData = insumoDoc.data();
                let newEstoque = currentData?.estoqueAtual || 0;
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
        } else {
            await db.runTransaction(async (transaction) => {
                const insumoDoc = await transaction.get(insumoRef);
                if (!insumoDoc.exists) {
                    throw new Error(`Insumo document ${insumoId} not found.`);
                }

                let currentPosicoesEstoque = (insumoDoc.data()?.posicoesEstoque || []) as PosicaoEstoque[];

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
                    localInsumoDataMap.set(local.localId, doc.data()!);
                }

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
        }
    } catch (error) {
        functions.logger.error(`[${lancamentoId}] Transaction failed for insumo ${insumoId}:`, error);
    }
}
