"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Insumo } from '../types';

interface InsumoSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selectedInsumos: { insumo: Insumo, quantidade: number }[]) => void;
  initialSelectedInsumos?: { insumo: Insumo, quantidade: number }[];
  insumoTipoFilter?: string | null;
}

export default function InsumoSelectionModal({ 
  isOpen, 
  onClose, 
  onSelect, 
  initialSelectedInsumos = [], 
  insumoTipoFilter = null 
}: InsumoSelectionModalProps) {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInsumos, setSelectedInsumos] = useState<Map<string, { insumo: Insumo, quantidade: number }>>(new Map());
  const [filterEmbalagem, setFilterEmbalagem] = useState(insumoTipoFilter === 'embalagem');
  const [filterMaterial, setFilterMaterial] = useState(insumoTipoFilter === 'material');

  // Memoize initialSelectedInsumos to prevent infinite re-renders
  const memoizedInitialSelectedInsumos = useMemo(() => initialSelectedInsumos, [initialSelectedInsumos]);

  useEffect(() => {
    if (isOpen) {
      const fetchInsumos = async () => {
        const insumosCollection = collection(db, 'insumos');
        const insumosSnapshot = await getDocs(insumosCollection);
        let insumosList = insumosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Insumo));
        
        if (insumoTipoFilter) {
          insumosList = insumosList.filter(insumo => insumo.tipo === insumoTipoFilter);
        }
        
        setInsumos(insumosList);
      };
      fetchInsumos();

      const initialMap = new Map<string, { insumo: Insumo, quantidade: number }>();
      memoizedInitialSelectedInsumos.forEach(item => initialMap.set(item.insumo.id, { insumo: item.insumo, quantidade: item.quantidade }));
      setSelectedInsumos(initialMap);
    }
  }, [isOpen, memoizedInitialSelectedInsumos, insumoTipoFilter]);

  const handleToggleInsumo = (insumo: Insumo) => {
    setSelectedInsumos(prev => {
      const newMap = new Map(prev);
      if (newMap.has(insumo.id)) {
        newMap.delete(insumo.id);
      } else {
        newMap.set(insumo.id, { insumo: insumo, quantidade: 1 });
      }
      return newMap;
    });
  };

  const handleQuantityChange = (insumoId: string, quantidade: number) => {
    setSelectedInsumos(prev => {
      const newMap = new Map(prev);
      if (newMap.has(insumoId)) {
        const item = newMap.get(insumoId);
        if (item) {
          item.quantidade = quantidade;
          newMap.set(insumoId, item);
        }
      }
      return newMap;
    });
  };

  const handleConfirmSelection = () => {
    const selectedArray = Array.from(selectedInsumos.values());
    onSelect(selectedArray);
    onClose();
  };

  const filteredInsumos = insumos.filter(insumo => {
    const searchMatch = insumo.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (insumo.tipo && insumo.tipo.toLowerCase().includes(searchTerm.toLowerCase()));

    const typeMatch = (!filterEmbalagem && !filterMaterial) ||
      (filterMaterial && insumo.tipo === 'material') ||
      (filterEmbalagem && insumo.tipo === 'embalagem');

    return searchMatch && typeMatch;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm h-full w-full z-50 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">Selecionar Insumos Adicionais</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="my-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, tipo ou unidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-md w-full"
            />
          </div>
          <div className="flex items-center space-x-4 mt-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filterEmbalagem}
                onChange={(e) => setFilterEmbalagem(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Embalagem</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filterMaterial}
                onChange={(e) => setFilterMaterial(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Material</span>
            </label>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="w-1/12 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                <th scope="col" className="w-3/12 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                <th scope="col" className="w-3/12 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                <th scope="col" className="w-2/12 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unidade</th>
                <th scope="col" className="w-3/12 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantidade</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredInsumos.map((insumo) => (
                <tr key={insumo.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedInsumos.has(insumo.id)}
                      onChange={() => handleToggleInsumo(insumo)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{insumo.nome}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{insumo.tipo}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="number"
                      min="1"
                      value={selectedInsumos.get(insumo.id)?.quantidade || ''}
                      onChange={(e) => handleQuantityChange(insumo.id, parseFloat(e.target.value))}
                      disabled={!selectedInsumos.has(insumo.id)}
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
            Adicionar Selecionados ({selectedInsumos.size})
          </button>
        </div>
      </div>
    </div>
  );
}
