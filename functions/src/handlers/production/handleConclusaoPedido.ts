import * as admin from 'firebase-admin';
import { DocumentSnapshot } from 'firebase-functions/v2/firestore';
import {
    LancamentoProducao,
    ConclusaoPedidoPayload,
    LancamentoInsumo,
    LancamentoServico
} from '../../types/productionTypes';

export async function handleConclusaoPedido(event: { data?: DocumentSnapshot }) {
    const db = admin.firestore();
    const lancamento = event.data?.data() as LancamentoProducao | undefined;

    if (!lancamento) {
        console.error('Nenhum dado de lançamento de conclusão de pedido encontrado');
        return;
    }

    if (lancamento.tipoEvento !== 'conclusao_pedido') {
        console.error(`Tipo de evento inválido para conclusão de pedido: ${lancamento.tipoEvento}`);
        return;
    }

    try {
        const payload = lancamento.payload as ConclusaoPedidoPayload;

        if (!payload || !payload.pedidoId || !payload.assemblyGroupId || !payload.usuarioId) {
            throw new Error('Payload inválido: pedidoId, assemblyGroupId e usuarioId são obrigatórios');
        }

        const {
            pedidoId,
            pedidoNumero,
            assemblyGroupId,
            usuarioId,
            tempoEmbalagem,
            insumosEmbalagem
        } = payload;

        await db.runTransaction(async (transaction) => {
            // === FASE 1: TODAS AS LEITURAS ===
            
            // Buscar grupo de montagem
            const grupoMontagemRef = db.collection('gruposMontagem').doc(assemblyGroupId);
            const grupoMontagemSnapshot = await transaction.get(grupoMontagemRef);

            if (!grupoMontagemSnapshot.exists) {
                throw new Error(`Grupo de montagem ${assemblyGroupId} não encontrado`);
            }

            // Buscar pedido
            const pedidoRef = db.collection('pedidos').doc(pedidoId);
            const pedidoSnapshot = await transaction.get(pedidoRef);

            if (!pedidoSnapshot.exists) {
                throw new Error(`Pedido ${pedidoId} não encontrado`);
            }

            // === FASE 2: LEITURA DE INSUMOS (ANTES DO LOOP) ===
            let insumosMap: Map<string, any> = new Map();
            
            if (insumosEmbalagem && insumosEmbalagem.length > 0) {
                // Ler todos os insumos necessários ANTES do loop
                const insumoIds = insumosEmbalagem.map(insumo => insumo.insumoId);
                const insumoDocs = await Promise.all(
                    insumoIds.map((insumoId: string) => transaction.get(db.collection('insumos').doc(insumoId)))
                );
                
                // Criar mapa de insumos para fácil acesso
                insumoDocs.forEach((doc, index) => {
                    if (doc.exists) {
                        insumosMap.set(insumoIds[index], doc.data());
                    }
                });
            }

            // === FASE 3: TODAS AS ESCRITAS ===

            // 1. Atualizar status do grupo de montagem para 'finalizado'
            transaction.update(grupoMontagemRef, {
                status: 'finalizado',
                timestampConclusao: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 2. Atualizar status do pedido para 'concluido'
            transaction.update(pedidoRef, {
                status: 'concluido',
                dataConclusao: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 3. Criar lançamentos de consumo de insumos (embalagem)
            const newLancamentosInsumos: LancamentoInsumo[] = [];
            
            if (insumosEmbalagem && insumosEmbalagem.length > 0) {
                for (const insumoEmbalagem of insumosEmbalagem) {
                    const quantidadeInsumo = typeof insumoEmbalagem.quantidade === 'string' 
                        ? parseFloat(insumoEmbalagem.quantidade) 
                        : insumoEmbalagem.quantidade;
                    
                    if (quantidadeInsumo > 0) {
                        const insumoData = insumosMap.get(insumoEmbalagem.insumoId);
                        
                        if (insumoData) {
                            let locaisParaLancamento: { recipienteId: string; quantidade: number; localId?: string; divisao?: any }[] = [];
                            
                            // Usar dados do insumo do mapa pré-carregado
                            if (insumoData.tipo === 'material' && insumoData?.posicoesEstoque) {
                                locaisParaLancamento = insumoData.posicoesEstoque.map((pos: any) => ({
                                    recipienteId: pos.recipienteId,
                                    localId: pos.localId,
                                    divisao: pos.divisao || null,
                                    quantidade: quantidadeInsumo,
                                }));
                            } else if (insumoData.tipo === 'material' && insumoData?.posicoesEstoque) {
                                // Para embalagem que também é material, usar posicoesEstoque
                                locaisParaLancamento = insumoData.posicoesEstoque.map((pos: any) => ({
                                    recipienteId: pos.recipienteId,
                                    localId: pos.localId,
                                    divisao: pos.divisao || null,
                                    quantidade: quantidadeInsumo,
                                }));
                            } else {
                                // Para outros tipos (incluindo embalagem), tentar usar posicoesEstoque primeiro
                                if (insumoData?.posicoesEstoque) {
                                    locaisParaLancamento = insumoData.posicoesEstoque.map((pos: any) => ({
                                        recipienteId: pos.recipienteId,
                                        localId: pos.localId,
                                        divisao: pos.divisao || null,
                                        quantidade: quantidadeInsumo,
                                    }));
                                } else {
                                    // Fallback para localEstoqueInsumo
                                    locaisParaLancamento = (insumoData.localEstoqueInsumo || []).map((local: any) => ({
                                        recipienteId: local.recipienteId,
                                        localId: local.localId || 'default-location', // Garantir que tenha localId
                                        divisao: local.divisao || { h: 0, v: 0 }, // Garantir que tenha divisao
                                        quantidade: local.quantidade,
                                    }));
                                }
                            }
                            
                            const lancamentoInsumo: LancamentoInsumo = {
                                insumoId: insumoEmbalagem.insumoId,
                                tipoInsumo: 'embalagem',
                                tipoMovimento: 'saida',
                                quantidade: quantidadeInsumo,
                                unidadeMedida: 'unidades',
                                data: admin.firestore.Timestamp.now(),
                                detalhes: `Consumo de embalagem para pedido: ${pedidoNumero || pedidoId}`,
                                locais: locaisParaLancamento,
                                pedidoId: pedidoId,
                                usuario: usuarioId,
                                origem: 'embalagem_pedido',
                            };
                            
                            newLancamentosInsumos.push(lancamentoInsumo);
                            console.log(`[SUCCESS] Insumo de embalagem lançado: ${insumoData.nome || 'Insumo sem nome'} (${quantidadeInsumo} unidades)`);
                        } else {
                            console.warn(`[WARNING] Insumo ${insumoEmbalagem.insumoId} não encontrado no mapa pré-carregado. Lançamento ignorado.`);
                        }
                    }
                }
                
                // Criar os lançamentos de insumos
                for (const lancamentoInsumo of newLancamentosInsumos) {
                    transaction.create(db.collection('lancamentosInsumos').doc(), lancamentoInsumo);
                }
            }

            // 4. Criar lançamento de serviço (embalagem)
            if (tempoEmbalagem > 0) {
                const lancamentoServicoRef = db.collection('lancamentosServicos').doc();
                const lancamentoServico: LancamentoServico = {
                    serviceType: 'embalagem',
                    origem: 'pedido',
                    usuario: usuarioId,
                    data: admin.firestore.Timestamp.now(),
                    payload: {
                        total: tempoEmbalagem,
                        pedidoId: pedidoId,
                        assemblyGroup: assemblyGroupId
                    }
                };
                transaction.create(lancamentoServicoRef, lancamentoServico);
                console.log(`[SUCCESS] Serviço de embalagem lançado: ${tempoEmbalagem} minutos`);
            } else {
                console.log(`[INFO] Pedido ${pedidoId} não tem tempo de embalagem (${tempoEmbalagem}), serviço não lançado`);
            }

            console.log(`Pedido ${pedidoId} concluído com sucesso. Status atualizado para 'concluido'`);
        });

    } catch (error) {
        console.error('Erro no processamento da conclusão de pedido:', error);
        throw error;
    }
}
