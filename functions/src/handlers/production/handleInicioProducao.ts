import * as admin from 'firebase-admin';
import { DocumentSnapshot } from 'firebase-functions/v2/firestore';
import { LancamentoProducao, InicioProducaoPayload, GrupoProducaoOtimizado } from '../../types/productionTypes';

export async function handleInicioProducao(event: { data?: DocumentSnapshot }) {
    const db = admin.firestore();
    const lancamento = event.data?.data() as LancamentoProducao | undefined;

    if (!lancamento) {
        console.error('Nenhum dado de lançamento de início de produção encontrado');
        return;
    }

    // Type narrowing for inicio_producao payload
    if (lancamento.tipoEvento !== 'inicio_producao') {
        console.error(`Evento de tipo inesperado para início de produção: ${lancamento.tipoEvento}`);
        return;
    }

    const payload = lancamento.payload as InicioProducaoPayload;

    try {
        // Validar payload
        if (!payload || !payload.groupId) {
            throw new Error('Payload inválido: groupId é obrigatório para início de produção');
        }

        const { groupId } = payload;

        await db.runTransaction(async (transaction) => {
            console.log(`Processando início de produção para o grupo: ${groupId}`);

            const grupoRef = db.collection('gruposProducaoOtimizados').doc(groupId);
            const grupoDoc = await transaction.get(grupoRef);

            if (!grupoDoc.exists) {
                throw new Error(`Grupo de produção otimizado com ID ${groupId} não encontrado.`);
            }

            const grupoData = grupoDoc.data() as GrupoProducaoOtimizado;

            if (grupoData.status !== 'aguardando') {
                throw new Error(`Não é possível iniciar a produção para o grupo ${groupId}. Status atual: ${grupoData.status}`);
            }

            let pedidoRef: admin.firestore.DocumentReference | undefined;
            let pedidoDoc: admin.firestore.DocumentSnapshot | undefined;

            if (grupoData.pedidoId) {
                pedidoRef = db.collection('pedidos').doc(grupoData.pedidoId);
                pedidoDoc = await transaction.get(pedidoRef);
            }

            // All writes after all reads
            transaction.update(grupoRef, {
                status: 'em_producao',
                startedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            if (pedidoDoc && pedidoDoc.exists && pedidoRef) {
                const pedidoData = pedidoDoc.data();
                if (pedidoData && pedidoData.status === 'aguardando_producao') {
                    transaction.update(pedidoRef, {
                        status: 'em_producao',
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
        });

        console.log(`Produção para o grupo ${groupId} iniciada com sucesso.`);
    } catch (error) {
        console.error(`Erro ao processar início de produção para o grupo ${payload?.groupId}:`, error);
        throw error;
    }
}
