import * as admin from 'firebase-admin';
import { DocumentSnapshot } from 'firebase-functions/v1/firestore';
import {
    EntradaPecaEmbalagemPayload,
    LancamentoProducaoTipoEvento,
    LancamentoProducao,
    EntradaEstoquePecaPayload,
    EntradaPedidoPecaPayload,
} from '../../types/productionTypes';

export const handleEntradaPecaEmbalagem = async (event: { data?: DocumentSnapshot }) => {
    const db = admin.firestore();
    if (!event.data) {
        console.warn('No data found in event for handleEntradaPecaEmbalagem.');
        return;
    }

    const lancamento = event.data.data() as LancamentoProducao;

    if (lancamento.tipoEvento !== LancamentoProducaoTipoEvento.ENTRADA_PECA_EMBALAGEM) {
        console.warn(`Tipo de evento inválido: ${lancamento.tipoEvento}. Esperado: ${LancamentoProducaoTipoEvento.ENTRADA_PECA_EMBALAGEM}`);
        return;
    }

    const payload = lancamento.payload as EntradaPecaEmbalagemPayload;

    if (!payload.assemblyInstanceId || !payload.pecaId || !payload.quantidade || !payload.locaisDestino) {
        console.error('Payload inválido para ENTRADA_PECA_EMBALAGEM:', payload);
        return;
    }
    console.log('[DEBUG handleEntradaPecaEmbalagem] Payload válido:', payload);

    await db.runTransaction(async (transaction) => {
        console.log('[DEBUG handleEntradaPecaEmbalagem] Iniciando transação.');

        // --- ALL READS FIRST ---
        const gruposProducaoOtimizadosRef = db.collection('gruposProducaoOtimizados');
        const grupoProducaoOtimizadoQuerySnapshot = await transaction.get(
            gruposProducaoOtimizadosRef.where('pedidosOrigem', '!=', [])
        );
        console.log(`[DEBUG handleEntradaPecaEmbalagem] Query Snapshot size: ${grupoProducaoOtimizadoQuerySnapshot.size}`);

        // Extract pedidoId from assemblyInstanceId
        const pedidoId = payload.assemblyInstanceId.split('-')[0];
        if (!pedidoId) {
            console.error('Pedido ID não pôde ser extraído do assemblyInstanceId para ENTRADA_PECA_EMBALAGEM.');
            return;
        }

        const grupoMontagemEmbalagemQuerySnapshot = await transaction.get(
            db.collection('gruposMontagem')
                .where('pedidoId', '==', pedidoId)
                .where('targetProductType', '==', 'produto_final')
                .limit(1)
        );

        // --- PROCESS DATA AND PREPARE UPDATES ---
        let foundGrupoProducaoOtimizadoDoc: admin.firestore.QueryDocumentSnapshot | undefined;
        let updatedPedidosOrigem: any[] = [];

        if (grupoProducaoOtimizadoQuerySnapshot.empty) {
            console.warn(`[DEBUG handleEntradaPecaEmbalagem] Nenhum GrupoProducaoOtimizado com pedidosOrigem não vazio encontrado.`);
        }

        for (const doc of grupoProducaoOtimizadoQuerySnapshot.docs) {
            console.log(`[DEBUG handleEntradaPecaEmbalagem] Processando GrupoProducaoOtimizado Doc ID: ${doc.id}`);
            const grupoProducaoOtimizado = doc.data();
            const pedidosOrigem = grupoProducaoOtimizado.pedidosOrigem;

            let assemblyInstanceFound = false;
            const tempUpdatedPedidosOrigem = pedidosOrigem.map((pedidoOrigem: any) => {
                console.log(`[DEBUG handleEntradaPecaEmbalagem] Processando PedidoOrigem: ${JSON.stringify(pedidoOrigem)}`);
                return {
                    ...pedidoOrigem,
                    assemblyInstances: pedidoOrigem.assemblyInstances.map((instance: any) => {
                        console.log(`[DEBUG handleEntradaPecaEmbalagem] Verificando AssemblyInstance ID: ${instance.assemblyInstanceId} contra payload ID: ${payload.assemblyInstanceId}`);
                        if (instance.assemblyInstanceId === payload.assemblyInstanceId) {
                            assemblyInstanceFound = true;
                            console.log(`[DEBUG handleEntradaPecaEmbalagem] AssemblyInstance encontrada! ID: ${payload.assemblyInstanceId}`);
                            return {
                                ...instance,
                                status: 'produzido', // Mark as produced, as optimized group life ends here
                            };
                        }
                        return instance;
                    }),
                };
            });

            if (assemblyInstanceFound) {
                foundGrupoProducaoOtimizadoDoc = doc;
                updatedPedidosOrigem = tempUpdatedPedidosOrigem;
                console.log(`[DEBUG handleEntradaPecaEmbalagem] GrupoProducaoOtimizado com AssemblyInstance correspondente encontrado: ${doc.id}`);
                break;
            }
        }

        if (!foundGrupoProducaoOtimizadoDoc) {
            console.warn(`GrupoProducaoOtimizado contendo AssemblyInstance com ID ${payload.assemblyInstanceId} não encontrado.`);
            return;
        }

        if (grupoMontagemEmbalagemQuerySnapshot.empty) {
            console.warn(`GrupoMontagem de embalagem para o pedido ${pedidoId} não encontrado.`);
            return;
        }

        const grupoMontagemEmbalagemDoc = grupoMontagemEmbalagemQuerySnapshot.docs[0];
        const grupoMontagemEmbalagem = grupoMontagemEmbalagemDoc.data();

        let allItemsAttended = true;
        const updatedProdutosFinaisNecessarios = (grupoMontagemEmbalagem.produtosFinaisNecessarios || []).map((produto: any) => {
            if (produto.produtoId === payload.pecaId && produto.tipo === 'peca') {
                const newQuantidadeAtendida = (produto.quantidadeAtendida || 0) + payload.quantidade;
                if (newQuantidadeAtendida < produto.quantidade) {
                    allItemsAttended = false;
                }
                return { ...produto, quantidadeAtendida: newQuantidadeAtendida };
            }
            if (produto.quantidadeAtendida < produto.quantidade) {
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
        for (const localDestino of payload.locaisDestino) {
            const novoLancamento: LancamentoProducao = {
                id: db.collection('lancamentosProducao').doc().id, // Generate ID here
                timestamp: admin.firestore.Timestamp.now(),
                usuarioId: lancamento.usuarioId,
                payload: {} as any,
                tipoEvento: LancamentoProducaoTipoEvento.ENTRADA_PECA_EMBALAGEM,
            };

            if (localDestino.tipo === 'estoque') {
                const entradaEstoquePayload: EntradaEstoquePecaPayload = {
                    pecaId: payload.pecaId,
                    quantidade: payload.quantidade,
                    localId: localDestino.localId,
                    assemblyInstanceId: payload.assemblyInstanceId,
                };
                novoLancamento.tipoEvento = LancamentoProducaoTipoEvento.ENTRADA_ESTOQUE_PECA;
                novoLancamento.payload = entradaEstoquePayload;
            } else if (localDestino.tipo === 'pedido') {
                const entradaPedidoPayload: EntradaPedidoPecaPayload = {
                    pecaId: payload.pecaId,
                    quantidade: payload.quantidade,
                    pedidoId: localDestino.localId,
                    assemblyInstanceId: payload.assemblyInstanceId,
                };
                novoLancamento.tipoEvento = LancamentoProducaoTipoEvento.ENTRADA_PEDIDO_PECA;
                novoLancamento.payload = entradaPedidoPayload;
            }
            newLancamentos.push(novoLancamento);
        }

        // --- ALL WRITES ---
        transaction.update(foundGrupoProducaoOtimizadoDoc.ref, {
            pedidosOrigem: updatedPedidosOrigem,
        });

        transaction.update(grupoMontagemEmbalagemDoc.ref, {
            produtosFinaisNecessarios: updatedProdutosFinaisNecessarios,
            status: newEmbalagemStatus,
        });

        for (const novoLancamento of newLancamentos) {
            transaction.set(db.collection('lancamentosProducao').doc(novoLancamento.id), novoLancamento);
        }
    });
};
