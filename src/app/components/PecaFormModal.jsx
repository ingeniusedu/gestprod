"use client";

import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import GrupoImpressaoEditor from './GrupoImpressaoEditor';

export default function PecaFormModal({ isOpen, onClose, onSave, initialData, insumos }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [peca, setPeca] = useState({
    sku: '',
    nome: '',
    isComposta: false,
    tempoMontagem: '',
    gruposImpressao: []
  });

  // Carregar dados iniciais se for edição
  useEffect(() => {
    if (isOpen && initialData?.id) {
      setPeca({
        id: initialData.id,
        sku: initialData.sku || '',
        nome: initialData.nome || '',
        isComposta: initialData.isComposta || false,
        tempoMontagem: initialData.tempoMontagem || '',
        gruposImpressao: initialData.gruposImpressao || []
      });
    } else if (isOpen) {
      // Reset form when opening for a new peca
      setPeca({
        sku: '',
        nome: '',
        isComposta: false,
        tempoMontagem: '',
        gruposImpressao: [{
          id: `grupo-${Date.now()}`,
          nome: 'Grupo Principal',
          filamentos: [], // Initialize with empty array to allow adding any type of insumo
          partes: [],
          tempoImpressao: '',
        }]
      });
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const isStep1Valid = () => {
    return peca.sku.trim() !== '' && peca.nome.trim() !== '';
  };

  const isStep2Valid = () => {
    if (peca.gruposImpressao.length === 0) return false;
    
    for (const grupo of peca.gruposImpressao) {
      if (!grupo.nome || !grupo.tempoImpressao || Number(grupo.tempoImpressao) <= 0) {
        return false;
      }
      if (grupo.filamentos.length === 0) return false;
      for (const insumo of grupo.filamentos) {
        if (insumo.tipo === 'filamento') {
          if (!insumo.grupoFilamentoId || !insumo.quantidade || Number(insumo.quantidade) <= 0) {
            return false;
          }
        } else { // material, tempo, outros
          if (!insumo.insumoId || !insumo.quantidade || Number(insumo.quantidade) <= 0) {
            return false;
          }
          if (insumo.tipo === 'material' && !insumo.etapaInstalacao) {
            return false;
          }
        }
      }
      // If it's a composite piece, ensure parts are present for each group
      if (peca.isComposta && (!grupo.partes || grupo.partes.length === 0)) {
        return false;
      }
    }
    
    return true;
  };


  const handleSubmit = (e) => {
    e.preventDefault();
    
    let pecaParaSalvar = { ...peca };
    if (initialData?.id) {
      pecaParaSalvar.id = initialData.id;
    }
    
    onSave(pecaParaSalvar);
    
    // Reset state and close
    setPeca({ sku: '', nome: '', isComposta: false, tempoMontagem: '', gruposImpressao: [] });
    setCurrentStep(1);
    onClose();
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm h-full w-full z-50 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="relative bg-white rounded-lg shadow-xl p-8 w-full max-w-4xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-900">
            {initialData?.id ? 'Editar Peça' : 'Nova Peça'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto pr-2 -mr-2">
          {/* Passo 1: Dados básicos */}
          {currentStep === 1 && (
            <div className="space-y-4 pt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">SKU</label>
                <input
                  type="text"
                  value={peca.sku}
                  onChange={(e) => setPeca({...peca, sku: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Nome</label>
                <input
                  type="text"
                  value={peca.nome}
                  onChange={(e) => setPeca({...peca, nome: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isComposta"
                  checked={peca.isComposta}
                  onChange={(e) => setPeca({...peca, isComposta: e.target.checked})}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isComposta" className="ml-2 block text-sm text-gray-700">
                  Peça composta (contém múltiplas partes)
                </label>
              </div>

              {peca.isComposta && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tempo de Montagem (min)</label>
                  <input
                    type="number"
                    placeholder="e.g. 30"
                    min="0"
                    value={peca.tempoMontagem}
                    onChange={(e) => setPeca({...peca, tempoMontagem: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              )}
            </div>
          )}

          {/* Passo 2: Grupos de impressão */}
          {currentStep === 2 && (
            <div className="pt-4">
              <h4 className="text-lg font-medium text-gray-900 mb-4">
                Grupos de Impressão
              </h4>
              
              {peca.gruposImpressao.map((grupo, index) => (
                <GrupoImpressaoEditor
                  key={grupo.id || index}
                  grupo={grupo}
                  pecaSku={peca.sku}
                  isComposta={peca.isComposta}
                  onChange={(updatedGrupo) => {
                    const updatedGrupos = [...peca.gruposImpressao];
                    updatedGrupos[index] = updatedGrupo;
                    setPeca({...peca, gruposImpressao: updatedGrupos});
                  }}
                  onRemove={() => {
                    const updatedGrupos = peca.gruposImpressao.filter((_, i) => i !== index);
                    setPeca({...peca, gruposImpressao: updatedGrupos});
                  }}
                />
              ))}

              <button
                type="button"
                onClick={() => {
                  const novoGrupo = {
                    id: Date.now().toString(),
                    nome: `Grupo ${peca.gruposImpressao.length + 1}`,
                    filamentos: [], // Initialize with empty array to allow adding any type of insumo
                    partes: [],
                    tempoImpressao: ''
                  };
                  setPeca({
                    ...peca,
                    gruposImpressao: [...peca.gruposImpressao, novoGrupo]
                  });
                }}
                className="mt-4 px-4 py-2 border border-dashed border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center justify-center w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Grupo de Impressão
              </button>

              {!peca.isComposta && peca.gruposImpressao.length === 0 && (
                <div className="mt-4 p-4 bg-blue-50 text-blue-800 rounded-md text-sm">
                  Para peças simples, um grupo de impressão será criado automaticamente ao salvar.
                </div>
              )}
            </div>
          )}
        </form>

        <div className="flex justify-between pt-4 border-t border-gray-200 flex-shrink-0">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep(currentStep - 1)}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Voltar
              </button>
            )}
          </div>
          
          <div className="flex space-x-3">
            {currentStep < 2 && (
              <button
                type="button"
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={!isStep1Valid()}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
              >
                Próximo
              </button>
            )}
            
            {currentStep === 2 && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!isStep2Valid()}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400"
              >
                Salvar Peça
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
