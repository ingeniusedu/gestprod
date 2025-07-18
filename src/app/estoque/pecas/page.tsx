"use client";

import React, { useState, useEffect } from 'react';
import { Plus, Search, Puzzle, Edit, Trash2, Settings, Spool, List, Grid } from 'lucide-react';
import PecaFormModal from '../../components/PecaFormModal';
import ServiceCostModal from '../../components/ServiceCostModal';
import { db, auth, addParte, updateParte, addPeca, updatePeca, deletePecas, deletePeca, getLocaisProdutos, getRecipientes } from '../../services/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Peca, PosicaoEstoque, Insumo, Parte, GrupoImpressao, PecaInsumo, Produto, Modelo, Kit, PecaParte } from '../../types';
import { LocalProduto, Recipiente } from '../../types/mapaEstoque';
import EstoqueLancamentoModal from '../../components/EstoqueLancamentoModal'; // Ensure this import is present

export default function PecasPage({ isOnlyButton = false, searchTerm: propSearchTerm = '' }) {
  const [searchTerm, setSearchTerm] = useState(propSearchTerm);
  const [isPecaModalOpen, setIsPecaModalOpen] = useState(false);
  const [isServiceCostModalOpen, setIsServiceCostModalOpen] = useState(false);
  const [isEstoqueLancamentoModalOpen, setIsEstoqueLancamentoModalOpen] = useState(false); // Added state for EstoqueLancamentoModal
  const [recipienteToEdit, setRecipienteToEdit] = useState<Recipiente | null>(null); // Added state for recipient to edit
  const [localToEdit, setLocalToEdit] = useState<LocalProduto | null>(null); // Added state for local to edit
  const [pecaToEdit, setPecaToEdit] = useState<Peca | null>(null);
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [selectedPecas, setSelectedPecas] = useState<string[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [partes, setPartes] = useState<Parte[]>([]);
  const [modelos, setModelos] = useState<Produto[]>([]); // Added state for modelos
  const [kits, setKits] = useState<Produto[]>([]);       // Added state for kits
  const [allProducts, setAllProducts] = useState<Produto[]>([]); // Added state for all products
  const [locaisDeEstoque, setLocaisDeEstoque] = useState<LocalProduto[]>([]);
  const [recipientes, setRecipientes] = useState<Recipiente[]>([]);
  const [gruposDeFilamento, setGruposDeFilamento] = useState<any[]>([]); // Using any for now
  const [serviceCosts, setServiceCosts] = useState({
    custoPorMinutoImpressao: 0,
    custoPorMinutoMontagem: 0,
    custoPorGramaFilamento: 0,
  });
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

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
    return colorMap[colorName] || '#CCCCCC';
  };

  const fetchAllData = async () => {
    try {
      const pecasCollection = collection(db, 'pecas');
      const insumosCollection = collection(db, 'insumos');
      const partesCollection = collection(db, 'partes');
      const modelosCollection = collection(db, 'modelos');
      const kitsCollection = collection(db, 'kits');
      const locaisDeEstoqueCollection = collection(db, 'locaisProdutos');
      const recipientesCollection = collection(db, 'recipientes');
      const gruposDeFilamentoCollection = collection(db, 'gruposDeFilamento');

      const [
        pecasSnapshot,
        insumosSnapshot,
        partesSnapshot,
        modelosSnapshot,
        kitsSnapshot,
        locaisSnapshot,
        recipientesSnapshot,
        gruposDeFilamentoSnapshot
      ] = await Promise.all([
        getDocs(pecasCollection),
        getDocs(insumosCollection),
        getDocs(partesCollection),
        getDocs(modelosCollection),
        getDocs(kitsCollection),
        getDocs(locaisDeEstoqueCollection),
        getDocs(recipientesCollection),
        getDocs(gruposDeFilamentoCollection)
      ]);

      const fetchedPecas = pecasSnapshot.docs.map(doc => {
        const data = doc.data() as Peca;
        const posicoes = data.posicoesEstoque || [];
        const estoqueTotal = posicoes.reduce((acc: number, pos: PosicaoEstoque) => acc + (pos.quantidade || 0), 0);
        return {
          id: doc.id,
          sku: data.sku || '',
          nome: data.nome || '',
          isComposta: data.isComposta || false,
          gruposImpressao: data.gruposImpressao || [],
          tempoMontagem: data.tempoMontagem || 0,
          custoCalculado: data.custoCalculado || 0,
          precoSugerido: data.precoSugerido || 0,
          posicoesEstoque: posicoes,
          estoqueTotal,
          tipoProduto: 'peca'
        } as Peca;
      });

      const fetchedInsumos = insumosSnapshot.docs.map(doc => {
        const data = doc.data() as Insumo;
        const posicoes = data.posicoesEstoque || [];
        const estoqueTotal = posicoes.reduce((acc: number, pos: PosicaoEstoque) => acc + (pos.quantidade || 0), 0);
        return {
          id: doc.id,
          nome: data.nome || '',
          sku: data.nome || '',
          tipo: data.tipo || '',
          unidade: data.unidade || '',
          custoPorUnidade: data.custoPorUnidade || 0,
          posicoesEstoque: posicoes,
          estoqueMinimo: data.estoqueMinimo || 0,
          cor: data.cor || '',
          especificacoes: data.especificacoes || {},
          grupoFilamentoId: data.grupoFilamentoId || '',
          estoqueTotal,
          tipoProduto: 'insumo'
        } as Insumo;
      });

      const fetchedPartes = partesSnapshot.docs.map(doc => {
        const data = doc.data() as Parte;
        const posicoes = data.posicoesEstoque || [];
        const estoqueTotal = posicoes.reduce((acc: number, pos: PosicaoEstoque) => acc + (pos.quantidade || 0), 0);
        return {
          id: doc.id,
          sku: data.sku || '',
          nome: data.nome || '',
          quantidade: data.quantidade || 0,
          isNova: data.isNova || false,
          posicoesEstoque: posicoes,
          identificador: data.identificador || '',
          estoqueTotal,
          tipoProduto: 'parte'
        } as Parte;
      });

      const fetchedModelos = modelosSnapshot.docs.map(doc => {
        const data = doc.data() as Modelo;
        const posicoes = data.posicoesEstoque || [];
        const estoqueTotal = posicoes.reduce((acc: number, pos: PosicaoEstoque) => acc + (pos.quantidade || 0), 0);
        return {
          id: doc.id,
          sku: data.sku || '',
          nome: data.nome || '',
          pecas: data.pecas || [],
          tempoMontagem: data.tempoMontagem || 0,
          custoCalculado: data.custoCalculado || 0,
          precoSugerido: data.precoSugerido || 0,
          posicoesEstoque: posicoes,
          estoqueTotal,
          tipoProduto: 'modelo'
        } as Produto;
      });

      const fetchedKits = kitsSnapshot.docs.map(doc => {
        const data = doc.data() as Kit;
        const posicoes = data.posicoesEstoque || [];
        const estoqueTotal = posicoes.reduce((acc: number, pos: PosicaoEstoque) => acc + (pos.quantidade || 0), 0);
        return {
          id: doc.id,
          sku: data.sku || '',
          nome: data.nome || '',
          modelos: data.modelos || [],
          tempoMontagem: data.tempoMontagem || 0,
          custoCalculado: data.custoCalculado || 0,
          precoSugerido: data.precoSugerido || 0,
          posicoesEstoque: posicoes,
          estoqueTotal,
          tipoProduto: 'kit'
        } as Produto;
      });

      setPecas(fetchedPecas);
      setInsumos(fetchedInsumos);
      setPartes(fetchedPartes);
      setModelos(fetchedModelos);
      setKits(fetchedKits);

      setAllProducts([
        ...fetchedPecas,
        ...fetchedInsumos,
        ...fetchedPartes,
        ...fetchedModelos,
        ...fetchedKits,
      ] as Produto[]);

      setLocaisDeEstoque(locaisSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as LocalProduto[]);
      setRecipientes(recipientesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Recipiente[]);
      setGruposDeFilamento(gruposDeFilamentoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

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
    setSearchTerm(propSearchTerm);
  }, [propSearchTerm]);

  useEffect(() => {
    fetchAllData();
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

  const filteredPecas = pecas
    .filter(peca => {
      const pecaLocal = getLocalString(peca.posicoesEstoque || []);
      return (
        peca.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        peca.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pecaLocal.toLowerCase().includes(searchTerm.toLowerCase())
      );
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const openPecaModal = (peca: Peca | null = null) => {
    setPecaToEdit(peca);
    setIsPecaModalOpen(true);
  };

  const closePecaModal = () => {
    setIsPecaModalOpen(false);
    setPecaToEdit(null);
    fetchAllData();
  };

  const openServiceCostModal = () => setIsServiceCostModalOpen(true);
  const closeServiceCostModal = () => {
    setIsServiceCostModalOpen(false);
    fetchAllData();
  };

  const handleSavePeca = async (pecaData: Peca) => {
    try {
      let pecaDataComPartes = { ...pecaData };

      if (!pecaData.isComposta && pecaData.gruposImpressao.length > 0) {
        const gruposComPartesDefault = pecaData.gruposImpressao.map((grupo: GrupoImpressao) => {
          if (!grupo.partes || grupo.partes.length === 0) {
            return {
              ...grupo,
              partes: [{
                nome: pecaData.nome,
                identificador: '00',
                quantidade: 1,
                parteId: '',
              }]
            };
          }
          return grupo;
        });
        pecaDataComPartes = { ...pecaDataComPartes, gruposImpressao: gruposComPartesDefault };
      }

      const updatedGruposImpressao = await Promise.all(
        pecaDataComPartes.gruposImpressao.map(async (grupo: GrupoImpressao) => {
          const updatedPartes = await Promise.all(
            (grupo.partes || []).map(async (pecaParte: PecaParte) => {
              if (!pecaParte.parteId) {
                const novaParteData = {
                  nome: pecaParte.nome || '',
                  identificador: pecaParte.identificador || '',
                  sku: `${pecaData.sku}-${pecaParte.identificador || '00'}`,
                  estoque: 0,
                  local: 'Estoque Geral',
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                const addedParte = await addParte(novaParteData);
                return { ...pecaParte, parteId: addedParte.id };
              }
              return pecaParte;
            })
          );
          return { ...grupo, partes: updatedPartes };
        })
      );

      const pecaFinal = { ...pecaDataComPartes, gruposImpressao: updatedGruposImpressao };

      let totalFilamentCost = 0;
      let totalImpressionTime = 0;
      
      for (const grupo of pecaFinal.gruposImpressao) {
        totalImpressionTime += Number(grupo.tempoImpressao || 0);
        if (grupo.filamentos && Array.isArray(grupo.filamentos)) {
          for (const fil of grupo.filamentos) {
            if (fil.quantidade > 0 && fil.grupoFilamentoId) {
              const grupoDeFilamento = gruposDeFilamento.find(g => g.id === fil.grupoFilamentoId);
              if (grupoDeFilamento && grupoDeFilamento.custoMedioPonderado > 0) {
                totalFilamentCost += Number(fil.quantidade || 0) * grupoDeFilamento.custoMedioPonderado;
              } else {
                console.warn(`Grupo de filamento ${fil.grupoFilamentoId} não encontrado ou sem custo médio. O custo da peça pode estar incorreto.`);
              }
            }
          }
        }
      }

      const impressionCost = totalImpressionTime * Number(serviceCosts.custoPorMinutoImpressao || 0);
      const assemblyCost = Number(pecaFinal.tempoMontagem || 0) * Number(serviceCosts.custoPorMinutoMontagem || 0);
      
      pecaFinal.custoCalculado = totalFilamentCost + impressionCost + assemblyCost;

      if (pecaFinal.id) {
        await updatePeca(pecaFinal.id, pecaFinal);
      } else {
        await addPeca(pecaFinal);
      }

      closePecaModal();

    } catch (error) {
      console.error("Error saving peca: ", error);
      alert('Erro ao salvar a peça. Verifique o console para mais detalhes.');
    }
  };

  const handleDeletePeca = async (id: string | undefined) => {
    if (!id) return;
    if (window.confirm("Tem certeza que deseja deletar esta peça? Esta ação não pode ser desfeita.")) {
      try {
        await deletePeca(id);
        await fetchAllData();
        setSelectedPecas(prev => prev.filter(pecaId => pecaId !== id));
      } catch (error) {
        console.error("Error deleting peca: ", error);
      }
    }
  };

  const handleDeleteSelectedPecas = async () => {
    if (window.confirm(`Tem certeza que deseja deletar ${selectedPecas.length} peças selecionadas?`)) {
      try {
        await deletePecas(selectedPecas);
        await fetchAllData();
        setSelectedPecas([]);
      } catch (error) {
        console.error("Error deleting selected pecas: ", error);
      }
    }
  };

  const handleSelectPeca = (id: string | undefined) => {
    if (id) {
      setSelectedPecas(prev =>
        prev.includes(id) ? prev.filter(pecaId => pecaId !== id) : [...prev, id]
      );
    }
  };

  const handleSelectAllPecas = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedPecas(filteredPecas.map(p => p.id).filter((id): id is string => id !== undefined));
    } else {
      setSelectedPecas([]);
    }
  };

  const renderPecaCard = (peca: Peca) => {
    const totalTempoImpressao = peca.gruposImpressao?.reduce((acc: number, g: GrupoImpressao) => acc + (Number(g.tempoImpressao) || 0), 0) || 0;
    const totalFilamento = peca.gruposImpressao?.reduce((acc: number, g: GrupoImpressao) => {
      const filamentInGroup = Array.isArray(g.filamentos) ? g.filamentos.reduce((fAcc: number, f: PecaInsumo) => fAcc + (Number(f.quantidade) || 0), 0) : 0;
      return acc + filamentInGroup;
    }, 0) || 0;
    const totalTempoMontagem = Number(peca.tempoMontagem) || 0;
    const totalPartes = peca.gruposImpressao?.reduce((acc: number, g: GrupoImpressao) => {
        const partesInGroup = g.partes?.reduce((pAcc: number, p: PecaParte) => pAcc + (Number(p.quantidade) || 0), 0) || 0;
        return acc + partesInGroup;
    }, 0);

    return (
      <div key={peca.id} className={`bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow relative group ${peca.id && selectedPecas.includes(peca.id) ? 'ring-2 ring-blue-500' : ''}`}>
        <input
          type="checkbox"
          className="absolute top-2 left-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
          checked={!!peca.id && selectedPecas.includes(peca.id)}
          onChange={() => handleSelectPeca(peca.id)}
        />
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{peca.nome}</h3>
            <p className="text-sm text-gray-500">SKU: {peca.sku}</p>
          </div>
          <Puzzle className="h-8 w-8 text-purple-500" />
        </div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="text-sm text-gray-600">
              <strong>Partes:</strong>
            </div>
            <div className="text-xl font-semibold text-gray-900">{totalPartes}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {peca.gruposImpressao?.map((grupo: GrupoImpressao, groupIndex: number) => (
              <React.Fragment key={groupIndex}>
                <div className="flex flex-wrap gap-2">
                  {Array.isArray(grupo.filamentos) && grupo.filamentos.map((filamento: PecaInsumo, fIndex: number) => {
                    if (!filamento || !filamento.grupoFilamentoId) return null;
                    const grupoDeFilamento = gruposDeFilamento.find(g => g.id === filamento.grupoFilamentoId);
                    const colorName = grupoDeFilamento ? grupoDeFilamento.cor : 'Default';
                    const colorStyle = getColorStyle(colorName || 'Default');
                    const titleText = grupoDeFilamento?.nome || `Filamento desconhecido (ID: ${filamento.grupoFilamentoId})`;

                    return (
                      <div key={`${groupIndex}-${fIndex}`} title={titleText}>
                        <Spool
                          className="h-6 w-6"
                          style={{ color: colorStyle }}
                        />
                      </div>
                    );
                  })}
                </div>
                {peca.gruposImpressao && groupIndex < peca.gruposImpressao.length - 1 && (
                  <span className="text-gray-400 mx-1">|</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200 space-y-1 text-sm text-gray-600">
          <div><strong>Impressão:</strong> {totalTempoImpressao} min</div>
          <div><strong>Filamento:</strong> {totalFilamento.toFixed(2)} g</div>
          <div><strong>Montagem:</strong> {totalTempoMontagem} min</div>
          <div><strong>Custo:</strong> R$ {(peca.custoCalculado || 0).toFixed(2)}</div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={() => openPecaModal(peca)}
            className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
            title="Editar Peça"
          >
            <Edit className="h-5 w-5" />
          </button>
          <button
            onClick={() => handleDeletePeca(peca.id)}
            className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
            title="Deletar Peça"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  };

  const renderPecaListRow = (peca: Peca) => {
    const totalTempoImpressao = peca.gruposImpressao?.reduce((acc: number, g: GrupoImpressao) => acc + (Number(g.tempoImpressao) || 0), 0) || 0;
    const totalFilamento = peca.gruposImpressao?.reduce((acc: number, g: GrupoImpressao) => {
      const filamentInGroup = Array.isArray(g.filamentos) ? g.filamentos.reduce((fAcc: number, f: PecaInsumo) => fAcc + (Number(f.quantidade) || 0), 0) : 0;
      return acc + filamentInGroup;
    }, 0) || 0;
    const totalTempoMontagem = Number(peca.tempoMontagem) || 0;
    const totalPartes = peca.gruposImpressao?.reduce((acc: number, g: GrupoImpressao) => {
        const partesInGroup = g.partes?.reduce((pAcc: number, p: PecaParte) => pAcc + (Number(p.quantidade) || 0), 0) || 0;
        return acc + partesInGroup;
    }, 0);

    return (
      <tr key={peca.id} className={`hover:bg-gray-50 ${peca.id && selectedPecas.includes(peca.id) ? 'bg-blue-50' : ''}`}>
        <td className="px-6 py-4 whitespace-nowrap">
          <input
            type="checkbox"
            checked={!!peca.id && selectedPecas.includes(peca.id)}
            onChange={() => handleSelectPeca(peca.id)}
          />
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{peca.sku}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{peca.nome}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{peca.estoqueTotal || 0}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getLocalString(peca.posicoesEstoque || [])}</td>
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex items-center justify-end">
            <button
              onClick={() => openPecaModal(peca)}
              className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100"
              title="Editar Peça"
            >
              <Edit className="h-5 w-5" />
            </button>
          <button
            onClick={() => handleDeletePeca(peca.id)}
            className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 ml-2"
            title="Deletar Peça"
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
          onClick={() => openPecaModal()}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nova Peça
        </button>
        <PecaFormModal
          isOpen={isPecaModalOpen}
          onClose={closePecaModal}
          onSave={handleSavePeca}
          initialData={pecaToEdit}
          insumos={insumos}
        />
        <ServiceCostModal
          isOpen={isServiceCostModalOpen}
          onClose={closeServiceCostModal}
        />
        <EstoqueLancamentoModal
          isOpen={isEstoqueLancamentoModalOpen}
          onClose={() => {
            setIsEstoqueLancamentoModalOpen(false);
            setRecipienteToEdit(null);
            setLocalToEdit(null);
            fetchAllData(); // Refresh data after stock launch
          }}
          onLancamentoSuccess={() => {
            console.log("Lançamento de estoque bem-sucedido!");
            // Additional success logic if needed
          }}
          initialTipoProduto="peca"
          recipiente={recipienteToEdit}
          local={localToEdit as any}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">
          Estoque de Peças ({filteredPecas.length})
        </h3>
        <div className="flex items-center space-x-4">
          {selectedPecas.length > 0 && (
            <button
              onClick={handleDeleteSelectedPecas}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Deletar Selecionadas ({selectedPecas.length})
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
      {filteredPecas.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 px-6 py-4">
            {filteredPecas.map(renderPecaCard)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      onChange={handleSelectAllPecas}
                      checked={selectedPecas.length === filteredPecas.length && filteredPecas.length > 0}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estoque</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Local</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPecas.map(renderPecaListRow)}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="bg-white shadow rounded-lg p-12">
          <div className="text-center">
            <Puzzle className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhuma peça encontrada</h3>
            <p className="mt-1 text-sm text-gray-500">
              Tente ajustar o termo de busca ou criar uma nova peça.
            </p>
          </div>
        </div>
      )}

      <PecaFormModal
        isOpen={isPecaModalOpen}
        onClose={closePecaModal}
        onSave={handleSavePeca}
        initialData={pecaToEdit}
        insumos={insumos}
      />
      <ServiceCostModal
        isOpen={isServiceCostModalOpen}
        onClose={closeServiceCostModal}
      />
      <EstoqueLancamentoModal
        isOpen={isEstoqueLancamentoModalOpen}
        onClose={() => {
          setIsEstoqueLancamentoModalOpen(false);
          setRecipienteToEdit(null);
          setLocalToEdit(null);
          fetchAllData(); // Refresh data after stock launch
        }}
        onLancamentoSuccess={() => {
          console.log("Lançamento de estoque bem-sucedido!");
          // Additional success logic if needed
        }}
        initialTipoProduto="peca"
        recipiente={recipienteToEdit}
        local={localToEdit}
      />
    </div>
  );
}
