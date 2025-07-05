"use client";

import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Trash2 } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import ProdutoPedidoSelectionModal from './ProdutoPedidoSelectionModal';

const PedidoFormModal = ({ isOpen, onClose, onSave, initialData }) => {
  const [availableFilaments, setAvailableFilaments] = useState([]);

  useEffect(() => {
    const fetchAvailableFilaments = async () => {
      try {
        const insumosCollection = collection(db, 'insumos');
        const insumoSnapshot = await getDocs(insumosCollection);
        const filamentsList = insumoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(i => i.tipo === 'filamento');
        setAvailableFilaments(filamentsList);
      } catch (error) {
        console.error("Error fetching available filaments: ", error);
      }
    };

    if (isOpen) {
      fetchAvailableFilaments();
    }
  }, [isOpen]);

  // Helper functions to fetch details
  const fetchPecaDetails = async (pecaId) => {
    try {
      const pecaDocRef = doc(db, 'pecas', pecaId);
      const pecaDocSnap = await getDoc(pecaDocRef);
      if (pecaDocSnap.exists()) {
        const pecaData = { id: pecaDocSnap.id, ...pecaDocSnap.data() };
        
        let totalConsumoFilamento = 0;
        let mainFilamentColor = 'N/A';

        // Calculate total filament consumption and determine main color
        if (pecaData.insumos && availableFilaments.length > 0) {
          for (const insumoRef of pecaData.insumos) {
            const filament = availableFilaments.find(f => f.id === insumoRef.insumoId);
            if (filament && filament.tipo === 'filamento') {
              totalConsumoFilamento += (insumoRef.quantidade || 0); // Assuming quantidade in insumos is in grams/meters
              if (filament.cor) {
                mainFilamentColor = filament.cor; // Simple assignment, could be more complex for multiple colors
              }
            }
          }
        }

        return { 
          ...pecaData, 
          consumoFilamento: totalConsumoFilamento, 
          corFilamento: mainFilamentColor 
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

  const fetchModeloDetails = async (modeloId) => {
    try {
      const modeloDocRef = doc(db, 'modelos', modeloId);
      const modeloDocSnap = await getDoc(modeloDocRef);
      if (modeloDocSnap.exists()) {
        const modeloData = { id: modeloDocSnap.id, ...modeloDocSnap.data() };
        const pecasPromises = modeloData.pecas.map(p => fetchPecaDetails(p.id));
        modeloData.pecas = (await Promise.all(pecasPromises)).filter(Boolean);
        return modeloData;
      } else {
        console.warn(`Modelo with ID ${modeloId} not found.`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching modelo details for ${modeloId}:`, error);
      return null;
    }
  };

  const fetchKitDetails = async (kitId) => {
    try {
      const kitDocRef = doc(db, 'kits', kitId);
      const kitDocSnap = await getDoc(kitDocRef);
      if (kitDocSnap.exists()) {
        const kitData = { id: kitDocSnap.id, ...kitDocSnap.data() };
        const produtosPromises = (kitData.produtos || []).map(async (p) => {
          if (p.tipo === 'modelo') {
            return await fetchModeloDetails(p.id);
          } else if (p.tipo === 'peca') {
            return await fetchPecaDetails(p.id);
          }
          return null;
        });
        kitData.produtos = (await Promise.all(produtosPromises)).filter(Boolean);
        return kitData;
      } else {
        console.warn(`Kit with ID ${kitId} not found.`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching kit details for ${kitId}:`, error);
      return null;
    }
  };

  const [numero, setNumero] = useState('');
  const [comprador, setComprador] = useState('');
  const [status, setStatus] = useState('aguardando'); // 'aguardando', 'em_producao', 'concluido', 'cancelado'
  const [dataCriacao, setDataCriacao] = useState('');
  const [dataPrevisao, setDataPrevisao] = useState('');
  const [dataConclusao, setDataConclusao] = useState('');
  const [custoTotal, setCustoTotal] = useState('');
  const [precoTotal, setPrecoTotal] = useState('');
  const [items, setItems] = useState([]); // Stores selected products, models, and pieces for the order
  const [isItemSelectionModalOpen, setIsItemSelectionModalOpen] = useState(false);

  useEffect(() => {
    const formatDate = (dateField) => {
      if (!dateField) return '';
      let date;
      // Check if it's a Firestore Timestamp
      if (typeof dateField.toDate === 'function') {
        date = dateField.toDate();
      } else if (dateField instanceof Date) {
        date = dateField;
      } else {
        // Assume it's already a string in YYYY-MM-DD format or can be parsed
        date = new Date(dateField);
      }
      return date.toISOString().split('T')[0];
    };

    if (isOpen && initialData) {
      setNumero(initialData.numero || '');
      setComprador(initialData.comprador || '');
      setStatus(initialData.status || 'aguardando');
      setDataCriacao(formatDate(initialData.dataCriacao));
      setDataPrevisao(formatDate(initialData.dataPrevisao));
      setDataConclusao(initialData.dataConclusao ? formatDate(initialData.dataConclusao) : '');
      setCustoTotal(initialData.custos?.total?.toFixed(2) || '');
      setPrecoTotal(initialData.precoTotal?.toFixed(2) || '');
      
      const loadInitialItems = async () => {
        const detailedItems = await Promise.all(initialData.produtos.map(async (p) => { // initialData.produtos contains all types
          const details = await fetchItemDetails(p.id, p.tipo);
          return details ? { ...p, ...details, quantity: parseFloat(p.quantidade) || 0 } : { ...p, quantity: parseFloat(p.quantidade) || 0 };
        }));
        setItems(detailedItems.filter(Boolean));
      };
      loadInitialItems();

    } else if (isOpen && !initialData) {
      // Reset form for new order
      setNumero('');
      setComprador('');
      setStatus('aguardando');
      setDataCriacao(new Date().toISOString().split('T')[0]); // Default to today
      setDataPrevisao('');
      setDataConclusao('');
      setCustoTotal('');
      setPrecoTotal('');
      setItems([]);
    }
  }, [isOpen, initialData, availableFilaments.length]); // Added availableFilaments.length to dependency array

  useEffect(() => {
    const calculateTotals = () => {
      let totalCusto = 0;
      let totalPreco = 0;
      items.forEach(item => {
        const quantity = parseFloat(item.quantity) || 0;
        const custo = parseFloat(item.custoCalculado || item.custo || 0); // Use custoCalculado for products/models, custo for pieces
        const preco = parseFloat(item.precoSugerido || item.preco || 0); // Use precoSugerido for products/models, preco for pieces
        totalCusto += custo * quantity;
        totalPreco += preco * quantity;
      });
      setCustoTotal(totalCusto.toFixed(2));
      setPrecoTotal(totalPreco.toFixed(2));
    };

    calculateTotals();
  }, [items]);

  const fetchItemDetails = async (itemId, itemType) => {
    try {
      let collectionName;
      if (itemType === 'kit') {
        collectionName = 'kits';
      } else if (itemType === 'modelo') {
        collectionName = 'modelos';
      } else if (itemType === 'peca') {
        collectionName = 'pecas';
      } else {
        console.warn(`Unknown item type: ${itemType}`);
        return null;
      }

      const itemDocRef = doc(db, collectionName, itemId);
      const itemDocSnap = await getDoc(itemDocRef);
      if (itemDocSnap.exists()) {
        const data = itemDocSnap.data();
        if (itemType === 'peca') {
          let totalConsumoFilamento = 0;
          let mainFilamentColor = 'N/A';
          if (data.insumos && availableFilaments.length > 0) {
            for (const insumoRef of data.insumos) {
              const filament = availableFilaments.find(f => f.id === insumoRef.insumoId);
              if (filament && filament.tipo === 'filamento') {
                totalConsumoFilamento += (insumoRef.quantidade || 0);
                if (filament.cor) {
                  mainFilamentColor = filament.cor;
                }
              }
            }
          }
          return { id: itemDocSnap.id, ...data, type: itemType, consumoFilamento: totalConsumoFilamento, corFilamento: mainFilamentColor };
        }
        return { id: itemDocSnap.id, ...data, type: itemType };
      } else {
        console.warn(`${itemType} with ID ${itemId} not found.`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching details for ${itemType} ${itemId}:`, error);
      return null;
    }
  };

  const handleOpenItemSelectionModal = () => {
    setIsItemSelectionModalOpen(true);
  };

  const handleCloseItemSelectionModal = () => {
    setIsItemSelectionModalOpen(false);
  };

  const handleSelectItems = async (selectedNewItems) => {
    const updatedItems = [...items];
    const newItemsToFetch = [];

    selectedNewItems.forEach(newItem => {
      const existingIndex = updatedItems.findIndex(item => item.id === newItem.id);
      if (existingIndex > -1) {
        updatedItems[existingIndex].quantity = parseFloat(newItem.quantidade) || 0;
      } else {
        newItemsToFetch.push({ ...newItem, quantity: parseFloat(newItem.quantidade) || 0 });
      }
    });

    const fetchedNewItems = await Promise.all(newItemsToFetch.map(async (item) => {
      const details = await fetchItemDetails(item.id, item.tipo);
      return details ? { ...item, ...details } : null;
    }));

    setItems([...updatedItems, ...fetchedNewItems.filter(Boolean)]);
  };

  const handleRemoveItem = (itemIdToRemove) => {
    setItems(prev => prev.filter(item => item.id !== itemIdToRemove));
  };

  const handleItemQuantityChange = (itemId, quantity) => {
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, quantity: parseFloat(quantity) || 0 } : item
    ));
  };

  const handleSubmit = async (e) => { // Made async
    e.preventDefault();

    const productionGroupsMap = new Map(); // Key: `${sourceType}-${sourceId}-${corFilamento}`, Value: group object

    for (const item of items) {
      if (item.type === 'peca') {
        const pecaDetails = await fetchPecaDetails(item.id);
        if (pecaDetails) {
          const key = `peca-${item.id}-${pecaDetails.corFilamento || ''}`;
          if (!productionGroupsMap.has(key)) {
            productionGroupsMap.set(key, {
              sourceId: item.id,
              sourceType: 'peca',
              sourceName: pecaDetails.nome || 'N/A',
              corFilamento: pecaDetails.corFilamento || 'N/A',
              items: [],
              tempoImpressaoGrupo: 0,
              consumoFilamentoGrupo: 0,
              status: 'aguardando', // Initial status
            });
          }
          const group = productionGroupsMap.get(key);
          group.items.push({
            id: pecaDetails.id,
            nome: pecaDetails.nome || 'N/A',
            quantidadePedido: item.quantity || 0,
            tempoImpressaoPeca: pecaDetails.tempoImpressao || 0,
            consumoFilamentoPeca: pecaDetails.consumoFilamento || 0,
          });
          group.tempoImpressaoGrupo += (pecaDetails.tempoImpressao || 0) * (item.quantity || 0);
          group.consumoFilamentoGrupo += (pecaDetails.consumoFilamento || 0) * (item.quantity || 0);
        }
      } else if (item.type === 'modelo') {
        const modeloDetails = await fetchModeloDetails(item.id);
        if (modeloDetails && modeloDetails.pecas) {
          const modelPecasByColor = {};
          modeloDetails.pecas.forEach(peca => {
            const colorKey = peca.corFilamento || '';
            if (!modelPecasByColor[colorKey]) {
              modelPecasByColor[colorKey] = {
                corFilamento: peca.corFilamento || 'N/A',
                items: [],
                tempoImpressaoGrupo: 0,
                consumoFilamentoGrupo: 0,
              };
            }
            modelPecasByColor[colorKey].items.push({
              id: peca.id,
              nome: peca.nome || 'N/A',
              quantidadePedido: item.quantity * (peca.quantidade || 1) || 0,
              tempoImpressaoPeca: peca.tempoImpressao || 0,
              consumoFilamentoPeca: peca.consumoFilamento || 0,
            });
            modelPecasByColor[colorKey].tempoImpressaoGrupo += (peca.tempoImpressao || 0) * (item.quantity * (peca.quantidade || 1) || 0);
            modelPecasByColor[colorKey].consumoFilamentoGrupo += (peca.consumoFilamento || 0) * (item.quantity * (peca.quantidade || 1) || 0);
          });

          for (const colorKey in modelPecasByColor) {
            const groupData = modelPecasByColor[colorKey];
            const key = `modelo-${item.id}-${colorKey}`;
            productionGroupsMap.set(key, {
              sourceId: item.id,
              sourceType: 'modelo',
              sourceName: modeloDetails.nome || 'N/A',
              corFilamento: groupData.corFilamento,
              items: groupData.items,
              tempoImpressaoGrupo: groupData.tempoImpressaoGrupo,
              consumoFilamentoGrupo: groupData.consumoFilamentoGrupo,
              status: 'aguardando', // Initial status
            });
          }
        }
      } else if (item.type === 'kit') {
        const kitDetails = await fetchKitDetails(item.id);
        if (kitDetails && kitDetails.produtos) {
          const kitPecasByColor = {};
          for (const kitProduct of kitDetails.produtos) {
            if (kitProduct.tipo === 'peca') {
              const peca = kitProduct;
              const colorKey = peca.corFilamento || '';
              if (!kitPecasByColor[colorKey]) {
                kitPecasByColor[colorKey] = {
                  corFilamento: peca.corFilamento || 'N/A',
                  items: [],
                  tempoImpressaoGrupo: 0,
                  consumoFilamentoGrupo: 0,
                };
              }
              kitPecasByColor[colorKey].items.push({
                id: peca.id,
                nome: peca.nome || 'N/A',
                quantidadePedido: item.quantity * (peca.quantidade || 1) || 0,
                tempoImpressaoPeca: peca.tempoImpressao || 0,
                consumoFilamentoPeca: peca.consumoFilamento || 0,
              });
              kitPecasByColor[colorKey].tempoImpressaoGrupo += (peca.tempoImpressao || 0) * (item.quantity * (peca.quantidade || 1) || 0);
              kitPecasByColor[colorKey].consumoFilamentoGrupo += (peca.consumoFilamento || 0) * (item.quantity * (peca.quantidade || 1) || 0);
            } else if (kitProduct.tipo === 'modelo' && kitProduct.pecas) {
              const modelo = kitProduct;
              modelo.pecas.forEach(peca => {
                const colorKey = peca.corFilamento || '';
                if (!kitPecasByColor[colorKey]) {
                  kitPecasByColor[colorKey] = {
                    corFilamento: peca.corFilamento || 'N/A',
                    items: [],
                    tempoImpressaoGrupo: 0,
                    consumoFilamentoGrupo: 0,
                  };
                }
                kitPecasByColor[colorKey].items.push({
                  id: peca.id,
                  nome: peca.nome || 'N/A',
                  quantidadePedido: item.quantity * (modelo.quantidade || 1) * (peca.quantidade || 1) || 0,
                  tempoImpressaoPeca: peca.tempoImpressao || 0,
                  consumoFilamentoPeca: peca.consumoFilamento || 0,
                });
                kitPecasByColor[colorKey].tempoImpressaoGrupo += (peca.tempoImpressao || 0) * (item.quantity * (modelo.quantidade || 1) * (peca.quantidade || 1) || 0);
                kitPecasByColor[colorKey].consumoFilamentoGrupo += (peca.consumoFilamento || 0) * (item.quantity * (modelo.quantidade || 1) * (peca.quantidade || 1) || 0);
              });
            }
          }
          for (const colorKey in kitPecasByColor) {
            const groupData = kitPecasByColor[colorKey];
            const key = `kit-${item.id}-${colorKey}`;
            productionGroupsMap.set(key, {
              sourceId: item.id,
              sourceType: 'kit',
              sourceName: kitDetails.nome || 'N/A',
              corFilamento: groupData.corFilamento,
              items: groupData.items,
              tempoImpressaoGrupo: groupData.tempoImpressaoGrupo,
              consumoFilamentoGrupo: groupData.consumoFilamentoGrupo,
              status: 'aguardando', // Initial status
            });
          }
        }
      }
    }

    const productionGroups = Array.from(productionGroupsMap.values()).sort((a, b) => {
      if (a.sourceType !== b.sourceType) {
        return a.sourceType.localeCompare(b.sourceType);
      }
      if (a.sourceName !== b.sourceName) {
        return a.sourceName.localeCompare(b.sourceName);
      }
      return a.corFilamento.localeCompare(b.corFilamento);
    }).map((group, index) => ({
      ...group,
      groupIndex: index + 1 // Add 1-based index for display
    }));

    const pedidoData = {
      numero,
      comprador,
      status,
      dataCriacao: new Date(dataCriacao),
      dataPrevisao: new Date(dataPrevisao),
      dataConclusao: dataConclusao ? new Date(dataConclusao) : null,
      custos: { total: parseFloat(custoTotal) || 0 },
      precoTotal: parseFloat(precoTotal) || 0,
      produtos: items.map(item => ({
        id: item.id,
        nome: item.nome,
        sku: item.sku,
        tipo: item.type,
        quantidade: parseFloat(item.quantity)
      })),
      productionGroups: productionGroups, // Add the calculated production groups
    };

    if (initialData?.id) {
      pedidoData.id = initialData.id;
      // If editing, merge with existing productionGroups to preserve status
      if (initialData.productionGroups) {
        pedidoData.productionGroups = pedidoData.productionGroups.map(newGroup => {
          const existingGroup = initialData.productionGroups.find(
            oldGroup => oldGroup.sourceId === newGroup.sourceId &&
                        oldGroup.sourceType === newGroup.sourceType &&
                        oldGroup.corFilamento === newGroup.corFilamento
          );
          return existingGroup ? { ...newGroup, status: existingGroup.status } : newGroup;
        });
      }
    }

    onSave(pedidoData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm h-full w-full z-50 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="relative bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-900">
            {initialData ? 'Editar Pedido' : 'Novo Pedido'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          <form id="pedido-form" onSubmit={handleSubmit} className="mt-6 space-y-6">
            {/* Campos do Pedido */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="numero" className="block text-sm font-medium text-gray-700">
                  Número do Pedido
                </label>
                <input
                  type="text"
                  id="numero"
                  name="numero"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="comprador" className="block text-sm font-medium text-gray-700">
                  Comprador
                </label>
                <input
                  type="text"
                  id="comprador"
                  name="comprador"
                  value={comprador}
                  onChange={(e) => setComprador(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                id="status"
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="aguardando">Aguardando</option>
                <option value="em_producao">Em Produção</option>
                <option value="concluido">Concluído</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="dataCriacao" className="block text-sm font-medium text-gray-700">
                  Data de Criação
                </label>
                <input
                  type="date"
                  id="dataCriacao"
                  name="dataCriacao"
                  value={dataCriacao}
                  onChange={(e) => setDataCriacao(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="dataPrevisao" className="block text-sm font-medium text-gray-700">
                  Data de Previsão
                </label>
                <input
                  type="date"
                  id="dataPrevisao"
                  name="dataPrevisao"
                  value={dataPrevisao}
                  onChange={(e) => setDataPrevisao(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="dataConclusao" className="block text-sm font-medium text-gray-700">
                  Data de Conclusão
                </label>
                <input
                  type="date"
                  id="dataConclusao"
                  name="dataConclusao"
                  value={dataConclusao}
                  onChange={(e) => setDataConclusao(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="custoTotal" className="block text-sm font-medium text-gray-700">
                  Custo Total (R$)
                </label>
                <input
                  type="number"
                  id="custoTotal"
                  name="custoTotal"
                  value={custoTotal}
                  readOnly
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 bg-gray-50 text-gray-900 sm:text-sm"
                  step="0.01"
                />
              </div>
              <div>
                <label htmlFor="precoTotal" className="block text-sm font-medium text-gray-700">
                  Preço Total (R$)
                </label>
                <input
                  type="number"
                  id="precoTotal"
                  name="precoTotal"
                  value={precoTotal}
                  readOnly
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 bg-gray-50 text-gray-900 sm:text-sm"
                  step="0.01"
                />
              </div>
            </div>

            {/* Produtos do Pedido */}
            <div className="space-y-4">
              <h4 className="text-lg font-medium text-gray-900">Itens do Pedido</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        SKU
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nome
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quantidade
                      </th>
                      <th scope="col" className="relative px-6 py-3">
                        <span className="sr-only">Remover</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.sku}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.nome}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.type}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleItemQuantityChange(item.id, e.target.value)}
                            className="mt-1 block w-24 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            min="1"
                            step="1"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={handleOpenItemSelectionModal}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Item
              </button>
            </div>
          </form>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="pedido-form"
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Salvar Pedido
          </button>
        </div>
      </div>
      <ProdutoPedidoSelectionModal
        isOpen={isItemSelectionModalOpen}
        onClose={handleCloseItemSelectionModal}
        onSelectItems={handleSelectItems}
        initialSelectedItems={items}
      />
    </div>
  );
};

export default PedidoFormModal;
