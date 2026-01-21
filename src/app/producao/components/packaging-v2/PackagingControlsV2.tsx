"use client";

import React, { useState } from 'react';
import { Play, CheckCircle, Plus, Clock, Package, Trash2 } from 'lucide-react';
import { GrupoMontagem, Insumo } from '../../../types';
import { PackagingData } from '../../hooks/usePackagingStateV2';
import InsumoSelectionModal from '../../../components/InsumoSelectionModal';

interface PackagingControlsV2Props {
  assemblyGroup: GrupoMontagem;
  packagingData?: PackagingData;
  isStarted: boolean;
  canFinish: boolean;
  onStartPackaging: () => void;
  onConcludePackaging: () => void;
  onUpdatePackagingData: (updates: Partial<PackagingData>) => void;
}

export default function PackagingControlsV2({
  assemblyGroup,
  packagingData,
  isStarted,
  canFinish,
  onStartPackaging,
  onConcludePackaging,
  onUpdatePackagingData
}: PackagingControlsV2Props) {
  const [isInsumoModalOpen, setIsInsumoModalOpen] = useState(false);

  const handleTimeChange = (minutes: number) => {
    if (minutes >= 0) {
      onUpdatePackagingData({
        packagingTimeMinutes: minutes
      });
    }
  };

  const handleAddInsumo = (insumo: Insumo, quantidade: number) => {
    const currentInsumos = packagingData?.selectedInsumos || [];
    const updatedInsumos = [...currentInsumos, { insumo, quantidade }];
    onUpdatePackagingData({
      selectedInsumos: updatedInsumos
    });
  };

  const handleRemoveInsumo = (insumoId: string) => {
    const currentInsumos = packagingData?.selectedInsumos || [];
    const updatedInsumos = currentInsumos.filter(item => item.insumo.id !== insumoId);
    onUpdatePackagingData({
      selectedInsumos: updatedInsumos
    });
  };

  const handleInsumoSelect = (selectedInsumos: { insumo: Insumo, quantidade: number }[]) => {
    const currentInsumos = packagingData?.selectedInsumos || [];
    
    // Create a map of existing insumos to avoid duplicates
    const existingInsumoMap = new Map(currentInsumos.map(item => [item.insumo.id, item]));
    
    // Add new insumos, replacing any existing ones with the same ID
    selectedInsumos.forEach(newItem => {
      existingInsumoMap.set(newItem.insumo.id, newItem);
    });
    
    // Convert back to array
    const updatedInsumos = Array.from(existingInsumoMap.values());
    
    onUpdatePackagingData({
      selectedInsumos: updatedInsumos
    });
    
    setIsInsumoModalOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      {!isStarted ? (
        <button
          onClick={onStartPackaging}
          className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <Play className="h-5 w-5 mr-2" />
          Iniciar Embalagem
        </button>
      ) : (
        <button
          onClick={onConcludePackaging}
          disabled={!canFinish}
          className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <CheckCircle className="h-5 w-5 mr-2" />
          Concluir Pedido
        </button>
      )}

      {/* Packaging Time */}
      {isStarted && (
        <div className="bg-gray-50 p-4 rounded-md">
          <label htmlFor={`packaging-time-${assemblyGroup.id}`} className="block text-sm font-medium text-gray-700 mb-2">
            <div className="flex items-center">
              <Clock className="h-4 w-4 mr-2" />
              Tempo de Embalagem
            </div>
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              id={`packaging-time-${assemblyGroup.id}`}
              min="0"
              step="1"
              className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Ex: 15"
              value={packagingData?.packagingTimeMinutes || ''}
              onChange={(e) => handleTimeChange(Number(e.target.value) || 0)}
            />
            <span className="text-sm text-gray-500">minutos</span>
          </div>
          {packagingData && packagingData.packagingTimeMinutes > 0 && (
            <div className="mt-2 text-green-600 bg-green-50 p-2 rounded">
              ✓ Tempo registrado: {packagingData.packagingTimeMinutes} minutos
            </div>
          )}
        </div>
      )}

      {/* Packaging Insumos */}
      {isStarted && (
        <div className="bg-gray-50 p-4 rounded-md">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700">
              <div className="flex items-center">
                <Package className="h-4 w-4 mr-2" />
                Insumos de Embalagem
              </div>
            </label>
          </div>

          {/* Add Insumo Button */}
          <button
            onClick={() => setIsInsumoModalOpen(true)}
            className="w-full inline-flex items-center justify-center px-3 py-2 border-dashed text-sm font-medium rounded text-gray-700 bg-gray-100 hover:bg-gray-200"
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Insumo de Embalagem
          </button>

          {/* Selected Insumos List */}
          {packagingData?.selectedInsumos && packagingData.selectedInsumos.length > 0 && (
            <div className="mt-3 space-y-2">
              {packagingData.selectedInsumos.map((item, index) => (
                <div key={item.insumo.id} className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">{item.insumo.nome}</span>
                    <span className="text-sm text-gray-500 ml-2">x{item.quantidade}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveInsumo(item.insumo.id)}
                    className="p-1 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {(!packagingData?.selectedInsumos || packagingData.selectedInsumos.length === 0) && (
            <div className="text-center text-gray-500 text-sm">
              Nenhum insumo de embalagem selecionado
            </div>
          )}
        </div>
      )}

      {/* Insumo Selection Modal */}
      {isInsumoModalOpen && (
        <InsumoSelectionModal
          isOpen={isInsumoModalOpen}
          onClose={() => setIsInsumoModalOpen(false)}
          onSelect={handleInsumoSelect}
          initialSelectedInsumos={packagingData?.selectedInsumos || []}
          insumoTipoFilter="embalagem"
        />
      )}
    </div>
  );
}
