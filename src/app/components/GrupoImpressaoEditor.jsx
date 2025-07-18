"use client";

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, GitBranch } from 'lucide-react';
import ParteSelectionModal from './ParteSelectionModal';
import { db } from '../services/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export default function GrupoImpressaoEditor({
  grupo,
  onChange,
  onRemove,
  pecaSku,
  isComposta,
}) {
  const [isParteModalOpen, setIsParteModalOpen] = useState(false);
  const [novaParte, setNovaParte] = useState({
    nome: '',
    identificador: '',
    quantidade: 1,
  });
  const [filamentGroups, setFilamentGroups] = useState([]);
  const [otherInsumos, setOtherInsumos] = useState([]); // New state for other insumos

  useEffect(() => {
    const fetchInsumos = async () => {
      // Fetch filament groups
      const groupsCollection = collection(db, 'gruposDeFilamento');
      const groupsSnapshot = await getDocs(groupsCollection);
      const groupsList = groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFilamentGroups(groupsList);

      // Fetch other insumos (material, tempo, outros)
      const insumosCollection = collection(db, 'insumos');
      const q = query(insumosCollection, where("tipo", "in", ["material", "tempo", "outros"]));
      const insumosSnapshot = await getDocs(q);
      const insumosList = insumosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOtherInsumos(insumosList);
    };

    fetchInsumos();
  }, []);

  const handleInsumoChange = (index, field, value, insumoType, alternativeIndex = null) => {
    let updatedFilamentos = JSON.parse(JSON.stringify(grupo.filamentos || []));
    let updatedOutrosInsumos = JSON.parse(JSON.stringify(grupo.outrosInsumos || []));

    if (insumoType === 'filamento') {
      if (alternativeIndex === null) {
        updatedFilamentos[index][field] = value;
      } else {
        if (!updatedFilamentos[index].alternativeFilaments) {
          updatedFilamentos[index].alternativeFilaments = [];
        }
        updatedFilamentos[index].alternativeFilaments[alternativeIndex][field] = value;
      }
    } else { // material, tempo, outros
      updatedOutrosInsumos[index][field] = value;
    }

    onChange({ ...grupo, filamentos: updatedFilamentos, outrosInsumos: updatedOutrosInsumos });
  };

  const addInsumo = (type) => {
    const newInsumo = {
      quantidade: '',
      tipo: type,
    };
    if (type === 'filamento') {
      newInsumo.grupoFilamentoId = '';
      newInsumo.alternativeFilaments = [];
      onChange({ ...grupo, filamentos: [...(grupo.filamentos || []), newInsumo] });
    } else {
      newInsumo.insumoId = '';
      if (type === 'material') {
        newInsumo.etapaInstalacao = 'impressao'; // Default for material
      }
      onChange({ ...grupo, outrosInsumos: [...(grupo.outrosInsumos || []), newInsumo] });
    }
  };

  const removeInsumo = (index, insumoType, alternativeIndex = null) => {
    let updatedFilamentos = JSON.parse(JSON.stringify(grupo.filamentos || []));
    let updatedOutrosInsumos = JSON.parse(JSON.stringify(grupo.outrosInsumos || []));

    if (insumoType === 'filamento') {
      if (alternativeIndex === null) {
        updatedFilamentos.splice(index, 1);
      } else {
        if (updatedFilamentos[index] && updatedFilamentos[index].alternativeFilaments) {
          updatedFilamentos[index].alternativeFilaments.splice(alternativeIndex, 1);
        }
      }
    } else { // material, tempo, outros
      updatedOutrosInsumos.splice(index, 1);
    }
    onChange({ ...grupo, filamentos: updatedFilamentos, outrosInsumos: updatedOutrosInsumos });
  };

  const addAlternativeFilament = (mainIndex) => {
    const updatedFilamentos = JSON.parse(JSON.stringify(grupo.filamentos || []));
    if (!updatedFilamentos[mainIndex].alternativeFilaments) {
      updatedFilamentos[mainIndex].alternativeFilaments = [];
    }
    updatedFilamentos[mainIndex].alternativeFilaments.push({
      grupoFilamentoId: '',
      quantidade: updatedFilamentos[mainIndex].quantidade, // Inherit quantity
      tipo: 'filamento',
      isAlternative: true,
    });
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
        {/* Insumos Section */}
        <div>
          {/* Filamentos Section */}
          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Filamentos</h5>
            <div className="space-y-3">
              {(grupo.filamentos || []).map((insumo, index) => (
                <div key={`filament-${index}`} className="bg-white p-3 rounded-md border">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Main Filament */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600">Grupo de Filamento Principal</label>
                      <select
                        value={insumo.grupoFilamentoId}
                        onChange={(e) => handleInsumoChange(index, 'grupoFilamentoId', e.target.value, 'filamento')}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                      >
                        <option value="">Selecione Grupo</option>
                        {filamentGroups.map((fg) => (
                          <option key={fg.id} value={fg.id}>{fg.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600">Quantidade (g)</label>
                      <input
                        type="number"
                        placeholder="e.g. 50"
                        min="0"
                        value={insumo.quantidade}
                        onChange={(e) => handleInsumoChange(index, 'quantidade', e.target.value, 'filamento')}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                      />
                    </div>
                  </div>

                  {/* Alternative Filaments */}
                  <div className="pl-4 mt-3 border-l-2 border-gray-200 space-y-2">
                    {(insumo.alternativeFilaments || []).map((altFil, altIndex) => (
                      <div key={`alt-filament-${altIndex}`} className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-gray-400" />
                        <select
                          value={altFil.grupoFilamentoId}
                          onChange={(e) => handleInsumoChange(index, 'grupoFilamentoId', e.target.value, 'filamento', altIndex)}
                          className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                        >
                          <option value="">Selecione Filamento Alternativo</option>
                          {filamentGroups.map((fg) => (
                            <option key={fg.id} value={fg.id}>{fg.nome}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => removeInsumo(index, 'filamento', altIndex)} className="text-red-500 hover:text-red-700 p-1">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addAlternativeFilament(index)}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Adicionar Alternativo
                    </button>
                  </div>

                  <div className="flex justify-end mt-2">
                    <button type="button" onClick={() => removeInsumo(index, 'filamento')} className="text-red-500 text-xs hover:text-red-700">
                      Remover Filamento
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addInsumo('filamento')}
                className="mt-2 px-4 py-2 border border-dashed border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 flex items-center justify-center w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Filamento
              </button>
            </div>
          </div>

          {/* Outros Insumos Section */}
          <div className="mt-6">
            <h5 className="text-sm font-medium text-gray-700 mb-2">Outros Insumos (Materiais, Tempo, Outros)</h5>
            <div className="space-y-3">
              {(grupo.outrosInsumos || []).map((insumo, index) => (
                <div key={`other-insumo-${index}`} className="bg-white p-3 rounded-md border">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600">Tipo de Insumo</label>
                      <select
                        value={insumo.tipo}
                        onChange={(e) => handleInsumoChange(index, 'tipo', e.target.value, insumo.tipo)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                      >
                        <option value="material">Material</option>
                        <option value="tempo">Tempo</option>
                        <option value="outros">Outros</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600">Insumo</label>
                      <select
                        value={insumo.insumoId}
                        onChange={(e) => handleInsumoChange(index, 'insumoId', e.target.value, insumo.tipo)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                      >
                        <option value="">Selecione Insumo</option>
                        {otherInsumos.filter(oi => oi.tipo === insumo.tipo).map((oi) => (
                          <option key={oi.id} value={oi.id}>{oi.nome} ({oi.unidade})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600">Quantidade</label>
                      <input
                        type="number"
                        placeholder="e.g. 1"
                        min="0"
                        value={insumo.quantidade}
                        onChange={(e) => handleInsumoChange(index, 'quantidade', e.target.value, insumo.tipo)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                      />
                    </div>
                    {insumo.tipo === 'material' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600">Etapa de Instalação</label>
                        <select
                          value={insumo.etapaInstalacao}
                          onChange={(e) => handleInsumoChange(index, 'etapaInstalacao', e.target.value, insumo.tipo)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                        >
                          <option value="impressao">Impressão</option>
                          <option value="montagem">Montagem</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end mt-2">
                    <button type="button" onClick={() => removeInsumo(index, insumo.tipo)} className="text-red-500 text-xs hover:text-red-700">
                      Remover Insumo
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex space-x-2 mt-2">
                <button
                  type="button"
                  onClick={() => addInsumo('material')}
                  className="flex-1 px-4 py-2 border border-dashed border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 flex items-center justify-center"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Material
                </button>
                <button
                  type="button"
                  onClick={() => addInsumo('tempo')}
                  className="flex-1 px-4 py-2 border border-dashed border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 flex items-center justify-center"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Tempo
                </button>
                <button
                  type="button"
                  onClick={() => addInsumo('outros')}
                  className="flex-1 px-4 py-2 border border-dashed border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 flex items-center justify-center"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Outros
                </button>
              </div>
            </div>
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
