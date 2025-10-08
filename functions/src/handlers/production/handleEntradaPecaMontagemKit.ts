import * as admin from 'firebase-admin';
import { DocumentSnapshot } from 'firebase-functions/v1/firestore';
import {
    LancamentoProducao,
    LancamentoProducaoTipoEvento,
    EntradaPecaMontagemKitPayload,
    GrupoMontagem,
    EntradaKitEmbalagemPayload
} from '../../types/productionTypes';

export const handleEntradaPecaMontagemKit = async (event: { data?: DocumentSnapshot }) => {
    const db = admin.firestore();
    if (!event.data) {
        console.warn('No data found in event for handleEntradaPecaMontagemKit.');
        return;
    }

    const lancamento = event.data.data() as LancamentoProducao;

    if (lancamento.tipoEvento !== LancamentoProducaoTipoEvento.ENTRADA_PECA_MONTAGEM_KIT) {
        console.warn(`Tipo de evento inválido para handleEntradaPecaMontagemKit: ${lancamento.tipoEvento}`);
        return;
    }

    const payload = lancamento.payload as EntradaPecaMontagemKitPayload;

    if (!payload.assemblyInstanceId || !payload.pecaId || !payload.quantidade || !payload.parentKitId) {
        console.error('Payload inválido para ENTRADA_PECA_MONTAGEM_KIT. Campos obrigatórios ausentes.');
        return;
    }

    await db.runTransaction(async (transaction) => {
        // O assemblyInstanceId do payload é da peça, precisamos derivar o do kit pai.
        const pieceAssemblyInstanceId = payload.assemblyInstanceId;
        const pecaId = payload.pecaId;
        // Extrai o assemblyInstanceId do kit pai do assemblyInstanceId da peça
        // Ex: "pedidoId-kitId-1-pecaId-1" -> "pedidoId-kitId-1"
        const parentKitAssemblyInstanceId = pieceAssemblyInstanceId.substring(0, pieceAssemblyInstanceId.indexOf(`-${pecaId}-`));

        // 1. Buscar GrupoMontagem do Kit Pai
        const grupoMontagemKitQuery = await transaction.get(
            db.collection('gruposMontagem')
                .where('assemblyInstanceId', '==', parentKitAssemblyInstanceId) // Usar o assemblyInstanceId do kit pai
                .where('targetProductId', '==', payload.parentKitId)
                .where('targetProductType', '==', 'kit')
                .limit(1)
        );

        if (grupoMontagemKitQuery.empty) {
            console.warn(`GrupoMontagem de kit não encontrado para assemblyInstanceId: ${payload.assemblyInstanceId} e parentKitId: ${payload.parentKitId}`);
            return;
        }

        const grupoMontagemKitDoc = grupoMontagemKitQuery.docs[0];
        const grupoMontagemKit = grupoMontagemKitDoc.data() as GrupoMontagem;

        // 2. Atualizar pecasNecessarias
        if (!grupoMontagemKit.pecasNecessarias) {
            grupoMontagemKit.pecasNecessarias = [];
        }

        const pecaNecessariaIndex = grupoMontagemKit.pecasNecessarias.findIndex(
            (p) => p.pecaId === payload.pecaId
        );

        if (pecaNecessariaIndex === -1) {
            console.warn(`Peca ${payload.pecaId} não encontrada em pecasNecessarias do GrupoMontagem ${grupoMontagemKitDoc.id}`);
            return;
        }

        const pecaNecessaria = grupoMontagemKit.pecasNecessarias[pecaNecessariaIndex];

        if (!pecaNecessaria.atendimentoDetalhado) {
            pecaNecessaria.atendimentoDetalhado = [];
        }

        pecaNecessaria.atendimentoDetalhado.push({
            origem: 'montagem_peca',
            quantidade: payload.quantidade,
            timestamp: admin.firestore.Timestamp.now(),
        });


        // 3. Verificar Conclusão do Kit
        const allPecasAtendidas = grupoMontagemKit.pecasNecessarias.every(
            (p) => p.atendimentoDetalhado.reduce((sum, item) => sum + item.quantidade, 0) >= p.quantidade
        );

        const allModelosAtendidos = grupoMontagemKit.modelosNecessarios?.every(
            (m) => m.atendimentoDetalhado.reduce((sum, item) => sum + item.quantidade, 0) >= m.quantidade
        ) ?? true; // Se não houver modelosNecessarios, considera como atendido

        if (allPecasAtendidas && allModelosAtendidos) {
            grupoMontagemKit.status = 'pronto_para_montagem'; // Corrected status
            grupoMontagemKit.timestampConclusao = admin.firestore.FieldValue.serverTimestamp();

            // Gerar novo LancamentoProducao para ENTRADA_KIT_EMBALAGEM
            const newLancamentoProducaoRef = db.collection('lancamentosProducao').doc();
            const entradaKitEmbalagemPayload: EntradaKitEmbalagemPayload = {
                assemblyInstanceId: grupoMontagemKit.assemblyInstanceId,
                kitId: grupoMontagemKit.targetProductId,
                quantidade: 1, // Sempre 1 para uma instância de kit
                // locaisDestino: [] // TODO: Definir locais de destino se aplicável
            };

            const newLancamentoProducao: LancamentoProducao = {
                id: newLancamentoProducaoRef.id,
                tipoEvento: LancamentoProducaoTipoEvento.ENTRADA_KIT_EMBALAGEM,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                usuarioId: lancamento.usuarioId, // Reutiliza o usuário do evento original
                payload: entradaKitEmbalagemPayload,
            };
            transaction.set(newLancamentoProducaoRef, newLancamentoProducao);
        }

        const updateData: Partial<GrupoMontagem> = {
            status: grupoMontagemKit.status,
            pecasNecessarias: grupoMontagemKit.pecasNecessarias,
            modelosNecessarios: grupoMontagemKit.modelosNecessarios,
        };

        if (grupoMontagemKit.timestampConclusao !== undefined) {
            updateData.timestampConclusao = grupoMontagemKit.timestampConclusao;
        }

        transaction.update(grupoMontagemKitDoc.ref, updateData);
    });
};
