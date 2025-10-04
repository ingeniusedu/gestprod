"use client";

import React, { useState, useEffect } from 'react';
import { Search, Package, Box, Component } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Kit, Modelo, Peca } from '../types';

interface ProductImportSelectorProps {
  onProductSelect: (productId: string, productType: 'kit' | 'modelo' | 'peca') => void;
}

export default function ProductImportSelector({ onProductSelect }: ProductImportSelectorProps) {
  const [selectedProductType, setSelectedProductType] = useState<'kit' | 'modelo' | 'peca'>('kit');
  const [searchTerm, setSearchTerm] = useState('');
  const [kits, setKits] = useState<Kit[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const [kitsSnapshot, modelosSnapshot, pecasSnapshot] = await Promise.all([
          getDocs(collection(db, 'kits')),
          getDocs(collection(db, 'modelos')),
          getDocs(collection(db, 'pecas')),
        ]);

        setKits(kitsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Kit[]);
        setModelos(modelosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Modelo[]);
        setPecas(pecasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Peca[]);
      } catch (err) {
        console.error("Error fetching products:", err);
        setError("Failed to load products. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const getFilteredProducts = () => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    switch (selectedProductType) {
      case 'kit':
        return kits.filter(kit =>
          kit.nome.toLowerCase().includes(lowerCaseSearchTerm) ||
          kit.sku.toLowerCase().includes(lowerCaseSearchTerm)
        ).sort((a, b) => a.nome.localeCompare(b.nome));
      case 'modelo':
        return modelos.filter(modelo =>
          modelo.nome.toLowerCase().includes(lowerCaseSearchTerm) ||
          modelo.sku.toLowerCase().includes(lowerCaseSearchTerm)
        ).sort((a, b) => a.nome.localeCompare(b.nome));
      case 'peca':
        return pecas.filter(peca =>
          peca.nome.toLowerCase().includes(lowerCaseSearchTerm) ||
          peca.sku.toLowerCase().includes(lowerCaseSearchTerm)
        ).sort((a, b) => a.nome.localeCompare(b.nome));
      default:
        return [];
    }
  };

  const filteredProducts = getFilteredProducts();

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Importar Produto</h2>

      <div className="flex space-x-4 mb-4">
        <button
          onClick={() => setSelectedProductType('kit')}
          className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${
            selectedProductType === 'kit' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <Package className="h-4 w-4 mr-2" /> Kit
        </button>
        <button
          onClick={() => setSelectedProductType('modelo')}
          className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${
            selectedProductType === 'modelo' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <Box className="h-4 w-4 mr-2" /> Modelo
        </button>
        <button
          onClick={() => setSelectedProductType('peca')}
          className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${
            selectedProductType === 'peca' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <Component className="h-4 w-4 mr-2" /> Peça
        </button>
      </div>

      <div className="relative mb-4">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder={`Buscar ${selectedProductType}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
      </div>

      {loading ? (
        <p className="text-gray-600">Carregando produtos...</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md">
          {filteredProducts.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {filteredProducts.map((product) => (
                <li
                  key={product.id}
                  className="p-3 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                  onClick={() => onProductSelect(product.id as string, selectedProductType)}
                >
                  <span className="text-sm font-medium text-gray-900">{product.nome}</span>
                  <span className="text-xs text-gray-500">SKU: {product.sku}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-3 text-sm text-gray-500">Nenhum {selectedProductType} encontrado.</p>
          )}
        </div>
      )}
    </div>
  );
}
