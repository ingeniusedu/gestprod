"use client";

import React, { useState, useEffect } from 'react';
import { Plus, Search, AlertTriangle, TrendingUp, TrendingDown, Upload, ChevronDown, ChevronUp, Edit, Trash2, Spool, PackageX, Weight, Package, Layers, Gift, Box, Puzzle } from 'lucide-react';
import InsumoFormModal from '../components/InsumoFormModal';
import FilamentBalanceModal from '../components/FilamentBalanceModal';
import EstoqueLancamentoModal from '../components/EstoqueLancamentoModal'; // Import the new modal
import { db, auth } from '../services/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy, limit, where } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import Layout from '../components/Layout';
import PartesPage from './partes/page';
import KitsPage from './kits/page';
import ModelosPage from './modelos/page';
import PecasPage from './pecas/page';
export default function Estoque() {
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState('todos'); // Only applies to Insumos tab
  const [isModalOpen, setIsModalOpen] = useState(false); // For InsumoFormModal
  const [insumos, setInsumos] = useState([]);
  const [pecas, setPecas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [kits, setKits] = useState([]);
  const [partes, setPartes] = useState([]);
  const [insumosExpandedRows, setInsumosExpandedRows] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [insumoToEdit, setInsumoToEdit] = useState(null);
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [isLancamentoModalOpen, setIsLancamentoModalOpen] = useState(false); // New state for stock launch modal
  const [filamentsForBalance, setFilamentsForBalance] = useState([]);
  const [currentBalanceIndex, setCurrentBalanceIndex] = useState(0);
  const [showBalanceConfirmation, setShowBalanceConfirmation] = useState(false);
  const [highestSpoolNumber, setHighestSpoolNumber] = useState(0);
  const [activeTab, setActiveTab] = useState('insumos'); // Current active tab: insumos, kits, modelos, pecas, partes
  const [activeSummaryTab, setActiveSummaryTab] = useState('geral'); // Current active tab for stock summary: geral, filamento, embalagem, material

  useEffect(() => {
    return () => {};
  }, []);

  // Helper to get color for the spool icon
  const getColorStyle = (colorName) => {
    const colorMap = {
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

  const fetchAllData = async () => {
    setLoadingAuth(true);
    try {
      const [
        insumosSnapshot,
        pecasSnapshot,
        modelosSnapshot,
        kitsSnapshot,
        partesSnapshot
      ] = await Promise.all([
        getDocs(collection(db, 'insumos')),
        getDocs(collection(db, 'pecas')),
        getDocs(collection(db, 'modelos')),
        getDocs(collection(db, 'kits')),
        getDocs(collection(db, 'partes')),
      ]);

      const insumosList = insumosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInsumos(insumosList);
      setPecas(pecasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setModelos(modelosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setKits(kitsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setPartes(partesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      const filamentSpools = insumosList.filter(insumo => insumo.tipo === 'filamento' && insumo.especificacoes?.spoolNumero);
      const maxSpoolNum = filamentSpools.reduce((max, spool) => {
        const num = parseInt(spool.especificacoes.spoolNumero, 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      setHighestSpoolNumber(maxSpoolNum);

    } catch (error) {
      console.error("Error fetching all data: ", error);
    } finally {
      setLoadingAuth(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        fetchAllData();
      } else {
        // Clear all data if user logs out
        setInsumos([]);
        setPecas([]);
        setModelos([]);
        setKits([]);
        setPartes([]);
        setHighestSpoolNumber(0);
        setLoadingAuth(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const toggleRow = (id, type) => {
    if (type === 'insumo') {
      setInsumosExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    }
  };

  const handleEditInsumo = (insumo) => {
    setInsumoToEdit(insumo);
    setIsModalOpen(true);
  };

  const handleSaveInsumo = async (newInsumo) => {
    try {
      let insumoToSave = { ...newInsumo };

      if (insumoToSave.tipo === 'filamento') {
        if (insumoToSave.especificacoes.aberto) {
          const pesoBruto = parseFloat(insumoToSave.especificacoes.pesoBruto || 0);
          const pesoLiquido = pesoBruto - 130;
          insumoToSave.estoqueAtual = pesoLiquido;
          insumoToSave.especificacoes.pesoBruto = pesoBruto;
          insumoToSave.especificacoes.pesoLiquido = pesoLiquido;
        } else {
          const pesoLiquido = parseFloat(insumoToSave.especificacoes.tamanhoSpool || 0);
          insumoToSave.estoqueAtual = pesoLiquido;
          insumoToSave.especificacoes.pesoBruto = 0;
          insumoToSave.especificacoes.pesoLiquido = pesoLiquido;
        }
      }

      if (newInsumo.id) {
        const insumoRef = doc(db, 'insumos', newInsumo.id);
        await updateDoc(insumoRef, { ...insumoToSave, updatedAt: new Date() });
        setInsumos(prevInsumos => prevInsumos.map(ins => ins.id === newInsumo.id ? { ...ins, ...insumoToSave } : ins));
      } else {
        if (insumoToSave.tipo === 'filamento') {
          const spoolsToCreate = insumoToSave.especificacoes.numeroSpools;
          const createdSpools = [];

          for (let i = 0; i < spoolsToCreate; i++) {
            let assignedSpoolNumber = insumoToSave.especificacoes.spoolNumero;
            if (insumoToSave.especificacoes.autoNumberSpool) {
              assignedSpoolNumber = `${highestSpoolNumber + i + 1}`;
            }

            const spoolData = {
              ...insumoToSave,
              especificacoes: {
                ...insumoToSave.especificacoes,
                numeroSpools: 1,
                spoolNumero: assignedSpoolNumber,
              },
              createdAt: new Date(),
            };
            const docRef = await addDoc(collection(db, 'insumos'), spoolData);
            createdSpools.push({ id: docRef.id, ...spoolData });
          }
          setInsumos(prevInsumos => [...prevInsumos, ...createdSpools]);
        } else {
          const docRef = await addDoc(collection(db, 'insumos'), { ...insumoToSave, createdAt: new Date() });
          setInsumos(prevInsumos => [...prevInsumos, { id: docRef.id, ...insumoToSave }]);
        }
      }
      setIsModalOpen(false);
      setInsumoToEdit(null);
    } catch (error) {
      console.error("Error saving insumo: ", error);
    }
  };

  const openModal = async () => {
    setInsumoToEdit(null);
    if (!insumoToEdit) { // Only fetch highest spool number for new insumos
      try {
        const q = query(
          collection(db, 'insumos'),
          where('tipo', '==', 'filamento')
        );
        const querySnapshot = await getDocs(q);
        let maxSpoolNum = 0;
        querySnapshot.docs.forEach(doc => {
          const spoolData = doc.data();
          const num = parseInt(spoolData.especificacoes.spoolNumero, 10);
          if (!isNaN(num)) {
            maxSpoolNum = Math.max(maxSpoolNum, num);
          }
        });
        setHighestSpoolNumber(maxSpoolNum);
      } catch (error) {
        console.error("Error fetching highest spool number: ", error);
        setHighestSpoolNumber(0); // Fallback
      }
    }
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
    setInsumoToEdit(null);
    fetchAllData(); // Always refresh on close
  };

  const startFilamentBalance = () => {
    const filaments = insumos.filter(insumo => insumo.tipo === 'filamento');
    setFilamentsForBalance(filaments);
    setCurrentBalanceIndex(0);
    setIsBalanceModalOpen(true);
    setShowBalanceConfirmation(false);
  };

  const handleBalanceUpdate = async (spoolId, newGrossWeight) => {
    try {
      const spoolRef = doc(db, 'insumos', spoolId);
      const currentSpool = filamentsForBalance.find(s => s.id === spoolId);

      if (currentSpool) {
        const oldNetWeight = parseFloat(currentSpool.estoqueAtual || 0);
        const newNetWeight = newGrossWeight - 130;
        const weightDifference = newNetWeight - oldNetWeight;

        await updateDoc(spoolRef, {
          estoqueAtual: newNetWeight,
          'especificacoes.pesoBruto': newGrossWeight,
          'especificacoes.pesoLiquido': newNetWeight,
          historicoEstoque: [
            ...(currentSpool.historicoEstoque || []),
            {
              data: new Date(),
              quantidade: newNetWeight,
              diferenca: weightDifference,
              motivo: 'Balanço de Filamento',
            },
          ],
          updatedAt: new Date(),
          'especificacoes.dataUltimaPesagem': new Date().toISOString().split('T')[0],
        });

        setInsumos(prevInsumos => prevInsumos.map(ins =>
          ins.id === spoolId ? {
            ...ins,
            estoqueAtual: newNetWeight,
            especificacoes: {
              ...ins.especificacoes,
              pesoBruto: newGrossWeight,
              pesoLiquido: newNetWeight,
              pesoAtual: undefined
            },
            historicoEstoque: [
              ...(ins.historicoEstoque || []),
              {
                data: new Date(),
                quantidade: newNetWeight,
                diferenca: weightDifference,
                motivo: 'Balanço de Filamento',
              },
            ],
            especificacoes: {
              ...ins.especificacoes,
              dataUltimaPesagem: new Date().toISOString().split('T')[0],
            }
          } : ins
        ));
      }
    } catch (error) {
      console.error("Error updating spool during balance: ", error);
    }
  };

  const handleNextSpool = () => {
    if (currentBalanceIndex < filamentsForBalance.length - 1) {
      setCurrentBalanceIndex(prevIndex => prevIndex + 1);
    } else {
      setIsBalanceModalOpen(false);
      setShowBalanceConfirmation(true);
      setTimeout(() => setShowBalanceConfirmation(false), 5000);
    }
  };

  const handleSkipSpool = () => {
    handleNextSpool();
  };

  const handleDeleteInsumo = async (id) => {
    if (window.confirm("Tem certeza que deseja deletar este insumo? Esta ação não pode ser desfeita.")) {
      try {
        await deleteDoc(doc(db, 'insumos', id));
        setInsumos(prevInsumos => prevInsumos.filter(insumo => insumo.id !== id));
      } catch (error) {
        console.error("Error deleting insumo: ", error);
      }
    }
  };

  const getStatusColor = (insumo) => {
    if (insumo.tipo === 'filamento') return 'text-gray-600 bg-gray-50';
    if (insumo.tipo === 'embalagem') {
      const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100;
      if (percentual <= 50) return 'text-red-600 bg-red-50';
      if (percentual <= 80) return 'text-yellow-600 bg-yellow-50';
      return 'text-green-600 bg-green-50';
    }
    const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100;
    if (percentual <= 50) return 'text-red-600 bg-red-50';
    if (percentual <= 80) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getStatusIcon = (insumo) => {
    if (insumo.tipo === 'filamento') return TrendingUp;
    if (insumo.tipo === 'embalagem') {
      const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100;
      if (percentual <= 50) return AlertTriangle;
      if (percentual <= 80) return TrendingDown;
      return TrendingUp;
    }
    const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100;
    if (percentual <= 50) return AlertTriangle;
    if (percentual <= 80) return TrendingDown;
    return TrendingUp;
  };

  const getStatusText = (insumo) => {
    if (insumo.tipo === 'tempo') return 'Ilimitado';
    if (insumo.tipo === 'filamento') return 'Por Spool';
    if (insumo.tipo === 'embalagem') {
      const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100;
      if (percentual <= 50) return 'Crítico';
      if (percentual <= 80) return 'Baixo';
      return 'Adequado';
    }
    const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100;
    if (percentual <= 50) return 'Crítico';
    if (percentual <= 80) return 'Baixo';
    return 'Adequado';
  };

  const groupFilaments = (filaments) => {
    const grouped = {};
    filaments.forEach(spool => {
      const key = spool.grupoFilamento;
      if (!grouped[key]) {
        grouped[key] = {
          id: `grouped-filament-${key}`,
          key,
          grupoFilamento: spool.grupoFilamento,
          totalSpools: 0,
          totalWeight: 0,
          totalCost: 0,
          spools: [],
          hasClosedSpool: false,
          cor: spool.cor,
          fabricante: spool.especificacoes.fabricante, // Add fabricante to group
          material: spool.especificacoes.material,     // Add material to group
        };
      } else {
        if (!grouped[key].cor && spool.cor && typeof spool.cor === 'string' && spool.cor.trim() !== '') {
            grouped[key].cor = spool.cor;
        }
        // Ensure fabricante and material are consistent across spools in the same group
        if (!grouped[key].fabricante && spool.especificacoes.fabricante) {
            grouped[key].fabricante = spool.especificacoes.fabricante;
        }
        if (!grouped[key].material && spool.especificacoes.material) {
            grouped[key].material = spool.especificacoes.material;
        }
      }
      grouped[key].totalSpools += 1;
      grouped[key].totalWeight += parseFloat(spool.estoqueAtual || 0);
      grouped[key].totalCost += parseFloat(spool.custoPorUnidade || 0) * parseFloat(spool.estoqueAtual || 0);
      grouped[key].spools.push(spool);
      if (!spool.especificacoes.aberto) {
        grouped[key].hasClosedSpool = true;
      }
    });
    const sortedGroupedFilaments = Object.values(grouped).sort((a, b) => {
      const colorA = a.cor || '';
      const colorB = b.cor || '';
      return colorA.localeCompare(colorB);
    });

    sortedGroupedFilaments.forEach(group => {
      group.spools.sort((a, b) => {
        const spoolNumA = parseInt(a.especificacoes.spoolNumero, 10);
        const spoolNumB = parseInt(b.especificacoes.spoolNumero, 10);
        return spoolNumA - spoolNumB;
      });
    });

    return sortedGroupedFilaments;
  };

  const filteredInsumos = insumos.filter(item => {
    const nameMatch = item.nome?.toLowerCase().includes(searchTerm.toLowerCase());
    const skuMatch = item.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const typeMatch = item.tipo?.toLowerCase().includes(searchTerm.toLowerCase());

    const insumoSpecificMatch = item.tipo === 'filamento' &&
      (item.especificacoes?.fabricante?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       item.especificacoes?.tipoFilamento?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       item.especificacoes?.material?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       item.cor?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.tipo === 'embalagem' &&
       (item.especificacoes?.tipoEmbalagem?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.especificacoes?.materialEmbalagem?.toLowerCase().includes(searchTerm.toLowerCase())));

    return nameMatch || skuMatch || typeMatch || insumoSpecificMatch;
  });

  const displayInsumos = (() => {
    let rows = [];

    if (activeTab === 'insumos') {
      if (tipoFilter === 'filamento' || tipoFilter === 'todos') {
        const filamentInsumos = filteredInsumos.filter(i => i.tipo === 'filamento');
        const groupedFilaments = groupFilaments(filamentInsumos);
        groupedFilaments.forEach(group => {
          rows.push({ type: 'group-summary', data: group, key: group.id });
          if (insumosExpandedRows[group.key]) {
            group.spools.forEach(spool => {
              rows.push({ type: 'spool-detail', data: spool, key: `spool-${spool.id}` });
            });
          }
        });
      }

      if (tipoFilter === 'embalagem' || tipoFilter === 'todos') {
        filteredInsumos.filter(i => i.tipo === 'embalagem').forEach(insumo => {
          rows.push({ type: 'regular-insumo', data: insumo, key: `insumo-${insumo.id}` });
        });
      }

      if (tipoFilter === 'material' || tipoFilter === 'tempo' || tipoFilter === 'todos') {
        filteredInsumos.filter(i => (tipoFilter === 'todos' || i.tipo === tipoFilter) && i.tipo !== 'filamento' && i.tipo !== 'embalagem').forEach(insumo => {
          rows.push({ type: 'regular-insumo', data: insumo, key: `insumo-${insumo.id}` });
        });
      }
    }
    return rows;
  })();

  const insumosComAlerta = insumos.filter(insumo =>
    (insumo.tipo !== 'tempo' && insumo.tipo !== 'filamento') && (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) <= 0.8
  );

  if (loadingAuth) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
          <p className="text-lg text-gray-700">Carregando dados de estoque...</p>
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
            <h1 className="text-2xl font-bold text-gray-900">Controle de Estoque</h1>
            <p className="mt-1 text-sm text-gray-500">
              Gerencie insumos, kits, modelos, peças e partes
            </p>
          </div>
          <div className="flex space-x-3">
            <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              <Upload className="h-4 w-4 mr-2" />
              Importar XML
            </button>
            {activeTab === 'insumos' && (
              <button
                onClick={() => startFilamentBalance()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                Balanço Filamento
              </button>
            )}
            <button
              onClick={() => setIsLancamentoModalOpen(true)} // Button to open the new modal
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Upload className="h-4 w-4 mr-2" /> {/* Reusing Upload icon for stock launch */}
              Lançar Estoque
            </button>
            {activeTab === 'insumos' && (
              <button
                onClick={openModal}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Insumo
              </button>
            )}
            {activeTab === 'kits' && (
              <KitsPage isOnlyButton={true} searchTerm={searchTerm} onDataUpdate={fetchAllData} />
            )}
            {activeTab === 'modelos' && (
              <ModelosPage isOnlyButton={true} searchTerm={searchTerm} onDataUpdate={fetchAllData} />
            )}
            {activeTab === 'pecas' && (
              <PecasPage isOnlyButton={true} searchTerm={searchTerm} onDataUpdate={fetchAllData} />
            )}
            {activeTab === 'partes' && (
              <PartesPage isOnlyButton={true} searchTerm={searchTerm} onDataUpdate={fetchAllData} />
            )}
          </div>
        </div>

        {/* Alertas de Estoque */}
        {activeTab === 'insumos' && insumosComAlerta.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center mb-3">
              <AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
              <h3 className="text-sm font-medium text-red-800">
                Alertas de Estoque ({insumosComAlerta.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {insumosComAlerta.map((insumo) => (
                <div key={insumo.id} className="text-sm text-red-700">
                  <span className="font-medium">{insumo.nome}</span>
                  <span className="ml-2">
                    ({parseFloat(insumo.estoqueAtual || 0)} / {parseFloat(insumo.estoqueMinimo || 0)} {insumo.unidade})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Busca */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder={
                  activeTab === 'insumos' ? "Buscar insumos..." :
                  activeTab === 'kits' ? "Buscar kits..." :
                  activeTab === 'modelos' ? "Buscar modelos..." :
                  activeTab === 'pecas' ? "Buscar peças..." :
                  activeTab === 'partes' ? "Buscar partes..." :
                  "Buscar..."
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Filtro de Tipo (apenas para Insumos) */}
            {activeTab === 'insumos' && (
              <div className="relative">
                <select
                  className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
                  value={tipoFilter}
                  onChange={(e) => setTipoFilter(e.target.value)}
                >
                  <option value="todos">Todos os Tipos</option>
                  <option value="filamento">Filamentos</option>
                  <option value="embalagem">Embalagens</option>
                  <option value="material">Materiais</option>
                  <option value="tempo">Tempo</option>
                </select>
              </div>
            )}

            {/* Estatísticas rápidas */}
            <div className="flex items-center justify-end space-x-4 text-sm">
              <div className="text-center">
                <div className="font-medium text-gray-900">
                  {activeTab === 'insumos' ? filteredInsumos.length : 'N/A'}
                </div>
                <div className="text-gray-500">Total</div>
              </div>
              {activeTab === 'insumos' && (
                <div className="text-center">
                  <div className="font-medium text-red-600">{insumosComAlerta.length}</div>
                  <div className="text-gray-500">Alertas</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs para Insumos, Kits, Modelos, Peças e Partes */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('insumos')}
                className={`${activeTab === 'insumos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <Layers className="h-5 w-5 mr-2" />
                Insumos ({filteredInsumos.length})
              </button>
              <button
                onClick={() => setActiveTab('kits')}
                className={`${activeTab === 'kits' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <Gift className="h-5 w-5 mr-2" />
                Kits
              </button>
              <button
                onClick={() => setActiveTab('modelos')}
                className={`${activeTab === 'modelos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <Box className="h-5 w-5 mr-2" />
                Modelos
              </button>
              <button
                onClick={() => setActiveTab('pecas')}
                className={`${activeTab === 'pecas' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <Puzzle className="h-5 w-5 mr-2" />
                Peças
              </button>
              <button
                onClick={() => setActiveTab('partes')}
                className={`${activeTab === 'partes' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <Layers className="h-5 w-5 mr-2" /> {/* Reusing Layers for Partes */}
                Partes
              </button>
            </nav>
          </div>

          {/* Conteúdo da Aba */}
          {activeTab === 'insumos' && (
            <>
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Estoque de Insumos ({displayInsumos.length})
                </h3>
              </div>
              {displayInsumos.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Nome / SKU
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tipo
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {tipoFilter === 'filamento' ? 'Spools' : 'Quantidade'}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Local
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Custo
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {displayInsumos.map((row) => {
                        if (row.type === 'group-summary') {
                          const item = row.data;
                          const isExpanded = insumosExpandedRows[item.key];
                          return (
                            <tr
                              key={row.key}
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => toggleRow(item.key, 'insumo')}
                            >
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  {isExpanded ? <ChevronUp className="h-4 w-4 mr-2 text-gray-500" /> : <ChevronDown className="h-4 w-4 mr-2 text-gray-500" />}
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {item.fabricante} {item.material}
                                    </div>
                                    {item.cor && (
                                      <div className="text-sm text-gray-500">
                                        Cor: {item.cor}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                                  Filamento
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {`${parseFloat(item.totalWeight || 0).toFixed(0)}g (${item.totalSpools})`}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-gray-600 bg-gray-50`}>
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                  Por Spool
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                R$ {(parseFloat(item.totalCost || 0) / parseFloat(item.totalWeight || 1)).toFixed(2)}/g
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                {/* No actions for grouped filaments directly */}
                              </td>
                            </tr>
                          );
                        } else if (row.type === 'spool-detail') {
                          const spool = row.data;
                          return (
                            <tr key={row.key} className="bg-gray-50 hover:bg-gray-100">
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700 pl-12">
                                {spool.especificacoes.spoolNumero && `${spool.especificacoes.spoolNumero} - `}{spool.nome}
                              </td>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
                                Spool
                              </td>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
                                {`${parseFloat(spool.especificacoes.pesoLiquido || spool.estoqueAtual || 0).toFixed(0)} g`}
                              </td>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
                                {spool.especificacoes.aberto ? 'Aberto' : 'Fechado'}
                              </td>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
                                R$ {parseFloat(spool.custoPorUnidade || 0).toFixed(2)}/g
                              </td>
                              <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex items-center justify-end">
                                  <button
                                    onClick={() => handleEditInsumo(spool)}
                                    className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
                                    title="Editar Spool"
                                  >
                                    <Edit className="h-5 w-5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteInsumo(spool.id)}
                                    className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
                                    title="Deletar Spool"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        } else if (row.type === 'regular-insumo') {
                          const item = row.data;
                          const StatusIcon = getStatusIcon(item);
                          const valorTotal = parseFloat(item.estoqueAtual || 0) * parseFloat(item.custoPorUnidade || 0);
                          return (
                            <tr key={row.key} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {item.nome}
                                  </div>
                                  {item.tipo === 'embalagem' && item.especificacoes?.altura && item.especificacoes?.largura && (
                                    <div className="text-sm text-gray-500">
                                      Dimensões: {item.especificacoes.altura}x{item.especificacoes.largura}
                                      {item.especificacoes.profundidade > 0 && `x${item.especificacoes.profundidade}`} cm
                                    </div>
                                  )}
                                  {item.cor && (
                                    <div className="text-sm text-gray-500">
                                      Cor: {item.cor}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                                  {item.tipo}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {item.tipo === 'tempo' ? '∞' : `${parseFloat(item.estoqueAtual || 0)} ${item.unidade}`}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(item)}`}>
                                  <StatusIcon className="h-3 w-3 mr-1" />
                                  {getStatusText(item)}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                R$ {parseFloat(item.custoPorUnidade || 0).toFixed(2)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex items-center justify-end">
                                  <button
                                    onClick={() => handleEditInsumo(item)}
                                    className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
                                    title="Editar Insumo"
                                  >
                                    <Edit className="h-5 w-5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteInsumo(item.id)}
                                    className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
                                    title="Deletar Insumo"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        return null;
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-gray-400 mb-4">
                    <Search className="mx-auto h-12 w-12" />
                  </div>
                  <h3 className="text-sm font-medium text-gray-900 mb-1">Nenhum item encontrado</h3>
                  <p className="text-sm text-gray-500">
                    Tente ajustar os filtros ou adicionar um novo item.
                  </p>
                </div>
              )}
            </>
          )}

          {activeTab === 'kits' && (
            <KitsPage searchTerm={searchTerm} kits={kits} onDataUpdate={fetchAllData} />
          )}

          {activeTab === 'modelos' && (
            <ModelosPage searchTerm={searchTerm} modelos={modelos} pecas={pecas} insumos={insumos} onDataUpdate={fetchAllData} />
          )}

          {activeTab === 'pecas' && (
            <PecasPage searchTerm={searchTerm} pecas={pecas} insumos={insumos} partes={partes} onDataUpdate={fetchAllData} />
          )}

          {activeTab === 'partes' && (
            <PartesPage searchTerm={searchTerm} partes={partes} onDataUpdate={fetchAllData} />
          )}
        </div>
        {/* Resumo do Estoque com Abas */}
        <div className="bg-white shadow rounded-lg">
          <div className="border-b border-gray-200">
            <div className="px-6 pt-4">
              <h3 className="text-lg font-medium text-gray-900">Resumo do Estoque</h3>
            </div>
            <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
              <button
                onClick={() => setActiveSummaryTab('geral')}
                className={`${activeSummaryTab === 'geral' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Geral
              </button>
              <button
                onClick={() => setActiveSummaryTab('filamento')}
                className={`${activeSummaryTab === 'filamento' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Filamento
              </button>
              <button
                onClick={() => setActiveSummaryTab('embalagem')}
                className={`${activeSummaryTab === 'embalagem' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Embalagens
              </button>
              <button
                onClick={() => setActiveSummaryTab('material')}
                className={`${activeSummaryTab === 'material' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Outros Insumos
              </button>
            </nav>
          </div>
          <div className="p-6">
            {activeSummaryTab === 'geral' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {insumos.filter(i => i.tipo === 'filamento').length}
                  </div>
                  <div className="text-sm text-gray-500">Filamentos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {insumos.filter(i => i.tipo === 'material').length}
                  </div>
                  <div className="text-sm text-gray-500">Materiais</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {insumos.filter(i => i.tipo === 'embalagem').length}
                  </div>
                  <div className="text-sm text-gray-500">Embalagens</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {insumosComAlerta.length}
                  </div>
                  <div className="text-sm text-gray-500">Com Alerta</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    R$ {insumos
                      .filter(i => i.tipo !== 'tempo')
                      .reduce((total, insumo) => total + (parseFloat(insumo.estoqueAtual || 0) * parseFloat(insumo.custoPorUnidade || 0)), 0)
                      .toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-500">Valor Total</div>
                </div>
              </div>
            )}
            {activeSummaryTab === 'filamento' && (
              <div>
                <h4 className="text-md font-medium text-gray-800 mb-3">Resumo de Filamentos por Modelo</h4>
                {groupFilaments(insumos.filter(i => i.tipo === 'filamento')).length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {groupFilaments(insumos.filter(i => i.tipo === 'filamento')).map(filamentGroup => (
                      <div key={filamentGroup.id} className="border border-gray-200 rounded-lg p-4 flex items-center space-x-3">
                        <Spool className="h-8 w-8 flex-shrink-0" style={{ color: getColorStyle(filamentGroup.cor) }} />
                        <div>
                          <div className="font-medium text-gray-900 flex items-center">
                            {filamentGroup.grupoFilamento}
                            {filamentGroup.totalWeight < 500 && (
                              <Weight key="weight-icon" className="h-4 w-4 text-red-500 ml-1 inline-block" title="Peso líquido abaixo de 500g" />
                            )}
                            {!filamentGroup.hasClosedSpool && (
                              <PackageX key="package-x-icon" className="h-4 w-4 text-red-500 ml-1 inline-block" title="Sem spool fechado para reserva" />
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            Cor: {filamentGroup.cor}
                          </div>
                          <div className="text-sm text-gray-600">
                            {filamentGroup.totalSpools} spools ({parseFloat(filamentGroup.totalWeight).toFixed(0)}g)
                          </div>
                          <div className="text-sm text-gray-600">
                            Custo Total: R$ {parseFloat(filamentGroup.totalCost).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Nenhum filamento cadastrado.</p>
                )}
              </div>
            )}
            {activeSummaryTab === 'embalagem' && (
              <div>
                <h4 className="text-md font-medium text-gray-800 mb-3">Resumo de Embalagens</h4>
                {insumos.filter(i => i.tipo === 'embalagem').length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {insumos.filter(i => i.tipo === 'embalagem').map(embalagem => (
                      <div key={embalagem.id} className="border border-gray-200 rounded-lg p-4 flex items-center space-x-3">
                        <Package className="h-8 w-8 flex-shrink-0 text-orange-500" />
                        <div>
                          <div className="font-medium text-gray-900">{embalagem.nome}</div>
                          <div className="text-sm text-gray-600">Tipo: {embalagem.especificacoes.tipoEmbalagem}</div>
                          <div className="text-sm text-gray-600">Material: {embalagem.especificacoes.materialEmbalagem}</div>
                          <div className="text-sm text-gray-600">Dimensões: {embalagem.especificacoes.altura}x{embalagem.especificacoes.largura}{embalagem.especificacoes.profundidade > 0 ? `x${embalagem.especificacoes.profundidade}` : ''} cm</div>
                          <div className="text-sm text-gray-600">Estoque: {parseFloat(embalagem.estoqueAtual || 0)} {embalagem.unidade}</div>
                          <div className="text-sm text-gray-600">Custo Unitário: R$ {parseFloat(embalagem.custoPorUnidade || 0).toFixed(2)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Nenhuma embalagem cadastrada.</p>
                )}
              </div>
            )}
            {activeSummaryTab === 'material' && (
              <div>
                <h4 className="text-md font-medium text-gray-800 mb-3">Resumo de Outros Insumos</h4>
                {insumos.filter(i => i.tipo !== 'filamento' && i.tipo !== 'embalagem' && i.tipo !== 'tempo').length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {insumos.filter(i => i.tipo !== 'filamento' && i.tipo !== 'embalagem' && i.tipo !== 'tempo').map(outro => (
                      <div key={outro.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="font-medium text-gray-900">{outro.nome}</div>
                        <div className="text-sm text-gray-600">Estoque: {parseFloat(outro.estoqueAtual || 0)} {outro.unidade}</div>
                        <div className="text-sm text-gray-600">Custo Unitário: R$ {parseFloat(outro.custoPorUnidade || 0).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Nenhum outro insumo cadastrado.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <InsumoFormModal
          isOpen={isModalOpen}
          onClose={closeModal}
          onSave={handleSaveInsumo}
          initialData={insumoToEdit}
          highestExistingSpoolNumber={highestSpoolNumber}
        />

        <FilamentBalanceModal
          isOpen={isBalanceModalOpen}
          onClose={() => setIsBalanceModalOpen(false)}
          filaments={filamentsForBalance}
          currentIndex={currentBalanceIndex}
          onUpdate={handleBalanceUpdate}
          onNext={handleNextSpool}
          onSkip={handleSkipSpool}
          showConfirmation={showBalanceConfirmation}
        />

        <EstoqueLancamentoModal
          isOpen={isLancamentoModalOpen}
          onClose={() => setIsLancamentoModalOpen(false)}
          onLancamentoSuccess={fetchAllData} // Refresh data after successful launch
          initialTipoProduto={activeTab === 'insumos' ? 'insumo' : activeTab === 'pecas' ? 'peca' : activeTab === 'modelos' ? 'modelo' : activeTab === 'kits' ? 'kit' : activeTab === 'partes' ? 'parte' : ''}
        />
      </div>
    </Layout>
  );
}
