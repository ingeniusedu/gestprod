"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import { db, auth } from '../services/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { LocalProduto, LocalInsumo } from '../types/mapaEstoque';
import LocalDeEstoqueFormModal from '../components/LocalDeEstoqueFormModal';
import RecipienteFormModal from '../components/RecipienteFormModal';
import ImportRecipienteModal from '../components/ImportRecipienteModal';
import { Recipiente } from '../types/mapaEstoque';
import { Produto, PosicaoEstoque } from '../types';
import StorageGrid2D from '../components/StorageGrid2D';
import StorageDivisionView from '../components/StorageDivisionView';
import EstoqueLancamentoModal from '../components/EstoqueLancamentoModal';

export default function MapaEstoque() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [locais, setLocais] = useState<(LocalProduto | LocalInsumo)[]>([]);
  const [recipientes, setRecipientes] = useState<Recipiente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [isLocalModalOpen, setIsLocalModalOpen] = useState(false);
  const [isRecipienteModalOpen, setIsRecipienteModalOpen] = useState(false);
  const [isImportRecipienteModalOpen, setIsImportRecipienteModalOpen] = useState(false);
  const [isEstoqueModalOpen, setIsEstoqueModalOpen] = useState(false);
  const [initialTipoProduto, setInitialTipoProduto] = useState<string | undefined>(undefined);
  const [localToEdit, setLocalToEdit] = useState<(LocalProduto | LocalInsumo) & { collectionType?: 'locaisProdutos' | 'locaisInsumos' } | null>(null);
  const [recipienteToEdit, setRecipienteToEdit] = useState<Recipiente | null>(null);
  const [selectedLocal, setSelectedLocal] = useState<(LocalProduto | LocalInsumo) | null>(null); // New state for selected local
  const [currentZLevel, setCurrentZLevel] = useState(0); // State for current Z-level
  const [searchTerm, setSearchTerm] = useState('');

  // Memoize the max Z level for the selected local
  const maxZLevel = useMemo(() => {
    if (!selectedLocal || !selectedLocal.dimensoesGrade) return 0;
    return selectedLocal.dimensoesGrade.z - 1;
  }, [selectedLocal]);

  // Reset currentZLevel when selectedLocal changes
  useEffect(() => {
    if (selectedLocal) {
      setCurrentZLevel(0);
    }
  }, [selectedLocal]);

  const checkOverlap = (newRec: Recipiente, existingRecs: Recipiente[]) => {
    const newX1 = newRec.posicaoNaGrade.x;
    const newY1 = newRec.posicaoNaGrade.y;
    const newZ1 = newRec.posicaoNaGrade.z;
    const newX2 = newX1 + newRec.dimensoesOcupadas.x - 1;
    const newY2 = newY1 + newRec.dimensoesOcupadas.y - 1;
    const newZ2 = newZ1 + newRec.dimensoesOcupadas.z - 1; // End Z level for new recipient

    for (const existingRec of existingRecs) {
      if (newRec.id && newRec.id === existingRec.id) {
        continue;
      }

      if (existingRec.localEstoqueId === newRec.localEstoqueId) {
        const existingX1 = existingRec.posicaoNaGrade.x;
        const existingY1 = existingRec.posicaoNaGrade.y;
        const existingZ1 = existingRec.posicaoNaGrade.z;
        const existingX2 = existingX1 + existingRec.dimensoesOcupadas.x - 1;
        const existingY2 = existingY1 + existingRec.dimensoesOcupadas.y - 1;
        const existingZ2 = existingZ1 + existingRec.dimensoesOcupadas.z - 1; // End Z level for existing recipient

        // Check for overlap in X, Y, and Z dimensions
        if (
          newX1 <= existingX2 &&
          newX2 >= existingX1 &&
          newY1 <= existingY2 &&
          newY2 >= existingY1 &&
          newZ1 <= existingZ2 && // New Z starts before or at existing Z ends
          newZ2 >= existingZ1    // New Z ends after or at existing Z starts
        ) {
          return true; // Overlap detected
        }
      }
    }
    return false; // No overlap
  };

  const handleMoveRecipiente = async (recipienteId: string, newPosition: { x: number; y: number; z: number }) => {
    try {
      const recipienteToMove = recipientes.find(r => r.id === recipienteId);
      if (!recipienteToMove) {
        console.error("Recipiente not found for move operation.");
        return;
      }

      const updatedRecipiente = { ...recipienteToMove, posicaoNaGrade: newPosition };

      if (checkOverlap(updatedRecipiente, recipientes)) {
        alert("Não é possível mover o recipiente para esta posição, pois ele se sobrepõe a outro recipiente.");
        return;
      }

      const recipienteRef = doc(db, 'recipientes', recipienteId);
      await updateDoc(recipienteRef, { posicaoNaGrade: newPosition, updatedAt: new Date() });
      setRecipientes(prev =>
        prev.map(rec =>
          rec.id === recipienteId ? { ...rec, posicaoNaGrade: newPosition } : rec
        )
      );
      console.log(`Recipiente ${recipienteId} moved to`, newPosition);
    } catch (error) {
      console.error(`Error moving recipient ${recipienteId}:`, error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        fetchAllData();
      } else {
        setLocais([]);
        setRecipientes([]);
        setLoadingAuth(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchAllData = async () => {
    setLoadingAuth(true);
    try {
      const collectionsToFetch = ['partes', 'pecas', 'modelos', 'kits', 'insumos'];
      const productPromises = collectionsToFetch.map(c => getDocs(collection(db, c)));

      const [locaisProdutosSnapshot, locaisInsumosSnapshot, recipientesSnapshot, ...productSnapshots] = await Promise.all([
        getDocs(collection(db, 'locaisProdutos')),
        getDocs(collection(db, 'locaisInsumos')),
        getDocs(collection(db, 'recipientes')),
        ...productPromises
      ]);

      const locaisProdutosList = locaisProdutosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), collectionType: 'locaisProdutos' })) as LocalProduto[];
      const locaisInsumosList = locaisInsumosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), collectionType: 'locaisInsumos' })) as LocalInsumo[];
      const recipientesList = recipientesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Recipiente[];
      
      const allProducts = productSnapshots.flatMap((snapshot, index) => {
        const type = collectionsToFetch[index].slice(0, -1); // 'partes' -> 'parte'
        return snapshot.docs.map(doc => {
          const data = doc.data();
          const posicoes = data.posicoesEstoque || [];
          const estoqueTotal = posicoes.reduce((acc: number, pos: any) => acc + pos.quantidade, 0);
          return {
            id: doc.id,
            tipoProduto: type,
            ...data,
            estoqueTotal: estoqueTotal,
          } as Produto;
        });
      });

      setLocais([...locaisProdutosList, ...locaisInsumosList]);
      setRecipientes(recipientesList);
      setProdutos(allProducts);

    } catch (error) {
      console.error("Error fetching data: ", error);
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleSaveLocal = async (localData: LocalProduto | LocalInsumo, collectionType: 'locaisProdutos' | 'locaisInsumos') => {
    try {
      if (localData.id) {
        const localRef = doc(db, collectionType, localData.id);
        await updateDoc(localRef, { ...localData, updatedAt: new Date() });
        setLocais(prev => prev.map(l => (l.id === localData.id ? { ...l, ...localData } : l)));
      } else {
        // When adding a new document, ensure 'id' is not present in the data object.
        const dataToSave = { ...localData };
        if (dataToSave.id === undefined) { // Only delete if it's explicitly undefined
          delete dataToSave.id;
        }
        const docRef = await addDoc(collection(db, collectionType), { ...dataToSave, createdAt: new Date() });
        setLocais(prev => [...prev, { id: docRef.id, ...dataToSave } as (LocalProduto | LocalInsumo)]);
      }
      setIsLocalModalOpen(false);
      setLocalToEdit(null);
      fetchAllData(); // Refresh data
    } catch (error) {
      console.error("Error saving local de estoque: ", error);
    }
  };

  const handleSaveRecipiente = async (recipienteData: Recipiente) => {
    console.log("Attempting to save recipiente:", recipienteData);
    try {
      // Overlap check is now handled within RecipienteFormModal
      if (recipienteData.id) {
        const { id, ...dataToUpdate } = recipienteData;
        const recipienteRef = doc(db, 'recipientes', id);
        await updateDoc(recipienteRef, { ...dataToUpdate, updatedAt: new Date() });
        setRecipientes(prev => prev.map(r => (r.id === id ? { ...r, ...recipienteData } : r)));
        console.log("Recipiente updated successfully:", id);
      } else {
        const { id, ...dataToAdd } = recipienteData;
        const docRef = await addDoc(collection(db, 'recipientes'), { ...dataToAdd, createdAt: new Date() });
        setRecipientes(prev => [...prev, { id: docRef.id, ...recipienteData } as Recipiente]);
        console.log("New recipiente added successfully with ID:", docRef.id);
      }
      setIsRecipienteModalOpen(false);
      setIsImportRecipienteModalOpen(false);
      setRecipienteToEdit(null);
      fetchAllData();
    } catch (error) {
      console.error("Error saving recipiente: ", error);
    }
  };

  const handleDeleteLocal = async (id: string, collectionType: 'locaisProdutos' | 'locaisInsumos') => {
    if (window.confirm("Tem certeza que deseja deletar este local de estoque? Esta ação não pode ser desfeita.")) {
      try {
        await deleteDoc(doc(db, collectionType, id));
        setLocais(prev => prev.filter((local: (LocalProduto | LocalInsumo)) => local.id !== id));
        // Also delete associated recipients
        const associatedRecipients = recipientes.filter(r => r.localEstoqueId === id);
        for (const rec of associatedRecipients) {
          await deleteDoc(doc(db, 'recipientes', rec.id!));
        }
        setRecipientes(prev => prev.filter(r => r.localEstoqueId !== id));
      } catch (error) {
        console.error("Error deleting local de estoque: ", error);
      }
    }
  };

  const handleDeleteRecipiente = async (id: string) => {
    if (window.confirm("Tem certeza que deseja deletar este recipiente? Esta ação não pode ser desfeita.")) {
      try {
        await deleteDoc(doc(db, 'recipientes', id));
        setRecipientes(prev => prev.filter(recipiente => recipiente.id !== id));
      } catch (error) {
        console.error("Error deleting recipiente: ", error);
      }
    }
  };

  const openLocalModal = (local?: (LocalProduto | LocalInsumo) & { collectionType?: 'locaisProdutos' | 'locaisInsumos' }) => {
    setLocalToEdit(local || null);
    setIsLocalModalOpen(true);
  };

  const closeLocalModal = () => {
    setIsLocalModalOpen(false);
    setLocalToEdit(null);
  };

  const openRecipienteModal = (recipiente?: Recipiente) => {
    setRecipienteToEdit(recipiente || null);
    setIsRecipienteModalOpen(true);
  };

  const closeRecipienteModal = () => {
    setIsRecipienteModalOpen(false);
    setRecipienteToEdit(null);
  };

  const openImportRecipienteModal = () => {
    setIsImportRecipienteModalOpen(true);
  };

  const closeImportRecipienteModal = () => {
    setIsImportRecipienteModalOpen(false);
  };

  const handleEditStock = (recipiente: Recipiente) => {
    const firstProduct = produtos.find(p => p.posicoesEstoque?.some(pos => pos.recipienteId === recipiente.id));
    if (firstProduct) {
      setInitialTipoProduto(firstProduct.tipoProduto);
    } else {
      setInitialTipoProduto(undefined);
    }
    setRecipienteToEdit(recipiente);
    setIsEstoqueModalOpen(true);
  };

  const filteredLocais = locais.filter((local) =>
    local.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    local.tipo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loadingAuth) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
          <p className="text-lg text-gray-700">Carregando mapa de estoque...</p>
        </div>
      </Layout>
    );
  }

  if (!currentUser) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
          <p className="text-lg text-gray-700">Acesso negado. Por favor, faça login.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mapa de Estoque</h1>
            <p className="mt-1 text-sm text-gray-500">
              Gerencie seus locais de armazenamento e visualize a organização do estoque.
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => openLocalModal()}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Local
            </button>
            <button
              onClick={() => openRecipienteModal()}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Recipiente
            </button>
            {selectedLocal && (
              <button
                onClick={openImportRecipienteModal}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                Importar Recipiente
              </button>
            )}
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Buscar locais de estoque..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Locais de Estoque List */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Locais Cadastrados ({filteredLocais.length})
            </h3>
          </div>
          {filteredLocais.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Configuração
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredLocais.map((local) => {
                    const associatedRecipientes = recipientes.filter(r => r.localEstoqueId === local.id);
                    return (
                      <React.Fragment key={local.id}>
                        <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedLocal(local)}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {local.nome}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                            {local.tipo}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {local.tipo === 'gaveta' && local.dimensoesGrade
                              ? `${local.dimensoesGrade.x} x ${local.dimensoesGrade.y} x ${local.dimensoesGrade.z} (Grade)`
                              : local.divisoes
                              ? `${local.divisoes.h} x ${local.divisoes.v} (Divisões)`
                              : 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end">
                              <button
                                onClick={(e) => { e.stopPropagation(); openLocalModal({ ...local, collectionType: local.collectionType || 'locaisProdutos' }); }}
                                className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
                                title="Editar Local"
                              >
                                <Edit className="h-5 w-5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteLocal(local.id!, local.collectionType || 'locaisProdutos'); }}
                                className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
                                title="Deletar Local"
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {associatedRecipientes.length > 0 && (
                          <tr className="bg-gray-50">
                            <td colSpan={4} className="px-6 py-2 pl-12 text-sm text-gray-700">
                              <h4 className="font-medium mb-2">Recipientes neste local:</h4>
                              <ul className="list-disc list-inside">
                                {associatedRecipientes
                                  .filter(rec => rec.posicaoNaGrade) // Only display if position is defined
                                  .map(rec => (
                                    <li key={rec.id} className="flex justify-between items-center py-1">
                                      <span>
                                        {rec.nome} ({rec.tipo} - {rec.dimensoesOcupadas.x}x{rec.dimensoesOcupadas.y}x{rec.dimensoesOcupadas.z} na posição {rec.posicaoNaGrade?.x},{rec.posicaoNaGrade?.y},{rec.posicaoNaGrade?.z})
                                      </span>
                                      <div>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); openRecipienteModal(rec); }}
                                          className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
                                          title="Editar Recipiente"
                                        >
                                          <Edit className="h-4 w-4" />
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleDeleteRecipiente(rec.id!); }}
                                          className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
                                          title="Deletar Recipiente"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </li>
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
              <h3 className="text-sm font-medium text-gray-900 mb-1">Nenhum local de estoque encontrado</h3>
              <p className="text-sm text-gray-500">
                Comece adicionando um novo local de estoque.
              </p>
            </div>
          )}
        </div>

        {/* Visualization */}
        {selectedLocal && (
          <div className="bg-white shadow rounded-lg p-6 mt-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
              Visualização: {selectedLocal.nome}
            </h3>
            {selectedLocal.tipo === 'gaveta' && selectedLocal.dimensoesGrade && (
              <>
                {selectedLocal.dimensoesGrade.z > 1 && (
                  <div className="mb-4 flex items-center space-x-2">
                    <label htmlFor="z-level-select" className="text-sm font-medium text-gray-700">
                      Andar Z:
                    </label>
                    <select
                      id="z-level-select"
                      value={currentZLevel}
                      onChange={(e) => setCurrentZLevel(parseInt(e.target.value))}
                      className="block w-auto pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    >
                      {Array.from({ length: selectedLocal.dimensoesGrade.z }).map((_, z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <StorageGrid2D
                  local={selectedLocal}
                  recipientes={recipientes.filter(r => r.localEstoqueId === selectedLocal.id)}
                  produtos={produtos}
                  onRecipienteClick={openRecipienteModal}
                  onMoveRecipiente={handleMoveRecipiente}
                  onEditStockClick={handleEditStock}
                  currentZLevel={currentZLevel}
                />
              </>
            )}
            {(selectedLocal.tipo === 'prateleira' || selectedLocal.tipo === 'armario') && (
              <StorageDivisionView
                local={selectedLocal}
                recipientes={recipientes}
                produtos={produtos}
              />
            )}
          </div>
        )}

        {/* Modal for Stock Launch */}
        {isEstoqueModalOpen && (
          <EstoqueLancamentoModal
            isOpen={isEstoqueModalOpen}
            onClose={() => {
              setIsEstoqueModalOpen(false);
              setRecipienteToEdit(null); // Clear on close
            }}
            onLancamentoSuccess={() => {
              fetchAllData();
              setIsEstoqueModalOpen(false);
              setRecipienteToEdit(null);
            }}
            initialTipoProduto={initialTipoProduto}
            recipiente={recipienteToEdit}
            local={selectedLocal}
          />
        )}

        {/* Modal for LocalDeEstoque Form */}
        {isLocalModalOpen && (
          <LocalDeEstoqueFormModal
            isOpen={isLocalModalOpen}
            onClose={closeLocalModal}
            onSave={handleSaveLocal}
            initialData={localToEdit}
          />
        )}

        {/* Modal for Recipiente Form */}
        {isRecipienteModalOpen && selectedLocal && selectedLocal.dimensoesGrade && (
          <RecipienteFormModal
            isOpen={isRecipienteModalOpen}
            onClose={closeRecipienteModal}
            onSave={handleSaveRecipiente}
            initialData={recipienteToEdit}
            localEstoqueId={selectedLocal.id!}
            existingRecipients={recipientes.filter(r => r.localEstoqueId === selectedLocal.id)}
            localDimensions={selectedLocal.dimensoesGrade}
          />
        )}

        {/* Modal for Import Recipiente */}
        {isImportRecipienteModalOpen && selectedLocal && (
          <ImportRecipienteModal
            isOpen={isImportRecipienteModalOpen}
            onClose={closeImportRecipienteModal}
            onSave={handleSaveRecipiente} // Re-use save function for updating
            selectedLocal={selectedLocal}
            existingRecipientesInLocal={recipientes.filter(r => r.localEstoqueId === selectedLocal.id)}
          />
        )}
      </div>
    </Layout>
  );
}
