"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../services/firebase'; // Import auth
import { collection, doc, updateDoc, Timestamp, addDoc, writeBatch, serverTimestamp, onSnapshot, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth'; // Import onAuthStateChanged
import { Hourglass, Package, CheckCircle, XCircle, Play, Pause, Spool, MapPin, Users, PlusCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { Pedido, ProductionGroup, Peca, Modelo, Kit, Insumo, Parte, PosicaoEstoque, GrupoDeFilamento, PecaInsumo, GrupoImpressao, LancamentoInsumo, LancamentoProduto, PecaParte, ProductionGroupFilamento, ProductionGroupOutroInsumo, Historico, Configuracoes, DashboardMetrics, AlertaEstoque, Produto, Servico, LancamentoServico, ItemToDebit, OptimizedGroup, GrupoMontagem, LancamentoMontagem, ProdutoFinalNecessario, PackagingModelo, PackagingPeca, PedidoProduto, AtendimentoDetalhadoItem, AtendimentoDetalhadoItemType, UsoEstoquePayload } from '../types'; // Import AtendimentoDetalhadoItemType and UsoEstoquePayload
import toast from 'react-hot-toast';
import { LocalProduto, LocalInsumo, Recipiente } from '../types/mapaEstoque';
import { v4 as uuidv4 } from 'uuid';
import ProductionLaunchModal from '../components/ProductionLaunchModal';
import ProductionConclusionModal, { ConcludeData } from '../components/ProductionConclusionModal';
import StockSelectionModal from '../components/StockSelectionModal';
import ProductionExcessStockModal from '../components/ProductionExcessStockModal'; // Import new modal
import InsumoSelectionModal from '../components/InsumoSelectionModal';
import ProductionSummaryTable from '../components/ProductionSummaryTable';
import PackagingOrderItem from '../components/PackagingOrderItem'; // Import PackagingOrderItem
import { AllProductsData } from '../services/stockVerificationService';
import { cleanObject } from '../utils/cleanObject';
import { SummaryItem } from '../types'; // Import SummaryItem from types/index.ts
import { useCallback } from 'react'; // Import useCallback
import { useStockCalculations } from '../hooks/useStockCalculations'; // Import new hook
import { useProductionSummary } from '../hooks/useProductionSummary';
import { useOptimizedGroups } from '../hooks/useOptimizedGroups';
import { useAssemblyGroups } from '../hooks/useAssemblyGroups'; // Import new hook
import { formatTime, formatFilament, calculateEffectiveQuantityFulfilledByComponents, generateProductionGroupsForProduct, getGroupStockStatus, canConcludePedido, formatLocation } from '../utils/producaoUtils';
import ProcessandoEmbalagemV2 from './components/ProcessandoEmbalagemV2';
import CompletedOrdersTable from './components/CompletedOrdersTable';
import { UsoEstoqueTabV3 } from './components/UsoEstoqueTabV3';

// 🆕 FUNÇÃO AUXILIAR PARA BUSCAR PEDIDO RELACIONADO
const findRelatedPedido = (assemblyGroup: GrupoMontagem, pedidos: Pedido[]): { relatedPedido: Pedido | null; pedidoId: string } => {
  console.log('🔍 DEBUG - Iniciando busca de pedido relacionado:', {
    assemblyGroupId: assemblyGroup.id,
    targetProductId: assemblyGroup.targetProductId,
    produtosFinaisNecessariosLength: (assemblyGroup.produtosFinaisNecessarios || []).length
  });

  // Estratégia 1: Buscar por produtos finais necessários
  const relatedPedido1 = pedidos.find(p => 
    p.produtos.some(prod => 
      (assemblyGroup.produtosFinaisNecessarios || []).some(produtoFinal => 
        prod.produtoId === produtoFinal.produtoId
      )
    )
  );

  if (relatedPedido1) {
    console.log('✅ Estratégia 1 - Pedido encontrado por produtos finais:', {
      pedidoId: relatedPedido1.id,
      pedidoNumero: relatedPedido1.numero
    });
    return { relatedPedido: relatedPedido1, pedidoId: relatedPedido1.id };
  }

  // Estratégia 2: Buscar por targetProductId
  const relatedPedido2 = pedidos.find(p => 
    p.produtos.some(prod => prod.produtoId === assemblyGroup.targetProductId)
  );

  if (relatedPedido2) {
    console.log('✅ Estratégia 2 - Pedido encontrado por targetProductId:', {
      pedidoId: relatedPedido2.id,
      pedidoNumero: relatedPedido2.numero
    });
    return { relatedPedido: relatedPedido2, pedidoId: relatedPedido2.id };
  }

  // Estratégia 3: Buscar por assemblyGroup.id
  const relatedPedido3 = pedidos.find(p => p.id === assemblyGroup.id);

  if (relatedPedido3) {
    console.log('✅ Estratégia 3 - Pedido encontrado por assemblyGroup.id:', {
      pedidoId: relatedPedido3.id,
      pedidoNumero: relatedPedido3.numero
    });
    return { relatedPedido: relatedPedido3, pedidoId: relatedPedido3.id };
  }

  // Estratégia 4: Usar assemblyGroupId como fallback
  const fallbackId = assemblyGroup.id || '';
  console.log('⚠️ Nenhum pedido encontrado, usando fallback:', {
    assemblyGroupId: fallbackId,
    totalPedidos: pedidos.length
  });
  
  return { relatedPedido: null, pedidoId: fallbackId };
};

// 🆕 FUNÇÃO AUXILIAR PARA BUSCAR PEDIDO RELACIONADO A UM SUMMARYITEM
const findRelatedPedidoForSummaryItem = (item: SummaryItem, pedidos: Pedido[]): { pedidoId: string | null; nivelUsado: number } => {
  console.log('🔍 DEBUG - Buscando pedido para SummaryItem:', {
    documentId: item.documentId,
    tipo: item.tipo,
    level: item.level,
    sku: item.sku
  });

  // Se o item é um cabeçalho de pedido (PED-), extrair o pedidoId do documentId
  if (item.sku.startsWith('PED-')) {
    // O documentId do cabeçalho de pedido é o próprio pedidoId
    const pedidoId = item.documentId;
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (pedido) {
      console.log('✅ Pedido encontrado via cabeçalho PED:', {
        pedidoId,
        pedidoNumero: pedido.numero
      });
      return { pedidoId, nivelUsado: 0 };
    }
  }

  // Buscar pedidos que contêm este produto
  const pedidosContendoProduto = pedidos.filter(pedido => 
    pedido.produtos.some(produto => 
      produto.produtoId === item.documentId && produto.tipo === item.tipo
    )
  );

  if (pedidosContendoProduto.length > 0) {
    // Usar o primeiro pedido encontrado
    const pedidoId = pedidosContendoProduto[0].id;
    console.log('✅ Pedido encontrado para SummaryItem:', {
      pedidoId,
      pedidoNumero: pedidosContendoProduto[0].numero,
      totalPedidosEncontrados: pedidosContendoProduto.length
    });
    return { pedidoId, nivelUsado: item.level };
  }

  // Se não encontrou diretamente, buscar por hierarquia (produtos filhos)
  for (const pedido of pedidos) {
    for (const produto of pedido.produtos) {
      // Verificar se este produto tem componentes que incluem o item
      if (produto.tipo === 'kit' && produto.modelosComponentes) {
        for (const modelo of produto.modelosComponentes) {
          if (modelo.pecasComponentes?.some(peca => peca.id === item.documentId)) {
            console.log('✅ Pedido encontrado via hierarquia (kit -> modelo -> peca):', {
              pedidoId: pedido.id,
              pedidoNumero: pedido.numero
            });
            return { pedidoId: pedido.id, nivelUsado: item.level + 2 }; // kit (0) -> modelo (1) -> peca (2)
          }
        }
      } else if (produto.tipo === 'modelo' && produto.pecasComponentes) {
        if (produto.pecasComponentes.some(peca => peca.id === item.documentId)) {
          console.log('✅ Pedido encontrado via hierarquia (modelo -> peca):', {
              pedidoId: pedido.id,
              pedidoNumero: pedido.numero
            });
            return { pedidoId: pedido.id, nivelUsado: item.level + 1 }; // modelo (0) -> peca (1)
        }
      } else if (produto.tipo === 'peca' && produto.gruposImpressao) {
        for (const grupo of produto.gruposImpressao) {
          if (grupo.partes?.some(parte => parte.parteId === item.documentId)) {
            console.log('✅ Pedido encontrado via hierarquia (peca -> parte):', {
              pedidoId: pedido.id,
              pedidoNumero: pedido.numero
            });
            return { pedidoId: pedido.id, nivelUsado: item.level + 1 }; // peca (0) -> parte (1)
          }
        }
      }
    }
  }

  console.log('⚠️ Nenhum pedido encontrado para SummaryItem:', {
    documentId: item.documentId,
    tipo: item.tipo
  });
  return { pedidoId: null, nivelUsado: item.level };
};

export default function Producao() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [activeTab, setActiveTab] = useState<'visao_geral' | 'aguardando' | 'em_producao' | 'em_montagem_peca' | 'em_montagem_modelo' | 'em_montagem_kit' | 'processando_embalagem' | 'processando_embalagem_v2' | 'finalizados' | 'uso_estoque'>('visao_geral');
  const [filamentColors, setFilamentColors] = useState<Record<string, string>>({});
  const [displayGroups, setDisplayGroups] = useState<ProductionGroup[]>([]);
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
  const [isConclusionModalOpen, setIsConclusionModalOpen] = useState(false);
  const [selectedProductionGroup, setSelectedProductionGroup] = useState<OptimizedGroup | null>(null);
  const [selectedGroupForConclusion, setSelectedGroupForConclusion] = useState<OptimizedGroup | null>(null);
  const [isStockSelectionModalOpen, setIsStockSelectionModalOpen] = useState(false);
  const [isExcessModalOpen, setIsExcessModalOpen] = useState(false);
  const [excessPartData, setExcessPartData] = useState<{ id: string; nome: string; sku: string; quantidade: number; pecaTipo: Peca['tipoPeca']; pecaId?: string; } | null>(null);
  const [isPackagingInsumoModalOpen, setIsPackagingInsumoModalOpen] = useState(false);
  const [selectedPedidoForPackaging, setSelectedPedidoForPackaging] = useState<Pedido | null>(null);
  const [packagingTime, setPackagingTime] = useState<Record<string, number>>({});
  const [selectedPackagingInsumos, setSelectedPackagingInsumos] = useState<Record<string, { insumo: Insumo, quantidade: number }[]>>({});
  const [isPackagingStarted, setIsPackagingStarted] = useState<Record<string, boolean>>({});
  const [checkedItems, setCheckedItems] = useState<Record<string, Record<string, boolean>>>({}); // { assemblyGroupId: { itemId: boolean } }

  const [itemToDebit, setItemToDebit] = useState<ItemToDebit | null>(null); // Use imported ItemToDebit
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const { enrichPosicoesEstoque, getStockForProduct } = useStockCalculations();
  const { assemblyGroups } = useAssemblyGroups(); // Use hook
  const { optimizedGroups } = useOptimizedGroups(
    allInsumos,
    availablePecas,
    availablePartes,
    availableModels,
    availableKits,
    availableFilamentGroups,
    locaisProdutos,
    locaisInsumos,
    recipientes
  );

  const allProducts: AllProductsData = useMemo(() => ({
    pecas: availablePecas,
    partes: availablePartes,
    modelos: availableModels,
    kits: availableKits,
    insumos: allInsumos,
    filamentGroups: availableFilamentGroups,
    locaisProdutos: locaisProdutos,
    locaisInsumos: locaisInsumos,
    recipientes: recipientes,
    assemblyGroups: assemblyGroups
  }), [
    availablePecas,
    availablePartes,
    availableModels,
    availableKits,
    allInsumos,
    availableFilamentGroups,
    locaisProdutos,
    locaisInsumos,
    recipientes,
    assemblyGroups
  ]);

  const { productionSummary, isSummaryLoading, generateProductionSummary } = useProductionSummary({
    pedidos,
    allProducts,
    optimizedGroups
  });

  useEffect(() => {
    if (activeTab === 'visao_geral') {
      generateProductionSummary();
    }
  }, [activeTab, pedidos, allProducts, optimizedGroups, generateProductionSummary]);

  // Fetch all static data (insumos, pecas, partes, models, kits, filament groups, locais)
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const unsubscribeInsumos = onSnapshot(collection(db, 'insumos'), (snapshot) => {
          setAllInsumos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Insumo)));
        });
        const unsubscribePecas = onSnapshot(collection(db, 'pecas'), (snapshot) => {
          setAvailablePecas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Peca)));
        });
        const unsubscribePartes = onSnapshot(collection(db, 'partes'), (snapshot) => {
          setAvailablePartes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Parte)));
        });
        const unsubscribeModelos = onSnapshot(collection(db, 'modelos'), (snapshot) => {
          setAvailableModels(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Modelo)));
        });
        const unsubscribeKits = onSnapshot(collection(db, 'kits'), (snapshot) => {
          setAvailableKits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Kit)));
        });
        const unsubscribeFilamentGroups = onSnapshot(collection(db, 'gruposDeFilamento'), (snapshot) => {
          setAvailableFilamentGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GrupoDeFilamento)));
        });
        const unsubscribeLocaisProdutos = onSnapshot(collection(db, 'locaisProdutos'), (snapshot) => {
          setLocaisProdutos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LocalProduto)));
        });
        const unsubscribeLocaisInsumos = onSnapshot(collection(db, 'locaisInsumos'), (snapshot) => {
          setLocaisInsumos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LocalInsumo)));
        });
        const unsubscribeRecipientes = onSnapshot(collection(db, 'recipientes'), (snapshot) => {
          setRecipientes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recipiente)));
        });
        const unsubscribePedidos = onSnapshot(collection(db, 'pedidos'), (snapshot) => {
          setPedidos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pedido)));
        });

        return () => {
          unsubscribeInsumos();
          unsubscribePecas();
          unsubscribePartes();
          unsubscribeModelos();
          unsubscribeKits();
          unsubscribeFilamentGroups();
          unsubscribeLocaisProdutos();
          unsubscribeLocaisInsumos();
          unsubscribeRecipientes();
          unsubscribePedidos();
        };
      } else {
        // Clear all data if user is not authenticated
        setAllInsumos([]);
        setAvailablePecas([]);
        setAvailablePartes([]);
        setAvailableModels([]);
        setAvailableKits([]);
        setAvailableFilamentGroups([]);
        setLocaisProdutos([]);
        setLocaisInsumos([]);
        setRecipientes([]);
        setPedidos([]);
        // setAssemblyGroups([]); // No longer managed here
        return () => {}; // Return empty cleanup function
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleUseStock = useCallback(async (item: SummaryItem) => {
    // Fetch detailed stock positions for item
    const { posicoesEstoque } = getStockForProduct(
      item.documentId,
      item.tipo,
      availablePecas,
      availablePartes,
      allInsumos,
      availableModels,
      availableKits,
      availableFilamentGroups,
      locaisProdutos,
      locaisInsumos,
      recipientes
    );

    // Buscar pedido relacionado e nível usado
    const { pedidoId, nivelUsado } = findRelatedPedidoForSummaryItem(item, pedidos);

    const itemToDebitData: ItemToDebit = {
      id: item.documentId,
      nome: item.produtoNome,
      quantidadePedido: item.necessario, // Use 'necessario' from SummaryItem
      estoqueAtualItem: item.emEstoque, // Use 'emEstoque' from SummaryItem
      localEstoqueItem: posicoesEstoque, // Use fetched detailed positions
      type: item.tipo,
      pedidoId: pedidoId || undefined,
      groupId: undefined, // Não temos groupId disponível
    };

    // Armazenar também o nível usado como propriedade adicional
    const itemToDebitWithLevel = {
      ...itemToDebitData,
      nivelUsado,
    };

    setItemToDebit(itemToDebitWithLevel);
    setIsStockSelectionModalOpen(true);
  }, [
    setItemToDebit,
    setIsStockSelectionModalOpen,
    getStockForProduct,
    availablePecas,
    availablePartes,
    allInsumos,
    availableModels,
    availableKits,
    availableFilamentGroups,
    locaisProdutos,
    locaisInsumos,
    recipientes,
    pedidos,
  ]);

  const updateProductionGroupStatus = useCallback(async (pedidoId: string, groupId: string, newStatus: OptimizedGroup['status']) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para atualizar o status da produção.");
      return;
    }
    try {
      await addDoc(collection(db, 'lancamentosProducao'), cleanObject({
        tipoEvento: 'atualizacao_status_grupo_otimizado',
        payload: {
          optimizedGroupId: groupId,
          newStatus: newStatus,
          pedidoId: pedidoId,
        },
        timestamp: serverTimestamp(),
        usuario: auth.currentUser.uid,
      }));
      toast.success(`Status do grupo de produção atualizado para '${newStatus}' com sucesso!`);
    } catch (error) {
      console.error("Erro ao atualizar status do grupo de produção otimizado: ", error);
      toast.error("Ocorreu um erro ao atualizar o status. Verifique o console para mais detalhes.");
    }
  }, [auth.currentUser, serverTimestamp, cleanObject]);

  const revertProductionGroupStatus = useCallback(async (pedidoId: string, groupId: string, currentStatus: OptimizedGroup['status']) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para reverter o status da produção.");
      return;
    }
    try {
      // For now, we only support reverting from 'em_producao' to 'aguardando'
      if (currentStatus === 'em_producao') {
        await addDoc(collection(db, 'lancamentosProducao'), cleanObject({
          tipoEvento: 'reversao_status_grupo_otimizado',
          payload: {
            optimizedGroupId: groupId,
            oldStatus: currentStatus,
            newStatus: 'aguardando',
            pedidoId: pedidoId,
          },
          timestamp: serverTimestamp(),
          usuario: auth.currentUser.uid,
        }));
        toast.success("Status do grupo de produção revertido para 'aguardando' com sucesso!");
      } else {
        toast.error("Reversão de status não suportada para o status atual.");
      }
    } catch (error) {
      console.error("Erro ao reverter status do grupo de produção otimizado: ", error);
      toast.error("Ocorreu um erro ao reverter o status. Verifique o console para mais detalhes.");
    }
  }, [auth.currentUser, serverTimestamp, cleanObject]);

  const handleCloseLaunchModal = useCallback(() => {
    setIsLaunchModalOpen(false);
    setSelectedProductionGroup(null);
  }, [setIsLaunchModalOpen, setSelectedProductionGroup]);

  const handleLaunchSuccess = useCallback(async () => {
    if (selectedProductionGroup) {
      // Update status of optimized group
      const newStatus = selectedProductionGroup.partesProntas ? 'produzido' : 'em_producao';
      await updateProductionGroupStatus(selectedProductionGroup.pedidosOrigem[0].pedidoId, selectedProductionGroup.id, newStatus);
    }
    handleCloseLaunchModal();
  }, [selectedProductionGroup, handleCloseLaunchModal, updateProductionGroupStatus]);

  const fetchFilamentColors = useCallback(async () => {
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
  }, []);

  const updateOriginalProductionGroupStatuses = useCallback(
    async (optimizedGroup: OptimizedGroup) => {
      const batch = writeBatch(db);
      const updatesByPedido = new Map<string, string[]>();

      for (const origem of optimizedGroup.pedidosOrigem) {
        if (!updatesByPedido.has(origem.pedidoId)) {
          updatesByPedido.set(origem.pedidoId, []);
        }
        updatesByPedido.get(origem.pedidoId)!.push(origem.groupId);
      }

      for (const [pedidoId, groupIdsToUpdate] of updatesByPedido.entries()) {
        const pedidoRef = doc(db, 'pedidos', pedidoId);
        const pedidoData = pedidos.find(p => p.id === pedidoId);

        if (pedidoData) {
          const updatedProdutos = pedidoData.produtos.map(produto => {
            if (produto.gruposImpressaoProducao) {
              const updatedGruposImpressaoProducao = produto.gruposImpressaoProducao.map(group => {
                if (group.id && groupIdsToUpdate.includes(group.id)) {
                  // This group is part of optimized group being launched
                  if (group.status === 'aguardando') { // Only process groups that are waiting
                    const newStatus = optimizedGroup.partesProntas ? 'produzido' : 'em_producao';
                    return {
                      ...group,
                      status: newStatus,
                      startedAt: Timestamp.now(),
                      completedAt: newStatus === 'produzido' ? Timestamp.now() : null,
                    };
                  }
                }
                return group; // Return original group if not in groupIdsToUpdate or already concluded
              });
              return { ...produto, gruposImpressaoProducao: updatedGruposImpressaoProducao };
            }
            return produto; // Return original product if no production groups
          });

          let newPedidoStatus = pedidoData.status;

          const allProductsDone = updatedProdutos.every(p => p.statusProducaoItem === 'concluido' || p.statusProducaoItem === 'pronto_para_embalagem');
          if (allProductsDone) {
              newPedidoStatus = 'processando_embalagem';
          } else {
              const anyInProduction = updatedProdutos.some(p => 
                  p.statusProducaoItem === 'em_producao' || 
                  p.statusProducaoItem === 'em_montagem_pecas' || 
                  p.gruposImpressaoProducao?.some(g => g.status === 'em_producao')
              );
              if (anyInProduction) {
                  newPedidoStatus = 'em_producao';
              }
          }
          
          batch.update(pedidoRef, { produtos: cleanObject(updatedProdutos), status: newPedidoStatus });
        }
      }
      await batch.commit();
      // refetchAllData(); // Removed as onSnapshot listeners handle updates
    },
    [pedidos, cleanObject] // Dependencies
  );

  const handleStartOptimizedProduction = useCallback(async (group: OptimizedGroup) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para iniciar a produção.");
      return;
    }
    try {
      await addDoc(collection(db, 'lancamentosProducao'), cleanObject({
        tipoEvento: 'inicio_producao',
        payload: {
          groupId: group.id,
        },
        timestamp: serverTimestamp(),
        usuario: auth.currentUser.uid,
      }));

      toast.success("Solicitação para iniciar produção enviada com sucesso! O status será atualizado em breve.");
    } catch (error) {
      console.error("Erro ao solicitar início de produção otimizada: ", error);
      toast.error("Ocorreu um erro ao solicitar o início da produção. Verifique o console para mais detalhes.");
    }
  }, [auth.currentUser, serverTimestamp, cleanObject]);

  const handleStockSelection = useCallback(async (debits: { selectedPosition: PosicaoEstoque; quantityToDebit: number }[]) => {
    if (!itemToDebit) return;

    const { id, nome, type, pedidoId, nivelUsado } = itemToDebit as unknown as { id: string; nome: string; type: string; pedidoId?: string; nivelUsado: number };
    let totalDebited = 0;

    if (!['parte', 'peca', 'modelo', 'kit'].includes(type)) {
      toast.error(`O tipo de item '${type}' não é um produto válido para lançamento de estoque nesta operação.`);
      setIsStockSelectionModalOpen(false);
      setItemToDebit(null);
      return;
    }

    // Se não temos pedidoId, não podemos criar um uso_estoque
    if (!pedidoId) {
      toast.error('Não foi possível identificar o pedido relacionado. O uso de estoque não pode ser processado.');
      setIsStockSelectionModalOpen(false);
      setItemToDebit(null);
      return;
    }

    try {
      // Criar LancamentoProducao com tipo USO_ESTOQUE
      const lancamentoProducaoRef = doc(collection(db, 'lancamentosProducao'));
      const posicoesConsumidas = debits
        .filter(debit => debit.quantityToDebit > 0)
        .map(debit => ({
          produtoId: id,
          produtoTipo: type as 'parte' | 'peca' | 'modelo' | 'kit',
          posicaoEstoqueId: debit.selectedPosition.recipienteId!,
          quantidade: debit.quantityToDebit,
        }));

      totalDebited = posicoesConsumidas.reduce((sum, pos) => sum + pos.quantidade, 0);

      const lancamentoProducao = {
        id: lancamentoProducaoRef.id,
        tipoEvento: 'uso_estoque' as const,
        timestamp: serverTimestamp(),
        usuarioId: auth.currentUser?.uid || 'sistema',
        payload: {
          pedidoId,
          nivelUsado: nivelUsado || 0,
          produtoRaiz: {
            id,
            tipo: type as 'kit' | 'modelo' | 'peca' | 'parte',
            quantidade: totalDebited,
          },
          produtosConsumidos: [{
            produtoId: id,
            produtoTipo: type as 'kit' | 'modelo' | 'peca' | 'parte',
            quantidade: totalDebited,
            nivel: nivelUsado || 0,
          }],
          posicoesConsumidas,
        } as UsoEstoquePayload,
      };

      await setDoc(lancamentoProducaoRef, cleanObject(lancamentoProducao));
      
      toast.success(`Uso de estoque para ${nome} registrado com sucesso! Quantidade: ${totalDebited}`);
      setIsStockSelectionModalOpen(false);
      setItemToDebit(null);
      // No need to call refetchAllData here, as onSnapshot listeners will handle updates
    } catch (error) {
      console.error("Error during manual stock debit from summary: ", error);
      toast.error("Ocorreu um erro ao criar o lançamento de uso de estoque. Verifique o console para mais detalhes.");
      setIsStockSelectionModalOpen(false);
      setItemToDebit(null);
    }
  }, [auth.currentUser, itemToDebit, cleanObject, db, serverTimestamp, setIsStockSelectionModalOpen, setItemToDebit]);

  const handleOpenConclusionModal = useCallback((group: OptimizedGroup) => {
    setSelectedGroupForConclusion(group);
    setIsConclusionModalOpen(true);
  }, [setSelectedGroupForConclusion, setIsConclusionModalOpen]);

  const handleConcludeProduction = useCallback(async (data: ConcludeData) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para concluir a produção.");
      return;
    }

    const batch = writeBatch(db);
    const lancamentoProducaoRef = doc(collection(db, 'lancamentosProducao')); // Usar doc(collection(...)) para obter uma referência com ID gerado

    const { group, producedParts } = data;

    try {
      // Documento principal para a Cloud Function processLancamentoProducao
      batch.set(lancamentoProducaoRef, cleanObject({
        id: lancamentoProducaoRef.id, // Usar o ID gerado
        tipoEvento: 'conclusao_producao',
        timestamp: serverTimestamp(),
        usuarioId: auth.currentUser.uid,
        payload: {
          groupId: group.id, // Passar o groupId diretamente
          quantidadeProduzida: producedParts.reduce((sum, part) => sum + part.quantidadeProduzida, 0), // Calcular quantidade total produzida
          locaisDestino: producedParts.flatMap(part => part.locais || []), // Coletar locais de destino
          group: group, // Manter o grupo completo para contexto, se necessário
          producedParts: producedParts,
          optimizedGroupId: group.id,
          pedidosOrigem: group.pedidosOrigem,
          sourceName: group.sourceName,
        },
      }));

      // Lançar produtos candidatos (partes)
      for (const parteProduzida of producedParts) {
        if (parteProduzida.quantidadeProduzida > 0) {
          const lancamentoProdutoRef = doc(collection(db, 'lancamentosProdutos'));
          const parteInfo = group.partesNoGrupo[parteProduzida.parteId];
          const expectedQuantity = parteInfo.quantidade;
          const isExcess = parteProduzida.quantidadeProduzida > expectedQuantity;

          let locaisParaLancamento: LancamentoProduto['locais'] = [];

          if (isExcess && parteProduzida.destinoExcedente === 'estoque' && parteProduzida.locais) {
            locaisParaLancamento = parteProduzida.locais.map(local => ({
              localId: local.recipienteId, // Use recipienteId as localId for compatibility
              recipienteId: local.recipienteId,
              divisao: ('divisao' in local && local.divisao && typeof local.divisao === 'object' && 'h' in local.divisao && 'v' in local.divisao) 
                ? local.divisao as { h: number; v: number } 
                : null,
              quantidade: local.quantidade,
            }));
          } else if (!isExcess || parteProduzida.destinoExcedente === 'montagem') {
            // Não faz nada aqui para a quantidade esperada ou excedente para montagem.
            // A Cloud Function processLancamentoProducao (Fase 2.4/2.5) lidará com o destino lógico.
            continue; // Pula para a próxima parte
          }

          if (locaisParaLancamento.length > 0) {
            batch.set(lancamentoProdutoRef, cleanObject({
              id: uuidv4(),
              produtoId: parteProduzida.parteId,
              tipoProduto: 'parte', // Sempre 'parte' para este contexto
              tipoMovimento: 'entrada',
              usuario: auth.currentUser?.displayName || 'Sistema',
              observacao: `Conclusão de produção - Excedente para estoque do grupo otimizado: ${group.sourceName} (ID: ${group.id})`,
              data: Timestamp.now(),
              locais: locaisParaLancamento,
            } as LancamentoProduto));
          }
        }
      }

      await batch.commit();
      toast.success("Evento de conclusão de produção disparado com sucesso! O status será atualizado em breve.");
      setIsConclusionModalOpen(false);
      // No need to call refetchAllData here, as onSnapshot listeners will handle updates
    } catch (error) {
      console.error("Erro ao disparar evento de conclusão de produção:", error);
      toast.error("Ocorreu um erro ao concluir a produção. Verifique o console para mais detalhes.");
    }
  }, [auth.currentUser, serverTimestamp, cleanObject, uuidv4, db, Timestamp, setIsConclusionModalOpen]);

  const handleSendToAssembly = useCallback(async (produtoPedidoId: string, parteId: string, quantidade: number) => {
    try {
        const pedido = pedidos.find(p => p.produtos.some(prod => prod.produtoId === produtoPedidoId));
        if (!pedido) throw new Error("Pedido contendo o produto não foi encontrado.");

        const pedidoRef = doc(db, 'pedidos', pedido.id);
        const updatedProdutos = pedido.produtos.map(produto => {
            if (produto.produtoId === produtoPedidoId && produto.tipo === 'peca') { // Assuming it's a peca
                if (!produto.atendimentoEstoqueDetalhado) {
                  produto.atendimentoEstoqueDetalhado = {};
                }
                if (!produto.atendimentoEstoqueDetalhado.partesAtendidas) {
                  produto.atendimentoEstoqueDetalhado.partesAtendidas = [];
                }
                const newPartes = [...(produto.atendimentoEstoqueDetalhado.partesAtendidas || [])];
                const parteIndex = newPartes.findIndex(p => p.parteId === parteId);
                if (parteIndex > -1) {
                    newPartes[parteIndex].quantidade += quantidade;
                } else {
                    newPartes.push({ parteId, quantidade });
                }
                return { ...produto, atendimentoEstoqueDetalhado: { ...produto.atendimentoEstoqueDetalhado, partesAtendidas: newPartes } };
            }
            return produto;
        });

        await updateDoc(pedidoRef, { produtos: cleanObject(updatedProdutos) });
        setIsExcessModalOpen(false);
        // No need to call refetchAllData here, as onSnapshot listeners handle updates
        toast.success("Excedente enviado para montagem com sucesso!");

    } catch (error) {
        console.error("Erro ao enviar excedente para montagem:", error);
      toast.error("Falha ao enviar excedente para montagem.");
    }
  }, [pedidos, db, cleanObject, setIsExcessModalOpen]);

  const getFilteredDisplayGroups = useCallback((pedidosList: Pedido[]): Pedido[] | ProductionGroup[] | OptimizedGroup[] | GrupoMontagem[] => {
    if (activeTab === 'aguardando') {
      return Array.from(optimizedGroups.values()).filter(group => group.status === 'aguardando');
    } else if (activeTab === 'em_producao') {
      return Array.from(optimizedGroups.values()).filter(group => group.status === 'em_producao');
    } else if (activeTab === 'visao_geral') {
      return []; // Visão Geral uses ProductionSummaryTable directly
    } else if (activeTab === 'em_montagem_peca') {
      return assemblyGroups.filter(group => 
        group.targetProductType === 'peca' && 
        group.status !== 'montado' &&
        group.status !== 'concluido_por_estoque' &&
        group.status !== 'concluido_estoque_peca' &&
        group.status !== 'concluido_estoque_kit' &&
        group.status !== 'concluido_estoque_modelo'
      );
    } else if (activeTab === 'em_montagem_modelo') {
      return assemblyGroups.filter(group => 
        group.targetProductType === 'modelo' && 
        group.status !== 'montado' &&
        group.status !== 'concluido_por_estoque' &&
        group.status !== 'concluido_estoque_peca' &&
        group.status !== 'concluido_estoque_kit' &&
        group.status !== 'concluido_estoque_modelo'
      );
    } else if (activeTab === 'em_montagem_kit') {
      return assemblyGroups.filter(group => 
        group.targetProductType === 'kit' && 
        group.status !== 'montado' &&
        group.status !== 'concluido_por_estoque' &&
        group.status !== 'concluido_estoque_peca' &&
        group.status !== 'concluido_estoque_kit' &&
        group.status !== 'concluido_estoque_modelo'
      );
    } else if (activeTab === 'processando_embalagem') {
      return assemblyGroups.filter(group => 
        group.targetProductType === 'produto_final' && 
        group.status !== 'finalizado'
      );
    } else if (activeTab === 'finalizados') {
      return pedidosList.filter(pedido => pedido.status === 'concluido');
    } else if (activeTab === 'processando_embalagem_v2') {
      return assemblyGroups.filter(group => group.targetProductType === 'produto_final');
    }
    return [];
  }, [activeTab, optimizedGroups, assemblyGroups]);


  const handleConcluirMontagemPeca = useCallback(async (assemblyGroup: GrupoMontagem) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para concluir a montagem.");
      return;
    }

    try {
      await addDoc(collection(db, 'lancamentosProducao'), cleanObject({
        tipoEvento: 'conclusao_montagem_peca',
        timestamp: serverTimestamp(),
        usuarioId: auth.currentUser.uid,
        payload: {
          assemblyGroupId: assemblyGroup.id,
          targetProductId: assemblyGroup.targetProductId,
          targetProductType: assemblyGroup.targetProductType,
          parentModeloId: assemblyGroup.parentModeloId,
          parentKitId: assemblyGroup.parentKitId,
          usuarioId: auth.currentUser.uid,
        },
      }));
      
      toast.success("Solicitação de conclusão de montagem de peça enviada com sucesso! O status será atualizado em breve.");
      // No need to call refetchAllData here, as onSnapshot listeners handle updates
      
    } catch (error) {
      console.error("Erro ao solicitar conclusão de montagem de peça:", error);
      toast.error("Ocorreu um erro ao solicitar a conclusão da montagem. Verifique o console para mais detalhes.");
    }
  }, [auth.currentUser, serverTimestamp, cleanObject]);

  const handleConcluirMontagemModelo = useCallback(async (assemblyGroup: GrupoMontagem) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para concluir a montagem.");
      return;
    }

    try {
      // Determine next event based on parentKitId
      const tipoProximoEvento = assemblyGroup.parentKitId 
        ? 'entrada_modelo_montagem_kit' 
        : 'entrada_modelo_embalagem';

      const payload: Record<string, unknown> = {
        assemblyGroupId: assemblyGroup.id ?? '', // Use nullish coalescing
        assemblyInstanceId: assemblyGroup.assemblyInstanceId ?? null, // Use nullish coalescing
        targetProductId: assemblyGroup.targetProductId ?? '', // Use nullish coalescing
        targetProductType: 'modelo',
        parentModeloId: assemblyGroup.parentModeloId ?? null, // Use nullish coalescing
        parentKitId: assemblyGroup.parentKitId ?? null, // Use nullish coalescing
        quantidade: 1, // A model assembly conclusion represents a single instance
        proximoEvento: tipoProximoEvento,
      };

      // Only add pecasNecessarias if it exists and is not empty
      if (assemblyGroup.pecasNecessarias && Array.isArray(assemblyGroup.pecasNecessarias) && assemblyGroup.pecasNecessarias.length > 0) {
        payload.pecasNecessarias = assemblyGroup.pecasNecessarias.map((peca) => ({
          pecaId: peca.pecaId,
          nome: peca.nome ?? '',
          quantidade: peca.quantidade,
          quantidadeAtendida: peca.quantidadeAtendida,
          atendimentoDetalhado: peca.atendimentoDetalhado ?? [],
        }));
      }

      await addDoc(collection(db, 'lancamentosProducao'), cleanObject({
        tipoEvento: 'conclusao_montagem_modelo',
        timestamp: serverTimestamp(),
        usuarioId: auth.currentUser.uid,
        payload: payload,
      }));
      
      toast.success("Montagem de modelo concluída com sucesso!");
      // No need to call refetchAllData here, as onSnapshot listeners handle updates
      
    } catch (error) {
      console.error("Erro ao concluir montagem de modelo:", error);
      toast.error("Ocorreu um erro ao concluir a montagem. Verifique o console para mais detalhes.");
    }
  }, [auth.currentUser, serverTimestamp, cleanObject]);

  const handleConcluirMontagemKit = useCallback(async (assemblyGroup: GrupoMontagem) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para concluir a montagem.");
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        assemblyGroupId: assemblyGroup.id ?? '',
        assemblyInstanceId: assemblyGroup.assemblyInstanceId ?? null,
        targetProductId: assemblyGroup.targetProductId ?? '',
        targetProductType: 'kit',
        parentKitId: assemblyGroup.parentKitId ?? null,
        quantidade: 1, // A kit assembly conclusion represents a single instance
        proximoEvento: 'entrada_kit_embalagem',
      };

      if (assemblyGroup.modelosNecessarios && Array.isArray(assemblyGroup.modelosNecessarios) && assemblyGroup.modelosNecessarios.length > 0) {
        payload.modelosNecessarios = assemblyGroup.modelosNecessarios.map((modelo) => ({
          modeloId: modelo.modeloId,
          nome: modelo.nome ?? '',
          quantidade: modelo.quantidade,
          quantidadeAtendida: (modelo.atendimentoDetalhado || []).reduce((sum, item) => sum + item.quantidade, 0),
          atendimentoDetalhado: modelo.atendimentoDetalhado ?? [],
        }));
      }

      // NEW: Add pecasNecessarias to payload
      if (assemblyGroup.pecasNecessarias && Array.isArray(assemblyGroup.pecasNecessarias) && assemblyGroup.pecasNecessarias.length > 0) {
        payload.pecasNecessarias = assemblyGroup.pecasNecessarias.map((peca) => ({
          pecaId: peca.pecaId,
          nome: peca.nome ?? '',
          quantidade: peca.quantidade,
          quantidadeAtendida: (peca.atendimentoDetalhado || []).reduce((sum, item) => sum + item.quantidade, 0),
          atendimentoDetalhado: peca.atendimentoDetalhado ?? [],
        }));
      }

      await addDoc(collection(db, 'lancamentosProducao'), cleanObject({
        tipoEvento: 'conclusao_montagem_kit',
        timestamp: serverTimestamp(),
        usuarioId: auth.currentUser.uid,
        payload: payload,
      }));
      
      toast.success("Montagem de kit concluída com sucesso!");
      
    } catch (error) {
      console.error("Erro ao concluir montagem de kit:", error);
      toast.error("Ocorreu um erro ao concluir a montagem. Verifique o console para mais detalhes.");
    }
  }, [auth.currentUser, serverTimestamp, cleanObject]);

  const handleToggleItem = useCallback((assemblyGroupId: string | undefined, itemId: string, isChecked: boolean) => {
    const currentAssemblyGroupId = assemblyGroupId ?? ''; // Provide a default empty string
    
    setCheckedItems(prev => {
      const newCheckedItems = { ...prev };
      const currentGroupItems = { ...newCheckedItems[currentAssemblyGroupId] };
      
      // Set the clicked item
      currentGroupItems[itemId] = isChecked;
      
      // If this is a parent item, cascade to children
      if (itemId.startsWith('kit_')) {
        // Find assembly group to get its children
        const assemblyGroup = assemblyGroups.find(ag => ag.id === currentAssemblyGroupId);
        if (assemblyGroup && assemblyGroup.produtosFinaisNecessarios) {
          const kit = assemblyGroup.produtosFinaisNecessarios.find(pf => pf.produtoId === itemId.replace('kit_', ''));
          if (kit) {
            // Cascade to modelos (only if kit type is 'kit')
            if (kit.tipo === 'kit' && kit.modelos) {
              kit.modelos.forEach(modelo => {
                const modeloId = `modelo_${modelo.modeloId}`;
                currentGroupItems[modeloId] = isChecked;
                // Cascade to pecas of modelo
                if (modelo.pecas) {
                  modelo.pecas.forEach(peca => {
                    const pecaId = `peca_${peca.pecaId}`;
                    currentGroupItems[pecaId] = isChecked;
                  });
                }
              });
            }
            // Cascade to pecas
            if (kit.tipo === 'kit' && kit.pecas) {
              kit.pecas.forEach(peca => {
                const pecaId = `peca_${peca.pecaId}`;
                currentGroupItems[pecaId] = isChecked;
              });
            }
          }
        }
      }
      
      // If this is a modelo, cascade to its pecas
      if (itemId.startsWith('modelo_')) {
        const assemblyGroup = assemblyGroups.find(ag => ag.id === currentAssemblyGroupId);
        if (assemblyGroup && assemblyGroup.produtosFinaisNecessarios) {
          // Find the kit that contains this modelo
          const kit = assemblyGroup.produtosFinaisNecessarios.find(pf => 
            pf.tipo === 'kit' && pf.modelos?.some(m => m.modeloId === itemId.replace('modelo_', ''))
          );
          if (kit && kit.modelos) {
            const modelo = kit.modelos.find(m => m.modeloId === itemId.replace('modelo_', ''));
            if (modelo && modelo.pecas) {
              modelo.pecas.forEach(peca => {
                const pecaId = `peca_${peca.pecaId}`;
                currentGroupItems[pecaId] = isChecked;
              });
            }
          }
        }
      }
      
      newCheckedItems[currentAssemblyGroupId] = currentGroupItems;
      return newCheckedItems;
    });
  }, [assemblyGroups]);

  const handleStartPackaging = useCallback((assemblyGroupId: string | undefined) => {
    const currentAssemblyGroupId = assemblyGroupId ?? ''; // Provide a default empty string
    setIsPackagingStarted(prev => ({
      ...prev,
      [currentAssemblyGroupId]: true,
    }));
  }, []);

  const updatePackagingTime = useCallback((assemblyGroupId: string, time: number) => {
    setPackagingTime(prev => ({
      ...prev,
      [assemblyGroupId]: time,
    }));
  }, []);

  const getBloqueioFinalizacao = useCallback((assemblyGroup: GrupoMontagem, pedidoId: string): string => {
    // Verificar se a embalagem foi iniciada
    if (!isPackagingStarted[assemblyGroup.id ?? '']) {
      return "Embalagem não iniciada";
    }

    // Verificar se há produtos finais suficientes
    const canConcludePackaging = (assemblyGroup.produtosFinaisNecessarios ?? []).every(produto =>
      (produto.quantidadeAtendida || 0) >= produto.quantidade
    );
    if (!canConcludePackaging) {
      return "Produtos finais insuficientes";
    }

    // Verificar por contagem total de checkboxes
    const assemblyGroupCheckedItems = checkedItems[assemblyGroup.id ?? ''] || {};
    const checkedKeys = Object.keys(assemblyGroupCheckedItems);
    const checkedCount = Object.values(assemblyGroupCheckedItems).filter(Boolean).length;
    
    // Calcular quantidade total de itens que deveriam estar marcados
    let totalExpectedItems = 0;
    (assemblyGroup.produtosFinaisNecessarios ?? []).forEach(produto => {
      totalExpectedItems++; // O produto principal
      if (produto.tipo === 'kit') {
        const kitItem = produto as any;
        if (kitItem.modelos) {
          totalExpectedItems += kitItem.modelos.length;
          // Contar peças dentro dos modelos
          kitItem.modelos.forEach((modelo: any) => {
            if (modelo.pecas) {
              totalExpectedItems += modelo.pecas.length;
            }
          });
        }
        if (kitItem.pecas) {
          totalExpectedItems += kitItem.pecas.length;
        }
      }
    });
    
    // Verificar se todos os checkboxes esperados estão marcados
    if (checkedCount < totalExpectedItems || checkedKeys.length < totalExpectedItems) {
      return "Checkboxes não marcados";
    }

    // Verificar se o tempo de embalagem foi registrado
    const time = packagingTime[assemblyGroup.id ?? ''];
    if (!time || time <= 0) {
      return "Tempo de embalagem não registrado";
    }
    
    return ""; // Sem bloqueio
  }, [isPackagingStarted, checkedItems, packagingTime]);

  const canFinalizarPedido = useCallback((assemblyGroup: GrupoMontagem, pedidoId: string): boolean => {
    // DEBUG: Log inicial da validação
    console.log('🔍 DEBUG - canFinalizarPedido chamado:', {
      assemblyGroupId: assemblyGroup.id,
      pedidoId,
      isPackagingStarted: isPackagingStarted[assemblyGroup.id ?? ''],
      checkedItems: checkedItems[assemblyGroup.id ?? ''],
      packagingTime: packagingTime[assemblyGroup.id ?? ''],
      assemblyGroupProdutos: assemblyGroup.produtosFinaisNecessarios
    });

    // DEBUG DETALHADO: Verificar estados atuais
    console.log('📊 ESTADOS ATUAIS (JSON.stringify):', JSON.stringify({
      'packagingTime': packagingTime,
      'isPackagingStarted': isPackagingStarted,
      'checkedItems': checkedItems,
      'selectedPackagingInsumos': selectedPackagingInsumos
    }, null, 2));

    // Verificar se a embalagem foi iniciada
    if (!isPackagingStarted[assemblyGroup.id ?? '']) {
      console.log('🔍 DEBUG - Embalagem não iniciada para assemblyGroup:', assemblyGroup.id);
      return false;
    }

    // Verificar se há produtos finais suficientes
    const canConcludePackaging = (assemblyGroup.produtosFinaisNecessarios ?? []).every(produto =>
      (produto.quantidadeAtendida || 0) >= produto.quantidade
    );
    if (!canConcludePackaging) {
      console.log('🔍 DEBUG - Produtos finais insuficientes para assemblyGroup:', assemblyGroup.id);
      return false;
    }

    // NOVA ABORDAGEM: Verificar por contagem total de checkboxes
    const assemblyGroupCheckedItems = checkedItems[assemblyGroup.id ?? ''] || {};
    const checkedKeys = Object.keys(assemblyGroupCheckedItems);
    const checkedCount = Object.values(assemblyGroupCheckedItems).filter(Boolean).length;
    
    // Calcular quantidade total de itens que deveriam estar marcados
    let totalExpectedItems = 0;
    (assemblyGroup.produtosFinaisNecessarios ?? []).forEach(produto => {
      totalExpectedItems++; // O produto principal
      if (produto.tipo === 'kit') {
        const kitItem = produto as any;
        if (kitItem.modelos) {
          totalExpectedItems += kitItem.modelos.length;
          // Contar peças dentro dos modelos
          kitItem.modelos.forEach((modelo: any) => {
            if (modelo.pecas) {
              totalExpectedItems += modelo.pecas.length;
            }
          });
        }
        if (kitItem.pecas) {
          totalExpectedItems += kitItem.pecas.length;
        }
      }
    });
    
    // DEBUG: Log de checkboxes
    console.log('🔍 DEBUG - Validação de checkboxes:', {
      assemblyGroupId: assemblyGroup.id,
      checkedCount,
      totalExpectedItems,
      checkedKeys: checkedKeys.length,
      assemblyGroupCheckedItems: assemblyGroupCheckedItems
    });
    
    // Verificar se todos os checkboxes esperados estão marcados
    if (checkedCount < totalExpectedItems || checkedKeys.length < totalExpectedItems) {
      console.log('🔍 DEBUG - Checkboxes insuficientes para assemblyGroup:', assemblyGroup.id);
      return false;
    }

    // Verificar se o tempo de embalagem foi registrado - AGORA USANDO O assemblyGroup.id
    const time = packagingTime[assemblyGroup.id ?? ''];
    if (!time || time <= 0) {
      console.log('🔍 DEBUG - Tempo de embalagem inválido para assemblyGroup:', assemblyGroup.id, { time, assemblyGroupId: assemblyGroup.id });
      return false;
    }
    
    console.log('🔍 DEBUG - canFinalizarPedido retornando true para assemblyGroup:', assemblyGroup.id);
    return true;
  }, [isPackagingStarted, checkedItems, packagingTime]);

  // ✅ FUNÇÃO SIMPLIFICADA PARA CONCLUSÃO DE PEDIDO
  const concludePedido = useCallback(async (assemblyGroupId: string) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para finalizar um pedido.");
      return;
    }

    try {
      toast.loading("Finalizando pedido...", { id: 'finalizando-pedido' });
      
      // Buscar assembly group
      const assemblyGroup = assemblyGroups.find(ag => ag.id === assemblyGroupId);
      if (!assemblyGroup) {
        toast.dismiss('finalizando-pedido');
        toast.error("Grupo de montagem não encontrado.");
        return;
      }

      // Buscar pedido relacionado
      const { relatedPedido, pedidoId } = findRelatedPedido(assemblyGroup, pedidos);
      if (!relatedPedido) {
        toast.dismiss('finalizando-pedido');
        toast.error("Pedido não encontrado.");
        return;
      }

      // Atualizar status do pedido para concluído
      const pedidoRef = doc(db, 'pedidos', pedidoId);
      await updateDoc(pedidoRef, {
        status: 'concluido',
        dataConclusao: Timestamp.now()
      });

      toast.dismiss('finalizando-pedido');
      toast.success(`Pedido #${relatedPedido.numero} finalizado com sucesso!`);
      
    } catch (error) {
      console.error("Erro ao finalizar pedido:", error);
      toast.dismiss('finalizando-pedido');
      toast.error("Erro ao finalizar pedido.");
    }
  }, [auth.currentUser, assemblyGroups, pedidos, db, Timestamp, updateDoc]);

  const handleOpenLaunchModal = (group: OptimizedGroup) => {
    setSelectedProductionGroup(group);
    setIsLaunchModalOpen(true);
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
            onClick={() => setActiveTab('visao_geral')}
            className={`${activeTab === 'visao_geral'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Visão Geral
          </button>
          <button
            onClick={() => setActiveTab('uso_estoque')}
            className={`${activeTab === 'uso_estoque'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Uso Estoque
          </button>
          <button
            onClick={() => setActiveTab('aguardando')}
            className={`${activeTab === 'aguardando'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Aguardando
          </button>
          <button
            onClick={() => setActiveTab('em_producao')}
            className={`${activeTab === 'em_producao'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Em Produção
          </button>
          <button
            onClick={() => setActiveTab('em_montagem_peca')}
            className={`${activeTab === 'em_montagem_peca'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Em Montagem - Peça
          </button>
          <button
            onClick={() => setActiveTab('em_montagem_modelo')}
            className={`${activeTab === 'em_montagem_modelo'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Em Montagem - Modelo
          </button>
          <button
            onClick={() => setActiveTab('em_montagem_kit')}
            className={`${activeTab === 'em_montagem_kit'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Em Montagem - Kit
          </button>
          <button
            onClick={() => setActiveTab('processando_embalagem_v2')}
            className={`${activeTab === 'processando_embalagem_v2'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Processando Embalagem
          </button>
          <button
            onClick={() => setActiveTab('finalizados')}
            className={`${activeTab === 'finalizados'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Finalizados
          </button>
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'visao_geral' && (
          <ProductionSummaryTable
            summary={productionSummary}
            isLoading={isSummaryLoading}
            onUseStock={handleUseStock}
          />
        )}

        {activeTab === 'uso_estoque' && (
          <UsoEstoqueTabV3 />
        )}

        {activeTab === 'aguardando' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from(optimizedGroups.values()).length > 0 ? (
              Array.from(optimizedGroups.values()).filter(group => group.status === 'aguardando').map((group: OptimizedGroup) => {
                return (
                  <div key={String(group.id)} className={`bg-white shadow rounded-lg p-6 border-2 ${group.pedidosOrigem.length > 1 ? 'border-green-400' : 'border-transparent'}`}>
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
                      <p className="text-gray-600">
                        {group.pedidosOrigem && group.pedidosOrigem.length > 0
                          ? [...new Set(group.pedidosOrigem.map(p => `#${p.pedidoNumero}`))].join(', ')
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <h5 className="font-semibold">Partes no Grupo:</h5>
                      <ul className="list-disc list-inside text-gray-600">
                        {Object.entries(group.partesNoGrupo).map(([parteId, parteInfo]) => {
                          return (
                            <li key={parteId}>
                              {parteInfo.nome} (x{parteInfo.quantidade})
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
                    disabled={!group.insumosProntos}
                    className="w-full mt-4 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    <Play className="h-5 w-5 mr-2" /> Iniciar Produção
                  </button>
                  {!group.insumosProntos && <p className="text-xs text-center text-red-600 mt-2">Produção bloqueada por falta de insumos.</p>}
                </div>
                );
              })
            ) : (
              <div className="text-center py-12 col-span-full">
                <p className="text-gray-600">Nenhum grupo de impressão aguardando otimização.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'em_producao' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from(optimizedGroups.values()).filter(group => group.status === 'em_producao').length > 0 ? (
              Array.from(optimizedGroups.values()).filter(group => group.status === 'em_producao').map((group: OptimizedGroup) => (
                <div key={group.id} className="bg-white shadow rounded-lg p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-900">{group.sourceName}</h3>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800`}>
                      Em Produção
                    </span>
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
                          return (
                            <li key={parteId}>
                              {parteInfo.nome} (x{parteInfo.quantidade})
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-semibold">Filamentos Necessários:</h5>
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
                  <div className="flex space-x-2 mt-4">
                    <button onClick={() => revertProductionGroupStatus(group.pedidosOrigem[0].pedidoId, group.id, 'em_producao')} className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700">
                      <XCircle className="h-3 w-3 mr-1" /> Reverter
                    </button>
                    <button onClick={() => updateProductionGroupStatus(group.pedidosOrigem[0].pedidoId, group.id, 'aguardando')} className="inline-flex items-center px-3 py-1 border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700">
                      <Pause className="h-3 w-3 mr-1" /> Pausar
                    </button>
                    <button onClick={() => {
                      setSelectedGroupForConclusion(group);
                      setIsConclusionModalOpen(true);
                    }} className="inline-flex items-center px-3 py-1 border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700">
                      <CheckCircle className="h-3 w-3 mr-1" /> Concluir Impressão
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 col-span-full">
                <p className="text-gray-600">Nenhum grupo de impressão em produção encontrado.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'em_montagem_peca' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {getFilteredDisplayGroups(pedidos).length > 0 ? (
              (getFilteredDisplayGroups(pedidos) as GrupoMontagem[]).map((assemblyGroup: GrupoMontagem) => {
                const isAvulsa = assemblyGroup.isAvulsa;
                const pedidoDisplay = isAvulsa ? "Montagem Avulsa" : `Pedido #${assemblyGroup.pedidoNumero}`;
                const canConcludeAssembly = assemblyGroup.partesNecessarias?.every(parte =>
                  (parte.quantidadeAtendida || 0) >= parte.quantidade
                );

                return (
                  <div key={assemblyGroup.id ?? uuidv4()} className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-xl font-bold text-gray-900">{pedidoDisplay}</h3>
                    <p className="text-gray-600 mb-2">Peça Alvo: {assemblyGroup.targetProductName} (x{assemblyGroup.payload?.quantidade || 0})</p>
                    <p className="text-gray-600 mb-4">Status: {assemblyGroup.status}</p>

                    <h4 className="text-lg font-semibold text-gray-800 mb-3">Partes Necessárias:</h4>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {assemblyGroup.partesNecessarias?.map((parte, index) => {
                        const isAttended = (parte.quantidadeAtendida || 0) >= parte.quantidade;
                        const textColorClass = isAttended ? 'text-green-600' : 'text-red-600';
                        return (
                          <li key={index} className={textColorClass}>
                            {parte.nome}: Necessário {parte.quantidade}, Atendido {parte.quantidadeAtendida || 0}, Estoque Atual {parte.estoqueAtual || 0}
                            {parte.atendimentoDetalhado && parte.atendimentoDetalhado.length > 0 && (
                              <ul className="list-disc list-inside ml-4 text-xs text-gray-500">
                                {parte.atendimentoDetalhado.map((atendimento, attIndex) => (
                                  <li key={attIndex}>
                                    Origem: {atendimento.origem}, Quantidade: {atendimento.quantidade}, Data: {new Date(atendimento.timestamp.seconds * 1000).toLocaleString()}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      onClick={() => handleConcluirMontagemPeca(assemblyGroup)}
                      disabled={!canConcludeAssembly}
                      className="w-full mt-4 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="h-5 w-5 mr-2" /> Concluir Montagem de Peça
                    </button>
                    {!canConcludeAssembly && <p className="text-xs text-center text-red-600 mt-2">Montagem bloqueada: Partes insuficientes.</p>}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 col-span-full">
                <p className="text-gray-600">Nenhum grupo de montagem de peça aguardando ou em andamento.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'em_montagem_modelo' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {getFilteredDisplayGroups(pedidos).length > 0 ? (
              (getFilteredDisplayGroups(pedidos) as GrupoMontagem[]).map((assemblyGroup: GrupoMontagem) => {
                const isAvulsa = assemblyGroup.isAvulsa;
                const pedidoDisplay = isAvulsa ? "Montagem Avulsa" : `Pedido #${assemblyGroup.pedidoNumero}`;
                const canConcludeAssembly = (assemblyGroup.pecasNecessarias ?? []).every(peca =>
                  (peca.quantidadeAtendida || 0) >= peca.quantidade
                );

                return (
                  <div key={assemblyGroup.id ?? uuidv4()} className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-xl font-bold text-gray-900">{pedidoDisplay}</h3>
                    <p className="text-gray-600 mb-2">Modelo Alvo: {assemblyGroup.targetProductName} (x{assemblyGroup.payload?.quantidade || 0})</p>
                    <p className="text-gray-600 mb-4">Status: {assemblyGroup.status}</p>

                    <h4 className="text-lg font-semibold text-gray-800 mb-3">Peças Necessárias:</h4>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {(assemblyGroup.pecasNecessarias ?? []).map((peca, index) => {
                        const isFullyAttended = (peca.quantidadeAtendida || 0) === peca.quantidade;
                        return (
                          <li key={index} className={isFullyAttended ? 'text-green-600' : 'text-red-600'}>
                            {peca.nome}: Necessário {peca.quantidade}, Atendido {peca.quantidadeAtendida || 0}, Estoque Atual {peca.estoqueAtual || 0}
                            {peca.atendimentoDetalhado && peca.atendimentoDetalhado.length > 0 && (
                              <ul className="list-disc list-inside ml-4 text-xs text-gray-500">
                                {peca.atendimentoDetalhado.map((atendimento: AtendimentoDetalhadoItemType, attIndex: number) => (
                                  <li key={attIndex}>
                                    Origem: {atendimento.origem}, Quantidade: {atendimento.quantidade}, Data: {new Date(atendimento.timestamp.seconds * 1000).toLocaleString()}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      onClick={() => handleConcluirMontagemModelo(assemblyGroup)}
                      disabled={!canConcludeAssembly}
                      className="w-full mt-4 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="h-5 w-5 mr-2" /> Concluir Montagem de Modelo
                    </button>
                    {!canConcludeAssembly && <p className="text-xs text-center text-red-600 mt-2">Montagem bloqueada: Peças insuficientes.</p>}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 col-span-full">
                <p className="text-gray-600">Nenhum grupo de montagem de modelo aguardando ou em andamento.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'em_montagem_kit' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {getFilteredDisplayGroups(pedidos).length > 0 ? (
              (getFilteredDisplayGroups(pedidos) as GrupoMontagem[]).map((assemblyGroup: GrupoMontagem) => {
                const isAvulsa = assemblyGroup.isAvulsa;
                const pedidoDisplay = isAvulsa ? "Montagem Avulsa" : `Pedido #${assemblyGroup.pedidoNumero}`;
                const canConcludeAssembly = 
                  (assemblyGroup.modelosNecessarios ?? []).every(modelo => {
                    const calculatedQuantidadeAtendida = (modelo.atendimentoDetalhado || []).reduce((sum, item) => sum + item.quantidade, 0);
                    return calculatedQuantidadeAtendida >= modelo.quantidade;
                  }) &&
                  (assemblyGroup.pecasNecessarias ?? []).every(peca => 
                    (peca.quantidadeAtendida || 0) >= peca.quantidade
                  );

                return (
                  <div key={assemblyGroup.id} className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-xl font-bold text-gray-900">{pedidoDisplay}</h3>
                    <p className="text-gray-600 mb-2">Kit Alvo: {assemblyGroup.targetProductName} (x{assemblyGroup.payload?.quantidade || 0})</p>
                    <p className="text-gray-600 mb-4">Status: {assemblyGroup.status}</p>

                    <h4 className="text-lg font-semibold text-gray-800 mb-3">Modelos Necessários:</h4>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {assemblyGroup.modelosNecessarios?.map((modelo, index) => {
                        const calculatedQuantidadeAtendida = (modelo.atendimentoDetalhado || []).reduce((sum, item) => sum + item.quantidade, 0);
                        const isFullyAttended = calculatedQuantidadeAtendida === modelo.quantidade;
                        return (
                          <li key={index} className={isFullyAttended ? 'text-green-600' : 'text-red-600'}>
                            {modelo.nome}: Necessário {modelo.quantidade}, Atendido {calculatedQuantidadeAtendida}, Estoque Atual {modelo.estoqueAtual || 0}
                            {modelo.atendimentoDetalhado && modelo.atendimentoDetalhado.length > 0 && (
                              <ul className="list-disc list-inside ml-4 text-xs text-gray-500">
                                {modelo.atendimentoDetalhado.map((atendimento: { origem: string; quantidade: number; timestamp: any }, attIndex: number) => (
                                  <li key={attIndex}>
                                    Origem: {atendimento.origem}, Quantidade: {atendimento.quantidade}, Data: {new Date(atendimento.timestamp.seconds * 1000).toLocaleString()}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    <h4 className="text-lg font-semibold text-gray-800 mb-3 mt-6">Peças Necessárias:</h4>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {(assemblyGroup.pecasNecessarias ?? []).map((peca, index) => {
                        const isFullyAttended = (peca.quantidadeAtendida || 0) >= peca.quantidade;
                        return (
                          <li key={index} className={isFullyAttended ? 'text-green-600' : 'text-red-600'}>
                            {peca.nome}: Necessário {peca.quantidade}, Atendido {peca.quantidadeAtendida || 0}, Estoque Atual {peca.estoqueAtual || 0}
                            {peca.atendimentoDetalhado && peca.atendimentoDetalhado.length > 0 && (
                              <ul className="list-disc list-inside ml-4 text-xs text-gray-500">
                                {peca.atendimentoDetalhado.map((atendimento: { origem: string; quantidade: number; timestamp: any }, attIndex: number) => (
                                  <li key={attIndex}>
                                    Origem: {atendimento.origem}, Quantidade: {atendimento.quantidade}, Data: {new Date(atendimento.timestamp.seconds * 1000).toLocaleString()}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    <button
                      onClick={() => handleConcluirMontagemKit(assemblyGroup)}
                      disabled={!canConcludeAssembly}
                      className="w-full mt-4 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="h-5 w-5 mr-2" /> Concluir Montagem de Kit
                    </button>
                    {!canConcludeAssembly && <p className="text-xs text-center text-red-600 mt-2">Montagem bloqueada: Componentes insuficientes.</p>}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 col-span-full">
                <p className="text-gray-600">Nenhum grupo de montagem de kit aguardando ou em andamento.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'processando_embalagem' && (
          <div className="space-y-6">
            {getFilteredDisplayGroups(pedidos).length > 0 ? (
              (getFilteredDisplayGroups(pedidos) as GrupoMontagem[]).map((assemblyGroup: GrupoMontagem) => {
                // ✅ NOVA ABORDAGEM: Usar função auxiliar unificada
                const { relatedPedido, pedidoId } = findRelatedPedido(assemblyGroup, pedidos);
                const assemblyGroupId = assemblyGroup.id ?? '';
                
                // Se relatedPedido for null, usar o assemblyGroupId como fallback
                const finalPedidoId = relatedPedido?.id || assemblyGroupId;
                
                console.log('🔍 DEBUG - Lógica unificada de pedidoId:', {
                    assemblyGroupId,
                    finalPedidoId,
                    relatedPedidoFound: !!relatedPedido,
                    pedidoNumero: relatedPedido?.numero
                  });
                
                const canConcludePackaging = (assemblyGroup.produtosFinaisNecessarios ?? []).every(produto =>
                  (produto.quantidadeAtendida || 0) >= produto.quantidade
                );

                return (
                  <div key={assemblyGroup.id ?? uuidv4()} className="bg-white shadow rounded-lg p-6">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xl font-bold text-gray-900">{assemblyGroup.targetProductName}</h3>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleStartPackaging(assemblyGroup.id)}
                          disabled={isPackagingStarted[assemblyGroupId] || !canConcludePackaging}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          <Play className="h-5 w-5 mr-2" /> Iniciar Embalagem
                        </button>
                        <button
                          onClick={() => concludePedido(assemblyGroupId)}
                          disabled={!canFinalizarPedido(assemblyGroup, finalPedidoId)}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          <CheckCircle className="h-5 w-5 mr-2" /> Finalizar Pedido
                        </button>
                      </div>
                    </div>
                    <div className="mt-4">
                      <h4 className="text-lg font-semibold">Produtos Finais Necessários:</h4>
                      <div className="space-y-2">
                        {((assemblyGroup.produtosFinaisNecessarios ?? []) as ProdutoFinalNecessario[]).map((produto: ProdutoFinalNecessario, index) => (
                          <PackagingOrderItem
                            key={produto.produtoId || `item-${index}`}
                            item={produto}
                            type={produto.tipo as 'kit' | 'modelo' | 'peca'}
                            assemblyGroupId={assemblyGroupId}
                            isPackagingStarted={isPackagingStarted[assemblyGroupId] || false}
                            checkedItems={checkedItems[assemblyGroupId] || {}}
                            onToggleItem={handleToggleItem}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="mt-4">
                      <button
                        onClick={() => {
                          const targetPedido = relatedPedido || pedidos.find(p => p.id === finalPedidoId);
                          if (targetPedido) {
                            setSelectedPedidoForPackaging(targetPedido);
                            setIsPackagingInsumoModalOpen(true);
                          } else {
                            console.error('❌ Nenhum pedido encontrado para adicionar insumos de embalagem:', {
                              relatedPedido: !!relatedPedido,
                              finalPedidoId,
                              pedidosCount: pedidos.length
                            });
                            toast.error("Erro ao buscar informações do pedido. Recarregue a página e tente novamente.");
                          }
                        }}
                        className="inline-flex items-center px-3 py-1 border-dashed text-sm font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200"
                      >
                        <PlusCircle className="h-4 w-4 mr-2" /> Adicionar Insumo de Embalagem
                      </button>
                      <div className="mt-2">
                        {selectedPackagingInsumos[assemblyGroupId]?.map(({ insumo, quantidade }) => (
                          <div key={insumo.id} className="text-sm">{insumo.nome}: {quantidade}</div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4">
                      <label htmlFor={`packaging-time-${assemblyGroupId}`} className="block text-sm font-medium text-gray-700">
                        Tempo de Embalagem (minutos)
                      </label>
                      <div className="mt-2 flex items-center space-x-2">
                        <input
                          type="number"
                          id={`packaging-time-${assemblyGroupId}`}
                          min="0"
                          step="1"
                          className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          placeholder="Ex: 15"
                          value={packagingTime[assemblyGroupId] || ''}
                          onChange={(e) => {
                            const value = Number(e.target.value) || 0;
                            updatePackagingTime(assemblyGroupId, value);
                          }}
                        />
                        <span className="text-sm text-gray-500">min</span>
                      </div>
                      {packagingTime[assemblyGroupId] && packagingTime[assemblyGroupId] > 0 && (
                        <div className="mt-2 text-green-600 bg-green-50 p-2 rounded">
                          ✓ Tempo registrado: {packagingTime[assemblyGroupId]} minutos
                        </div>
                      )}
                    </div>
                    {!canFinalizarPedido(assemblyGroup, finalPedidoId) && (
                      <p className="text-xs text-center text-red-600 mt-2">
                        Finalização bloqueada: {getBloqueioFinalizacao(assemblyGroup, finalPedidoId)}
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 col-span-full">
                <p className="text-gray-600">Nenhum grupo de embalagem aguardando ou em andamento.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'processando_embalagem_v2' && (
          <ProcessandoEmbalagemV2 />
        )}

        {activeTab === 'finalizados' && (
          <CompletedOrdersTable pedidos={getFilteredDisplayGroups(pedidos) as Pedido[]} />
        )}
      </div>

      <ProductionLaunchModal
        isOpen={isLaunchModalOpen}
        onClose={handleCloseLaunchModal}
        group={selectedProductionGroup}
        onLaunchSuccess={handleLaunchSuccess}
      />

      <ProductionConclusionModal
        isOpen={isConclusionModalOpen}
        onClose={() => setIsConclusionModalOpen(false)}
        group={selectedGroupForConclusion}
        availablePecas={availablePecas}
        locaisProdutos={locaisProdutos}
        onConclude={handleConcludeProduction}
      />

      {isExcessModalOpen && excessPartData && (
        <ProductionExcessStockModal
          isOpen={isExcessModalOpen}
          onClose={() => setIsExcessModalOpen(false)}
          partData={excessPartData}
          pecaTipo={excessPartData.pecaTipo}
          onLaunchSuccess={() => {
            setIsExcessModalOpen(false);
          // refetchAllData(); // Removed as onSnapshot listeners handle updates
          }}
          onSendToAssembly={(partId, quantity) => {
            // The pecaId is now available in excessPartData.pecaId
            // We need to ensure excessPartData.pecaId is passed as first argument
            // and partId as second argument to handleSendToAssembly.
            if (excessPartData?.pecaId) {
              handleSendToAssembly(excessPartData.pecaId, partId, quantity);
            } else {
              console.error("Peca ID not found for excess part. Cannot send to assembly.");
              alert("Erro: ID da peça não encontrado para enviar excedente para montagem.");
            }
          }}
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
          onSelect={(selectedInsumos: { insumo: Insumo, quantidade: number }[]) => {
            // Usar assemblyGroupId em vez de pedidoId para consistência
            const assemblyGroup = assemblyGroups.find(ag => 
              ag.produtosFinaisNecessarios?.some(pf => 
                pf.produtoId === selectedPedidoForPackaging?.produtos[0]?.produtoId
              )
            );
            const assemblyGroupId = assemblyGroup?.id || selectedPedidoForPackaging.id;
            
            // Create a map of existing insumos to avoid duplicates
            const existingInsumoMap = new Map((selectedPackagingInsumos[assemblyGroupId] || []).map(item => [item.insumo.id, item]));
            
            // Add new insumos, replacing any existing ones with same ID
            selectedInsumos.forEach(newItem => {
              existingInsumoMap.set(newItem.insumo.id, newItem);
            });
            
            // Convert back to array
            const updatedInsumos = Array.from(existingInsumoMap.values());
            
            setSelectedPackagingInsumos({ ...selectedPackagingInsumos, [assemblyGroupId]: updatedInsumos });
            setIsPackagingInsumoModalOpen(false);
          }}
          initialSelectedInsumos={
            // Buscar insumos pelo assemblyGroupId correspondente
            (() => {
              const assemblyGroup = assemblyGroups.find(ag => 
                ag.produtosFinaisNecessarios?.some(pf => 
                  pf.produtoId === selectedPedidoForPackaging?.produtos[0]?.produtoId
                )
              );
              const assemblyGroupId = assemblyGroup?.id || selectedPedidoForPackaging.id;
              return selectedPackagingInsumos[assemblyGroupId] || [];
            })()
          }
          insumoTipoFilter={null}
        />
      )}
    </div>
  );
}