"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../services/firebase'; // Import auth
import { collection, getDocs, doc, getDoc, updateDoc, query, where, Timestamp, addDoc, writeBatch, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth'; // Import onAuthStateChanged
import { Hourglass, Package, CheckCircle, XCircle, Play, Pause, Spool, MapPin, Users, PlusCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { Pedido, ProductionGroup, Peca, Modelo, Kit, Insumo, Parte, PosicaoEstoque, GrupoDeFilamento, PecaInsumo, GrupoImpressao, LancamentoInsumo, LancamentoProduto, PecaParte, ProductionGroupFilamento, ProductionGroupOutroInsumo, Historico, Configuracoes, DashboardMetrics, AlertaEstoque, Produto, Servico, LancamentoServico, ItemToDebit, OptimizedGroup, GrupoMontagem, LancamentoMontagem, ProdutoFinalNecessario, PackagingModelo, PackagingPeca, PedidoProduto, AtendimentoDetalhadoItem, AtendimentoDetalhadoItem as AtendimentoDetalhadoItemType } from '../types'; // Import AtendimentoDetalhadoItemType
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
import { useStockCalculations } from '../hooks/useStockCalculations'; // Import the new hook
import { useProductionSummary } from '../hooks/useProductionSummary';
import { useOptimizedGroups } from '../hooks/useOptimizedGroups';
import { useAssemblyGroups } from '../hooks/useAssemblyGroups'; // Import the new hook
import { formatTime, formatFilament, calculateEffectiveQuantityFulfilledByComponents, generateProductionGroupsForProduct, getGroupStockStatus, canConcludePedido, formatLocation } from '../utils/producaoUtils';

export default function Producao() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [activeTab, setActiveTab] = useState<'visao_geral' | 'aguardando' | 'em_producao' | 'em_montagem_peca' | 'em_montagem_modelo' | 'em_montagem_kit' | 'processando_embalagem' | 'finalizados'>('visao_geral');
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

  const [itemToDebit, setItemToDebit] = useState<ItemToDebit | null>(null); // Use the imported ItemToDebit
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const { enrichPosicoesEstoque, getStockForProduct } = useStockCalculations();
  const { assemblyGroups } = useAssemblyGroups(); // Use the hook
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
    // Fetch detailed stock positions for the item
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

    const itemToDebitData: ItemToDebit = {
      id: item.documentId,
      nome: item.produtoNome,
      quantidadePedido: item.necessario, // Use 'necessario' from SummaryItem
      estoqueAtualItem: item.emEstoque, // Use 'emEstoque' from SummaryItem
      localEstoqueItem: posicoesEstoque, // Use fetched detailed positions
      type: item.tipo,
      // pedidoId and groupId are not directly available in SummaryItem,
      // so they will be undefined unless we decide to pass them through SummaryItem.
      // For now, we'll leave them out as they are optional in ItemToDebit.
    };

    setItemToDebit(itemToDebitData);
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
      // Update the status of the optimized group
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
                  // This group is part of the optimized group being launched
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
                  p.statusProducaoItem === 'em_montagem_modelos' ||
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

    const { id, nome, type } = itemToDebit;
    let totalDebited = 0;

    if (!['parte', 'peca', 'modelo', 'kit'].includes(type)) {
      toast.error(`O tipo de item '${type}' não é um produto válido para lançamento de estoque nesta operação.`);
      setIsStockSelectionModalOpen(false);
      setItemToDebit(null);
      return;
    }

    try {
      const batch = writeBatch(db);
      for (const debit of debits) {
        if (debit.quantityToDebit > 0) {
          const lancamentoProduto: LancamentoProduto = {
            id: uuidv4(),
            produtoId: id,
            tipoProduto: type as LancamentoProduto['tipoProduto'],
            tipoMovimento: 'saida',
            usuario: auth.currentUser?.displayName || 'Sistema de Produção (Visão Geral)',
            observacao: `Débito de estoque manual para ${nome} (SKU: ${id})`,
            data: Timestamp.fromDate(new Date()),
            locais: [
              {
                recipienteId: debit.selectedPosition.recipienteId!, // Non-null assertion
                divisao: debit.selectedPosition.divisao,
                quantidade: debit.quantityToDebit,
                localId: debit.selectedPosition.localId || '',
              }
            ]
          };
          batch.set(doc(collection(db, 'lancamentosProdutos')), cleanObject(lancamentoProduto));
          totalDebited += debit.quantityToDebit;
        }
      }
      await batch.commit();
      
      toast.success(`Lançamento de saída de estoque para ${nome} criado com sucesso! Quantidade: ${totalDebited}`);
      setIsStockSelectionModalOpen(false);
      setItemToDebit(null);
      // No need to call refetchAllData here, as onSnapshot listeners will handle updates
    } catch (error) {
      console.error("Error during manual stock debit from summary: ", error);
      toast.error("Ocorreu um erro ao criar o lançamento de estoque. Verifique o console para mais detalhes.");
      setIsStockSelectionModalOpen(false);
      setItemToDebit(null);
    }
  }, [auth.currentUser, itemToDebit, uuidv4, cleanObject, db, Timestamp, setIsStockSelectionModalOpen, setItemToDebit]);

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

      // Lançar produtos produzidos (partes)
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
        // No need to call refetchAllData here, as onSnapshot listeners will handle updates
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
      return assemblyGroups.filter(group => group.targetProductType === 'peca' && group.status !== 'montado');
    } else if (activeTab === 'em_montagem_modelo') {
      return assemblyGroups.filter(group => group.targetProductType === 'modelo' && group.status !== 'montado');
    } else if (activeTab === 'em_montagem_kit') {
      return assemblyGroups.filter(group => group.targetProductType === 'kit' && group.status !== 'montado');
    } else if (activeTab === 'processando_embalagem') {
      return assemblyGroups.filter(group => group.targetProductType === 'produto_final');
    } else if (activeTab === 'finalizados') {
      return pedidosList.filter(pedido => pedido.status === 'concluido');
    }
    return [];
  }, [activeTab, optimizedGroups, assemblyGroups]);

  const handleLaunchPackagingTime = useCallback(async (pedidoId: string) => {
    const time = packagingTime[pedidoId];
    if (!time || time <= 0) {
      toast.error("Por favor, insira um tempo de embalagem válido.");
      return;
    }

    try {
      await addDoc(collection(db, 'lancamentoServicos'), cleanObject({
        servicoId: 'embalagem', // ou um ID de serviço específico para embalagem
        pedidoId: pedidoId,
        quantidade: time / 60, // Convertendo minutos para horas
        data: Timestamp.now(),
        usuario: auth.currentUser?.displayName || 'Sistema',
      }));
      toast.success("Tempo de embalagem lançado com sucesso!");
    } catch (error) {
      console.error("Erro ao lançar tempo de embalagem:", error);
      toast.error("Falha ao lançar o tempo de embalagem.");
    }
  }, [packagingTime, auth.currentUser, db, Timestamp, cleanObject]);

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
      // No need to call refetchAllData here, as onSnapshot listeners will handle updates
      
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
      // Determine the next event based on parentKitId
      const tipoProximoEvento = assemblyGroup.parentKitId 
        ? 'entrada_modelo_montagem_kit' 
        : 'entrada_modelo_embalagem';

      const payload: Record<string, any> = {
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
      // No need to call refetchAllData here, as onSnapshot listeners will handle updates
      
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
      const payload: Record<string, any> = {
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

      // NEW: Add pecasNecessarias to the payload
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
    setCheckedItems(prev => ({
      ...prev,
      [currentAssemblyGroupId]: {
        ...prev[currentAssemblyGroupId],
        [itemId]: isChecked,
      },
    }));
  }, []);

  const handleStartPackaging = useCallback((assemblyGroupId: string | undefined) => {
    const currentAssemblyGroupId = assemblyGroupId ?? ''; // Provide a default empty string
    setIsPackagingStarted(prev => ({
      ...prev,
      [currentAssemblyGroupId]: true,
    }));
  }, []);

  const concludePedido = useCallback(async (pedidoId: string) => {
    try {
      const pedidoToUpdate = pedidos.find(p => p.id === pedidoId);
      if (!pedidoToUpdate) {
        console.error("Pedido não encontrado no estado local:", pedidoId);
        return;
      }

      const batch = writeBatch(db);
      const pedidoRef = doc(db, 'pedidos', pedidoId);

      // Lançar insumos de embalagem
      const insumosParaLancar = selectedPackagingInsumos[pedidoId] ?? [];
      for (const { insumo, quantidade } of insumosParaLancar) {
        const lancamentoRef = doc(collection(db, 'lancamentosInsumos'));
        batch.set(lancamentoRef, {
          id: uuidv4(),
          insumoId: insumo.id,
          tipoInsumo: 'material', // Assuming packaging insumos are 'material' type
          tipoMovimento: 'saida',
          quantidade: quantidade,
          unidadeMedida: 'unidades',
          detalhes: `Consumo de embalagem para Pedido #${pedidoToUpdate.numero || 'N/A'}`,
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

      // No need to call refetchAllData here, as onSnapshot listeners will handle updates
      toast.success("Pedido finalizado com sucesso!");

    } catch (error) {
      console.error("Erro ao finalizar o pedido: ", error);
      toast.error("Ocorreu um erro ao tentar finalizar o pedido. Verifique o console para mais detalhes.");
    }
  }, [pedidos, selectedPackagingInsumos, setSelectedPackagingInsumos, setPackagingTime, auth.currentUser, uuidv4, Timestamp, db, cleanObject]);

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
            className={`${
              activeTab === 'visao_geral'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Visão Geral
          </button>
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
            onClick={() => setActiveTab('em_montagem_kit')}
            className={`${
              activeTab === 'em_montagem_kit'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Em Montagem - Kit
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
        {activeTab === 'visao_geral' && (
          <ProductionSummaryTable
            summary={productionSummary}
            isLoading={isSummaryLoading}
            onUseStock={handleUseStock}
          />
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
                    <button onClick={() => updateProductionGroupStatus(group.pedidosOrigem[0].pedidoId, group.id, 'aguardando')} className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700">
                      <Pause className="h-3 w-3 mr-1" /> Pausar
                    </button>
                    <button onClick={() => {
                      setSelectedGroupForConclusion(group);
                      setIsConclusionModalOpen(true);
                    }} className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700">
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
                        const calculatedQuantidadeAtendida = (modelo.atendimentoDetalhado || []).reduce((sum: number, item: AtendimentoDetalhadoItemType) => sum + item.quantidade, 0);
                        const isFullyAttended = calculatedQuantidadeAtendida === modelo.quantidade;
                        return (
                          <li key={index} className={isFullyAttended ? 'text-green-600' : 'text-red-600'}>
                            {modelo.nome}: Necessário {modelo.quantidade}, Atendido {calculatedQuantidadeAtendida}, Estoque Atual {modelo.estoqueAtual || 0}
                            {modelo.atendimentoDetalhado && modelo.atendimentoDetalhado.length > 0 && (
                              <ul className="list-disc list-inside ml-4 text-xs text-gray-500">
                                {modelo.atendimentoDetalhado.map((atendimento: AtendimentoDetalhadoItemType, attIndex: number) => (
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
                const pedidoId: string = assemblyGroup.targetProductId ?? ''; // The pedidoId is stored in targetProductId
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
                          disabled={isPackagingStarted[assemblyGroup.id ?? ''] || !canConcludePackaging}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          <Play className="h-5 w-5 mr-2" /> Iniciar Embalagem
                        </button>
                        <button
                          onClick={() => concludePedido(pedidoId)}
                          disabled={!isPackagingStarted[assemblyGroup.id ?? ''] || !canConcludePackaging || !(assemblyGroup.produtosFinaisNecessarios ?? []).every(produto => {
                            const allChildrenChecked = (item: ProdutoFinalNecessario | PackagingModelo | PackagingPeca): boolean => {
                              let itemId: string | undefined;
                              if ('produtoId' in item && item.produtoId) {
                                itemId = item.produtoId;
                              } else if ('modeloId' in item && item.modeloId) {
                                itemId = item.modeloId;
                              } else if ('pecaId' in item && item.pecaId) {
                                itemId = item.pecaId;
                              }

                          if (!itemId) return false;
                          const assemblyGroupCheckedItems = checkedItems[assemblyGroup.id ?? ''] || {};
                          if (!assemblyGroupCheckedItems[itemId]) return false;

                          if ('modelos' in item && 'modelos' in item && item.modelos) {
                            if (!((item.modelos ?? []) as PackagingModelo[]).every(allChildrenChecked)) return false;
                          }
                          if ('pecas' in item && 'pecas' in item && item.pecas) {
                            if (!((item.pecas ?? []) as PackagingPeca[]).every(allChildrenChecked)) return false;
                          }
                          return true;
                        };
                        return allChildrenChecked(produto);
                      })}
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
                            assemblyGroupId={assemblyGroup.id ?? ''}
                            isPackagingStarted={isPackagingStarted[assemblyGroup.id ?? ''] || false}
                            checkedItems={checkedItems[assemblyGroup.id ?? ''] || {}}
                            onToggleItem={handleToggleItem}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="mt-4">
                      <button
                        onClick={() => {
                          const relatedPedido = pedidos.find(p => p.id === pedidoId);
                          if (relatedPedido) {
                            setSelectedPedidoForPackaging(relatedPedido);
                            setIsPackagingInsumoModalOpen(true);
                          } else {
                            alert("Pedido relacionado não encontrado para adicionar insumos de embalagem.");
                          }
                        }}
                        className="inline-flex items-center px-3 py-1 border border-dashed text-sm font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200"
                      >
                        <PlusCircle className="h-4 w-4 mr-2" /> Adicionar Insumo de Embalagem
                      </button>
                      <div className="mt-2">
                        {selectedPackagingInsumos[pedidoId]?.map(({ insumo, quantidade }) => (
                          <div key={insumo.id} className="text-sm">{insumo.nome}: {quantidade}</div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4">
                      <label htmlFor={`packaging-time-${pedidoId}`} className="block text-sm font-medium text-gray-700">
                        Tempo de Embalagem (minutos)
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          id={`packaging-time-${pedidoId}`}
                          value={packagingTime[pedidoId] || ''}
                          onChange={(e) => setPackagingTime({ ...packagingTime, [pedidoId]: Number(e.target.value) })}
                          className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                        <button
                          onClick={() => handleLaunchPackagingTime(pedidoId)}
                          className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                        >
                          Lançar Tempo
                        </button>
                      </div>
                    </div>
                    {!canConcludePackaging && <p className="text-xs text-center text-red-600 mt-2">Finalização bloqueada: Produtos finais insuficientes.</p>}
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
            // We need to ensure excessPartData.pecaId is passed as the first argument
            // and partId as the second argument to handleSendToAssembly.
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
          onSelect={(insumo: Insumo, quantidade: number) => {
            const pedidoId = selectedPedidoForPackaging?.id ?? ''; // Add nullish coalescing
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
