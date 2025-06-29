"use client";

import React, { useState, useEffect } from 'react';
import { Plus, Search, AlertTriangle, TrendingUp, TrendingDown, Upload, ChevronDown, ChevronUp, Edit, Trash2, Spool, PackageX, Weight, Package, Layers } from 'lucide-react';
import InsumoFormModal from '../components/InsumoFormModal';
import FilamentBalanceModal from '../components/FilamentBalanceModal'; // Import new component
import { db, auth } from '../services/firebase'; // Import db and auth from firebase.js
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore'; // Import Firestore functions
import { onAuthStateChanged, User } from 'firebase/auth'; // Import onAuthStateChanged and User type
import Layout from '../components/Layout'; // Import Layout component
import PecaFormModal from '../components/PecaFormModal'; // Import PecaFormModal component

export default function Estoque() {
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [insumos, setInsumos] = useState([]); // Initialize as empty, will fetch from Firestore
  const [insumosExpandedRows, setInsumosExpandedRows] = useState({}); // State to manage expanded rows for insumos
  const [pecasExpandedRows, setPecasExpandedRows] = useState({}); // State to manage expanded rows for pecas
  const [currentUser, setCurrentUser] = useState(null); // State to manage current user
  const [loadingAuth, setLoadingAuth] = useState(true); // State to manage auth loading
  const [insumoToEdit, setInsumoToEdit] = useState(null); // State to hold insumo data for editing
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false); // State for balance modal
  const [filamentsForBalance, setFilamentsForBalance] = useState([]); // Filaments to balance
  const [currentBalanceIndex, setCurrentBalanceIndex] = useState(0); // Current spool index
  const [showBalanceConfirmation, setShowBalanceConfirmation] = useState(false); // Confirmation message
  const [highestSpoolNumber, setHighestSpoolNumber] = useState(0); // New state for highest spool number
  const [mainListActiveTab, setMainListActiveTab] = useState('insumos'); // New state for active tab in main list
  const [modelos, setModelos] = useState([]); // New state for modelos
  const [pecas, setPecas] = useState([]); // New state for pecas
  const [isPecaModalOpen, setIsPecaModalOpen] = useState(false); // State for PecaFormModal
  const [pecaToEdit, setPecaToEdit] = useState(null); // State to hold peca data for editing

  useEffect(() => {
    // console.log('Estoque component mounted'); // Removed for production
    return () => {
      // console.log('Estoque component unmounted'); // Removed for production
    };
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

  // Render functions for Pecas and Modelos as table rows
  const renderPecaComponenteRow = (parte, pecaId) => {
    return (
      <tr key={`peca-${pecaId}-component-${parte.skuParte || parte.nome}`} className="bg-gray-50 hover:bg-gray-100">
        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700 pl-12">
          {parte.nome}
        </td>
        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
          Parte (SKU: {parte.skuParte})
        </td>
        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
          {`${parseFloat(parte.estoque || 0)}`}
        </td>
        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
          N/A
        </td>
        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-700">
          N/A
        </td>
        <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
          {/* Actions for components if needed */}
        </td>
      </tr>
    );
  };

  const renderModeloRow = (modelo) => (
    <tr key={modelo.id} className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-medium text-gray-900">{modelo.nome}</div>
        <div className="text-sm text-gray-500">SKU: {modelo.sku}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 capitalize">
          Modelo
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {modelo.quantidadeEmEstoque || 0}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        Geral
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        R$ {modelo.custoCalculado?.toFixed(2) || '0.00'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
        {/* Actions for Modelos if needed */}
      </td>
    </tr>
  );

  // Listen for auth state changes and fetch data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setLoadingAuth(false);

      if (user) {
        const fetchAllData = async () => {
          try {
            // Fetch insumos
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

            // Fetch modelos
            const modelosCollectionRef = collection(db, 'modelos');
            const modelosSnapshot = await getDocs(modelosCollectionRef);
            const modelosList = modelosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setModelos(modelosList);

            // Fetch pecas
            const pecasCollectionRef = collection(db, 'pecas');
            const pecasSnapshot = await getDocs(pecasCollectionRef);
            const pecasList = pecasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPecas(pecasList);

          } catch (error) {
            console.error("Error fetching data: ", error);
            // Handle permission errors or other fetch errors
          }
        };
        fetchAllData();
      } else {
        // If not authenticated, clear all data
        setInsumos([]);
        setHighestSpoolNumber(0);
        setModelos([]);
        setPecas([]);
      }
    });
    return () => unsubscribe();
  }, [currentUser, loadingAuth]); // Re-run when currentUser or loadingAuth changes

  const toggleRow = (id, type) => {
    if (type === 'insumo') {
      // Allow multiple insumo rows to be expanded
      setInsumosExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    } else if (type === 'peca') {
      // Temporarily simplify to a basic toggle for debugging
      setPecasExpandedRows(prev => {
        const newState = { ...prev, [id]: !prev[id] };
        return newState;
      });
    }
  };

  const handleEditInsumo = (insumo) => {
    setInsumoToEdit(insumo);
    setIsModalOpen(true);
  };

  const handleEditPeca = (peca) => {
    setPecaToEdit(peca);
    setIsPecaModalOpen(true);
  };

  const handleSavePeca = async (updatedPeca) => {
    try {
      const pecaRef = doc(db, 'pecas', updatedPeca.id);
      // Convert dataEstoque to Firestore Timestamp if it's a string (from input type="date")
      const dataEstoqueToSave = updatedPeca.dataEstoque ? new Date(updatedPeca.dataEstoque) : null;

      await updateDoc(pecaRef, {
        quantidadeEmEstoque: parseFloat(updatedPeca.quantidadeEmEstoque || 0),
        local: updatedPeca.local || '',
        dataEstoque: dataEstoqueToSave,
        gruposImpressao: updatedPeca.gruposImpressao.map(grupo => ({
          ...grupo,
          partes: grupo.partes.map(parte => ({
            ...parte,
            estoque: parseFloat(parte.estoque || 0),
            local: parte.local || '',
          }))
        })),
        updatedAt: new Date(),
      });

      // Update local state
      setPecas(prevPecas => prevPecas.map(peca =>
        peca.id === updatedPeca.id ? {
          ...peca,
          quantidadeEmEstoque: parseFloat(updatedPeca.quantidadeEmEstoque || 0),
          local: updatedPeca.local || '',
          dataEstoque: dataEstoqueToSave ? { seconds: dataEstoqueToSave.getTime() / 1000, nanoseconds: 0 } : null, // Simulate Firestore Timestamp
          gruposImpressao: updatedPeca.gruposImpressao.map(grupo => ({
            ...grupo,
            partes: grupo.partes.map(parte => ({
              ...parte,
              estoque: parseFloat(parte.estoque || 0),
              local: parte.local || '',
            }))
          })),
          updatedAt: new Date(),
        } : peca
      ));
      setIsPecaModalOpen(false);
      setPecaToEdit(null);
    } catch (error) {
      console.error("Error saving peca: ", error);
    }
  };

  const handleSaveInsumo = async (newInsumo) => {
    try {
      let insumoToSave = { ...newInsumo }; // Start with newInsumo data

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
      } else if (insumoToSave.tipo === 'embalagem') {
        // For embalagem, estoqueAtual is managed directly by the form and should not be overwritten by quantidade here.
        // custoPorUnidade is already calculated and rounded in InsumoFormModal.jsx
        // No need to recalculate or use valorUnitario here
      }

      if (newInsumo.id) {
        // Update existing insumo
        const insumoRef = doc(db, 'insumos', newInsumo.id);
        await updateDoc(insumoRef, { ...insumoToSave, updatedAt: new Date() });
        setInsumos(prevInsumos => prevInsumos.map(ins => ins.id === newInsumo.id ? { ...ins, ...insumoToSave } : ins));
      } else {
        // For new insumos
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
          // For non-filament types, save as a single document
          const docRef = await addDoc(collection(db, 'insumos'), { ...insumoToSave, createdAt: new Date() });
          setInsumos(prevInsumos => [...prevInsumos, { id: docRef.id, ...insumoToSave }]);
        }
      }
      setIsModalOpen(false);
      setInsumoToEdit(null);
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

  const handleBalanceUpdate = async (spoolId, newGrossWeight) => { // Renamed newWeight to newGrossWeight for clarity
    try {
      const spoolRef = doc(db, 'insumos', spoolId);
      const currentSpool = filamentsForBalance.find(s => s.id === spoolId);

      if (currentSpool) {
        const oldNetWeight = parseFloat(currentSpool.estoqueAtual || 0); // estoqueAtual is net weight
        const newNetWeight = newGrossWeight - 130; // Assuming 130g for spool
        const weightDifference = newNetWeight - oldNetWeight;

        await updateDoc(spoolRef, {
          estoqueAtual: newNetWeight, // Update with net weight
          'especificacoes.pesoBruto': newGrossWeight, // Store gross weight
          'especificacoes.pesoLiquido': newNetWeight, // Store net weight
          historicoEstoque: [
            ...(currentSpool.historicoEstoque || []),
            {
              data: new Date(),
              quantidade: newNetWeight, // Record net weight in history
              diferenca: weightDifference,
              motivo: 'Balanço de Filamento',
            },
          ],
          updatedAt: new Date(),
          'especificacoes.dataUltimaPesagem': new Date().toISOString().split('T')[0], // Set last weighing date to today
        });

        // Update local state
        setInsumos(prevInsumos => prevInsumos.map(ins =>
          ins.id === spoolId ? {
            ...ins,
            estoqueAtual: newNetWeight,
            especificacoes: {
              ...ins.especificacoes,
              pesoBruto: newGrossWeight,
              pesoLiquido: newNetWeight,
              pesoAtual: undefined // Remove old pesoAtual if it exists
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
              dataUltimaPesagem: new Date().toISOString().split('T')[0], // Update local state for last weighing date
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
    if (insumo.tipo === 'embalagem') {
      const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100;
      if (percentual <= 50) return 'text-red-600 bg-red-50';
      if (percentual <= 80) return 'text-yellow-600 bg-yellow-50';
      return 'text-green-600 bg-green-50';
    }
    const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100; // Prevent division by zero
    if (percentual <= 50) return 'text-red-600 bg-red-50';
    if (percentual <= 80) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getStatusIcon = (insumo) => {
    if (insumo.tipo === 'filamento') return TrendingUp; // Default for filaments
    if (insumo.tipo === 'embalagem') {
      const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100;
      if (percentual <= 50) return AlertTriangle;
      if (percentual <= 80) return TrendingDown;
      return TrendingUp;
    }
    const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100; // Prevent division by zero
    if (percentual <= 50) return AlertTriangle;
    if (percentual <= 80) return TrendingDown;
    return TrendingUp;
  };

  const getStatusText = (insumo) => {
    if (insumo.tipo === 'tempo') return 'Ilimitado';
    if (insumo.tipo === 'filamento') return 'Por Spool'; // Filaments managed per spool
    if (insumo.tipo === 'embalagem') {
      const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100;
      if (percentual <= 50) return 'Crítico';
      if (percentual <= 80) return 'Baixo';
      return 'Adequado';
    }
    const percentual = (parseFloat(insumo.estoqueAtual || 0) / parseFloat(insumo.estoqueMinimo || 1)) * 100; // Prevent division by zero
    if (percentual <= 50) return 'Crítico';
    if (percentual <= 80) return 'Baixo';
    return 'Adequado';
  };

  const groupFilaments = (filaments) => {
    const grouped = {};
    filaments.forEach(spool => {
      const key = `${spool.especificacoes.fabricante}-${spool.especificacoes.material}-${spool.cor}`;
      if (!grouped[key]) {
        grouped[key] = {
          id: `grouped-filament-${key}`, // Assign a unique ID for grouped items
          key,
          fabricante: spool.especificacoes.fabricante,
          material: spool.especificacoes.material,
          cor: spool.cor,
          totalSpools: 0,
          totalWeight: 0,
          totalCost: 0,
          spools: [],
          hasClosedSpool: false, // New property to track closed spools
        };
      }
      grouped[key].totalSpools += 1;
      grouped[key].totalWeight += parseFloat(spool.estoqueAtual || 0);
      grouped[key].totalCost += parseFloat(spool.custoPorUnidade || 0) * parseFloat(spool.estoqueAtual || 0);
      grouped[key].spools.push(spool);
      if (!spool.especificacoes.aberto) { // If spool is not open, it's a closed spool
        grouped[key].hasClosedSpool = true;
      }
    });
    const sortedGroupedFilaments = Object.values(grouped).sort((a, b) => {
      const colorA = a.cor || '';
      const colorB = b.cor || '';
      return colorA.localeCompare(colorB);
    });

    // Sort spools within each group by spoolNumero
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

    // Specific checks for insumos
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

  const filteredPecas = pecas.filter(item => {
    const nameMatch = item.nome?.toLowerCase().includes(searchTerm.toLowerCase());
    const skuMatch = item.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    return nameMatch || skuMatch;
  });

  const filteredModelos = modelos.filter(item => {
    const nameMatch = item.nome?.toLowerCase().includes(searchTerm.toLowerCase());
    const skuMatch = item.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    return nameMatch || skuMatch;
  });

  const displayInsumos = (() => {
    let rows = [];

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
    return rows;
  })();

  const displayPecas = (() => {
    let rows = [];
    filteredPecas.forEach(peca => {
      // Check if the peca is composed (has isPecaComposta: true and gruposImpressao with parts)
      if (peca.isPecaComposta && peca.gruposImpressao && Array.isArray(peca.gruposImpressao) && peca.gruposImpressao.length > 0) {
        const groupKey = `peca-group-${peca.id}`;
        rows.push({ type: 'peca-group-summary', data: peca, key: groupKey });
        // The detail rows are now rendered directly within the peca-group-summary's React.Fragment
      } else {
        rows.push({ type: 'peca-regular', data: peca, key: `peca-${peca.id}` });
      }
    });
    filteredModelos.forEach(modelo => {
      rows.push({ type: 'modelo', data: modelo, key: `modelo-${modelo.id}` });
    });
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
                placeholder={mainListActiveTab === 'insumos' ? "Buscar insumos..." : "Buscar peças/modelos..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Filtro de Tipo (apenas para Insumos) */}
            {mainListActiveTab === 'insumos' && (
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
                  {mainListActiveTab === 'insumos' ? filteredInsumos.length : filteredPecas.length + filteredModelos.length}
                </div>
                <div className="text-gray-500">Total</div>
              </div>
              {mainListActiveTab === 'insumos' && (
                <div className="text-center">
                  <div className="font-medium text-red-600">{insumosComAlerta.length}</div>
                  <div className="text-gray-500">Alertas</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs para Insumos e Peças */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
              <button
                onClick={() => setMainListActiveTab('insumos')}
                className={`${mainListActiveTab === 'insumos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Insumos ({filteredInsumos.length})
              </button>
              <button
                onClick={() => setMainListActiveTab('pecas')}
                className={`${mainListActiveTab === 'pecas' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Peças e Modelos ({filteredPecas.length + filteredModelos.length})
              </button>
            </nav>
          </div>

          {/* Lista de Itens (Insumos ou Peças/Modelos) */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Estoque ({mainListActiveTab === 'insumos' ? displayInsumos.length : displayPecas.length})
            </h3>
          </div>

          {(mainListActiveTab === 'insumos' && displayInsumos.length > 0) || (mainListActiveTab === 'pecas' && displayPecas.length > 0) ? (
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
                      {mainListActiveTab === 'insumos'
                        ? (tipoFilter === 'filamento' ? 'Spools' : 'Quantidade')
                        : 'Estoque'}
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
                  {mainListActiveTab === 'insumos' && displayInsumos.map((row) => {
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
                                  {`${item.fabricante} ${item.material}`}
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
                    return null; // Should not happen
                  })}
                  {mainListActiveTab === 'pecas' && displayPecas.map((row) => {
                    if (row.type === 'peca-group-summary') {
                      const item = row.data;
                      const isExpanded = pecasExpandedRows[row.key]; // Corrected: Use row.key instead of item.key
                      return (
                        <React.Fragment key={row.key}>
                          <tr
                            key={row.key}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent event from bubbling up
                              toggleRow(row.key, 'peca');
                            }}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {isExpanded ? <ChevronUp className="h-4 w-4 mr-2 text-gray-500" /> : <ChevronDown className="h-4 w-4 mr-2 text-gray-500" />}
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{item.nome}</div>
                                  <div className="text-sm text-gray-500">SKU: {item.sku}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 capitalize">
                                Peça Composta
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.quantidadeEmEstoque || 0}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              Geral
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              R$ {item.custoCalculado?.toFixed(2) || '0.00'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex items-center justify-end">
                                <button
                                  onClick={() => handleEditPeca(item)}
                                  className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
                                  title="Editar Peça Composta"
                                >
                                  <Edit className="h-5 w-5" />
                                </button>
                                {/* Add delete button if needed */}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && item.gruposImpressao && item.gruposImpressao.length > 0 && (
                            <>
                              {item.gruposImpressao.map((grupo, grupoIndex) => (
                                <React.Fragment key={`grupo-${item.id}-${grupoIndex}`}>
                                  {grupo.partes && grupo.partes.length > 0 && (
                                    <>
                                      {grupo.partes.map((parte, parteIndex) => {
                                        return renderPecaComponenteRow(parte, item.id);
                                      })}
                                    </>
                                  )}
                                  {(!grupo.partes || grupo.partes.length === 0) && (
                                    <tr key={`no-parts-${item.id}-${grupoIndex}`} className="bg-gray-50 hover:bg-gray-100">
                                      <td colSpan="6" className="px-6 py-2 whitespace-nowrap text-sm text-gray-500 pl-12">
                                        Nenhuma parte encontrada para este grupo.
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              ))}
                            </>
                          )}
                          {isExpanded && (!item.gruposImpressao || item.gruposImpressao.length === 0) && (
                            <tr key={`no-groups-${item.id}`} className="bg-gray-50 hover:bg-gray-100">
                              <td colSpan="6" className="px-6 py-2 whitespace-nowrap text-sm text-gray-500 pl-12">
                                Nenhuma parte composta encontrada para esta peça.
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    } else if (row.type === 'peca-regular') {
                      const peca = row.data;
                      return (
                        <tr key={peca.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {/* No chevron for regular pieces */}
                              <div>
                              <div className="text-sm font-medium text-gray-900">{peca.nome}</div>
                              <div className="text-sm text-gray-500">SKU: {peca.sku}</div>
                            </div>
                          </div>
                        </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 capitalize">
                                Peça
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {peca.quantidadeEmEstoque || 0}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              Geral
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              R$ {peca.custoCalculado?.toFixed(2) || '0.00'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex items-center justify-end">
                                <button
                                  onClick={() => handleEditPeca(peca)}
                                  className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
                                  title="Editar Peça"
                                >
                                  <Edit className="h-5 w-5" />
                                </button>
                                {/* Add delete button if needed */}
                              </div>
                            </td>
                          </tr>
                      );
                    } else if (row.type === 'modelo') {
                      return renderModeloRow(row.data);
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
        </div>
        {/* Resumo do Estoque com Abas */}
        <div className="bg-white shadow rounded-lg">
          <div className="border-b border-gray-200">
            <div className="px-6 pt-4">
              <h3 className="text-lg font-medium text-gray-900">Resumo do Estoque</h3>
            </div>
            <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
              <button
                onClick={() => setTipoFilter('todos')} // Reusing tipoFilter for summary tabs
                className={`${tipoFilter === 'todos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Geral
              </button>
              <button
                onClick={() => setTipoFilter('filamento')}
                className={`${tipoFilter === 'filamento' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Filamento
              </button>
              <button
                onClick={() => setTipoFilter('embalagem')}
                className={`${tipoFilter === 'embalagem' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Embalagens
              </button>
              <button
                onClick={() => setTipoFilter('material')} // Changed from 'outros' to 'material' for consistency
                className={`${tipoFilter === 'material' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Outros Insumos
              </button>
            </nav>
          </div>
          <div className="p-6">
            {tipoFilter === 'todos' && (
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
            {tipoFilter === 'filamento' && (
              <div>
                <h4 className="text-md font-medium text-gray-800 mb-3">Resumo de Filamentos por Modelo</h4>
                {groupFilaments(insumos.filter(i => i.tipo === 'filamento')).length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {groupFilaments(insumos.filter(i => i.tipo === 'filamento')).map(filamentGroup => (
                      <div key={filamentGroup.id} className="border border-gray-200 rounded-lg p-4 flex items-center space-x-3">
                        <Spool className="h-8 w-8 flex-shrink-0" style={{ color: getColorStyle(filamentGroup.cor) }} />
                        <div>
                          <div className="font-medium text-gray-900 flex items-center">
                            {`${filamentGroup.fabricante} ${filamentGroup.material}`}
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
            {tipoFilter === 'embalagem' && (
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
            {tipoFilter === 'material' && (
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

        <PecaFormModal
          isOpen={isPecaModalOpen}
          onClose={() => setIsPecaModalOpen(false)}
          onSave={handleSavePeca}
          initialData={pecaToEdit}
        />
      </div>
    </Layout>
  );
}
