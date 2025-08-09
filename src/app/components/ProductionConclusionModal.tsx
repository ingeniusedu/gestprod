import React, { useState, useEffect } from 'react';
import { OptimizedGroup, Peca } from '../types';
import { LocalProduto } from '../types/mapaEstoque'; // Corrected import path for LocalProduto
import { X } from 'lucide-react';

export interface ConcludeData {
  group: OptimizedGroup; // Agora passamos o grupo completo
  producedParts: {
    parteId: string;
    quantidadeProduzida: number;
    pecaId?: string; // Add pecaId here
    destinoExcedente?: 'estoque' | 'montagem';
    localEstoqueId?: string;
  }[];
}

interface ProductionConclusionModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: OptimizedGroup | null;
  availablePecas: Peca[];
  locaisProdutos: LocalProduto[];
  onConclude: (data: ConcludeData) => void;
}

const ProductionConclusionModal: React.FC<ProductionConclusionModalProps> = ({ 
  isOpen, 
  onClose, 
  group, 
  availablePecas, 
  locaisProdutos, 
  onConclude 
}) => {
  const [producedQuantities, setProducedQuantities] = useState<Record<string, number>>({});
  const [excessDestinations, setExcessDestinations] = useState<Record<string, 'estoque' | 'montagem'>>({});
  const [selectedStockLocations, setSelectedStockLocations] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && group) {
      const initialQuantities = Object.entries(group.partesNoGrupo).reduce((acc, [parteId, parteInfo]) => {
        acc[parteId] = parteInfo.quantidade;
        return acc;
      }, {} as Record<string, number>);
      setProducedQuantities(initialQuantities);
      setExcessDestinations({});
      setSelectedStockLocations({});
    }
  }, [isOpen, group]);

  const getPecaTipoForParte = (parteId: string): Peca['tipoPeca'] | null => {
    for (const peca of availablePecas) {
      for (const grupoImpressao of peca.gruposImpressao) {
        if (grupoImpressao.partes.some(p => p.parteId === parteId)) {
          return peca.tipoPeca;
        }
      }
    }
    return null;
  };

  const handleQuantityChange = (parteId: string, value: string) => {
    const quantity = parseInt(value, 10);
    setProducedQuantities((prev) => ({
      ...prev,
      [parteId]: isNaN(quantity) ? 0 : quantity,
    }));
  };

  const handleExcessDestinationChange = (parteId: string, destination: 'estoque' | 'montagem') => {
    setExcessDestinations(prev => ({ ...prev, [parteId]: destination }));
  };

  const handleStockLocationChange = (parteId: string, locationId: string) => {
    setSelectedStockLocations(prev => ({ ...prev, [parteId]: locationId }));
  };

  const handleSubmit = () => {
    if (!group) return;

    const producedParts = Object.entries(producedQuantities).map(([parteId, quantidadeProduzida]) => {
      const parteInfo = group.partesNoGrupo[parteId];
      const excedente = quantidadeProduzida - parteInfo.quantidade;
      let destinoExcedente: 'estoque' | 'montagem' | undefined = undefined;
      let localEstoqueId: string | undefined = undefined;
      let pecaId: string | undefined = undefined; // New variable

      // Find the pecaId for the current parteId
      for (const peca of availablePecas) {
        for (const grupoImpressao of peca.gruposImpressao) {
          if (grupoImpressao.partes.some(p => p.parteId === parteId)) {
            pecaId = peca.id; // Found the pecaId
            break; // Exit inner loop
          }
        }
        if (pecaId) break; // Exit outer loop
      }

      if (excedente > 0) {
        destinoExcedente = excessDestinations[parteId];
        if (destinoExcedente === 'estoque') {
          localEstoqueId = selectedStockLocations[parteId];
        }
      }

      return {
        parteId,
        quantidadeProduzida,
        ...(pecaId && { pecaId }), // Include pecaId if found
        ...(excedente > 0 && { destinoExcedente, localEstoqueId }),
      };
    });

    const data: ConcludeData = {
      group: group,
      producedParts,
    };

    onConclude(data);
    onClose();
  };

  if (!isOpen || !group) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl">
        <div className="flex justify-between items-center border-b pb-3 mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Concluir Impressão do Grupo: {group.sourceName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>
        
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {Object.entries(group.partesNoGrupo).map(([parteId, parteInfo]) => {
            const produced = producedQuantities[parteId] || 0;
            const excess = produced - parteInfo.quantidade;
            const pecaTipo = getPecaTipoForParte(parteId);
            const canSendToAssembly = (pecaTipo === 'composta_um_grupo_com_montagem' || pecaTipo === 'composta_multiplos_grupos') && parteInfo.hasAssembly;

            return (
              <div key={parteId} className="border p-4 rounded-md bg-gray-50 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold text-gray-800">{parteInfo.nome}</h4>
                    <p className="text-sm text-gray-500">Esperado: {parteInfo.quantidade}</p>
                  </div>
                  <div className="flex items-center">
                    <label htmlFor={`qty-${parteId}`} className="block text-sm font-medium text-gray-700 mr-2">
                      Produzido:
                    </label>
                    <input
                      type="number"
                      id={`qty-${parteId}`}
                      value={produced}
                      onChange={(e) => handleQuantityChange(parteId, e.target.value)}
                      min="0"
                      className="w-24 px-2 py-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                </div>

                {excess > 0 && (
                  <div className="border-t pt-3 mt-3 space-y-3 bg-yellow-50 p-3 rounded-md">
                    <h5 className="font-semibold text-yellow-800">Destino do Excedente ({excess} unidades):</h5>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center">
                        <input
                          type="radio"
                          id={`dest-stock-${parteId}`}
                          name={`destination-${parteId}`}
                          value="estoque"
                          checked={excessDestinations[parteId] === 'estoque'}
                          onChange={() => handleExcessDestinationChange(parteId, 'estoque')}
                          className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <label htmlFor={`dest-stock-${parteId}`} className="ml-2 block text-sm text-gray-900">
                          Enviar para Estoque
                        </label>
                      </div>
                      {canSendToAssembly && (
                        <div className="flex items-center">
                          <input
                            type="radio"
                            id={`dest-assembly-${parteId}`}
                            name={`destination-${parteId}`}
                            value="montagem"
                            checked={excessDestinations[parteId] === 'montagem'}
                            onChange={() => handleExcessDestinationChange(parteId, 'montagem')}
                            className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                          />
                          <label htmlFor={`dest-assembly-${parteId}`} className="ml-2 block text-sm text-gray-900">
                            Enviar para Montagem
                          </label>
                        </div>
                      )}
                    </div>
                    
                    {excessDestinations[parteId] === 'estoque' && (
                      <div>
                        <label htmlFor={`stock-loc-${parteId}`} className="block text-sm font-medium text-gray-700">
                          Local de Estoque:
                        </label>
                        <select
                          id={`stock-loc-${parteId}`}
                          value={selectedStockLocations[parteId] || ''}
                          onChange={(e) => handleStockLocationChange(parteId, e.target.value)}
                          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                        >
                          <option value="">Selecione um local...</option>
                          {locaisProdutos.map(local => (
                            <option key={local.id} value={local.id}>{local.nome}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            type="button"
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Concluir Produção
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductionConclusionModal;
