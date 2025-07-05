"use client";

import React, { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, getDocs } from 'firebase/firestore';

export default function ParteSelectionModal({ isOpen, onClose, onSelect }) {
  const [partes, setPartes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchPartes = async () => {
        setLoading(true);
        try {
          const partesCollection = collection(db, 'partes');
          const partesSnapshot = await getDocs(partesCollection);
          setPartes(partesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
          console.error("Error fetching partes: ", error);
        }
        setLoading(false);
      };
      fetchPartes();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredPartes = partes.filter(parte =>
    parte.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    parte.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (parte) => {
    onSelect(parte);
    onClose();
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm h-full w-full z-50 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="relative bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">Selecionar Parte Existente</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
        </div>

        <div className="flex-grow overflow-y-auto mt-4 pr-2 -mr-2">
          {loading ? (
            <p className="text-center text-gray-500">Carregando...</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredPartes.length > 0 ? (
                filteredPartes.map(parte => (
                  <li
                    key={parte.id}
                    onClick={() => handleSelect(parte)}
                    className="p-4 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{parte.nome}</p>
                      <p className="text-sm text-gray-500">SKU: {parte.sku}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-gray-500">Estoque</p>
                        <p className="font-semibold text-gray-800">{parte.estoque || 0}</p>
                    </div>
                  </li>
                ))
              ) : (
                <p className="text-center text-gray-500 py-8">Nenhuma parte encontrada.</p>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
