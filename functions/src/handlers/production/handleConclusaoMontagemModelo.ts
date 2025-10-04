import * as admin from 'firebase-admin';
import { DocumentSnapshot } from 'firebase-functions/v2/firestore';
import {
    LancamentoProducao,
    ConclusaoMontagemModeloPayload,
    EntradaModeloMontagemPayload,
    EntradaModeloEmbalagemPayload,
    LancamentoProducaoTipoEvento
} from '../../types/productionTypes';
export async function handleConclusaoMontagemModelo(event: { data?: DocumentSnapshot }) {
    const db = admin.firestore();
    const lancamento = event.data?.data() as LancamentoProducao | undefined;

    if (!lancamento) {
        console.error('Nenhum dado de lançamento de conclusão de montagem de modelo encontrado');
        return;
    }

    try {
        // Extração segura do usuarioId
        const extractUserId = (data: any): string => {
            if (data.usuarioId) return data.usuarioId;
            if (data._fieldsProto?.usuarioId?.stringValue) {
                return data._fieldsProto.usuarioId.stringValue;
            }
            return 'sistema'; // Fallback garantido
        };

        const usuarioId = extractUserId(lancamento);
        const payload = lancamento.payload as ConclusaoMontagemModeloPayload;

        if (!payload || !payload.assemblyGroupId || !payload.targetProductId || !payload.targetProductType) {
            throw new Error('Payload inválido: assemblyGroupId, targetProductId e targetProductType são obrigatórios');
        }

        const assemblyGroupId = payload.assemblyGroupId;
        const targetProductId = payload.targetProductId;
        const parentKitId = payload.parentKitId;
        const assemblyInstanceId = payload.assemblyInstanceId;
        const quantidade = payload.quantidade;

        await db.runTransaction(async (transaction) => {
            const grupoOrigemRef = db.collection('gruposMontagem').doc(assemblyGroupId);
            const grupoOrigemSnapshot = await transaction.get(grupoOrigemRef);

            if (!grupoOrigemSnapshot.exists) {
                throw new Error(`Grupo de origem ${assemblyGroupId} não encontrado`);
            }

            // Atualiza status apenas se não estiver montado
            const currentStatus = grupoOrigemSnapshot.data()?.status;
            if (currentStatus !== 'montado') {
                transaction.update(grupoOrigemRef, {
                    status: 'montado',
                    timestampConclusao: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // Determine next event based on context
            let nextTipoEvento: LancamentoProducaoTipoEvento;
            let nextPayload: EntradaModeloMontagemPayload | EntradaModeloEmbalagemPayload;

            if (parentKitId) {
                // If there's a parent kit, send to kit assembly
                nextTipoEvento = LancamentoProducaoTipoEvento.ENTRADA_MODELO_MONTAGEM_KIT;
                nextPayload = {
                    assemblyInstanceId: assemblyInstanceId,
                    modeloId: targetProductId,
                    quantidade: quantidade,
                    parentKitId: parentKitId,
                };
            } else {
                // If no parent kit, send to packaging
                nextTipoEvento = LancamentoProducaoTipoEvento.ENTRADA_MODELO_EMBALAGEM;
                nextPayload = {
                    assemblyInstanceId: assemblyInstanceId,
                    modeloId: targetProductId,
                    quantidade: quantidade,
                    parentKitId: null,
                };
            }

            const newLancamentoProducaoRef = db.collection('lancamentosProducao').doc();
            transaction.create(newLancamentoProducaoRef, {
                id: newLancamentoProducaoRef.id,
                tipoEvento: nextTipoEvento,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                usuarioId: usuarioId,
                payload: nextPayload,
            });

            console.log(`Grupo de montagem de modelo ${assemblyGroupId} concluído com sucesso. Próximo evento: ${nextTipoEvento}`);
        });
    } catch (error) {
        console.error('Erro no processamento da conclusão de montagem de modelo:', error);
        throw error;
    }
}
