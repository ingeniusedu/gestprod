"use client";

import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, getDocs, doc, getDoc, updateDoc, query, where, deleteField, Timestamp, addDoc } from 'firebase/firestore';
import { Hourglass, Package, CheckCircle, XCircle, Play, Pause, FastForward, Trash2, Spool, MapPin } from 'lucide-react';
import { Pedido, ProductionGroup, Peca, Modelo, Kit, Insumo, Parte, PosicaoEstoque, GrupoDeFilamento, PecaInsumo, GrupoImpressao, EstoqueLancamento } from '../types';
import { LocalDeEstoque, Recipiente } from '../types/mapaEstoque';
import { v4 as uuidv4 } from 'uuid';
import ProductionLaunchModal from '../components/ProductionLaunchModal';
import StockSelectionModal from '../components/StockSelectionModal'; // NEW IMPORT
import { cleanObject } from '../utils/cleanObject';

export default function Producao() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [activeTab, setActiveTab] = useState<'aguardando' | 'em_producao' | 'em_montagem' | 'montados'>('aguardando');
  const [filamentColors, setFilamentColors] = useState<Record<string, string>>({});
  const [displayGroups, setDisplayGroups] = useState<ProductionGroup[]>([]);
  const [availableFilaments, setAvailableFilaments] = useState<Insumo[]>([]);
  const [availablePecas, setAvailablePecas] = useState<Peca[]>([]); // Renamed from availableParts
  const [availablePartes, setAvailablePartes] = useState<Parte[]>([]); // New state for Parte[]
  const [availableModels, setAvailableModels] = useState<Modelo[]>([]);
  const [availableKits, setAvailableKits] = useState<Kit[]>([]);
  const [availableFilamentGroups, setAvailableFilamentGroups] = useState<GrupoDeFilamento[]>([]);
  const [locaisDeEstoque, setLocaisDeEstoque] = useState<LocalDeEstoque[]>([]); // New state for stock locations
  const [recipientes, setRecipientes] = useState<Recipiente[]>([]); // New state for recipients

  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [selectedProductionGroup, setSelectedProductionGroup] = useState<ProductionGroup | null>(null);
  const [isStockSelectionModalOpen, setIsStockSelectionModalOpen] = useState(false);
  const [itemToDebit, setItemToDebit] = useState<{ item: ProductionGroup['items'][0]; pedidoId: string; groupId: string } | null>(null);

  useEffect(() => {
    const initializeData = async () => {
      fetchFilamentColors();
      const filaments = await fetchAvailableFilaments();
      const pecas = await fetchAvailablePecas(); // Use new fetch
      const partes = await fetchAvailablePartes(); // Use new fetch
      const models = await fetchAvailableModels();
      const kits = await fetchAvailableKits();
      const filamentGroups = await fetchAvailableFilamentGroups();
      const locais = await fetchLocaisDeEstoque(); // Fetch locations
      const recipientesData = await fetchRecipientes(); // Fetch recipients
      fetchPedidos(filaments, pecas, partes, models, kits, filamentGroups, locais, recipientesData); // Pass all relevant data
    };
    initializeData();
  }, []);

  // New useEffect to derive displayGroups from pedidos
  useEffect(() => {
    const allGroups: ProductionGroup[] = [];
    pedidos.forEach(pedido => {
      if (pedido.productionGroups) {
        allGroups.push(...pedido.productionGroups);
      }
    });
    const sortedGroups = allGroups.sort((a, b) => {
      // Sort by pedidoNumero and then by sourceName for consistent display
      if (a.pedidoNumero !== b.pedidoNumero) {
        return a.pedidoNumero.localeCompare(b.pedidoNumero);
      }
      return a.sourceName.localeCompare(b.sourceName);
    });
    setDisplayGroups(sortedGroups);
  }, [pedidos]); // Dependency on pedidos

  const fetchFilamentColors = async () => {
    // This color map is copied from backend/src/app/estoque/page.jsx
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

  const fetchAvailableFilaments = async (): Promise<Insumo[]> => {
    try {
      const insumosCollection = collection(db, 'insumos');
      const insumoSnapshot = await getDocs(insumosCollection);
      const filamentsList = insumoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Insumo)).filter(i => i.tipo === 'filamento');
      setAvailableFilaments(filamentsList);
      return filamentsList;
    } catch (error) {
      console.error("Error fetching available filaments: ", error);
      return [];
    }
  };

  const fetchAvailablePecas = async (): Promise<Peca[]> => { // Renamed function
    try {
      const querySnapshot = await getDocs(collection(db, 'pecas'));
      const pecasList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Peca));
      setAvailablePecas(pecasList); // Set to availablePecas
      return pecasList;
    } catch (error) {
      console.error("Error fetching available pecas: ", error);
      return [];
    }
  };

  const fetchAvailablePartes = async (): Promise<Parte[]> => { // New function
    try {
      const querySnapshot = await getDocs(collection(db, 'partes'));
      const partesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Parte));
      setAvailablePartes(partesList); // Set to availablePartes
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
      setAvailableFilamentGroups(filamentGroupsList);
      return filamentGroupsList;
    } catch (error) {
      console.error("Error fetching available filament groups: ", error);
      return [];
    }
  };

  const fetchLocaisDeEstoque = async (): Promise<LocalDeEstoque[]> => {
    try {
      const querySnapshot = await getDocs(collection(db, 'locaisDeEstoque'));
      const locaisList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LocalDeEstoque));
      setLocaisDeEstoque(locaisList);
      return locaisList;
    } catch (error) {
      console.error("Error fetching stock locations: ", error);
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
    allFilamentsData: Insumo[],
    allModelsData: Modelo[],
    allKitsData: Kit[],
    allFilamentGroupsData: GrupoDeFilamento[],
    allLocaisData: LocalDeEstoque[],
    allRecipientesData: Recipiente[]
  ): { estoqueTotal: number; posicoesEstoque: PosicaoEstoque[] } => {
    let estoqueTotal = 0;
    let posicoesEstoque: PosicaoEstoque[] = [];
    
    const calculateStockFromPositions = (positions: PosicaoEstoque[] | undefined): number => {
        if (!positions) return 0;
        return positions.reduce((acc, pos) => acc + (pos.quantidade || 0), 0);
    };

    const enrichPosicoesEstoque = (positions: PosicaoEstoque[] | undefined): PosicaoEstoque[] => {
      if (!positions) return [];
      return positions.map(pos => {
        const recipiente = allRecipientesData.find(r => r.id === pos.recipienteId);
        if (!recipiente) return pos;
        const local = allLocaisData.find(l => l.id === recipiente.localEstoqueId);
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
        posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque);
      }
    } else if (productType === 'insumo') {
      const filamentGroup = allFilamentGroupsData.find(fg => fg.id === productId);
      if (filamentGroup) {
        estoqueTotal = filamentGroup.estoqueTotalGramas || 0;
        const relatedInsumos = allFilamentsData.filter(i => i.grupoFilamentoId === productId);
        let allPositions: PosicaoEstoque[] = [];
        relatedInsumos.forEach(insumo => {
          allPositions.push(...(insumo.posicoesEstoque || []));
        });
        posicoesEstoque = enrichPosicoesEstoque(allPositions);
      } else {
        const insumo = allFilamentsData.find(i => i.id === productId);
        if (insumo) {
          estoqueTotal = insumo.estoqueTotal ?? calculateStockFromPositions(insumo.posicoesEstoque);
          posicoesEstoque = enrichPosicoesEstoque(insumo.posicoesEstoque);
        }
      }
    } else if (productType === 'peca') {
      product = allPecasData.find(p => p.id === productId);
      if (product) {
        estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(product.posicoesEstoque);
        posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque);
      }
    } else if (productType === 'modelo') {
      product = allModelsData.find(m => m.id === productId);
      if (product) {
        estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(product.posicoesEstoque);
        posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque);
      }
    } else if (productType === 'kit') {
      product = allKitsData.find(k => k.id === productId);
      if (product) {
        estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(product.posicoesEstoque);
        posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque);
      }
    }

    return { estoqueTotal, posicoesEstoque };
  };

  const checkIfGroupHasEnoughStock = (group: ProductionGroup): boolean => {
    // For 'parte' items, we always allow using existing stock,
    // and the StockSelectionModal will handle quantity selection and warnings.
    // For other types, we still check if there's enough stock.
    if (group.items.some(item => item.tipoProduto === 'parte')) { // Assuming item.tipoProduto exists or can be inferred
      return true;
    }
    for (const item of group.items) {
      if ((item.estoqueAtualItem ?? 0) < item.quantidadePedido) {
        return false;
      }
    }
    return true;
  };

  const handleUseExistingStock = async (pedidoId: string, groupId: string) => {
    if (!window.confirm('Tem certeza que deseja usar o estoque existente para este grupo de produção?')) {
      return;
    }

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

      // Debit stock for each item in the group
      for (const item of groupToUpdate.items) {
        const parteRef = doc(db, 'partes', item.id);
        const parteSnap = await getDoc(parteRef);
        if (parteSnap.exists()) {
          const parteData = parteSnap.data() as Parte;
          let currentPosicoesEstoque = parteData.posicoesEstoque || [];
          let updatedPosicoesEstoque: PosicaoEstoque[] = [];
          let remainingToDebit = item.quantidadePedido;

          console.log(`[DEBUG] handleUseExistingStock for item ${item.nome}:`);
          console.log(`[DEBUG] Item ID: ${item.id}`);
          console.log(`[DEBUG] Quantity needed: ${item.quantidadePedido}`);
          console.log(`[DEBUG] Parte data from Firestore:`, parteData);
          console.log(`[DEBUG] Current posicoesEstoque from Firestore:`, currentPosicoesEstoque);

          // Calculate current total stock from positions for accurate check
          const currentTotalStock = currentPosicoesEstoque.reduce((sum, pos) => sum + pos.quantidade, 0);
          console.log(`[DEBUG] Calculated currentTotalStock from posicoesEstoque: ${currentTotalStock}`);


          // Check if the item is a 'parte' and has stock positions
          const availablePositions = item.localEstoqueItem || [];
          const totalAvailableStock = item.estoqueAtualItem ?? 0;

          if (totalAvailableStock < item.quantidadePedido) {
            alert(`Erro: Estoque insuficiente para ${item.nome}. Necessário: ${item.quantidadePedido}, Disponível: ${totalAvailableStock}.`);
            return; // Stop processing if stock is insufficient for any item
          }

          if (availablePositions.length === 1) {
            // Auto-debit from the single available location
            const singlePosition = availablePositions[0];
            if (singlePosition.quantidade < item.quantidadePedido) {
              alert(`Erro: A única posição de estoque para ${item.nome} (${singlePosition.quantidade}) não tem quantidade suficiente para o pedido (${item.quantidadePedido}).`);
              return;
            }

            const estoqueLancamento: EstoqueLancamento = {
              id: uuidv4(),
              tipoProduto: 'partes', // Changed to 'partes'
              produtoId: item.id,
              tipoMovimento: 'saida',
              usuario: 'Sistema de Produção', // Or actual user
              observacao: `Débito de estoque automático para Pedido #${pedidoId}, Grupo de Produção: ${groupId} (única localização)`,
              data: Timestamp.fromDate(new Date()), // Re-added data field
              locais: [ // Ensure 'locais' array is present
                {
                  recipienteId: singlePosition.recipienteId,
                  divisao: singlePosition.divisao,
                  quantidade: item.quantidadePedido, // Debit the full needed quantity
                  localId: singlePosition.localId || '', // Add localId
                }
              ]
            };
            await addDoc(collection(db, 'lancamentosEstoque'), cleanObject(estoqueLancamento));
            console.log(`[DEBUG] Auto-debited ${item.quantidadePedido} of ${item.nome} from single location.`);

          } else if (availablePositions.length > 1) {
            // Open selection modal for multiple locations
            setItemToDebit({ item, pedidoId, groupId });
            setIsStockSelectionModalOpen(true);
            return; // Wait for user selection via modal
          } else {
            // No stock positions found, although totalAvailableStock check should catch this first
            alert(`Erro: Nenhuma posição de estoque encontrada para ${item.nome}.`);
            return;
          }
        } else {
          console.error(`Item with ID ${item.id} and type ${item.tipoProduto} is not a 'parte' or not found in Firestore.`);
          // For non-'parte' items, or if parteSnap.exists() was false, we might need different handling
          // For now, we'll just log and continue, assuming the primary issue is with 'parte' items.
        }
      }

      // If the loop completes without opening the modal (meaning all 'parte' items were auto-debited or no 'parte' items),
      // then update the production group status and refetch data.
      const newStatus: ProductionGroup['status'] = groupToUpdate.items.some(item => item.hasAssembly) ? 'em_montagem' : 'produzido';
      await updateProductionGroupStatus(pedidoId, groupId, newStatus);
      await refetchAllData();

    } catch (error) {
      console.error("Error using existing stock: ", error);
      alert("Ocorreu um erro ao tentar usar o estoque existente. Verifique o console para mais detalhes.");
    }
  };

  // Modified handleStockSelection to accept an array of debits
  const handleStockSelection = async (debits: { selectedPosition: PosicaoEstoque; quantityToDebit: number }[]) => {
    if (!itemToDebit) return;

    const { item, pedidoId, groupId } = itemToDebit;
    let totalDebited = 0;

    try {
      for (const debit of debits) {
        if (debit.quantityToDebit > 0) {
            const estoqueLancamento: EstoqueLancamento = {
              id: uuidv4(),
              tipoProduto: 'partes', // Changed to 'partes'
              produtoId: item.id,
              tipoMovimento: 'saida',
              usuario: 'Sistema de Produção', // Or actual user
              observacao: `Débito de estoque manual para Pedido #${pedidoId}, Grupo de Produção: ${groupId} (múltiplas localizações)`,
              data: Timestamp.fromDate(new Date()), // Re-added data field
              locais: [
                {
                  recipienteId: debit.selectedPosition.recipienteId,
                  divisao: debit.selectedPosition.divisao,
                  quantidade: debit.quantityToDebit,
                  localId: debit.selectedPosition.localId || '', // Add localId
                }
              ]
            };
          await addDoc(collection(db, 'lancamentosEstoque'), cleanObject(estoqueLancamento));
          totalDebited += debit.quantityToDebit;
        }
      }

      // After successful debits, check if the total quantity needed for the item has been met
      // This logic assumes that the sum of debits from the modal should cover item.quantidadePedido
      // If not, the user might need to be alerted or the process re-initiated.
      // For now, we proceed with status update if any debit occurred.
      if (totalDebited >= item.quantidadePedido) {
        const pedidoToUpdate = pedidos.find(p => p.id === pedidoId);
        const groupToUpdate = pedidoToUpdate?.productionGroups?.find(g => g.id === groupId);
        if (groupToUpdate) {
          const newStatus: ProductionGroup['status'] = groupToUpdate.items.some(i => i.hasAssembly) ? 'em_montagem' : 'produzido';
          await updateProductionGroupStatus(pedidoId, groupId, newStatus);
        }
      } else {
        alert(`Atenção: A quantidade total debitada (${totalDebited}) é menor que a quantidade necessária (${item.quantidadePedido}).`);
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
    const filaments = await fetchAvailableFilaments();
    const pecas = await fetchAvailablePecas();
    const partes = await fetchAvailablePartes();
    const models = await fetchAvailableModels();
    const kits = await fetchAvailableKits();
    const filamentGroups = await fetchAvailableFilamentGroups();
    const locais = await fetchLocaisDeEstoque();
    const recipientesData = await fetchRecipientes();
    fetchPedidos(filaments, pecas, partes, models, kits, filamentGroups, locais, recipientesData);
  };

  const fetchPedidos = async (filamentsData: Insumo[], pecasData: Peca[], partesData: Parte[], modelsData: Modelo[], kitsData: Kit[], filamentGroupsData: GrupoDeFilamento[], locaisData: LocalDeEstoque[], recipientesData: Recipiente[]) => {
    try {
      const querySnapshot = await getDocs(collection(db, 'pedidos'));
      const pedidosList: Pedido[] = [];

      for (const docSnap of querySnapshot.docs) {
        const pedidoData = docSnap.data();
        const pedido: Pedido = {
          id: docSnap.id,
          numero: pedidoData.numero,
          comprador: pedidoData.comprador,
          produtos: pedidoData.produtos,
          status: pedidoData.status,
          etapas: pedidoData.etapas,
          custos: pedidoData.custos,
          tempos: pedidoData.tempos,
          dataCriacao: pedidoData.dataCriacao.toDate(),
          dataPrevisao: pedidoData.dataPrevisao.toDate(),
          dataConclusao: pedidoData.dataConclusao ? pedidoData.dataConclusao.toDate() : null,
          productionGroups: [], // Initialize as empty, will be populated below
        };

        // Check if productionGroups already exist in Firestore data
        if (pedidoData.productionGroups && pedidoData.productionGroups.length > 0) {
          // If they exist, use them and enrich with real-time stock data
          pedido.productionGroups = pedidoData.productionGroups.map((group: ProductionGroup) => {
            let groupHasAssembly = false;

            // Prioritize checking by ID if available (for new data)
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
                // Fallback to checking by name if IDs are not present (for old data)
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
                const { estoqueTotal, posicoesEstoque } = getStockForProduct(item.id, 'parte', pecasData, partesData, filamentsData, modelsData, kitsData, filamentGroupsData, locaisData, recipientesData);
                return {
                  ...item,
                  hasAssembly: item.hasAssembly ?? groupHasAssembly, // Use persisted hasAssembly if available, otherwise calculate
                  estoqueAtualItem: estoqueTotal,
                  localEstoqueItem: posicoesEstoque,
                };
              }),
              filamentosNecessarios: (group.filamentosNecessarios || []).map(filamento => {
                const { estoqueTotal, posicoesEstoque } = getStockForProduct(filamento.id, 'insumo', pecasData, partesData, filamentsData, modelsData, kitsData, filamentGroupsData, locaisData, recipientesData);
                return {
                  ...filamento,
                  estoqueAtualFilamento: estoqueTotal,
                  localEstoqueFilamento: posicoesEstoque,
                };
              }),
            };
          });
        } else {
          // --- NEW LOGIC TO CONSOLIDATE PRODUCTION GROUPS ---

          // 1. Helper to create a canonical key for a print group
          const createCanonicalKey = (grupo: GrupoImpressao): string => {
            const parteIds = [...(grupo.partes || [])].map(p => p.parteId).sort().join(',');
            const filamentoGroupIds = [...(grupo.filamentos || [])]
              .map(f => f.grupoFilamentoId)
              .filter(Boolean) // Remove undefined/null
              .sort()
              .join(',');
            return `partes:[${parteIds}]-filamentos:[${filamentoGroupIds}]`;
          };

          // 2. Collect all print groups from the order with multiplied quantities
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
              const pecaDetails = pecasData.find(p => p.id === produtoPedido.produtoId);
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
              const modeloDetails = modelsData.find(m => m.id === produtoPedido.produtoId);
              if (modeloDetails?.pecas) {
                for (const pecaRef of modeloDetails.pecas) {
                  const pecaDetails = pecasData.find(p => p.id === pecaRef.pecaId);
                  if (pecaDetails?.gruposImpressao) {
                    pecaDetails.gruposImpressao.forEach(gi => {
                      allPrintGroupsNeeded.push({
                        grupo: gi,
                        totalQuantity: produtoPedido.quantidade * pecaRef.quantidade,
                        sourceName: modeloDetails.nome,
                        sourceType: 'modelo',
                        originalModeloId: modeloDetails.id,
                        originalPecaId: pecaDetails.id, // Also include peca ID if it's a model
                      });
                    });
                  }
                }
              }
            } else if (produtoPedido.tipo === 'kit') {
              const kitDetails = kitsData.find(k => k.id === produtoPedido.produtoId);
              if (kitDetails?.modelos) {
                for (const modeloRef of kitDetails.modelos) {
                  const modeloDetails = modelsData.find(m => m.id === modeloRef.modeloId);
                  if (modeloDetails?.pecas) {
                    for (const pecaRef of modeloDetails.pecas) {
                      const pecaDetails = pecasData.find(p => p.id === pecaRef.pecaId);
                      if (pecaDetails?.gruposImpressao) {
                        pecaDetails.gruposImpressao.forEach(gi => {
                          allPrintGroupsNeeded.push({
                            grupo: gi,
                            totalQuantity: produtoPedido.quantidade * modeloRef.quantidade * pecaRef.quantidade,
                            sourceName: kitDetails.nome,
                            sourceType: 'kit',
                            originalKitId: kitDetails.id,
                            originalModeloId: modeloDetails?.id, // Also include model ID if it's a kit
                            originalPecaId: pecaDetails.id, // Also include peca ID if it's a kit
                          });
                        });
                      }
                    }
                  }
                }
              }
            }
          }

          // 3. Aggregate print groups by the canonical key
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
            // Avoid duplicate sources
            if (!aggregatedGroups[key].sources.some(s => s.name === sourceName && s.type === sourceType)) {
              aggregatedGroups[key].sources.push({ name: sourceName, type: sourceType });
            }
          }

          // 4. Split aggregated groups by `quantidadeMaxima` and create final ProductionGroup objects
          const finalProductionGroups: ProductionGroup[] = [];
          for (const key in aggregatedGroups) {
            const { originalGroup, totalQuantity, sources } = aggregatedGroups[key];
            const limit = originalGroup.quantidadeMaxima || 1; // Default to 1 if not set
            
            let groupHasAssembly = false;
            let originalPecaId: string | undefined;
            let originalModeloId: string | undefined;
            let originalKitId: string | undefined;

            for (const source of sources) {
                if (source.type === 'peca') {
                    const peca = pecasData.find(p => p.nome === source.name);
                    if (peca) {
                        originalPecaId = peca.id;
                        if (peca.tempoMontagem && peca.tempoMontagem > 0) {
                            groupHasAssembly = true;
                            break;
                        }
                    }
                } else if (source.type === 'modelo') {
                    const modelo = modelsData.find(m => m.nome === source.name);
                    if (modelo) {
                        originalModeloId = modelo.id;
                        if (modelo.tempoMontagem && modelo.tempoMontagem > 0) {
                            groupHasAssembly = true;
                            break;
                        }
                    }
                } else if (source.type === 'kit') {
                    const kit = kitsData.find(k => k.nome === source.name);
                    if (kit) {
                        originalKitId = kit.id;
                        if (kit.tempoMontagem && kit.tempoMontagem > 0) {
                            groupHasAssembly = true;
                            break;
                        }
                    }
                }
            }

            let remainingQuantity = totalQuantity;
            
            while (remainingQuantity > 0) {
              const quantityForThisRun = Math.min(remainingQuantity, limit);
              
              const productionGroup: ProductionGroup = {
                id: uuidv4(),
                sourceId: sources.map(s => s.name).join(', '), // Combine source names
                sourceType: sources.length > 1 ? 'kit' : sources[0].type, // Generalize sourceType
                sourceName: originalGroup.nome, // Use the print group's name
                originalPecaId: originalPecaId,
                originalModeloId: originalModeloId,
                originalKitId: originalKitId,
                corFilamento: filamentGroupsData.find(fg => fg.id === originalGroup.filamentos[0]?.grupoFilamentoId)?.cor || 'N/A',
                items: originalGroup.partes.map(parte => {
                  const parteDetails = partesData.find(p => p.id === parte.parteId);
                  return {
                    id: parte.parteId,
                    nome: parteDetails?.nome || 'N/A',
                    quantidadePedido: parte.quantidade * quantityForThisRun,
                    hasAssembly: groupHasAssembly,
                    tipoProduto: 'parte', // Explicitly set tipoProduto for parts
                  };
                }),
                filamentosNecessarios: originalGroup.filamentos.map(filamento => {
                  const filamentGroup = filamentGroupsData.find(fg => fg.id === filamento.grupoFilamentoId);
                  return {
                    id: filamento.grupoFilamentoId || filamento.insumoId!,
                    nome: filamentGroup?.nome || 'Filamento Desconhecido',
                    quantidade: filamento.quantidade * quantityForThisRun,
                    tipo: filamento.tipo,
                    // estoqueAtualFilamento and localEstoqueFilamento will be added dynamically
                  };
                }),
                tempoImpressaoGrupo: originalGroup.tempoImpressao * quantityForThisRun,
                consumoFilamentoGrupo: originalGroup.filamentos.reduce((acc, f) => acc + f.quantidade, 0) * quantityForThisRun,
                status: 'aguardando',
                pedidoId: pedido.id,
                pedidoNumero: pedido.numero,
                pedidoComprador: pedido.comprador,
                pedidoTotalTempoImpressao: 0, // Will be recalculated later
                pedidoTotalConsumoFilamento: 0, // Will be recalculated later
                pedidoTotalTempoMontagem: 0, // Will be recalculated later
              };
              finalProductionGroups.push(productionGroup);
              remainingQuantity -= quantityForThisRun;
            }
          }

          pedido.productionGroups = finalProductionGroups;
          const cleanedProductionGroups = cleanObject(pedido.productionGroups);
          await updateDoc(doc(db, 'pedidos', pedido.id), { productionGroups: cleanedProductionGroups });
        }
        
        // Recalculate totals based on the final production groups and products
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

      // Re-fetch all data to ensure UI is up-to-date after any status update
      const filaments = await fetchAvailableFilaments();
      const pecas = await fetchAvailablePecas();
      const partes = await fetchAvailablePartes();
      const models = await fetchAvailableModels();
      const kits = await fetchAvailableKits();
      const filamentGroups = await fetchAvailableFilamentGroups();
      const locais = await fetchLocaisDeEstoque();
      const recipientesData = await fetchRecipientes();
      fetchPedidos(filaments, pecas, partes, models, kits, filamentGroups, locais, recipientesData);

    } catch (error) {
      console.error("Error updating production group status: ", error);
    }
  };

  const revertProductionGroupStatus = async (pedidoId: string, groupId: string, currentStatus: ProductionGroup['status']) => {
    let newStatus: ProductionGroup['status'] = 'aguardando'; // Default revert

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
            ...group, // Preserve dynamic data
            status: newStatus,
          };

          if (newStatus === 'em_producao') {
            updatedGroup.startedAt = new Date();
            updatedGroup.completedAt = null;
          } else if (newStatus === 'produzido') {
            updatedGroup.completedAt = new Date();
            updatedGroup.startedAt = updatedGroup.startedAt ?? null;
          } else { // aguardando or other reverted states
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
      // Explicitly update the status to 'produzido' after successful launch from modal
      await updateProductionGroupStatus(selectedProductionGroup.pedidoId, selectedProductionGroup.id, 'produzido');
    }
    // Re-fetch all data to ensure UI is up-to-date after production launch
    const filaments = await fetchAvailableFilaments();
    const pecas = await fetchAvailablePecas();
    const partes = await fetchAvailablePartes();
    const models = await fetchAvailableModels();
    const kits = await fetchAvailableKits();
    const filamentGroups = await fetchAvailableFilamentGroups();
    const locais = await fetchLocaisDeEstoque();
    const recipientesData = await fetchRecipientes();
    fetchPedidos(filaments, pecas, partes, models, kits, filamentGroups, locais, recipientesData);
    handleCloseLaunchModal(); // Close the modal after success
  };

  const getFilteredDisplayGroups = (): ProductionGroup[] => {
    return displayGroups.filter(group => {
      if (activeTab === 'aguardando') {
        return group.status === 'aguardando';
      } else if (activeTab === 'em_producao') {
        return group.status === 'em_producao';
      } else if (activeTab === 'em_montagem') {
        return group.status === 'produzido' || group.status === 'em_montagem'; // Groups that are 'produzido' or 'em_montagem' will show here
      } else if (activeTab === 'montados') {
        return group.status === 'montado' || group.status === 'concluido';
      }
      return true;
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

    // Return unique locations
    return [...new Set(locations)].join('; ');
  };

  const canConcludeGroup = (group: ProductionGroup): { canConclude: boolean; message: string | null } => {
    console.log(`Checking group: ${group.sourceName}, ID: ${group.id}, Current Status: ${group.status}`);
    if (group.status !== 'montado') {
      console.log(`Group ${group.sourceName} is NOT 'montado'. Status: ${group.status}`);
      return { canConclude: false, message: 'Grupo não está no status "montado".' };
    }

    for (const item of group.items) {
      console.log(`  Checking item: ${item.nome}, Needed: ${item.quantidadePedido}, Current Stock: ${item.estoqueAtualItem}`);
      if ((item.estoqueAtualItem ?? 0) < item.quantidadePedido) {
        console.log(`  Item ${item.nome} stock is insufficient.`);
        return { canConclude: false, message: `Faltam ${item.quantidadePedido - (item.estoqueAtualItem ?? 0)} unidades de ${item.nome}.` };
      }
    }
    console.log(`Group ${group.sourceName} is ready to be concluded.`);
    return { canConclude: true, message: null };
  };

  const canConcludePedido = (pedido: Pedido): { canConclude: boolean; message: string | null } => {
    console.log(`Checking pedido: ${pedido.numero}, ID: ${pedido.id}`);
    if (!pedido.productionGroups || pedido.productionGroups.length === 0) {
      console.log(`Pedido ${pedido.numero} has no production groups.`);
      return { canConclude: false, message: 'Nenhum grupo de produção para este pedido.' };
    }

    for (const group of pedido.productionGroups) {
      const { canConclude, message } = canConcludeGroup(group);
      if (!canConclude) {
        console.log(`Pedido ${pedido.numero} cannot be concluded because group ${group.sourceName} is not ready.`);
        return { canConclude: false, message: `Grupo "${group.sourceName}" não está pronto: ${message}` };
      }
    }
    console.log(`Pedido ${pedido.numero} is ready to be concluded.`);
    return { canConclude: true, message: null };
  };

  const concludePedido = async (pedidoId: string) => {
    try {
      const pedidoToUpdate = pedidos.find(p => p.id === pedidoId);
      if (!pedidoToUpdate) {
        console.error("Pedido not found in local state:", pedidoId);
        return;
      }

      const { canConclude, message } = canConcludePedido(pedidoToUpdate);
      if (!canConclude) {
        alert(`Não é possível concluir o pedido: ${message}`);
        return;
      }

      const updatedGroups: ProductionGroup[] = (pedidoToUpdate.productionGroups || []).map(group => ({
        ...group,
        status: 'concluido',
        completedAt: group.completedAt ?? new Date(),
      }));

      setPedidos(prevPedidos =>
        prevPedidos.map(p => (p.id === pedidoId ? { ...p, productionGroups: updatedGroups, status: 'concluido', dataConclusao: new Date() } : p))
      );

      const cleanedUpdatedGroups = cleanObject(updatedGroups);
      await updateDoc(doc(db, 'pedidos', pedidoId), {
        productionGroups: cleanedUpdatedGroups,
        status: 'concluido',
        dataConclusao: new Date(),
      });

    } catch (error) {
      console.error("Error concluding pedido: ", error);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Painel de Produção</h1>
      <p className="mt-1 text-sm text-gray-500">
        Acompanhe e gerencie o fluxo de produção dos pedidos.
      </p>

      {/* Tabs for Production Stages */}
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
            onClick={() => setActiveTab('em_montagem')}
            className={`${
              activeTab === 'em_montagem'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Em Montagem
          </button>
          <button
            onClick={() => setActiveTab('montados')}
            className={`${
              activeTab === 'montados'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Montados
          </button>
        </nav>
      </div>

      {/* Content based on active tab */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {activeTab === 'aguardando' && (
          pedidos.filter(pedido => pedido.productionGroups?.some(group => group.status === 'aguardando')).length > 0 ? (
            pedidos.filter(pedido => pedido.productionGroups?.some(group => group.status === 'aguardando')).map((pedido) => (
              <div key={pedido.id} className="bg-white shadow rounded-lg p-6">
                {/* Main Pedido Card Content */}
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900">Pedido #{pedido.numero}</h3>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    pedido.status === 'aguardando' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {pedido.status?.replace('_', ' ')}
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
                  {pedido.productionGroups?.filter(group => group.status === 'aguardando').map((group) => (
                    <div key={group.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      {/* Inner Group Card Content - This is the "gray element" */}
                      <div className="flex justify-between items-center mb-2">
                        <h5 className="text-md font-medium text-gray-800">
                          {group.sourceType === 'peca' && `Peça: ${group.sourceName || 'N/A'}`}
                          {group.sourceType === 'modelo' && `Modelo: ${group.sourceName || 'N/A'}`}
                          {group.sourceType === 'kit' && `Kit: ${group.sourceName || 'N/A'}`}
                        </h5>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          group.status === 'aguardando' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {group.status?.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 mb-2">
                        <p>Tempo de Impressão: {formatTime(group.tempoImpressaoGrupo)}</p>
                        <div className="flex items-center">
                          Filamento:
                          {group.corFilamento && (
                            <Spool
                              className="h-4 w-4 ml-1"
                              style={{ color: filamentColors[group.corFilamento] || 'currentColor' }}
                            />
                          )}
                        </div>
                        {group.filamentosNecessarios.map((filamento, idx) => (
                          <div key={idx}>
                            <p className={(filamento.estoqueAtualFilamento ?? 0) < filamento.quantidade ? 'text-red-500' : ''}>
                              {filamento.nome}: Necessário {formatFilament(filamento.quantidade)} / Estoque {formatFilament(filamento.estoqueAtualFilamento ?? 0)}
                            </p>
                            {filamento.localEstoqueFilamento && filamento.localEstoqueFilamento.length > 0 && (
                              <p className="flex items-center text-xs text-gray-500">
                                <MapPin className="h-3 w-3 mr-1" /> Local: {formatLocation(filamento.localEstoqueFilamento)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      <h6 className="text-md font-medium text-gray-800 mb-1">Itens a Produzir:</h6>
                      <ul className="list-disc list-inside text-sm text-gray-600 mb-3">
                        {group.items.map((item, itemIndex) => (
                          <li key={itemIndex}>
                            {item.nome} (x{item.quantidadePedido})
                            <p className={(item.estoqueAtualItem ?? 0) < item.quantidadePedido ? 'text-red-500' : ''}>
                              Estoque Atual: {item.estoqueAtualItem ?? 0}
                            </p>
                            {item.localEstoqueItem && item.localEstoqueItem.length > 0 && (
                              <p className="flex items-center text-xs text-gray-500">
                                <MapPin className="h-3 w-3 mr-1" /> Local: {formatLocation(item.localEstoqueItem)}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                      {checkIfGroupHasEnoughStock(group) ? (
                        <button
                          onClick={() => handleUseExistingStock(group.pedidoId, group.id)}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700"
                        >
                          <Package className="h-3 w-3 mr-1" /> Usar Estoque Existente
                        </button>
                      ) : (
                        <button
                          onClick={() => updateProductionGroupStatus(group.pedidoId, group.id, 'em_producao')}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                        >
                          <Play className="h-3 w-3 mr-1" /> Iniciar Produção
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 col-span-full">
              <p className="text-gray-600">Nenhum pedido aguardando encontrado.</p>
            </div>
          )
        )}

        {activeTab === 'em_producao' && (
          pedidos.filter(pedido => pedido.productionGroups?.some(group => group.status === 'em_producao')).length > 0 ? (
            pedidos.filter(pedido => pedido.productionGroups?.some(group => group.status === 'em_producao')).map((pedido) => (
              <div key={pedido.id} className="bg-white shadow rounded-lg p-6">
                {/* Main Pedido Card Content */}
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900">Pedido #{pedido.numero}</h3>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    pedido.status === 'em_producao' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {pedido.status?.replace('_', ' ')}
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
                      {/* Inner Group Card Content */}
                      <div className="flex justify-between items-center mb-2">
                        <h5 className="text-md font-medium text-gray-800">
                          {group.sourceType === 'peca' && `Peça: ${group.sourceName || 'N/A'}`}
                          {group.sourceType === 'modelo' && `Modelo: ${group.sourceName || 'N/A'}`}
                          {group.sourceType === 'kit' && `Kit: ${group.sourceName || 'N/A'}`}
                        </h5>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          group.status === 'em_producao' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {group.status?.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 mb-2">
                        <p>Tempo de Impressão: {formatTime(group.tempoImpressaoGrupo)}</p>
                        <div className="flex items-center">
                          Filamento:
                          {group.corFilamento && (
                            <Spool
                              className="h-4 w-4 ml-1"
                              style={{ color: filamentColors[group.corFilamento] || 'currentColor' }}
                            />
                          )}
                        </div>
                        {group.filamentosNecessarios.map((filamento, idx) => (
                          <div key={idx}>
                            <p className={(filamento.estoqueAtualFilamento ?? 0) < filamento.quantidade ? 'text-red-500' : ''}>
                              {filamento.nome}: Necessário {formatFilament(filamento.quantidade)} / Estoque {formatFilament(filamento.estoqueAtualFilamento ?? 0)}
                            </p>
                            {filamento.localEstoqueFilamento && filamento.localEstoqueFilamento.length > 0 && (
                              <p className="flex items-center text-xs text-gray-500">
                                <MapPin className="h-3 w-3 mr-1" /> Local: {formatLocation(filamento.localEstoqueFilamento)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      <h6 className="text-md font-medium text-gray-800 mb-1">Itens a Produzir:</h6>
                      <ul className="list-disc list-inside text-sm text-gray-600 mb-3">
                        {group.items.map((item, itemIndex) => (
                          <li key={itemIndex}>
                            {item.nome} (x{item.quantidadePedido})
                            <p className={(item.estoqueAtualItem ?? 0) < item.quantidadePedido ? 'text-red-500' : ''}>
                              Estoque Atual: {item.estoqueAtualItem ?? 0}
                            </p>
                            {item.localEstoqueItem && item.localEstoqueItem.length > 0 && (
                              <p className="flex items-center text-xs text-gray-500">
                                <MapPin className="h-3 w-3 mr-1" /> Local: {formatLocation(item.localEstoqueItem)}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => revertProductionGroupStatus(group.pedidoId, group.id, 'em_producao')}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
                        >
                          <XCircle className="h-3 w-3 mr-1" /> Reverter
                        </button>
                        <button
                          onClick={() => updateProductionGroupStatus(group.pedidoId, group.id, 'aguardando')}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700"
                        >
                          <Pause className="h-3 w-3 mr-1" /> Pausar
                        </button>
                        <button
                          onClick={() => handleOpenLaunchModal(group)}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
                        >
                          <FastForward className="h-3 w-3 mr-1" /> Concluir Produção
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
          )
        )}

        {activeTab === 'em_montagem' && (
          (() => {
            const assemblyGroups = getFilteredDisplayGroups().filter(group => group.status === 'produzido' || group.status === 'em_montagem');
            const uniquePedidoIds = [...new Set(assemblyGroups.map(group => group.pedidoId))];

            return uniquePedidoIds.length > 0 ? (
              uniquePedidoIds.map(pedidoId => {
                const pedido = pedidos.find(p => p.id === pedidoId);
                if (!pedido) return null;

                const groupsForThisPedido = assemblyGroups.filter(group => group.pedidoId === pedido.id);

                return (
                  <div key={pedido.id} className="bg-white shadow rounded-lg p-6">
                    {/* Main Pedido Card Content */}
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-gray-900">Pedido #{pedido.numero}</h3>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        groupsForThisPedido.every(g => g.status === 'produzido') ? 'bg-green-100 text-green-800' :
                        groupsForThisPedido.every(g => g.status === 'em_montagem') ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {groupsForThisPedido.every(g => g.status === 'produzido') ? 'Produzido' :
                         groupsForThisPedido.every(g => g.status === 'em_montagem') ? 'Em Montagem' : 'Misto'}
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
                      {groupsForThisPedido.map((group) => (
                        <div key={group.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                          {/* Inner Group Card Content */}
                          <div className="flex justify-between items-center mb-2">
                            <h5 className="text-md font-medium text-gray-800">
                              {group.sourceType === 'peca' && `Peça: ${group.sourceName || 'N/A'}`}
                              {group.sourceType === 'modelo' && `Modelo: ${group.sourceName || 'N/A'}`}
                              {group.sourceType === 'kit' && `Kit: ${group.sourceName || 'N/A'}`}
                            </h5>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              group.status === 'produzido' ? 'bg-green-100 text-green-800' :
                              group.status === 'em_montagem' ? 'bg-orange-100 text-orange-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {group.status?.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-sm text-gray-700 mb-2">
                            <p>Tempo de Impressão: {formatTime(group.tempoImpressaoGrupo)}</p>
                            <div className="flex items-center">
                              Filamento:
                              {group.corFilamento && (
                                <Spool
                                  className="h-4 w-4 ml-1"
                                  style={{ color: filamentColors[group.corFilamento] || 'currentColor' }}
                                />
                              )}
                            </div>
                            {group.filamentosNecessarios.map((filamento, idx) => (
                              <div key={idx}>
                                <p className={(filamento.estoqueAtualFilamento ?? 0) < filamento.quantidade ? 'text-red-500' : ''}>
                                  {filamento.nome}: Necessário {formatFilament(filamento.quantidade)} / Estoque {formatFilament(filamento.estoqueAtualFilamento ?? 0)}
                                </p>
                                {filamento.localEstoqueFilamento && filamento.localEstoqueFilamento.length > 0 && (
                                  <p className="flex items-center text-xs text-gray-500">
                                    <MapPin className="h-3 w-3 mr-1" /> Local: {formatLocation(filamento.localEstoqueFilamento)}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                          <h6 className="text-md font-medium text-gray-800 mb-1">Itens Produzidos:</h6>
                          <ul className="list-disc list-inside text-sm text-gray-600 mb-3">
                            {group.items.map((item, itemIndex) => (
                              <li key={itemIndex}>
                                {item.nome} (x{item.quantidadePedido})
                                <p className={(item.estoqueAtualItem ?? 0) < item.quantidadePedido ? 'text-red-500' : ''}>
                                  Estoque Atual: {item.estoqueAtualItem ?? 0}
                                </p>
                                {item.localEstoqueItem && item.localEstoqueItem.length > 0 && (
                                  <p className="flex items-center text-xs text-gray-500">
                                    <MapPin className="h-3 w-3 mr-1" /> Local: {formatLocation(item.localEstoqueItem)}
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => revertProductionGroupStatus(group.pedidoId, group.id, group.status)}
                              className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
                            >
                              <XCircle className="h-3 w-3 mr-1" /> Reverter
                            </button>
                            {group.status === 'produzido' && (
                              <button
                                onClick={() => updateProductionGroupStatus(group.pedidoId, group.id, 'em_montagem')}
                                className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700"
                              >
                                <FastForward className="h-3 w-3 mr-1" /> Lançar para Montagem/Estoque
                              </button>
                            )}
                            {group.status === 'em_montagem' && (
                              <button
                                onClick={() => updateProductionGroupStatus(group.pedidoId, group.id, 'montado')}
                                className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                              >
                                <CheckCircle className="h-3 w-3 mr-1" /> Concluir Montagem
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 col-span-full">
                <p className="text-gray-600">Nenhum pedido em montagem encontrado.</p>
              </div>
            );
          })()
        )}

        {activeTab === 'montados' && (
          (() => {
            const mountedGroups = getFilteredDisplayGroups().filter(group => group.status === 'montado' || group.status === 'concluido');
            const uniquePedidoIds = [...new Set(mountedGroups.map(group => group.pedidoId))];

            return uniquePedidoIds.length > 0 ? (
              uniquePedidoIds.map(pedidoId => {
                const pedido = pedidos.find(p => p.id === pedidoId);
                if (!pedido) return null;

                const groupsForThisPedido = mountedGroups.filter(group => group.pedidoId === pedido.id);

                return (
                  <div key={pedido.id} className="bg-white shadow rounded-lg p-6">
                    {/* Main Pedido Card Content */}
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-gray-900">Pedido #{pedido.numero}</h3>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        groupsForThisPedido.every(g => g.status === 'montado') ? 'bg-purple-100 text-purple-800' :
                        groupsForThisPedido.every(g => g.status === 'concluido') ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {groupsForThisPedido.every(g => g.status === 'montado') ? 'Montado' :
                         groupsForThisPedido.every(g => g.status === 'concluido') ? 'Concluído' : 'Misto'}
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
                      {groupsForThisPedido.map((group) => (
                        <div key={group.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                          {/* Inner Group Card Content */}
                          <div className="flex justify-between items-center mb-2">
                            <h5 className="text-md font-medium text-gray-800">
                              {group.sourceType === 'peca' && `Peça: ${group.sourceName || 'N/A'}`}
                              {group.sourceType === 'modelo' && `Modelo: ${group.sourceName || 'N/A'}`}
                              {group.sourceType === 'kit' && `Kit: ${group.sourceName || 'N/A'}`}
                            </h5>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              group.status === 'montado' ? 'bg-purple-100 text-purple-800' :
                              group.status === 'concluido' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {group.status?.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-sm text-gray-700 mb-2">
                            <p>Tempo de Impressão: {formatTime(group.tempoImpressaoGrupo)}</p>
                            <div className="flex items-center">
                              Filamento:
                              {group.corFilamento && (
                                <Spool
                                  className="h-4 w-4 ml-1"
                                  style={{ color: filamentColors[group.corFilamento] || 'currentColor' }}
                                />
                              )}
                            </div>
                            {group.filamentosNecessarios.map((filamento, idx) => (
                              <div key={idx}>
                                <p className={(filamento.estoqueAtualFilamento ?? 0) < filamento.quantidade ? 'text-red-500' : ''}>
                                  {filamento.nome}: Necessário {formatFilament(filamento.quantidade)} / Estoque {formatFilament(filamento.estoqueAtualFilamento ?? 0)}
                                </p>
                                {filamento.localEstoqueFilamento && filamento.localEstoqueFilamento.length > 0 && (
                                  <p className="flex items-center text-xs text-gray-500">
                                    <MapPin className="h-3 w-3 mr-1" /> Local: {formatLocation(filamento.localEstoqueFilamento)}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                          <h6 className="text-md font-medium text-gray-800 mb-1">Itens Montados:</h6>
                          <ul className="list-disc list-inside text-sm text-gray-600 mb-3">
                            {group.items.map((item, itemIndex) => (
                              <li key={itemIndex}>
                                {item.nome} (x{item.quantidadePedido})
                                <p className={(item.estoqueAtualItem ?? 0) < item.quantidadePedido ? 'text-red-500' : ''}>
                                  Estoque Atual: {item.estoqueAtualItem ?? 0}
                                </p>
                                {item.localEstoqueItem && item.localEstoqueItem.length > 0 && (
                                  <p className="flex items-center text-xs text-gray-500">
                                    <MapPin className="h-3 w-3 mr-1" /> Local: {formatLocation(item.localEstoqueItem)}
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => revertProductionGroupStatus(group.pedidoId, group.id, group.status)}
                              className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
                            >
                              <XCircle className="h-3 w-3 mr-1" /> Reverter
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Conclude Pedido Button */}
                    <div className="mt-4 flex justify-end">
                      {(() => {
                        const { canConclude, message } = canConcludePedido(pedido);
                        return (
                          <>
                            {!canConclude && message && (
                              <p className="text-red-500 text-sm mr-4 self-center">{message}</p>
                            )}
                            <button
                              onClick={() => concludePedido(pedido.id)}
                              disabled={!canConclude}
                              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                                canConclude ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
                              }`}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" /> Concluir Pedido
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 col-span-full">
                <p className="text-gray-600">Nenhum pedido montado encontrado.</p>
              </div>
            );
          })()
        )}
      </div>
      <ProductionLaunchModal
        isOpen={isLaunchModalOpen}
        onClose={handleCloseLaunchModal}
        group={selectedProductionGroup}
        onLaunchSuccess={handleLaunchSuccess}
      />

      {isStockSelectionModalOpen && itemToDebit && (
        <StockSelectionModal
          isOpen={isStockSelectionModalOpen}
          onClose={() => setIsStockSelectionModalOpen(false)}
          onSelect={handleStockSelection}
          itemNome={itemToDebit.item.nome}
          quantidadeNecessaria={itemToDebit.item.quantidadePedido}
          availablePositions={itemToDebit.item.localEstoqueItem || []}
          formatLocation={formatLocation}
          totalEstoqueDisponivelGeral={itemToDebit.item.estoqueAtualItem ?? 0} // Pass estoqueTotal as a new prop
        />
      )}
    </div>
  );
}
