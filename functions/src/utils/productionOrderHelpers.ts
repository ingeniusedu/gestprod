import * as admin from 'firebase-admin';
import type { ProdutoPayload, PecaComponente, ModeloComponente, GrupoImpressao, FilamentoNecessario, OutroInsumoNecessario, ParteNecessaria, AssemblyInstance, PedidoOrigem, GrupoProducaoOtimizado, ConsolidatedGroup } from '../types/productionTypes';

// Helper function to extract all GrupoImpressao from a product structure
export const extractAllGruposImpressao = (
    products: ProdutoPayload[],
    assemblyInstancesMap: Map<string, AssemblyInstance[]>
) => {
    const allGrupos: {
        grupoImpressao: GrupoImpressao;
        pecaTipoDetalhado: string;
        pecaId: string;
        pecaNome: string;
        modeloId?: string | null;
        kitId?: string | null;
        assemblyInstances: AssemblyInstance[];
        targetProductId: string; // Adicionado
        targetProductType: 'kit' | 'modelo' | 'peca'; // Adicionado
    }[] = [];

    products.forEach((product: ProdutoPayload) => {
        // Para produtos de nível superior (kits, modelos, ou peças diretas)
        if (product.tipo === 'peca' && product.pecasComponentes && product.pecasComponentes.length > 0) {
            const peca = product.pecasComponentes[0];
            const allPecaAssemblyInstances = assemblyInstancesMap.get(peca.id) || [];
            peca.gruposImpressao.forEach((grupo: GrupoImpressao) => {
                allGrupos.push({
                    grupoImpressao: grupo,
                    pecaTipoDetalhado: peca.tipoPecaDetalhado,
                    pecaId: peca.id,
                    pecaNome: peca.nome,
                    modeloId: null,
                    kitId: null,
                    assemblyInstances: allPecaAssemblyInstances,
                    targetProductId: peca.id,
                    targetProductType: 'peca',
                });
            });
        } else if (product.tipo === 'modelo' && product.pecasComponentes) {
            product.pecasComponentes.forEach((peca: PecaComponente) => {
                // Obter todas as instâncias de assembly para esta peça
                const allPecaAssemblyInstances = assemblyInstancesMap.get(peca.id) || [];
                peca.gruposImpressao.forEach((grupo: GrupoImpressao) => {
                    allGrupos.push({
                        grupoImpressao: grupo,
                        pecaTipoDetalhado: peca.tipoPecaDetalhado,
                        pecaId: peca.id,
                        pecaNome: peca.nome,
                        modeloId: product.produtoId,
                        kitId: null,
                        assemblyInstances: allPecaAssemblyInstances,
                        targetProductId: peca.id,
                        targetProductType: 'peca',
                    });
                });
            });
        } else if (product.tipo === 'kit' && product.modelosComponentes) {
            product.modelosComponentes.forEach((modelo: ModeloComponente) => {
                if (modelo.pecasComponentes) {
                    modelo.pecasComponentes.forEach((peca: PecaComponente) => {
                        // Obter todas as instâncias de assembly para esta peça
                        const allPecaAssemblyInstances = assemblyInstancesMap.get(peca.id) || [];
                        peca.gruposImpressao.forEach((grupo: GrupoImpressao) => {
                            allGrupos.push({
                                grupoImpressao: grupo,
                                pecaTipoDetalhado: peca.tipoPecaDetalhado,
                                pecaId: peca.id,
                                pecaNome: peca.nome,
                                modeloId: modelo.produtoId,
                                kitId: product.produtoId,
                                assemblyInstances: allPecaAssemblyInstances,
                                targetProductId: peca.id,
                                targetProductType: 'peca',
                            });
                        });
                    });
                }
            });
        } else if (product.tipo === 'kit' && product.pecasComponentes) { // NEW: Handle direct pieces of a kit
            product.pecasComponentes.forEach((peca: PecaComponente) => {
                // Obter todas as instâncias de assembly para esta peça
                const allPecaAssemblyInstances = assemblyInstancesMap.get(peca.id) || [];
                peca.gruposImpressao.forEach((grupo: GrupoImpressao) => {
                    allGrupos.push({
                        grupoImpressao: grupo,
                        pecaTipoDetalhado: peca.tipoPecaDetalhado,
                        pecaId: peca.id,
                        pecaNome: peca.nome,
                        modeloId: null, // Direct piece of kit, not part of a model
                        kitId: product.produtoId,
                        assemblyInstances: allPecaAssemblyInstances,
                        targetProductId: peca.id,
                        targetProductType: 'peca',
                    });
                });
            });
        }
    });
    return allGrupos;
};

export const optimizeAndSplitGruposImpressao = (
    newGrupos: {
        grupoImpressao: GrupoImpressao;
        pecaTipoDetalhado: string;
        pecaId: string;
        pecaNome: string;
        modeloId?: string | null;
        kitId?: string | null;
        assemblyInstances: AssemblyInstance[];
    }[],
    currentPedidoId: string,
    currentPedidoNumero: string,
    existingProductionGroups: GrupoProducaoOtimizado[]
) => {
    const newOrUpdatedGroups: GrupoProducaoOtimizado[] = [];
    const consolidatedGroups = new Map<string, ConsolidatedGroup>();
    const updatedGroupIds = new Set<string>();
    const allExistingGroupIds = new Set<string>();

    // Separate existing groups into consolidatable and non-consolidatable
    const consolidatableExistingGroups = existingProductionGroups.filter(group => (group.quantidadeMaxima === undefined || Number(group.quantidadeMaxima) > 1));
    const nonConsolidatableExistingGroups = existingProductionGroups.filter(group => Number(group.quantidadeMaxima) === 1);

    // Process only consolidatable existing groups
    consolidatableExistingGroups.forEach((existingGroup: GrupoProducaoOtimizado) => {
        allExistingGroupIds.add(existingGroup.id!);
        updatedGroupIds.add(existingGroup.id!); // Mark existing consolidatable groups as updated

        const partsKey = Object.keys(existingGroup.partesNoGrupo).map(parteId => {
            const parte = existingGroup.partesNoGrupo[parteId];
            return `${parteId}:${parte.nome}`;
        }).sort().join('|');
        const filamentsKey = existingGroup.filamentosNecessarios.map(f => `${f.grupoFilamentoId || f.id}:${f.nome}`).sort().join('|');
        const outrosInsumosKey = (existingGroup.outrosInsumosNecessarios || []).map(o => `${o.insumoId || o.id}:${o.nome}`).sort().join('|');
        const consolidationKey = `${partsKey}-${filamentsKey}-${outrosInsumosKey}-${existingGroup.pecaTipoDetalhado}`; // Include pecaTipoDetalhado in key

        if (!consolidatedGroups.has(consolidationKey)) {
            consolidatedGroups.set(consolidationKey, {
                items: {}, // parts
                filamentos: {},
                outrosInsumos: {},
                tempoImpressao: 0,
                consumoFilamento: 0,
                quantidadeMaxima: existingGroup.quantidadeMaxima || Infinity,
                sourcePecaId: existingGroup.sourceId || '',
                sourcePecaName: existingGroup.sourceName,
                parentModeloId: existingGroup.parentModeloId,
                parentKitId: existingGroup.parentKitId,
                originalGrupoImpressaoId: existingGroup.sourceGrupoImpressaoId || '',
                pecaTipoDetalhado: existingGroup.pecaTipoDetalhado || 'simples', // Ensure default to 'simples' if undefined
                pedidosOrigem: [],
                existingDocIds: [],
            });
        }
        const consolidated = consolidatedGroups.get(consolidationKey)!;
        // Update pecaTipoDetalhado if a more specific type is found
        if (consolidated.pecaTipoDetalhado === 'simples' && existingGroup.pecaTipoDetalhado && existingGroup.pecaTipoDetalhado !== 'simples') {
            consolidated.pecaTipoDetalhado = existingGroup.pecaTipoDetalhado;
        }
        if (existingGroup.id) {
            consolidated.existingDocIds.push(existingGroup.id);
        }

        // Add existing group's parts, filaments, insumos
        Object.keys(existingGroup.partesNoGrupo).forEach(parteId => {
            const parte = existingGroup.partesNoGrupo[parteId];
            if (!consolidated.items[parteId]) {
                consolidated.items[parteId] = { parte: { parteId: parteId, nome: parte.nome || '', quantidade: 0, hasAssembly: parte.hasAssembly || false, sku: '', identificador: '', isNova: false }, totalQuantidade: 0, hasAssembly: parte.hasAssembly };
            }
            consolidated.items[parteId].totalQuantidade += parte.quantidade;
        });
        existingGroup.filamentosNecessarios.forEach((fil: FilamentoNecessario) => {
            const id = fil.grupoFilamentoId || fil.id || '';
            if (!consolidated.filamentos[id]) {
                consolidated.filamentos[id] = { filamento: fil, totalQuantidade: 0 };
            }
            consolidated.filamentos[id].totalQuantidade += fil.quantidade;
        });
        (existingGroup.outrosInsumosNecessarios || []).forEach((ins: OutroInsumoNecessario) => {
            const id = ins.insumoId || ins.id || '';
            if (!consolidated.outrosInsumos[id]) {
                consolidated.outrosInsumos[id] = { insumo: ins, totalQuantidade: 0 };
            }
            consolidated.outrosInsumos[id].totalQuantidade += Number(ins.quantidade);
        });

        consolidated.tempoImpressao += (existingGroup.tempoImpressaoGrupo || 0);
        consolidated.consumoFilamento += (existingGroup.consumoFilamentoGrupo || 0);

        // Add existing origins, avoiding duplicates
        (existingGroup.pedidosOrigem || []).forEach((origem: PedidoOrigem) => {
            const existingOrigin = consolidated.pedidosOrigem.find((o: PedidoOrigem) => o.pedidoId === origem.pedidoId &&
                o.groupId === origem.groupId);
            if (!existingOrigin) {
                consolidated.pedidosOrigem.push(origem);
            }
        });
    });

    // Keep non-consolidatable groups as-is (they should not be modified)
    nonConsolidatableExistingGroups.forEach((group: GrupoProducaoOtimizado) => {
        allExistingGroupIds.add(group.id!);
        updatedGroupIds.add(group.id!); // Mark as updated to prevent deletion
        newOrUpdatedGroups.push(group); // Add them back to the list of groups
    });

    // Process new groups
    newGrupos.forEach(({ grupoImpressao, pecaId, pecaNome, modeloId, kitId, pecaTipoDetalhado, assemblyInstances }) => {
        const partsKey = grupoImpressao.partes.map(p => `${p.parteId}:${p.nome || ''}`).sort().join('|');
        const filamentsKey = grupoImpressao.filamentos.map(f => `${f.grupoFilamentoId || f.id}:${f.nome || ''}`).sort().join('|');
        const outrosInsumosKey = (grupoImpressao.outrosInsumos || []).map(o => `${o.insumoId || o.id}:${o.nome || ''}`).sort().join('|');
        const consolidationKey = `${partsKey}-${filamentsKey}-${outrosInsumosKey}-${pecaTipoDetalhado}`;

        if (!consolidatedGroups.has(consolidationKey)) {
            consolidatedGroups.set(consolidationKey, {
                items: {}, // parts
                filamentos: {},
                outrosInsumos: {},
                tempoImpressao: 0,
                consumoFilamento: 0,
                quantidadeMaxima: grupoImpressao.quantidadeMaxima || Infinity,
                sourcePecaId: pecaId,
                sourcePecaName: pecaNome,
                parentModeloId: modeloId,
                parentKitId: kitId,
                originalGrupoImpressaoId: grupoImpressao.id,
                pecaTipoDetalhado: pecaTipoDetalhado || 'simples', // Ensure default to 'simples' if undefined
                pedidosOrigem: [],
                existingDocIds: [],
            });
        }
        const consolidated = consolidatedGroups.get(consolidationKey)!;
        // Update pecaTipoDetalhado if a more specific type is found
        if (consolidated.pecaTipoDetalhado === 'simples' && pecaTipoDetalhado && pecaTipoDetalhado !== 'simples') {
            consolidated.pecaTipoDetalhado = pecaTipoDetalhado;
        }

        // Add the current group's origin to the consolidated group's origins, including parentModeloId and parentKitId
        consolidated.pedidosOrigem.push({
            pedidoId: currentPedidoId,
            pedidoNumero: currentPedidoNumero,
            groupId: grupoImpressao.id,
            parentModeloId: modeloId,
            parentKitId: kitId,
            assemblyInstances: assemblyInstances // Pass assembly instances here
        });

        // Aggregate parts
        grupoImpressao.partes.forEach((parte: ParteNecessaria) => {
            if (!consolidated.items[parte.parteId]) {
                consolidated.items[parte.parteId] = { parte: { parteId: parte.parteId, nome: parte.nome || '', quantidade: 0, hasAssembly: parte.hasAssembly || false, sku: '', identificador: '', isNova: false }, totalQuantidade: 0, hasAssembly: parte.hasAssembly || false };
            }
            consolidated.items[parte.parteId].totalQuantidade += parte.quantidade * assemblyInstances.length;
        });

        // Aggregate filaments
        grupoImpressao.filamentos.forEach((filamento: FilamentoNecessario) => {
            const id = filamento.grupoFilamentoId || filamento.id || '';
            if (!consolidated.filamentos[id]) {
                consolidated.filamentos[id] = { filamento, totalQuantidade: 0 };
            }
            consolidated.filamentos[id].totalQuantidade += filamento.quantidade * assemblyInstances.length;
        });

        // Aggregate other insumos
        (grupoImpressao.outrosInsumos || []).forEach((insumo: OutroInsumoNecessario) => {
            const id = insumo.insumoId || insumo.id || '';
            if (!consolidated.outrosInsumos[id]) {
                consolidated.outrosInsumos[id] = { insumo, totalQuantidade: 0 };
            }
            consolidated.outrosInsumos[id].totalQuantidade += Number(insumo.quantidade) * assemblyInstances.length;
        });

        consolidated.tempoImpressao += (grupoImpressao.tempoImpressao || 0) * assemblyInstances.length;
        consolidated.consumoFilamento += (grupoImpressao.consumoFilamento || 0) * assemblyInstances.length;
        consolidated.quantidadeMaxima = Math.min(consolidated.quantidadeMaxima, grupoImpressao.quantidadeMaxima || Infinity);
    });

    // Finalize and split consolidated groups into new ProductionGroup documents
    consolidatedGroups.forEach((consolidated: ConsolidatedGroup) => {
        // Calculate the total number of unique piece instances for this consolidated group
        let uniqueAssemblyInstanceIds = new Set<string>();
        consolidated.pedidosOrigem.forEach(origin => {
            origin.assemblyInstances.forEach(instance => {
                uniqueAssemblyInstanceIds.add(instance.assemblyInstanceId);
            });
        });
        let totalConsolidatedPieceInstances = uniqueAssemblyInstanceIds.size;

        if (totalConsolidatedPieceInstances === 0) return; // Skip if no piece instances

        let remainingQuantity: number = totalConsolidatedPieceInstances; // remainingQuantity now represents pieces
        let existingDocIdIndex = 0;

        while (remainingQuantity > 0) {
            const quantityToProduce: number = Math.min(remainingQuantity, consolidated.quantidadeMaxima); // quantityToProduce is number of pieces

            const newProductionGroup: GrupoProducaoOtimizado = {
                id: consolidated.existingDocIds[existingDocIdIndex] || undefined,
                sourceId: consolidated.sourcePecaId || '',
                sourceType: 'peca', // Assuming 'peca' as the base source type for now
                sourceName: consolidated.sourcePecaName,
                sourceGrupoImpressaoId: consolidated.originalGrupoImpressaoId,
                parentPecaId: consolidated.sourcePecaId || '', // Ensure parentPecaId is always a string
                parentModeloId: consolidated.parentModeloId,
                parentKitId: consolidated.parentKitId,
                pecaTipoDetalhado: consolidated.pecaTipoDetalhado || 'simples', // Use the consolidated pecaTipoDetalhado, with fallback
                partesNoGrupo: Object.values(consolidated.items).reduce((acc: { [parteId: string]: { nome: string; quantidade: number; hasAssembly: boolean; } }, item: any) => {
                    acc[item.parte.parteId] = {
                        nome: item.parte.nome || '',
                        quantidade: Math.ceil(item.totalQuantidade * (quantityToProduce / totalConsolidatedPieceInstances)),
                        hasAssembly: item.hasAssembly || false,
                    };
                    return acc;
                }, {}),
                filamentosNecessarios: Object.values(consolidated.filamentos).map((fil: any) => ({
                    id: fil.filamento.grupoFilamentoId || fil.filamento.id,
                    nome: fil.filamento.nome || '',
                    ...fil.filamento,
                    quantidade: Math.ceil(fil.totalQuantidade * (quantityToProduce / totalConsolidatedPieceInstances))
                })),
                outrosInsumosNecessarios: Object.values(consolidated.outrosInsumos).map((ins: any) => ({
                    id: ins.insumo.insumoId || ins.insumo.id,
                    nome: ins.insumo.nome || '',
                    ...ins.insumo,
                    quantidade: Math.ceil(Number(ins.totalConsolidatedPieceInstances) * (quantityToProduce / totalConsolidatedPieceInstances))
                })),
                tempoImpressaoGrupo: consolidated.tempoImpressao * (quantityToProduce / totalConsolidatedPieceInstances),
                consumoFilamentoGrupo: consolidated.consumoFilamento * (quantityToProduce / totalConsolidatedPieceInstances),
                status: 'aguardando',
                quantidadeOriginalGrupo: totalConsolidatedPieceInstances, // Total pieces for this consolidated group
                quantidadeProduzirGrupo: quantityToProduce, // Pieces to produce in this specific split group
                quantidadeMaxima: Number(consolidated.quantidadeMaxima) === Infinity ? undefined : Number(consolidated.quantidadeMaxima),
                pedidoId: consolidated.pedidosOrigem[0]?.pedidoId || currentPedidoId,
                pedidoNumero: consolidated.pedidosOrigem[0]?.pedidoNumero || currentPedidoNumero,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                pedidosOrigem: consolidated.pedidosOrigem, // Keep all origins for traceability
                totalPartsQuantity: quantityToProduce, // This now represents the number of pieces in this group
            };
            newOrUpdatedGroups.push(newProductionGroup);
            if (newProductionGroup.id) {
                updatedGroupIds.add(newProductionGroup.id);
            }
            remainingQuantity -= quantityToProduce;
            existingDocIdIndex++;
        }
    });

    const groupsToDelete = Array.from(allExistingGroupIds).filter(id => !updatedGroupIds.has(id));

    return { newOrUpdatedGroups, groupsToDelete };
};
