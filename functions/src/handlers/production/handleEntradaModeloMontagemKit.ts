import * as admin from 'firebase-admin';
import {
    LancamentoProducaoTipoEvento,
    EntradaModeloMontagemKitPayload,
    LancamentoProducao,
    GrupoMontagem,
    AtendimentoDetalhado,
    EntradaKitEmbalagemPayload,
} from '../../types/productionTypes';
import { DocumentSnapshot } from 'firebase-functions/v1/firestore';

export const handleEntradaModeloMontagemKit = async (event: { data?: DocumentSnapshot }) => {
    const db = admin.firestore();

    if (!event.data) {
        console.warn('No data found in event for handleEntradaModeloMontagemKit.');
        return;
    }

    const lancamento = event.data.data() as LancamentoProducao;

    if (lancamento.tipoEvento !== LancamentoProducaoTipoEvento.ENTRADA_MODELO_MONTAGEM_KIT) {
        console.warn(`Tipo de evento inválido para handleEntradaModeloMontagemKit: ${lancamento.tipoEvento}`);
        return;
    }

    const payload = lancamento.payload as EntradaModeloMontagemKitPayload;

    if (!payload.assemblyInstanceId || !payload.modeloId || !payload.quantidade || !payload.parentKitId) {
        console.error('Payload inválido para ENTRADA_MODELO_MONTAGEM_KIT', payload);
        return;
    }

    try {
        await db.runTransaction(async (transaction) => {
            // 1. Buscar GrupoMontagem do Kit Pai
            // O assemblyInstanceId do payload é do modelo, precisamos derivar o do kit pai.
            const modelAssemblyInstanceId = payload.assemblyInstanceId;
            const modeloId = payload.modeloId;
            // Extrai o assemblyInstanceId do kit pai do assemblyInstanceId do modelo
            // Ex: "pedidoId-kitId-1-modeloId-1" -> "pedidoId-kitId-1"
            const parentKitAssemblyInstanceId = modelAssemblyInstanceId.substring(0, modelAssemblyInstanceId.indexOf(`-${modeloId}-`));

            const grupoMontagemKitRef = db.collection('gruposMontagem')
                .where('assemblyInstanceId', '==', parentKitAssemblyInstanceId) // Usar o assemblyInstanceId do kit pai
                .where('targetProductId', '==', payload.parentKitId)
                .where('targetProductType', '==', 'kit')
                .limit(1);

            const grupoMontagemKitSnapshot = await transaction.get(grupoMontagemKitRef);

            if (grupoMontagemKitSnapshot.empty) {
                console.warn(`GrupoMontagem de kit não encontrado para assemblyInstanceId: ${payload.assemblyInstanceId}, parentKitId: ${payload.parentKitId}`);
                return;
            }

            const grupoMontagemKitDoc = grupoMontagemKitSnapshot.docs[0];
            const grupoMontagemKit = grupoMontagemKitDoc.data() as GrupoMontagem;

            // 2. Atualizar modelosNecessarios
            const modelosNecessarios = grupoMontagemKit.modelosNecessarios || [];
            const modeloNecessarioIndex = modelosNecessarios.findIndex(
                (mn) => mn.modeloId === payload.modeloId
            );

            if (modeloNecessarioIndex === -1) {
                console.warn(`Modelo necessário com ID ${payload.modeloId} não encontrado no GrupoMontagem do kit ${grupoMontagemKit.id}`);
                return;
            }

            const modeloNecessario = modelosNecessarios[modeloNecessarioIndex];
            const atendimentoDetalhado: AtendimentoDetalhado[] = modeloNecessario.atendimentoDetalhado || [];

            atendimentoDetalhado.push({
                origem: 'montagem_modelo',
                quantidade: payload.quantidade,
                timestamp: admin.firestore.Timestamp.now(), // Usar Timestamp.now() para campos dentro de arrays
            });

            modeloNecessario.atendimentoDetalhado = atendimentoDetalhado;

            modelosNecessarios[modeloNecessarioIndex] = modeloNecessario;

            // 3. Verificar Conclusão do Kit (TODO)
            let allComponentsAttended = true;

            // Verificar pecasNecessarias
            if (grupoMontagemKit.pecasNecessarias) {
                for (const peca of grupoMontagemKit.pecasNecessarias) {
                    const pecaTotalAtendido = peca.atendimentoDetalhado.reduce((sum, item) => sum + item.quantidade, 0);
                    if (pecaTotalAtendido < peca.quantidade) {
                        allComponentsAttended = false;
                        break;
                    }
                }
            }

            // Verificar modelosNecessarios
            if (allComponentsAttended && grupoMontagemKit.modelosNecessarios) {
                for (const modelo of grupoMontagemKit.modelosNecessarios) {
                    const modeloTotalAtendido = modelo.atendimentoDetalhado.reduce((sum, item) => sum + item.quantidade, 0);
                    if (modeloTotalAtendido < modelo.quantidade) {
                        allComponentsAttended = false;
                        break;
                    }
                }
            }

            const updatedGrupoMontagemKit: Partial<GrupoMontagem> = {
                modelosNecessarios: modelosNecessarios,
            };

            if (allComponentsAttended) {
                updatedGrupoMontagemKit.status = 'pronto_para_montagem';
                updatedGrupoMontagemKit.timestampConclusao = admin.firestore.FieldValue.serverTimestamp();

                // Gerar novo LancamentoProducao para ENTRADA_KIT_EMBALAGEM
                const entradaKitEmbalagemPayload: EntradaKitEmbalagemPayload = {
                    assemblyInstanceId: grupoMontagemKit.assemblyInstanceId,
                    kitId: grupoMontagemKit.targetProductId,
                    quantidade: 1, // Sempre 1 para uma instância de kit
                    // locaisDestino: [] // TODO: Definir locais de destino se aplicável
                };

                const newLancamentoProducaoRef = db.collection('lancamentosProducao').doc();
                transaction.set(newLancamentoProducaoRef, {
                    id: newLancamentoProducaoRef.id,
                    tipoEvento: LancamentoProducaoTipoEvento.ENTRADA_KIT_EMBALAGEM,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    usuarioId: lancamento.usuarioId, // Reutiliza o usuário do evento original
                    payload: entradaKitEmbalagemPayload,
                });
            }

            transaction.update(grupoMontagemKitDoc.ref, updatedGrupoMontagemKit);
        });
    } catch (error) {
        console.error('Erro ao processar ENTRADA_MODELO_MONTAGEM_KIT:', error);
    }
};
