import * as admin from 'firebase-admin';
import { DocumentSnapshot } from 'firebase-functions/v1/firestore';
import {
    EntradaKitEmbalagemPayload,
    LancamentoProducaoTipoEvento,
    LancamentoProducao,
    EntradaEstoqueKitPayload,
    EntradaPedidoKitPayload,
} from '../../types/productionTypes';

export const handleEntradaKitEmbalagem = async (event: { data?: DocumentSnapshot }) => {
    const db = admin.firestore();
    if (!event.data) {
        console.warn('No data found in event for handleEntradaKitEmbalagem.');
        return;
    }

    const lancamento = event.data.data() as LancamentoProducao;

    if (lancamento.tipoEvento !== LancamentoProducaoTipoEvento.ENTRADA_KIT_EMBALAGEM) {
        console.warn(`Tipo de evento inválido: ${lancamento.tipoEvento}. Esperado: ${LancamentoProducaoTipoEvento.ENTRADA_KIT_EMBALAGEM}`);
        return;
    }

    const payload = lancamento.payload as EntradaKitEmbalagemPayload;

    if (!payload.assemblyInstanceId || !payload.kitId || !payload.quantidade) {
        console.error('Payload inválido para ENTRADA_KIT_EMBALAGEM: assemblyInstanceId, kitId e quantidade são obrigatórios', payload);
        return;
    }
    console.log('[DEBUG handleEntradaKitEmbalagem] Payload válido:', payload);

    await db.runTransaction(async (transaction) => {
        console.log('[DEBUG handleEntradaKitEmbalagem] Iniciando transação.');

        // Extract pedidoId from assemblyInstanceId
        const pedidoId = payload.assemblyInstanceId.split('-')[0];
        if (!pedidoId) {
            console.error('Pedido ID não pôde ser extraído do assemblyInstanceId para ENTRADA_KIT_EMBALAGEM.');
            return;
        }

        // Construct the assemblyInstanceId for the packaging group
        const packagingAssemblyInstanceId = `${pedidoId}-embalagem-final`;

        const grupoMontagemEmbalagemQuerySnapshot = await transaction.get(
            db.collection('gruposMontagem')
                .where('assemblyInstanceId', '==', packagingAssemblyInstanceId)
                .limit(1)
        );

        if (grupoMontagemEmbalagemQuerySnapshot.empty) {
            console.warn(`GrupoMontagem de embalagem para o pedido ${pedidoId} com assemblyInstanceId ${packagingAssemblyInstanceId} não encontrado.`);
            return;
        }

        const grupoMontagemEmbalagemDoc = grupoMontagemEmbalagemQuerySnapshot.docs[0];
        const grupoMontagemEmbalagem = grupoMontagemEmbalagemDoc.data();

        let allItemsAttended = true;
        const updatedProdutosFinaisNecessarios = (grupoMontagemEmbalagem.produtosFinaisNecessarios || []).map((produto: any) => {
            if (produto.produtoId === payload.kitId && produto.tipo === 'kit') {
                const newQuantidadeAtendida = (produto.quantidadeAtendida || 0) + payload.quantidade;
                if (newQuantidadeAtendida < produto.quantidade) {
                    allItemsAttended = false;
                }
                
                // CORREÇÃO: Não atualizar modelos ou peças aqui
                // Eles já foram atualizados pelos handlers específicos
                // Apenas garantir que o kit esteja marcado como concluído
                return { 
                    ...produto, 
                    quantidadeAtendida: newQuantidadeAtendida
                    // Mantém modelos e pecas como estão (já atualizados pelos handlers específicos)
                };
            }
            if ((produto.quantidadeAtendida || 0) < (produto.quantidade || 0)) {
                allItemsAttended = false;
            }
            return produto;
        });

        let newEmbalagemStatus = grupoMontagemEmbalagem.status;
        if (allItemsAttended) {
            newEmbalagemStatus = 'produzido_aguardando_embalagem';
        } else {
            newEmbalagemStatus = 'em_montagem';
        }

        const newLancamentos: LancamentoProducao[] = [];
        if (payload.locaisDestino && payload.locaisDestino.length > 0) {
            for (const localDestino of payload.locaisDestino) {
                const novoLancamento: LancamentoProducao = {
                    id: db.collection('lancamentosProducao').doc().id,
                    timestamp: admin.firestore.Timestamp.now(),
                    usuarioId: lancamento.usuarioId,
                    payload: {} as any,
                    tipoEvento: LancamentoProducaoTipoEvento.ENTRADA_KIT_EMBALAGEM, // Default, will be overwritten
                };

                if (localDestino.tipo === 'estoque') {
                    const entradaEstoquePayload: EntradaEstoqueKitPayload = {
                        kitId: payload.kitId,
                        quantidade: payload.quantidade,
                        localId: localDestino.localId,
                        assemblyInstanceId: payload.assemblyInstanceId,
                    };
                    novoLancamento.tipoEvento = LancamentoProducaoTipoEvento.ENTRADA_ESTOQUE_KIT;
                    novoLancamento.payload = entradaEstoquePayload;
                } else if (localDestino.tipo === 'pedido') {
                    const entradaPedidoPayload: EntradaPedidoKitPayload = {
                        kitId: payload.kitId,
                        quantidade: payload.quantidade,
                        pedidoId: localDestino.localId,
                        assemblyInstanceId: payload.assemblyInstanceId,
                    };
                    novoLancamento.tipoEvento = LancamentoProducaoTipoEvento.ENTRADA_PEDIDO_KIT;
                    novoLancamento.payload = entradaPedidoPayload;
                }
                newLancamentos.push(novoLancamento);
            }
        }

        // --- ALL WRITES ---
        transaction.update(grupoMontagemEmbalagemDoc.ref, {
            produtosFinaisNecessarios: updatedProdutosFinaisNecessarios,
            status: newEmbalagemStatus,
        });

        for (const novoLancamento of newLancamentos) {
            transaction.set(db.collection('lancamentosProducao').doc(novoLancamento.id), novoLancamento);
        }
    });
};
