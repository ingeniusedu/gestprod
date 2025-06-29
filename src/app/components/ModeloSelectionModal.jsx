"use client";

import React, { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, getDocs } from 'firebase/firestore';

const ModeloSelectionModal = ({ isOpen, onClose, onSelectModelos, selectedModelos: initialSelectedModelos }) => {
  const [availableModelos, setAvailableModelos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModelos, setSelectedModelos] = useState(initialSelectedModelos || []);

  useEffect(() => {
    const fetchAvailableModelos = async () => {
      try {
        const modelosCollection = collection(db, 'modelos'); // Assuming 'modelos' is the collection name
        const modeloSnapshot = await getDocs(modelosCollection);
        const modelosList = modeloSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAvailableModelos(modelosList);
      } catch (error) {
        console.error("Error fetching available modelos: ", error);
      }
    };

    if (isOpen) {
      fetchAvailableModelos();
      setSelectedModelos(initialSelectedModelos || []); // Reset selected modelos when opening
    }
  }, [isOpen, initialSelectedModelos]);

  const filteredModelos = availableModelos.filter(modelo =>
    modelo.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    modelo.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCheckboxChange = (modelo) => {
    setSelectedModelos(prev => {
      if (prev.some(m => m.id === modelo.id)) {
        return prev.filter(m => m.id !== modelo.id);
      } else {
        return [...prev, { ...modelo, quantity: 1 }]; // Add with default quantity 1
      }
    });
  };

  const handleQuantityChange = (modeloId, quantity) => {
    setSelectedModelos(prev => prev.map(modelo =>
      modelo.id === modeloId ? { ...modelo, quantity: parseFloat(quantity) || 0 } : modelo
    ));
  };

  const handleAddSelected = () => {
    onSelectModelos(selectedModelos);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 h-full w-full z-50 flex justify-center items-center">
      <div className="relative bg-white rounded-lg shadow-xl p-8 w-full max-w-3xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-900">
            Selecionar Modelos
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mt-4 mb-4 flex items-center border border-gray-300 rounded-md shadow-sm">
          <Search className="h-5 w-5 text-gray-400 ml-3" />
          <input
            type="text"
            placeholder="Buscar modelos por nome ou SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          />
        </div>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Selecionar
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
              {filteredModelos.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                    Nenhum modelo encontrado.
                  </td>
                </tr>
              ) : (
                filteredModelos.map(modelo => {
                  const isSelected = selectedModelos.some(m => m.id === modelo.id);
                  const currentQuantity = isSelected ? selectedModelos.find(m => m.id === modelo.id).quantity : 1;
                  return (
                    <tr key={modelo.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleCheckboxChange(modelo)}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {modelo.sku}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {modelo.nome}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {isSelected && (
                          <input
                            type="number"
                            value={currentQuantity}
                            onChange={(e) => handleQuantityChange(modelo.id, e.target.value)}
                            className="mt-1 block w-24 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            min="1"
                            step="1"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })
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

export default ModeloSelectionModal;
