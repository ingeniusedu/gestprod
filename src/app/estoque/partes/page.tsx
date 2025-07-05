"use client";

import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import { getPartes, addParte, updateParte, deleteParte, deletePartes, getLocaisDeEstoque, getRecipientes } from '../../services/firebase';
import { Parte, PosicaoEstoque } from '../../types';
import { LocalDeEstoque, Recipiente } from '../../types/mapaEstoque';

const PartesPage = ({ isOnlyButton = false, searchTerm: propSearchTerm = '' }) => {
  const [searchTerm, setSearchTerm] = useState(propSearchTerm);
  const [partes, setPartes] = useState<Parte[]>([]);
  const [selectedPartes, setSelectedPartes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentParte, setCurrentParte] = useState<Parte | null>(null);
  const [locaisDeEstoque, setLocaisDeEstoque] = useState<LocalDeEstoque[]>([]);
  const [recipientes, setRecipientes] = useState<Recipiente[]>([]);
  const [formData, setFormData] = useState({
    sku: '',
    nome: '',
    posicoesEstoque: [] as PosicaoEstoque[], // Initialize as empty array
  });

  useEffect(() => {
    setSearchTerm(propSearchTerm);
  }, [propSearchTerm]);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [partesList, locaisList, recipientesList] = await Promise.all([
          getPartes(),
          getLocaisDeEstoque(),
          getRecipientes(),
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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleAddEditParte = async (e) => {
    e.preventDefault();
    try {
      if (currentParte) {
        await updateParte(currentParte.id, formData);
      } else {
        await addParte(formData);
      }
      const updatedPartes = await getPartes();
      setPartes(updatedPartes);
      setIsModalOpen(false);
      setCurrentParte(null);
      setFormData({ sku: '', nome: '', posicoesEstoque: [] });
    } catch (err) {
      setError("Failed to save parte.");
      console.error(err);
    }
  };

  const handleDeleteParte = async (id) => {
    if (window.confirm("Tem certeza que deseja deletar esta parte?")) {
      try {
        await deleteParte(id);
        const updatedPartes = await getPartes();
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
        const updatedPartes = await getPartes();
        setPartes(updatedPartes);
        setSelectedPartes([]);
      } catch (err) {
        setError("Failed to delete selected partes.");
        console.error(err);
      }
    }
  };

  const handleSelectParte = (id) => {
    setSelectedPartes(prev =>
      prev.includes(id) ? prev.filter(parteId => parteId !== id) : [...prev, id]
    );
  };

  const handleSelectAllPartes = (e) => {
    if (e.target.checked) {
      setSelectedPartes(filteredPartes.map(p => p.id));
    } else {
      setSelectedPartes([]);
    }
  };

  const openModal = (parte = null) => {
    setCurrentParte(parte);
    if (parte) {
      setFormData(parte);
    } else {
      setFormData({ sku: '', nome: '', estoque: 0, local: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentParte(null);
    setFormData({ sku: '', nome: '', estoque: 0, local: '' });
  };

  const getLocalName = (recipienteId: string) => {
    const recipiente = recipientes.find(r => r.id === recipienteId);
    if (recipiente) {
      const local = locaisDeEstoque.find(l => l.id === recipiente.localEstoqueId);
      return local ? local.nome : 'Local Desconhecido';
    }
    return 'N/A';
  };

  const getLocalString = (posicoes: PosicaoEstoque[]) => {
    if (!posicoes || posicoes.length === 0) return 'N/A';
    const uniqueLocations = Array.from(new Set(posicoes.map(pos => getLocalName(pos.recipienteId))));
    return uniqueLocations.join(', ');
  };

  const filteredPartes = partes.filter(parte => {
    const parteLocal = getLocalString(parte.posicoesEstoque || []);
    return (
      parte.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      parte.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      parteLocal.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

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
              {filteredPartes.map((parte) => (
                <tr key={parte.id} className={`hover:bg-gray-50 ${selectedPartes.includes(parte.id!) ? 'bg-blue-50' : ''}`}>
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getLocalString(parte.posicoesEstoque || [])}</td>
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
              ))}
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
