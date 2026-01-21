import * as admin from 'firebase-admin';
import { DocumentSnapshot } from 'firebase-functions/v2/firestore';
import {
    LancamentoProducao,
    ConclusaoMontagemModeloPayload,
    EntradaModeloMontagemPayload,
    EntradaModeloEmbalagemPayload,
    LancamentoProducaoTipoEvento
} from '../../types/productionTypes';
export async function handleConclusaoMontagemModelo(event: { data?: DocumentSnapshot }) {
    const db = admin.firestore();
    const lancamento = event.data?.data() as LancamentoProducao | undefined;

    if (!lancamento) {
        console.error('Nenhum dado de lançamento de conclusão de montagem de modelo encontrado');
        return;
    }

    try {
        // Extração segura do usuarioId
        const extractUserId = (data: any): string => {
            if (data.usuarioId) return data.usuarioId;
            if (data._fieldsProto?.usuarioId?.stringValue) {
                return data._fieldsProto.usuarioId.stringValue;
            }
            return 'sistema'; // Fallback garantido
        };

        const usuarioId = extractUserId(lancamento);
        const payload = lancamento.payload as ConclusaoMontagemModeloPayload;

        if (!payload || !payload.assemblyGroupId || !payload.targetProductId || !payload.targetProductType) {
            throw new Error('Payload inválido: assemblyGroupId, targetProductId e targetProductType são obrigatórios');
        }

        const assemblyGroupId = payload.assemblyGroupId;
        const targetProductId = payload.targetProductId;
        const parentKitId = payload.parentKitId;
        const assemblyInstanceId = payload.assemblyInstanceId;
        const quantidade = payload.quantidade;

        await db.runTransaction(async (transaction) => {
            // === FASE 1: TODAS AS LEITURAS ===
            const grupoOrigemRef = db.collection('gruposMontagem').doc(assemblyGroupId);
            const grupoOrigemSnapshot = await transaction.get(grupoOrigemRef);

            if (!grupoOrigemSnapshot.exists) {
                throw new Error(`Grupo de origem ${assemblyGroupId} não encontrado`);
            }

            const grupoOrigemData = grupoOrigemSnapshot.data();

            // Buscar documento do modelo para obter tempoMontagemAdicional (LEITURA)
            const modeloRef = db.collection('modelos').doc(targetProductId);
            const modeloSnapshot = await transaction.get(modeloRef);

            // === DEBUG: Processar informações do modelo ===
            let tempoMontagemAdicionalMinutos = 0;
            console.log(`[DEBUG] Buscando modelo ${targetProductId} para tempoMontagemAdicional`);
            
            if (modeloSnapshot.exists) {
                const modeloData = modeloSnapshot.data();
                tempoMontagemAdicionalMinutos = parseFloat(modeloData?.tempoMontagemAdicional) || 0;
                console.log(`[DEBUG] Modelo encontrado - tempoMontagemAdicional: ${modeloData?.tempoMontagemAdicional} -> convertido: ${tempoMontagemAdicionalMinutos}`);
            } else {
                console.log(`[DEBUG] Modelo ${targetProductId} NÃO encontrado`);
            }
            
            console.log(`[DEBUG] Verificando condição - tempoMontagemAdicionalMinutos: ${tempoMontagemAdicionalMinutos} > 0: ${tempoMontagemAdicionalMinutos > 0}`);

            // === FASE ADICIONAL: LEITURA DE INSUMOS (ANTES DO LOOP) ===
            let insumosMontagemMap: Map<string, any> = new Map();
            
            if (modeloSnapshot.exists) {
                const modeloData = modeloSnapshot.data();
                const insumosAdicionais = modeloData?.insumosAdicionais || [];
                
                console.log(`[DEBUG] Insumos adicionais do modelo ${targetProductId}:`, insumosAdicionais);
                
                // Ler todos os insumos necessários ANTES do loop
                const insumoIds = insumosAdicionais.map((insumo: any) => insumo.insumoId);
                const insumoDocs = await Promise.all(
                    insumoIds.map((insumoId: string) => transaction.get(db.collection('insumos').doc(insumoId)))
                );
                
                // Criar mapa de insumos para fácil acesso
                insumoDocs.forEach((doc, index) => {
                    if (doc.exists) {
                        insumosMontagemMap.set(insumoIds[index], doc.data());
                    }
                });
            }

            // === FASE 2: TODAS AS ESCRITAS ===
            // 1. Atualiza status apenas se não estiver montado
            const currentStatus = grupoOrigemData?.status;
            if (currentStatus !== 'montado') {
                transaction.update(grupoOrigemRef, {
                    status: 'montado',
                    timestampConclusao: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // 2. Determine next event based on context
            let nextTipoEvento: LancamentoProducaoTipoEvento;
            let nextPayload: EntradaModeloMontagemPayload | EntradaModeloEmbalagemPayload;

            if (parentKitId) {
                // If there's a parent kit, send to kit assembly
                nextTipoEvento = LancamentoProducaoTipoEvento.ENTRADA_MODELO_MONTAGEM_KIT;
                nextPayload = {
                    assemblyInstanceId: assemblyInstanceId,
                    modeloId: targetProductId,
                    quantidade: quantidade,
                    parentKitId: parentKitId,
                };
            } else {
                // If no parent kit, send to packaging
                nextTipoEvento = LancamentoProducaoTipoEvento.ENTRADA_MODELO_EMBALAGEM;
                nextPayload = {
                    assemblyInstanceId: assemblyInstanceId,
                    modeloId: targetProductId,
                    quantidade: quantidade,
                    parentKitId: null,
                };
            }

            const newLancamentoProducaoRef = db.collection('lancamentosProducao').doc();
            transaction.create(newLancamentoProducaoRef, {
                id: newLancamentoProducaoRef.id,
                tipoEvento: nextTipoEvento,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                usuarioId: usuarioId,
                payload: nextPayload,
            });

            // 3. Lançar consumo de insumos de montagem
            const newLancamentosInsumos: any[] = [];
            try {
                // Extrair insumos de montagem do modelo (todos - sem filtro de etapa)
                if (modeloSnapshot.exists) {
                    const modeloData = modeloSnapshot.data();
                    const insumosAdicionais = modeloData?.insumosAdicionais || [];
                    
                    console.log(`[DEBUG] Insumos adicionais do modelo ${targetProductId}:`, insumosAdicionais);
                    
                    // Para cada insumo adicional, criar lançamento (todos são para montagem)
                    for (const insumo of insumosAdicionais) {
                        const quantidadeInsumo = typeof insumo.quantidade === 'string' ? parseFloat(insumo.quantidade) : insumo.quantidade;
                        
                        if (quantidadeInsumo > 0) {
                            let locaisParaLancamento: { recipienteId: string; quantidade: number }[] = [];
                            
                            // Usar dados do insumo do mapa pré-carregado
                            const insumoData = insumosMontagemMap.get(insumo.insumoId);
                            if (insumoData) {
                                
                                if (insumoData.tipo === 'material' && insumoData?.posicoesEstoque) {
                                    locaisParaLancamento = insumoData.posicoesEstoque.map((pos: any) => ({
                                        recipienteId: pos.recipienteId,
                                        localId: pos.localId,
                                        divisao: pos.divisao || null,
                                        quantidade: quantidadeInsumo,
                                    }));
                                } else {
                                    locaisParaLancamento = (insumoData.localEstoqueInsumo || []).map((local: any) => ({
                                        recipienteId: local.recipienteId,
                                        quantidade: local.quantidade,
                                    }));
                                }
                                
                                const lancamentoInsumo = {
                                    insumoId: insumo.insumoId,
                                    tipoInsumo: insumoData.tipo || 'desconhecido',
                                    tipoMovimento: 'saida',
                                    quantidade: quantidadeInsumo,
                                    unidadeMedida: 'unidades',
                                    data: admin.firestore.Timestamp.now(),
                                    detalhes: `Consumo para montagem de modelo: ${grupoOrigemData?.targetProductName || 'Modelo'} (ID: ${targetProductId})`,
                                    locais: locaisParaLancamento,
                                    pedidoId: grupoOrigemData?.pedidoId,
                                    usuario: usuarioId,
                                    origem: 'producao',
                                };
                                
                                newLancamentosInsumos.push(lancamentoInsumo);
                                console.log(`[SUCCESS] Insumo de montagem de modelo lançado: ${insumoData.nome || 'Insumo sem nome'} (${quantidadeInsumo} ${insumoData.tipo})`);
                            } else {
                                console.warn(`[WARNING] Insumo ${insumo.insumoId} não encontrado no mapa pré-carregado. Lançamento ignorado.`);
                            }
                        }
                    }
                }
                
                // Criar os lançamentos de insumos
                for (const lancamentoInsumo of newLancamentosInsumos) {
                    transaction.create(db.collection('lancamentosInsumos').doc(), lancamentoInsumo);
                }
            } catch (insumosError) {
                console.error(`[ERROR] Erro ao processar insumos de montagem de modelo:`, insumosError);
                throw insumosError;
            }

            // 4. Lançar serviço de montagem
            try {
                if (tempoMontagemAdicionalMinutos > 0) {
                    const lancamentoServicoRef = db.collection('lancamentosServicos').doc();
                    const lancamentoServico = {
                        serviceType: 'montagem',
                        origem: 'pedido',
                        usuario: usuarioId,
                        data: admin.firestore.FieldValue.serverTimestamp(),
                        payload: {
                            tipo: 'modelo',
                            total: tempoMontagemAdicionalMinutos,
                            pedidoId: grupoOrigemData?.pedidoId,
                            assemblyGroup: assemblyGroupId
                        }
                    };
                    transaction.create(lancamentoServicoRef, lancamentoServico);
                    console.log(`[SUCCESS] Serviço de montagem de modelo lançado: ${tempoMontagemAdicionalMinutos} minutos`);
                } else {
                    console.log(`[INFO] Modelo ${targetProductId} não tem tempoMontagemAdicional (${tempoMontagemAdicionalMinutos}), serviço não lançado`);
                }
            } catch (serviceError) {
                console.error(`[ERROR] Erro ao criar lançamento de serviço:`, serviceError);
                throw serviceError;
            }

            console.log(`Grupo de montagem de modelo ${assemblyGroupId} concluído com sucesso. Próximo evento: ${nextTipoEvento}`);
        });
    } catch (error) {
        console.error('Erro no processamento da conclusão de montagem de modelo:', error);
        throw error;
    }
}
