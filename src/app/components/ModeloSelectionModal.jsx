"use client";

import React, { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { getModelos } from '../services/firebase'; // Import getModelos

export default function ModeloSelectionModal({ isOpen, onClose, onSelect, initialSelectedModelos = [] }) {
  const [modelos, setModelos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModelos, setSelectedModelos] = useState(new Map());

  useEffect(() => {
    if (isOpen) {
      const fetchModelos = async () => {
        try {
          const modelosList = await getModelos();
          setModelos(modelosList);
        } catch (error) {
          console.error("Error fetching modelos: ", error);
        }
      };
      fetchModelos();

      const initialMap = new Map();
      initialSelectedModelos.forEach(item => initialMap.set(item.id, { ...item })); // Ensure full item is stored
      setSelectedModelos(initialMap);
    }
  }, [isOpen, initialSelectedModelos]);

  const handleToggleModelo = (modelo) => {
    setSelectedModelos(prev => {
      const newMap = new Map(prev);
      if (newMap.has(modelo.id)) {
        newMap.delete(modelo.id);
      } else {
        newMap.set(modelo.id, { ...modelo, quantidade: 1 }); // Default quantity
      }
      return newMap;
    });
  };

  const handleQuantityChange = (modeloId, quantidade) => {
    setSelectedModelos(prev => {
      const newMap = new Map(prev);
      if (newMap.has(modeloId)) {
        const item = newMap.get(modeloId);
        item.quantidade = quantidade;
        newMap.set(modeloId, item);
      }
      return newMap;
    });
  };

  const handleConfirmSelection = () => {
    onSelect(Array.from(selectedModelos.values()));
    onClose();
  };

  const filteredModelos = modelos.filter(modelo =>
    modelo.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    modelo.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm h-full w-full z-50 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">Selecionar Modelos</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="my-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-md w-full"
            />
          </div>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="w-1/12 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                <th scope="col" className="w-3/12 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                <th scope="col" className="w-5/12 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                <th scope="col" className="w-3/12 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantidade</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredModelos.map((modelo) => (
                <tr key={modelo.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedModelos.has(modelo.id)}
                      onChange={() => handleToggleModelo(modelo)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{modelo.sku}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{modelo.nome}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="number"
                      min="1"
                      value={selectedModelos.get(modelo.id)?.quantidade || ''}
                      onChange={(e) => handleQuantityChange(modelo.id, parseInt(e.target.value, 10))}
                      disabled={!selectedModelos.has(modelo.id)}
                      className="w-20 p-1 border rounded"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmSelection}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Adicionar Selecionados ({selectedModelos.size})
          </button>
        </div>
      </div>
    </div>
  );
}
