import * as admin from 'firebase-admin';
import { DocumentSnapshot } from 'firebase-functions/v2/firestore';
import {
    LancamentoProducao,
    GrupoProducaoOtimizado,
    PedidoOrigem,
    AssemblyInstance,
    LocalDestino,
    EntradaPartesPayload,
    EntradaPecaEmbalagemPayload,
    EntradaPecaMontagemPayload,
    LancamentoProducaoTipoEvento // Import the enum
} from '../../types/productionTypes';

export async function handleConclusaoProducao(event: { data?: DocumentSnapshot }) {
    const db = admin.firestore();
    const lancamento = event.data?.data() as LancamentoProducao | undefined;

    if (!lancamento) {
        console.error('Nenhum dado de lançamento de conclusão de produção encontrado');
        return;
    }

    try {
        const actualPayload = lancamento.payload as any;

        if (!actualPayload || !actualPayload.optimizedGroupId) {
            throw new Error('Payload inválido: optimizedGroupId é obrigatório');
        }
        if (actualPayload.quantidadeProduzida === undefined) {
            throw new Error('Payload inválido: quantidadeProduzida é obrigatório');
        }

        const groupId = actualPayload.optimizedGroupId;
        const quantidadeProduzida = actualPayload.quantidadeProduzida;
        const locaisDestino = actualPayload.locaisDestino;

        let producaoGruposQuerySnapshot: admin.firestore.QuerySnapshot | undefined;
        let montagemGruposQuerySnapshot: admin.firestore.QuerySnapshot | undefined;

        if (actualPayload.pedidosOrigem && actualPayload.pedidosOrigem.length > 0) {
            const pedidoId = actualPayload.pedidosOrigem[0].pedidoId;
            producaoGruposQuerySnapshot = await db.collection('gruposProducaoOtimizados')
                .where('pedidosOrigem', 'array-contains', { pedidoId: pedidoId })
                .get();
            montagemGruposQuerySnapshot = await db.collection('gruposMontagem')
                .where('pedidoId', '==', pedidoId)
                .get();
        }

        await db.runTransaction(async (transaction) => {
            const grupoRef = db.collection('gruposProducaoOtimizados').doc(groupId);
            const grupoSnapshot = await transaction.get(grupoRef);

            if (!grupoSnapshot.exists) {
                throw new Error(`Grupo de produção otimizado ${groupId} não encontrado`);
            }

            const grupo = grupoSnapshot.data() as GrupoProducaoOtimizado;

            let pedidoSnapshot: admin.firestore.DocumentSnapshot | undefined;
            if (grupo.pedidosOrigem && grupo.pedidosOrigem.length > 0) {
                const pedidoId = grupo.pedidosOrigem[0].pedidoId;
                const pedidoRef = db.collection('pedidos').doc(pedidoId);
                pedidoSnapshot = await transaction.get(pedidoRef);
            }

            // Calculate total number of piece instances this optimized group contributes to
            let numberOfPieceInstances = 0;
            if (grupo.pedidosOrigem) {
                for (const pedidoOrigem of grupo.pedidosOrigem) {
                    numberOfPieceInstances += pedidoOrigem.assemblyInstances.length;
                }
            }
            if (numberOfPieceInstances === 0) {
                console.warn(`GrupoProducaoOtimizado ${grupo.id} has no associated assembly instances. Defaulting quantity per instance to total part quantity.`);
                numberOfPieceInstances = 1; // Prevent division by zero, assume it's a single instance if none found
            }

            if (grupo.status !== 'em_producao') {
                throw new Error(`Grupo de produção ${groupId} não pode ser concluído. Status atual: ${grupo.status}`);
            }

            const updateData: any = {
                status: 'produzido',
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
                usuarioConclusaoProducao: lancamento.usuarioId,
                quantidadeProduzida
            };

            console.log(`[DEBUG] Quantidade Produzida: ${quantidadeProduzida}`);
            let remainingQuantityToDistribute = quantidadeProduzida;

            if (grupo.pedidosOrigem && grupo.pedidosOrigem.length > 0) {
                updateData.pedidosOrigem = grupo.pedidosOrigem.map((pedidoOrigem: PedidoOrigem) => ({
                    ...pedidoOrigem,
                    assemblyInstances: pedidoOrigem.assemblyInstances.map((instance: AssemblyInstance) => {
                        let quantityForThisInstance = 0;
                        if (remainingQuantityToDistribute > 0) {
                            quantityForThisInstance = Math.min(instance.quantidadeRequerida, remainingQuantityToDistribute);
                            remainingQuantityToDistribute -= quantityForThisInstance;
                        }
                        console.log(`[DEBUG] Instance ${instance.assemblyInstanceId} - Quantidade Requerida: ${instance.quantidadeRequerida}, Quantity For This Instance: ${quantityForThisInstance}, Remaining: ${remainingQuantityToDistribute}`);

                        const existingProducaoEntryIndex = (instance.atendimentoDetalhado || []).findIndex(
                            (det: any) => det.origem === 'producao'
                        );

                        let updatedAtendimentoDetalhado = [...(instance.atendimentoDetalhado || [])];

                        if (existingProducaoEntryIndex > -1) {
                            updatedAtendimentoDetalhado[existingProducaoEntryIndex] = {
                                ...updatedAtendimentoDetalhado[existingProducaoEntryIndex],
                                quantidade: (updatedAtendimentoDetalhado[existingProducaoEntryIndex].quantidade || 0) + quantityForThisInstance,
                                timestamp: admin.firestore.Timestamp.now()
                            };
                        } else {
                            updatedAtendimentoDetalhado.push({
                                origem: 'producao',
                                quantidade: quantityForThisInstance,
                                timestamp: admin.firestore.Timestamp.now()
                            });
                        }

                        return {
                            ...instance,
                            atendimentoDetalhado: updatedAtendimentoDetalhado
                        };
                    })
                }));
            }

            transaction.update(grupoRef, updateData);

            const newLancamentosProducao: LancamentoProducao[] = [];
            const newLancamentosProdutos: any[] = [];

            // Map to aggregate parts for 'entrada_parte_montagem_peca'
            const aggregatedPartesForPeca: {
                [parentPecaId: string]: {
                    pecaTipoDetalhado: string;
                    partesProduzidas: { assemblyInstanceId: string; parteId: string; quantidade: number; }[];
                };
            } = {};

            if (updateData.pedidosOrigem) {
                for (const pedidoOrigem of updateData.pedidosOrigem) {
                    for (const instance of pedidoOrigem.assemblyInstances) {
                        const quantidadeAtendida = instance.atendimentoDetalhado?.find((det: any) => det.origem === 'producao')?.quantidade || 0;

                        if (quantidadeAtendida > 0) {
                            let tipoEvento: LancamentoProducaoTipoEvento; // Use enum type
                            let payload: any;

                            if (grupo.pecaTipoDetalhado === 'simples' || grupo.pecaTipoDetalhado === 'composta_um_grupo_sem_montagem') {
                                if (instance.parentModeloId) {
                                    const modelIdPattern = `-${instance.parentModeloId}-1`;
                                    const lastIndex = instance.assemblyInstanceId.lastIndexOf(modelIdPattern);
                                    let parentModelAssemblyInstanceId = instance.assemblyInstanceId;

                                    if (lastIndex !== -1) {
                                        parentModelAssemblyInstanceId = instance.assemblyInstanceId.substring(0, lastIndex + modelIdPattern.length);
                                    } else {
                                        console.warn(`Could not derive parentModelAssemblyInstanceId for ${instance.parentModeloId} from ${instance.assemblyInstanceId}. Using original.`);
                                    }

                                    tipoEvento = LancamentoProducaoTipoEvento.ENTRADA_PECA_MONTAGEM_MODELO; // Use enum member
                                    payload = {
                                        assemblyInstanceId: parentModelAssemblyInstanceId,
                                        pecaId: grupo.parentPecaId,
                                        quantidade: quantidadeAtendida,
                                        parentModeloId: instance.parentModeloId,
                                        parentKitId: instance.parentKitId
                                    } as EntradaPecaMontagemPayload;
                                } else if (instance.parentKitId) {
                                    tipoEvento = LancamentoProducaoTipoEvento.ENTRADA_PECA_MONTAGEM_KIT; // Use enum member
                                    payload = {
                                        assemblyInstanceId: instance.assemblyInstanceId,
                                        pecaId: grupo.parentPecaId,
                                        quantidade: quantidadeAtendida,
                                        parentModeloId: null,
                                        parentKitId: instance.parentKitId
                                    } as EntradaPecaMontagemPayload;
                                } else {
                                    tipoEvento = LancamentoProducaoTipoEvento.ENTRADA_PECA_EMBALAGEM; // Use enum member
                                    payload = {
                                        assemblyInstanceId: instance.assemblyInstanceId,
                                        pecaId: grupo.parentPecaId,
                                    quantidade: quantidadeAtendida,
                                    locaisDestino: locaisDestino,
                                } as EntradaPecaEmbalagemPayload;
                                }

                                newLancamentosProducao.push({
                                    id: db.collection('lancamentosProducao').doc().id,
                                    tipoEvento: tipoEvento,
                                    timestamp: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
                                    usuarioId: lancamento.usuarioId,
                                    payload: payload
                                });

                            } else if (grupo.pecaTipoDetalhado === 'composta_um_grupo_com_montagem' || grupo.pecaTipoDetalhado === 'composta_multiplos_grupos') {
                                tipoEvento = LancamentoProducaoTipoEvento.ENTRADA_PARTE_MONTAGEM_PECA; // Use enum member
                                if (!grupo.parentPecaId) {
                                    console.error(`[ERROR] Grupo ${grupo.id} with pecaTipoDetalhado ${grupo.pecaTipoDetalhado} is missing parentPecaId for aggregation.`);
                                    continue;
                                }
                                if (!aggregatedPartesForPeca[grupo.parentPecaId]) {
                                    aggregatedPartesForPeca[grupo.parentPecaId] = {
                                        pecaTipoDetalhado: grupo.pecaTipoDetalhado,
                                        partesProduzidas: []
                                    };
                                }

                                for (const parteId in grupo.partesNoGrupo) {
                                    const parteNoGrupo = grupo.partesNoGrupo[parteId];
                                    // Corrected calculation: quantity of this part per piece instance
                                    const quantidadePorInstancia = parteNoGrupo.quantidade / numberOfPieceInstances;

                                    aggregatedPartesForPeca[grupo.parentPecaId].partesProduzidas.push({
                                        assemblyInstanceId: instance.assemblyInstanceId,
                                        parteId: parteId,
                                        quantidade: quantidadePorInstancia, // Use the corrected quantity
                                    });
                                }
                            }
                        }
                    }
                }
            }

            // Add aggregated 'entrada_parte_montagem_peca' events
            for (const parentPecaId in aggregatedPartesForPeca) {
                const aggregatedData = aggregatedPartesForPeca[parentPecaId];
                newLancamentosProducao.push({
                    id: db.collection('lancamentosProducao').doc().id,
                    tipoEvento: LancamentoProducaoTipoEvento.ENTRADA_PARTE_MONTAGEM_PECA, // Use enum member
                    timestamp: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
                    usuarioId: lancamento.usuarioId,
                    payload: {
                        parentPecaId: parentPecaId,
                        pecaTipoDetalhado: aggregatedData.pecaTipoDetalhado,
                        partesProduzidas: aggregatedData.partesProduzidas
                    } as EntradaPartesPayload
                });
            }
            console.log(`[DEBUG] newLancamentosProducao length: ${newLancamentosProducao.length}`);

            for (const newLancamento of newLancamentosProducao) {
                transaction.create(db.collection('lancamentosProducao').doc(newLancamento.id), newLancamento);
            }

            if (locaisDestino && locaisDestino.length > 0 && grupo.partesNoGrupo) {
                for (const parteId in grupo.partesNoGrupo) {
                    const parteNoGrupo = grupo.partesNoGrupo[parteId];
                    const quantidadeParteProduzida = (parteNoGrupo.quantidade / grupo.quantidadeOriginalGrupo) * quantidadeProduzida;

                    const lancamentoProdutoRef = db.collection('lancamentosProdutos').doc();
                    newLancamentosProdutos.push({
                        tipoProduto: 'parte',
                        produtoId: parteId,
                        tipoMovimento: 'entrada',
                        usuario: lancamento.usuarioId,
                        data: admin.firestore.FieldValue.serverTimestamp(),
                        locais: locaisDestino.map((local: LocalDestino) => ({
                            ...local,
                            quantidade: quantidadeParteProduzida
                        }))
                    });
                    transaction.create(lancamentoProdutoRef, newLancamentosProdutos[newLancamentosProdutos.length - 1]);
                }
            }

            if (grupo.pedidosOrigem && grupo.pedidosOrigem.length > 0 && pedidoSnapshot && producaoGruposQuerySnapshot && montagemGruposQuerySnapshot) {
                const pedidoId = grupo.pedidosOrigem[0].pedidoId;
                const pedidoRef = db.collection('pedidos').doc(pedidoId);

                const allProductionCompleted = producaoGruposQuerySnapshot.docs.every(doc => doc.data().status === 'produzido');
                const allAssemblyCompleted = montagemGruposQuerySnapshot.docs.every(doc => doc.data().status === 'montado');

                if (allProductionCompleted && allAssemblyCompleted) {
                    transaction.update(pedidoRef, {
                        status: 'concluido'
                    });
                } else if (pedidoSnapshot.exists && pedidoSnapshot.data()?.status === 'aguardando_producao') {
                    transaction.update(pedidoRef, {
                        status: 'em_producao'
                    });
                }
            }

            console.log(`Grupo de produção ${groupId} concluído com sucesso`);
        });
    } catch (error) {
        console.error('Erro no processamento da conclusão de produção:', error);
        throw error;
    }
}
