"use client";

import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { Hourglass, Package, CheckCircle, XCircle, Play, Pause, FastForward, Trash2, Spool } from 'lucide-react';

export default function Producao() {
  const [pedidos, setPedidos] = useState([]);
  const [activeTab, setActiveTab] = useState('aguardando'); // 'aguardando', 'em_producao', 'produzidos', 'montados'
  const [filamentColors, setFilamentColors] = useState({});
  const [displayGroups, setDisplayGroups] = useState([]);
  const [availableFilaments, setAvailableFilaments] = useState([]);
  const [availableProducts, setAvailableProducts] = useState([]); // New state for available products

  useEffect(() => {
    const initializeData = async () => {
      fetchFilamentColors();
      const filaments = await fetchAvailableFilaments();
      const products = await fetchAvailableProducts(); // Fetch products and wait for them
      fetchPedidos(filaments, products); // Pass both filaments and products to fetchPedidos
    };
    initializeData();
  }, []);

  // New useEffect to derive displayGroups from pedidos
  useEffect(() => {
    const allGroups = [];
    pedidos.forEach(pedido => {
      pedido.productionGroups.forEach(group => {
        allGroups.push({
          ...group,
          pedidoId: pedido.id,
          pedidoNumero: pedido.numero,
          pedidoComprador: pedido.comprador,
          pedidoTotalTempoImpressao: pedido.totalTempoImpressao,
          pedidoTotalConsumoFilamento: pedido.totalConsumoFilamento,
          pedidoTotalTempoMontagem: pedido.totalTempoMontagem,
        });
      });
    });
    setDisplayGroups(allGroups);
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

  const fetchAvailableFilaments = async () => {
    try {
      const insumosCollection = collection(db, 'insumos');
      const insumoSnapshot = await getDocs(insumosCollection);
      const filamentsList = insumoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(i => i.tipo === 'filamento');
      setAvailableFilaments(filamentsList);
      return filamentsList; // Return the fetched list
    } catch (error) {
      console.error("Error fetching available filaments: ", error);
      return [];
    }
  };

  const fetchAvailableProducts = async () => {
    try {
      const produtosCollection = collection(db, 'produtos');
      const produtoSnapshot = await getDocs(produtosCollection);
      const produtosList = produtoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAvailableProducts(produtosList);
      return produtosList;
    } catch (error) {
      console.error("Error fetching available products: ", error);
      return [];
    }
  };

  const fetchPecaDetails = async (pecaId, filamentsData, productsData) => {
    try {
      const pecaDocRef = doc(db, 'pecas', pecaId);
      const pecaDocSnap = await getDoc(pecaDocRef);
      if (pecaDocSnap.exists()) {
        const pecaData = { id: pecaDocSnap.id, ...pecaDocSnap.data() };
        
        let totalConsumoFilamento = 0;
        let mainFilamentColor = 'N/A'; // This might need more complex logic for composed pieces with multiple colors
        let totalTempoImpressaoPeca = 0; // New variable to aggregate time for composed pieces

        if (pecaData.isPecaComposta && pecaData.gruposImpressao && pecaData.gruposImpressao.length > 0) {
          // For composed pieces, aggregate from gruposImpressao
          pecaData.gruposImpressao.forEach(grupo => {
            totalTempoImpressaoPeca += (parseFloat(grupo.tempoImpressaoGrupo) || 0);
            (grupo.filamentos || []).forEach(filamentoRef => {
              const filament = filamentsData.find(f => f.grupoFilamento === filamentoRef.grupoFilamento); // Match by grupoFilamento
              if (filament) {
                totalConsumoFilamento += (parseFloat(filamentoRef.quantidade) || 0);
                if (mainFilamentColor === 'N/A' && filament.cor) { // Take the color of the first filament found
                  mainFilamentColor = filament.cor;
                }
              }
            });
          });
        } else {
          // For simple pieces, use existing insumos logic
          const pecaInsumos = pecaData.insumos || [];
          if (pecaInsumos.length > 0 && filamentsData.length > 0) {
            for (const insumoRef of pecaInsumos) {
              const filament = filamentsData.find(f => f.id === insumoRef.insumoId);
              if (filament && filament.tipo === 'filamento') {
                const quantidadeConsumida = insumoRef.quantidade || 0;
                totalConsumoFilamento += quantidadeConsumida;
                if (filament.cor) {
                  mainFilamentColor = filament.cor;
                }
              } else {
                console.warn(`Filament not found or not of type 'filamento' for insumoRef:`, insumoRef);
              }
            }
          }
          totalTempoImpressaoPeca = parseFloat(pecaData.tempoImpressao) || 0;
        }

        // Get current stock for the piece itself
        const productInStock = productsData.find(p => p.id === pecaId && p.tipo === 'peca');
        const estoqueAtualPeca = productInStock ? (productInStock.estoqueAtual || 0) : 0;

        return { 
          ...pecaData, 
          tempoImpressao: totalTempoImpressaoPeca, // Ensure tempoImpressao is always present and correct
          consumoFilamento: totalConsumoFilamento, 
          corFilamento: mainFilamentColor,
          estoqueAtual: estoqueAtualPeca, // Add stock information
          // If it's a composed piece, include its parts for further processing
          partesCompostas: pecaData.isPecaComposta ? (pecaData.gruposImpressao || []).flatMap(grupo => grupo.partes.map(parte => ({
            parteId: parte.parteId,
            nome: parte.nome,
            quantidade: parte.quantidade,
            sku: parte.sku, // Use sku as identificador
            estoque: parte.estoque,
          }))) : [],
        };
      } else {
        console.warn(`Peca with ID ${pecaId} not found.`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching peca details for ${pecaId}:`, error);
      return null;
    }
  };

  const fetchModeloDetails = async (modeloId, filamentsData, productsData) => {
    try {
      const modeloDocRef = doc(db, 'modelos', modeloId);
      const modeloDocSnap = await getDoc(modeloDocRef);
      if (modeloDocSnap.exists()) {
        const modeloData = { id: modeloDocSnap.id, ...modeloDocSnap.data() };
        const pecasPromises = modeloData.pecas.map(p => fetchPecaDetails(p.id, filamentsData, productsData));
        modeloData.pecas = (await Promise.all(pecasPromises)).filter(Boolean);

        // Get current stock for the model itself
        const productInStock = productsData.find(p => p.id === modeloId && p.tipo === 'modelo');
        const estoqueAtualModelo = productInStock ? (productInStock.estoqueAtual || 0) : 0;

        return { 
          ...modeloData,
          estoqueAtual: estoqueAtualModelo // Add stock information
        };
      } else {
        console.warn(`Modelo with ID ${modeloId} not found.`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching modelo details for ${modeloId}:`, error);
      return null;
    }
  };

  const fetchKitDetails = async (kitId, filamentsData, productsData) => {
    try {
      const kitDocRef = doc(db, 'kits', kitId);
      const kitDocSnap = await getDoc(kitDocRef);
      if (kitDocSnap.exists()) {
        const kitData = { id: kitDocSnap.id, ...kitDocSnap.data() };
        // Ensure kitData.produtos is an array before mapping
        const produtosPromises = (kitData.produtos || []).map(async (p) => {
          if (p.tipo === 'modelo') {
            return await fetchModeloDetails(p.id, filamentsData, productsData);
          } else if (p.tipo === 'peca') {
            return await fetchPecaDetails(p.id, filamentsData, productsData);
          }
          return null;
        });
        kitData.produtos = (await Promise.all(produtosPromises)).filter(Boolean);

        // Get current stock for the kit itself
        const productInStock = productsData.find(p => p.id === kitId && p.tipo === 'kit');
        const estoqueAtualKit = productInStock ? (productInStock.estoqueAtual || 0) : 0;

        return { 
          ...kitData,
          estoqueAtual: estoqueAtualKit // Add stock information
        };
      } else {
        console.warn(`Kit with ID ${kitId} not found.`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching kit details for ${kitId}:`, error);
      return null;
    }
  };

  const fetchPedidos = async (filamentsData, productsData) => {
    try {
      const querySnapshot = await getDocs(collection(db, 'pedidos'));
      const pedidosList = await Promise.all(querySnapshot.docs.map(async doc => {
        const pedidoData = {
          id: doc.id,
          ...doc.data(),
          dataCriacao: doc.data().dataCriacao.toDate(),
          dataPrevisao: doc.data().dataPrevisao.toDate(),
          dataConclusao: doc.data().dataConclusao ? doc.data().dataConclusao.toDate() : null,
          totalTempoImpressao: 0,
          totalTempoMontagem: 0,
          totalConsumoFilamento: 0,
          // Capture existing productionGroups from Firestore
          existingProductionGroups: doc.data().productionGroups || [],
        };

        const productionGroupsMap = new Map(); // Key: `${sourceType}-${sourceId}-${corFilamento}`, Value: group object

        for (const item of pedidoData.produtos || []) {
          if (item.tipo === 'peca') {
            const pecaDetails = await fetchPecaDetails(item.id, filamentsData, productsData);
            if (pecaDetails) {
              const key = `peca-${item.id}-${pecaDetails.corFilamento}`;
              const existingGroup = pedidoData.existingProductionGroups.find(g => g.sourceId === item.id && g.sourceType === 'peca' && g.corFilamento === pecaDetails.corFilamento);
              if (!productionGroupsMap.has(key)) {
                productionGroupsMap.set(key, {
                  sourceId: item.id,
                  sourceType: 'peca',
                  sourceName: pecaDetails.nome,
                  corFilamento: pecaDetails.corFilamento,
                  items: [],
                  tempoImpressaoGrupo: 0,
                  consumoFilamentoGrupo: 0,
                  status: existingGroup?.status || 'aguardando', // Use existing status
                  estoqueAtualProduto: pecaDetails.estoqueAtual || 0, // Add product stock
                  quantidadeNecessariaProduto: item.quantidade, // Required quantity for this piece
                });
              }
              const group = productionGroupsMap.get(key);
              group.items.push({
                id: pecaDetails.id,
                nome: pecaDetails.nome,
                quantidadePedido: item.quantidade,
                tempoImpressaoPeca: pecaDetails.tempoImpressao || 0,
                consumoFilamentoPeca: pecaDetails.consumoFilamento || 0,
              });
              group.tempoImpressaoGrupo += (pecaDetails.tempoImpressao || 0) * item.quantidade;
              group.consumoFilamentoGrupo += (pecaDetails.consumoFilamento || 0) * item.quantidade;
              pedidoData.totalTempoMontagem += (pecaDetails.tempoMontagem || 0) * item.quantidade;
            }
          } else if (item.tipo === 'modelo') {
            const modeloDetails = await fetchModeloDetails(item.id, filamentsData, productsData);
            if (modeloDetails && modeloDetails.pecas) {
              const modelPecasByColor = {};
              modeloDetails.pecas.forEach(peca => {
                const colorKey = peca.corFilamento;
                if (!modelPecasByColor[colorKey]) {
                  modelPecasByColor[colorKey] = {
                    corFilamento: peca.corFilamento,
                    items: [],
                    tempoImpressaoGrupo: 0,
                    consumoFilamentoGrupo: 0,
                  };
                }
                modelPecasByColor[colorKey].items.push({
                  id: peca.id,
                  nome: peca.nome,
                  quantidadePedido: item.quantidade * (peca.quantidade || 1),
                  tempoImpressaoPeca: peca.tempoImpressao || 0,
                  consumoFilamentoPeca: peca.consumoFilamento || 0,
                });
                modelPecasByColor[colorKey].tempoImpressaoGrupo += (peca.tempoImpressao || 0) * item.quantidade * (peca.quantidade || 1);
                modelPecasByColor[colorKey].consumoFilamentoGrupo += (peca.consumoFilamento || 0) * item.quantidade * (peca.quantidade || 1);
                pedidoData.totalTempoMontagem += (peca.tempoMontagem || 0) * item.quantidade * (peca.quantidade || 1);
              });

              for (const colorKey in modelPecasByColor) {
                const groupData = modelPecasByColor[colorKey];
                const key = `modelo-${item.id}-${colorKey}`;
                const existingGroup = pedidoData.existingProductionGroups.find(g => g.sourceId === item.id && g.sourceType === 'modelo' && g.corFilamento === groupData.corFilamento);
                productionGroupsMap.set(key, {
                  sourceId: item.id,
                  sourceType: 'modelo',
                  sourceName: modeloDetails.nome,
                  corFilamento: groupData.corFilamento,
                  items: groupData.items,
                  tempoImpressaoGrupo: groupData.tempoImpressaoGrupo,
                  consumoFilamentoGrupo: groupData.consumoFilamentoGrupo,
                  status: existingGroup?.status || 'aguardando', // Use existing status
                  estoqueAtualProduto: modeloDetails.estoqueAtual || 0, // Add product stock
                  quantidadeNecessariaProduto: item.quantidade, // Required quantity for this model
                });
              }
            }
          } else if (item.tipo === 'kit') {
            const kitDetails = await fetchKitDetails(item.id, filamentsData, productsData);
            if (kitDetails && kitDetails.produtos) {
              const kitPecasByColor = {};
              for (const kitProduct of kitDetails.produtos) {
                if (kitProduct.tipo === 'peca') {
                  const peca = kitProduct;
                  const colorKey = peca.corFilamento;
                  if (!kitPecasByColor[colorKey]) {
                    kitPecasByColor[colorKey] = {
                      corFilamento: peca.corFilamento,
                      items: [],
                      tempoImpressaoGrupo: 0,
                      consumoFilamentoGrupo: 0,
                    };
                  }
                  kitPecasByColor[colorKey].items.push({
                    id: peca.id,
                    nome: peca.nome,
                    quantidadePedido: item.quantidade * (peca.quantidade || 1),
                    tempoImpressaoPeca: peca.tempoImpressao || 0,
                    consumoFilamentoPeca: peca.consumoFilamento || 0,
                  });
                  kitPecasByColor[colorKey].tempoImpressaoGrupo += (peca.tempoImpressao || 0) * item.quantidade * (peca.quantidade || 1);
                  kitPecasByColor[colorKey].consumoFilamentoGrupo += (peca.consumoFilamento || 0) * item.quantidade * (peca.quantidade || 1);
                  pedidoData.totalTempoMontagem += (peca.tempoMontagem || 0) * item.quantidade * (peca.quantidade || 1);
                } else if (kitProduct.tipo === 'modelo' && kitProduct.pecas) {
                  const modelo = kitProduct;
                  modelo.pecas.forEach(peca => { // 'peca' here is actually pecaDetails from fetchPecaDetails
                    if (peca.isPecaComposta && peca.partesCompostas && peca.partesCompostas.length > 0) {
                      // If the piece is composed, iterate over its parts
                      peca.partesCompostas.forEach(parte => {
                        const colorKey = peca.corFilamento; // Use the main filament color of the composed piece
                        if (!kitPecasByColor[colorKey]) {
                          kitPecasByColor[colorKey] = {
                            corFilamento: peca.corFilamento,
                            items: [],
                            tempoImpressaoGrupo: 0,
                            consumoFilamentoGrupo: 0,
                          };
                        }
                        kitPecasByColor[colorKey].items.push({
                          id: parte.parteId, // Use parteId for the individual part
                          nome: parte.nome,
                          quantidadePedido: item.quantidade * (modelo.quantidade || 1) * (parte.quantidade || 1), // Quantity of the part within the model within the kit
                          tempoImpressaoPeca: (peca.tempoImpressao || 0) / peca.partesCompostas.length, // Distribute composed piece time among its parts (simplified)
                          consumoFilamentoPeca: (peca.consumoFilamento || 0) / peca.partesCompostas.length, // Distribute composed piece filament among its parts (simplified)
                          identificador: parte.sku, // Use sku as identificador for the part
                        });
                        // Aggregate total time and filament for the group based on the composed piece's totals
                        kitPecasByColor[colorKey].tempoImpressaoGrupo += (peca.tempoImpressao || 0) * item.quantidade * (modelo.quantidade || 1) * (parte.quantidade || 1);
                        kitPecasByColor[colorKey].consumoFilamentoGrupo += (peca.consumoFilamento || 0) * item.quantidade * (modelo.quantidade || 1) * (parte.quantidade || 1);
                        pedidoData.totalTempoMontagem += (peca.tempoMontagem || 0) * item.quantidade * (modelo.quantidade || 1) * (parte.quantidade || 1);
                      });
                    } else {
                      // If it's a simple piece, use existing logic
                      const colorKey = peca.corFilamento;
                      if (!kitPecasByColor[colorKey]) {
                        kitPecasByColor[colorKey] = {
                          corFilamento: peca.corFilamento,
                          items: [],
                          tempoImpressaoGrupo: 0,
                          consumoFilamentoGrupo: 0,
                        };
                      }
                      kitPecasByColor[colorKey].items.push({
                        id: peca.id,
                        nome: peca.nome,
                        quantidadePedido: item.quantidade * (modelo.quantidade || 1) * (peca.quantidade || 1),
                        tempoImpressaoPeca: peca.tempoImpressao || 0,
                        consumoFilamentoPeca: peca.consumoFilamento || 0,
                      });
                      kitPecasByColor[colorKey].tempoImpressaoGrupo += (peca.tempoImpressao || 0) * item.quantidade * (modelo.quantidade || 1) * (peca.quantidade || 1);
                      kitPecasByColor[colorKey].consumoFilamentoGrupo += (peca.consumoFilamento || 0) * item.quantidade * (modelo.quantidade || 1) * (peca.quantidade || 1);
                      pedidoData.totalTempoMontagem += (peca.tempoMontagem || 0) * item.quantidade * (modelo.quantidade || 1) * (peca.quantidade || 1);
                    }
                  });
                }
              }
              for (const colorKey in kitPecasByColor) {
                const groupData = kitPecasByColor[colorKey];
                const key = `kit-${item.id}-${colorKey}`;
                const existingGroup = pedidoData.existingProductionGroups.find(g => g.sourceId === item.id && g.sourceType === 'kit' && g.corFilamento === groupData.corFilamento);
                productionGroupsMap.set(key, {
                  sourceId: item.id,
                  sourceType: 'kit',
                  sourceName: kitDetails.nome,
                  corFilamento: groupData.corFilamento,
                  items: groupData.items,
                  tempoImpressaoGrupo: groupData.tempoImpressaoGrupo,
                  consumoFilamentoGrupo: groupData.consumoFilamentoGrupo,
                  status: existingGroup?.status || 'aguardando', // Use existing status
                  estoqueAtualProduto: kitDetails.estoqueAtual || 0, // Add product stock
                  quantidadeNecessariaProduto: item.quantidade, // Required quantity for this kit
                });
              }
            }
          }
        }

        // Calculate total times and filament from the newly formed productionGroups
        pedidoData.totalTempoImpressao = Array.from(productionGroupsMap.values()).reduce((sum, group) => sum + group.tempoImpressaoGrupo, 0);
        pedidoData.totalConsumoFilamento = Array.from(productionGroupsMap.values()).reduce((sum, group) => sum + group.consumoFilamentoGrupo, 0);
        // totalTempoMontagem is already calculated within the loop for each piece.

        pedidoData.productionGroups = Array.from(productionGroupsMap.values()).sort((a, b) => {
          // Sort by source type, then source name, then filament color
          if (a.sourceType !== b.sourceType) {
            return a.sourceType.localeCompare(b.sourceType);
          }
          if (a.sourceName !== b.sourceName) {
            return a.sourceName.localeCompare(b.sourceName);
          }
          return a.corFilamento.localeCompare(b.corFilamento);
        }).map((group, index) => {
          // Find the current stock for the group's filament color
          const filamentInStock = filamentsData.find(f => f.cor === group.corFilamento && f.tipo === 'filamento');
          // Use 'estoqueAtual' for filament stock, as defined in estoque/page.jsx
          const estoqueAtualFilamento = filamentInStock ? (filamentInStock.estoqueAtual || 0) : 0;

          return {
            ...group,
            groupIndex: index + 1, // Add 1-based index for display
            estoqueAtualFilamento: estoqueAtualFilamento,
            quantidadeNecessariaFilamento: group.consumoFilamentoGrupo, // This is already calculated
          };
        });
        // Remove the temporary existingProductionGroups property
        delete pedidoData.existingProductionGroups;
        return pedidoData;
      }));
      setPedidos(pedidosList);
    } catch (error) {
      console.error("Error fetching pedidos: ", error);
    }
  };

  const updateProductionGroupStatus = async (pedidoId, groupIndex, newStatus) => {
    // If starting production, perform stock check
    if (newStatus === 'em_producao') {
      const pedidoToUpdate = pedidos.find(p => p.id === pedidoId);
      if (pedidoToUpdate) {
        const groupToStart = pedidoToUpdate.productionGroups[groupIndex];
        if (groupToStart) {
          const requiredFilament = groupToStart.quantidadeNecessariaFilamento;
          const availableFilamentStock = groupToStart.estoqueAtualFilamento;
          const requiredProduct = groupToStart.quantidadeNecessariaProduto;
          const availableProductStock = groupToStart.estoqueAtualProduto;

          if (availableFilamentStock < requiredFilament) {
            alert(`Estoque insuficiente de filamento ${groupToStart.corFilamento}. Necessário: ${formatFilament(requiredFilament)}, Disponível: ${formatFilament(availableFilamentStock)}.`);
            // Prevent status update if stock is insufficient
            return; 
          }

          // Check product stock for models and kits
          if (groupToStart.sourceType !== 'peca' && availableProductStock < requiredProduct) {
            alert(`Estoque insuficiente de ${groupToStart.sourceName}. Necessário: ${requiredProduct}, Disponível: ${availableProductStock}.`);
            // Prevent status update if product stock is insufficient
            return;
          }
        }
      }
    }

    // Store original states for potential rollback
    const originalPedidos = [...pedidos];
    const originalDisplayGroups = [...displayGroups];
    const originalActiveTab = activeTab;

    // Optimistic UI update for 'pedidos' state
    setPedidos(prevPedidos => {
      return prevPedidos.map(pedido => {
        if (pedido.id === pedidoId) {
          const updatedGroups = pedido.productionGroups.map((group, idx) => {
            if (idx === groupIndex) {
              return { ...group, status: newStatus };
            }
            return group;
          });

          // Re-evaluate pedido status locally for optimistic update
          let newPedidoStatus = pedido.status;
          const hasAnyGroupInProduction = updatedGroups.some(group => group.status === 'em_producao');
          const hasAllGroupsProducedOrMontados = updatedGroups.every(group => group.status === 'produzido' || group.status === 'montado');
          const hasAllGroupsMontados = updatedGroups.every(group => group.status === 'montado');
          const hasAnyGroupAguardando = updatedGroups.some(group => group.status === 'aguardando');

          if (hasAnyGroupInProduction) {
            newPedidoStatus = 'em_producao';
          } else if (hasAllGroupsMontados) {
            newPedidoStatus = 'concluido';
          } else if (hasAllGroupsProducedOrMontados) {
            newPedidoStatus = 'produzido';
          } else if (hasAnyGroupAguardando) {
            newPedidoStatus = 'aguardando';
          }

          return { ...pedido, productionGroups: updatedGroups, status: newPedidoStatus };
        }
        return pedido;
      });
    });

    // Optimistic UI update for 'displayGroups' state
    setDisplayGroups(prevDisplayGroups => {
      return prevDisplayGroups.map(group => {
        if (group.pedidoId === pedidoId && group.groupIndex - 1 === groupIndex) {
          return { ...group, status: newStatus };
        }
        return group;
      });
    });

    // Automatically switch tab if status changes to 'em_producao'
    if (newStatus === 'em_producao') {
      setActiveTab('em_producao');
    }

    // Now, update Firestore
    try {
      const pedidoRef = doc(db, 'pedidos', pedidoId);
      // Get the latest state of the document from Firestore before updating
      const currentPedidoSnap = await getDoc(pedidoRef);
      if (currentPedidoSnap.exists()) {
        const currentPedidoData = currentPedidoSnap.data();
        const updatedGroupsInFirestore = [...(currentPedidoData.productionGroups || [])];
        if (updatedGroupsInFirestore[groupIndex]) {
          updatedGroupsInFirestore[groupIndex].status = newStatus;
        }

        let newPedidoStatusInFirestore = currentPedidoData.status;
        const hasAnyGroupInProduction = updatedGroupsInFirestore.some(group => group.status === 'em_producao');
        const hasAllGroupsProducedOrMontados = updatedGroupsInFirestore.every(group => group.status === 'produzido' || group.status === 'montado');
        const hasAllGroupsMontados = updatedGroupsInFirestore.every(group => group.status === 'montado');
        const hasAnyGroupAguardando = updatedGroupsInFirestore.some(group => group.status === 'aguardando');

        if (hasAnyGroupInProduction) {
          newPedidoStatusInFirestore = 'em_producao';
        } else if (hasAllGroupsMontados) {
          newPedidoStatusInFirestore = 'concluido';
        } else if (hasAllGroupsProducedOrMontados) {
          newPedidoStatusInFirestore = 'produzido';
        } else if (hasAnyGroupAguardando) {
          newPedidoStatusInFirestore = 'aguardando';
        }

        await updateDoc(pedidoRef, {
          productionGroups: updatedGroupsInFirestore,
          status: newPedidoStatusInFirestore,
        });

        // After successful Firestore update, re-fetch all pedidos to ensure data consistency
        fetchPedidos(availableFilaments, availableProducts);
      } else {
        console.error("Pedido not found in Firestore for update.");
      }
    } catch (error) {
      console.error("Error updating production group status in Firestore: ", error);
      // Rollback optimistic update if Firestore update fails
      setPedidos(originalPedidos);
      setDisplayGroups(originalDisplayGroups);
      setActiveTab(originalActiveTab);
    }
  };

  const revertProductionGroupStatus = async (pedidoId, groupIndex, currentStatus) => {
    let previousStatus;
    switch (currentStatus) {
      case 'em_producao':
        previousStatus = 'aguardando';
        break;
      case 'produzido':
        previousStatus = 'em_producao';
        break;
      case 'montado':
        previousStatus = 'produzido';
        break;
      default:
        console.warn(`Cannot revert status from ${currentStatus}`);
        return;
    }
    await updateProductionGroupStatus(pedidoId, groupIndex, previousStatus);
  };

  const formatTime = (minutes) => {
    if (minutes === 0) return '0h 0m';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
  };

  const formatFilament = (grams) => {
    if (grams === 0) return '0g';
    if (grams < 1000) return `${grams.toFixed(2)}g`;
    return `${(grams / 1000).toFixed(2)}kg`;
  };

  const getFilteredDisplayGroups = () => {
    return displayGroups.filter(group => {
      if (activeTab === 'aguardando') {
        return group.status === 'aguardando';
      } else if (activeTab === 'em_producao') {
        return group.status === 'em_producao';
      } else if (activeTab === 'produzidos') {
        return group.status === 'produzido';
      } else if (activeTab === 'montados') {
        return group.status === 'montado' || group.status === 'concluido';
      }
      return true;
    });
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
            onClick={() => setActiveTab('produzidos')}
            className={`${
              activeTab === 'produzidos'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Produzidos
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
          pedidos.filter(p => p.status === 'aguardando' || p.productionGroups.some(g => g.status === 'aguardando')).length > 0 ? (
            pedidos.filter(p => p.status === 'aguardando' || p.productionGroups.some(g => g.status === 'aguardando')).map((pedido) => (
              <div key={pedido.id} className="bg-white shadow rounded-lg p-6">
                {/* Main Pedido Card Content */}
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900">Pedido #{pedido.numero}</h3>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    pedido.status === 'aguardando' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {pedido.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-gray-600 mb-2">Comprador: {pedido.comprador}</p>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-700 mb-4">
                  <div className="flex items-center">
                    <Hourglass className="h-4 w-4 mr-1 text-blue-500" />
                    <span>Impressão: {formatTime(pedido.totalTempoImpressao)}</span>
                  </div>
                  <div className="flex items-center">
                    <Package className="h-4 w-4 mr-1 text-green-500" />
                    <span>Filamento: {formatFilament(pedido.totalConsumoFilamento)}</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 mr-1 text-purple-500" />
                    <span>Montagem: {formatTime(pedido.totalTempoMontagem)}</span>
                  </div>
                </div>

                <h4 className="text-lg font-semibold text-gray-800 mb-3">Grupos de Impressão:</h4>
                <div className="space-y-4">
                  {pedido.productionGroups?.filter(g => g.status === 'aguardando').length > 0 ? (
                    pedido.productionGroups.filter(g => g.status === 'aguardando').map((group, groupIndex) => (
                      <div key={`${pedido.id}-${group.groupIndex}`} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        {/* Inner Group Card Content */}
                        <div className="flex justify-between items-center mb-2">
                          <h5 className="text-md font-medium text-gray-800">
                            Grupo #{group.groupIndex} - {group.sourceType === 'peca' && `Peça: ${group.sourceName || 'N/A'}`}
                            {group.sourceType === 'modelo' && `Modelo: ${group.sourceName || 'N/A'}`}
                            {group.sourceType === 'kit' && `Kit: ${group.sourceName || 'N/A'}`}
                          </h5>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            group.status === 'aguardando' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {group.status.replace('_', ' ')}
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
                                title={group.corFilamento}
                              />
                            )}
                          </div>
                          {/* New: Display Stock Information */}
                          <p className={group.estoqueAtualFilamento < group.quantidadeNecessariaFilamento ? 'text-red-500' : ''}>
                            Estoque Atual Filamento: {formatFilament(group.estoqueAtualFilamento)}
                          </p>
                          <p>Necessário Filamento: {formatFilament(group.quantidadeNecessariaFilamento)}</p>
                          {/* Display product stock for all types (peca, modelo, kit) */}
                          <p className={group.estoqueAtualProduto < group.quantidadeNecessariaProduto ? 'text-red-500' : ''}>
                            Estoque Atual Produto: {group.estoqueAtualProduto}
                          </p>
                          <p>Necessário Produto: {group.quantidadeNecessariaProduto}</p>
                        </div>
                        <ul className="list-disc list-inside text-sm text-gray-600 mb-3">
                          {group.items.map((item, itemIndex) => (
                            <li key={itemIndex}>
                              {item.nome} (x{item.quantidadePedido})
                            </li>
                          ))}
                        </ul>
                        <button
                          onClick={() => updateProductionGroupStatus(pedido.id, group.groupIndex - 1, 'em_producao')}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                        >
                          <Play className="h-3 w-3 mr-1" /> Iniciar Produção
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-600 text-sm">Nenhum grupo de impressão aguardando para este pedido.</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 col-span-full">
              <p className="text-gray-600">Nenhum pedido aguardando encontrado.</p>
            </div>
          )
        )}

        {(activeTab === 'em_producao' || activeTab === 'produzidos' || activeTab === 'montados') && (
          getFilteredDisplayGroups().length > 0 ? (
            getFilteredDisplayGroups().map((group, index) => (
              <div key={`${group.pedidoId}-${group.groupIndex}`} className="bg-white shadow rounded-lg p-6">
                {/* Group Card Content */}
                <h3 className="text-lg font-bold text-gray-900 mb-2">Pedido #{group.pedidoNumero}</h3>
                <div className="flex justify-between items-center mb-2">
                  <h5 className="text-md font-medium text-gray-800">
                    Grupo #{group.groupIndex} - {group.sourceType === 'peca' && `Peça: ${group.sourceName || 'N/A'}`}
                    {group.sourceType === 'modelo' && `Modelo: ${group.sourceName || 'N/A'}`}
                    {group.sourceType === 'kit' && `Kit: ${group.sourceName || 'N/A'}`}
                  </h5>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    group.status === 'aguardando' ? 'bg-yellow-100 text-yellow-800' :
                    group.status === 'em_producao' ? 'bg-blue-100 text-blue-800' :
                    group.status === 'produzido' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {group.status.replace('_', ' ')}
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
                        title={group.corFilamento}
                      />
                    )}
                  </div>
                </div>
                <ul className="list-disc list-inside text-sm text-gray-600 mb-3">
                  {group.items.map((item, itemIndex) => (
                    <li key={itemIndex}>
                      {item.nome} (x{item.quantidadePedido})
                    </li>
                  ))}
                </ul>
                {activeTab === 'em_producao' && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => updateProductionGroupStatus(group.pedidoId, group.groupIndex - 1, 'produzido')}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" /> Marcar como Produzido
                    </button>
                    <button
                      onClick={() => updateProductionGroupStatus(group.pedidoId, group.groupIndex - 1, 'aguardando')}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Pause className="h-3 w-3 mr-1" /> Pausar
                    </button>
                    <button
                      onClick={() => revertProductionGroupStatus(group.pedidoId, group.groupIndex - 1, group.status)}
                      className="inline-flex items-center px-3 py-1 border border-red-300 rounded-md shadow-sm text-xs font-medium text-red-700 bg-white hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Reverter
                    </button>
                  </div>
                )}
                {activeTab === 'produzidos' && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => updateProductionGroupStatus(group.pedidoId, group.groupIndex - 1, 'montado')}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700"
                    >
                      <FastForward className="h-3 w-3 mr-1" /> Marcar como Montado
                    </button>
                    <button
                      onClick={() => revertProductionGroupStatus(group.pedidoId, group.groupIndex - 1, group.status)}
                      className="inline-flex items-center px-3 py-1 border border-red-300 rounded-md shadow-sm text-xs font-medium text-red-700 bg-white hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Reverter
                    </button>
                  </div>
                )}
                {activeTab === 'montados' && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => revertProductionGroupStatus(group.pedidoId, group.groupIndex - 1, group.status)}
                      className="inline-flex items-center px-3 py-1 border border-red-300 rounded-md shadow-sm text-xs font-medium text-red-700 bg-white hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Reverter
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-12 col-span-full">
              <p className="text-gray-600">Nenhum grupo de impressão neste status.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
