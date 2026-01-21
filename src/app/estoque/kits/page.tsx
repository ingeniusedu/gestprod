"use client";

import React, { useState, useEffect } from 'react';
import { Plus, Search, Gift, Edit, Trash2, Settings, List, Grid } from 'lucide-react';
import KitFormModal from '../../components/KitFormModal';
import ServiceCostModal from '../../components/ServiceCostModal';
import ModeloDetailsModal from '../../components/ModeloDetailsModal';
import { db, auth, getLocaisProdutos, getLocaisInsumos, getRecipientes } from '../../services/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Kit, Modelo, Peca, Insumo, PosicaoEstoque } from '../../types';
import { LocalProduto, LocalInsumo, Recipiente } from '../../types/mapaEstoque';

export default function KitsPage({ isOnlyButton = false, searchTerm: propSearchTerm = '' }) {
  const [searchTerm, setSearchTerm] = useState(propSearchTerm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isServiceCostModalOpen, setIsServiceCostModalOpen] = useState(false);
  const [isModeloDetailsModalOpen, setIsModeloDetailsModalOpen] = useState(false);
  const [kitToEdit, setKitToEdit] = useState<Kit | null>(null);
  const [selectedModeloForDetails, setSelectedModeloForDetails] = useState<Modelo | null>(null);
  const [kits, setKits] = useState<Kit[]>([]);
  const [selectedKits, setSelectedKits] = useState<string[]>([]); // New state for selected kits
  const [serviceCosts, setServiceCosts] = useState({
    costPerMinute3DPrint: 0,
    costPerMinuteAssembly: 0,
    costPerMinutePackaging: 0,
  });
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [modelos, setModelos] = useState<Modelo[]>([]); // Needed for calculating kit costs
  const [pecas, setPecas] = useState<Peca[]>([]); // Needed for calculating modelo costs within kits
  const [insumos, setInsumos] = useState<Insumo[]>([]); // Needed for calculating peca/modelo costs within kits
  const [locaisDeEstoque, setLocaisDeEstoque] = useState<(LocalProduto | LocalInsumo)[]>([]);
  const [recipientes, setRecipientes] = useState<Recipiente[]>([]);

  useEffect(() => {
    setSearchTerm(propSearchTerm);
  }, [propSearchTerm]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const fetchAllData = async () => {
          try {
            const kitsCollection = collection(db, 'kits');
            const modelosCollection = collection(db, 'modelos');
            const pecasCollection = collection(db, 'pecas');
            const insumosCollection = collection(db, 'insumos');
            const recipientesCollection = collection(db, 'recipientes');

            const [kitsSnapshot, modelosSnapshot, pecasSnapshot, insumosSnapshot, recipientesSnapshot, locaisProdutosSnapshot, locaisInsumosSnapshot] = await Promise.all([
              getDocs(kitsCollection),
              getDocs(modelosCollection),
              getDocs(pecasCollection),
              getDocs(insumosCollection),
              getDocs(recipientesCollection),
              getLocaisProdutos(), // Use the specific function
              getLocaisInsumos()   // Use the specific function
            ]);

            setKits(kitsSnapshot.docs.map(doc => {
              const data = doc.data() as any;
              const posicoes = data.posicoesEstoque || [];
              const estoqueTotal = posicoes.reduce((acc: number, pos: PosicaoEstoque) => acc + pos.quantidade, 0);
              const custoDetalhado = data.custoDetalhado || {};
              
              return { 
                id: doc.id, 
                ...data, 
                estoqueTotal,
                custoCalculado: data.custoCalculado || 0,
                custoCalculadoFilamento: custoDetalhado.filamento || 0,
                custoCalculadoImpressao: custoDetalhado.impressao3D || 0,
                custoCalculadoMontagem: custoDetalhado.montagem || 0,
                custoCalculadoInsumos: custoDetalhado.insumos || 0,
              } as Kit;
            }));
            const fetchedPecas = pecasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Peca[];
            const fetchedInsumos = insumosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Insumo[];

            const enrichedModelos = modelosSnapshot.docs.map(doc => {
              const modeloData = { id: doc.id, ...doc.data() } as Modelo;
              if (modeloData.pecas) {
                modeloData.pecas = modeloData.pecas.map(pecaRef => {
                  const fullPeca = fetchedPecas.find(p => p.id === pecaRef.pecaId);
                  return { ...pecaRef, peca: fullPeca };
                });
              }
              return modeloData;
            });

            setModelos(enrichedModelos);
            setPecas(fetchedPecas);
            setInsumos(fetchedInsumos);
            setRecipientes(recipientesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Recipiente[]);
            setLocaisDeEstoque([...locaisProdutosSnapshot, ...locaisInsumosSnapshot] as (LocalProduto | LocalInsumo)[]); // Combine both

            const serviceCostsRef = doc(db, 'settings', 'serviceCosts');
            const serviceCostsSnap = await getDoc(serviceCostsRef);
            if (serviceCostsSnap.exists()) {
              setServiceCosts(serviceCostsSnap.data() as { costPerMinute3DPrint: number; costPerMinuteAssembly: number; costPerMinutePackaging: number; });
            }
          } catch (error) {
            console.error("Error fetching data: ", error);
          }
        };
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

  const filteredKits = kits
    .filter(kit => {
      const kitLocal = getLocalString(kit.posicoesEstoque || []);
      return (
        kit.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        kit.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        kitLocal.toLowerCase().includes(searchTerm.toLowerCase())
      );
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const openModal = (kit: Kit | null = null) => {
    setKitToEdit(kit);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setKitToEdit(null);
    // Refresh data
    const fetchKits = async () => {
        const kitsCollection = collection(db, 'kits');
        const kitsSnapshot = await getDocs(kitsCollection);
        setKits(kitsSnapshot.docs.map(doc => {
          const data = doc.data();
          const posicoes = data.posicoesEstoque || [];
          const estoqueTotal = posicoes.reduce((acc: number, pos: PosicaoEstoque) => acc + pos.quantidade, 0);
          return { id: doc.id, ...data, estoqueTotal } as Kit;
        }));
    };
    fetchKits();
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
          setServiceCosts(docSnap.data() as { costPerMinute3DPrint: number; costPerMinuteAssembly: number; costPerMinutePackaging: number; });
        }
      } catch (error) {
        console.error("Error fetching service costs: ", error);
      }
    };
    fetchServiceCosts();
  };

  const openModeloDetailsModal = (modelo: Modelo) => {
    setSelectedModeloForDetails(modelo);
    setIsModeloDetailsModalOpen(true);
  };

  const closeModeloDetailsModal = () => {
    setIsModeloDetailsModalOpen(false);
    setSelectedModeloForDetails(null);
  };

  const calculateModeloCost = (modeloId: string, allModelos: Modelo[], allPecas: Peca[], allInsumos: Insumo[], currentServiceCosts: { costPerMinute3DPrint: number; costPerMinuteAssembly: number; costPerMinutePackaging: number; }) => {
    const foundModelo = allModelos.find(m => m.id === modeloId);
    if (!foundModelo) return 0;

    let totalFilamentQuantity = 0;
    let totalImpressionTime = 0;
    let totalAssemblyTime = foundModelo.tempoMontagem || 0;

    foundModelo.pecas?.forEach(modeloPeca => {
      const foundPeca = allPecas.find(p => p.id === modeloPeca.pecaId);
      if (foundPeca) {
        if (foundPeca.isComposta && foundPeca.gruposImpressao) {
          foundPeca.gruposImpressao.forEach(grupo => {
            totalImpressionTime += (grupo.tempoImpressao || 0) * modeloPeca.quantidade;
            if (grupo.filamentos && Array.isArray(grupo.filamentos)) {
              grupo.filamentos.forEach(filamento => {
                totalFilamentQuantity += (filamento.quantidade || 0) * modeloPeca.quantidade;
              });
            }
          });
        } else if (!foundPeca.isComposta && foundPeca.gruposImpressao && foundPeca.gruposImpressao.length > 0) { // Handle simple pieces with impression groups
          foundPeca.gruposImpressao.forEach(grupo => {
            totalImpressionTime += (grupo.tempoImpressao || 0) * modeloPeca.quantidade;
            if (grupo.filamentos && Array.isArray(grupo.filamentos)) {
              grupo.filamentos.forEach(filamento => {
                totalFilamentQuantity += (filamento.quantidade || 0) * modeloPeca.quantidade;
              });
            }
          });
        }
      }
    });

    const impressionCost = totalImpressionTime * currentServiceCosts.costPerMinute3DPrint;
    const assemblyCost = totalAssemblyTime * currentServiceCosts.costPerMinuteAssembly;

    return impressionCost + assemblyCost;
  };

  const handleEditKit = (kit: Kit) => {
    openModal(kit);
  };

  const handleDeleteProduto = async (id: string | string[], tipo: string) => {
    if (window.confirm(`Tem certeza que deseja deletar este ${tipo}? Esta ação não pode ser desfeita.`)) {
      try {
        if (Array.isArray(id)) {
          const batch = writeBatch(db);
          id.forEach(kitId => {
            const kitDocRef = doc(db, tipo + 's', kitId);
            batch.delete(kitDocRef);
          });
          await batch.commit();
        } else {
          await deleteDoc(doc(db, tipo + 's', id));
        }
        setKits(prev => prev.filter(p => (Array.isArray(id) ? !id.includes(p.id!) : p.id !== id)));
        setSelectedKits([]);
      } catch (error) {
        console.error(`Error deleting ${tipo}: `, error);
      }
    }
  };

  const handleSelectKit = (id: string) => {
    setSelectedKits(prev =>
      prev.includes(id) ? prev.filter(kitId => kitId !== id) : [...prev, id]
    );
  };

  const handleSelectAllKits = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedKits(filteredKits.map(k => k.id as string));
    } else {
      setSelectedKits([]);
    }
  };

  const renderKitCard = (kit: Kit) => {
    if (!kit.id) return null; // Ensure kit.id is defined
    return (
      <div key={kit.id} className={`bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow relative group ${selectedKits.includes(kit.id as string) ? 'ring-2 ring-blue-500' : ''}`}>
        <input
          type="checkbox"
          className="absolute top-2 left-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
          checked={selectedKits.includes(kit.id as string)}
          onChange={() => handleSelectKit(kit.id as string)}
        />
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{kit.nome}</h3>
            <p className="text-sm text-gray-500">SKU: {kit.sku}</p>
          </div>
          <Gift className="h-8 w-8 text-blue-500" />
        </div>
        
        <div className="space-y-2 mb-4">
          <div className="text-sm text-gray-600">
            <strong>Componentes inclusos:</strong>
          </div>
          {kit.modelos && kit.modelos.length > 0 ? (
            kit.modelos.map((comp, index) => (
              <div
                key={index}
                className="text-sm text-gray-500 ml-2 cursor-pointer hover:text-blue-600 hover:underline"
                onClick={() => {
                  const modelo = modelos.find(m => m.id === comp.modeloId);
                  if (modelo) {
                    openModeloDetailsModal(modelo);
                  } else {
                    console.warn(`Modelo with ID ${comp.modeloId} not found.`);
                  }
                }}
              >
                • {modelos.find(m => m.id === comp.modeloId)?.nome || 'Modelo Desconhecido'} (x{comp.quantidade})
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500 ml-2">Nenhum componente.</div>
          )}
          <div className="text-sm text-gray-600">
            <strong>Estoque Total:</strong> {kit.estoqueTotal || 0}
          </div>
          <div className="text-sm text-gray-600">
            <strong>Local(is):</strong> {getLocalString(kit.posicoesEstoque || [])}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Custo Total:</span>
            <div className="font-medium text-gray-900">R$ {kit.custoCalculado?.toFixed(2) || '0.00'}</div>
            <div className="text-xs text-gray-500">
              <div>• Filamento: R$ {(kit.custoCalculadoFilamento || 0).toFixed(2)}</div>
              <div>• Impressão: R$ {(kit.custoCalculadoImpressao || 0).toFixed(2)}</div>
              <div>• Montagem: R$ {(kit.custoCalculadoMontagem || 0).toFixed(2)}</div>
              <div>• Insumos: R$ {(kit.custoCalculadoInsumos || 0).toFixed(2)}</div>
            </div>
          </div>
          <div>
            <span className="text-gray-500">Preço Sugerido:</span>
            <div className="font-medium text-green-600">R$ {kit.precoSugerido?.toFixed(2) || '0.00'}</div>
          </div>
          <div>
            <span className="text-gray-500">Tempo Montagem:</span>
            <div className="font-medium text-gray-900">{kit.tempoMontagem || '0'}min</div>
          </div>
          <div>
            <span className="text-gray-500">Margem:</span>
            <div className="font-medium text-blue-600">
              {kit.custoCalculado > 0 ? (((kit.precoSugerido - kit.custoCalculado) / kit.custoCalculado) * 100).toFixed(1) : '0.0'}%
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={() => handleEditKit(kit)}
            className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
            title="Editar Kit"
          >
            <Edit className="h-5 w-5" />
          </button>
          <button
            onClick={() => handleDeleteProduto(kit.id as string, 'kit')}
            className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
            title="Deletar Kit"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  };

  const renderKitListRow = (kit: Kit) => {
    if (!kit.id) return null; // Ensure kit.id is defined
    return (
      <tr key={kit.id} className={`hover:bg-gray-50 ${selectedKits.includes(kit.id as string) ? 'bg-blue-50' : ''}`}>
        <td className="px-6 py-4 whitespace-nowrap">
          <input
            type="checkbox"
            checked={selectedKits.includes(kit.id as string)}
            onChange={() => handleSelectKit(kit.id as string)}
          />
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{kit.sku}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{kit.nome}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {kit.modelos && kit.modelos.length > 0 ? (
            kit.modelos.map((comp, index) => (
              <span key={index} className="block">
                • {modelos.find(m => m.id === comp.modeloId)?.nome || 'Modelo Desconhecido'} (x{comp.quantidade})
              </span>
            ))
          ) : (
            <span>Nenhum</span>
          )}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{kit.tempoMontagem || '0'} min</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          <div>R$ {kit.custoCalculado?.toFixed(2) || '0.00'}</div>
          <div className="text-xs text-gray-400">
            <div>F: R$ {(kit.custoCalculadoFilamento || 0).toFixed(2)}</div>
            <div>I: R$ {(kit.custoCalculadoImpressao || 0).toFixed(2)}</div>
            <div>M: R$ {(kit.custoCalculadoMontagem || 0).toFixed(2)}</div>
            <div>O: R$ {(kit.custoCalculadoInsumos || 0).toFixed(2)}</div>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">R$ {kit.precoSugerido?.toFixed(2) || '0.00'}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {kit.custoCalculado > 0 ? (((kit.precoSugerido - kit.custoCalculado) / kit.custoCalculado) * 100).toFixed(1) : '0.0'}%
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{kit.estoqueTotal || 0}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getLocalString(kit.posicoesEstoque || [])}</td>
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex items-center justify-end">
            <button
              onClick={() => handleEditKit(kit)}
              className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
              title="Editar Kit"
            >
              <Edit className="h-5 w-5" />
            </button>
            <button
              onClick={() => handleDeleteProduto(kit.id as string, 'kit')}
              className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
              title="Deletar Kit"
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
          Novo Kit
        </button>
        <KitFormModal
          isOpen={isModalOpen}
          onClose={closeModal}
          kit={kitToEdit}
          modelos={modelos} // Pass models
          pecas={pecas}     // Pass pecas
          insumos={insumos} // Pass insumos
          serviceCosts={serviceCosts} // Pass serviceCosts
        />
        <ServiceCostModal
          isOpen={isServiceCostModalOpen}
          onClose={closeServiceCostModal}
        />
        <ModeloDetailsModal
          isOpen={isModeloDetailsModalOpen}
          onClose={closeModeloDetailsModal}
          modelo={selectedModeloForDetails}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">
          Estoque de Kits ({filteredKits.length})
        </h3>
        <div className="flex items-center space-x-4">
          {selectedKits.length > 0 && (
            <button
              onClick={() => handleDeleteProduto(selectedKits, 'kit')} // Assuming bulk delete for kits is handled similarly
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Deletar Selecionados ({selectedKits.length})
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
      {filteredKits.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 px-6 py-4">
            {filteredKits.map(renderKitCard)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      onChange={handleSelectAllKits}
                      checked={selectedKits.length === filteredKits.length && filteredKits.length > 0}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Componentes</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mont. (min)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Custo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preço Sugerido</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Margem</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estoque</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Local</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredKits.map(renderKitListRow)}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="bg-white shadow rounded-lg p-12">
          <div className="text-center">
            <Gift className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum kit encontrado</h3>
            <p className="mt-1 text-sm text-gray-500">
              Tente ajustar o termo de busca ou criar um novo kit.
            </p>
          </div>
        </div>
      )}

      <KitFormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        kit={kitToEdit}
        modelos={modelos} // Pass models
        pecas={pecas}     // Pass pecas
        insumos={insumos} // Pass insumos
        serviceCosts={serviceCosts} // Pass serviceCosts
      />
      <ServiceCostModal
        isOpen={isServiceCostModalOpen}
        onClose={closeServiceCostModal}
      />
      <ModeloDetailsModal
        isOpen={isModeloDetailsModalOpen}
        onClose={closeModeloDetailsModal}
        modelo={selectedModeloForDetails}
      />
    </div>
  );
}
