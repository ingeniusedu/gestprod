"use client";

import React, { useState } from 'react';
import { Package, Play, CheckCircle, XCircle, Clock, Calendar, User } from 'lucide-react';
import { GrupoMontagem } from '../../../types';
import { usePackagingStateV2 } from '../../hooks/usePackagingStateV2';
import { usePackagingValidationV2 } from '../../hooks/usePackagingValidationV2';
import { useConcludePedidoV2 } from '../../hooks/useConcludePedidoV2';
import PackagingHierarchyV2 from './PackagingHierarchyV2';
import PackagingControlsV2 from './PackagingControlsV2';
import { auth } from '../../../services/firebase';

interface PackagingCardV2Props {
  assemblyGroup: GrupoMontagem;
}

export default function PackagingCardV2({ assemblyGroup }: PackagingCardV2Props) {
  const { packagingData, updatePackagingData, completePackaging } = usePackagingStateV2();
  const validations = usePackagingValidationV2(assemblyGroup.id!, packagingData[assemblyGroup.id!], assemblyGroup);
  const { concludePedidoV2, isLoading: isConcluding, error: concludeError } = useConcludePedidoV2();
  
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const handleStartPackaging = () => {
    updatePackagingData(assemblyGroup.id!, {
      assemblyGroupId: assemblyGroup.id!,
      pedidoId: assemblyGroup.id!, // Para V2, vamos usar assemblyGroup.id como pedidoId inicialmente
      pedidoNumero: assemblyGroup.pedidoNumero,
      status: 'started',
      startTime: new Date(),
      packagingTimeMinutes: 0,
      selectedInsumos: [],
      checkedItems: {}
    });
  };

  const handleConcludePackaging = async () => {
    const currentData = packagingData[assemblyGroup.id!];
    if (!currentData) {
      console.error('No packaging data found for:', assemblyGroup.id);
      return;
    }

    // Verificar autenticação do usuário
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('Usuário não autenticado. Faça login para concluir a embalagem.');
      // Poderia mostrar uma mensagem de erro para o usuário aqui
      return;
    }

    try {
      await concludePedidoV2({
        assemblyGroup,
        packagingData: currentData,
        user: currentUser.uid // Usar ID do usuário autenticado
      });

      // Mark as completed in local state
      completePackaging(assemblyGroup.id!);
      setShowSuccessMessage(true);
      
      // Hide success message after 3 seconds
      setTimeout(() => {
        setShowSuccessMessage(false);
      }, 3000);

    } catch (error) {
      console.error('Error concluding packaging:', error);
    }
  };

  const currentData = packagingData[assemblyGroup.id!];
  const isStarted = currentData?.status === 'started';

  return (
    <div className="bg-white shadow rounded-lg p-6 border-2 border-gray-200 hover:border-blue-300 transition-colors">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-gray-900">
            {assemblyGroup.targetProductName || 'Produto Final'}
          </h3>
          <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
            <div className="flex items-center">
              <Calendar className="h-4 w-4 mr-1" />
              <span>Início: {currentData?.startTime ? 
                new Date(currentData.startTime).toLocaleString('pt-BR', { 
                  day: '2-digit', 
                  month: '2-digit', 
                  hour: '2-digit', 
                  minute: '2-digit' 
                }) : 
                'Não iniciado'
              }</span>
            </div>
            <div className="flex items-center">
              <Package className="h-4 w-4 mr-1" />
              <span>Pedido: {assemblyGroup.pedidoNumero || assemblyGroup.id}</span>
            </div>
          </div>
        </div>
        
        {/* Status Badge */}
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          currentData?.status === 'started' 
            ? 'bg-blue-100 text-blue-800' 
            : currentData?.status === 'completed'
            ? 'bg-green-100 text-green-800'
            : 'bg-gray-100 text-gray-800'
        }`}>
          {currentData?.status === 'started' 
            ? 'Em Embalagem' 
            : currentData?.status === 'completed'
            ? 'Concluído'
            : 'Aguardando'
          }
        </div>
      </div>

      {/* Progress Indicators */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-gray-50 rounded">
          <div className={`text-2xl font-bold ${
            validations.allItemsAvailable ? 'text-green-600' : 'text-red-600'
          }`}>
            {validations.allItemsAvailable ? '✓' : '✗'}
          </div>
          <div className="text-xs text-gray-600 mt-1">Itens Disponíveis</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded">
          <div className={`text-2xl font-bold ${
            validations.allItemsChecked ? 'text-green-600' : 'text-red-600'
          }`}>
            {validations.allItemsChecked ? '✓' : '✗'}
          </div>
          <div className="text-xs text-gray-600 mt-1">Itens Conferidos</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded">
          <div className={`text-2xl font-bold ${
            validations.packagingTimeSet ? 'text-green-600' : 'text-red-600'
          }`}>
            {validations.packagingTimeSet ? '✓' : '✗'}
          </div>
          <div className="text-xs text-gray-600 mt-1">Tempo Registrado</div>
        </div>
      </div>

      {/* Hierarchy - Always show hierarchy */}
      <div className="mb-4">
        <PackagingHierarchyV2
          assemblyGroup={assemblyGroup}
          checkedItems={currentData?.checkedItems || {}}
          onToggleItem={(itemId: string, checked: boolean) => {
            // Only allow toggling if packaging is started
            if (isStarted) {
              updatePackagingData(assemblyGroup.id!, {
                checkedItems: {
                  ...currentData?.checkedItems,
                  [itemId]: checked
                }
              });
            }
          }}
        />
      </div>

      {/* Controls */}
      <PackagingControlsV2
        assemblyGroup={assemblyGroup}
        packagingData={currentData}
        isStarted={isStarted}
        canFinish={validations.canFinish}
        onStartPackaging={handleStartPackaging}
        onConcludePackaging={handleConcludePackaging}
        onUpdatePackagingData={(updates: any) => {
          updatePackagingData(assemblyGroup.id!, updates);
        }}
      />

      {/* Success Message */}
      {showSuccessMessage && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
            <span className="text-sm text-green-800">Pedido concluído com sucesso!</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {concludeError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <XCircle className="h-5 w-5 text-red-500 mr-2" />
            <span className="text-sm text-red-800">{concludeError}</span>
          </div>
        </div>
      )}

      {/* Blocking Message */}
      {!validations.canFinish && isStarted && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <XCircle className="h-5 w-5 text-red-500 mr-2" />
            <span className="text-sm text-red-800">{validations.blockingReason}</span>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isConcluding && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <span className="text-sm text-gray-600">Concluindo pedido...</span>
          </div>
        </div>
      )}
    </div>
  );
}
