import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { 
    PosicaoEstoque,
    FilamentSpool,
    NotificacaoFrontend
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
                const grupoFilamentoId = insumoId; // insumoId is actually grupoFilamentoId for filaments
                let quantidadeMovimentar = lancamentoData.quantidade || 0;

                if (tipoMovimento === "entrada" || (tipoMovimento === "ajuste" && quantidadeMovimentar > 0)) {
                    functions.logger.error(`[${lancamentoId}] ERROR: Filament stock addition (entrada or positive ajuste) is not allowed via this function. Lancamento Data:`, lancamentoData);
                    throw new Error(`Filament stock addition is not allowed via this function. Use dedicated spool creation process.`);
                }

                // Ensure consumption is a positive value for processing
                quantidadeMovimentar = Math.abs(quantidadeMovimentar);

                const spoolsSnapshot = await transaction.get(
                    db.collection("insumos")
                        .where("tipo", "==", "filamento")
                        .where("especificacoes.grupoFilamentoId", "==", grupoFilamentoId)
                        .orderBy("especificacoes.spoolNumero", "asc")
                );

                let spools: FilamentSpool[] = spoolsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    functions.logger.debug(`[${lancamentoId}] Raw spool data for ${doc.id}:`, data);
                    functions.logger.debug(`[${lancamentoId}] Raw especificacoes for ${doc.id}:`, data.especificacoes);

                    return {
                        id: doc.id,
                        grupoFilamentoId: data.especificacoes?.grupoFilamentoId || '',
                        spoolNumero: data.especificacoes?.spoolNumero || 0,
                        pesoLiquido: data.especificacoes?.pesoLiquido || 0,
                        estoqueAtual: data.estoqueAtual || 0, // Corrected: read from top-level data
                        aberto: data.especificacoes?.aberto || false,
                        dataAbertura: data.especificacoes?.dataAbertura === "" ? null : (data.especificacoes?.dataAbertura instanceof admin.firestore.Timestamp ? data.especificacoes.dataAbertura : null),
                        finalizadoEm: data.especificacoes?.finalizadoEm === false ? null : (data.especificacoes?.finalizadoEm instanceof admin.firestore.Timestamp ? data.especificacoes.finalizadoEm : null),
                        operacoes: data.operacoes || [],
                        createdAt: data.createdAt instanceof admin.firestore.Timestamp ? data.createdAt : admin.firestore.Timestamp.now(),
                        updatedAt: data.updatedAt instanceof admin.firestore.Timestamp ? data.updatedAt : admin.firestore.Timestamp.now(),
                        nome: data.nome || '',
                        cor: data.cor || '',
                        fabricante: data.fabricante || '',
                        material: data.material || '',
                    } as FilamentSpool;
                });

                functions.logger.debug(`[${lancamentoId}] Initial spools found: ${spools.length}. Details:`, spools.map(s => ({ id: s.id, spoolNumero: s.spoolNumero, aberto: s.aberto, estoqueAtual: s.estoqueAtual, finalizadoEm: s.finalizadoEm ? 'true' : 'false' })));

                const spoolsToUpdate: { spool: FilamentSpool; newEstoque: number; aberto: boolean; debitedAmount: number; dataAbertura?: FieldValue | null; finalizadoEm?: FieldValue | null }[] = [];
                const notificacoes: NotificacaoFrontend[] = [];

                let currentSpool: FilamentSpool | undefined;

                while (quantidadeMovimentar > 0) {
                    functions.logger.debug(`[${lancamentoId}] Remaining to process: ${quantidadeMovimentar}. Current spools state:`, spools.map(s => ({ id: s.id, spoolNumero: s.spoolNumero, aberto: s.aberto, estoqueAtual: s.estoqueAtual, finalizadoEm: s.finalizadoEm ? 'true' : 'false' })));

                    // 1. Try to find an already open spool with stock
                    currentSpool = spools.find(s => s.aberto && s.estoqueAtual > 0);
                    functions.logger.debug(`[${lancamentoId}] Found open spool:`, currentSpool?.id);

                    if (!currentSpool) {
                        // 2. If no open spool, find the next available (not open, not finished) spool with stock
                        currentSpool = spools.find(s => !s.aberto && !s.finalizadoEm && s.estoqueAtual > 0);
                        functions.logger.debug(`[${lancamentoId}] Found available (not open) spool with stock:`, currentSpool?.id);

                        if (currentSpool) {
                            // Open the new spool
                            currentSpool.aberto = true;
                            currentSpool.dataAbertura = FieldValue.serverTimestamp() as any; // Update local object for consistency
                            spoolsToUpdate.push({
                                spool: currentSpool,
                                newEstoque: currentSpool.estoqueAtual, // Stock doesn't change on opening
                                aberto: true,
                                debitedAmount: 0, // No debit on opening
                                dataAbertura: FieldValue.serverTimestamp(),
                            });

                            // Add frontend notification for new spool opened
                            notificacoes.push({
                                type: 'newSpoolOpened',
                                spoolId: currentSpool.id,
                                spoolNumero: currentSpool.spoolNumero,
                                grupoFilamentoId: currentSpool.grupoFilamentoId,
                                grupoFilamentoNome: currentSpool.nome, // Assuming 'nome' is available on FilamentSpool
                                timestamp: FieldValue.serverTimestamp() as any,
                                read: false,
                            });
                        } else {
                            // No more spools available for consumption
                            functions.logger.error(`[${lancamentoId}] ERROR: No open or available spools found for Grupo de Filamento ${grupoFilamentoId}. Remaining to process: ${quantidadeMovimentar}. Lancamento Data:`, lancamentoData);
                            throw new Error(`No open or available spools found for Grupo de Filamento ${grupoFilamentoId}.`);
                        }
                    }

                    // Debit from the current spool
                    const consumable = Math.min(currentSpool.estoqueAtual, quantidadeMovimentar);
                    const newEstoque = currentSpool.estoqueAtual - consumable;
                    quantidadeMovimentar -= consumable;

                    functions.logger.debug(`[${lancamentoId}] Debiting ${consumable} from spool ${currentSpool.id}. New estoque: ${newEstoque}. Remaining to process: ${quantidadeMovimentar}`);

                    currentSpool.estoqueAtual = newEstoque; // Update local object for consistency

                    const updateEntry = spoolsToUpdate.find(entry => entry.spool.id === currentSpool!.id);
                    if (updateEntry) {
                        updateEntry.newEstoque = newEstoque;
                        updateEntry.aberto = newEstoque > 0;
                        updateEntry.debitedAmount += consumable; // Accumulate debited amount
                        if (newEstoque <= 0) {
                            updateEntry.finalizadoEm = FieldValue.serverTimestamp();
                        }
                    } else {
                        spoolsToUpdate.push({
                            spool: currentSpool,
                            newEstoque: newEstoque,
                            aberto: newEstoque > 0,
                            debitedAmount: consumable, // Initial debited amount
                            finalizadoEm: newEstoque <= 0 ? FieldValue.serverTimestamp() : null,
                        });
                    }

                    // If the current spool is now empty, mark it as closed and clear it for the next iteration
                    if (newEstoque <= 0) {
                        currentSpool.aberto = false;
                        currentSpool.finalizadoEm = FieldValue.serverTimestamp() as any;
                        functions.logger.debug(`[${lancamentoId}] Spool ${currentSpool?.id} is now empty and closed.`);
                        currentSpool = undefined; // Force finding a new spool in next iteration
                    }
                }

                // Apply updates within the transaction
                for (const { spool, newEstoque, aberto, debitedAmount, dataAbertura, finalizadoEm } of spoolsToUpdate) {
                    const updateData: any = {
                        "estoqueAtual": newEstoque, // Corrected: update top-level estoqueAtual
                        "especificacoes.aberto": aberto,
                        "especificacoes.pesoBruto": FieldValue.increment(-debitedAmount), // Debit pesoBruto
                        "especificacoes.pesoLiquido": FieldValue.increment(-debitedAmount), // Debit pesoLiquido
                        operacoes: FieldValue.arrayUnion(lancamentoId),
                        updatedAt: FieldValue.serverTimestamp(),
                    };

                    // Conditionally update consumoProducao or consumoReal based on origin
                    if (lancamentoData.origem === 'producao') {
                        updateData["especificacoes.consumoProducao"] = FieldValue.increment(debitedAmount);
                    } else {
                        updateData["especificacoes.consumoReal"] = FieldValue.increment(debitedAmount);
                    }

                    if (dataAbertura) {
                        updateData["especificacoes.dataAbertura"] = dataAbertura;
                    }
                    if (finalizadoEm) {
                        updateData["especificacoes.finalizadoEm"] = finalizadoEm;
                    }
                    transaction.update(db.collection("insumos").doc(spool.id), updateData);
                }

                for (const notification of notificacoes) {
                    transaction.set(db.collection("notificacoesFrontend").doc(), notification);
                }
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
