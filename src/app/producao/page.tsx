"use client";

import React, { useState, useEffect } from 'react';
import { db, auth } from '../services/firebase'; // Import auth
import { collection, getDocs, doc, getDoc, updateDoc, query, where, Timestamp, addDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth'; // Import onAuthStateChanged
import { Hourglass, Package, CheckCircle, XCircle, Play, Pause, Spool, MapPin, Users, PlusCircle } from 'lucide-react';
import { Pedido, ProductionGroup, Peca, Modelo, Kit, Insumo, Parte, PosicaoEstoque, GrupoDeFilamento, PecaInsumo, GrupoImpressao, LancamentoInsumo, LancamentoProduto, PecaParte, ProductionGroupFilamento, ProductionGroupOutroInsumo, Historico, Configuracoes, DashboardMetrics, AlertaEstoque, Produto, Servico, LancamentoServico, ItemToDebit } from '../types';
import { LocalProduto, LocalInsumo, Recipiente } from '../types/mapaEstoque';
import { v4 as uuidv4 } from 'uuid';
import ProductionLaunchModal from '../components/ProductionLaunchModal';
import StockSelectionModal from '../components/StockSelectionModal';
import ProductionExcessStockModal from '../components/ProductionExcessStockModal'; // Import new modal
import InsumoSelectionModal from '../components/InsumoSelectionModal';
import ProductionSummaryTable, { SummaryItem } from '../components/ProductionSummaryTable';
import { AllProductsData } from '../services/stockVerificationService';
import { cleanObject } from '../utils/cleanObject';

export default function Producao() {
  type PedidoProduto = Pedido['produtos'][number];

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
    insumosProntos: boolean;
    partesProntas: boolean;
    status: ProductionGroup['status']; // Add status property
  }

  // Helper function to calculate the effective quantity of a parent product fulfilled by its components
  const calculateEffectiveQuantityFulfilledByComponents = (
    produto: PedidoProduto,
    allPecasData: Peca[],
    allModelsData: Modelo[],
    allKitsData: Kit[]
  ): number => {
    if (!produto.atendimentoEstoqueDetalhado) return 0;

    let minFulfilledRatio = 1; // Represents the minimum ratio of any component fulfilled

    if (produto.tipo === 'kit' && produto.atendimentoEstoqueDetalhado.modelosAtendidos) {
      const kitDetails = allKitsData.find(k => k.id === produto.produtoId);
      if (!kitDetails) return 0;

      for (const modelRef of kitDetails.modelos) {
        const modelAttended = produto.atendimentoEstoqueDetalhado.modelosAtendidos.find(m => m.modeloId === modelRef.modeloId);
        if (modelRef.quantidade > 0) {
          const ratio = (modelAttended?.quantidade || 0) / modelRef.quantidade;
          minFulfilledRatio = Math.min(minFulfilledRatio, ratio);
        } else {
          minFulfilledRatio = 0; // If a component is needed but its quantity is 0, it can't be fulfilled
        }
      }
    } else if (produto.tipo === 'modelo' && produto.atendimentoEstoqueDetalhado.pecasAtendidas) {
      const modeloDetails = allModelsData.find(m => m.id === produto.produtoId);
      if (!modeloDetails) return 0;

      for (const pecaRef of modeloDetails.pecas) {
        const pecaAttended = produto.atendimentoEstoqueDetalhado.pecasAtendidas.find(p => p.pecaId === pecaRef.pecaId);
        if (pecaRef.quantidade > 0) {
          const ratio = (pecaAttended?.quantidade || 0) / pecaRef.quantidade;
          minFulfilledRatio = Math.min(minFulfilledRatio, ratio);
        } else {
          minFulfilledRatio = 0;
        }
      }
    } else if (produto.tipo === 'peca' && produto.atendimentoEstoqueDetalhado.partesAtendidas) {
      const pecaDetails = allPecasData.find(p => p.id === produto.produtoId);
      if (!pecaDetails) return 0;

      // Collect all parts needed for this peca from its impression groups
      const allPartsNeededForPeca: { parteId: string; quantidade: number }[] = [];
      pecaDetails.gruposImpressao.forEach(gi => {
        gi.partes.forEach(parte => {
          const existing = allPartsNeededForPeca.find(p => p.parteId === parte.parteId);
          if (existing) {
            existing.quantidade += parte.quantidade;
          } else {
            allPartsNeededForPeca.push({ parteId: parte.parteId, quantidade: parte.quantidade });
          }
        });
      });

      for (const parteRef of allPartsNeededForPeca) {
        const parteAttended = produto.atendimentoEstoqueDetalhado.partesAtendidas.find(p => p.parteId === parteRef.parteId);
        if (parteRef.quantidade > 0) {
          const ratio = (parteAttended?.quantidade || 0) / parteRef.quantidade;
          minFulfilledRatio = Math.min(minFulfilledRatio, ratio);
        } else {
          minFulfilledRatio = 0;
        }
      }
    } else {
      return 0; // No components to fulfill
    }

    // Ensure minFulfilledRatio does not exceed the product's total quantity
    return Math.min(produto.quantidade, minFulfilledRatio * produto.quantidade);
  };

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [optimizedGroups, setOptimizedGroups] = useState<Map<string, OptimizedGroup>>(new Map());
  const [activeTab, setActiveTab] = useState<'visao_geral' | 'aguardando' | 'em_producao' | 'em_montagem_peca' | 'em_montagem_modelo' | 'processando_embalagem' | 'finalizados'>('visao_geral');
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
  const [selectedProductionGroup, setSelectedProductionGroup] = useState<OptimizedGroup | null>(null);
  const [isStockSelectionModalOpen, setIsStockSelectionModalOpen] = useState(false);
  const [isExcessModalOpen, setIsExcessModalOpen] = useState(false);
  const [excessPartData, setExcessPartData] = useState<{ id: string; nome: string; sku: string; quantidade: number; pecaTipo: Peca['tipoPeca'] } | null>(null);
  const [isPackagingInsumoModalOpen, setIsPackagingInsumoModalOpen] = useState(false);
  const [selectedPedidoForPackaging, setSelectedPedidoForPackaging] = useState<Pedido | null>(null);
  const [packagingTime, setPackagingTime] = useState<Record<string, number>>({});
  const [selectedPackagingInsumos, setSelectedPackagingInsumos] = useState<Record<string, { insumo: Insumo, quantidade: number }[]>>({});

  const [itemToDebit, setItemToDebit] = useState<ItemToDebit | null>(null); // Use the imported ItemToDebit
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [productionSummary, setProductionSummary] = useState<SummaryItem[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(true);


  type GetStockForProductType = (
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
) => { estoqueTotal: number; posicoesEstoque: PosicaoEstoque[] };


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
          // Initial fetch for all data, then let activeTab useEffect handle subsequent fetches
          fetchPedidosAndProductionGroups(insumos, pecas, partes, models, kits, filamentGroups, locaisProdutosData, locaisInsumosData, recipientesData);
          fetchAwaitingProductionGroups(insumos, pecas, partes, models, kits, filamentGroups, locaisProdutosData, locaisInsumosData, recipientesData);
        };
        initializeData();
      } else {
        setIsAuthenticated(false);
        setPedidos([]);
        setOptimizedGroups(new Map());
        setDisplayGroups([]);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadDataForTab = async () => {
      if (!isAuthenticated) return;

      const insumos = await fetchAllInsumos();
      const pecas = await fetchAvailablePecas();
      const partes = await fetchAvailablePartes();
      const models = await fetchAvailableModels();
      const kits = await fetchAvailableKits();
      const filamentGroups = await fetchAvailableFilamentGroups();
      const locaisProdutosData = await fetchLocaisProdutos();
      const locaisInsumosData = await fetchLocaisInsumos();
      const recipientesData = await fetchRecipientes();

      if (activeTab === 'aguardando') {
        fetchAwaitingProductionGroups(insumos, pecas, partes, models, kits, filamentGroups, locaisProdutosData, locaisInsumosData, recipientesData);
      } else if (activeTab === 'em_producao') {
        fetchInProductionOptimizedGroups(insumos, pecas, partes, models, kits, filamentGroups, locaisProdutosData, locaisInsumosData, recipientesData);
      } else {
        fetchPedidosAndProductionGroups(insumos, pecas, partes, models, kits, filamentGroups, locaisProdutosData, locaisInsumosData, recipientesData);
      }
    };
    loadDataForTab();
  }, [activeTab, isAuthenticated]); // Depend on activeTab and isAuthenticated

  const generateProductionGroupsForProduct = (
    produtoPedido: PedidoProduto,
    pedido: Pedido,
    allPecasData: Peca[],
    allModelsData: Modelo[],
    allKitsData: Kit[],
    allPartes: Parte[],
    allFilamentGroups: GrupoDeFilamento[],
    allInsumosData: Insumo[]
  ): ProductionGroup[] => {
    const generatedGroups: ProductionGroup[] = [];
    const { produtoId, tipo, quantidade, atendimentoEstoqueDetalhado } = produtoPedido;

    const quantidadeAtendida = atendimentoEstoqueDetalhado?.quantidadeProdutoAtendidaDiretamente || 0;
    const quantidadeAProduzir = quantidade - quantidadeAtendida;
    if (quantidadeAProduzir <= 0) {
      return []; // No production needed if fully fulfilled by stock
    }

    const allPrintGroupsNeeded: {
      grupo: GrupoImpressao;
      totalQuantity: number;
      sourceName: string;
      sourceType: 'peca';
      parentPecaId?: string;
      parentModeloId?: string;
      parentKitId?: string;
    }[] = [];

    if (tipo === 'peca') {
      const pecaDetails = allPecasData.find(p => p.id === produtoId);
      if (pecaDetails?.gruposImpressao) {
        pecaDetails.gruposImpressao.forEach(gi => {
          allPrintGroupsNeeded.push({
            grupo: gi,
            totalQuantity: quantidadeAProduzir,
            sourceName: pecaDetails.nome,
            sourceType: 'peca',
            parentPecaId: pecaDetails.id,
          });
        });
      }
    } else if (tipo === 'modelo') {
      const modeloDetails = allModelsData.find((m: Modelo) => m.id === produtoId);
      if (modeloDetails?.pecas) {
        for (const pecaRef of modeloDetails.pecas) {
          const pecaDetails = allPecasData.find(p => p.id === pecaRef.pecaId);
          if (pecaDetails?.gruposImpressao) {
            pecaDetails.gruposImpressao.forEach(gi => {
              allPrintGroupsNeeded.push({
                grupo: gi,
                totalQuantity: quantidadeAProduzir * pecaRef.quantidade,
                sourceName: pecaDetails.nome,
                sourceType: 'peca',
                parentPecaId: pecaDetails.id,
                parentModeloId: modeloDetails.id,
              });
            });
          }
        }
      }
    } else if (tipo === 'kit') {
      const kitDetails = allKitsData.find(k => k.id === produtoId);
      if (kitDetails?.modelos) {
        for (const modeloRef of kitDetails.modelos) {
          const modeloDetails = allModelsData.find((m: Modelo) => m.id === modeloRef.modeloId);
          if (modeloDetails?.pecas) {
            for (const pecaRef of modeloDetails.pecas) {
              const pecaDetails = allPecasData.find(p => p.id === pecaRef.pecaId);
              if (pecaDetails?.gruposImpressao) {
                pecaDetails.gruposImpressao.forEach(gi => {
                  allPrintGroupsNeeded.push({
                    grupo: gi,
                    totalQuantity: quantidadeAProduzir * modeloRef.quantidade * pecaRef.quantidade,
                    sourceName: pecaDetails.nome,
                    sourceType: 'peca',
                    parentPecaId: pecaDetails.id,
                    parentModeloId: modeloDetails.id,
                    parentKitId: kitDetails.id,
                  });
                });
              }
            }
          }
        }
      }
    }

    for (const { grupo, totalQuantity, sourceName, sourceType, parentPecaId, parentModeloId, parentKitId } of allPrintGroupsNeeded) {
      const limit = grupo.quantidadeMaxima || 1;
      let remainingQuantity = totalQuantity;

      while (remainingQuantity > 0) {
        const quantityForThisRun = Math.min(remainingQuantity, limit);
        const productionGroup: ProductionGroup = {
          id: uuidv4(),
          sourceId: parentPecaId!,
          sourceType: 'peca',
          sourceName: sourceName,
          parentPecaId: parentPecaId,
          parentModeloId: parentModeloId,
          parentKitId: parentKitId,
          corFilamento: allFilamentGroups.find(fg => fg.id === grupo.filamentos[0]?.grupoFilamentoId)?.cor || 'N/A',
          partesNoGrupo: grupo.partes.reduce((acc, parte) => {
            const parteDetails = allPartes.find(p => p.id === parte.parteId);
            acc[parte.parteId] = {
              nome: parteDetails?.nome || 'N/A',
              quantidade: parte.quantidade * quantityForThisRun,
              hasAssembly: parte.hasAssembly || false,
            };
            return acc;
          }, {} as { [parteId: string]: { nome: string; quantidade: number; hasAssembly?: boolean; } }),
          filamentosNecessarios: grupo.filamentos.map(f => ({
            ...f,
            id: f.grupoFilamentoId!,
            nome: allFilamentGroups.find(fg => fg.id === f.grupoFilamentoId)?.nome || 'Desconhecido',
            quantidade: f.quantidade * quantityForThisRun,
          })),
          outrosInsumosNecessarios: (grupo.outrosInsumos || []).map(i => ({
            ...i,
            id: i.insumoId!,
            nome: allInsumosData.find(ins => ins.id === i.insumoId)?.nome || 'Desconhecido',
            quantidade: i.quantidade * quantityForThisRun,
          })),
          tempoImpressaoGrupo: grupo.tempoImpressao * quantityForThisRun,
          consumoFilamentoGrupo: grupo.filamentos.reduce((acc, f) => acc + f.quantidade, 0) * quantityForThisRun,
          status: 'aguardando',
          quantidadeOriginalGrupo: totalQuantity,
          quantidadeProduzirGrupo: quantityForThisRun,
          quantidadeMaxima: grupo.quantidadeMaxima,
          pedidoId: pedido.id, // Add pedidoId for context
          pedidoNumero: pedido.numero, // Add pedidoNumero for context
          timestamp: serverTimestamp(), // Add timestamp
        };
        generatedGroups.push(productionGroup);
        remainingQuantity -= quantityForThisRun;
      }
    }
    return generatedGroups;
  };

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
      const pecasList = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, posicoesEstoque: data.posicoesEstoque || [], ...data } as Peca;
      });
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
      const partesList = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, posicoesEstoque: data.posicoesEstoque || [], ...data } as Parte;
      });
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
      const modelsList = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, posicoesEstoque: data.posicoesEstoque || [], ...data } as Modelo;
      });
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
      const kitsList = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, posicoesEstoque: data.posicoesEstoque || [], ...data } as Kit;
      });
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

  const fetchAwaitingProductionGroups = async (allInsumosData: Insumo[], pecasData: Peca[], partesData: Parte[], modelsData: Modelo[], kitsData: Kit[], filamentGroupsData: GrupoDeFilamento[], locaisProdutosData: LocalProduto[], locaisInsumosData: LocalInsumo[], recipientesData: Recipiente[]) => {
    try {
      const q = query(collection(db, 'gruposProducaoOtimizados'), where('status', '==', 'aguardando'));
      const querySnapshot = await getDocs(q);
      const rawAwaitingGroups: OptimizedGroup[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        // Explicitly construct the object to ensure 'id' is always a string from doc.id
        const group: OptimizedGroup = {
          id: String(doc.id), // Ensure id is always a string
          partesNoGrupo: data.partesNoGrupo || {},
          totalPartsQuantity: data.totalPartsQuantity || 0,
          aggregatedGroupCount: data.aggregatedGroupCount || 0,
          pedidosOrigem: data.pedidosOrigem || [],
          sourceName: data.sourceName || 'N/A',
          tempoImpressaoGrupo: data.tempoImpressaoGrupo || 0,
          corFilamento: data.corFilamento || 'N/A',
          filamentosNecessarios: data.filamentosNecessarios || [],
          outrosInsumosNecessarios: data.outrosInsumosNecessarios || [],
          insumosProntos: data.insumosProntos || false,
          partesProntas: data.partesProntas || false,
          status: data.status || 'aguardando',
        };
        return group;
      });

      // Enrich rawAwaitingGroups with stock information
      const enrichedGroups = rawAwaitingGroups.map(group => {
        // Ensure partesNoGrupo is initialized if it's missing from Firestore data
        const partesNoGrupo = group.partesNoGrupo || {};

        // Enrich partesNoGrupo with estoqueAtual and quantidadeNecessaria
        for (const parteId in partesNoGrupo) {
          const parteInfo = partesNoGrupo[parteId];
          const { estoqueTotal } = getStockForProduct(parteId, 'parte', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
          partesNoGrupo[parteId] = {
            ...parteInfo,
            estoqueAtual: estoqueTotal,
            quantidadeNecessaria: parteInfo.quantidade, // Assuming quantidade in partesNoGrupo is the necessary quantity
          };
        }

        // Enrich filamentosNecessarios with estoqueAtual and nome
        const filamentosNecessarios = group.filamentosNecessarios.map(filamento => {
          const { estoqueTotal } = getStockForProduct(filamento.id, 'insumo', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
          const filamentGroupDetails = filamentGroupsData.find(fg => fg.id === filamento.id);
          return {
            ...filamento,
            nome: filamentGroupDetails?.nome || filamento.nome || 'Desconhecido', // Ensure name is populated
            estoqueAtual: estoqueTotal,
            quantidadeNecessaria: filamento.quantidade, // Assuming quantidade in filamentosNecessarios is the necessary quantity
          };
        });

        // Enrich outrosInsumosNecessarios with estoqueAtual and nome
        const outrosInsumosNecessarios = (group.outrosInsumosNecessarios || []).map(insumo => {
          const { estoqueTotal } = getStockForProduct(insumo.id, 'insumo', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
          const insumoDetails = allInsumosData.find(i => i.id === insumo.id);
          return {
            ...insumo,
            nome: insumoDetails?.nome || insumo.nome || 'Desconhecido', // Ensure name is populated
            estoqueAtual: estoqueTotal,
            quantidadeNecessaria: insumo.quantidade, // Assuming quantity in outrosInsumosNecessarios is the necessary quantity
          };
        });

        // Recalculate insumosProntos and partesProntas based on enriched data
        let allPartsReady = true;
        for (const parteId in partesNoGrupo) {
          const parteInfo = partesNoGrupo[parteId];
          if ((parteInfo.estoqueAtual || 0) < (parteInfo.quantidadeNecessaria || 0)) {
            allPartsReady = false;
            break;
          }
        }

        let allInsumosReady = true;
        for (const filamento of filamentosNecessarios) {
          if ((filamento.estoqueAtual || 0) < (filamento.quantidadeNecessaria || 0)) {
            allInsumosReady = false;
            break;
          }
        }
        if (allInsumosReady) {
          for (const insumo of outrosInsumosNecessarios) {
            if ((insumo.estoqueAtual || 0) < (insumo.quantidadeNecessaria || 0)) {
              allInsumosReady = false;
              break;
            }
          }
        }

        return {
          ...group,
          partesNoGrupo,
          filamentosNecessarios,
          outrosInsumosNecessarios,
          partesProntas: allPartsReady,
          insumosProntos: allInsumosReady,
        };
      });

      const optimizedMap = new Map<string, OptimizedGroup>();
      enrichedGroups.forEach(group => optimizedMap.set(group.id, group));
      setOptimizedGroups(optimizedMap);
    } catch (error) {
      console.error("Error fetching awaiting production groups: ", error);
    }
  };

  const enrichPosicoesEstoque = (
    positions: PosicaoEstoque[] | undefined,
    type: 'produto' | 'insumo',
    allLocaisProdutosData: LocalProduto[],
    allLocaisInsumosData: LocalInsumo[],
    allRecipientesData: Recipiente[]
  ): PosicaoEstoque[] => {
    if (!positions) return [];
    return positions.map(pos => {
      const recipiente = allRecipientesData.find(r => r.id === pos.recipienteId);
      if (!recipiente) {
        return pos; // Return original position if recipient not found
      }
      let local;
      if (type === 'produto') {
        local = allLocaisProdutosData.find(l => l.id === recipiente.localEstoqueId);
      } else {
        local = allLocaisInsumosData.find(l => l.id === recipiente.localEstoqueId);
      }
      if (!local) {
      }
      return {
        ...pos,
        localId: recipiente.localEstoqueId,
        localNome: local?.nome || 'N/A',
        posicaoNaGrade: recipiente.posicaoNaGrade
      };
    });
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
    
    const calculateStockFromPositions = (positions: PosicaoEstoque[]): number => {
        if (!positions) return 0; // Should not happen with new initialization, but for safety
        return positions.reduce((acc, pos) => acc + (pos.quantidade || 0), 0);
    };

    let product: any = null;

    if (productType === 'parte') {
      product = allPartesData.find(p => p.id === productId);
      if (product) {
        posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque || [], 'produto', allLocaisProdutosData, allLocaisInsumosData, allRecipientesData);
        estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(posicoesEstoque);
      }
    } else if (productType === 'insumo') {
      const filamentGroup = allFilamentGroupsData.find(fg => fg.id === productId);
      if (filamentGroup) {
        estoqueTotal = filamentGroup.estoqueTotalGramas ?? 0;
        posicoesEstoque = []; // Filament groups don't have detailed positions in this context
      } else {
        const insumo = allInsumosData.find(i => i.id === productId);
        if (insumo) {
          posicoesEstoque = enrichPosicoesEstoque(insumo.posicoesEstoque || [], 'insumo', allLocaisProdutosData, allLocaisInsumosData, allRecipientesData);
          estoqueTotal = (insumo as any).estoqueAtual ?? insumo.estoqueTotal ?? calculateStockFromPositions(posicoesEstoque);
        }
      }
    } else if (productType === 'peca') {
      product = allPecasData.find(p => p.id === productId);
      if (product) {
        posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque || [], 'produto', allLocaisProdutosData, allLocaisInsumosData, allRecipientesData);
        estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(posicoesEstoque);
      }
    } else if (productType === 'modelo') {
      product = allModelsData.find(m => m.id === productId);
      if (product) {
        posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque || [], 'produto', allLocaisProdutosData, allLocaisInsumosData, allRecipientesData);
        estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(posicoesEstoque);
      }
    } else if (productType === 'kit') {
      product = allKitsData.find(k => k.id === productId);
      if (product) {
        posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque || [], 'produto', allLocaisProdutosData, allLocaisInsumosData, allRecipientesData);
        estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(posicoesEstoque);
      }
    }

    return { estoqueTotal, posicoesEstoque };
  };


  type StockStatus = 'full_stock' | 'partial_stock' | 'no_stock';

  const getGroupStockStatus = (group: ProductionGroup): StockStatus => {
    let hasAnyZeroStock = false;
    let hasAnyInsufficientStock = false;

    for (const parteId in group.partesNoGrupo) {
      const parteInfo = group.partesNoGrupo[parteId];
      const currentStock = parteInfo.estoqueAtual ?? 0;
      if (currentStock < (parteInfo.quantidadeNecessaria ?? 0)) {
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

  const updateOriginalProductionGroupStatuses = async (optimizedGroup: OptimizedGroup) => {
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
              if (groupIdsToUpdate.includes(group.id)) {
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
    refetchAllData();
  };

  const handleStartOptimizedProduction = async (group: OptimizedGroup) => {
    try {
        const optimizedGroupRef = doc(db, 'gruposProducaoOtimizados', group.id);
        await updateDoc(optimizedGroupRef, {
            status: 'em_producao',
            startedAt: Timestamp.now(),
        });

        // Propagate status to original production groups in pedidos
        await updateOriginalProductionGroupStatuses(group);

        alert("Produção iniciada com sucesso! O status será atualizado em breve.");
        await refetchAllData(); // Refresh data after successful launch

    } catch (error) {
        console.error("Erro ao iniciar produção otimizada: ", error);
        alert("Ocorreu um erro ao iniciar a produção. Verifique o console para mais detalhes.");
    }
  };

  const handleStockSelection = async (debits: { selectedPosition: PosicaoEstoque; quantityToDebit: number }[]) => {
    if (!itemToDebit) return;

    const { id, nome, type } = itemToDebit;
    let totalDebited = 0;

    // As per the request, this will only handle product stock debits (parte, peca, modelo, kit).
    // Insumos are explicitly excluded from this operation.
    if (!['parte', 'peca', 'modelo', 'kit'].includes(type)) {
      alert(`O tipo de item '${type}' não é um produto válido para lançamento de estoque nesta operação.`);
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
                recipienteId: debit.selectedPosition.recipienteId,
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
      
      alert(`Lançamento de saída de estoque para ${nome} criado com sucesso! Quantidade: ${totalDebited}`);
      setIsStockSelectionModalOpen(false);
      setItemToDebit(null);
      await refetchAllData(); // Refresh data after successful debit

    } catch (error) {
      console.error("Error during manual stock debit from summary: ", error);
      alert("Ocorreu um erro ao criar o lançamento de estoque. Verifique o console para mais detalhes.");
      setIsStockSelectionModalOpen(false);
      setItemToDebit(null);
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
    // Re-evaluate which fetch function to call based on the current activeTab
    if (activeTab === 'aguardando') {
      fetchAwaitingProductionGroups(insumos, pecas, partes, models, kits, filamentGroups, locaisProdutosData, locaisInsumosData, recipientesData);
    } else if (activeTab === 'em_producao') {
      fetchInProductionOptimizedGroups(insumos, pecas, partes, models, kits, filamentGroups, locaisProdutosData, locaisInsumosData, recipientesData);
    } else {
      fetchPedidosAndProductionGroups(insumos, pecas, partes, models, kits, filamentGroups, locaisProdutosData, locaisInsumosData, recipientesData);
    }
  };

  const fetchInProductionOptimizedGroups = async (allInsumosData: Insumo[], pecasData: Peca[], partesData: Parte[], modelsData: Modelo[], kitsData: Kit[], filamentGroupsData: GrupoDeFilamento[], locaisProdutosData: LocalProduto[], locaisInsumosData: LocalInsumo[], recipientesData: Recipiente[]) => {
    try {
      const q = query(collection(db, 'gruposProducaoOtimizados'), where('status', '==', 'em_producao'));
      const querySnapshot = await getDocs(q);
      const rawInProductionGroups: OptimizedGroup[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        // Explicitly construct the object to ensure 'id' is always a string from doc.id
        const group: OptimizedGroup = {
          id: String(doc.id), // Ensure id is always a string
          partesNoGrupo: data.partesNoGrupo || {},
          totalPartsQuantity: data.totalPartsQuantity || 0,
          aggregatedGroupCount: data.aggregatedGroupCount || 0,
          pedidosOrigem: data.pedidosOrigem || [],
          sourceName: data.sourceName || 'N/A',
          tempoImpressaoGrupo: data.tempoImpressaoGrupo || 0,
          corFilamento: data.corFilamento,
          filamentosNecessarios: data.filamentosNecessarios || [],
          outrosInsumosNecessarios: data.outrosInsumosNecessarios || [],
          insumosProntos: data.insumosProntos || false,
          partesProntas: data.partesProntas || false,
          status: data.status || 'em_producao', // Default status for in-production groups
        };
        return group;
      });

      const enrichedGroups = rawInProductionGroups.map(group => {
        // Ensure partesNoGrupo is initialized if it's missing from Firestore data
        const partesNoGrupo = group.partesNoGrupo || {};

        // Enrich partesNoGrupo with estoqueAtual and quantidadeNecessaria
        for (const parteId in partesNoGrupo) {
          const parteInfo = partesNoGrupo[parteId];
          const { estoqueTotal } = getStockForProduct(parteId, 'parte', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
          partesNoGrupo[parteId] = {
            ...parteInfo,
            estoqueAtual: estoqueTotal,
            quantidadeNecessaria: parteInfo.quantidade, // Assuming quantidade in partesNoGrupo is the necessary quantity
          };
        }

        // Enrich filamentosNecessarios with estoqueAtual
        const filamentosNecessarios = group.filamentosNecessarios.map(filamento => {
          const { estoqueTotal } = getStockForProduct(filamento.id, 'insumo', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
          return {
            ...filamento,
            estoqueAtual: estoqueTotal,
            quantidadeNecessaria: filamento.quantidade, // Assuming quantidade in filamentosNecessarios is the necessary quantity
          };
        });

        // Enrich outrosInsumosNecessarios with estoqueAtual and nome
        const outrosInsumosNecessarios = (group.outrosInsumosNecessarios || []).map(insumo => {
          const { estoqueTotal } = getStockForProduct(insumo.id, 'insumo', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
          const insumoDetails = allInsumosData.find(i => i.id === insumo.id);
          return {
            ...insumo,
            nome: insumoDetails?.nome || insumo.nome || 'Desconhecido', // Ensure name is populated
            estoqueAtual: estoqueTotal,
            quantidadeNecessaria: insumo.quantidade, // Assuming quantity in outrosInsumosNecessarios is the necessary quantity
          };
        });

        // Recalculate insumosProntos and partesProntas based on enriched data
        let allPartsReady = true;
        for (const parteId in partesNoGrupo) {
          const parteInfo = partesNoGrupo[parteId];
          if ((parteInfo.estoqueAtual || 0) < (parteInfo.quantidadeNecessaria || 0)) {
            allPartsReady = false;
            break;
          }
        }

        let allInsumosReady = true;
        for (const filamento of filamentosNecessarios) {
          if ((filamento.estoqueAtual || 0) < (filamento.quantidadeNecessaria || 0)) {
            allInsumosReady = false;
            break;
          }
        }
        if (allInsumosReady) {
          for (const insumo of outrosInsumosNecessarios) {
            if ((insumo.estoqueAtual || 0) < (insumo.quantidadeNecessaria || 0)) {
              allInsumosReady = false;
              break;
            }
          }
        }

        return {
          ...group,
          partesNoGrupo,
          filamentosNecessarios,
          outrosInsumosNecessarios,
          partesProntas: allPartsReady,
          insumosProntos: allInsumosReady,
        };
      });

      setOptimizedGroups(prev => {
        const updatedMap = new Map(prev);
        enrichedGroups.forEach((value, key) => updatedMap.set(key, value));
        return updatedMap;
      });
    } catch (error) {
      console.error("Error fetching in production optimized groups: ", error);
    }
  };

  const fetchPedidosAndProductionGroups = async (allInsumosData: Insumo[], pecasData: Peca[], partesData: Parte[], modelsData: Modelo[], kitsData: Kit[], filamentGroupsData: GrupoDeFilamento[], locaisProdutosData: LocalProduto[], locaisInsumosData: LocalInsumo[], recipientesData: Recipiente[]) => {
    try {
      const [pedidosSnapshot] = await Promise.all([
        getDocs(collection(db, 'pedidos')),
      ]);

      const pedidosList: Pedido[] = [];
      const batch = writeBatch(db);
      let batchHasWrites = false;
  
      for (const docSnap of pedidosSnapshot.docs) {
        const pedidoData = docSnap.data();
        const pedido: Pedido = {
          id: docSnap.id,
          numero: String(pedidoData.numero || 'N/A'),
          comprador: pedidoData.comprador,
          produtos: pedidoData.produtos || [],
          status: pedidoData.status,
          custos: pedidoData.custos,
          tempos: pedidoData.tempos,
          dataCriacao: pedidoData.dataCriacao,
          dataPrevisao: pedidoData.dataPrevisao,
          dataConclusao: pedidoData.dataConclusao || null,
        };
  
        let pedidoNeedsUpdate = false;
        const updatedProdutos = [...pedido.produtos];
  
        for (let i = 0; i < updatedProdutos.length; i++) {
          const produto = updatedProdutos[i];
          if (!produto.gruposImpressaoProducao) {
            const newGroups = generateProductionGroupsForProduct(
              produto,
              pedido,
              pecasData,
              modelsData,
              kitsData,
              partesData,
              filamentGroupsData,
              allInsumosData
            );
            produto.gruposImpressaoProducao = newGroups;
            pedidoNeedsUpdate = true;
          }
        }
  
        if (pedidoNeedsUpdate) {
          const pedidoRef = doc(db, 'pedidos', pedido.id);
          batch.update(pedidoRef, { produtos: cleanObject(updatedProdutos) });
          batchHasWrites = true;
        }
  
        // Enrich the groups with stock info and update status from optimizedGroupsMap for UI display
        // Note: optimizedGroupsMap is not available here, as it's specific to awaiting groups.
        // This part of the logic might need re-evaluation if status updates are expected from here.
        pedido.produtos.forEach(produto => {
          if (produto.gruposImpressaoProducao) {
            produto.gruposImpressaoProducao = produto.gruposImpressaoProducao.map(group => {
              // For other tabs, we rely on the status stored within the pedido document itself
              // or fetch the specific production group if needed for real-time status.
              // For now, we'll assume the status in the pedido is sufficient for display.
              const updatedPartesNoGrupo = { ...group.partesNoGrupo };
              for (const parteId in updatedPartesNoGrupo) {
                const parteInfo = updatedPartesNoGrupo[parteId];
                const { estoqueTotal, posicoesEstoque } = getStockForProduct(parteId, 'parte', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
                updatedPartesNoGrupo[parteId] = {
                  ...parteInfo,
                  estoqueAtual: estoqueTotal,
                  localEstoqueItem: posicoesEstoque,
                };
              }

              const updatedFilamentosNecessarios = group.filamentosNecessarios.map(filamento => {
                const { estoqueTotal, posicoesEstoque } = getStockForProduct(filamento.id, 'insumo', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
                return {
                  ...filamento,
                  estoqueAtualFilamento: estoqueTotal,
                  localEstoqueFilamento: posicoesEstoque,
                };
              });

              const updatedOutrosInsumosNecessarios = (group.outrosInsumosNecessarios || []).map(insumo => {
                const { estoqueTotal, posicoesEstoque } = getStockForProduct(insumo.id, 'insumo', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
                return {
                  ...insumo,
                  estoqueAtualInsumo: estoqueTotal,
                  localEstoqueInsumo: posicoesEstoque,
                };
              });

              return {
                ...group,
                partesNoGrupo: updatedPartesNoGrupo,
                filamentosNecessarios: updatedFilamentosNecessarios,
                outrosInsumosNecessarios: updatedOutrosInsumosNecessarios,
              };
            });
          }
        });
  
        pedidosList.push(pedido);
      }
  
      if (batchHasWrites) {
        await batch.commit();
        // Re-fetch data after updates to ensure consistency
        refetchAllData();
      } else {
        setPedidos(pedidosList);
        // Generate summary after setting pedidos if no writes were made
        generateProductionSummary(pedidosList, {
          pecas: pecasData,
          partes: partesData,
          modelos: modelsData,
          kits: kitsData,
          insumos: allInsumosData,
          filamentGroups: filamentGroupsData,
          locaisProdutos: locaisProdutosData,
          locaisInsumos: locaisInsumosData,
          recipientes: recipientesData
        });
      }
    } catch (error) {
      console.error("Error fetching pedidos: ", error);
    }
  };


  const updateProductionGroupStatus = async (pedidoId: string, groupId: string, newStatus: ProductionGroup['status']) => {
    try {
        // Find the OptimizedGroup that contains this original groupId
        let targetOptimizedGroup: OptimizedGroup | undefined;
        for (const og of Array.from(optimizedGroups.values())) {
            if (og.pedidosOrigem.some(origem => origem.groupId === groupId)) {
                targetOptimizedGroup = og;
                break;
            }
        }

        if (!targetOptimizedGroup) {
            console.error("OptimizedGroup not found for original groupId:", groupId);
            return;
        }

        const optimizedGroupRef = doc(db, 'gruposProducaoOtimizados', targetOptimizedGroup.id);
        await updateDoc(optimizedGroupRef, {
            status: newStatus,
            startedAt: newStatus === 'em_producao' ? Timestamp.now() : null,
            completedAt: newStatus === 'produzido' ? Timestamp.now() : null,
        });

        // Propagate status to original production groups in pedidos
        await updateOriginalProductionGroupStatuses(targetOptimizedGroup);

        refetchAllData(); // Refresh data after successful update
    } catch (error) {
        console.error("Error updating production group status: ", error);
    }
  };

  const revertProductionGroupStatus = async (pedidoId: string, groupId: string, currentStatus: ProductionGroup['status']) => {
    let newStatus: ProductionGroup['status'];

    if (currentStatus === 'produzido') {
      newStatus = 'em_producao';
    } else if (currentStatus === 'em_producao') {
      newStatus = 'aguardando';
    } else {
      console.warn(`Cannot revert status from ${currentStatus}.`);
      return;
    }

    try {
        // Find the OptimizedGroup that contains this original groupId
        let targetOptimizedGroup: OptimizedGroup | undefined;
        for (const og of Array.from(optimizedGroups.values())) {
            if (og.pedidosOrigem.some(origem => origem.groupId === groupId)) {
                targetOptimizedGroup = og;
                break;
            }
        }

        if (!targetOptimizedGroup) {
            console.error("OptimizedGroup not found for original groupId:", groupId);
            return;
        }

        const optimizedGroupRef = doc(db, 'gruposProducaoOtimizados', targetOptimizedGroup.id);
        await updateDoc(optimizedGroupRef, {
            status: newStatus,
            startedAt: newStatus === 'em_producao' ? Timestamp.now() : null,
            completedAt: null,
        });

        // Propagate status to original production groups in pedidos
        await updateOriginalProductionGroupStatuses(targetOptimizedGroup);

        refetchAllData(); // Refresh data after successful update
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

  const handleOpenLaunchModal = (group: OptimizedGroup) => {
    setSelectedProductionGroup(group);
    setIsLaunchModalOpen(true);
  };

  const handleCloseLaunchModal = () => {
    setIsLaunchModalOpen(false);
    setSelectedProductionGroup(null);
  };

  const handleLaunchSuccess = async () => {
    if (selectedProductionGroup) {
      // This needs to be updated to work with OptimizedGroup
      // For now, it's a placeholder. The modal itself needs refactoring.
      // await updateProductionGroupStatus(selectedProductionGroup.pedidoId, selectedProductionGroup.id, 'produzido');
    }
    await refetchAllData();
    handleCloseLaunchModal();
  };

  const handleUseStock = async (item: SummaryItem) => {
    setIsSummaryLoading(true); // Show loading while fetching stock positions
    let itemToDebitData: ItemToDebit | null = null;
    let productDetails: any = null;
    let posicoesEstoque = [];
    let estoqueTotal = 0;

    // Fetch detailed stock positions for the selected item, checking both id and sku
    if (item.tipo === 'parte') {
      productDetails = availablePartes.find(p => p.id === item.sku || p.sku === item.sku);
    } else if (item.tipo === 'peca') {
      productDetails = availablePecas.find(p => p.id === item.sku || p.sku === item.sku);
    } else if (item.tipo === 'modelo') {
      productDetails = availableModels.find(m => m.id === item.sku || m.sku === item.sku);
    } else if (item.tipo === 'kit') {
      productDetails = availableKits.find(k => k.id === item.sku || k.sku === item.sku);
    } else if (item.tipo === 'insumo') { // Assuming insumo type might also appear in summary
      productDetails = allInsumos.find(i => i.id === item.sku);
    }

    if (productDetails) {
      const stockInfo = getStockForProduct(
        productDetails.id, // Use the definitive product ID for fetching stock
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
      posicoesEstoque = stockInfo.posicoesEstoque;
      estoqueTotal = stockInfo.estoqueTotal;

      itemToDebitData = {
        id: productDetails.id, // Ensure the debit operation uses the correct document ID
        nome: item.produtoNome,
        quantidadePedido: item.necessario,
        estoqueAtualItem: estoqueTotal,
        localEstoqueItem: posicoesEstoque,
        type: item.tipo,
      };
      setItemToDebit(itemToDebitData);
      setIsStockSelectionModalOpen(true);
    } else {
      alert("Detalhes do produto não encontrados para lançamento de estoque.");
    }
    setIsSummaryLoading(false);
  };

  const handleConcluirImpressao = async (group: OptimizedGroup) => {
    const batch = writeBatch(db);
    const optimizedGroupRef = doc(db, 'gruposProducaoOtimizados', group.id);

    try {
        // Debit filamentos
        for (const filamento of group.filamentosNecessarios) {
            if (filamento.quantidade > 0) {
                const lancamentoInsumoRef = doc(collection(db, 'lancamentosInsumos'));
                batch.set(lancamentoInsumoRef, cleanObject({
                    id: uuidv4(),
                    insumoId: filamento.id,
                    tipoInsumo: 'filamento',
                    tipoMovimento: 'saida',
                    quantidade: filamento.quantidade,
                    unidadeMedida: 'gramas',
                    data: Timestamp.now(),
                    detalhes: `Consumo para grupo de impressão otimizado: ${group.sourceName} (ID: ${group.id})`,
                    locais: filamento.localEstoqueFilamento || [], // Assuming this property exists on OptimizedFilamentItem
                }));
            }
        }

        // Debit other insumos (if applicable for 'impressao' stage)
        for (const insumo of (group.outrosInsumosNecessarios || [])) {
            if (insumo.quantidade > 0 && insumo.etapaInstalacao === 'impressao') {
                const lancamentoInsumoRef = doc(collection(db, 'lancamentosInsumos'));
                batch.set(lancamentoInsumoRef, cleanObject({
                    id: uuidv4(),
                    insumoId: insumo.id,
                    tipoInsumo: insumo.tipo as 'material' | 'outros',
                    tipoMovimento: 'saida',
                    quantidade: insumo.quantidade,
                    unidadeMedida: insumo.tipo === 'tempo' ? 'horas' : 'unidades',
                    data: Timestamp.now(),
                    detalhes: `Consumo para grupo de impressão otimizado: ${group.sourceName} (ID: ${group.id})`,
                    locais: insumo.localEstoqueInsumo || [], // Assuming this property exists on OptimizedInsumoItem
                }));
            }
        }

        // Launch service time (assuming 'impressao_3d' is a service for the whole optimized group)
        const lancamentoServicoRef = doc(collection(db, 'lancamentoServicos'));
        batch.set(lancamentoServicoRef, cleanObject({
            servicoId: 'impressao_3d',
            optimizedGroupId: String(group.id), // Link to the optimized group
            quantidade: group.tempoImpressaoGrupo / 60,
            data: Timestamp.now(),
            usuario: auth.currentUser?.displayName || 'Sistema',
        }));

        // Update the status of the OptimizedGroup in its collection
        batch.update(optimizedGroupRef, {
            status: 'produzido',
            completedAt: Timestamp.now(),
        });

        // Now, update the status of all original ProductionGroups linked to this OptimizedGroup
        // and their parent products in the 'pedidos' collection
        for (const origem of group.pedidosOrigem) {
            const pedidoRef = doc(db, 'pedidos', origem.pedidoId);
            const pedidoDoc = await getDoc(pedidoRef);
            if (!pedidoDoc.exists()) {
                console.warn(`Pedido ${origem.pedidoId} não encontrado para atualização.`);
                continue;
            }
            const pedidoData = pedidoDoc.data() as Pedido;
            let updatedProdutos = pedidoData.produtos.map(produto => {
                if (produto.gruposImpressaoProducao) {
                    const updatedGruposImpressaoProducao = produto.gruposImpressaoProducao.map(originalGroup => {
                        if (originalGroup.id === origem.groupId) {
                            return {
                                ...originalGroup,
                                status: 'produzido', // Mark original group as produced
                                completedAt: Timestamp.now(),
                            };
                        }
                        return originalGroup;
                    });
                    return { ...produto, gruposImpressaoProducao: updatedGruposImpressaoProducao };
                }
                return produto;
            });

            // After updating all relevant groups within a product, check if the product itself is ready
            updatedProdutos = updatedProdutos.map(produto => {
                if (produto.gruposImpressaoProducao) {
                    const allGroupsProducedForThisProduct = produto.gruposImpressaoProducao.every(g => g.status === 'produzido');
                    if (allGroupsProducedForThisProduct) {
                        const peca = availablePecas.find(p => p.id === produto.produtoId);
                        const nextStatusForProduct = peca?.tipoPeca === 'composta_um_grupo_com_montagem' || peca?.tipoPeca === 'composta_multiplos_grupos'
                            ? 'em_montagem_pecas'
                            : 'pronto_para_embalagem';
                        return { ...produto, statusProducaoItem: nextStatusForProduct };
                    }
                }
                return produto;
            });

            // Update pedido status based on its products
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

        await batch.commit();
        alert("Impressão concluída com sucesso! O status será atualizado em breve.");
        refetchAllData();

    } catch (error) {
        console.error("Erro ao concluir impressão:", error);
        alert("Falha ao concluir a impressão. Verifique o console.");
    }
};

  const handleSendToAssembly = async (produtoPedidoId: string, parteId: string, quantidade: number) => {
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
        refetchAllData();
        alert("Excedente enviado para montagem com sucesso!");

    } catch (error) {
        console.error("Erro ao enviar excedente para montagem:", error);
        alert("Falha ao enviar excedente para montagem.");
    }
  };


  const getFilteredDisplayGroups = (pedidosList: Pedido[]): Pedido[] | ProductionGroup[] | OptimizedGroup[] => {
    if (activeTab === 'aguardando') {
      return Array.from(optimizedGroups.values()).filter(group => group.status === 'aguardando');
    } else if (activeTab === 'em_producao') {
      return Array.from(optimizedGroups.values()).filter(group => group.status === 'em_producao');
    } else if (activeTab === 'visao_geral') {
      return []; // Visão Geral uses ProductionSummaryTable directly
    } else if (activeTab === 'em_montagem_peca') {
      return pedidosList.filter(pedido =>
        pedido.produtos.some(produto =>
          produto.statusProducaoItem === 'em_montagem_pecas'
        )
      );
    } else if (activeTab === 'em_montagem_modelo') {
      return pedidosList.filter(pedido =>
        pedido.produtos.some(produto =>
          produto.statusProducaoItem === 'em_montagem_modelos'
        )
      );
    } else if (activeTab === 'processando_embalagem') {
      return pedidosList.filter(pedido =>
        pedido.produtos.some(produto =>
          produto.statusProducaoItem === 'pronto_para_embalagem'
        )
      );
    } else if (activeTab === 'finalizados') {
      return pedidosList.filter(pedido => pedido.status === 'concluido');
    }
    return [];
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


  const canConcludePedido = (pedido: Pedido): { canConclude: boolean; message: string | null } => {
    // Iterate over all products within the pedido
    for (const produto of pedido.produtos) {
      // Check if the product's status allows for conclusion
      if (produto.statusProducaoItem !== 'pronto_para_embalagem' && produto.statusProducaoItem !== 'concluido') {
        return { canConclude: false, message: `Produto "${produto.nomeProduto}" não está pronto para embalagem ou concluído.` };
      }
    }
    // If all products are ready for packaging or concluded, then the pedido can be concluded
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

  const generateProductionSummary = async (
    pedidos: Pedido[],
    allProducts: AllProductsData
  ) => {
    setIsSummaryLoading(true);
    const summaryMap = new Map<string, SummaryItem>();

    // Helper to initialize an item in the summary map
    const initSummaryItem = (product: Parte | Peca | Modelo | Kit, tipo: SummaryItem['tipo']): SummaryItem => {
      const sku = product.sku || product.id;
      if (!summaryMap.has(sku)) {
        const { estoqueTotal } = getStockForProduct(
          product.id, tipo, allProducts.pecas, allProducts.partes, allProducts.insumos,
          allProducts.modelos, allProducts.kits, allProducts.filamentGroups,
          allProducts.locaisProdutos, allProducts.locaisInsumos, allProducts.recipientes
        );
        summaryMap.set(sku, {
          sku, produtoNome: product.nome, tipo, emEstoque: estoqueTotal,
          necessario: 0, aguardando: 0, emProducao: 0, emMontagemPeca: 0,
          emMontagemModelo: 0, processandoEmbalagem: 0, finalizado: 0,
        });
      }
      return summaryMap.get(sku)!;
    };

    // 1. Deconstruct all orders into a flat list of required items at all levels
    const allRequiredItems = new Map<string, { product: Parte | Peca | Modelo | Kit; tipo: SummaryItem['tipo']; totalNeeded: number }>();

    function deconstruct(productId: string, tipo: SummaryItem['tipo'], quantity: number) {
      const key = `${productId}-${tipo}`;
      
      let product;
      if (tipo === 'kit') product = allProducts.kits.find(p => p.id === productId);
      else if (tipo === 'modelo') product = allProducts.modelos.find(p => p.id === productId);
      else if (tipo === 'peca') product = allProducts.pecas.find(p => p.id === productId);
      else product = allProducts.partes.find(p => p.id === productId);

      if (!product) return;

      const existing = allRequiredItems.get(key) || { product, tipo, totalNeeded: 0 };
      existing.totalNeeded += quantity;
      allRequiredItems.set(key, existing);

      // Recursively deconstruct components
      if (tipo === 'kit') (product as Kit).modelos?.forEach(m => deconstruct(m.modeloId, 'modelo', quantity * m.quantidade));
      if (tipo === 'modelo') (product as Modelo).pecas?.forEach(p => deconstruct(p.pecaId, 'peca', quantity * p.quantidade));
      if (tipo === 'peca') (product as Peca).gruposImpressao?.forEach(g => g.partes.forEach(pt => deconstruct(pt.parteId, 'parte', quantity * pt.quantidade)));
    }

    pedidos.filter(p => p.status !== 'concluido' && p.status !== ('cancelado' as any)).forEach(p => {
      p.produtos.forEach(prod => {
        const neededQty = prod.quantidade - (prod.atendimentoEstoqueDetalhado?.quantidadeProdutoAtendidaDiretamente || 0);
        if (neededQty > 0) {
          deconstruct(prod.produtoId, prod.tipo, neededQty);
        }
      });
    });

    // Initialize all required items in the summary map
    allRequiredItems.forEach(({ product, tipo, totalNeeded }) => {
      if(product) {
        const summaryItem = initSummaryItem(product, tipo);
        summaryItem.necessario = totalNeeded;
      }
    });

    // 2. Calculate status for Partes (base of the hierarchy)
    allRequiredItems.forEach(({ product, tipo }) => {
      if (tipo === 'parte' && product) {
        const summaryItem = summaryMap.get(product.sku || product.id)!;
        summaryItem.aguardando = 0;
        summaryItem.emProducao = 0;
        summaryItem.finalizado = 0;
        
        pedidos.forEach(p => {
          if (p.status !== 'concluido' && p.status !== ('cancelado' as any)) {
            p.produtos.forEach(prod => {
              prod.gruposImpressaoProducao?.forEach(g => {
                // Check if the current part (product.id) exists in partesNoGrupo for this production group
                if (g.partesNoGrupo && g.partesNoGrupo[product.id]) {
                  const parteInfo = g.partesNoGrupo[product.id];
                  if (g.status === 'aguardando') {
                    summaryItem.aguardando += parteInfo.quantidade;
                  } else if (g.status === 'em_producao') {
                    summaryItem.emProducao += parteInfo.quantidade;
                  } else if (g.status === 'produzido') {
                    summaryItem.finalizado += parteInfo.quantidade;
                  }
                }
              });
            });
          }
        });
      }
    });

    // 3. Aggregate status up to Pecas
    allRequiredItems.forEach(({ product, tipo }) => {
      if (tipo === 'peca' && product) {
        const pecaSummary = summaryMap.get(product.sku || product.id)!;
        const peca = product as Peca;
        const partsNeeded = peca.gruposImpressao.flatMap(g => g.partes);
        if (partsNeeded.length === 0) {
          pecaSummary.finalizado = pecaSummary.necessario;
          return;
        }
        
        let totalAguardando = 0, totalEmProducao = 0, totalFinalizado = 0;

        partsNeeded.forEach(partRef => {
            const partDetails = allProducts.partes.find(p => p.id === partRef.parteId);
            if(partDetails) {
                const partSummary = summaryMap.get(partDetails.sku || partDetails.id);
                if(partSummary && partSummary.necessario > 0) {
                    const ratio = (pecaSummary.necessario * partRef.quantidade) / partSummary.necessario;
                    totalAguardando += (partSummary.aguardando / partSummary.necessario) * (pecaSummary.necessario * partRef.quantidade);
                    totalEmProducao += (partSummary.emProducao / partSummary.necessario) * (pecaSummary.necessario * partRef.quantidade);
                    totalFinalizado += (partSummary.finalizado / partSummary.necessario) * (pecaSummary.necessario * partRef.quantidade);
                }
            }
        });

        pecaSummary.aguardando = totalAguardando / partsNeeded.reduce((acc, p) => acc + p.quantidade, 0);
        pecaSummary.emProducao = totalEmProducao / partsNeeded.reduce((acc, p) => acc + p.quantidade, 0);
        pecaSummary.emMontagemPeca = totalFinalizado / partsNeeded.reduce((acc, p) => acc + p.quantidade, 0);
      }
    });
    
    // 4 & 5. Aggregate for Modelos and Kits (can be added here following the same pattern)

    setProductionSummary(Array.from(summaryMap.values()).filter(i => i.necessario > 0));
    setIsSummaryLoading(false);
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
              Array.from(optimizedGroups.values()).map((group: OptimizedGroup) => {
                console.log(`Group ID: ${group.id}, Pedidos Origem:`, group.pedidosOrigem, `Total Parts Quantity: ${group.totalPartsQuantity}`);
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
                    <h3 className="text-xl font-bold text-gray-900">Grupo de Impressão: {group.sourceName}</h3>
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
                    <button onClick={() => revertProductionGroupStatus(group.pedidosOrigem[0].pedidoId, group.id as string, 'em_producao')} className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700">
                      <XCircle className="h-3 w-3 mr-1" /> Reverter
                    </button>
                    <button onClick={() => updateProductionGroupStatus(group.pedidosOrigem[0].pedidoId, group.id as string, 'aguardando')} className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700">
                      <Pause className="h-3 w-3 mr-1" /> Pausar
                    </button>
                    <button onClick={() => handleConcluirImpressao(group)} className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700">
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
          <div className="space-y-6">
            {getFilteredDisplayGroups(pedidos).length > 0 ? (
              (getFilteredDisplayGroups(pedidos) as Pedido[]).map((pedido: Pedido) => (
                <div key={pedido.id} className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-xl font-bold text-gray-900">Pedido #{pedido.numero}</h3>
                  {pedido.produtos.filter((prod: Pedido['produtos'][number]) => prod.statusProducaoItem === 'em_montagem_pecas').map((produtoPedido: Pedido['produtos'][number]) => {
                      const peca = availablePecas.find(p => p.id === produtoPedido.produtoId);
                      const canConclude = peca?.gruposImpressao.flatMap(gi => gi.partes).every(parte => {
                          const disponivel = produtoPedido.atendimentoEstoqueDetalhado?.partesAtendidas?.find((pd: { parteId: string; quantidade: number; }) => pd.parteId === parte.parteId)?.quantidade || 0;
                          const necessaria = parte.quantidade * produtoPedido.quantidade;
                          return disponivel >= necessaria;
                      });
                      return (
                          <div key={produtoPedido.produtoId} className="border border-gray-200 rounded-lg p-3 mt-4 bg-gray-50">
                              <h5 className="text-md font-medium text-gray-800">Peça: {peca?.nome} (x{produtoPedido.quantidade})</h5>
                              <h6 className="text-sm font-semibold mt-2">Partes Necessárias:</h6>
                              <ul className="list-disc list-inside text-sm">
                                  {peca?.gruposImpressao.flatMap(gi => gi.partes).map(parte => {
                                      const disponivel = produtoPedido.atendimentoEstoqueDetalhado?.partesAtendidas?.find((pd: { parteId: string; quantidade: number; }) => pd.parteId === parte.parteId)?.quantidade || 0;
                                      const necessaria = parte.quantidade * produtoPedido.quantidade;
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
            {getFilteredDisplayGroups(pedidos).length > 0 ? (
              (getFilteredDisplayGroups(pedidos) as Pedido[]).map((pedido: Pedido) => (
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
                      {pedido.produtos.filter((prod: Pedido['produtos'][number]) => prod.statusProducaoItem === 'pronto_para_embalagem').map((produtoPedido: Pedido['produtos'][number]) => {
                        return <li key={produtoPedido.produtoId}>{produtoPedido.nomeProduto} (x{produtoPedido.quantidade})</li>;
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
          onSendToAssembly={() => handleSendToAssembly(excessPartData.id, excessPartData.id, excessPartData.quantidade)}
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
