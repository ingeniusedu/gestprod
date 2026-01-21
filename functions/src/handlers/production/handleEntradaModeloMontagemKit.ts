import * as admin from 'firebase-admin';
import {
    LancamentoProducaoTipoEvento,
    EntradaModeloMontagemKitPayload,
    LancamentoProducao,
    GrupoMontagem,
    AtendimentoDetalhado,
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
            // 1. Extrair assemblyInstanceId do kit pai
            const modelAssemblyInstanceId = payload.assemblyInstanceId;
            const modeloId = payload.modeloId;
            const parentKitAssemblyInstanceId = modelAssemblyInstanceId.substring(0, modelAssemblyInstanceId.indexOf(`-${modeloId}-`));

            // 2. Buscar grupo de embalagem para atualizar modelo
            // Quando modelo entra no kit, precisamos atualizar o modelo na embalagem
            const pedidoId = parentKitAssemblyInstanceId.split('-')[0];
            let grupoMontagemEmbalagemDoc = null;
            let grupoMontagemEmbalagem = null;

            if (pedidoId) {
                const packagingAssemblyInstanceId = `${pedidoId}-embalagem-final`;
                const grupoMontagemEmbalagemQuery = await transaction.get(
                    db.collection('gruposMontagem')
                        .where('assemblyInstanceId', '==', packagingAssemblyInstanceId)
                        .where('targetProductType', '==', 'produto_final')
                        .limit(1)
                );

                if (!grupoMontagemEmbalagemQuery.empty) {
                    grupoMontagemEmbalagemDoc = grupoMontagemEmbalagemQuery.docs[0];
                    grupoMontagemEmbalagem = grupoMontagemEmbalagemDoc.data() as GrupoMontagem;
                }
            }

            // 3. Buscar GrupoMontagem do Kit Pai
            const grupoMontagemKitQuery = await transaction.get(
                db.collection('gruposMontagem')
                    .where('assemblyInstanceId', '==', parentKitAssemblyInstanceId)
                    .where('targetProductId', '==', payload.parentKitId)
                    .where('targetProductType', '==', 'kit')
                    .limit(1)
            );

            if (grupoMontagemKitQuery.empty) {
                console.warn(`GrupoMontagem de kit não encontrado para assemblyInstanceId: ${payload.assemblyInstanceId}, parentKitId: ${payload.parentKitId}`);
                return;
            }

            const grupoMontagemKitDoc = grupoMontagemKitQuery.docs[0];
            const grupoMontagemKit = grupoMontagemKitDoc.data() as GrupoMontagem;

            // 4. Atualizar modelosNecessarios
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
                timestamp: admin.firestore.Timestamp.now(),
            });

            modeloNecessario.atendimentoDetalhado = atendimentoDetalhado;
            modelosNecessarios[modeloNecessarioIndex] = modeloNecessario;

            // 5. Verificar Conclusão do Kit
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

                // NÃO gerar automaticamente ENTRADA_KIT_EMBALAGEM
                // Isso deve ser feito apenas quando o usuário concluir a montagem do kit
                // através do handleConclusaoMontagemKit.ts
                console.log(`[DEBUG] Kit pronto para montagem - aguardando conclusão manual do usuário`);
            }

            // 6. Atualizar grupo de embalagem com o modelo concluído
            // Conforme a regra: "entrou modelo, atualiza modelo"
            if (pedidoId && grupoMontagemEmbalagemDoc && grupoMontagemEmbalagem) {
                const updatedProdutosFinaisNecessarios = (grupoMontagemEmbalagem.produtosFinaisNecessarios || []).map((produto: any) => {
                    if (produto.produtoId === payload.parentKitId && produto.tipo === 'kit') {
                        const updatedModelos = (produto.modelos || []).map((modelo: any) => {
                            if (modelo.modeloId === payload.modeloId) {
                                const newQuantidadeAtendida = (modelo.quantidadeAtendida || 0) + payload.quantidade;
                                
                                return {
                                    ...modelo,
                                    quantidadeAtendida: newQuantidadeAtendida
                                };
                            }
                            return modelo;
                        });

                        return {
                            ...produto,
                            modelos: updatedModelos
                        };
                    }
                    return produto;
                });

                transaction.update(grupoMontagemEmbalagemDoc.ref, {
                    produtosFinaisNecessarios: updatedProdutosFinaisNecessarios
                });
                
                console.log(`[DEBUG] Modelo ${payload.modeloId} atualizado na embalagem - quantidade: ${payload.quantidade}`);
            }

            // 7. Todas as escritas (writes)
            transaction.update(grupoMontagemKitDoc.ref, updatedGrupoMontagemKit);
        });
    } catch (error) {
        console.error('Erro ao processar ENTRADA_MODELO_MONTAGEM_KIT:', error);
    }
};
