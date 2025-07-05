"use client";

import React, { useState, useMemo } from 'react';
import { Plus, Trash2, GitBranch } from 'lucide-react';
import ParteSelectionModal from './ParteSelectionModal';

export default function GrupoImpressaoEditor({
  grupo,
  onChange,
  onRemove,
  pecaSku,
  isComposta,
  insumos,
}) {
  const [isParteModalOpen, setIsParteModalOpen] = useState(false);
  const [novaParte, setNovaParte] = useState({
    nome: '',
    identificador: '',
    quantidade: 1,
  });

  const filamentGroups = useMemo(() => {
    if (!insumos) return [];
    const groups = insumos
      .filter((i) => i.tipo === 'filamento' && i.grupoFilamento)
      .map((i) => i.grupoFilamento);
    return [...new Set(groups)];
  }, [insumos]);

  const handleFilamentChange = (index, field, value) => {
    const updatedFilamentos = [...(grupo.filamentos || [])];
    updatedFilamentos[index] = { ...updatedFilamentos[index], [field]: value };
    onChange({ ...grupo, filamentos: updatedFilamentos });
  };

  const addFilament = () => {
    const newFilament = { principal: '', alternativo: '', quantidade: '' };
    onChange({ ...grupo, filamentos: [...(grupo.filamentos || []), newFilament] });
  };

  const removeFilament = (index) => {
    const updatedFilamentos = (grupo.filamentos || []).filter((_, i) => i !== index);
    onChange({ ...grupo, filamentos: updatedFilamentos });
  };

  const handleAddParte = () => {
    if (!novaParte.nome || !novaParte.identificador) return;
    const parteCompleta = {
      ...novaParte,
      sku: `${pecaSku}-${novaParte.identificador}`,
      isNova: true,
    };
    onChange({ ...grupo, partes: [...(grupo.partes || []), parteCompleta] });
    setNovaParte({ nome: '', identificador: '', quantidade: 1 });
  };

  const handleSelectParte = (parteSelecionada) => {
    const parteCompleta = {
      parteId: parteSelecionada.id,
      nome: parteSelecionada.nome,
      identificador: parteSelecionada.identificador,
      sku: parteSelecionada.sku,
      quantidade: 1,
      isNova: false,
    };
    onChange({ ...grupo, partes: [...(grupo.partes || []), parteCompleta] });
  };

  return (
    <div className="border rounded-lg p-4 mb-4 bg-gray-50">
      <div className="flex justify-between items-center mb-4">
        <input
          type="text"
          value={grupo.nome}
          onChange={(e) => onChange({ ...grupo, nome: e.target.value })}
          placeholder="Nome do Grupo de Impressão"
          className="font-medium text-lg bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none"
        />
        <button type="button" onClick={onRemove} className="text-red-500 hover:text-red-700">
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-6">
        {/* Filament Section */}
        <div>
          <h5 className="text-sm font-medium text-gray-700 mb-2">Filamentos</h5>
          <div className="space-y-3">
            {(grupo.filamentos || []).map((fil, index) => (
              <div key={index} className="bg-white p-3 rounded-md border">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Principal */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Principal</label>
                    <select
                      value={fil.principal}
                      onChange={(e) => handleFilamentChange(index, 'principal', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                    >
                      <option value="">Selecione Grupo</option>
                      {filamentGroups.map((fg) => (
                        <option key={fg} value={fg}>{fg}</option>
                      ))}
                    </select>
                  </div>
                  {/* Alternativo */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Alternativo (Opcional)</label>
                    <select
                      value={fil.alternativo}
                      onChange={(e) => handleFilamentChange(index, 'alternativo', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                    >
                      <option value="">Selecione Grupo</option>
                      {filamentGroups.map((fg) => (
                        <option key={fg} value={fg}>{fg}</option>
                      ))}
                    </select>
                  </div>
                  {/* Quantidade */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Quantidade (g)</label>
                    <input
                      type="number"
                      placeholder="e.g. 50"
                      min="0"
                      value={fil.quantidade}
                      onChange={(e) => handleFilamentChange(index, 'quantidade', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-2">
                  <button type="button" onClick={() => removeFilament(index)} className="text-red-500 text-xs hover:text-red-700">
                    Remover Filamento
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addFilament}
              className="w-full mt-2 px-4 py-2 border border-dashed border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 flex items-center justify-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Filamento
            </button>
          </div>
        </div>

        {/* Partes Section */}
        <div>
          <h5 className="text-sm font-medium text-gray-700 mb-2">
            Partes {isComposta ? '(Obrigatório)' : '(Automático para peça simples)'}
          </h5>
          {isComposta ? (
            <div className="space-y-3">
              {/* Form to add new part */}
              <div className="grid grid-cols-12 gap-2 p-2 bg-white rounded-md border">
                <div className="col-span-5"><input type="text" placeholder="Nome da nova parte" value={novaParte.nome} onChange={(e) => setNovaParte({ ...novaParte, nome: e.target.value })} className="w-full rounded-md sm:text-sm" /></div>
                <div className="col-span-3"><input type="text" placeholder="Identificador" value={novaParte.identificador} onChange={(e) => setNovaParte({ ...novaParte, identificador: e.target.value })} className="w-full rounded-md sm:text-sm" /></div>
                <div className="col-span-2"><input type="number" min="1" value={novaParte.quantidade} onChange={(e) => setNovaParte({ ...novaParte, quantidade: parseInt(e.target.value) || 1 })} className="w-full rounded-md sm:text-sm" /></div>
                <div className="col-span-2"><button type="button" onClick={handleAddParte} className="w-full px-2 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200 flex items-center justify-center"><Plus className="h-4 w-4" /></button></div>
              </div>
              {/* Button to add existing part */}
              <button type="button" onClick={() => setIsParteModalOpen(true)} className="w-full px-4 py-2 border border-dashed border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 flex items-center justify-center">
                <GitBranch className="h-4 w-4 mr-2" />
                Adicionar Parte Existente
              </button>
              {/* List of parts */}
              {(grupo.partes || []).length > 0 && (
                <div className="border rounded divide-y">
                  {(grupo.partes || []).map((parte, index) => (
                    <div key={index} className="p-2 flex justify-between items-center bg-white">
                      <div>
                        <div className="font-medium">{parte.nome}</div>
                        <div className="text-sm text-gray-500">SKU: {parte.sku} • Qtd: {parte.quantidade}</div>
                      </div>
                      <button type="button" onClick={() => onChange({ ...grupo, partes: (grupo.partes || []).filter((_, i) => i !== index) })} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white p-3 rounded text-sm border">Para peças simples, uma parte será criada automaticamente com o mesmo SKU da peça.</div>
          )}
        </div>

        {/* Tempo de Impressão e Quantidade Máxima */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tempo de Impressão (minutos)</label>
            <input
              type="number"
              placeholder="e.g. 120"
              min="0"
              value={grupo.tempoImpressao}
              onChange={(e) => onChange({ ...grupo, tempoImpressao: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Qtd. Máxima por Impressão</label>
            <input
              type="number"
              placeholder="e.g. 4"
              min="1"
              value={grupo.quantidadeMaxima || ''}
              onChange={(e) => onChange({ ...grupo, quantidadeMaxima: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
            />
          </div>
        </div>
      </div>

      <ParteSelectionModal isOpen={isParteModalOpen} onClose={() => setIsParteModalOpen(false)} onSelect={handleSelectParte} />
    </div>
  );
}
