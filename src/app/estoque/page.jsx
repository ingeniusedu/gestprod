"use client";

import { useState, useEffect } from 'react';
import { Plus, Search, AlertTriangle, TrendingUp, TrendingDown, Upload, ChevronDown, ChevronUp, Edit, Trash2 } from 'lucide-react';
import InsumoFormModal from '../components/InsumoFormModal';
import FilamentBalanceModal from '../components/FilamentBalanceModal'; // Import new component
import { db, auth } from '../services/firebase'; // Import db and auth from firebase.js
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore'; // Import Firestore functions
import { onAuthStateChanged, User } from 'firebase/auth'; // Import onAuthStateChanged and User type
import Layout from '../components/Layout'; // Import Layout component

export default function Estoque() {
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [insumos, setInsumos] = useState([]); // Initialize as empty, will fetch from Firestore
  const [expandedRows, setExpandedRows] = useState({}); // State to manage expanded rows
  const [currentUser, setCurrentUser] = useState(null); // State to manage current user
  const [loadingAuth, setLoadingAuth] = useState(true); // State to manage auth loading
  const [insumoToEdit, setInsumoToEdit] = useState(null); // State to hold insumo data for editing
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false); // State for balance modal
  const [filamentsForBalance, setFilamentsForBalance] = useState([]); // Filaments to balance
  const [currentBalanceIndex, setCurrentBalanceIndex] = useState(0); // Current spool index
  const [showBalanceConfirmation, setShowBalanceConfirmation] = useState(false); // Confirmation message
  const [highestSpoolNumber, setHighestSpoolNumber] = useState(0); // New state for highest spool number

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch insumos from Firestore only if authenticated
  useEffect(() => {
    if (currentUser) { // Only fetch if user is authenticated
      const fetchInsumos = async () => {
        try {
          const insumosCollectionRef = collection(db, 'insumos');
          const insumoSnapshot = await getDocs(insumosCollectionRef);
          const insumosList = insumoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setInsumos(insumosList);

          // Calculate highest spool number
          const filamentSpools = insumosList.filter(insumo => insumo.tipo === 'filamento' && insumo.especificacoes?.spoolNumero);
          const maxSpoolNum = filamentSpools.reduce((max, spool) => {
            const num = parseInt(spool.especificacoes.spoolNumero, 10);
            return isNaN(num) ? max : Math.max(max, num);
          }, 0);
          setHighestSpoolNumber(maxSpoolNum);

        } catch (error) {
          console.error("Error fetching insumos: ", error);
          // Handle permission errors or other fetch errors
        }
      };
      fetchInsumos();
    } else if (!loadingAuth) {
      // If not authenticated and auth loading is done, clear insumos
      setInsumos([]);
      setHighestSpoolNumber(0); // Reset highest spool number if not authenticated
    }
  }, [currentUser, loadingAuth]); // Re-run when currentUser or loadingAuth changes

  const toggleRow = (id) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleEditInsumo = (insumo) => {
    setInsumoToEdit(insumo);
    setIsModalOpen(true);
  };

  const handleSaveInsumo = async (newInsumo) => {
    try {
      if (newInsumo.id) {
        // Update existing insumo
        const insumoRef = doc(db, 'insumos', newInsumo.id);
        await updateDoc(insumoRef, { ...newInsumo, updatedAt: new Date() });
        setInsumos(prevInsumos => prevInsumos.map(ins => ins.id === newInsumo.id ? { ...ins, ...newInsumo } : ins));
      } else if (newInsumo.tipo === 'filamento') {
        const spoolsToCreate = newInsumo.especificacoes.numeroSpools;
        const createdSpools = [];

        for (let i = 0; i < spoolsToCreate; i++) {
          let assignedSpoolNumber = newInsumo.especificacoes.spoolNumero;
          if (newInsumo.especificacoes.autoNumberSpool) {
            assignedSpoolNumber = `${highestSpoolNumber + i + 1}`;
          }

          const spoolData = {
            nome: `${newInsumo.especificacoes.fabricante} ${newInsumo.especificacoes.material} ${newInsumo.especificacoes.tipoFilamento} ${newInsumo.cor}`,
            tipo: 'filamento',
            unidade: 'gramas',
            custoPorUnidade: parseFloat(newInsumo.especificacoes.valorPagoPorSpool || 0) / parseFloat(newInsumo.especificacoes.tamanhoSpool || 1), // Cost per gram, prevent division by zero
            estoqueAtual: parseFloat(newInsumo.especificacoes.tamanhoSpool || 0), // Initial weight is full spool size
            estoqueMinimo: 0, // Not applicable for individual spools
            cor: newInsumo.cor,
            especificacoes: {
              fabricante: newInsumo.especificacoes.fabricante,
              tipoFilamento: newInsumo.especificacoes.tipoFilamento,
              material: newInsumo.especificacoes.material,
              numeroSpools: 1, // Each document is one spool
              tamanhoSpool: newInsumo.especificacoes.tamanhoSpool,
              valorPagoPorSpool: newInsumo.especificacoes.valorPagoPorSpool,
              spoolNumero: assignedSpoolNumber,
              autoNumberSpool: newInsumo.especificacoes.autoNumberSpool,
              aberto: newInsumo.especificacoes.aberto,
              dataAbertura: newInsumo.especificacoes.dataAbertura,
              pesoAtual: newInsumo.especificacoes.aberto ? parseFloat(newInsumo.especificacoes.pesoAtual || 0) : parseFloat(newInsumo.especificacoes.tamanhoSpool || 0),
              finalizadoEm: newInsumo.especificacoes.finalizadoEm,
              dataFinalizacao: newInsumo.especificacoes.dataFinalizacao,
            },
            createdAt: new Date(), // Timestamp for creation
          };
          const docRef = await addDoc(collection(db, 'insumos'), spoolData);
          createdSpools.push({ id: docRef.id, ...spoolData });
        }
        setInsumos(prevInsumos => [...prevInsumos, ...createdSpools]);
      } else {
        // For non-filament types, save as a single document
        const docRef = await addDoc(collection(db, 'insumos'), { ...newInsumo, createdAt: new Date() });
        setInsumos(prevInsumos => [...prevInsumos, { id: docRef.id, ...newInsumo }]);
      }
      setIsModalOpen(false);
      setInsumoToEdit(null); // Clear the insumo being edited
    } catch (error) {
      console.error("Error saving insumo: ", error);
      // Optionally, show an error message to the user
    }
  };

  const openModal = () => {
    setInsumoToEdit(null); // Ensure no initial data for new insumo
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
    setInsumoToEdit(null); // Clear the insumo being edited
  };

  const startFilamentBalance = () => {
    const filaments = insumos.filter(insumo => insumo.tipo === 'filamento');
    setFilamentsForBalance(filaments);
    setCurrentBalanceIndex(0);
    setIsBalanceModalOpen(true);
    setShowBalanceConfirmation(false);
  };

  const handleBalanceUpdate = async (spoolId, newWeight) => {
    try {
      const spoolRef = doc(db, 'insumos', spoolId);
      const currentSpool = filamentsForBalance.find(s => s.id === spoolId);

      if (currentSpool) {
        const oldWeight = parseFloat(currentSpool.estoqueAtual || 0);
        const weightDifference = newWeight - oldWeight;

        await updateDoc(spoolRef, {
          estoqueAtual: newWeight,
          'especificacoes.pesoAtual': newWeight, // Update pesoAtual in especificacoes
          historicoEstoque: [
            ...(currentSpool.historicoEstoque || []),
            {
              data: new Date(),
              quantidade: newWeight,
              diferenca: weightDifference,
              motivo: 'Balanço de Filamento',
            },
          ],
          updatedAt: new Date(),
        });

        // Update local state
        setInsumos(prevInsumos => prevInsumos.map(ins =>
          ins.id === spoolId ? {
            ...ins,
            estoqueAtual: newWeight,
            especificacoes: { ...ins.especificacoes, pesoAtual: newWeight },
            historicoEstoque: [
              ...(ins.historicoEstoque || []),
              {
                data: new Date(),
                quantidade: newWeight,
                diferenca: weightDifference,
                motivo: 'Balanço de Filamento',
              },
            ],
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
      setTimeout(() => setShowBalanceConfirmation(false), 5000); // Hide after 5 seconds
    }
  };

  const handleSkipSpool = () => {
    handleNextSpool(); // Just move to the next spool without updating
  };

  const handleDeleteInsumo = async (id) => {
    if (window.confirm("Tem certeza que deseja deletar este insumo? Esta ação não pode ser desfeita.")) {
      try {
        await deleteDoc(doc(db, 'insumos', id));
        setInsumos(prevInsumos => prevInsumos.filter(insumo => insumo.id !== id));
      } catch (error) {
        console.error("Error deleting insumo: ", error);
        // Optionally, show an error message to the user
      }
    }
  };

  const getStatusColor = (insumo) => {
    if (insumo.tipo === 'filamento') return 'text-gray-600 bg-gray-50'; // Filaments managed per spool
    const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100; // Prevent division by zero
    if (percentual <= 50) return 'text-red-600 bg-red-50';
    if (percentual <= 80) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getStatusIcon = (insumo) => {
    if (insumo.tipo === 'filamento') return TrendingUp; // Default for filaments
    const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100; // Prevent division by zero
    if (percentual <= 50) return AlertTriangle;
    if (percentual <= 80) return TrendingDown;
    return TrendingUp;
  };

  const getStatusText = (insumo) => {
    if (insumo.tipo === 'tempo') return 'Ilimitado';
    if (insumo.tipo === 'filamento') return 'Por Spool'; // Filaments managed per spool
    const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100; // Prevent division by zero
    if (percentual <= 50) return 'Crítico';
    if (percentual <= 80) return 'Baixo';
    return 'Adequado';
  };

  const groupFilaments = (filaments) => {
    const grouped = {};
    filaments.forEach(spool => {
      const key = `${spool.especificacoes.fabricante}-${spool.especificacoes.material}-${spool.especificacoes.tipoFilamento}-${spool.cor}`;
      if (!grouped[key]) {
        grouped[key] = {
          id: `grouped-filament-${key}`, // Assign a unique ID for grouped items
          key,
          fabricante: spool.especificacoes.fabricante,
          material: spool.especificacoes.material,
          tipoFilamento: spool.especificacoes.tipoFilamento,
          cor: spool.cor,
          totalSpools: 0,
          totalWeight: 0,
          totalCost: 0,
          spools: [],
        };
      }
      grouped[key].totalSpools += 1;
      grouped[key].totalWeight += parseFloat(spool.estoqueAtual || 0);
      grouped[key].totalCost += parseFloat(spool.custoPorUnidade || 0) * parseFloat(spool.estoqueAtual || 0);
      grouped[key].spools.push(spool);
    });
    return Object.values(grouped);
  };

  const searchedInsumos = insumos.filter(insumo => {
    const matchesSearch = insumo.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (insumo.tipo === 'filamento' && 
                           (insumo.especificacoes.fabricante?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            insumo.especificacoes.tipoFilamento?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            insumo.especificacoes.material?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            insumo.cor?.toLowerCase().includes(searchTerm.toLowerCase())));
    return matchesSearch;
  });

  const displayInsumos = (() => {
    const filamentInsumos = searchedInsumos.filter(i => i.tipo === 'filamento');
    const nonFilamentInsumos = searchedInsumos.filter(i => i.tipo !== 'filamento');

    if (tipoFilter === 'filamento') {
      return groupFilaments(filamentInsumos);
    } else if (tipoFilter === 'todos') {
      return [...groupFilaments(filamentInsumos), ...nonFilamentInsumos];
    } else {
      return nonFilamentInsumos.filter(i => i.tipo === tipoFilter);
    }
  })();

  const insumosComAlerta = insumos.filter(insumo => 
    insumo.tipo !== 'tempo' && insumo.tipo !== 'filamento' && (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) <= 0.8
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
    // This case should ideally be handled by page.tsx redirection,
    // but as a fallback, we can show a message or redirect again.
    // For now, we'll just show a message.
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
              Gerencie insumos e monitore níveis de estoque
            </p>
          </div>
          <div className="flex space-x-3">
            <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              <Upload className="h-4 w-4 mr-2" />
              Importar XML
            </button>
            <button
              onClick={() => startFilamentBalance()}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Balanço Filamento
            </button>
            <button
              onClick={openModal}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Insumo
            </button>
          </div>
        </div>

        {/* Alertas de Estoque */}
        {insumosComAlerta.length > 0 && (
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
                placeholder="Buscar insumos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Filtro de Tipo */}
            <div className="relative">
              <select
                className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
                value={tipoFilter}
                onChange={(e) => setTipoFilter(e.target.value)}
              >
                <option value="todos">Todos os Tipos</option>
                <option value="filamento">Filamentos</option>
                <option value="material">Materiais</option>
                <option value="tempo">Tempo</option>
              </select>
            </div>

            {/* Estatísticas rápidas */}
            <div className="flex items-center justify-end space-x-4 text-sm">
              <div className="text-center">
                <div className="font-medium text-gray-900">{insumos.length}</div>
                <div className="text-gray-500">Total</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-red-600">{insumosComAlerta.length}</div>
                <div className="text-gray-500">Alertas</div>
              </div>
            </div>
          </div>
        </div>

        {/* Lista de Insumos */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Insumos ({displayInsumos.length})
            </h3>
          </div>

          {displayInsumos.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Insumo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {tipoFilter === 'filamento' ? 'Spools' : 'Estoque Atual'}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {tipoFilter === 'filamento' ? 'Peso Total' : 'Estoque Mínimo'}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Custo Unitário
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Valor Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayInsumos.map((item) => {
                    const isGroupedFilament = item.key !== undefined; // Check if it's a grouped filament

                    if (isGroupedFilament) {
                      const isExpanded = expandedRows[item.key];
                      return (
                        <>
                          <tr
                            key={`filament-group-${item.key}`}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => toggleRow(item.key)}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {isExpanded ? <ChevronUp className="h-4 w-4 mr-2 text-gray-500" /> : <ChevronDown className="h-4 w-4 mr-2 text-gray-500" />}
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {`${item.fabricante} ${item.material} ${item.tipoFilamento}`}
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
                              {item.totalSpools} spools
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {parseFloat(item.totalWeight || 0).toFixed(2)} gramas
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-gray-600 bg-gray-50`}>
                                <TrendingUp className="h-3 w-3 mr-1" />
                                Por Spool
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              R$ {(parseFloat(item.totalCost || 0) / parseFloat(item.totalWeight || 1)).toFixed(2)}/g
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              R$ {parseFloat(item.totalCost || 0).toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              {/* No actions for grouped filaments directly */}
                            </td>
                          </tr>
                          {isExpanded && item.spools.map(spool => (
                            <tr key={`spool-${spool.id}`} className="bg-gray-50 hover:bg-gray-100">
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700 pl-12">
                                {spool.especificacoes.spoolNumero && `${spool.especificacoes.spoolNumero} - `}{spool.nome}
                              </td>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
                                Spool
                              </td>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
                                1 spool
                              </td>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
                                {parseFloat(spool.estoqueAtual || 0)} gramas
                              </td>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
                                {spool.especificacoes.aberto ? 'Aberto' : 'Fechado'}
                              </td>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
                                R$ {parseFloat(spool.custoPorUnidade || 0).toFixed(2)}/g
                              </td>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
                                R$ {(parseFloat(spool.custoPorUnidade || 0) * parseFloat(spool.estoqueAtual || 0)).toFixed(2)}
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
                          ))}
                        </>
                      );
                    } else {
                      // Existing rendering for non-filament insumos
                      const StatusIcon = getStatusIcon(item);
                      const valorTotal = parseFloat(item.estoqueAtual || 0) * parseFloat(item.custoPorUnidade || 0);
                      return (
                        <tr key={`insumo-${item.id}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {item.nome}
                              </div>
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
                            {item.tipo === 'tempo' ? '-' : `${parseFloat(item.estoqueMinimo || 0)} ${item.unidade}`}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(item)}`}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {getStatusText(item)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            R$ {parseFloat(item.custoPorUnidade || 0).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            R$ {valorTotal.toFixed(2)}
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
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <Search className="mx-auto h-12 w-12" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">Nenhum insumo encontrado</h3>
              <p className="text-sm text-gray-500">
                Tente ajustar os filtros ou adicionar um novo insumo.
              </p>
            </div>
          )}
        </div>

        {/* Resumo Financeiro */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Resumo do Estoque</h3>
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
        </div>

        <InsumoFormModal
          isOpen={isModalOpen}
          onClose={closeModal}
          onSave={handleSaveInsumo}
          initialData={insumoToEdit} // Pass the insumo data for editing
          highestExistingSpoolNumber={highestSpoolNumber} // Pass highest spool number for auto-numbering
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
      </div>
    </Layout>
  );
}
