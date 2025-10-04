import * as admin from 'firebase-admin';
import { DocumentSnapshot } from 'firebase-functions/v2/firestore';
import { extractAllGruposImpressao, optimizeAndSplitGruposImpressao } from '../../utils/productionOrderHelpers';
import { LancamentoProducao, AssemblyInstance, GrupoProducaoOtimizado, GrupoMontagem, CriacaoPedidoPayload, ProdutoPayload, PecaComponente, ProdutoFinalNecessario } from '../../types/productionTypes';

export async function handleCriacaoPedido(event: { data?: DocumentSnapshot }) {
    const db = admin.firestore();
    const lancamento = event.data?.data() as LancamentoProducao | undefined;

    // Helper function to recursively enrich product data for packaging
    async function enrichProductWithHierarchy(product: ProdutoPayload): Promise<ProdutoFinalNecessario> {
        const enrichedProduct: ProdutoFinalNecessario = {
            produtoId: product.produtoId,
            nome: product.nomeProduto,
            tipo: product.tipo,
            quantidade: product.quantidade,
            atendimentoDetalhado: [], // Initialize as empty
            estoqueAtual: 0, // Placeholder
            quantidadeAtendida: 0, // Placeholder
        };

        if (product.tipo === 'kit') {
            if (product.modelosComponentes) { // Added conditional check
                enrichedProduct.modelos = await Promise.all(
                    product.modelosComponentes.map(async (modeloComponente) => {
                        // Recursively enrich the model to get its nested pieces
                        const enrichedModelo = await enrichProductWithHierarchy({
                            produtoId: modeloComponente.produtoId,
                            nomeProduto: modeloComponente.nomeProduto,
                            tipo: 'modelo', // Treat as a model for recursive enrichment
                            quantidade: modeloComponente.quantidade,
                            pecasComponentes: modeloComponente.pecasComponentes, // Pass its pieces
                            // Add placeholder values for missing ProdutoPayload properties
                            skuProduto: '',
                            custoUnitario: 0,
                            tempoImpressaoEstimado: 0,
                            tempoMontagemEstimado: 0,
                            sourceType: 'modelo', // Assuming 'modelo' as sourceType for recursive call
                        });

                        return {
                            modeloId: enrichedModelo.produtoId,
                            nome: enrichedModelo.nome,
                            quantidade: enrichedModelo.quantidade,
                            estoqueAtual: 0, // Placeholder
                            quantidadeAtendida: 0, // Placeholder
                            pecas: enrichedModelo.pecas, // Nested pieces from recursive call
                        };
                    })
                );
            }
            // NEW: Also enrich direct pieces of the kit
            if (product.pecasComponentes) {
                enrichedProduct.pecas = await Promise.all(
                    product.pecasComponentes.map(async (pecaComponente) => {
                        const pecaDoc = await db.collection('pecas').doc(pecaComponente.id).get();
                        const fullPeca = pecaDoc.data() as PecaComponente | undefined;

                        return {
                            pecaId: fullPeca?.id || pecaComponente.id,
                            nome: fullPeca?.nome || pecaComponente.nome,
                            quantidade: pecaComponente.quantidade,
                            estoqueAtual: 0, // Placeholder
                            quantidadeAtendida: 0, // Placeholder
                        };
                    })
                );
            }
        } else if (product.tipo === 'modelo' && product.pecasComponentes) {
            enrichedProduct.pecas = await Promise.all(
                product.pecasComponentes.map(async (pecaComponente) => {
                    const pecaDoc = await db.collection('pecas').doc(pecaComponente.id).get();
                    const fullPeca = pecaDoc.data() as PecaComponente | undefined;

                    return {
                        pecaId: fullPeca?.id || pecaComponente.id,
                        nome: fullPeca?.nome || pecaComponente.nome,
                        quantidade: pecaComponente.quantidade,
                        estoqueAtual: 0, // Placeholder
                        quantidadeAtendida: 0, // Placeholder
                    };
                })
            );
        }
        // For 'peca' type, no nested components are expected at this level for packaging.
        // The structure already handles top-level pieces correctly.

        return enrichedProduct;
    }

    if (!lancamento) {
        console.error('Nenhum dado de lançamento de criação de pedido encontrado');
        return;
    }

    // Type narrowing for criacao_pedido payload
    if (lancamento.tipoEvento !== 'criacao_pedido') {
        console.error(`Evento de tipo inesperado: ${lancamento.tipoEvento}`);
        return;
    }

    const payload = lancamento.payload as CriacaoPedidoPayload;

    try {
        // Validar payload
        if (!payload || !payload.pedidoId || !payload.pedidoNumero) {
            throw new Error('Payload inválido: pedidoId e pedidoNumero são obrigatórios');
        }

        const { pedidoId, pedidoNumero, produtos } = payload;

        // Transação para garantir atomicidade
        await db.runTransaction(async (transaction) => {
            console.log(`Processando criação de pedido: ${pedidoId}`);

            // Lista plana para rastrear todas as assemblyInstances geradas
            const allAssemblyInstances: AssemblyInstance[] = [];

            // Processar produtos do pedido para gerar assemblyInstances
            for (const produto of produtos) {
                // Para produtos de nível superior (kits, modelos ou peças diretas)
                for (let i = 0; i < produto.quantidade; i++) {
                    const assemblyInstanceId = `${pedidoId}-${produto.produtoId}-${i + 1}`;
                    allAssemblyInstances.push({
                        assemblyInstanceId,
                        quantidadeRequerida: 1,
                        atendimentoDetalhado: [],
                        parentPecaId: null,
                        parentModeloId: null,
                        parentKitId: null,
                        targetProductId: produto.produtoId,
                        targetProductType: produto.tipo,
                    });
                }

                if (produto.tipo === 'kit') {
                    // NEW: Handle direct pieces of the kit
                    if (produto.pecasComponentes) {
                        const parentKitInstances = allAssemblyInstances.filter(ai =>
                            ai.targetProductId === produto.produtoId &&
                            ai.targetProductType === 'kit' && // Corrected type check
                            ai.parentKitId === null &&
                            ai.parentModeloId === null &&
                            ai.parentPecaId === null
                        );
                        for (const kitInstance of parentKitInstances) {
                            for (const peca of produto.pecasComponentes) {
                                for (let pecaInstanceIndex = 0; pecaInstanceIndex < peca.quantidade; pecaInstanceIndex++) {
                                    const pecaAssemblyInstanceId = `${kitInstance.assemblyInstanceId}-${peca.id}-${pecaInstanceIndex + 1}`;
                                    allAssemblyInstances.push({
                                        assemblyInstanceId: pecaAssemblyInstanceId,
                                        quantidadeRequerida: 1,
                                        atendimentoDetalhado: [],
                                        parentPecaId: null,
                                        parentModeloId: null,
                                        parentKitId: produto.produtoId,
                                        targetProductId: peca.id,
                                        targetProductType: 'peca',
                                    });
                                }
                            }
                        }
                    }

                    // Existing logic for models within kits
                    if (produto.modelosComponentes) {
                        for (const modelo of produto.modelosComponentes) {
                            // Para cada instância do kit pai, crie instâncias para o modelo
                            const parentKitInstances = allAssemblyInstances.filter(ai =>
                                ai.targetProductId === produto.produtoId &&
                                ai.targetProductType === 'kit' && // Corrected type check
                                ai.parentKitId === null &&
                                ai.parentModeloId === null &&
                                ai.parentPecaId === null
                            );
                            for (const kitInstance of parentKitInstances) {
                                for (let modeloInstanceIndex = 0; modeloInstanceIndex < modelo.quantidade; modeloInstanceIndex++) {
                                    const modeloAssemblyInstanceId = `${kitInstance.assemblyInstanceId}-${modelo.produtoId}-${modeloInstanceIndex + 1}`;
                                    allAssemblyInstances.push({
                                        assemblyInstanceId: modeloAssemblyInstanceId,
                                        quantidadeRequerida: 1,
                                        atendimentoDetalhado: [],
                                        parentPecaId: null,
                                        parentModeloId: null,
                                        parentKitId: produto.produtoId,
                                        targetProductId: modelo.produtoId,
                                        targetProductType: 'modelo',
                                    });
                                }
                            }

                            if (modelo.pecasComponentes) {
                                for (const peca of modelo.pecasComponentes) {
                                    // Para cada instância do modelo pai (dentro do kit), crie instâncias para a peça
                                    const parentModeloInstances = allAssemblyInstances.filter(ai =>
                                        ai.targetProductId === modelo.produtoId &&
                                        ai.targetProductType === 'modelo' && // Corrected type check
                                        ai.parentKitId === produto.produtoId
                                    );
                                    for (const modeloInstance of parentModeloInstances) {
                                        for (let pecaInstanceIndex = 0; pecaInstanceIndex < peca.quantidade; pecaInstanceIndex++) {
                                            const pecaAssemblyInstanceId = `${modeloInstance.assemblyInstanceId}-${peca.id}-${pecaInstanceIndex + 1}`;
                                            allAssemblyInstances.push({
                                                assemblyInstanceId: pecaAssemblyInstanceId,
                                                quantidadeRequerida: 1,
                                                atendimentoDetalhado: [],
                                                parentPecaId: null,
                                                parentModeloId: modelo.produtoId,
                                                parentKitId: produto.produtoId,
                                                targetProductId: peca.id,
                                                targetProductType: 'peca',
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else if (produto.tipo === 'modelo' && produto.pecasComponentes) {
                    for (const peca of produto.pecasComponentes) {
                        // Para cada instância do modelo pai, crie instâncias para a peça
                        const parentModeloInstances = allAssemblyInstances.filter(ai =>
                            ai.targetProductId === produto.produtoId &&
                            ai.targetProductType === 'modelo' && // Corrected type check
                            ai.parentKitId === null
                        );
                        for (const modeloInstance of parentModeloInstances) {
                            for (let pecaInstanceIndex = 0; pecaInstanceIndex < peca.quantidade; pecaInstanceIndex++) {
                                const pecaAssemblyInstanceId = `${modeloInstance.assemblyInstanceId}-${peca.id}-${pecaInstanceIndex + 1}`;
                                allAssemblyInstances.push({
                                    assemblyInstanceId: pecaAssemblyInstanceId,
                                    quantidadeRequerida: 1,
                                    atendimentoDetalhado: [],
                                    parentPecaId: null,
                                    parentModeloId: produto.produtoId,
                                    parentKitId: null,
                                    targetProductId: peca.id,
                                    targetProductType: 'peca',
                                });
                            }
                        }
                    }
                }
            }

            // Agora, crie o assemblyInstancesMap a partir da lista plana
            const assemblyInstancesMap = new Map<string, AssemblyInstance[]>();
            allAssemblyInstances.forEach(instance => {
                const key = instance.targetProductId;
                if (!assemblyInstancesMap.has(key)) {
                    assemblyInstancesMap.set(key, []);
                }
                assemblyInstancesMap.get(key)?.push(instance);
            });

            // 1. Extrair todos os GruposImpressao usando o helper
            // For now, we'll pass the original products. The enrichment for packaging is separate.
            const allGruposImpressao = extractAllGruposImpressao(produtos, assemblyInstancesMap);
            console.log(`Extraídos ${allGruposImpressao.length} grupos de impressão`);

            // 2. Otimizar e gerar GruposProducaoOtimizados
            const existingGroupsSnapshot = await transaction.get(
                db.collection('gruposProducaoOtimizados')
                    .where('status', '==', 'aguardando')
            );
            const existingProductionGroups = existingGroupsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data() as GrupoProducaoOtimizado
            }));

            const { newOrUpdatedGroups, groupsToDelete } = optimizeAndSplitGruposImpressao(
                allGruposImpressao,
                pedidoId,
                pedidoNumero,
                existingProductionGroups
            );
            console.log(`Gerados ${newOrUpdatedGroups.length} novos/atualizados grupos de produção otimizados e ${groupsToDelete.length} grupos para deletar.`);

            // 3. Gerar GruposMontagem para peças compostas, modelos e kits
            const gruposMontagem: GrupoMontagem[] = [];

            // Processar produtos do pedido para criar grupos de montagem
            for (const produto of produtos) {
                // Obter todas as instâncias de assembly para o produto atual
                const produtoAssemblyInstances = allAssemblyInstances.filter(ai =>
                    ai.targetProductId === produto.produtoId &&
                    ai.targetProductType === produto.tipo &&
                    ai.parentKitId === null && ai.parentModeloId === null && ai.parentPecaId === null
                );

                if (produto.tipo === 'kit') {
                    for (const kitInstance of produtoAssemblyInstances) {
                        const grupoMontagem: GrupoMontagem = {
                            pedidoId,
                            pedidoNumero,
                            targetProductId: produto.produtoId,
                            targetProductType: 'kit',
                            targetProductName: produto.nomeProduto,
                            assemblyInstanceId: kitInstance.assemblyInstanceId,
                            status: 'aguardando_montagem',
                            isAvulsa: false,
                            sourceOptimizedGroupId: null,
                            parentModeloId: null,
                            parentKitId: null,
                            pecaTipoDetalhado: null,
                            modelosNecessarios: produto.modelosComponentes?.map(modelo => ({
                                modeloId: modelo.produtoId,
                                nome: modelo.nomeProduto,
                                quantidade: modelo.quantidade,
                                atendimentoDetalhado: []
                            }))
                        };

                        // Encontrar o grupo otimizado correspondente para vincular seu ID
                        // Para kits, o sourceGrupoImpressaoId no grupo otimizado é o ID do próprio kit
                        const matchingOptimizedGroupKit = newOrUpdatedGroups.find(g =>
                            g.pedidoId === pedidoId &&
                            g.pedidoNumero === pedidoNumero &&
                            g.parentKitId === produto.produtoId &&
                            g.sourceGrupoImpressaoId === produto.produtoId // O ID do kit é o sourceGrupoImpressaoId para o grupo otimizado do kit
                        );

                        if (matchingOptimizedGroupKit) {
                            grupoMontagem.sourceOptimizedGroupId = matchingOptimizedGroupKit.id || null;
                        }

                        gruposMontagem.push(grupoMontagem);
                    }

                    // Processar modelos dentro do kit para criar grupos de montagem para os modelos e suas peças compostas
                    if (produto.modelosComponentes) {
                        for (const modelo of produto.modelosComponentes) {
                            // Obter instâncias de assembly para este modelo dentro deste kit
                            const modeloAssemblyInstances = allAssemblyInstances.filter(ai =>
                                ai.targetProductId === modelo.produtoId &&
                                ai.targetProductType === 'modelo' &&
                                ai.parentKitId === produto.produtoId
                            );

                            for (const modeloInstance of modeloAssemblyInstances) {
                                const grupoMontagemModelo: GrupoMontagem = {
                                    pedidoId,
                                    pedidoNumero,
                                    targetProductId: modelo.produtoId,
                                    targetProductType: 'modelo',
                                    targetProductName: modelo.nomeProduto,
                                    assemblyInstanceId: modeloInstance.assemblyInstanceId,
                                    status: 'aguardando_montagem',
                                    isAvulsa: false,
                                    sourceOptimizedGroupId: null,
                                    parentModeloId: null, // Este é o modelo de nível superior dentro do kit
                                    parentKitId: produto.produtoId,
                                    pecaTipoDetalhado: null,
                                    pecasNecessarias: modelo.pecasComponentes?.map(peca => ({
                                        pecaId: peca.id,
                                        nome: peca.nome,
                                        quantidade: peca.quantidade,
                                        atendimentoDetalhado: []
                                    }))
                                };

                                // Encontrar o grupo otimizado correspondente para vincular seu ID
                                // Para modelos dentro de kits, o sourceGrupoImpressaoId é o ID do próprio modelo
                                const matchingOptimizedGroupModeloKit = newOrUpdatedGroups.find(g =>
                                    g.pedidoId === pedidoId &&
                                    g.pedidoNumero === pedidoNumero &&
                                    g.parentKitId === produto.produtoId &&
                                    g.parentModeloId === modelo.produtoId &&
                                    g.sourceGrupoImpressaoId === modelo.produtoId // O ID do modelo é o sourceGrupoImpressaoId para o grupo otimizado do modelo
                                );

                                if (matchingOptimizedGroupModeloKit) {
                                    grupoMontagemModelo.sourceOptimizedGroupId = matchingOptimizedGroupModeloKit.id || null;
                                }

                                gruposMontagem.push(grupoMontagemModelo);
                            }

                            // Processar peças dentro do modelo
                            if (modelo.pecasComponentes) {
                                for (const peca of modelo.pecasComponentes) {
                                    // Verificar se a peça requer montagem
                                    if (!(peca.tipoPecaDetalhado === 'simples' || peca.tipoPecaDetalhado === 'composta_um_grupo_sem_montagem')) {
                                        // Obter as instâncias de assembly da peça
                                        const pecaAssemblyInstances = allAssemblyInstances.filter(ai =>
                                            ai.targetProductId === peca.id &&
                                            ai.targetProductType === 'peca' &&
                                            ai.parentModeloId === modelo.produtoId &&
                                            ai.parentKitId === produto.produtoId
                                        );

                                        // Criar grupo de montagem para cada instância da peça
                                        for (const pecaInstance of pecaAssemblyInstances) {
                                            const grupoMontagem: GrupoMontagem = {
                                                pedidoId,
                                                pedidoNumero,
                                                targetProductId: peca.id,
                                                targetProductType: 'peca',
                                                targetProductName: peca.nome,
                                                assemblyInstanceId: pecaInstance.assemblyInstanceId,
                                                status: 'aguardando_montagem',
                                                isAvulsa: false,
                                                sourceOptimizedGroupId: null,
                                                parentModeloId: modelo.produtoId,
                                                parentKitId: produto.produtoId,
                                                pecaTipoDetalhado: peca.tipoPecaDetalhado,
                                                partesNecessarias: peca.gruposImpressao.flatMap(grupo =>
                                                    grupo.partes.map(parte => ({
                                                        parteId: parte.parteId,
                                                        nome: parte.nome,
                                                        quantidade: parte.quantidade,
                                                        atendimentoDetalhado: []
                                                    }))
                                                )
                                            };

                                            // Encontrar o grupo otimizado correspondente para vincular seu ID
                                            // Para peças, o sourceGrupoImpressaoId é o ID do primeiro grupo de impressão da peça
                                            const matchingOptimizedGroupPecaKit = newOrUpdatedGroups.find(g =>
                                                g.pedidoId === pedidoId &&
                                                g.pedidoNumero === pedidoNumero &&
                                                g.parentKitId === produto.produtoId &&
                                                g.parentModeloId === modelo.produtoId &&
                                                g.sourceGrupoImpressaoId === peca.gruposImpressao[0]?.id
                                            );

                                            if (matchingOptimizedGroupPecaKit) {
                                                grupoMontagem.sourceOptimizedGroupId = matchingOptimizedGroupPecaKit.id || null;
                                            }

                                            gruposMontagem.push(grupoMontagem);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // NEW: Processar peças diretas do kit para criar grupos de montagem para peças compostas
                    if (produto.pecasComponentes) {
                        for (const peca of produto.pecasComponentes) {
                            // Verificar se a peça requer montagem
                            if (!(peca.tipoPecaDetalhado === 'simples' || peca.tipoPecaDetalhado === 'composta_um_grupo_sem_montagem')) {
                                // Obter as instâncias de assembly da peça que são diretas do kit
                                const pecaAssemblyInstances = allAssemblyInstances.filter(ai =>
                                    ai.targetProductId === peca.id &&
                                    ai.targetProductType === 'peca' &&
                                    ai.parentKitId === produto.produtoId && // Parent is the kit
                                    ai.parentModeloId === null // Not part of a model within the kit
                                );

                                // Criar grupo de montagem para cada instância da peça
                                for (const pecaInstance of pecaAssemblyInstances) {
                                    const grupoMontagem: GrupoMontagem = {
                                        pedidoId,
                                        pedidoNumero,
                                        targetProductId: peca.id,
                                        targetProductType: 'peca',
                                        targetProductName: peca.nome,
                                        assemblyInstanceId: pecaInstance.assemblyInstanceId,
                                        status: 'aguardando_montagem',
                                        isAvulsa: false,
                                        sourceOptimizedGroupId: null,
                                        parentModeloId: null, // Direct piece of kit, not a model
                                        parentKitId: produto.produtoId,
                                        pecaTipoDetalhado: peca.tipoPecaDetalhado,
                                        partesNecessarias: peca.gruposImpressao.flatMap(grupo =>
                                            grupo.partes.map(parte => ({
                                                parteId: parte.parteId,
                                                nome: parte.nome,
                                                quantidade: parte.quantidade,
                                                atendimentoDetalhado: []
                                            }))
                                        )
                                    };

                                    // Encontrar o grupo otimizado correspondente para vincular seu ID
                                    const matchingOptimizedGroupPecaKitDirect = newOrUpdatedGroups.find(g =>
                                        g.pedidoId === pedidoId &&
                                        g.pedidoNumero === pedidoNumero &&
                                        g.parentKitId === produto.produtoId &&
                                        g.parentModeloId === null && // Direct piece of kit
                                        g.sourceGrupoImpressaoId === peca.gruposImpressao[0]?.id
                                    );

                                    if (matchingOptimizedGroupPecaKitDirect) {
                                        grupoMontagem.sourceOptimizedGroupId = matchingOptimizedGroupPecaKitDirect.id || null;
                                    }

                                    gruposMontagem.push(grupoMontagem);
                                }
                            }
                        }
                    }
                } else if (produto.tipo === 'modelo') {
                    // Obter instâncias de assembly para este modelo
                    const modeloAssemblyInstances = allAssemblyInstances.filter(ai =>
                        ai.targetProductId === produto.produtoId &&
                        ai.targetProductType === 'modelo' &&
                        ai.parentKitId === null
                    );

                    for (const modeloInstance of modeloAssemblyInstances) {
                        const grupoMontagem: GrupoMontagem = {
                            pedidoId,
                            pedidoNumero,
                            targetProductId: produto.produtoId,
                            targetProductType: 'modelo',
                            targetProductName: produto.nomeProduto,
                            assemblyInstanceId: modeloInstance.assemblyInstanceId,
                            status: 'aguardando_montagem',
                            isAvulsa: false,
                            sourceOptimizedGroupId: null,
                            parentModeloId: null,
                            parentKitId: null,
                            pecaTipoDetalhado: null,
                            pecasNecessarias: produto.pecasComponentes?.map(peca => ({
                                pecaId: peca.id,
                                nome: peca.nome,
                                quantidade: peca.quantidade,
                                atendimentoDetalhado: []
                            }))
                        };

                        // Encontrar o grupo otimizado correspondente para vincular seu ID
                        // Para modelos, o sourceGrupoImpressaoId é o ID do próprio modelo
                        const matchingOptimizedGroupModelo = newOrUpdatedGroups.find(g =>
                            g.pedidoId === pedidoId &&
                            g.pedidoNumero === pedidoNumero &&
                            g.parentModeloId === produto.produtoId &&
                            g.sourceGrupoImpressaoId === produto.produtoId // O ID do modelo é o sourceGrupoImpressaoId para o grupo otimizado do modelo
                        );

                        if (matchingOptimizedGroupModelo) {
                            grupoMontagem.sourceOptimizedGroupId = matchingOptimizedGroupModelo.id || null;
                        }

                        gruposMontagem.push(grupoMontagem);
                    }

                    // Processar peças dentro do modelo para criar grupos de montagem para peças compostas
                    if (produto.pecasComponentes) {
                        for (const peca of produto.pecasComponentes) {
                            // Verificar se a peça requer montagem
                            if (!(peca.tipoPecaDetalhado === 'simples' || peca.tipoPecaDetalhado === 'composta_um_grupo_sem_montagem')) {
                                // Obter as instâncias de assembly da peça
                                const pecaAssemblyInstances = allAssemblyInstances.filter(ai =>
                                    ai.targetProductId === peca.id &&
                                    ai.targetProductType === 'peca' &&
                                    ai.parentModeloId === produto.produtoId &&
                                    ai.parentKitId === null
                                );

                                // Criar grupo de montagem para cada instância da peça
                                for (const pecaInstance of pecaAssemblyInstances) {
                                    const grupoMontagem: GrupoMontagem = {
                                        pedidoId,
                                        pedidoNumero,
                                        targetProductId: peca.id,
                                        targetProductType: 'peca',
                                        targetProductName: peca.nome,
                                        assemblyInstanceId: pecaInstance.assemblyInstanceId,
                                        status: 'aguardando_montagem',
                                        isAvulsa: false,
                                        sourceOptimizedGroupId: null,
                                        parentModeloId: produto.produtoId,
                                        parentKitId: null,
                                        pecaTipoDetalhado: peca.tipoPecaDetalhado,
                                        partesNecessarias: peca.gruposImpressao.flatMap(grupo =>
                                            grupo.partes.map(parte => ({
                                                parteId: parte.parteId,
                                                nome: parte.nome,
                                                quantidade: parte.quantidade,
                                                atendimentoDetalhado: []
                                            }))
                                        )
                                    };

                                    // Encontrar o grupo otimizado correspondente para vincular seu ID
                                    // Para peças, o sourceGrupoImpressaoId é o ID do primeiro grupo de impressão da peça
                                    const matchingOptimizedGroupPecaModelo = newOrUpdatedGroups.find(g =>
                                        g.pedidoId === pedidoId &&
                                        g.pedidoNumero === pedidoNumero &&
                                        g.parentModeloId === produto.produtoId &&
                                        g.sourceGrupoImpressaoId === peca.gruposImpressao[0]?.id
                                    );

                                    if (matchingOptimizedGroupPecaModelo) {
                                        grupoMontagem.sourceOptimizedGroupId = matchingOptimizedGroupPecaModelo.id || null;
                                    }

                                    gruposMontagem.push(grupoMontagem);
                                }
                            }
                        }
                    }
                } else if (produto.tipo === 'peca' && produto.pecasComponentes && produto.pecasComponentes.length > 0) {
                    const peca = produto.pecasComponentes[0];

                    // Verificar se a peça requer montagem
                    if (!(peca.tipoPecaDetalhado === 'simples' || peca.tipoPecaDetalhado === 'composta_um_grupo_sem_montagem')) {
                        // Obter as instâncias de assembly da peça
                        const pecaAssemblyInstances = allAssemblyInstances.filter(ai =>
                            ai.targetProductId === peca.id &&
                            ai.targetProductType === 'peca' &&
                            ai.parentKitId === null && ai.parentModeloId === null
                        );

                        // Criar grupo de montagem para cada instância da peça
                        for (const pecaInstance of pecaAssemblyInstances) {
                            const grupoMontagem: GrupoMontagem = {
                                pedidoId,
                                pedidoNumero,
                                targetProductId: peca.id,
                                targetProductType: 'peca',
                                targetProductName: peca.nome,
                                assemblyInstanceId: pecaInstance.assemblyInstanceId,
                                status: 'aguardando_montagem',
                                isAvulsa: false,
                                sourceOptimizedGroupId: null,
                                parentModeloId: null,
                                parentKitId: null,
                                pecaTipoDetalhado: peca.tipoPecaDetalhado,
                                partesNecessarias: peca.gruposImpressao.flatMap(grupo =>
                                    grupo.partes.map(parte => ({
                                        parteId: parte.parteId,
                                        nome: parte.nome,
                                        quantidade: parte.quantidade,
                                        atendimentoDetalhado: []
                                    }))
                                )
                            };

                            // Encontrar o grupo otimizado correspondente para vincular seu ID
                            // Para peças, o sourceGrupoImpressaoId é o ID do primeiro grupo de impressão da peça
                            const matchingOptimizedGroupPeca = newOrUpdatedGroups.find(g =>
                                g.pedidoId === pedidoId &&
                                g.pedidoNumero === pedidoNumero &&
                                g.sourceGrupoImpressaoId === peca.gruposImpressao[0]?.id
                            );

                            if (matchingOptimizedGroupPeca) {
                                grupoMontagem.sourceOptimizedGroupId = matchingOptimizedGroupPeca.id || null;
                            }

                            gruposMontagem.push(grupoMontagem);
                        }
                    }
                }
            }

            // Criar GrupoMontagem para a etapa final de Embalagem
            const enrichedProdutosFinaisNecessarios = await Promise.all(
                produtos.map(async (p) => await enrichProductWithHierarchy(p))
            );

            const grupoEmbalagem: GrupoMontagem = {
                pedidoId,
                pedidoNumero,
                targetProductId: pedidoId, // O pedidoId representa o produto final a ser embalado
                targetProductType: 'produto_final',
                targetProductName: `Embalagem do Pedido ${pedidoNumero}`,
                assemblyInstanceId: `${pedidoId}-embalagem-final`, // ID único para a instância de embalagem do pedido
                status: 'aguardando_montagem',
                isAvulsa: false,
                sourceOptimizedGroupId: null,
                parentModeloId: null,
                parentKitId: null,
                pecaTipoDetalhado: null,
                produtosFinaisNecessarios: enrichedProdutosFinaisNecessarios
            };
            gruposMontagem.push(grupoEmbalagem);

            // Adicionar timestamps aos grupos de montagem
            for (const grupo of gruposMontagem) {
                grupo.timestampCriacao = admin.firestore.FieldValue.serverTimestamp() as any;
            }

            console.log(`Gerados ${gruposMontagem.length} grupos de montagem`);

            // 4. Salvar grupos de produção otimizados
            for (const grupo of newOrUpdatedGroups) { // Use newOrUpdatedGroups here
                if (grupo.id) {
                    // Atualizar grupo existente
                    const grupoRef = db.collection('gruposProducaoOtimizados').doc(grupo.id);
                    const { id, ...grupoSemId } = grupo;
                    transaction.update(grupoRef, grupoSemId);
                } else {
                    // Criar novo grupo
                    const grupoRef = db.collection('gruposProducaoOtimizados').doc();
                    transaction.set(grupoRef, {
                        ...grupo,
                        id: grupoRef.id
                    });
                }
            }

            // Delete groups that are no longer needed
            for (const groupId of groupsToDelete) {
                const grupoRef = db.collection('gruposProducaoOtimizados').doc(groupId);
                transaction.delete(grupoRef);
            }
            
            // 5. Salvar grupos de montagem
            for (const grupo of gruposMontagem) {
                const grupoRef = db.collection('gruposMontagem').doc();
                transaction.set(grupoRef, {
                    ...grupo,
                    id: grupoRef.id
                });
            }

            // 6. Atualizar status do pedido
            const pedidoRef = db.collection('pedidos').doc(pedidoId);
            transaction.update(pedidoRef, {
                status: 'em_producao',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        console.log(`Pedido ${pedidoId} processado com sucesso`);
    } catch (error) {
        console.error('Erro no processamento da criação de pedido:', error);
        throw error;
    }
}
