"use client";

import React, { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, getDocs } from 'firebase/firestore';

import { Gift, Box, Puzzle } from 'lucide-react'; // Icons for kit, model, piece

const ProdutoPedidoSelectionModal = ({ isOpen, onClose, onSelectItems, initialSelectedItems }) => {
  const [availableItems, setAvailableItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [quantities, setQuantities] = useState({}); // { itemId: quantity }
  const [filterTypes, setFilterTypes] = useState({
    kit: true,
    modelo: true,
    peca: true,
  });

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const [kitsSnapshot, modelosSnapshot, pecasSnapshot] = await Promise.all([
          getDocs(collection(db, 'kits')), // Fetch from 'kits' collection
          getDocs(collection(db, 'modelos')),
          getDocs(collection(db, 'pecas')),
        ]);

        const allItems = [
          ...kitsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'kit' })), // Type 'kit'
          ...modelosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'modelo' })),
          ...pecasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'peca' })),
        ];
        setAvailableItems(allItems);

        // Initialize quantities based on already selected items
        const initialQuantities = {};
        initialSelectedItems.forEach(item => {
          initialQuantities[item.id] = item.quantity;
        });
        setQuantities(initialQuantities);

      } catch (error) {
        console.error("Error fetching items: ", error);
      }
    };

    if (isOpen) {
      fetchItems();
      setSearchTerm(''); // Clear search term on open
      setFilterTypes({ kit: true, modelo: true, peca: true }); // Reset filters on open
    }
  }, [isOpen, initialSelectedItems]);

  const handleQuantityChange = (id, value) => {
    setQuantities(prev => ({
      ...prev,
      [id]: value,
    }));
  };

  const handleFilterChange = (type) => {
    setFilterTypes(prev => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const getFilteredItems = () => {
    const allSelectedItems = availableItems.filter(item => quantities[item.id] && parseFloat(quantities[item.id]) > 0);

    const searchFilteredItems = availableItems.filter(item => {
      const matchesSearch = item.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            item.sku.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterTypes[item.type];
      return matchesSearch && matchesFilter;
    });

    // Separate items: selected items, and search results that are not already selected
    const selectedItemIds = new Set(allSelectedItems.map(item => item.id));
    const searchResultItems = searchFilteredItems.filter(item => !selectedItemIds.has(item.id));

    return { selectedItems: allSelectedItems, searchResultItems: searchResultItems };
  };

  const getItemIcon = (type) => {
    switch (type) {
      case 'kit':
        return <Gift className="h-5 w-5 text-blue-500" />; // Changed icon for kit
      case 'modelo':
        return <Box className="h-5 w-5 text-green-500" />;
      case 'peca':
        return <Puzzle className="h-5 w-5 text-purple-500" />;
      default:
        return null;
    }
  };

  const handleAddSelected = () => {
    const selectedItems = availableItems
      .filter(item => quantities[item.id] && parseFloat(quantities[item.id]) > 0)
      .map(item => ({
        id: item.id,
        nome: item.nome,
        sku: item.sku,
        tipo: item.type,
        quantidade: parseFloat(quantities[item.id]),
      }));
    onSelectItems(selectedItems);
    onClose();
  };

  if (!isOpen) return null;

  const { selectedItems, searchResultItems } = getFilteredItems();

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 h-full w-full z-50 flex justify-center items-center">
      <div className="relative bg-white rounded-lg shadow-xl p-8 w-full max-w-3xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-900">
            Adicionar Kits, Modelos ou Peças
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mt-4 flex-shrink-0">
          <div className="flex space-x-4 mb-4">
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                className="form-checkbox h-5 w-5 text-blue-600"
                checked={filterTypes.kit}
                onChange={() => handleFilterChange('kit')}
              />
              <span className="ml-2 text-gray-700">Kits</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                className="form-checkbox h-5 w-5 text-green-600"
                checked={filterTypes.modelo}
                onChange={() => handleFilterChange('modelo')}
              />
              <span className="ml-2 text-gray-700">Modelos</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                className="form-checkbox h-5 w-5 text-purple-600"
                checked={filterTypes.peca}
                onChange={() => handleFilterChange('peca')}
              />
              <span className="ml-2 text-gray-700">Peças</span>
            </label>
          </div>
          <div className="mb-4 flex items-center border border-gray-300 rounded-md shadow-sm">
            <Search className="h-5 w-5 text-gray-400 ml-3" />
            <input
              type="text"
              placeholder="Buscar por nome ou SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            />
          </div>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SKU
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nome
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantidade
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {selectedItems.length > 0 && [
                <tr key="selected-header" className="bg-blue-50"><td colSpan="4" className="px-6 py-2 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">Itens Selecionados</td></tr>,
                ...selectedItems.map(item => (
                  <tr key={item.id} className="bg-blue-50"><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        {getItemIcon(item.type)}
                        <span className="ml-2">{item.type === 'peca' ? 'Peça' : item.type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.sku}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.nome}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="number"
                        value={quantities[item.id] || ''}
                        onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                        className="mt-1 block w-24 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        min="0"
                        step="1"
                      />
                    </td>
                  </tr>
                ))
              ]}

              {searchResultItems.length === 0 && selectedItems.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                    Nenhum item encontrado.
                  </td>
                </tr>
              ) : (
                searchResultItems.map(item => (
                  <tr key={item.id}><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        {getItemIcon(item.type)}
                        <span className="ml-2">{item.type === 'peca' ? 'Peça' : item.type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.sku}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.nome}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="number"
                        value={quantities[item.id] || ''}
                        onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                        className="mt-1 block w-24 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        min="0"
                        step="1"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
            type="button"
            onClick={handleAddSelected}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Adicionar Selecionados
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProdutoPedidoSelectionModal;
