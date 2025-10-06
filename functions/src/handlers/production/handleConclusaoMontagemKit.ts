import * as admin from 'firebase-admin';
import { DocumentSnapshot } from 'firebase-functions/v2/firestore';
import {
    LancamentoProducao,
    ConclusaoMontagemKitPayload,
    LancamentoProducaoTipoEvento,
    LancamentoProduto,
    GrupoMontagem,
    Pedido,
    PedidoProduto // Add this
} from '../../types/productionTypes';
import { cleanObject } from '../../../../src/app/utils/cleanObject'; // Assuming cleanObject is available

export async function handleConclusaoMontagemKit(event: { data?: DocumentSnapshot }) {
    const db = admin.firestore();
    const lancamento = event.data?.data() as LancamentoProducao | undefined;

    if (!lancamento) {
        console.error('Nenhum dado de lançamento de conclusão de montagem de kit encontrado');
        return;
    }

    try {
        const extractUserId = (data: any): string => {
            if (data.usuarioId) return data.usuarioId;
            if (data._fieldsProto?.usuarioId?.stringValue) {
                return data._fieldsProto.usuarioId.stringValue;
            }
            return 'sistema';
        };

        const usuarioId = extractUserId(lancamento);
        if (lancamento.tipoEvento !== LancamentoProducaoTipoEvento.CONCLUSAO_MONTAGEM_KIT) {
            throw new Error(`Tipo de evento inesperado: ${lancamento.tipoEvento}`);
        }
        const payload = lancamento.payload as ConclusaoMontagemKitPayload;

        if (!payload || !payload.assemblyGroupId || !payload.targetProductId || payload.targetProductType !== 'kit') {
            throw new Error('Payload inválido: assemblyGroupId, targetProductId e targetProductType (kit) são obrigatórios');
        }

        const assemblyGroupId = payload.assemblyGroupId;
        const targetProductId = payload.targetProductId; // This is the kit ID
        const assemblyInstanceId = payload.assemblyInstanceId;
        const quantidade = payload.quantidade; // Should be 1 for a kit assembly
        const modelosNecessarios = payload.modelosNecessarios || [];

        await db.runTransaction(async (transaction) => {
            const grupoOrigemRef = db.collection('gruposMontagem').doc(assemblyGroupId);
            const grupoOrigemSnapshot = await transaction.get(grupoOrigemRef);

            if (!grupoOrigemSnapshot.exists) {
                throw new Error(`Grupo de origem ${assemblyGroupId} não encontrado`);
            }

            const grupoMontagemData = grupoOrigemSnapshot.data() as GrupoMontagem;
            const pedidoId = grupoMontagemData.pedidoId;

            let pedidoData: Pedido | undefined;
            if (pedidoId) {
                const pedidoRef = db.collection('pedidos').doc(pedidoId);
                const pedidoSnapshot = await transaction.get(pedidoRef);
                if (pedidoSnapshot.exists) {
                    pedidoData = pedidoSnapshot.data() as Pedido;
                }
            }

            // 1. Update status of GrupoMontagem to 'montado'
            const currentStatus = grupoMontagemData.status;
            if (currentStatus !== 'montado') {
                transaction.update(grupoOrigemRef, {
                    status: 'montado',
                    timestampConclusao: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // 2. Create lancamentoProduto entry for the assembled kit (entrada)
            const lancamentoKitRef = db.collection('lancamentosProdutos').doc();
            const lancamentoKit: LancamentoProduto = {
                id: lancamentoKitRef.id,
                produtoId: targetProductId,
                tipoProduto: 'kit',
                tipoMovimento: 'entrada',
                quantidade: quantidade,
                usuario: usuarioId,
                observacao: `Entrada de kit montado: ${grupoMontagemData.targetProductName} (ID: ${targetProductId})`,
                data: admin.firestore.Timestamp.now(),
                locais: [], // Locais will be handled by the next event (embalagem)
            };
            transaction.set(lancamentoKitRef, cleanObject(lancamentoKit));

            // 3. Debit consumed models from stock (saida)
            for (const modelo of modelosNecessarios) {
                if (modelo.quantidade > 0) {
                    const lancamentoModeloRef = db.collection('lancamentosProdutos').doc();
                    const locaisDebito: LancamentoProduto['locais'] = modelo.atendimentoDetalhado.map(atendimento => ({
                        recipienteId: atendimento.origem.includes('estoque') ? atendimento.origem.replace('estoque_', '') : '', // This needs refinement based on actual stock location data
                        quantidade: atendimento.quantidade,
                        divisao: null, // Assuming no specific division for now
                        localId: '', // Assuming no specific localId for now
                    }));

                    const lancamentoModelo: LancamentoProduto = {
                        id: lancamentoModeloRef.id,
                        produtoId: modelo.modeloId,
                        tipoProduto: 'modelo',
                        tipoMovimento: 'saida',
                        quantidade: modelo.quantidade,
                        usuario: usuarioId,
                        observacao: `Saída de modelo para montagem de kit: ${modelo.nome} (ID: ${modelo.modeloId})`,
                        data: admin.firestore.Timestamp.now(),
                        locais: locaisDebito,
                    };
                    transaction.set(lancamentoModeloRef, cleanObject(lancamentoModelo));
                }
            }

            // 4. Update pedido status if all products within that pedido are now ready for packaging
            if (pedidoId && pedidoData) {
                const pedidoRef = db.collection('pedidos').doc(pedidoId);
                let allProductsReadyForPackaging = true;

                const updatedProdutos = pedidoData.produtos.map((produto: PedidoProduto) => {
                    if (produto.produtoId === targetProductId && produto.tipo === 'kit') {
                        // This is the kit that was just assembled
                        return { ...produto, statusProducaoItem: 'pronto_para_embalagem' };
                    }
                    return produto;
                });

                // Check if all products in the pedido are now 'pronto_para_embalagem' or 'concluido'
                allProductsReadyForPackaging = updatedProdutos.every((p: PedidoProduto) =>
                    p.statusProducaoItem === 'pronto_para_embalagem' || p.statusProducaoItem === 'concluido'
                );

                if (allProductsReadyForPackaging && pedidoData.status !== 'processando_embalagem' && pedidoData.status !== 'concluido') {
                    transaction.update(pedidoRef, {
                        produtos: cleanObject(updatedProdutos),
                        status: 'processando_embalagem',
                    });
                } else {
                    transaction.update(pedidoRef, {
                        produtos: cleanObject(updatedProdutos),
                    });
                }
            }

            // 5. Create a new lancamentoProducao event with tipoEvento: 'entrada_kit_embalagem'
            const newLancamentoProducaoRef = db.collection('lancamentosProducao').doc();
            const nextPayload = {
                assemblyInstanceId: assemblyInstanceId,
                kitId: targetProductId,
                quantidade: quantidade,
                locaisDestino: [], // Locais will be determined at packaging stage
            };
            transaction.create(newLancamentoProducaoRef, {
                id: newLancamentoProducaoRef.id,
                tipoEvento: LancamentoProducaoTipoEvento.ENTRADA_KIT_EMBALAGEM,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                usuarioId: usuarioId,
                payload: nextPayload,
            });

            console.log(`Grupo de montagem de kit ${assemblyGroupId} concluído com sucesso. Próximo evento: ${LancamentoProducaoTipoEvento.ENTRADA_KIT_EMBALAGEM}`);
        });
    } catch (error) {
        console.error('Erro no processamento da conclusão de montagem de kit:', error);
        throw error;
    }
}
