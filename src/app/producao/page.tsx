"use client";

import React, { useState, useEffect } from 'react';
import { db, auth } from '../services/firebase'; // Import auth
import { collection, getDocs, doc, getDoc, updateDoc, query, where, Timestamp, addDoc, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth'; // Import onAuthStateChanged
import { Hourglass, Package, CheckCircle, XCircle, Play, Pause, Spool, MapPin, Users, PlusCircle } from 'lucide-react';
import { Pedido, ProductionGroup, Peca, Modelo, Kit, Insumo, Parte, PosicaoEstoque, GrupoDeFilamento, PecaInsumo, GrupoImpressao, LancamentoInsumo, LancamentoProduto, ItemProducao, PecaParte, ProductionGroupFilamento, ProductionGroupOutroInsumo } from '../types';
import { LocalProduto, LocalInsumo, Recipiente } from '../types/mapaEstoque';
import { v4 as uuidv4 } from 'uuid';
import ProductionLaunchModal from '../components/ProductionLaunchModal';
import StockSelectionModal from '../components/StockSelectionModal';
import ProductionExcessStockModal from '../components/ProductionExcessStockModal'; // Import new modal
import InsumoSelectionModal from '../components/InsumoSelectionModal';
import { cleanObject } from '../utils/cleanObject';

export default function Producao() {
  interface OptimizedFilamentItem extends ProductionGroupFilamento {
    aggregatedId: string;
    quantidadeNecessaria?: number;
    estoqueAtual?: number;
  }

  interface OptimizedInsumoItem extends ProductionGroupOutroInsumo {
    aggregatedId: string;
    quantidadeNecessaria?: number;
    estoqueAtual?: number;
  }

  interface OptimizedGroup {
    id: string;
    partesNoGrupo: { [key: string]: { nome: string; quantidade: number; estoqueAtual?: number; quantidadeNecessaria?: number; } };
    totalPartsQuantity: number; // Renamed from quantidadeTotal
    aggregatedGroupCount: number; // New field to track number of aggregated production groups
    pedidosOrigem: { pedidoId: string; pedidoNumero: string; groupId: string }[];
    sourceName: string;
    tempoImpressaoGrupo: number;
    corFilamento?: string;
    filamentosNecessarios: OptimizedFilamentItem[];
    outrosInsumosNecessarios: OptimizedInsumoItem[];
    items: (PecaParte & { estoqueAtual?: number })[];
    insumosProntos: boolean;
    partesProntas: boolean;
  }

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [optimizedGroups, setOptimizedGroups] = useState<Map<string, OptimizedGroup>>(new Map());
  const [activeTab, setActiveTab] = useState<'aguardando' | 'em_producao' | 'em_montagem_peca' | 'em_montagem_modelo' | 'processando_embalagem' | 'finalizados'>('aguardando');
  const [filamentColors, setFilamentColors] = useState<Record<string, string>>({});
  const [displayGroups, setDisplayGroups] = useState<ProductionGroup[]>([]);
  const [currentAguardandoGroups, setCurrentAguardandoGroups] = useState<ProductionGroup[]>([]); // New state for aguardando groups
  const [allInsumos, setAllInsumos] = useState<Insumo[]>([]);
  const [availablePecas, setAvailablePecas] = useState<Peca[]>([]);
  const [availablePartes, setAvailablePartes] = useState<Parte[]>([]);
  const [availableModels, setAvailableModels] = useState<Modelo[]>([]);
  const [availableKits, setAvailableKits] = useState<Kit[]>([]);
  const [availableFilamentGroups, setAvailableFilamentGroups] = useState<GrupoDeFilamento[]>([]);
  const [locaisProdutos, setLocaisProdutos] = useState<LocalProduto[]>([]);
  const [locaisInsumos, setLocaisInsumos] = useState<LocalInsumo[]>([]);
  const [recipientes, setRecipientes] = useState<Recipiente[]>([]);

  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [selectedProductionGroup, setSelectedProductionGroup] = useState<ProductionGroup | null>(null);
  const [isStockSelectionModalOpen, setIsStockSelectionModalOpen] = useState(false);
  const [isExcessModalOpen, setIsExcessModalOpen] = useState(false);
  const [excessPartData, setExcessPartData] = useState<{ id: string; nome: string; sku: string; quantidade: number; pecaTipo: Peca['tipoPeca'], itemProducaoId: string } | null>(null);
  const [isPackagingInsumoModalOpen, setIsPackagingInsumoModalOpen] = useState(false);
  const [selectedPedidoForPackaging, setSelectedPedidoForPackaging] = useState<Pedido | null>(null);
  const [packagingTime, setPackagingTime] = useState<Record<string, number>>({});
  const [selectedPackagingInsumos, setSelectedPackagingInsumos] = useState<Record<string, { insumo: Insumo, quantidade: number }[]>>({});

  interface ItemToDebit {
    id: string;
    nome: string;
    quantidadePedido: number;
    estoqueAtualItem: number;
    localEstoqueItem: PosicaoEstoque[];
    type: 'parte' | 'filamento' | 'insumo';
  }
  interface ItemToDebitState extends ItemToDebit {
    pedidoId: string;
    groupId: string;
    debitType: 'full' | 'available';
  }
  const [itemToDebit, setItemToDebit] = useState<ItemToDebitState | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthenticated(true);
        const initializeData = async () => {
          fetchFilamentColors();
          const insumos = await fetchAllInsumos();
          const pecas = await fetchAvailablePecas();
          const partes = await fetchAvailablePartes();
          const models = await fetchAvailableModels();
          const kits = await fetchAvailableKits();
          const filamentGroups = await fetchAvailableFilamentGroups();
          const locaisProdutosData = await fetchLocaisProdutos();
          const locaisInsumosData = await fetchLocaisInsumos();
          const recipientesData = await fetchRecipientes();
          fetchPedidos(insumos, pecas, partes, models, kits, filamentGroups, locaisProdutosData, locaisInsumosData, recipientesData);
        };
        initializeData();
      } else {
        setIsAuthenticated(false);
        setPedidos([]);
        setDisplayGroups([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // New useEffect to re-fetch data when 'aguardando' tab is selected
  useEffect(() => {
    if (activeTab === 'aguardando' && isAuthenticated) {
      refetchAllData();
    }
  }, [activeTab, isAuthenticated]);

  useEffect(() => {
    const allGroups: ProductionGroup[] = [];
    pedidos.forEach(pedido => {
      if (pedido.productionGroups) {
        allGroups.push(...pedido.productionGroups);
      }
    });
    const sortedGroups = allGroups.sort((a, b) => {
      if (a.pedidoNumero !== b.pedidoNumero) {
        return a.pedidoNumero.localeCompare(b.pedidoNumero);
      }
      return a.sourceName.localeCompare(b.sourceName);
    });
    setDisplayGroups(sortedGroups);
  }, [pedidos]);

  useEffect(() => {
    const optimizeGroups = () => {
      console.log("optimizeGroups started.");
      console.log("allFilamentGroupsData at optimizeGroups start:", availableFilamentGroups);
      console.log("allInsumosData at optimizeGroups start:", allInsumos);
      const productionGroupsAguardando: ProductionGroup[] = [];

      // Generate ProductionGroups from raw pedido.produtos for 'aguardando' tab
      for (const pedido of pedidos) {
        // If pedido has no productionGroups or its status is 'aguardando', generate them from products
        if (pedido.status === 'aguardando' && (!pedido.productionGroups || pedido.productionGroups.length === 0)) {
          const createCanonicalKey = (grupo: GrupoImpressao): string => {
            const parteIds = [...(grupo.partes || [])].map(p => p.parteId).sort().join(',');
            const filamentoGroupIds = [...(grupo.filamentos || [])]
              .map(f => f.grupoFilamentoId)
              .filter(Boolean)
              .sort()
              .join(',');
            return `partes:[${parteIds}]-filamentos:[${filamentoGroupIds}]`;
          };

          const allPrintGroupsNeeded: {
            grupo: GrupoImpressao,
            totalQuantity: number,
            sourceName: string,
            sourceType: 'peca' | 'modelo' | 'kit',
            originalPecaId?: string,
            originalModeloId?: string,
            originalKitId?: string,
          }[] = [];

          for (const produtoPedido of pedido.produtos) {
            if (produtoPedido.tipo === 'peca') {
              const pecaDetails = availablePecas.find(p => p.id === produtoPedido.produtoId);
              if (pecaDetails?.gruposImpressao) {
                pecaDetails.gruposImpressao.forEach(gi => {
                  allPrintGroupsNeeded.push({
                    grupo: gi,
                    totalQuantity: produtoPedido.quantidade,
                    sourceName: pecaDetails.nome,
                    sourceType: 'peca',
                    originalPecaId: pecaDetails.id,
                  });
                });
              }
            } else if (produtoPedido.tipo === 'modelo') {
              const modeloDetails = availableModels.find(m => m.id === produtoPedido.produtoId);
              if (modeloDetails?.pecas) {
                for (const pecaRef of modeloDetails.pecas) {
                  const pecaDetails = availablePecas.find(p => p.id === pecaRef.pecaId);
                  if (pecaDetails?.gruposImpressao) {
                    pecaDetails.gruposImpressao.forEach(gi => {
                      allPrintGroupsNeeded.push({
                        grupo: gi,
                        totalQuantity: produtoPedido.quantidade * pecaRef.quantidade,
                        sourceName: modeloDetails.nome,
                        sourceType: 'modelo',
                        originalModeloId: modeloDetails.id,
                        originalPecaId: pecaDetails.id,
                      });
                    });
                  }
                }
              }
            } else if (produtoPedido.tipo === 'kit') {
              const kitDetails = availableKits.find(k => k.id === produtoPedido.produtoId);
              if (kitDetails?.modelos) {
                for (const modeloRef of kitDetails.modelos) {
                  const modeloDetails = availableModels.find(m => m.id === modeloRef.modeloId);
                  if (modeloDetails?.pecas) {
                    for (const pecaRef of modeloDetails.pecas) {
                      const pecaDetails = availablePecas.find(p => p.id === pecaRef.pecaId);
                      if (pecaDetails?.gruposImpressao) {
                        pecaDetails.gruposImpressao.forEach(gi => {
                          allPrintGroupsNeeded.push({
                            grupo: gi,
                            totalQuantity: produtoPedido.quantidade * modeloRef.quantidade * pecaRef.quantidade,
                            sourceName: kitDetails.nome,
                            sourceType: 'kit',
                            originalKitId: kitDetails.id,
                            originalModeloId: modeloDetails?.id,
                            originalPecaId: pecaDetails.id,
                          });
                        });
                      }
                    }
                  }
                }
              }
            }
          }

          const aggregatedGroups: Record<string, {
            originalGroup: GrupoImpressao;
            totalQuantity: number;
            sources: { name: string, type: 'peca' | 'modelo' | 'kit' }[];
          }> = {};

          for (const { grupo, totalQuantity, sourceName, sourceType } of allPrintGroupsNeeded) {
            const key = createCanonicalKey(grupo);
            if (!aggregatedGroups[key]) {
              aggregatedGroups[key] = {
                originalGroup: grupo,
                totalQuantity: 0,
                sources: [],
              };
            }
            aggregatedGroups[key].totalQuantity += totalQuantity;
            if (!aggregatedGroups[key].sources.some(s => s.name === sourceName && s.type === sourceType)) {
              aggregatedGroups[key].sources.push({ name: sourceName, type: sourceType });
            }
          }

          for (const key in aggregatedGroups) {
            const { originalGroup, totalQuantity, sources } = aggregatedGroups[key];
            const limit = originalGroup.quantidadeMaxima || 1;
            
            let groupHasAssembly = false;
            let originalPecaId: string | undefined;
            let originalModeloId: string | undefined;
            let originalKitId: string | undefined;

            for (const source of sources) {
                if (source.type === 'peca') {
                    const peca = availablePecas.find(p => p.nome === source.name);
                    if (peca) {
                        originalPecaId = peca.id;
                        if (peca.tempoMontagem && peca.tempoMontagem > 0) {
                            groupHasAssembly = true;
                            
                        }
                    }
                } else if (source.type === 'modelo') {
                    const modelo = availableModels.find(m => m.id === source.name);
                    if (modelo) {
                        originalModeloId = modelo.id;
                        if (modelo.tempoMontagem && modelo.tempoMontagem > 0) {
                            groupHasAssembly = true;
                            
                        }
                    }
                } else if (source.type === 'kit') {
                    const kit = availableKits.find(k => k.nome === source.name);
                    if (kit) {
                        originalKitId = kit.id;
                        if (kit.tempoMontagem && kit.tempoMontagem > 0) {
                            groupHasAssembly = true;
                            
                        }
                    }
                }
            }

            let remainingQuantity = totalQuantity;
            
            while (remainingQuantity > 0) {
              const quantityForThisRun = Math.min(remainingQuantity, limit);
              
              const productionGroup: ProductionGroup = {
                id: uuidv4(),
                sourceId: sources.map(s => s.name).join(', '),
                sourceType: sources.length > 1 ? 'kit' : sources[0].type,
                sourceName: originalGroup.nome,
                originalPecaId: originalPecaId,
                originalModeloId: originalModeloId,
                originalKitId: originalKitId,
                corFilamento: availableFilamentGroups.find(fg => fg.id === originalGroup.filamentos[0]?.grupoFilamentoId)?.cor || 'N/A',
                items: originalGroup.partes.map(parte => {
                  const parteDetails = availablePartes.find(p => p.id === parte.parteId);
                  return {
                    id: parte.parteId,
                    nome: parteDetails?.nome || 'N/A',
                    quantidadePedido: parte.quantidade * quantityForThisRun,
                    hasAssembly: groupHasAssembly,
                    tipoProduto: 'parte',
                  };
                }),
                filamentosNecessarios: originalGroup.filamentos
                  .filter(filamento => filamento.tipo === 'filamento' && filamento.grupoFilamentoId) // Ensure grupoFilamentoId exists for filaments
                  .map(filamento => {
                    let filamentName = 'Filamento Desconhecido';
                    let filamentId = filamento.grupoFilamentoId!; // Always use grupoFilamentoId for filaments
                    let currentEstoque = 0;
                    let currentLocalEstoque: PosicaoEstoque[] = [];

                    const filamentGroup = availableFilamentGroups.find(fg => fg.id === filamentId);
                    if (filamentGroup) {
                      filamentName = filamentGroup.nome;
                      const { estoqueTotal, posicoesEstoque } = getStockForProduct(filamentGroup.id, 'insumo', availablePecas, availablePartes, allInsumos, availableModels, availableKits, availableFilamentGroups, locaisProdutos, locaisInsumos, recipientes);
                      currentEstoque = estoqueTotal;
                      currentLocalEstoque = posicoesEstoque;
                    } else {
                      filamentName = `Filamento desconhecido (ID: ${filamentId})`;
                    }

                    return {
                      id: filamentId,
                      nome: filamentName,
                      quantidade: filamento.quantidade * quantityForThisRun,
                      tipo: filamento.tipo,
                      estoqueAtualFilamento: currentEstoque,
                      localEstoqueFilamento: currentLocalEstoque,
                    };
                  }),
                outrosInsumosNecessarios: (originalGroup.outrosInsumos || [])
                  .filter(insumo => insumo.insumoId)
                  .map(insumo => {
                    let insumoName = 'Insumo Desconhecido';
                    let currentEstoque = 0;
                    let currentLocalEstoque: PosicaoEstoque[] = [];

                    const foundInsumo = allInsumos.find(i => i.id === insumo.insumoId);
                    if (foundInsumo) {
                      insumoName = foundInsumo.nome;
                      const { estoqueTotal, posicoesEstoque } = getStockForProduct(foundInsumo.id, 'insumo', availablePecas, availablePartes, allInsumos, availableModels, availableKits, availableFilamentGroups, locaisProdutos, locaisInsumos, recipientes);
                      currentEstoque = estoqueTotal;
                      currentLocalEstoque = posicoesEstoque;
                    } else {
                      insumoName = `Insumo desconhecido (ID: ${insumo.insumoId})`;
                    }

                    return {
                      id: insumo.insumoId!,
                      nome: insumoName,
                      quantidade: insumo.quantidade * quantityForThisRun,
                      tipo: insumo.tipo,
                      etapaInstalacao: insumo.etapaInstalacao,
                      estoqueAtualInsumo: currentEstoque,
                      localEstoqueInsumo: currentLocalEstoque,
                    };
                  }),
                tempoImpressaoGrupo: originalGroup.tempoImpressao * quantityForThisRun,
                consumoFilamentoGrupo: originalGroup.filamentos
                  .filter(f => f.tipo === 'filamento')
                  .reduce((acc, f) => acc + f.quantidade, 0) * quantityForThisRun,
                status: 'aguardando',
                pedidoId: pedido.id,
                pedidoNumero: String(pedido.numero || 'N/A'),
                pedidoComprador: pedido.comprador,
                pedidoTotalTempoImpressao: 0,
                pedidoTotalConsumoFilamento: 0,
                pedidoTotalTempoMontagem: 0,
                quantidadeMaxima: originalGroup.quantidadeMaxima, // Pass quantidadeMaxima to ProductionGroup
              };
              productionGroupsAguardando.push(productionGroup);
              remainingQuantity -= quantityForThisRun;
            }
          }
        } else if (pedido.productionGroups) {
          // If productionGroups already exist, add them to the list for optimization if they are 'aguardando'
          productionGroupsAguardando.push(...pedido.productionGroups.filter(g => g.status === 'aguardando').map(g => ({ ...g, pedidoId: pedido.id, pedidoNumero: pedido.numero })));
        }
      }

      const finalOptimizedGroups: OptimizedGroup[] = [];
      const currentAggregatingGroups = new Map<string, OptimizedGroup[]>(); // Key: sourceName-corFilamento-quantidadeMaxima, Value: list of OptimizedGroups

      for (const group of productionGroupsAguardando) {
        const limit = group.quantidadeMaxima || Infinity;
        const groupQuantity = group.items.reduce((acc, item) => acc + item.quantidadePedido, 0);
        const aggregationKey = `${group.sourceName}-${group.corFilamento}-${limit}`;

        let foundExistingOptimizedGroup = false;
        if (currentAggregatingGroups.has(aggregationKey)) {
          const potentialGroups = currentAggregatingGroups.get(aggregationKey)!;
          for (const optimizedGroup of potentialGroups) {
            // Check if adding this group instance would exceed the limit for aggregated groups
            if (optimizedGroup.aggregatedGroupCount + 1 <= limit && optimizedGroup.aggregatedGroupCount < limit) {
              // Aggregate quantities, times, and origins
              optimizedGroup.totalPartsQuantity += groupQuantity; // Sum of parts
              optimizedGroup.aggregatedGroupCount += 1; // Count of aggregated group instances
              optimizedGroup.tempoImpressaoGrupo += group.tempoImpressaoGrupo;
              optimizedGroup.pedidosOrigem.push({ pedidoId: group.pedidoId, pedidoNumero: group.pedidoNumero, groupId: group.id });

              // Aggregate partes and check stock
              let allPartesReady = true;
              for (const item of group.items) {
                const parteKey = item.id;
                if (!optimizedGroup.partesNoGrupo[parteKey]) {
                  optimizedGroup.partesNoGrupo[parteKey] = { nome: item.nome, quantidade: 0, estoqueAtual: 0, quantidadeNecessaria: 0 };
                }
                optimizedGroup.partesNoGrupo[parteKey].quantidade += item.quantidadePedido;
                
                const { estoqueTotal } = getStockForProduct(parteKey, 'parte', availablePecas, availablePartes, allInsumos, availableModels, availableKits, availableFilamentGroups, locaisProdutos, locaisInsumos, recipientes);
                optimizedGroup.partesNoGrupo[parteKey].estoqueAtual = estoqueTotal;
                optimizedGroup.partesNoGrupo[parteKey].quantidadeNecessaria = optimizedGroup.partesNoGrupo[parteKey].quantidade;
                
                if (estoqueTotal < optimizedGroup.partesNoGrupo[parteKey].quantidade) {
                  allPartesReady = false;
                }
              }
              optimizedGroup.partesProntas = allPartesReady;

              // Aggregate filamentos
              let allInsumosReady = true;
              for (const f of group.filamentosNecessarios) {
                const filamentAggregatedId = f.id; // Corrected to use f.id
                console.log("Calling getStockForProduct for filament:", filamentAggregatedId);
                const { estoqueTotal: filamentEstoqueTotal } = getStockForProduct(filamentAggregatedId, 'insumo', availablePecas, availablePartes, allInsumos, availableModels, availableKits, availableFilamentGroups, locaisProdutos, locaisInsumos, recipientes);
                let existingOptimizedFilament = optimizedGroup.filamentosNecessarios.find(ef => ef.aggregatedId === filamentAggregatedId);

                if (existingOptimizedFilament) {
                  existingOptimizedFilament.quantidade += f.quantidade;
                  existingOptimizedFilament.quantidadeNecessaria = (existingOptimizedFilament.quantidadeNecessaria || 0) + f.quantidade; // This is the total needed for the optimized group
                  existingOptimizedFilament.estoqueAtual = filamentEstoqueTotal; // Update stock for the aggregated item
                  console.log(`Updated existing filament: ${existingOptimizedFilament.nome}, Needed: ${existingOptimizedFilament.quantidadeNecessaria}, Stock: ${existingOptimizedFilament.estoqueAtual}`);
                } else {
                  existingOptimizedFilament = {
                    ...f,
                    aggregatedId: filamentAggregatedId,
                    quantidadeNecessaria: f.quantidade,
                    estoqueAtual: filamentEstoqueTotal,
                  };
                  optimizedGroup.filamentosNecessarios.push(existingOptimizedFilament);
                  console.log(`New aggregated filament added: ${existingOptimizedFilament.nome}, Needed: ${existingOptimizedFilament.quantidadeNecessaria}, Stock: ${existingOptimizedFilament.estoqueAtual}`);
                }
                console.log(`Optimized Group (Filament Aggregation): ${existingOptimizedFilament.nome}, Needed: ${existingOptimizedFilament.quantidadeNecessaria}, Stock: ${existingOptimizedFilament.estoqueAtual}`);

                if (filamentEstoqueTotal < existingOptimizedFilament.quantidadeNecessaria!) {
                  allInsumosReady = false;
                }
              }

              // Aggregate outrosInsumos
              for (const i of group.outrosInsumosNecessarios || []) {
                const insumoAggregatedId = i.id; // Corrected to use i.id
                console.log("Calling getStockForProduct for insumo:", insumoAggregatedId);
                const { estoqueTotal: insumoEstoqueTotal } = getStockForProduct(insumoAggregatedId, 'insumo', availablePecas, availablePartes, allInsumos, availableModels, availableKits, availableFilamentGroups, locaisProdutos, locaisInsumos, recipientes);
                let existingOptimizedInsumo = optimizedGroup.outrosInsumosNecessarios.find(ei => ei.aggregatedId === insumoAggregatedId);

                if (existingOptimizedInsumo) {
                  existingOptimizedInsumo.quantidade += i.quantidade;
                  existingOptimizedInsumo.quantidadeNecessaria = (existingOptimizedInsumo.quantidadeNecessaria || 0) + i.quantidade; // This is the total needed for the optimized group
                  existingOptimizedInsumo.estoqueAtual = insumoEstoqueTotal; // Update stock for the aggregated item
                  console.log(`Updated existing insumo: ${existingOptimizedInsumo.nome}, Needed: ${existingOptimizedInsumo.quantidadeNecessaria}, Stock: ${existingOptimizedInsumo.estoqueAtual}`);
                } else {
                  existingOptimizedInsumo = {
                    ...i,
                    aggregatedId: insumoAggregatedId,
                    quantidadeNecessaria: i.quantidade,
                    estoqueAtual: insumoEstoqueTotal,
                  };
                  optimizedGroup.outrosInsumosNecessarios.push(existingOptimizedInsumo);
                  console.log(`New aggregated insumo added: ${existingOptimizedInsumo.nome}, Needed: ${existingOptimizedInsumo.quantidadeNecessaria}, Stock: ${existingOptimizedInsumo.estoqueAtual}`);
                }
                console.log(`Optimized Group (Insumo Aggregation): ${existingOptimizedInsumo.nome}, Needed: ${existingOptimizedInsumo.quantidadeNecessaria}, Stock: ${existingOptimizedInsumo.estoqueAtual}`);

                if (insumoEstoqueTotal < existingOptimizedInsumo.quantidadeNecessaria!) {
                  allInsumosReady = false;
                }
              }
              optimizedGroup.insumosProntos = allInsumosReady;

              if (optimizedGroup.aggregatedGroupCount >= limit) {
                // If the group is now full, move it to finalOptimizedGroups
                finalOptimizedGroups.push(optimizedGroup);
                potentialGroups.splice(potentialGroups.indexOf(optimizedGroup), 1); // Remove from current aggregating
              }
              foundExistingOptimizedGroup = true;
              break;
            }
          }
        }

        if (!foundExistingOptimizedGroup) {
          // Create a new optimized group
          const newOptimizedGroup: OptimizedGroup = {
            id: uuidv4(), // Generate a unique ID for each optimized group
            partesNoGrupo: {},
            totalPartsQuantity: groupQuantity, // Initial sum of parts for this group
            aggregatedGroupCount: 1, // Initial count of aggregated group instances
            pedidosOrigem: [{ pedidoId: group.pedidoId, pedidoNumero: group.pedidoNumero, groupId: group.id }],
            sourceName: group.sourceName,
            tempoImpressaoGrupo: group.tempoImpressaoGrupo,
            corFilamento: group.corFilamento,
            filamentosNecessarios: [],
            outrosInsumosNecessarios: [],
            items: [], // This is simplified as we are aggregating groups
            insumosProntos: true, // Assume true, then set to false if any stock is insufficient
            partesProntas: true, // Assume true, then set to false if any stock is insufficient
          };

          // Populate partesNoGrupo and check stock
          for (const item of group.items) {
            const { estoqueTotal } = getStockForProduct(item.id, 'parte', availablePecas, availablePartes, allInsumos, availableModels, availableKits, availableFilamentGroups, locaisProdutos, locaisInsumos, recipientes);
            newOptimizedGroup.partesNoGrupo[item.id] = { 
              nome: item.nome, 
              quantidade: item.quantidadePedido,
              estoqueAtual: estoqueTotal,
              quantidadeNecessaria: item.quantidadePedido
            };
            if (estoqueTotal < item.quantidadePedido) {
              newOptimizedGroup.partesProntas = false;
            }
          }

          // Populate filamentosNecessarios and check stock
          for (const f of group.filamentosNecessarios) {
            const filamentAggregatedId = f.id; // Corrected to use f.id
            console.log("Calling getStockForProduct for new group filament:", filamentAggregatedId);
            const { estoqueTotal } = getStockForProduct(filamentAggregatedId, 'insumo', availablePecas, availablePartes, allInsumos, availableModels, availableKits, availableFilamentGroups, locaisProdutos, locaisInsumos, recipientes);
            newOptimizedGroup.filamentosNecessarios.push({ ...f, aggregatedId: filamentAggregatedId, quantidadeNecessaria: f.quantidade, estoqueAtual: estoqueTotal });
            console.log(`New optimized group filament: ${f.nome}, Needed: ${f.quantidade}, Stock: ${estoqueTotal}`);
            if (estoqueTotal < f.quantidade) { // Use f.quantidade as the initial quantity needed for this specific item
              newOptimizedGroup.insumosProntos = false;
            }
          }

          // Populate outrosInsumosNecessarios and check stock
          for (const i of group.outrosInsumosNecessarios || []) {
            const insumoAggregatedId = i.id; // Corrected to use i.id
            console.log("Calling getStockForProduct for new group insumo:", insumoAggregatedId);
            const { estoqueTotal } = getStockForProduct(insumoAggregatedId, 'insumo', availablePecas, availablePartes, allInsumos, availableModels, availableKits, availableFilamentGroups, locaisProdutos, locaisInsumos, recipientes);
            newOptimizedGroup.outrosInsumosNecessarios.push({ ...i, aggregatedId: insumoAggregatedId, quantidadeNecessaria: i.quantidade, estoqueAtual: estoqueTotal });
            console.log(`New optimized group insumo: ${i.nome}, Needed: ${i.quantidade}, Stock: ${estoqueTotal}`);
            if (estoqueTotal < i.quantidade) { // Use i.quantidade as the initial quantity needed for this specific item
              newOptimizedGroup.insumosProntos = false;
            }
          }
          console.log(`New Optimized Group Created: ID=${newOptimizedGroup.id}, Source=${newOptimizedGroup.sourceName}, InsumosProntos=${newOptimizedGroup.insumosProntos}, PartesProntas=${newOptimizedGroup.partesProntas}`);
          console.log(`  Filaments:`, newOptimizedGroup.filamentosNecessarios.map(f => ({ name: f.nome, needed: f.quantidadeNecessaria, stock: f.estoqueAtual })));
          console.log(`  Other Insumos:`, newOptimizedGroup.outrosInsumosNecessarios.map(i => ({ name: i.nome, needed: i.quantidadeNecessaria, stock: i.estoqueAtual })));

            if (1 >= limit) { // If a single group instance already meets or exceeds the limit, it forms its own optimized group
            finalOptimizedGroups.push(newOptimizedGroup);
          } else {
            if (!currentAggregatingGroups.has(aggregationKey)) {
              currentAggregatingGroups.set(aggregationKey, []);
            }
            currentAggregatingGroups.get(aggregationKey)!.push(newOptimizedGroup);
          }
        }
      }

      // Add any remaining aggregating groups to the final list
      for (const groups of currentAggregatingGroups.values()) {
        finalOptimizedGroups.push(...groups);
      }

      setOptimizedGroups(new Map(finalOptimizedGroups.map(g => [g.id, g])));
      setCurrentAguardandoGroups(productionGroupsAguardando); // Store the raw aguardando groups
    };

    if (activeTab === 'aguardando') {
      optimizeGroups();
    }
  }, [activeTab, pedidos, availablePecas, availablePartes, allInsumos, availableModels, availableKits, availableFilamentGroups, locaisProdutos, locaisInsumos, recipientes]);

  const fetchFilamentColors = async () => {
    const colorMap = {
      'Amarelo': '#FFD700', 'Areia': '#C2B280', 'Azul': '#0000FF', 'Azul Bebê': '#89CFF0',
      'Azul Cyan': '#00FFFF', 'Azul macaron': '#ADD8E6', 'Azul Tiffany': '#0ABAB5',
      'Branco': '#FFFFFF', 'Cappuccino': '#6F4E37', 'Caucasiano': '#F0DCB0',
      'Cinza Nintendo': '#808080', 'Laranja': '#FFA500', 'Laranja macaron': '#FFDAB9',
      'Magenta': '#FF00FF', 'Marrom': '#A52A2A', 'Natural': '#F5F5DC',
      'Preto': '#000000', 'Rosa Bebê': '#F4C2C2', 'Rosa macaron': '#FFB6C1',
      'Roxo': '#800080', 'Transição': 'linear-gradient(to right, #FF0000, #FFFF00, #00FF00, #0000FF)',
      'Verde': '#008000', 'Vermelho': '#FF0000', 'Vermelho escuro': '#8B0000',
      'Verde macaron': '#90EE90', 'Verde Menta': '#3EB489', 'Verde neon': '#39FF14',
      'Verde Oliva': '#6B8E23'
    };
    setFilamentColors(colorMap);
  };

    const fetchAllInsumos = async (): Promise<Insumo[]> => {
      try {
        const insumosCollection = collection(db, 'insumos');
        const insumoSnapshot = await getDocs(insumosCollection);
        const insumosList = insumoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Insumo));
        console.log("Fetched all insumos data:", insumosList); // Log all insumos
        setAllInsumos(insumosList);
        return insumosList;
      } catch (error) {
        console.error("Error fetching all insumos: ", error);
        return [];
      }
    };

  const fetchAvailablePecas = async (): Promise<Peca[]> => {
    try {
      const querySnapshot = await getDocs(collection(db, 'pecas'));
      const pecasList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Peca));
      setAvailablePecas(pecasList);
      return pecasList;
    } catch (error) {
      console.error("Error fetching available pecas: ", error);
      return [];
    }
  };

  const fetchAvailablePartes = async (): Promise<Parte[]> => {
    try {
      const querySnapshot = await getDocs(collection(db, 'partes'));
      const partesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Parte));
      setAvailablePartes(partesList);
      return partesList;
    } catch (error) {
      console.error("Error fetching available partes: ", error);
      return [];
    }
  };

  const fetchAvailableModels = async (): Promise<Modelo[]> => {
    try {
      const querySnapshot = await getDocs(collection(db, 'modelos'));
      const modelsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Modelo[];
      setAvailableModels(modelsList);
      return modelsList;
    } catch (error) {
      console.error("Error fetching available models: ", error);
      return [];
    }
  };

  const fetchAvailableKits = async (): Promise<Kit[]> => {
    try {
      const querySnapshot = await getDocs(collection(db, 'kits'));
      const kitsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Kit[];
      setAvailableKits(kitsList);
      return kitsList;
    } catch (error) {
      console.error("Error fetching available kits: ", error);
      return [];
    }
  };

    const fetchAvailableFilamentGroups = async (): Promise<GrupoDeFilamento[]> => {
      try {
        const querySnapshot = await getDocs(collection(db, 'gruposDeFilamento'));
        const filamentGroupsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as GrupoDeFilamento[];
        console.log("Fetched all filament groups data:", filamentGroupsList); // Log all filament groups
        setAvailableFilamentGroups(filamentGroupsList);
        return filamentGroupsList;
      } catch (error) {
        console.error("Error fetching available filament groups: ", error);
        return [];
      }
    };

  const fetchLocaisProdutos = async (): Promise<LocalProduto[]> => {
    try {
      const querySnapshot = await getDocs(collection(db, 'locaisProdutos'));
      const locaisList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LocalProduto));
      setLocaisProdutos(locaisList);
      return locaisList;
    } catch (error) {
      console.error("Error fetching product locations: ", error);
      return [];
    }
  };

  const fetchLocaisInsumos = async (): Promise<LocalInsumo[]> => {
    try {
      const querySnapshot = await getDocs(collection(db, 'locaisInsumos'));
      const locaisList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LocalInsumo));
      setLocaisInsumos(locaisList);
      return locaisList;
    } catch (error) {
      console.error("Error fetching insumo locations: ", error);
      return [];
    }
  };

  const fetchRecipientes = async (): Promise<Recipiente[]> => {
    try {
      const querySnapshot = await getDocs(collection(db, 'recipientes'));
      const recipientesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recipiente));
      setRecipientes(recipientesList);
      return recipientesList;
    } catch (error) {
      console.error("Error fetching recipients: ", error);
      return [];
    }
  };

  const getStockForProduct = (
    productId: string,
    productType: 'parte' | 'peca' | 'modelo' | 'kit' | 'insumo',
    allPecasData: Peca[],
    allPartesData: Parte[],
    allInsumosData: Insumo[],
    allModelsData: Modelo[],
    allKitsData: Kit[],
    allFilamentGroupsData: GrupoDeFilamento[],
    allLocaisProdutosData: LocalProduto[],
    allLocaisInsumosData: LocalInsumo[],
    allRecipientesData: Recipiente[]
  ): { estoqueTotal: number; posicoesEstoque: PosicaoEstoque[] } => {

    let estoqueTotal = 0;
    let posicoesEstoque: PosicaoEstoque[] = [];
    
    const calculateStockFromPositions = (positions: PosicaoEstoque[] | undefined): number => {
        if (!positions) return 0;
        return positions.reduce((acc, pos) => acc + (pos.quantidade || 0), 0);
    };

    const enrichPosicoesEstoque = (positions: PosicaoEstoque[] | undefined, type: 'produto' | 'insumo'): PosicaoEstoque[] => {
      if (!positions) return [];
      return positions.map(pos => {
        const recipiente = allRecipientesData.find(r => r.id === pos.recipienteId);
        if (!recipiente) return pos;
        let local;
        if (type === 'produto') {
          local = allLocaisProdutosData.find(l => l.id === recipiente.localEstoqueId);
        } else {
          local = allLocaisInsumosData.find(l => l.id === recipiente.localEstoqueId);
        }
        return {
          ...pos,
          localId: recipiente.localEstoqueId,
          localNome: local?.nome || 'N/A',
          posicaoNaGrade: recipiente.posicaoNaGrade
        };
      });
    };

    let product: any = null;

    if (productType === 'parte') {
      product = allPartesData.find(p => p.id === productId);
      if (product) {
        estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(product.posicoesEstoque);
        posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque, 'produto');
      }
    } else if (productType === 'insumo') {
      const filamentGroup = allFilamentGroupsData.find(fg => fg.id === productId);
      if (filamentGroup) {
        // Para grupos de filamento, usar estoqueTotalGramas para o total.
        // posicoesEstoque será um array vazio, pois GrupoDeFilamento não armazena posições diretamente.
        estoqueTotal = filamentGroup.estoqueTotalGramas ?? 0;
        posicoesEstoque = []; // Explicitamente vazio para grupos de filamento
        console.log(`getStockForProduct (Filament Group): ID=${productId}, Name=${filamentGroup.nome}, EstoqueTotal=${estoqueTotal}, PosicoesEstoque=${JSON.stringify(posicoesEstoque)}`);
      } else {
        const insumo = allInsumosData.find(i => i.id === productId);
        if (insumo) {
          // Para insumos individuais, usar estoqueAtual, com fallback para estoqueTotal ou cálculo de posições.
          estoqueTotal = (insumo as any).estoqueAtual ?? insumo.estoqueTotal ?? calculateStockFromPositions(insumo.posicoesEstoque);
          posicoesEstoque = enrichPosicoesEstoque(insumo.posicoesEstoque, 'insumo');
          console.log(`getStockForProduct (Insumo): ID=${productId}, Name=${insumo.nome}, EstoqueTotal=${estoqueTotal}, PosicoesEstoque=${JSON.stringify(posicoesEstoque)}`);
        }
      }
    } else if (productType === 'peca') {
      product = allPecasData.find(p => p.id === productId);
      if (product) {
        estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(product.posicoesEstoque);
        posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque, 'produto');
      }
    } else if (productType === 'modelo') {
      product = allModelsData.find(m => m.id === productId);
      if (product) {
        estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(product.posicoesEstoque);
        posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque, 'produto');
      }
    } else if (productType === 'kit') {
      product = allKitsData.find(k => k.id === productId);
      if (product) {
        estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(product.posicoesEstoque);
        posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque, 'produto');
      }
    }

    return { estoqueTotal, posicoesEstoque };
  };

  type StockStatus = 'full_stock' | 'partial_stock' | 'no_stock';

  const getGroupStockStatus = (group: ProductionGroup): StockStatus => {
    let hasAnyZeroStock = false;
    let hasAnyInsufficientStock = false;

    for (const item of group.items) {
      const currentStock = item.estoqueAtualItem ?? 0;
      if (currentStock < item.quantidadePedido) {
        hasAnyInsufficientStock = true;
        if (currentStock === 0) {
          hasAnyZeroStock = true;
        }
      }
    }

    for (const filamento of group.filamentosNecessarios) {
      const currentStock = filamento.estoqueAtualFilamento ?? 0;
      if (currentStock < filamento.quantidade) {
        hasAnyInsufficientStock = true;
        if (currentStock === 0) {
          hasAnyZeroStock = true;
        }
      }
    }

    for (const insumo of (group.outrosInsumosNecessarios || [])) {
      const currentStock = insumo.estoqueAtualInsumo ?? 0;
      if (currentStock < insumo.quantidade) {
        hasAnyInsufficientStock = true;
        if (currentStock === 0) {
          hasAnyZeroStock = true;
        }
      }
    }

    if (hasAnyZeroStock) {
      return 'no_stock';
    } else if (hasAnyInsufficientStock) {
      return 'partial_stock';
    } else {
      return 'full_stock';
    }
  };

  const mapTipoProdutoToPlural = (tipo: 'parte' | 'peca' | 'modelo' | 'kit' | 'insumo' | undefined): 'partes' | 'pecas' | 'modelos' | 'kits' | undefined => {
    if (!tipo) return undefined;
    switch (tipo) {
      case 'parte': return 'partes';
      case 'peca': return 'pecas';
      case 'modelo': return 'modelos';
      case 'kit': return 'kits';
      default: return undefined;
    }
  };

  const handleDebitStock = async (
    pedidoId: string,
    groupId: string,
    debitType: 'full' | 'available'
  ) => {
    try {
      const pedidoToUpdate = pedidos.find(p => p.id === pedidoId);
      if (!pedidoToUpdate) {
        console.error("Pedido not found in local state:", pedidoId);
        return;
      }

      const groupToUpdate = pedidoToUpdate.productionGroups?.find(g => g.id === groupId);
      if (!groupToUpdate) {
        console.error("Group not found in local state:", groupId);
        return;
      }

      const itemsToProcess: {
        id: string;
        nome: string;
        quantidadePedido: number;
        estoqueAtualItem: number;
        localEstoqueItem: PosicaoEstoque[];
        type: 'parte' | 'filamento' | 'insumo';
      }[] = [];

      groupToUpdate.items.forEach(item => {
        itemsToProcess.push({
          id: item.id,
          nome: item.nome,
          quantidadePedido: item.quantidadePedido,
          estoqueAtualItem: item.estoqueAtualItem ?? 0,
          localEstoqueItem: item.localEstoqueItem || [],
          type: 'parte',
        });
      });

      groupToUpdate.filamentosNecessarios.forEach(filamento => {
        itemsToProcess.push({
          id: filamento.id,
          nome: filamento.nome,
          quantidadePedido: filamento.quantidade,
          estoqueAtualItem: filamento.estoqueAtualFilamento ?? 0,
          localEstoqueItem: filamento.localEstoqueFilamento || [],
          type: 'filamento',
        });
      });

      (groupToUpdate.outrosInsumosNecessarios || []).forEach(insumo => {
        itemsToProcess.push({
          id: insumo.id,
          nome: insumo.nome,
          quantidadePedido: insumo.quantidade,
          estoqueAtualItem: insumo.estoqueAtualInsumo ?? 0,
          localEstoqueItem: insumo.localEstoqueInsumo || [],
          type: 'insumo',
        });
      });

      for (const item of itemsToProcess) {
        const quantityToDebit = debitType === 'full' ? item.quantidadePedido : Math.min(item.quantidadePedido, item.estoqueAtualItem);

        if (quantityToDebit === 0) {
          continue;
        }

        if (debitType === 'full' && item.estoqueAtualItem < item.quantidadePedido) {
          alert(`Erro: Estoque insuficiente para ${item.nome}. Necessário: ${item.quantidadePedido}, Disponível: ${item.estoqueAtualItem}.`);
          return;
        }

        const availablePositions = item.localEstoqueItem || [];

        if (availablePositions.length === 1) {
          const singlePosition = availablePositions[0];
          if (singlePosition.quantidade < quantityToDebit) {
            alert(`Erro: A única posição de estoque para ${item.nome} (${singlePosition.quantidade}) não tem quantidade suficiente para o débito (${quantityToDebit}).`);
            return;
          }

          if (item.type === 'parte') {
            const lancamentoProduto: LancamentoProduto = {
              id: uuidv4(),
              produtoId: item.id,
              tipoProduto: 'partes',
              tipoMovimento: 'saida',
              usuario: 'Sistema de Produção',
              observacao: `Débito de estoque automático para Pedido #${pedidoId}, Grupo de Produção: ${groupId} (única localização, tipo: ${debitType})`,
              data: Timestamp.fromDate(new Date()),
              locais: [
                {
                  recipienteId: singlePosition.recipienteId,
                  divisao: singlePosition.divisao,
                  quantidade: quantityToDebit,
                  localId: singlePosition.localId || '',
                }
              ]
            };
            await addDoc(collection(db, 'lancamentosProdutos'), cleanObject(lancamentoProduto));
          } else {
            const lancamentoInsumo: LancamentoInsumo = {
              id: uuidv4(),
              insumoId: item.id,
              tipoInsumo: item.type === 'filamento' ? 'filamento' : 'outros',
              tipoMovimento: 'saida',
              quantidade: quantityToDebit,
              unidadeMedida: item.type === 'filamento' ? 'gramas' : 'unidades',
              detalhes: `Débito de estoque automático para Pedido #${pedidoId}, Grupo de Produção: ${groupId} (única localização, tipo: ${debitType})`,
              data: Timestamp.fromDate(new Date()),
              locais: [
                {
                  recipienteId: singlePosition.recipienteId,
                  divisao: singlePosition.divisao,
                  quantidade: quantityToDebit,
                  localId: singlePosition.localId || '',
                }
              ]
            };
            await addDoc(collection(db, 'lancamentosInsumos'), cleanObject(lancamentoInsumo));
          }
        } else if (availablePositions.length > 1 && quantityToDebit > 0) {
          setItemToDebit({ ...item, pedidoId, groupId, debitType });
          setIsStockSelectionModalOpen(true);
          return;
        } else if (availablePositions.length === 0 && quantityToDebit > 0) {
          alert(`Erro: Nenhuma posição de estoque encontrada para ${item.nome} para debitar ${quantityToDebit} unidades.`);
          return;
        }
      }

      const newStatus: ProductionGroup['status'] = groupToUpdate.items.some(i => i.hasAssembly) ? 'em_montagem' : 'produzido';
      await updateProductionGroupStatus(pedidoId, groupId, newStatus);
      await refetchAllData();

    } catch (error) {
      console.error("Error during stock debit: ", error);
      alert("Ocorreu um erro ao tentar debitar o estoque. Verifique o console para mais detalhes.");
    }
  };

  const handleStockSelection = async (debits: { selectedPosition: PosicaoEstoque; quantityToDebit: number }[]) => {
    if (!itemToDebit) return;

    const { id, nome, quantidadePedido, type, pedidoId, groupId, debitType } = itemToDebit;
    let totalDebited = 0;

    try {
      for (const debit of debits) {
        if (debit.quantityToDebit > 0) {
          if (type === 'parte') {
            const lancamentoProduto: LancamentoProduto = {
              id: uuidv4(),
              produtoId: id,
              tipoProduto: 'partes',
              tipoMovimento: 'saida',
              usuario: 'Sistema de Produção',
              observacao: `Débito de estoque manual para Pedido #${pedidoId}, Grupo de Produção: ${groupId} (múltiplas localizações, tipo: ${debitType})`,
              data: Timestamp.fromDate(new Date()),
              locais: [
                {
                  recipienteId: debit.selectedPosition.recipienteId,
                  divisao: debit.selectedPosition.divisao,
                  quantidade: debit.quantityToDebit,
                  localId: debit.selectedPosition.localId || '',
                }
              ]
            };
            await addDoc(collection(db, 'lancamentosProdutos'), cleanObject(lancamentoProduto));
            totalDebited += debit.quantityToDebit;
          } else {
            const lancamentoInsumo: LancamentoInsumo = {
              id: uuidv4(),
              insumoId: id,
              tipoInsumo: type === 'filamento' ? 'filamento' : 'outros',
              tipoMovimento: 'saida',
              quantidade: debit.quantityToDebit,
              unidadeMedida: type === 'filamento' ? 'gramas' : 'unidades',
              detalhes: `Débito de estoque manual para Pedido #${pedidoId}, Grupo de Produção: ${groupId} (múltiplas localizações, tipo: ${debitType})`,
              data: Timestamp.fromDate(new Date()),
              locais: [
                {
                  recipienteId: debit.selectedPosition.recipienteId,
                  divisao: debit.selectedPosition.divisao,
                  quantidade: debit.quantityToDebit,
                  localId: debit.selectedPosition.localId || '',
                }
              ]
            };
            await addDoc(collection(db, 'lancamentosInsumos'), cleanObject(lancamentoInsumo));
            totalDebited += debit.quantityToDebit;
          }
        }
      }
      
      if (debitType === 'full' && totalDebited < quantidadePedido) {
        alert(`Atenção: A quantidade total debitada (${totalDebited}) é menor que a quantidade necessária (${quantidadePedido}).`);
        setIsStockSelectionModalOpen(false);
        setItemToDebit(null);
        await refetchAllData();
        return;
      }

      const pedidoToUpdate = pedidos.find(p => p.id === pedidoId);
      const groupToUpdate = pedidoToUpdate?.productionGroups?.find(g => g.id === groupId);
      if (groupToUpdate) {
        const newStatus: ProductionGroup['status'] = groupToUpdate.items.some(i => i.hasAssembly) ? 'em_montagem' : 'produzido';
        await updateProductionGroupStatus(pedidoId, groupId, newStatus);
      }

      await refetchAllData();
      setIsStockSelectionModalOpen(false);
      setItemToDebit(null);
    } catch (error) {
      console.error("Error during manual stock debit: ", error);
      alert("Ocorreu um erro ao debitar o estoque. Verifique o console para mais detalhes.");
    }
  };

  const refetchAllData = async () => {
    const insumos = await fetchAllInsumos();
    const pecas = await fetchAvailablePecas();
    const partes = await fetchAvailablePartes();
    const models = await fetchAvailableModels();
    const kits = await fetchAvailableKits();
    const filamentGroups = await fetchAvailableFilamentGroups();
    const locaisProdutosData = await fetchLocaisProdutos();
    const locaisInsumosData = await fetchLocaisInsumos();
    const recipientesData = await fetchRecipientes();
    fetchPedidos(insumos, pecas, partes, models, kits, filamentGroups, locaisProdutosData, locaisInsumosData, recipientesData);
  };

  const fetchPedidos = async (allInsumosData: Insumo[], pecasData: Peca[], partesData: Parte[], modelsData: Modelo[], kitsData: Kit[], filamentGroupsData: GrupoDeFilamento[], locaisProdutosData: LocalProduto[], locaisInsumosData: LocalInsumo[], recipientesData: Recipiente[]) => {
    try {
      const querySnapshot = await getDocs(collection(db, 'pedidos'));
      const pedidosList: Pedido[] = [];

      for (const docSnap of querySnapshot.docs) {
        const pedidoData = docSnap.data();
        const pedido: Pedido = {
          id: docSnap.id,
          numero: String(pedidoData.numero || 'N/A'),
          comprador: pedidoData.comprador,
          produtos: pedidoData.produtos,
          status: pedidoData.status,
          itensProducao: pedidoData.itensProducao,
          etapas: pedidoData.etapas,
          custos: pedidoData.custos,
          tempos: pedidoData.tempos,
          dataCriacao: pedidoData.dataCriacao.toDate(),
          dataPrevisao: pedidoData.dataPrevisao.toDate(),
          dataConclusao: pedidoData.dataConclusao ? pedidoData.dataConclusao.toDate() : null,
          productionGroups: [],
        };

        if (pedidoData.productionGroups && pedidoData.productionGroups.length > 0) {
          pedido.productionGroups = pedidoData.productionGroups.map((group: ProductionGroup) => {
            let groupHasAssembly = false;

            if (group.originalPecaId) {
                const peca = pecasData.find(p => p.id === group.originalPecaId);
                if (peca && peca.tempoMontagem && peca.tempoMontagem > 0) {
                    groupHasAssembly = true;
                }
            } else if (group.originalModeloId) {
                const modelo = modelsData.find(m => m.id === group.originalModeloId);
                if (modelo && modelo.tempoMontagem && modelo.tempoMontagem > 0) {
                    groupHasAssembly = true;
                }
            } else if (group.originalKitId) {
                const kit = kitsData.find(k => k.id === group.originalKitId);
                if (kit && kit.tempoMontagem && kit.tempoMontagem > 0) {
                    groupHasAssembly = true;
                }
            } else {
                const sourceNames = (group.sourceId || group.sourceName).split(', ');
                for (const sourceName of sourceNames) {
                    const peca = pecasData.find(p => p.nome === sourceName);
                    if (peca && peca.tempoMontagem && peca.tempoMontagem > 0) {
                        groupHasAssembly = true;
                        break;
                    }
                    const modelo = modelsData.find(m => m.nome === sourceName);
                    if (modelo && modelo.tempoMontagem && modelo.tempoMontagem > 0) {
                        groupHasAssembly = true;
                        break;
                    }
                    const kit = kitsData.find(k => k.nome === sourceName);
                    if (kit && kit.tempoMontagem && kit.tempoMontagem > 0) {
                        groupHasAssembly = true;
                        break;
                    }
                }
            }

            return {
              ...group,
              startedAt: group.startedAt instanceof Timestamp ? group.startedAt.toDate() : group.startedAt,
              completedAt: group.completedAt instanceof Timestamp ? group.completedAt.toDate() : group.completedAt,
              items: (group.items || []).map(item => {
                const { estoqueTotal, posicoesEstoque } = getStockForProduct(item.id, 'parte', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
                return {
                  ...item,
                  hasAssembly: item.hasAssembly ?? groupHasAssembly,
                  estoqueAtualItem: estoqueTotal,
                  localEstoqueItem: posicoesEstoque,
                };
              }),
              filamentosNecessarios: (group.filamentosNecessarios || [])
                .filter(filamento => filamento.tipo === 'filamento')
                .map(filamento => {
                  const { estoqueTotal, posicoesEstoque } = getStockForProduct(filamento.id, 'insumo', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
                  return {
                    ...filamento,
                    estoqueAtualFilamento: estoqueTotal,
                    localEstoqueFilamento: posicoesEstoque,
                  };
                }),
              outrosInsumosNecessarios: (group.outrosInsumosNecessarios || [])
                .filter(insumo => insumo.id)
                .map(insumo => {
                  let insumoName = 'Insumo Desconhecido';
                  let currentEstoque = 0;
                  let currentLocalEstoque: PosicaoEstoque[] = [];

                  const foundInsumo = allInsumosData.find(i => i.id === insumo.id);
                  if (foundInsumo) {
                    insumoName = foundInsumo.nome;
                    const { estoqueTotal, posicoesEstoque } = getStockForProduct(foundInsumo.id, 'insumo', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
                    currentEstoque = estoqueTotal;
                    currentLocalEstoque = posicoesEstoque;
                  } else {
                    insumoName = `Insumo desconhecido (ID: ${insumo.id})`;
                  }

                  return {
                    ...insumo,
                    nome: insumoName,
                    estoqueAtualInsumo: currentEstoque,
                    localEstoqueInsumo: currentLocalEstoque,
                  };
                }),
            };
          });
        }
        
        // The productionGroups are now only enriched if they already exist in Firestore.
        // New production groups for 'aguardando' status will be generated on the fly by optimizeGroups.
        
        if (pedido.productionGroups && pedido.productionGroups.length > 0) {
          pedido.tempos.impressao = pedido.productionGroups.reduce((acc, group) => acc + group.tempoImpressaoGrupo, 0);
          pedido.tempos.totalConsumoFilamento = pedido.productionGroups.reduce((acc, group) => acc + group.consumoFilamentoGrupo, 0);
        }

        let totalMontagem = 0;
        for (const produto of pedido.produtos) {
          let itemDetails;
          if (produto.tipo === 'peca') {
            itemDetails = pecasData.find(p => p.id === produto.produtoId);
          } else if (produto.tipo === 'modelo') {
            itemDetails = modelsData.find(m => m.id === produto.produtoId);
          } else if (produto.tipo === 'kit') {
            itemDetails = kitsData.find(k => k.id === produto.produtoId);
          }
          if (itemDetails) {
            totalMontagem += (itemDetails.tempoMontagem || 0) * produto.quantidade;
          }
        }
        pedido.tempos.montagem = totalMontagem;
        
        pedidosList.push(pedido);
      }
      setPedidos(pedidosList);
    } catch (error) {
      console.error("Error fetching pedidos: ", error);
    }
  };

  const handleStartOptimizedProduction = async (group: OptimizedGroup) => {
    const batch = writeBatch(db);
    const updatesByPedido = new Map<string, string[]>();

    // Group updates by pedidoId
    for (const origem of group.pedidosOrigem) {
      if (!updatesByPedido.has(origem.pedidoId)) {
        updatesByPedido.set(origem.pedidoId, []);
      }
      updatesByPedido.get(origem.pedidoId)!.push(origem.groupId);
    }

    for (const [pedidoId, groupIdsToUpdate] of updatesByPedido.entries()) {
      const pedidoRef = doc(db, 'pedidos', pedidoId);
      const pedidoData = pedidos.find(p => p.id === pedidoId);

      if (pedidoData) {
        // Filter out the groups that are being launched from the existing productionGroups
        // and add the new, snapshotted versions.
        const existingProductionGroups = pedidoData.productionGroups || [];
        const nonLaunchedGroups = existingProductionGroups.filter(pg => !groupIdsToUpdate.includes(pg.id));

        const launchedGroups: ProductionGroup[] = [];
        for (const launchedGroupId of groupIdsToUpdate) {
          const originalAguardandoGroup = currentAguardandoGroups.find(g => g.pedidoId === pedidoId && g.id === launchedGroupId);
          if (originalAguardandoGroup) {
            let newStatus: ProductionGroup['status'];
            if (group.partesProntas) {
              newStatus = 'produzido'; // Skip production if parts are ready
            } else {
              newStatus = 'em_producao';
            }

            // Create a deep copy to ensure immutability and set new status
            const newLaunchedGroup: ProductionGroup = {
              ...originalAguardandoGroup,
              status: newStatus,
              startedAt: Timestamp.now(),
              completedAt: null, // Ensure completedAt is null when starting
            };
            launchedGroups.push(newLaunchedGroup);
          }
        }

        const updatedGroups = [...nonLaunchedGroups, ...launchedGroups];

        let newStatus = pedidoData.status;
        if (newStatus === 'aguardando') {
          newStatus = 'em_producao';
        }
        
        const cleanedUpdatedGroups = cleanObject(updatedGroups);
        batch.update(pedidoRef, { productionGroups: cleanedUpdatedGroups, status: newStatus });
      }
    }

    try {
      await batch.commit();
      refetchAllData();
    } catch (error) {
      console.error("Error starting optimized production:", error);
      alert("Failed to start production. Check console for details.");
    }
  };

  const updateProductionGroupStatus = async (pedidoId: string, groupId: string, newStatus: ProductionGroup['status']) => {
    try {
      const pedidoToUpdate = pedidos.find(p => p.id === pedidoId);
      if (!pedidoToUpdate) {
        console.error("Pedido not found in local state:", pedidoId);
        return;
      }

      const groupToUpdate = pedidoToUpdate.productionGroups?.find(g => g.id === groupId);
      if (!groupToUpdate) {
        console.error("Group not found in local state:", groupId);
        return;
      }

      const updatedGroups = (pedidoToUpdate.productionGroups || []).map(group => {
        if (group.id === groupId) {
          const updatedGroup: ProductionGroup = {
            ...group,
            status: newStatus,
          };

          if (newStatus === 'em_producao') {
            updatedGroup.startedAt = new Date();
            updatedGroup.completedAt = null;
          } else if (newStatus === 'produzido' || newStatus === 'em_montagem' || newStatus === 'montado') {
            updatedGroup.completedAt = new Date();
            updatedGroup.startedAt = updatedGroup.startedAt ?? null;
          } else {
            updatedGroup.startedAt = null;
            updatedGroup.completedAt = null;
          }
          return updatedGroup;
        }
        return group;
      });

      setPedidos(prevPedidos =>
        prevPedidos.map(p => (p.id === pedidoId ? { ...p, productionGroups: updatedGroups } : p))
      );

      const cleanedUpdatedGroups = cleanObject(updatedGroups);
      await updateDoc(doc(db, 'pedidos', pedidoId), { productionGroups: cleanedUpdatedGroups });

      const currentGroup = updatedGroups.find(g => g.id === groupId);
      if (currentGroup) {
        if (newStatus === 'produzido') {
          for (const filamento of currentGroup.filamentosNecessarios) {
            if (filamento.quantidade > 0) {
              const lancamentoInsumo: LancamentoInsumo = {
                id: uuidv4(),
                insumoId: filamento.id,
                tipoInsumo: 'filamento',
                tipoMovimento: 'saida',
                quantidade: filamento.quantidade,
                unidadeMedida: 'gramas',
                data: Timestamp.fromDate(new Date()),
                origem: `Consumo Impressão Pedido #${pedidoToUpdate.numero}, Grupo: ${currentGroup.sourceName}`,
                detalhes: `Consumo de filamento ${filamento.nome} para produção de ${currentGroup.sourceName} (Pedido ${pedidoToUpdate.numero})`,
                locais: filamento.localEstoqueFilamento || [],
              };
              await addDoc(collection(db, 'lancamentosInsumos'), cleanObject(lancamentoInsumo));
            }
          }
          for (const insumo of (currentGroup.outrosInsumosNecessarios || [])) {
            if (insumo.quantidade > 0 && insumo.etapaInstalacao === 'impressao') {
              const lancamentoInsumo: LancamentoInsumo = {
                id: uuidv4(),
                insumoId: insumo.id,
                tipoInsumo: insumo.tipo as 'material' | 'outros', // Changed from 'tempo' | 'material' | 'outros'
                tipoMovimento: 'saida',
                quantidade: insumo.quantidade,
                unidadeMedida: insumo.tipo === 'tempo' ? 'horas' : 'unidades', // 'tempo' still exists here, needs to be removed
                data: Timestamp.fromDate(new Date()),
                origem: `Consumo Impressão Pedido #${pedidoToUpdate.numero}, Grupo: ${currentGroup.sourceName}`,
                detalhes: `Consumo de insumo ${insumo.nome} para produção de ${currentGroup.sourceName} (Pedido ${pedidoToUpdate.numero})`,
                locais: insumo.localEstoqueInsumo || [],
              };
              await addDoc(collection(db, 'lancamentosInsumos'), cleanObject(lancamentoInsumo));
            }
          }
        } else if (newStatus === 'montado') {
          for (const item of currentGroup.items) {
            if (item.quantidadePedido > 0) {
              const lancamentoProduto: LancamentoProduto = {
                id: uuidv4(),
                produtoId: item.id,
                tipoProduto: mapTipoProdutoToPlural(item.tipoProduto) as 'partes' | 'pecas' | 'modelos' | 'kits',
                tipoMovimento: 'saida',
                usuario: 'Sistema de Produção',
                observacao: `Consumo de ${item.nome} para montagem de ${currentGroup.sourceName} (Pedido ${pedidoToUpdate.numero})`,
                data: Timestamp.fromDate(new Date()),
                locais: item.localEstoqueItem || [],
              };
              await addDoc(collection(db, 'lancamentosProdutos'), cleanObject(lancamentoProduto));
            }
          }
          for (const insumo of (currentGroup.outrosInsumosNecessarios || [])) {
            if (insumo.quantidade > 0 && insumo.etapaInstalacao === 'montagem') {
              const lancamentoInsumo: LancamentoInsumo = {
                id: uuidv4(),
                insumoId: insumo.id,
                tipoInsumo: insumo.tipo as 'material' | 'outros', // Changed from 'tempo' | 'material' | 'outros'
                tipoMovimento: 'saida',
                quantidade: insumo.quantidade,
                unidadeMedida: insumo.tipo === 'tempo' ? 'horas' : 'unidades', // 'tempo' still exists here, needs to be removed
                data: Timestamp.fromDate(new Date()),
                origem: `Consumo Montagem Pedido #${pedidoToUpdate.numero}, Grupo: ${currentGroup.sourceName}`,
                detalhes: `Consumo de insumo ${insumo.nome} para montagem de ${currentGroup.sourceName} (Pedido ${pedidoToUpdate.numero})`,
                locais: insumo.localEstoqueInsumo || [],
              };
              await addDoc(collection(db, 'lancamentosInsumos'), cleanObject(lancamentoInsumo));
            }
          }
        }
      }

      await refetchAllData();

    } catch (error) {
      console.error("Error updating production group status: ", error);
    }
  };

  const revertProductionGroupStatus = async (pedidoId: string, groupId: string, currentStatus: ProductionGroup['status']) => {
    let newStatus: ProductionGroup['status'] = 'aguardando';

    if (currentStatus === 'produzido') newStatus = 'em_producao';
    else if (currentStatus === 'montado') newStatus = 'produzido';
    else if (currentStatus === 'concluido') newStatus = 'montado';
    else if (currentStatus === 'em_producao') newStatus = 'aguardando';

    try {
      const pedidoToUpdate = pedidos.find(p => p.id === pedidoId);
      if (!pedidoToUpdate) {
        console.error("Pedido not found in local state:", pedidoId);
        return;
      }

      const updatedGroups = (pedidoToUpdate.productionGroups || []).map(group => {
        if (group.id === groupId) {
          const updatedGroup: ProductionGroup = {
            ...group,
            status: newStatus,
          };

          if (newStatus === 'em_producao') {
            updatedGroup.startedAt = new Date();
            updatedGroup.completedAt = null;
          } else if (newStatus === 'produzido') {
            updatedGroup.completedAt = new Date();
            updatedGroup.startedAt = updatedGroup.startedAt ?? null;
          } else {
            updatedGroup.startedAt = null;
            updatedGroup.completedAt = null;
          }
          return updatedGroup;
        }
        return group;
      });

      setPedidos(prevPedidos =>
        prevPedidos.map(p => (p.id === pedidoId ? { ...p, productionGroups: updatedGroups } : p))
      );

      const cleanedUpdatedGroups = cleanObject(updatedGroups);
      await updateDoc(doc(db, 'pedidos', pedidoId), { productionGroups: cleanedUpdatedGroups });

    } catch (error) {
      console.error("Error reverting production group status: ", error);
    }
  };

  const formatTime = (minutes: number): string => {
    if (minutes === 0) return '0h 0m';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
  };

  const formatFilament = (grams: number): string => {
    if (grams === 0) return '0g';
    if (grams < 1000) return `${grams.toFixed(2)}g`;
    return `${(grams / 1000).toFixed(2)}kg`;
  };

  const handleOpenLaunchModal = (group: ProductionGroup) => {
    setSelectedProductionGroup(group);
    setIsLaunchModalOpen(true);
  };

  const handleCloseLaunchModal = () => {
    setIsLaunchModalOpen(false);
    setSelectedProductionGroup(null);
  };

  const handleLaunchSuccess = async () => {
    if (selectedProductionGroup) {
      await updateProductionGroupStatus(selectedProductionGroup.pedidoId, selectedProductionGroup.id, 'produzido');
    }
    await refetchAllData();
    handleCloseLaunchModal();
  };

  const handleConcluirImpressao = async (group: ProductionGroup) => {
    const batch = writeBatch(db);
    const pedidoRef = doc(db, 'pedidos', group.pedidoId);

    try {
        for (const filamento of group.filamentosNecessarios) {
            const lancamentoInsumoRef = doc(collection(db, 'lancamentosInsumos'));
            batch.set(lancamentoInsumoRef, {
                insumoId: filamento.id,
                tipoInsumo: 'filamento',
                tipoMovimento: 'saida',
                quantidade: filamento.quantidade,
                unidadeMedida: 'gramas',
                data: Timestamp.now(),
                detalhes: `Consumo para grupo de impressão: ${group.sourceName} do Pedido #${group.pedidoNumero}`,
            });
        }

        const lancamentoServicoRef = doc(collection(db, 'lancamentoServicos'));
        batch.set(lancamentoServicoRef, {
            servicoId: 'impressao_3d',
            pedidoId: group.pedidoId,
            quantidade: group.tempoImpressaoGrupo / 60,
            data: Timestamp.now(),
            usuario: auth.currentUser?.displayName || 'Sistema',
        });

        const pedidoDoc = await getDoc(pedidoRef);
        if (!pedidoDoc.exists()) throw new Error("Pedido não encontrado.");
        
        const pedidoData = pedidoDoc.data() as Pedido;
        const peca = availablePecas.find(p => p.id === group.originalPecaId);
        if (!peca) throw new Error("Peça original do grupo não encontrada.");

        const nextStatus = peca.tipoPeca === 'composta_um_grupo_com_montagem' || peca.tipoPeca === 'composta_multiplos_grupos'
            ? 'em_montagem_pecas'
            : 'processando_embalagem';

        const updatedItensProducao = pedidoData.itensProducao?.map(item => {
            if (item.refId === group.originalPecaId) {
                const newPartesDisponiveis = [...(item.partesDisponiveis || [])];
                
                group.items.forEach(producedItem => {
                    const existingParte = newPartesDisponiveis.find(p => p.parteId === producedItem.id);
                    if (existingParte) {
                        existingParte.quantidade += producedItem.quantidadePedido;
                    } else {
                        newPartesDisponiveis.push({ parteId: producedItem.id, quantidade: producedItem.quantidadePedido });
                    }
                });

                return { ...item, status: nextStatus, partesDisponiveis: newPartesDisponiveis };
            }
            return item;
        }) || [];

        batch.update(pedidoRef, { itensProducao: updatedItensProducao });

        const firstItem = group.items[0];
        if (firstItem) {
            const excessQuantity = 0; // Placeholder for actual excess calculation
            if (excessQuantity > 0) {
                const itemProducao = updatedItensProducao.find(ip => ip.refId === group.originalPecaId);
                setExcessPartData({
                    id: firstItem.id,
                    nome: firstItem.nome,
                    sku: 'N/A',
                    quantidade: excessQuantity,
                    pecaTipo: peca.tipoPeca,
                    itemProducaoId: itemProducao!.id
                });
                setIsExcessModalOpen(true);
            }
        }

        await batch.commit();
        await updateProductionGroupStatus(group.pedidoId, group.id, 'produzido');
        refetchAllData();

    } catch (error) {
        console.error("Erro ao concluir impressão:", error);
        alert("Falha ao concluir a impressão. Verifique o console.");
    }
  };

  const handleSendToAssembly = async (itemProducaoId: string, parteId: string, quantidade: number) => {
    try {
        const pedido = pedidos.find(p => p.itensProducao?.some(item => item.id === itemProducaoId));
        if (!pedido) throw new Error("Pedido contendo o item de produção não foi encontrado.");

        const pedidoRef = doc(db, 'pedidos', pedido.id);
        const updatedItens = pedido.itensProducao!.map(item => {
            if (item.id === itemProducaoId) {
                const newPartes = [...(item.partesDisponiveis || [])];
                const parteIndex = newPartes.findIndex(p => p.parteId === parteId);
                if (parteIndex > -1) {
                    newPartes[parteIndex].quantidade += quantidade;
                } else {
                    newPartes.push({ parteId, quantidade });
                }
                return { ...item, partesDisponiveis: newPartes };
            }
            return item;
        });

        await updateDoc(pedidoRef, { itensProducao: updatedItens });
        setIsExcessModalOpen(false);
        refetchAllData();
        alert("Excedente enviado para montagem com sucesso!");

    } catch (error) {
        console.error("Erro ao enviar excedente para montagem:", error);
        alert("Falha ao enviar excedente para montagem.");
    }
  };

  const getFilteredDisplayGroups = (): ProductionGroup[] => {
    return displayGroups.filter(group => {
      if (activeTab === 'aguardando') {
        return group.status === 'aguardando';
      } else if (activeTab === 'em_producao') {
        return group.status === 'em_producao';
      }
      return false; 
    });
  };

  const formatLocation = (posicoes: PosicaoEstoque[]): string => {
    if (!posicoes || posicoes.length === 0) return 'N/A';
    
    const locations = posicoes.map(pos => {
      const localName = pos.localNome || 'Desconhecido';
      const coords = pos.posicaoNaGrade ? `(X:${pos.posicaoNaGrade.x}, Y:${pos.posicaoNaGrade.y}, Z:${pos.posicaoNaGrade.z})` : '';
      const division = pos.divisao ? ` (H:${pos.divisao.h}, V:${pos.divisao.v})` : '';
      return `${localName} ${coords}${division}`;
    });

    return [...new Set(locations)].join('; ');
  };

  const canConcludeGroup = (group: ProductionGroup): { canConclude: boolean; message: string | null } => {
    if (group.status !== 'montado') {
      return { canConclude: false, message: 'Grupo não está no status "montado".' };
    }

    for (const item of group.items) {
      if ((item.estoqueAtualItem ?? 0) < item.quantidadePedido) {
        return { canConclude: false, message: `Faltam ${item.quantidadePedido - (item.estoqueAtualItem ?? 0)} unidades de ${item.nome}.` };
      }
    }
    return { canConclude: true, message: null };
  };

  const canConcludePedido = (pedido: Pedido): { canConclude: boolean; message: string | null } => {
    if (!pedido.productionGroups || pedido.productionGroups.length === 0) {
      return { canConclude: false, message: 'Nenhum grupo de produção para este pedido.' };
    }

    for (const group of pedido.productionGroups) {
      const { canConclude, message } = canConcludeGroup(group);
      if (!canConclude) {
        return { canConclude: false, message: `Grupo "${group.sourceName}" não está pronto: ${message}` };
      }
    }
    return { canConclude: true, message: null };
  };

  const handleLaunchPackagingTime = async (pedidoId: string) => {
    const time = packagingTime[pedidoId];
    if (!time || time <= 0) {
      alert("Por favor, insira um tempo de embalagem válido.");
      return;
    }

    try {
      await addDoc(collection(db, 'lancamentoServicos'), {
        servicoId: 'embalagem', // ou um ID de serviço específico para embalagem
        pedidoId: pedidoId,
        quantidade: time / 60, // Convertendo minutos para horas
        data: Timestamp.now(),
        usuario: auth.currentUser?.displayName || 'Sistema',
      });
      alert("Tempo de embalagem lançado com sucesso!");
    } catch (error) {
      console.error("Erro ao lançar tempo de embalagem:", error);
      alert("Falha ao lançar o tempo de embalagem.");
    }
  };

  const concludePedido = async (pedidoId: string) => {
    try {
      const pedidoToUpdate = pedidos.find(p => p.id === pedidoId);
      if (!pedidoToUpdate) {
        console.error("Pedido não encontrado no estado local:", pedidoId);
        return;
      }

      const batch = writeBatch(db);
      const pedidoRef = doc(db, 'pedidos', pedidoId);

      // Lançar insumos de embalagem
      const insumosParaLancar = selectedPackagingInsumos[pedidoId] || [];
      for (const { insumo, quantidade } of insumosParaLancar) {
        const lancamentoRef = doc(collection(db, 'lancamentosInsumos'));
        batch.set(lancamentoRef, {
          id: uuidv4(),
          insumoId: insumo.id,
          tipoInsumo: 'material', // Assuming packaging insumos are 'material' type
          tipoMovimento: 'saida',
          quantidade: quantidade,
          unidadeMedida: 'unidades',
          detalhes: `Consumo de embalagem para Pedido #${pedidoToUpdate.numero}`,
          data: Timestamp.now(),
        });
      }

      // Atualizar status do pedido
      batch.update(pedidoRef, {
        status: 'concluido',
        dataConclusao: Timestamp.now(),
      });

      await batch.commit();

      // Limpar estado local
      setSelectedPackagingInsumos(prev => {
        const newState = { ...prev };
        delete newState[pedidoId];
        return newState;
      });
      setPackagingTime(prev => {
        const newState = { ...prev };
        delete newState[pedidoId];
        return newState;
      });

      await refetchAllData();
      alert("Pedido finalizado com sucesso!");

    } catch (error) {
      console.error("Erro ao finalizar o pedido: ", error);
      alert("Ocorreu um erro ao tentar finalizar o pedido. Verifique o console para mais detalhes.");
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Painel de Produção</h1>
      <p className="mt-1 text-sm text-gray-500">
        Acompanhe e gerencie o fluxo de produção dos pedidos.
      </p>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('aguardando')}
            className={`${
              activeTab === 'aguardando'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Aguardando
          </button>
          <button
            onClick={() => setActiveTab('em_producao')}
            className={`${
              activeTab === 'em_producao'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Em Produção
          </button>
          <button
            onClick={() => setActiveTab('em_montagem_peca')}
            className={`${
              activeTab === 'em_montagem_peca'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Em Montagem - Peça
          </button>
          <button
            onClick={() => setActiveTab('em_montagem_modelo')}
            className={`${
              activeTab === 'em_montagem_modelo'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Em Montagem - Modelo
          </button>
          <button
            onClick={() => setActiveTab('processando_embalagem')}
            className={`${
              activeTab === 'processando_embalagem'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Processando Embalagem
          </button>
          <button
            onClick={() => setActiveTab('finalizados')}
            className={`${
              activeTab === 'finalizados'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Finalizados
          </button>
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'aguardando' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from(optimizedGroups.values()).length > 0 ? (
              Array.from(optimizedGroups.values()).map((group) => (
                <div key={group.id} className={`bg-white shadow rounded-lg p-6 border-2 ${group.pedidosOrigem.length > 1 ? 'border-green-400' : 'border-transparent'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{group.sourceName}</h3>
                    {group.pedidosOrigem.length > 1 && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <Users className="h-4 w-4 mr-1" />
                        Otimizado ({group.pedidosOrigem.length} pedidos)
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600 mb-2">Total a produzir: {group.totalPartsQuantity}</p>
                  <div className="text-sm text-gray-700 mb-4">
                    <div className="flex items-center">
                      <Hourglass className="h-4 w-4 mr-1 text-blue-500" />
                      <span>Impressão Total: {formatTime(group.tempoImpressaoGrupo || 0)}</span>
                    </div>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">Detalhes do Grupo:</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <h5 className="font-semibold">Pedidos:</h5>
                      <p className="text-gray-600">{[...new Set(group.pedidosOrigem.map(p => `#${p.pedidoNumero}`))].join(', ')}</p>
                    </div>
                    <div>
                      <h5 className="font-semibold">Partes no Grupo:</h5>
                      <ul className="list-disc list-inside text-gray-600">
                        {Object.entries(group.partesNoGrupo).map(([parteId, parteInfo]) => {
                          const temEstoque = (parteInfo.estoqueAtual || 0) >= (parteInfo.quantidadeNecessaria || 0);
                          return (
                            <li key={parteId} className={!temEstoque ? 'text-red-500' : ''}>
                              {parteInfo.nome} (x{parteInfo.quantidade}) - Estoque: {parteInfo.estoqueAtual || 0}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-semibold">Insumos Necessários:</h5>
                      <ul className="list-disc list-inside text-gray-600">
                        {group.filamentosNecessarios.map((f, i) => {
                          const temEstoque = (f.estoqueAtual || 0) >= (f.quantidadeNecessaria || 0);
                          return <li key={`f-${i}`} className={!temEstoque ? 'text-red-500' : ''}>{f.nome}: {(f.quantidadeNecessaria || 0).toFixed(2)}g (Estoque: {(f.estoqueAtual || 0).toFixed(2)}g)</li>
                        })}
                        {group.outrosInsumosNecessarios.map((insumo, i) => {
                          const temEstoque = (insumo.estoqueAtual || 0) >= (insumo.quantidadeNecessaria || 0);
                          return <li key={`i-${i}`} className={!temEstoque ? 'text-red-500' : ''}>{insumo.nome}: {insumo.quantidadeNecessaria} (Estoque: {insumo.estoqueAtual || 0})</li>
                        })}
                      </ul>
                    </div>
                  </div>
                  <button
                    onClick={() => handleStartOptimizedProduction(group)}
                    disabled={!group.insumosProntos && !group.partesProntas}
                    className="w-full mt-4 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    <Play className="h-5 w-5 mr-2" /> Iniciar Produção
                  </button>
                  {!group.insumosProntos && <p className="text-xs text-center text-red-600 mt-2">Produção bloqueada por falta de insumos.</p>}
                </div>
              ))
            ) : (
              <div className="text-center py-12 col-span-full">
                <p className="text-gray-600">Nenhum grupo de impressão aguardando otimização.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'em_producao' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {pedidos.filter(pedido => pedido.productionGroups?.some(group => group.status === 'em_producao')).length > 0 ? (
              pedidos.filter(pedido => pedido.productionGroups?.some(group => group.status === 'em_producao')).map((pedido) => (
                <div key={pedido.id} className="bg-white shadow rounded-lg p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-900">Pedido #{pedido.numero}</h3>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800`}>
                      Em Produção
                    </span>
                  </div>
                  <p className="text-gray-600 mb-2">Comprador: {pedido.comprador}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-700 mb-4">
                    <div className="flex items-center">
                      <Hourglass className="h-4 w-4 mr-1 text-blue-500" />
                      <span>Impressão Total: {formatTime(pedido.tempos?.impressao || 0)}</span>
                    </div>
                    <div className="flex items-center">
                      <Package className="h-4 w-4 mr-1 text-green-500" />
                      <span>Filamento Total: {formatFilament(pedido.tempos?.totalConsumoFilamento || 0)}</span>
                    </div>
                    <div className="flex items-center">
                      <Package className="h-4 w-4 mr-1 text-purple-500" />
                      <span>Montagem Total: {formatTime(pedido.tempos?.montagem || 0)}</span>
                    </div>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">Grupos de Impressão:</h4>
                  <div className="space-y-4">
                    {pedido.productionGroups?.filter(group => group.status === 'em_producao').map((group) => (
                      <div key={group.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <div className="flex justify-between items-center mb-2">
                          <h5 className="text-md font-medium text-gray-800">{group.sourceName}</h5>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800`}>
                            Em Produção
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 mb-2">
                          <p>Tempo de Impressão: {formatTime(group.tempoImpressaoGrupo)}</p>
                          <div className="flex items-center">
                            Filamento:
                            {group.corFilamento && (
                              <Spool className="h-4 w-4 ml-1" style={{ color: filamentColors[group.corFilamento] || 'currentColor' }} />
                            )}
                          </div>
                          {group.filamentosNecessarios.map((filamento, idx) => (
                            <div key={idx}>
                              <p className={(filamento.estoqueAtualFilamento ?? 0) < filamento.quantidade ? 'text-red-500' : ''}>
                                {filamento.nome}: Necessário {formatFilament(filamento.quantidade)} / Estoque {formatFilament(filamento.estoqueAtualFilamento ?? 0)}
                              </p>
                            </div>
                          ))}
                        </div>
                        <h6 className="text-md font-medium text-gray-800 mb-1">Itens a Produzir:</h6>
                        <ul className="list-disc list-inside text-sm text-gray-600 mb-3">
                          {group.items.map((item, itemIndex) => (
                            <li key={itemIndex}>{item.nome} (x{item.quantidadePedido})</li>
                          ))}
                        </ul>
                        <div className="flex space-x-2">
                          <button onClick={() => revertProductionGroupStatus(group.pedidoId, group.id, 'em_producao')} className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700">
                            <XCircle className="h-3 w-3 mr-1" /> Reverter
                          </button>
                          <button onClick={() => updateProductionGroupStatus(group.pedidoId, group.id, 'aguardando')} className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700">
                            <Pause className="h-3 w-3 mr-1" /> Pausar
                          </button>
                          <button onClick={() => handleConcluirImpressao(group)} className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700">
                            <CheckCircle className="h-3 w-3 mr-1" /> Concluir Impressão
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 col-span-full">
                <p className="text-gray-600">Nenhum pedido em produção encontrado.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'em_montagem_peca' && (
          <div className="space-y-6">
            {pedidos.filter(p => p.itensProducao?.some(item => item.status === 'em_montagem_pecas')).length > 0 ? (
              pedidos.filter(p => p.itensProducao?.some(item => item.status === 'em_montagem_pecas')).map(pedido => (
                <div key={pedido.id} className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-xl font-bold text-gray-900">Pedido #{pedido.numero}</h3>
                  {pedido.itensProducao?.filter(item => item.status === 'em_montagem_pecas').map(itemProducao => {
                      const peca = availablePecas.find(p => p.id === itemProducao.refId);
                      const canConclude = peca?.gruposImpressao.flatMap(gi => gi.partes).every(parte => {
                          const disponivel = itemProducao.partesDisponiveis?.find(pd => pd.parteId === parte.parteId)?.quantidade || 0;
                          const necessaria = parte.quantidade * itemProducao.quantidade;
                          return disponivel >= necessaria;
                      });
                      return (
                          <div key={itemProducao.id} className="border border-gray-200 rounded-lg p-3 mt-4 bg-gray-50">
                              <h5 className="text-md font-medium text-gray-800">Peça: {peca?.nome} (x{itemProducao.quantidade})</h5>
                              <h6 className="text-sm font-semibold mt-2">Partes Necessárias:</h6>
                              <ul className="list-disc list-inside text-sm">
                                  {peca?.gruposImpressao.flatMap(gi => gi.partes).map(parte => {
                                      const disponivel = itemProducao.partesDisponiveis?.find(pd => pd.parteId === parte.parteId)?.quantidade || 0;
                                      const necessaria = parte.quantidade * itemProducao.quantidade;
                                      return (
                                          <li key={parte.parteId} className={disponivel < necessaria ? 'text-red-500' : 'text-green-600'}>
                                              {availablePartes.find(p => p.id === parte.parteId)?.nome}: {disponivel} / {necessaria}
                                          </li>
                                      )
                                  })}
                              </ul>
                              <button disabled={!canConclude} className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400">
                                  <CheckCircle className="h-3 w-3 mr-1" /> Concluir Montagem de Peça
                              </button>
                          </div>
                      )
                  })}
                </div>
              ))
            ) : (
              <div className="text-center py-12 col-span-full">
                <p className="text-gray-600">Nenhuma peça aguardando montagem.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'em_montagem_modelo' && (
          <div className="text-center py-12 col-span-full">
            <p className="text-gray-600">WIP: Área para montagem de modelos.</p>
          </div>
        )}

        {activeTab === 'processando_embalagem' && (
          <div className="space-y-6">
            {pedidos.filter(p => p.itensProducao?.some(item => item.status === 'processando_embalagem')).length > 0 ? (
              pedidos.filter(p => p.itensProducao?.some(item => item.status === 'processando_embalagem')).map(pedido => (
                <div key={pedido.id} className="bg-white shadow rounded-lg p-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-900">Pedido #{pedido.numero}</h3>
                    <button
                      onClick={() => concludePedido(pedido.id)}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-5 w-5 mr-2" /> Finalizar Pedido
                    </button>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-lg font-semibold">Itens para Embalagem:</h4>
                    <ul className="list-disc list-inside">
                      {pedido.itensProducao?.filter(item => item.status === 'processando_embalagem').map(item => {
                        const produto = availablePecas.find(p => p.id === item.refId) || availableModels.find(m => m.id === item.refId) || availableKits.find(k => k.id === item.refId);
                        return <li key={item.id}>{produto?.nome} (x{item.quantidade})</li>;
                      })}
                    </ul>
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={() => {
                        setSelectedPedidoForPackaging(pedido);
                        setIsPackagingInsumoModalOpen(true);
                      }}
                      className="inline-flex items-center px-3 py-1 border border-dashed text-sm font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200"
                    >
                      <PlusCircle className="h-4 w-4 mr-2" /> Adicionar Insumo de Embalagem
                    </button>
                    <div className="mt-2">
                      {selectedPackagingInsumos[pedido.id]?.map(({ insumo, quantidade }) => (
                        <div key={insumo.id} className="text-sm">{insumo.nome}: {quantidade}</div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4">
                    <label htmlFor={`packaging-time-${pedido.id}`} className="block text-sm font-medium text-gray-700">
                      Tempo de Embalagem (minutos)
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        id={`packaging-time-${pedido.id}`}
                        value={packagingTime[pedido.id] || ''}
                        onChange={(e) => setPackagingTime({ ...packagingTime, [pedido.id]: Number(e.target.value) })}
                        className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                      <button
                        onClick={() => handleLaunchPackagingTime(pedido.id)}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                      >
                        Lançar Tempo
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 col-span-full">
                <p className="text-gray-600">Nenhum item aguardando embalagem.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'finalizados' && (
          <div className="text-center py-12 col-span-full">
            <p className="text-gray-600">WIP: Área para itens finalizados.</p>
          </div>
        )}
      </div>

      <ProductionLaunchModal
        isOpen={isLaunchModalOpen}
        onClose={handleCloseLaunchModal}
        group={selectedProductionGroup}
        onLaunchSuccess={handleLaunchSuccess}
      />

      {isExcessModalOpen && excessPartData && (
        <ProductionExcessStockModal
          isOpen={isExcessModalOpen}
          onClose={() => setIsExcessModalOpen(false)}
          partData={excessPartData}
          pecaTipo={excessPartData.pecaTipo}
          onLaunchSuccess={() => {
            setIsExcessModalOpen(false);
            refetchAllData();
          }}
          onSendToAssembly={() => handleSendToAssembly(excessPartData.itemProducaoId, excessPartData.id, excessPartData.quantidade)}
        />
      )}

      {isStockSelectionModalOpen && itemToDebit && (
        <StockSelectionModal
          isOpen={isStockSelectionModalOpen}
          onClose={() => setIsStockSelectionModalOpen(false)}
          onSelect={handleStockSelection}
          itemNome={itemToDebit.nome}
          quantidadeNecessaria={itemToDebit.quantidadePedido}
          availablePositions={itemToDebit.localEstoqueItem || []}
          formatLocation={formatLocation}
          totalEstoqueDisponivelGeral={itemToDebit.estoqueAtualItem ?? 0}
        />
      )}

      {isPackagingInsumoModalOpen && selectedPedidoForPackaging && (
        <InsumoSelectionModal
          isOpen={isPackagingInsumoModalOpen}
          onClose={() => setIsPackagingInsumoModalOpen(false)}
          onSelect={(insumo: Insumo, quantidade: number) => {
            const pedidoId = selectedPedidoForPackaging.id;
            const existingInsumos = selectedPackagingInsumos[pedidoId] || [];
            const updatedInsumos = [...existingInsumos, { insumo, quantidade }];
            setSelectedPackagingInsumos({ ...selectedPackagingInsumos, [pedidoId]: updatedInsumos });
            setIsPackagingInsumoModalOpen(false);
          }}
          insumoTipoFilter={'embalagem'}
        />
      )}
    </div>
  );
}
