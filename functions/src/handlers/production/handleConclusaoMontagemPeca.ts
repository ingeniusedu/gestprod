import * as admin from 'firebase-admin';
import { DocumentSnapshot } from 'firebase-functions/v2/firestore';
import {
    LancamentoProducao,
    GrupoMontagem,
    ConclusaoMontagemPecaPayload,
    EntradaPecaMontagemPayload,
    EntradaPecaEmbalagemPayload,
    LancamentoProducaoTipoEvento // Import the enum
} from '../../types/productionTypes';
import { logger } from 'firebase-functions';

export async function handleConclusaoMontagemPeca(event: { data?: DocumentSnapshot }) {
    const db = admin.firestore();
    const lancamento = event.data?.data() as LancamentoProducao | undefined;

    if (!lancamento) {
        console.error('Nenhum dado de lançamento de conclusão de montagem de peça encontrado');
        return;
    }

    try {
        const payload = lancamento.payload as ConclusaoMontagemPecaPayload;

        if (!payload || !payload.assemblyGroupId || !payload.targetProductId || !payload.targetProductType) {
            throw new Error('Payload inválido: assemblyGroupId, targetProductId e targetProductType são obrigatórios');
        }

        const assemblyGroupId = payload.assemblyGroupId;
        const targetProductId = payload.targetProductId;
        // const targetProductType = payload.targetProductType; // Removed as it's part of payload and not directly used
        const parentModeloId = payload.parentModeloId;
        const parentKitId = payload.parentKitId;
        const usuarioId = payload.usuarioId;

        await db.runTransaction(async (transaction) => {
            const grupoMontagemRef = db.collection('gruposMontagem').doc(assemblyGroupId);
            const grupoMontagemSnapshot = await transaction.get(grupoMontagemRef);

            if (!grupoMontagemSnapshot.exists) {
                throw new Error(`Grupo de montagem ${assemblyGroupId} não encontrado`);
            }

            const grupoMontagem = grupoMontagemSnapshot.data() as GrupoMontagem;

            if (grupoMontagem.status === 'montado') {
                console.warn(`Grupo de montagem ${assemblyGroupId} já está montado. Nenhuma ação necessária.`);
                return;
            }

            let parentModeloAssemblyGroupRef: admin.firestore.DocumentReference | undefined;
            let parentModeloAssemblyGroup: GrupoMontagem | undefined;
            let pedidoRef: admin.firestore.DocumentReference | undefined;
            let pedidoSnapshot: admin.firestore.DocumentSnapshot | undefined;
            let allAssemblyGroupsQuerySnapshot: admin.firestore.QuerySnapshot | undefined;

            // All reads must be performed before any writes
            let parentModelAssemblyInstanceId: string | undefined;
            if (parentModeloId) {
                // Derive the parent model's assemblyInstanceId from the current piece's assemblyInstanceId
                // Assuming the pattern is [pedidoId]-[kitId]-1-[modeloId]-1-[pieceId]-1
                const modelIdPattern = `-${parentModeloId}-1`;
                const lastIndex = grupoMontagem.assemblyInstanceId.lastIndexOf(modelIdPattern);
                logger.info(`Debugging assemblyInstanceId derivation:`);
                logger.info(`  grupoMontagem.assemblyInstanceId: ${grupoMontagem.assemblyInstanceId}`);
                logger.info(`  parentModeloId: ${parentModeloId}`);
                logger.info(`  modelIdPattern: ${modelIdPattern}`);
                logger.info(`  lastIndex: ${lastIndex}`);

                if (lastIndex !== -1) {
                    parentModelAssemblyInstanceId = grupoMontagem.assemblyInstanceId.substring(0, lastIndex + modelIdPattern.length);
                    logger.info(`  Derived parentModelAssemblyInstanceId: ${parentModelAssemblyInstanceId}`);
                } else {
                    logger.warn(`Could not derive parentModelAssemblyInstanceId for ${parentModeloId} from ${grupoMontagem.assemblyInstanceId}`);
                }

                if (parentModelAssemblyInstanceId) {
                    const parentModeloAssemblyGroupQuery = await transaction.get(
                        db.collection('gruposMontagem')
                            .where('targetProductId', '==', parentModeloId)
                            .where('targetProductType', '==', 'modelo')
                            .where('assemblyInstanceId', '==', parentModelAssemblyInstanceId) // Use the derived ID
                            .limit(1)
                    );

                    if (!parentModeloAssemblyGroupQuery.empty) {
                        parentModeloAssemblyGroupRef = parentModeloAssemblyGroupQuery.docs[0].ref;
                        parentModeloAssemblyGroup = parentModeloAssemblyGroupQuery.docs[0].data() as GrupoMontagem;
                        logger.info(`  Parent Modelo Assembly Group found with ID: ${parentModeloAssemblyGroupRef.id}`);
                    } else {
                        logger.warn(`  Parent Modelo Assembly Group not found for query: targetProductId=${parentModeloId}, assemblyInstanceId=${parentModelAssemblyInstanceId}`);
                    }
                }
            }

            if (grupoMontagem.pedidoId) {
                pedidoRef = db.collection('pedidos').doc(grupoMontagem.pedidoId);
                pedidoSnapshot = await transaction.get(pedidoRef);

                if (pedidoSnapshot.exists) {
                    allAssemblyGroupsQuerySnapshot = await transaction.get(
                        db.collection('gruposMontagem')
                            .where('pedidoId', '==', grupoMontagem.pedidoId)
                    );
                }
            }

            // 1. Update GrupoMontagem status
            transaction.update(grupoMontagemRef, {
                status: 'montado',
                timestampConclusao: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 2. Update parent GrupoMontagem (if applicable)
            // Removed direct update to parentModeloAssemblyGroupRef as per revised plan.
            // The update will now be handled by handleEntradaPecaMontagemModelo.ts
            if (parentKitId) {
                // This path needs careful consideration based on the exact hierarchy.
                // For now, if parentKitId exists, it implies it's part of a model that is part of a kit.
                // The model's assembly group would have been updated, and this piece's completion contributes to the model's readiness.
                // The model's completion will then update the kit's assembly group.
                // So, no direct update to kit's assembly group from piece completion.
            }

            // 3. Trigger next event
            let nextTipoEvento: LancamentoProducaoTipoEvento;
            let nextPayload: any;

            if (parentModeloId) {
                nextTipoEvento = LancamentoProducaoTipoEvento.ENTRADA_PECA_MONTAGEM_MODELO;
                if (!parentModeloAssemblyGroup) {
                    throw new Error(`Parent Modelo Assembly Group for ${parentModeloId} not found when trying to trigger ENTRADA_PECA_MONTAGEM_MODELO.`);
                }
                nextPayload = {
                    assemblyInstanceId: parentModeloAssemblyGroup.assemblyInstanceId, // Use the parent model's assemblyInstanceId
                    pecaId: targetProductId,
                    quantidade: 1,
                    parentModeloId: parentModeloId,
                    parentKitId: parentKitId,
                } as EntradaPecaMontagemPayload;
            } else if (parentKitId) {
                nextTipoEvento = LancamentoProducaoTipoEvento.ENTRADA_PECA_MONTAGEM_KIT;
                nextPayload = {
                    assemblyInstanceId: grupoMontagem.assemblyInstanceId,
                    pecaId: targetProductId,
                    quantidade: 1,
                    parentModeloId: null,
                    parentKitId: parentKitId,
                } as EntradaPecaMontagemPayload;
            } else {
                nextTipoEvento = LancamentoProducaoTipoEvento.ENTRADA_PECA_EMBALAGEM;
                nextPayload = {
                    assemblyInstanceId: grupoMontagem.assemblyInstanceId,
                    pecaId: targetProductId,
                    quantidade: 1,
                    locaisDestino: [],
                } as EntradaPecaEmbalagemPayload;
            }

            const newLancamentoProducaoRef = db.collection('lancamentosProducao').doc();
            transaction.create(newLancamentoProducaoRef, {
                id: newLancamentoProducaoRef.id,
                tipoEvento: nextTipoEvento,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                usuarioId: usuarioId,
                payload: nextPayload,
            });

            // 4. Update Pedido status (simplified for now, full logic might be in a separate handler)
            if (grupoMontagem.pedidoId && pedidoSnapshot?.exists && allAssemblyGroupsQuerySnapshot) {
                const allAssemblyCompleted = allAssemblyGroupsQuerySnapshot.docs.every(doc => doc.data().status === 'montado');

                if (allAssemblyCompleted) {
                    transaction.update(pedidoRef!, {
                        status: 'processando_embalagem',
                    });
                }
            }

            console.log(`Grupo de montagem de peça ${assemblyGroupId} concluído com sucesso. Próximo evento: ${nextTipoEvento}`);
        });
    } catch (error) {
        console.error('Erro no processamento da conclusão de montagem de peça:', error);
        throw error;
    }
}
