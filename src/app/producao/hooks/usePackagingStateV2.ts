import { useState, useCallback } from 'react';
import { Insumo } from '../../types';

export interface PackagingData {
  assemblyGroupId: string;
  pedidoId: string;
  pedidoNumero?: string;
  status: 'idle' | 'started' | 'validated' | 'concluding' | 'completed';
  startTime?: Date;
  endTime?: Date;
  packagingTimeMinutes: number;
  selectedInsumos: Array<{ insumo: Insumo, quantidade: number }>;
  checkedItems: Record<string, boolean>;
}

export const usePackagingStateV2 = () => {
  const [packagingData, setPackagingData] = useState<Record<string, PackagingData>>({});

  const updatePackagingData = useCallback((assemblyGroupId: string, updates: Partial<PackagingData>) => {
    setPackagingData(prev => ({
      ...prev,
      [assemblyGroupId]: { ...prev[assemblyGroupId], ...updates }
    }));
  }, []);

  const startPackaging = useCallback((assemblyGroupId: string, pedidoId: string, pedidoNumero?: string) => {
    updatePackagingData(assemblyGroupId, {
      assemblyGroupId,
      pedidoId,
      pedidoNumero,
      status: 'started',
      startTime: new Date(),
      packagingTimeMinutes: 0,
      selectedInsumos: [],
      checkedItems: {}
    });
  }, [updatePackagingData]);

  const updatePackagingTime = useCallback((assemblyGroupId: string, time: number) => {
    updatePackagingData(assemblyGroupId, {
      packagingTimeMinutes: time
    });
  }, [updatePackagingData]);

  const addPackagingInsumo = useCallback((assemblyGroupId: string, insumo: Insumo, quantidade: number) => {
    setPackagingData(prev => {
      const currentData = prev[assemblyGroupId];
      const existingInsumos = currentData?.selectedInsumos || [];
      const updatedInsumos = [...existingInsumos, { insumo, quantidade }];
      
      return {
        ...prev,
        [assemblyGroupId]: {
          ...currentData!,
          selectedInsumos: updatedInsumos
        }
      };
    });
  }, []);

  const removePackagingInsumo = useCallback((assemblyGroupId: string, insumoId: string) => {
    setPackagingData(prev => {
      const currentData = prev[assemblyGroupId];
      const existingInsumos = currentData?.selectedInsumos || [];
      const updatedInsumos = existingInsumos.filter(item => item.insumo.id !== insumoId);
      
      return {
        ...prev,
        [assemblyGroupId]: {
          ...currentData!,
          selectedInsumos: updatedInsumos
        }
      };
    });
  }, []);

  const toggleItem = useCallback((assemblyGroupId: string, itemId: string, checked: boolean) => {
    updatePackagingData(assemblyGroupId, {
      checkedItems: {
        ...packagingData[assemblyGroupId]?.checkedItems,
        [itemId]: checked
      }
    });
  }, [packagingData, updatePackagingData]);

  const completePackaging = useCallback((assemblyGroupId: string) => {
    updatePackagingData(assemblyGroupId, {
      status: 'completed',
      endTime: new Date()
    });
  }, [updatePackagingData]);

  const clearPackagingData = useCallback((assemblyGroupId: string) => {
    setPackagingData(prev => {
      const newData = { ...prev };
      delete newData[assemblyGroupId];
      return newData;
    });
  }, []);

  return {
    packagingData,
    updatePackagingData,
    startPackaging,
    updatePackagingTime,
    addPackagingInsumo,
    removePackagingInsumo,
    toggleItem,
    completePackaging,
    clearPackagingData
  };
};
