import * as admin from 'firebase-admin';
import { DocumentSnapshot } from 'firebase-functions/v1/firestore';
import {
    EntradaModeloEmbalagemPayload,
    LancamentoProducaoTipoEvento,
    LancamentoProducao,
    EntradaEstoqueModeloPayload,
    EntradaPedidoModeloPayload,
} from '../../types/productionTypes';

export const handleEntradaModeloEmbalagem = async (event: { data?: DocumentSnapshot }) => {
    const db = admin.firestore();
    if (!event.data) {
        console.warn('No data found in event for handleEntradaModeloEmbalagem.');
        return;
    }

    const lancamento = event.data.data() as LancamentoProducao;

    if (lancamento.tipoEvento !== LancamentoProducaoTipoEvento.ENTRADA_MODELO_EMBALAGEM) {
        console.warn(`Tipo de evento inválido: ${lancamento.tipoEvento}. Esperado: ${LancamentoProducaoTipoEvento.ENTRADA_MODELO_EMBALAGEM}`);
        return;
    }

    const payload = lancamento.payload as EntradaModeloEmbalagemPayload;

    if (!payload.assemblyInstanceId || !payload.modeloId || !payload.quantidade) {
        console.error('Payload inválido para ENTRADA_MODELO_EMBALAGEM: assemblyInstanceId, modeloId e quantidade são obrigatórios', payload);
        return;
    }
    console.log('[DEBUG handleEntradaModeloEmbalagem] Payload válido:', payload);

    await db.runTransaction(async (transaction) => {
        console.log('[DEBUG handleEntradaModeloEmbalagem] Iniciando transação.');

        // Extract pedidoId from assemblyInstanceId
        const pedidoId = payload.assemblyInstanceId.split('-')[0];
        if (!pedidoId) {
            console.error('Pedido ID não pôde ser extraído do assemblyInstanceId para ENTRADA_MODELO_EMBALAGEM.');
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
            if (produto.produtoId === payload.modeloId && produto.tipo === 'modelo') {
                const newQuantidadeAtendida = (produto.quantidadeAtendida || 0) + payload.quantidade;
                if (newQuantidadeAtendida < produto.quantidade) {
                    allItemsAttended = false;
                }
                return { ...produto, quantidadeAtendida: newQuantidadeAtendida };
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
        if (payload.locaisDestino && payload.locaisDestino.length > 0) { // Only process if locaisDestino exists and is not empty
            for (const localDestino of payload.locaisDestino) {
                const novoLancamento: LancamentoProducao = {
                    id: db.collection('lancamentosProducao').doc().id, // Generate ID here
                    timestamp: admin.firestore.Timestamp.now(),
                    usuarioId: lancamento.usuarioId,
                    payload: {} as any,
                    tipoEvento: LancamentoProducaoTipoEvento.ENTRADA_MODELO_EMBALAGEM,
                };

            if (localDestino.tipo === 'estoque') {
                const entradaEstoquePayload: EntradaEstoqueModeloPayload = { // Changed payload type
                    modeloId: payload.modeloId, // Changed ID field
                    quantidade: payload.quantidade,
                    localId: localDestino.localId,
                    assemblyInstanceId: payload.assemblyInstanceId,
                };
                novoLancamento.tipoEvento = LancamentoProducaoTipoEvento.ENTRADA_ESTOQUE_MODELO; // Changed event type
                novoLancamento.payload = entradaEstoquePayload;
            } else if (localDestino.tipo === 'pedido') {
                const entradaPedidoPayload: EntradaPedidoModeloPayload = { // Changed payload type
                    modeloId: payload.modeloId, // Changed ID field
                    quantidade: payload.quantidade,
                    pedidoId: localDestino.localId,
                    assemblyInstanceId: payload.assemblyInstanceId,
                };
                novoLancamento.tipoEvento = LancamentoProducaoTipoEvento.ENTRADA_PEDIDO_MODELO; // Changed event type
                novoLancamento.payload = entradaPedidoPayload;
            }
            newLancamentos.push(novoLancamento);
        }
        } // Closing brace for the if (payload.locaisDestino && payload.locaisDestino.length > 0)
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
