"use client";

import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Trash2 } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import ProdutoPedidoSelectionModal from './ProdutoPedidoSelectionModal';

const PedidoFormModal = ({ isOpen, onClose, onSave, initialData }) => {
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
  }, [isOpen, initialData]);

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
        return { id: itemDocSnap.id, ...itemDocSnap.data(), type: itemType };
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

  const handleSubmit = (e) => {
    e.preventDefault();
    const pedidoData = {
      numero,
      comprador,
      status,
      dataCriacao: new Date(dataCriacao),
      dataPrevisao: new Date(dataPrevisao),
      dataConclusao: dataConclusao ? new Date(dataConclusao) : null,
      custos: { total: parseFloat(custoTotal) || 0 },
      precoTotal: parseFloat(precoTotal) || 0,
      produtos: items.map(item => ({ // Renamed from 'produtos' to 'items'
        id: item.id,
        nome: item.nome,
        sku: item.sku,
        tipo: item.type, // Use the 'type' property
        quantidade: parseFloat(item.quantity)
      })),
    };

    if (initialData?.id) {
      pedidoData.id = initialData.id;
    }

    onSave(pedidoData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 h-full w-full z-50 flex justify-center items-center">
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
