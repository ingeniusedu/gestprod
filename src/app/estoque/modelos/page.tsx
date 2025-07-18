"use client";

import React, { useState, useEffect } from 'react';
import { Plus, Search, Box, Edit, Trash2, Settings, Spool, List, Grid } from 'lucide-react';
import ModeloFormModal from '../../components/ModeloFormModal';
import ServiceCostModal from '../../components/ServiceCostModal';
import { db, auth, deleteModelos, getLocaisProdutos, getLocaisInsumos, getRecipientes } from '../../services/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Modelo, Peca, Insumo, PosicaoEstoque } from '../../types';
import { LocalProduto, LocalInsumo, Recipiente } from '../../types/mapaEstoque';

export default function ModelosPage({ isOnlyButton = false, searchTerm: propSearchTerm = '' }) {
  const [searchTerm, setSearchTerm] = useState(propSearchTerm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isServiceCostModalOpen, setIsServiceCostModalOpen] = useState(false);
  const [modeloToEdit, setModeloToEdit] = useState<Modelo | null>(null);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [selectedModelos, setSelectedModelos] = useState<string[]>([]);
  const [pecas, setPecas] = useState<Peca[]>([]); // Needed for calculating modelo costs
  const [insumos, setInsumos] = useState<Insumo[]>([]); // Needed for calculating peca costs within modelos
  const [locaisDeEstoque, setLocaisDeEstoque] = useState<(LocalProduto | LocalInsumo)[]>([]);
  const [recipientes, setRecipientes] = useState<Recipiente[]>([]);
  const [serviceCosts, setServiceCosts] = useState({
    custoPorMinutoImpressao: 0,
    custoPorMinutoMontagem: 0,
    custoPorGramaFilamento: 0,
  });
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

  // Helper to get color for the spool icon
  const getColorStyle = (colorName: string) => {
    const colorMap: { [key: string]: string } = {
      'Amarelo': '#FFD700', 'Areia': '#C2B280', 'Azul': '#0000FF', 'Azul Bebê': '#89CFF0',
      'Azul Cyan': '#00FFFF', 'Azul macaron': '#ADD8E6', 'Azul Tiffany': '#0ABAB5',
      'Branco': '#FFFFFF', 'Cappuccino': '#6F4E37', 'Caucasiano': '#F0DCB0',
      'Cinza Nintendo': '#808080', 'Laranja': '#FFA500', 'Laranja macaron': '#FFDAB9',
      'Magenta': '#FF00FF', 'Marrom': '#A52A2A', 'Natural': '#F5F5DC',
      'Preto': '#000000', 'Rosa Bebê': '#F4C2C2', 'Rosa macaron': '#FFB6C1',
      'Roxo': '#800080', 'Transição': 'linear-gradient(to right, #FF0000, #FFFF00, #00FF00, #0000FF)',
      'Verde': '#008000', 'Vermelho': '#FF0000', 'Vermelho escuro': '#8B0000',
      'Verde macaron': '#90EE90', 'Verde Menta': '#3EB489', 'Verde neon': '#39FF14',
      'Verde Oliva': '#6B8E23'
    };
    return colorMap[colorName] || '#CCCCCC'; // Default to grey if color not found
  };

  useEffect(() => {
    setSearchTerm(propSearchTerm);
  }, [propSearchTerm]);

  const fetchAllData = async () => {
    try {
      const modelosCollection = collection(db, 'modelos');
      const pecasCollection = collection(db, 'pecas');
      const insumosCollection = collection(db, 'insumos');
      const recipientesCollection = collection(db, 'recipientes');

      const [modelosSnapshot, pecasSnapshot, insumosSnapshot, recipientesSnapshot, locaisProdutosSnapshot, locaisInsumosSnapshot] = await Promise.all([
        getDocs(modelosCollection),
        getDocs(pecasCollection),
        getDocs(insumosCollection),
        getDocs(recipientesCollection),
        getLocaisProdutos(), // Use the specific function
        getLocaisInsumos()   // Use the specific function
      ]);

      setModelos(modelosSnapshot.docs.map(doc => {
        const data = doc.data();
        const posicoes = data.posicoesEstoque || [];
        const estoqueTotal = posicoes.reduce((acc: number, pos: PosicaoEstoque) => acc + pos.quantidade, 0);
        return { id: doc.id, ...data, estoqueTotal } as Modelo;
      }));
      setPecas(pecasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Peca[]);
      setInsumos(insumosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Insumo[]);
      setRecipientes(recipientesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Recipiente[]);
      setLocaisDeEstoque([...locaisProdutosSnapshot, ...locaisInsumosSnapshot] as (LocalProduto | LocalInsumo)[]); // Combine both

      const serviceCostsRef = doc(db, 'settings', 'serviceCosts');
      const serviceCostsSnap = await getDoc(serviceCostsRef);
      if (serviceCostsSnap.exists()) {
        setServiceCosts(serviceCostsSnap.data() as { custoPorMinutoImpressao: number; custoPorMinutoMontagem: number; custoPorGramaFilamento: number; });
      }
    } catch (error) {
      console.error("Error fetching data: ", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        fetchAllData();
      }
    });
    return () => unsubscribe();
  }, []);

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

  const filteredModelos = modelos
    .filter(modelo => {
      const modeloLocal = getLocalString(modelo.posicoesEstoque || []);
      return (
        modelo.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        modelo.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        modeloLocal.toLowerCase().includes(searchTerm.toLowerCase())
      );
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const openModal = (modelo: Modelo | null = null) => {
    setModeloToEdit(modelo);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModeloToEdit(null);
    fetchAllData(); // Refresh data after modal close
  };

  const openServiceCostModal = () => {
    setIsServiceCostModalOpen(true);
  };

  const closeServiceCostModal = () => {
    setIsServiceCostModalOpen(false);
    const fetchServiceCosts = async () => {
      try {
        const docRef = doc(db, 'settings', 'serviceCosts');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setServiceCosts(docSnap.data() as { custoPorMinutoImpressao: number; custoPorMinutoMontagem: number; custoPorGramaFilamento: number; });
        }
      } catch (error) {
        console.error("Error fetching service costs: ", error);
      }
    };
    fetchServiceCosts();
  };

  const handleSaveModelo = async (modeloData: Modelo) => {
    try {
      const { id, ...dataToSave } = modeloData; // Separate id from data
      if (id) {
        await updateDoc(doc(db, 'modelos', id), dataToSave);
      } else {
        await addDoc(collection(db, 'modelos'), dataToSave);
      }
      closeModal();
    } catch (error) {
      console.error("Error saving model: ", error);
      alert('Erro ao salvar o modelo. Verifique o console para mais detalhes.');
    }
  };

  const handleEditModelo = (modelo: Modelo) => {
    openModal(modelo);
  };

  const handleDeleteProduto = async (id: string, tipo: string) => {
    if (window.confirm(`Tem certeza que deseja deletar este ${tipo}? Esta ação não pode ser desfeita.`)) {
      try {
        // Assuming 'tipo' is 'modelo' here, as this function is only called for models in this file
        await deleteModelos([id]); // Use the new bulk delete function for consistency
        setModelos(prev => prev.filter(p => p.id !== id));
        setSelectedModelos(prev => prev.filter(modeloId => modeloId !== id));
      } catch (error) {
        console.error(`Error deleting ${tipo}: `, error);
      }
    }
  };

  const handleDeleteSelectedModelos = async () => {
    if (window.confirm(`Tem certeza que deseja deletar ${selectedModelos.length} modelos selecionados?`)) {
      try {
        await deleteModelos(selectedModelos);
        await fetchAllData();
        setSelectedModelos([]);
      } catch (error) {
        console.error("Error deleting selected modelos: ", error);
      }
    }
  };

  const handleSelectModelo = (id: string) => {
    setSelectedModelos(prev =>
      prev.includes(id) ? prev.filter(modeloId => modeloId !== id) : [...prev, id]
    );
  };

  const handleSelectAllModelos = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedModelos(filteredModelos.map(m => m.id as string));
    } else {
      setSelectedModelos([]);
    }
  };

  const renderModeloCard = (modelo: Modelo) => {
    if (!modelo.id) return null; // Ensure modelo.id is defined

    const {
      nome,
      sku,
      custoCalculado = 0,
      tempoMontagem = 0,
      pecas: modeloPecas = [],
      estoqueTotal = 0,
      posicoesEstoque = []
    } = modelo;

    let uniqueColors = new Set<string>();
    let totalPecasCount = 0;
    let gruposImpressaoOtimizado = 0;
    let gruposImpressaoTotal = 0;
    let totalFilamentQuantity = 0;
    let totalTempoImpressao = 0; // Initialize totalTempoImpressao

    modeloPecas.forEach(modeloPeca => {
      const foundPeca = pecas.find(p => p.id === modeloPeca.pecaId);
      if (foundPeca) {
        totalPecasCount += modeloPeca.quantidade;
        if (foundPeca.gruposImpressao) {
          gruposImpressaoOtimizado += foundPeca.gruposImpressao.length;
          gruposImpressaoTotal += foundPeca.gruposImpressao.length * modeloPeca.quantidade;
          foundPeca.gruposImpressao.forEach(grupo => {
            totalTempoImpressao += Number(grupo.tempoImpressao || 0); // Accumulate impression time
            if (grupo.filamentos && Array.isArray(grupo.filamentos)) { // Ensure it's an array
              grupo.filamentos.forEach(fil => {
                if (fil.quantidade > 0) {
                  totalFilamentQuantity += Number(fil.quantidade || 0);
                }
                const insumo = insumos.find(i => i.grupoFilamentoId === fil.grupoFilamentoId); // Corrected property name
                if (insumo?.cor) {
                  uniqueColors.add(insumo.cor);
                }
              });
            }
          });
        }
      }
    });

    return (
      <div key={modelo.id} className={`bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow relative group ${selectedModelos.includes(modelo.id as string) ? 'ring-2 ring-blue-500' : ''}`}>
        <input
          type="checkbox"
          className="absolute top-2 left-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
          checked={selectedModelos.includes(modelo.id as string)}
          onChange={() => handleSelectModelo(modelo.id as string)}
        />
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{nome}</h3>
            <p className="text-sm text-gray-500">SKU: {sku}</p>
          </div>
          <Box className="h-8 w-8 text-green-500" />
        </div>
        <div className="space-y-2 mb-4">
          <div className="text-sm text-gray-600">
            <strong>Peças componentes:</strong> {totalPecasCount}
          </div>
          <div className="text-sm text-gray-600">
            <strong>Grupos de Impressão:</strong> {gruposImpressaoOtimizado} (Total: {gruposImpressaoTotal})
          </div>
          <div className="text-sm text-gray-600">
            <strong>Número de Cores:</strong> {uniqueColors.size}
          </div>
          <div className="text-sm text-gray-600">
            <strong>Estoque Total:</strong> {estoqueTotal || 0}
          </div>
          <div className="text-sm text-gray-600">
            <strong>Local(is):</strong> {getLocalString(posicoesEstoque)}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 space-y-1 text-sm text-gray-600">
          <div><strong>Impressão:</strong> {totalTempoImpressao} min</div>
          <div><strong>Filamento:</strong> {totalFilamentQuantity.toFixed(2)} g</div>
          <div><strong>Montagem:</strong> {tempoMontagem} min</div>
          <div><strong>Custo:</strong> R$ {(custoCalculado || 0).toFixed(2)}</div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={() => handleEditModelo(modelo)}
            className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
            title="Editar Modelo"
          >
            <Edit className="h-5 w-5" />
          </button>
          <button
            onClick={() => handleDeleteProduto(modelo.id as string, 'modelo')}
            className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
            title="Deletar Modelo"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  };

  const renderModeloListRow = (modelo: Modelo) => {
    if (!modelo.id) return null; // Ensure modelo.id is defined

    const {
      nome,
      sku,
      custoCalculado = 0,
      tempoMontagem = 0,
      pecas: modeloPecas = [],
      estoqueTotal = 0,
      posicoesEstoque = []
    } = modelo;

    let uniqueColors = new Set<string>();
    let totalPecasCount = 0;
    let gruposImpressaoOtimizado = 0;
    let gruposImpressaoTotal = 0;
    let totalFilamentQuantity = 0;
    let totalTempoImpressao = 0; // Initialize totalTempoImpressao

    modeloPecas.forEach(modeloPeca => {
      const foundPeca = pecas.find(p => p.id === modeloPeca.pecaId);
      if (foundPeca) {
        totalPecasCount += modeloPeca.quantidade;
        if (foundPeca.gruposImpressao) {
          gruposImpressaoOtimizado += foundPeca.gruposImpressao.length;
          gruposImpressaoTotal += foundPeca.gruposImpressao.length * modeloPeca.quantidade;
          foundPeca.gruposImpressao.forEach(grupo => {
            totalTempoImpressao += Number(grupo.tempoImpressao || 0); // Accumulate impression time
            if (grupo.filamentos && Array.isArray(grupo.filamentos)) { // Ensure it's an array
              grupo.filamentos.forEach(fil => {
                if (fil.quantidade > 0) {
                  totalFilamentQuantity += Number(fil.quantidade || 0);
                }
                const insumo = insumos.find(i => i.grupoFilamentoId === fil.grupoFilamentoId); // Corrected property name
                if (insumo?.cor) {
                  uniqueColors.add(insumo.cor);
                }
              });
            }
          });
        }
      }
    });

    return (
      <tr key={modelo.id} className={`hover:bg-gray-50 ${selectedModelos.includes(modelo.id as string) ? 'bg-blue-50' : ''}`}>
        <td className="px-6 py-4 whitespace-nowrap">
          <input
            type="checkbox"
            checked={selectedModelos.includes(modelo.id as string)}
            onChange={() => handleSelectModelo(modelo.id as string)}
          />
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sku}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{nome}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{totalPecasCount}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{gruposImpressaoOtimizado} ({gruposImpressaoTotal})</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{uniqueColors.size}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{totalTempoImpressao} min</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{totalFilamentQuantity.toFixed(2)} g</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{tempoMontagem} min</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">R$ {(custoCalculado || 0).toFixed(2)}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{estoqueTotal || 0}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getLocalString(posicoesEstoque)}</td>
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex items-center justify-end">
            <button
              onClick={() => handleEditModelo(modelo)}
              className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
              title="Editar Modelo"
            >
              <Edit className="h-5 w-5" />
            </button>
            <button
              onClick={() => handleDeleteProduto(modelo.id as string, 'modelo')}
              className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
              title="Deletar Modelo"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  if (isOnlyButton) {
    return (
      <>
        <button
          onClick={openServiceCostModal}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          <Settings className="h-4 w-4 mr-2" />
          Serviços
        </button>
        <button
          onClick={() => openModal()}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Modelo
        </button>
        <ModeloFormModal
          isOpen={isModalOpen}
          onClose={closeModal}
          modelo={modeloToEdit}
          onSave={handleSaveModelo}
        />
        <ServiceCostModal
          isOpen={isServiceCostModalOpen}
          onClose={closeServiceCostModal}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">
          Estoque de Modelos ({filteredModelos.length})
        </h3>
        <div className="flex items-center space-x-4">
          {selectedModelos.length > 0 && (
            <button
              onClick={handleDeleteSelectedModelos}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Deletar Selecionados ({selectedModelos.length})
            </button>
          )}
          <div className="flex items-center">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:bg-gray-100'}`}
              title="Visualizar em Cards"
            >
              <Grid className="h-5 w-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md ${viewMode === 'list' ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:bg-gray-100'}`}
              title="Visualizar em Lista"
            >
              <List className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
      {filteredModelos.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 px-6 py-4">
            {filteredModelos.map(renderModeloCard)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      onChange={handleSelectAllModelos}
                      checked={selectedModelos.length === filteredModelos.length && filteredModelos.length > 0}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Peças</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grupos Imp. (Otimizado/Total)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cores</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Imp. (min)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fil. (g)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mont. (min)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Custo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estoque</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Local</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredModelos.map(renderModeloListRow)}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="bg-white shadow rounded-lg p-12">
          <div className="text-center">
            <Box className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum modelo encontrado</h3>
            <p className="mt-1 text-sm text-gray-500">
              Tente ajustar o termo de busca ou criar um novo modelo.
            </p>
          </div>
        </div>
      )}

      <ModeloFormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        modelo={modeloToEdit}
        onSave={handleSaveModelo}
      />
      <ServiceCostModal
        isOpen={isServiceCostModalOpen}
        onClose={closeServiceCostModal}
      />
    </div>
  );
}
