"use client";

import { useState, useEffect } from 'react';
import { Plus, Search, Gift, Box, Puzzle, Edit, Trash2, Settings, Spool } from 'lucide-react'; // Updated icons for consistency
import Layout from '../components/Layout'; // Import Layout component
import ProdutoFormModal from '../components/ProdutoFormModal'; // Import ProdutoFormModal
import ServiceCostModal from '../components/ServiceCostModal'; // Import ServiceCostModal
import { db, auth } from '../services/firebase'; // Import db and auth from firebase.js
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore'; // Import Firestore functions, added getDoc
import { onAuthStateChanged } from 'firebase/auth'; // Import onAuthStateChanged

export default function Produtos() {
  const [activeTab, setActiveTab] = useState('kits');
  const [searchTerm, setSearchTerm] = useState('');
  const [isProdutoModalOpen, setIsProdutoModalOpen] = useState(false); // Renamed for clarity
  const [isServiceCostModalOpen, setIsServiceCostModalOpen] = useState(false); // New state for service cost modal
  const [produtoToEdit, setProdutoToEdit] = useState(null);
  const [produtos, setProdutos] = useState({
    kits: [],
    modelos: [],
    pecas: []
  });
  const [serviceCosts, setServiceCosts] = useState({
    custoPorMinutoImpressao: 0,
    custoPorMinutoMontagem: 0,
    custoPorGramaFilamento: 0, // New state for average filament cost
  });
  const [insumos, setInsumos] = useState([]); // New state for insumos

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // User is signed in, fetch data
        const fetchAllData = async () => {
          try {
            // Fetch products
            const kitsCollection = collection(db, 'kits');
            const modelosCollection = collection(db, 'modelos');
            const pecasCollection = collection(db, 'pecas');
            const insumosCollection = collection(db, 'insumos'); // Fetch insumos

            const [kitsSnapshot, modelosSnapshot, pecasSnapshot, insumosSnapshot] = await Promise.all([
              getDocs(kitsCollection),
              getDocs(modelosCollection),
              getDocs(pecasCollection),
              getDocs(insumosCollection) // Fetch insumos
            ]);

            const kitsList = kitsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const modelosList = modelosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const pecasList = pecasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const insumosList = insumosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); // Map insumos

            setProdutos({
              kits: kitsList,
              modelos: modelosList,
              pecas: pecasList
            });
            setInsumos(insumosList); // Set insumos state

            // Fetch service costs
            const serviceCostsRef = doc(db, 'settings', 'serviceCosts');
            const serviceCostsSnap = await getDoc(serviceCostsRef);
            if (serviceCostsSnap.exists()) {
              setServiceCosts(serviceCostsSnap.data());
            } else {
              // Initialize with default values if not found
              setServiceCosts({
                custoPorMinutoImpressao: 0,
                custoPorMinutoMontagem: 0,
                custoPorGramaFilamento: 0,
              });
            }
          } catch (error) {
            console.error("Error fetching data: ", error);
          }
        };
        fetchAllData();
      } else {
        // User is signed out
        console.log("User is not authenticated. Please log in to view products.");
        // Optionally, redirect to login page or show a message
      }
    });

    return () => unsubscribe(); // Cleanup subscription on unmount
  }, []);

  const tabs = [
    { id: 'kits', name: 'Kits', icon: Gift, count: produtos.kits.length },
    { id: 'modelos', name: 'Modelos', icon: Box, count: produtos.modelos.length },
    { id: 'pecas', name: 'Peças', icon: Puzzle, count: produtos.pecas.length }
  ];

  const filteredProdutos = produtos[activeTab].filter(produto =>
    produto.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    produto.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openProdutoModal = () => { // Renamed
    setProdutoToEdit(null);
    setIsProdutoModalOpen(true);
  };

  const closeProdutoModal = () => { // Renamed
    setIsProdutoModalOpen(false);
    setProdutoToEdit(null);
  };

  const openServiceCostModal = () => { // New function
    setIsServiceCostModalOpen(true);
  };

  const closeServiceCostModal = () => { // New function
    setIsServiceCostModalOpen(false);
    // Re-fetch service costs after closing in case they were updated
    const fetchServiceCosts = async () => {
      try {
        const docRef = doc(db, 'settings', 'serviceCosts');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setServiceCosts(docSnap.data());
        }
      } catch (error) {
        console.error("Error fetching service costs: ", error);
      }
    };
    fetchServiceCosts();
  };


  const handleSaveProduto = async (newProduto) => {
    try {
      // Re-fetch available insumos and pecas to get their costs and details
      const insumosCollection = collection(db, 'insumos');
      const insumoSnapshot = await getDocs(insumosCollection);
      const insumosList = insumoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const pecasCollection = collection(db, 'pecas');
      const pecasSnapshot = await getDocs(pecasCollection);
      const pecasList = pecasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Fetch service costs
      const serviceCostsRef = doc(db, 'settings', 'serviceCosts');
      const serviceCostsSnap = await getDoc(serviceCostsRef);
      const currentServiceCosts = serviceCostsSnap.exists() ? serviceCostsSnap.data() : serviceCosts;


      if (newProduto.tipo === 'peca') {
        let totalFilamentCost = 0;
        let totalOtherInsumoCost = 0;
        let totalImpressionTime = 0;
        let totalAssemblyTime = newProduto.tempoMontagem || 0;

        if (newProduto.isPecaComposta && newProduto.gruposImpressao) {
          newProduto.gruposImpressao.forEach(grupo => {
            totalImpressionTime += (grupo.tempoImpressaoGrupo || 0);
            grupo.filamentos.forEach(filamento => {
              const foundFilament = insumosList.find(i => i.id === filamento.filamentoId);
              if (foundFilament && foundFilament.custoPorGram) {
                totalFilamentCost += (filamento.quantidade * foundFilament.custoPorGram);
              }
            });
          });
        } else if (newProduto.insumos) {
          totalImpressionTime = newProduto.tempoImpressao || 0;
          newProduto.insumos.forEach(insumo => {
            if (insumo.tipo === 'filamento') {
              const foundFilament = insumosList.find(i => i.id === insumo.insumoId);
              if (foundFilament && foundFilament.custoPorGram) {
                totalFilamentCost += (insumo.quantidade * foundFilament.custoPorGram);
              }
            } else {
              const foundOtherInsumo = insumosList.find(i => i.id === insumo.insumoId);
              if (foundOtherInsumo && foundOtherInsumo.custoUnitario) {
                totalOtherInsumoCost += (insumo.quantidade * foundOtherInsumo.custoUnitario);
              }
            }
          });
        }

        const impressionCost = totalImpressionTime * currentServiceCosts.custoPorMinutoImpressao;
        const assemblyCost = totalAssemblyTime * currentServiceCosts.custoPorMinutoMontagem;

        newProduto.custoCalculado = totalFilamentCost + totalOtherInsumoCost + impressionCost + assemblyCost;

      } else if (newProduto.tipo === 'modelo') {
        let totalFilamentQuantity = 0; // Total filament in grams for the model
        let totalImpressionTime = 0;
        let totalAssemblyTime = newProduto.tempoMontagem || 0;

        newProduto.pecas?.forEach(modeloPeca => {
          const foundPeca = pecasList.find(p => p.id === modeloPeca.id);
          if (foundPeca) {
            if (foundPeca.isPecaComposta && foundPeca.gruposImpressao) {
              foundPeca.gruposImpressao.forEach(grupo => {
                totalImpressionTime += (grupo.tempoImpressaoGrupo || 0) * modeloPeca.quantidade;
                grupo.filamentos.forEach(filamento => {
                  totalFilamentQuantity += (filamento.quantidade || 0) * modeloPeca.quantidade;
                });
              });
            } else if (foundPeca.insumos) {
              totalImpressionTime += (foundPeca.tempoImpressao || 0) * modeloPeca.quantidade;
              foundPeca.insumos.forEach(insumo => {
                if (insumo.tipo === 'filamento') {
                  totalFilamentQuantity += (insumo.quantidade || 0) * modeloPeca.quantidade;
                }
              });
            }
          }
        });

        const impressionCost = totalImpressionTime * currentServiceCosts.custoPorMinutoImpressao;
        const assemblyCost = totalAssemblyTime * currentServiceCosts.custoPorMinutoMontagem;
        const filamentCost = totalFilamentQuantity * currentServiceCosts.custoPorGramaFilamento;

        newProduto.custoCalculado = filamentCost + impressionCost + assemblyCost;
      }


      if (newProduto.id) {
        // Update existing product
        const productRef = doc(db, newProduto.tipo + 's', newProduto.id); // e.g., 'pecas', 'modelos', 'kits'
        await updateDoc(productRef, { ...newProduto, updatedAt: new Date() });
        setProdutos(prev => ({
          ...prev,
          [newProduto.tipo + 's']: prev[newProduto.tipo + 's'].map(p => p.id === newProduto.id ? { ...p, ...newProduto } : p)
        }));
      } else {
        // Add new product
        const docRef = await addDoc(collection(db, newProduto.tipo + 's'), { ...newProduto, createdAt: new Date() });
        setProdutos(prev => ({
          ...prev,
          [newProduto.tipo + 's']: [...prev[newProduto.tipo + 's'], { id: docRef.id, ...newProduto }]
        }));
      }
      closeProdutoModal();
    } catch (error) {
      console.error("Error saving product: ", error);
    }
  };

  const handleEditProduto = (produto) => {
    setProdutoToEdit(produto);
    setIsProdutoModalOpen(true); // Changed to setIsProdutoModalOpen
  };

  const handleDeleteProduto = async (id, tipo) => {
    if (window.confirm(`Tem certeza que deseja deletar este ${tipo}? Esta ação não pode ser desfeita.`)) {
      try {
        await deleteDoc(doc(db, tipo + 's', id));
        setProdutos(prev => ({
          ...prev,
          [tipo + 's']: prev[tipo + 's'].filter(p => p.id !== id)
        }));
      } catch (error) {
        console.error(`Error deleting ${tipo}: `, error);
      }
    }
  };

  const renderKitCard = (kit) => (
    <div key={kit.id} className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">{kit.nome}</h3>
          <p className="text-sm text-gray-500">SKU: {kit.sku}</p>
        </div>
        <Gift className="h-8 w-8 text-blue-500" />
      </div>
      
      <div className="space-y-2 mb-4">
        <div className="text-sm text-gray-600">
          <strong>Modelos inclusos:</strong>
        </div>
        {kit.modelos.map((modelo, index) => (
          <div key={index} className="text-sm text-gray-500 ml-2">
            • {modelo.nome} (x{modelo.quantidade})
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Custo:</span>
          <div className="font-medium text-gray-900">R$ {kit.custoCalculado?.toFixed(2) || '0.00'}</div>
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
          onClick={() => handleEditProduto(kit)}
          className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
          title="Editar Kit"
        >
          <Edit className="h-5 w-5" />
        </button>
        <button
          onClick={() => handleDeleteProduto(kit.id, 'kit')}
          className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
          title="Deletar Kit"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  const renderModeloCard = (modelo, insumos, allPecas) => {
    let totalFilamentQuantity = 0;
    let uniqueColors = new Set();
    let totalPrintGroups = 0;

    modelo.pecas?.forEach(modeloPeca => {
      const foundPeca = allPecas.find(p => p.id === modeloPeca.id);
      if (foundPeca) {
        // Calculate total filament
        if (foundPeca.isPecaComposta && foundPeca.gruposImpressao) {
          foundPeca.gruposImpressao.forEach(grupo => {
            grupo.filamentos?.forEach(filamento => {
              totalFilamentQuantity += (filamento.quantidade || 0) * modeloPeca.quantidade;
              const foundFilament = insumos.find(i => i.id === filamento.filamentoId);
              if (foundFilament?.cor) {
                uniqueColors.add(foundFilament.cor);
              }
            });
            totalPrintGroups += 1; // Each group counts as one print group
          });
        } else if (foundPeca.insumos) {
          foundPeca.insumos.forEach(insumo => {
            if (insumo.tipo === 'filamento') {
              totalFilamentQuantity += (insumo.quantidade || 0) * modeloPeca.quantidade;
              const foundFilament = insumos.find(i => i.id === insumo.insumoId);
              if (foundFilament?.cor) {
                uniqueColors.add(foundFilament.cor);
              }
            }
          });
          totalPrintGroups += 1; // Simple piece counts as one print group
        }
      }
    });

    return (
    <div key={modelo.id} className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">{modelo.nome}</h3>
          <p className="text-sm text-gray-500">SKU: {modelo.sku}</p>
        </div>
        <Box className="h-8 w-8 text-green-500" />
      </div>
      
      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
        <div>
          <span className="text-gray-500">Custo:</span>
          <div className="font-medium text-gray-900">R$ {modelo.custoCalculado?.toFixed(2) || '0.00'}</div>
        </div>
        <div>
          <span className="text-gray-500">Filamento Total:</span>
          <div className="font-medium text-gray-900">{totalFilamentQuantity.toFixed(2)}g</div>
        </div>
        <div>
          <span className="text-gray-500">Tempo Impressão:</span>
          <div className="font-medium text-gray-900">{modelo.tempoImpressao || '0'}min</div>
        </div>
        <div>
          <span className="text-gray-500">Número de Cores:</span>
          <div className="font-medium text-gray-900">{uniqueColors.size}</div>
        </div>
        <div>
          <span className="text-gray-500">Tempo Montagem:</span>
          <div className="font-medium text-gray-900">{modelo.tempoMontagem || '0'}min</div>
        </div>
        <div>
          <span className="text-gray-500">Grupos de Impressão:</span>
          <div className="font-medium text-gray-900">{totalPrintGroups}</div>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button
          onClick={() => handleEditProduto(modelo)}
          className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
          title="Editar Modelo"
        >
          <Edit className="h-5 w-5" />
        </button>
        <button
          onClick={() => handleDeleteProduto(modelo.id, 'modelo')}
          className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
          title="Deletar Modelo"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    </div>
    );
  };

  const renderPecaCard = (peca) => {
    let totalFilamentQuantity = 0;
    if (peca.isPecaComposta && peca.gruposImpressao) {
      peca.gruposImpressao.forEach(grupo => {
        grupo.filamentos?.forEach(filamento => {
          totalFilamentQuantity += (filamento.quantidade || 0);
        });
      });
    } else if (peca.insumos) {
      peca.insumos.forEach(insumo => {
        if (insumo.tipo === 'filamento') {
          totalFilamentQuantity += (insumo.quantidade || 0);
        }
      });
    }

    return (
      <div key={peca.id} className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow relative"> {/* Added relative for positioning */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{peca.nome}</h3>
            <p className="text-sm text-gray-500">SKU: {peca.sku}</p>
          </div>
          <Puzzle className="h-8 w-8 text-purple-500" />
        </div>
        
        <div className="space-y-2 mb-4">
          <div className="text-sm text-gray-600">
            <strong>Insumos necessários:</strong>
          </div>
          {peca.insumos?.map((insumo, index) => (
            <div key={index} className="text-sm text-gray-500 ml-2">
              • {insumo.nome} ({insumo.quantidade})
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Custo:</span>
            <div className="font-medium text-gray-900">R$ {peca.custoCalculado?.toFixed(2) || '0.00'}</div>
          </div>
          <div>
            <span className="text-gray-500">Filamento:</span>
            <div className="font-medium text-green-600">
              {totalFilamentQuantity.toFixed(2)}g
            </div>
          </div>
          <div>
            <span className="text-gray-500">Tempo Impressão:</span>
            <div className="font-medium text-gray-900">
              {peca.isPecaComposta && peca.gruposImpressao
                ? peca.gruposImpressao.reduce((total, grupo) => total + (grupo.tempoImpressaoGrupo || 0), 0)
                : (peca.tempoImpressao || '0')}min
            </div>
          </div>
          <div>
            <span className="text-gray-500">Tempo Montagem:</span>
            <div className="font-medium text-gray-900">{peca.tempoMontagem || '0'}min</div>
          </div>
        </div>
        
        <div className="flex justify-between items-center mt-4">
          {/* Filament icons */}
          <div className="flex flex-wrap items-center gap-1">
            {peca.isPecaComposta && peca.gruposImpressao ? (
              peca.gruposImpressao.map((grupo, groupIndex) => (
                <div key={groupIndex} className="flex items-center">
                  {grupo.filamentos?.map((filamento, filamentIndex) => {
                    const foundFilament = insumos.find(i => i.id === filamento.filamentoId);
                    const color = getColorStyle(foundFilament?.cor); // Use getColorStyle
                    return (
                      <Spool
                        key={filamentIndex}
                        className="h-5 w-5"
                        style={{ fill: color, stroke: color }} // Apply color to fill and stroke
                        title={foundFilament?.nome || 'Filamento desconhecido'}
                      />
                    );
                  })}
                  {groupIndex < peca.gruposImpressao.length - 1 && (
                    <span className="mx-1 text-gray-400">|</span>
                  )}
                </div>
              ))
            ) : peca.insumos ? (
              peca.insumos.filter(insumo => insumo.tipo === 'filamento').map((insumo, index) => {
                const foundFilament = insumos.find(i => i.id === insumo.insumoId);
                const color = getColorStyle(foundFilament?.cor); // Use getColorStyle
                return (
                  <Spool
                    key={index}
                    className="h-5 w-5"
                    style={{ fill: color, stroke: color }} // Apply color to fill and stroke
                    title={foundFilament?.nome || 'Filamento desconhecido'}
                  />
                );
              })
            ) : null}
          </div>

          {/* Edit/Delete buttons */}
          <div className="flex">
            <button
              onClick={() => handleEditProduto(peca)}
              className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
              title="Editar Peça"
            >
              <Edit className="h-5 w-5" />
            </button>
            <button
              onClick={() => handleDeleteProduto(peca.id, 'peca')}
              className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
              title="Deletar Peça"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'kits':
        return filteredProdutos.map(renderKitCard);
      case 'modelos':
        return filteredProdutos.map(modelo => renderModeloCard(modelo, insumos, produtos.pecas)); // Pass insumos and all pecas to renderModeloCard
      case 'pecas':
        return filteredProdutos.map(renderPecaCard);
      default:
        return null;
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Produtos</h1>
            <p className="mt-1 text-sm text-gray-500">
              Gerencie kits, modelos e peças do catálogo
            </p>
          </div>
          <div className="flex space-x-3"> {/* Added a div to group buttons */}
            <button
              onClick={openServiceCostModal} // New button to open service cost modal
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              <Settings className="h-4 w-4 mr-2" />
              Serviços
            </button>
            <button
              onClick={openProdutoModal} // Changed to openProdutoModal
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white shadow rounded-lg">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                  >
                    <Icon className="h-5 w-5 mr-2" />
                    {tab.name}
                    <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2.5 rounded-full text-xs">
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Busca */}
          <div className="p-6 border-b border-gray-200">
            <div className="relative max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Buscar produtos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Conteúdo */}
        {filteredProdutos.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {renderContent()}
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg p-12">
            <div className="text-center">
              <Gift className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum item encontrado</h3>
              <p className="mt-1 text-sm text-gray-500">
                Tente ajustar o termo de busca ou criar um novo item.
              </p>
            </div>
        </div>
      )}

      <ProdutoFormModal
        isOpen={isProdutoModalOpen} // Changed to isProdutoModalOpen
        onClose={closeProdutoModal} // Changed to closeProdutoModal
        onSave={handleSaveProduto}
        initialData={produtoToEdit}
      />
      <ServiceCostModal
        isOpen={isServiceCostModalOpen}
        onClose={closeServiceCostModal}
      />
    </div>
  </Layout>
  );
}
