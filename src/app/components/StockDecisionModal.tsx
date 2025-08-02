import React, { useState, useEffect } from 'react';
import { Pedido, Peca, Modelo, Kit, Parte, PosicaoEstoque, LancamentoProduto } from '../types';
import { db } from '../services/firebase';
import { doc, getDoc, collection, query, where, getDocs, writeBatch, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { StockVerificationResult } from '../services/stockVerificationService';

import { StockOption } from '../types'; // Import StockOption

interface StockDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido;
  onConfirm: (decisions: StockOption[]) => void; // Changed to StockOption[]
  verificationResult: StockVerificationResult;
}

const StockDecisionModal: React.FC<StockDecisionModalProps> = ({ isOpen, onClose, pedido, onConfirm, verificationResult }) => {
  const [stockHierarchy, setStockHierarchy] = useState<StockOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (verificationResult) {
      console.log("[StockDecisionModal] verificationResult received:", verificationResult);
      const transformResultToHierarchy = (options: StockVerificationResult['stockOptions']): StockOption[] => {
        // For now, just map the flat list. We'll enhance this later if needed for nested products.
        return options.map(option => ({
          id: option.id,
          nome: option.nome,
          tipo: option.type,
          quantidadeNecessaria: option.quantidadeNecessaria,
          quantidadeDisponivel: option.quantidadeDisponivel,
          quantidadeUsarEstoque: Math.min(option.quantidadeNecessaria, option.quantidadeDisponivel),
          estoqueAtualItem: option.estoqueAtualItem, // Added this line
          posicoesEstoque: option.posicoesEstoque, // Ensure posicoesEstoque is passed
          children: option.children, // Use actual children from StockOption
          parentId: option.parentId,
        }));
      };

      const hierarchy = transformResultToHierarchy(verificationResult.stockOptions);
      setStockHierarchy(hierarchy);
    }
  }, [verificationResult]);

  if (!isOpen) return null;

  const handleQuantityChange = (id: string, type: 'kit' | 'modelo' | 'peca' | 'parte', value: number) => {
    setStockHierarchy(prevHierarchy => {
      const updateItem = (items: StockOption[]): StockOption[] => {
        return items.map(item => {
          if (item.id === id && item.tipo === type) {
            const newQuantity = Math.max(0, Math.min(value, item.quantidadeDisponivel));
            return { ...item, quantidadeUsarEstoque: newQuantity };
          }
          if (item.children) {
            return { ...item, children: updateItem(item.children) };
          }
          return item;
        });
      };
      return updateItem(prevHierarchy);
    });
  };

  const renderStockItem = (item: StockOption, level: number = 0) => (
    <div key={`${item.tipo}-${item.id}`} style={{ marginLeft: `${level * 20}px` }} className="mb-2">
      <div className="flex items-center justify-between bg-gray-100 p-2 rounded">
        <span className="font-semibold">{item.nome} ({item.tipo})</span>
        <div className="flex items-center">
          <span className="mr-2">Necessário: {item.quantidadeNecessaria}</span>
          <span className="mr-2">Disponível: {item.quantidadeDisponivel}</span>
          <input
            type="number"
            value={item.quantidadeUsarEstoque}
            onChange={(e) => handleQuantityChange(item.id, item.tipo, parseInt(e.target.value))}
            min="0"
            max={item.quantidadeDisponivel}
            className="w-20 p-1 border rounded text-center"
          />
        </div>
      </div>
      {item.children && item.children.length > 0 && (
        <div className="ml-4 mt-2">
          {item.children.map(child => renderStockItem(child, level + 1))}
        </div>
      )}
    </div>
  );

  const handleConfirm = () => {
    console.log("[StockDecisionModal] Confirming decisions:", stockHierarchy);
    onConfirm(stockHierarchy);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg w-4/5 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Decisão de Uso de Estoque para Pedido #{pedido.numero}</h2>
        {loading && <p>Carregando dados de estoque...</p>}
        {error && <p className="text-red-500">{error}</p>}
        {!loading && !error && stockHierarchy.length === 0 && verificationResult.productionNeeds.length === 0 && (
          <p>Nenhum item de estoque ou necessidade de produção encontrado para este pedido.</p>
        )}
        {!loading && !error && (
          <>
            {stockHierarchy.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xl font-semibold mb-2">Opções de Estoque</h3>
                {stockHierarchy.map(item => renderStockItem(item))}
              </div>
            )}
            {verificationResult.productionNeeds.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xl font-semibold mb-2">Necessidades de Produção</h3>
                <ul className="list-disc list-inside bg-yellow-50 p-3 rounded">
                  {verificationResult.productionNeeds.map(need => (
                    <li key={need.id} className="text-yellow-800">
                      Produzir {need.quantidadeFaltante} unidade(s) de {need.nome} ({need.type})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <div className="flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled={loading}
          >
            Confirmar Decisões de Estoque
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockDecisionModal;
