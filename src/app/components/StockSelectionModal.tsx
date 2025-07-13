import React, { useState, useEffect } from 'react';
import { X, MapPin } from 'lucide-react';
import { PosicaoEstoque } from '../types';

interface StockSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (debits: { selectedPosition: PosicaoEstoque; quantityToDebit: number }[]) => void;
  itemNome: string;
  quantidadeNecessaria: number;
  availablePositions: PosicaoEstoque[];
  formatLocation: (posicoes: PosicaoEstoque[]) => string;
  totalEstoqueDisponivelGeral: number; // New prop for the total stock of the part
}

const StockSelectionModal: React.FC<StockSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  itemNome,
  quantidadeNecessaria,
  availablePositions,
  formatLocation,
  totalEstoqueDisponivelGeral, // Destructure new prop
}) => {
  const [debitQuantities, setDebitQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialQuantities: Record<string, number> = {};
    let remainingToDistribute = quantidadeNecessaria;

    // Sort positions by quantity descending for intelligent pre-filling
    const sortedPositions = [...availablePositions].sort((a, b) => b.quantidade - a.quantidade);

    sortedPositions.forEach(pos => {
      const key = `${pos.recipienteId}-${pos.divisao?.h || 'noH'}-${pos.divisao?.v || 'noV'}`;
      if (remainingToDistribute > 0) {
        const quantityToAssign = Math.min(remainingToDistribute, pos.quantidade);
        initialQuantities[key] = quantityToAssign;
        remainingToDistribute -= quantityToAssign;
      } else {
        initialQuantities[key] = 0;
      }
    });
    setDebitQuantities(initialQuantities);
  }, [availablePositions, quantidadeNecessaria]); // Add quantidadeNecessaria to dependencies

  if (!isOpen) return null;

  const handleQuantityChange = (pos: PosicaoEstoque, value: string) => {
    const key = `${pos.recipienteId}-${pos.divisao?.h || 'noH'}-${pos.divisao?.v || 'noV'}`;
    const quantity = parseInt(value) || 0;
    setDebitQuantities(prev => ({
      ...prev,
      [key]: quantity > pos.quantidade ? pos.quantidade : quantity, // Cap at available quantity
    }));
  };

  const handleLaunchRemaining = (posToFill: PosicaoEstoque) => {
    const currentTotalDebited = Object.values(debitQuantities).reduce((sum, qty) => sum + qty, 0);
    let remainingNeeded = quantidadeNecessaria - currentTotalDebited;

    const newDebitQuantities: Record<string, number> = {};
    availablePositions.forEach(pos => {
      const key = `${pos.recipienteId}-${pos.divisao?.h || 'noH'}-${pos.divisao?.v || 'noV'}`;
      if (pos === posToFill) {
        const quantityToAssign = Math.min(remainingNeeded, pos.quantidade);
        newDebitQuantities[key] = quantityToAssign;
        remainingNeeded -= quantityToAssign; // Should be 0 or negative after this
      } else {
        newDebitQuantities[key] = debitQuantities[key] || 0; // Keep existing values for others
      }
    });
    setDebitQuantities(newDebitQuantities);
  };

  const handleConfirm = () => {
    const debits: { selectedPosition: PosicaoEstoque; quantityToDebit: number }[] = [];
    let totalDebited = 0;

    availablePositions.forEach(pos => {
      const key = `${pos.recipienteId}-${pos.divisao?.h || 'noH'}-${pos.divisao?.v || 'noV'}`;
      const qty = debitQuantities[key] || 0;
      if (qty > 0) {
        debits.push({ selectedPosition: pos, quantityToDebit: qty });
        totalDebited += qty;
      }
    });

    if (totalDebited === 0) {
      setError("Por favor, insira a quantidade a ser debitada de pelo menos uma posição.");
      return;
    }

    // Primary validation: total debited cannot exceed the actual total stock available
    if (totalDebited > totalEstoqueDisponivelGeral) {
      setError(`A quantidade total a ser debitada (${totalDebited}) excede o estoque total disponível (${totalEstoqueDisponivelGeral}).`);
      return;
    }

    // Secondary validation: warn if total debited is less than needed, but allow if user confirms
    if (totalDebited < quantidadeNecessaria) {
      if (!window.confirm(`Atenção: A quantidade total a ser debitada (${totalDebited}) é menor que a quantidade necessária para o pedido (${quantidadeNecessaria}). Deseja continuar?`)) {
        return;
      }
    }

    setError(null);
    onSelect(debits);
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm h-full w-full z-50 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="relative bg-white rounded-lg shadow-xl p-8 w-full max-w-md mx-4 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-900">Selecionar Posição de Estoque</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2 py-4">
          {error && <p className="text-red-500 bg-red-100 p-3 rounded mb-4">{error}</p>}
          <p className="text-gray-700 mb-2">
            Para o item <span className="font-semibold">{itemNome}</span>:
          </p>
          <p className="text-gray-700 mb-4">
            Quantidade Necessária: <span className="font-semibold">{quantidadeNecessaria}</span> unidades. <br />
            Estoque Total Disponível: <span className="font-semibold">{totalEstoqueDisponivelGeral}</span> unidades.
          </p>
          <p className="text-gray-700 mb-4">
            Por favor, insira a quantidade a ser debitada de cada posição de estoque.
          </p>

          <div className="space-y-3">
            {availablePositions.map((pos) => {
              const key = `${pos.recipienteId}-${pos.divisao?.h || 'noH'}-${pos.divisao?.v || 'noV'}`;
              return (
                <div
                  key={key}
                  className="p-3 border rounded-lg border-gray-200 bg-white"
                >
                  <p className="font-medium text-gray-800">
                    Quantidade Disponível: {pos.quantidade}
                  </p>
                  <p className="flex items-center text-sm text-gray-600 mb-2">
                    <MapPin className="h-4 w-4 mr-1" />
                    Local: {formatLocation([pos])}
                  </p>
                  <div className="flex items-center space-x-2">
                    <label htmlFor={`qty-${key}`} className="block text-sm font-medium text-gray-700 sr-only">
                      Quantidade a Debitar:
                    </label>
                    <input
                      type="number"
                      id={`qty-${key}`}
                      value={debitQuantities[key] || ''}
                      onChange={(e) => handleQuantityChange(pos, e.target.value)}
                      min={0}
                      max={pos.quantidade}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      placeholder="Qtd. a retirar"
                    />
                    <button
                      type="button"
                      onClick={() => handleLaunchRemaining(pos)}
                      className="px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                      Lançar Saldo Aqui
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-200 flex-shrink-0 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mr-3"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
            disabled={Object.values(debitQuantities).reduce((sum, qty) => sum + qty, 0) === 0 || Object.values(debitQuantities).reduce((sum, qty) => sum + qty, 0) > totalEstoqueDisponivelGeral}
          >
            Confirmar Débito
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockSelectionModal;
