"use client";

import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { getPartes, addParte, updateParte, deleteParte, deletePartes, getLocaisProdutos, getRecipientes, db } from '../../services/firebase';
import { Parte, PosicaoEstoque } from '../../types';
import { LocalProduto, Recipiente } from '../../types/mapaEstoque';
import { v4 as uuidv4 } from 'uuid';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { cleanObject } from '../../utils/cleanObject';

interface DetailedLocation {
  displayString: string;
  recipienteId: string;
  divisao?: { h: number; v: number };
}

const PartesPage = ({ isOnlyButton = false, searchTerm: propSearchTerm = '' }) => {
  const [searchTerm, setSearchTerm] = useState(propSearchTerm);
  const [partes, setPartes] = useState<Parte[]>([]);
  const [selectedPartes, setSelectedPartes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentParte, setCurrentParte] = useState<Parte | null>(null);
  const [locaisDeEstoque, setLocaisDeEstoque] = useState<LocalProduto[]>([]);
  const [recipientes, setRecipientes] = useState<Recipiente[]>([]);
  const [formData, setFormData] = useState({
    sku: '',
    nome: '',
    posicoesEstoque: [] as PosicaoEstoque[], // Initialize as empty array
  });
  const [expandedRows, setExpandedRows] = useState<string[]>([]);

  useEffect(() => {
    setSearchTerm(propSearchTerm);
  }, [propSearchTerm]);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [partesList, locaisList, recipientesList] = await Promise.all([
          getPartes() as Promise<Parte[]>,
          getLocaisProdutos() as Promise<LocalProduto[]>,
          getRecipientes() as Promise<Recipiente[]>,
        ]);
        setPartes(partesList);
        setLocaisDeEstoque(locaisList);
        setRecipientes(recipientesList);
      } catch (err) {
        setError("Failed to fetch data.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAllData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleAddEditParte = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (currentParte) {
        // For existing parts, we only allow updating SKU and Nome directly.
        // Stock positions are managed via separate launches.
        await updateParte(currentParte.id, { sku: formData.sku, nome: formData.nome });
      } else {
        // When adding a new part, create the part document first.
        // When adding a new part, create the part document. Stock positions are managed via separate launches.
        await addParte({ sku: formData.sku, nome: formData.nome, posicoesEstoque: [] });
      }
      const updatedPartes = await getPartes() as Parte[];
      setPartes(updatedPartes);
      setIsModalOpen(false);
      setCurrentParte(null);
      setFormData({ sku: '', nome: '', posicoesEstoque: [] });
    } catch (err) {
      setError("Failed to save parte.");
      console.error(err);
    }
  };

  const handleDeleteParte = async (id: string) => {
    if (window.confirm("Tem certeza que deseja deletar esta parte?")) {
      try {
        await deleteParte(id);
        const updatedPartes = await getPartes() as Parte[];
        setPartes(updatedPartes);
        setSelectedPartes(prev => prev.filter(parteId => parteId !== id));
      } catch (err) {
        setError("Failed to delete parte.");
        console.error(err);
      }
    }
  };

  const handleDeleteSelectedPartes = async () => {
    if (window.confirm(`Tem certeza que deseja deletar ${selectedPartes.length} partes selecionadas?`)) {
      try {
        await deletePartes(selectedPartes);
        const updatedPartes = await getPartes() as Parte[];
        setPartes(updatedPartes);
        setSelectedPartes([]);
      } catch (err) {
        setError("Failed to delete selected partes.");
        console.error(err);
      }
    }
  };

  const handleSelectParte = (id: string) => {
    setSelectedPartes(prev =>
      prev.includes(id) ? prev.filter(parteId => parteId !== id) : [...prev, id]
    );
  };

  const handleSelectAllPartes = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedPartes(filteredPartes.map(p => p.id!));
    } else {
      setSelectedPartes([]);
    }
  };

  const openModal = (parte: Parte | null = null) => {
    setCurrentParte(parte);
    if (parte) {
      setFormData({
        sku: parte.sku,
        nome: parte.nome,
        posicoesEstoque: parte.posicoesEstoque || [],
      });
    } else {
      setFormData({ sku: '', nome: '', posicoesEstoque: [] });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentParte(null);
    setFormData({ sku: '', nome: '', posicoesEstoque: [] });
  };

  const getDetailedLocations = (posicoes: PosicaoEstoque[]) => {
    if (!posicoes || posicoes.length === 0) return [];

    return posicoes.map(pos => {
      const recipiente = recipientes.find((r: Recipiente) => r.id === pos.recipienteId);
      if (recipiente) {
        const local = locaisDeEstoque.find((l: LocalProduto) => l.id === recipiente.localEstoqueId);
        const localName = local ? local.nome : 'Local Desconhecido';
        const { x, y, z } = recipiente.posicaoNaGrade;
        const divisionString = pos.divisao ? ` (Divisão: H${pos.divisao.h} V${pos.divisao.v})` : '';
        return {
          displayString: `${localName} (${x},${y},${z})${divisionString}`,
          recipienteId: pos.recipienteId,
          divisao: pos.divisao,
        } as DetailedLocation;
      }
      return null;
    }).filter((loc): loc is DetailedLocation => loc !== null); // Filter out nulls and assert type
  };

  const getLocalSummaryString = (posicoes: PosicaoEstoque[]) => {
    const detailedLocations = getDetailedLocations(posicoes);
    if (detailedLocations.length === 0) return 'N/A';
    const uniqueSummary = Array.from(new Set(detailedLocations.map(loc => loc.displayString.split(' (Divisão:')[0])));
    return uniqueSummary.join(', ');
  };

  const toggleRowExpansion = (parteId: string) => {
    setExpandedRows(prev =>
      prev.includes(parteId) ? prev.filter(id => id !== parteId) : [...prev, parteId]
    );
  };

  const filteredPartes = partes
    .filter((parte: Parte) => {
      const parteLocalSummary = getLocalSummaryString(parte.posicoesEstoque || []);
      return (
        parte.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        parte.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        parteLocalSummary.toLowerCase().includes(searchTerm.toLowerCase())
      );
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));

  if (loading) return (
    <div className="text-center py-12">
      <p>Carregando partes...</p>
    </div>
  );

  if (error) return <p className="text-red-500 text-center py-12">{error}</p>;

  if (isOnlyButton) {
    return (
      <button
        onClick={() => openModal()}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        <Plus className="h-4 w-4 mr-2" />
        Nova Parte
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">
          Estoque de Partes ({filteredPartes.length})
        </h3>
        {selectedPartes.length > 0 && (
          <button
            onClick={handleDeleteSelectedPartes}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Deletar Selecionadas ({selectedPartes.length})
          </button>
        )}
      </div>
      {filteredPartes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    onChange={handleSelectAllPartes}
                    checked={selectedPartes.length === filteredPartes.length && filteredPartes.length > 0}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estoque Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Local(is)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPartes.map((parte) => {
                const isExpanded = expandedRows.includes(parte.id!);
                const detailedLocations = getDetailedLocations(parte.posicoesEstoque || []);
                return (
                  <React.Fragment key={parte.id}>
                    <tr className={`hover:bg-gray-50 ${selectedPartes.includes(parte.id!) ? 'bg-blue-50' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedPartes.includes(parte.id!)}
                          onChange={() => handleSelectParte(parte.id!)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{parte.sku}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{parte.nome}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{parte.estoqueTotal || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center">
                          {getLocalSummaryString(parte.posicoesEstoque || [])}
                          {detailedLocations.length > 1 && (
                            <button
                              onClick={() => toggleRowExpansion(parte.id!)}
                              className="ml-2 p-1 rounded-full hover:bg-gray-200"
                              title={isExpanded ? "Recolher Locais" : "Expandir Locais"}
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => openModal(parte)}
                            className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
                            title="Editar Parte"
                          >
                            <Edit className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteParte(parte.id!)}
                            className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
                            title="Deletar Parte"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && detailedLocations.length > 0 && ( // Changed from > 1 to > 0 to show even if only one detailed location exists
                      <tr>
                        <td colSpan={6} className="px-6 py-2 bg-gray-100 text-sm text-gray-700">
                          <ul className="list-disc list-inside ml-4">
                            {detailedLocations.map((loc, idx) => (
                              <li key={idx}>{loc.displayString}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <Search className="mx-auto h-12 w-12" />
          </div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">Nenhuma parte encontrada</h3>
          <p className="text-sm text-gray-500">
            Tente ajustar a busca ou adicione uma nova parte.
          </p>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {currentParte ? 'Editar Parte' : 'Adicionar Parte'}
            </h2>
            <form onSubmit={handleAddEditParte}>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="sku">
                  SKU
                </label>
                <input
                  type="text"
                  id="sku"
                  name="sku"
                  value={formData.sku}
                  onChange={handleInputChange}
                  className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="nome">
                  Nome
                </label>
                <input
                  type="text"
                  id="nome"
                  name="nome"
                  value={formData.nome}
                  onChange={handleInputChange}
                  className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
                  required
                />
              </div>
              {/* Removed estoque and local fields from form as they are now derived from posicoesEstoque */}
              <div className="flex items-center justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                >
                  {currentParte ? 'Salvar Alterações' : 'Criar Parte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartesPage;
