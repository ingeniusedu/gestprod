"use client";

import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Trash2 } from 'lucide-react';
import { db } from '../services/firebase'; // Import db
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'; // Import Firestore functions
import PecaSelectionModal from './PecaSelectionModal'; // Import the new modal
import ModeloSelectionModal from './ModeloSelectionModal'; // Import the new modal

const ProdutoFormModal = ({ isOpen, onClose, onSave, initialData }) => {
  const [tipoProduto, setTipoProduto] = useState('peca'); // 'peca', 'modelo', 'kit'
  const [nome, setNome] = useState('');
  const [sku, setSku] = useState('');
  const [custoCalculado, setCustoCalculado] = useState('');
  const [precoSugerido, setPrecoSugerido] = useState('');
  const [tempoImpressao, setTempoImpressao] = useState('');
  const [tempoMontagem, setTempoMontagem] = useState('');
  const [descricaoMontagem, setDescricaoMontagem] = useState(''); // New field
  const [isPecaComposta, setIsPecaComposta] = useState(false); // New field
  const [gruposImpressao, setGruposImpressao] = useState([]); // New field for composed parts
  const [pecas, setPecas] = useState([]); // For modelos, now stores detailed peca objects
  const [modelos, setModelos] = useState([]); // For kits, now stores detailed modelo objects
  const [insumos, setInsumos] = useState([]); // For pecas, now includes insumoId and type
  const [availableFilaments, setAvailableFilaments] = useState([]); // State to store fetched filaments
  const [availableOtherInsumos, setAvailableOtherInsumos] = useState([]); // State to store fetched other insumos
  const [isPecaSelectionModalOpen, setIsPecaSelectionModalOpen] = useState(false); // State for PecaSelectionModal
  const [isModeloSelectionModalOpen, setIsModeloSelectionModalOpen] = useState(false); // State for ModeloSelectionModal
  const [calculatedTempoImpressao, setCalculatedTempoImpressao] = useState(0);
  const [calculatedQuantidadeFilamento, setCalculatedQuantidadeFilamento] = useState(0);

  useEffect(() => {
    const fetchAvailableInsumos = async () => {
      try {
        const insumosCollection = collection(db, 'insumos');
        const insumoSnapshot = await getDocs(insumosCollection);
        const insumosList = insumoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAvailableFilaments(insumosList.filter(i => i.tipo === 'filamento'));
        setAvailableOtherInsumos(insumosList.filter(i => i.tipo !== 'filamento'));
      } catch (error) {
        console.error("Error fetching available insumos: ", error);
      }
    };

    if (isOpen) {
      fetchAvailableInsumos();
    }
  }, [isOpen]);

  const fetchPecaDetails = async (pecaId) => {
    try {
      const pecaDocRef = doc(db, 'pecas', pecaId);
      const pecaDocSnap = await getDoc(pecaDocRef);
      if (pecaDocSnap.exists()) {
        return { id: pecaDocSnap.id, ...pecaDocSnap.data() };
      } else {
        console.warn(`Peca with ID ${pecaId} not found.`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching details for peca ${pecaId}:`, error);
      return null;
    }
  };

  const fetchModeloDetails = async (modeloId) => {
    if (!modeloId) {
      console.error("fetchModeloDetails called with undefined or null modeloId.");
      return null;
    }
    try {
      const modeloDocRef = doc(db, 'modelos', modeloId);
      const modeloDocSnap = await getDoc(modeloDocRef);
      if (modeloDocSnap.exists()) {
        return { id: modeloDocSnap.id, ...modeloDocSnap.data() };
      } else {
        console.warn(`Modelo with ID ${modeloId} not found.`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching details for modelo ${modeloId}:`, error);
      return null;
    }
  };

  useEffect(() => {
    if (isOpen && initialData && availableFilaments.length > 0) {
      setTipoProduto(initialData.tipo || 'peca');
      setNome(initialData.nome || '');
      setSku(initialData.sku || '');
      setCustoCalculado(initialData.custoCalculado || '');
      setPrecoSugerido(initialData.precoSugerido || '');
      setTempoImpressao(initialData.tempoImpressao || '');
      setTempoMontagem(initialData.tempoMontagem || '');
      setDescricaoMontagem(initialData.descricaoMontagem || ''); // New field
      setIsPecaComposta(initialData.isPecaComposta || false); // New field
      setGruposImpressao((initialData.gruposImpressao || []).map(grupo => ({
        ...grupo,
        filamentos: (grupo.filamentos || []).map(filamento => {
          const selectedFilament = availableFilaments.find(f => f.id === filamento.filamentoId);
          return {
            ...filamento,
            nome: selectedFilament ? selectedFilament.nome : '',
            isAlternative: filamento.isAlternative || false,
            alternativeFilaments: (filamento.alternativeFilaments || []).map(altF => {
              const selectedAltFilament = availableFilaments.find(f => f.id === altF.filamentoId);
              return {
                ...altF,
                nome: selectedAltFilament ? selectedAltFilament.nome : '',
                tempId: altF.tempId || Date.now() + Math.random(), // Ensure tempId is present
              };
            })
          };
        })
      })) || []);

      if (initialData.pecas) {
        // Fetch full details for initial pecas if they are for a 'modelo'
        const loadInitialPecas = async () => {
          const detailedPecas = await Promise.all(initialData.pecas.map(async (p) => {
            const details = await fetchPecaDetails(p.id);
            return details ? { ...p, ...details, quantity: parseFloat(p.quantidade) || 0 } : { ...p, quantity: parseFloat(p.quantidade) || 0 };
          }));
          setPecas(detailedPecas.filter(Boolean));
        };
        loadInitialPecas();
      } else {
        setPecas([]);
      }
      if (initialData.modelos) {
        // Fetch full details for initial modelos if they are for a 'kit'
        const loadInitialModelos = async () => {
          console.log("InitialData.modelos before filter and map:", initialData.modelos);
          const detailedModelos = await Promise.all(initialData.modelos
            .filter(m => m && m.id) // Ensure 'm' is not null/undefined AND has an 'id'
            .map(async (m) => {
              const details = await fetchModeloDetails(m.id);
              return details ? { ...m, ...details, quantity: parseFloat(m.quantidade) || 0 } : { ...m, quantity: parseFloat(m.quantidade) || 0 };
            }));
          setModelos(detailedModelos.filter(Boolean));
        };
        loadInitialModelos();
      } else {
        setModelos([]);
      }
      if (initialData.insumos) {
        setInsumos(initialData.insumos.map(i => {
          const selectedFilament = availableFilaments.find(f => f.id === i.insumoId);
          return {
            insumoId: i.insumoId || '',
            nome: selectedFilament ? selectedFilament.nome : '',
            quantity: i.quantidade,
            tipo: i.tipo || '',
            isAlternative: i.isAlternative || false,
            alternativeFilaments: (i.alternativeFilaments || []).map(altF => {
              const selectedAltFilament = availableFilaments.find(f => f.id === altF.filamentoId);
              return {
                filamentoId: altF.filamentoId,
                nome: selectedAltFilament ? selectedAltFilament.nome : '',
                isAlternative: true,
                tempId: altF.tempId || Date.now() + Math.random(), // Ensure tempId is present
              };
            }),
            tempId: i.tempId || Date.now() + Math.random()
          };
        }));
      } else {
        setInsumos([]);
      }
    } else if (isOpen && !initialData) {
      // Reset form for new product
      setTipoProduto('peca');
      setNome('');
      setSku('');
      setCustoCalculado('');
      setPrecoSugerido('');
      setTempoImpressao('');
      setTempoMontagem('');
      setDescricaoMontagem(''); // Reset new field
      setIsPecaComposta(false); // Reset new field
      setGruposImpressao([]); // Reset new field
      setPecas([]); // Reset pecas
      setModelos([]); // Reset modelos
      setInsumos([]);
      setCalculatedTempoImpressao(0);
      setCalculatedQuantidadeFilamento(0);
    }
  }, [isOpen, initialData, availableFilaments]); // Added availableFilaments to dependency array

  useEffect(() => {
    const calculateModelMetrics = () => {
      let totalTempo = 0;
      let totalFilamento = 0;

      pecas.forEach(peca => {
        const quantity = parseFloat(peca.quantity) || 0;

        if (peca.tipo === 'peca') {
          if (peca.isPecaComposta) {
            // Sum tempoImpressaoGrupo and filamentos from gruposImpressao for composite parts
            (peca.gruposImpressao || []).forEach(grupo => {
              totalTempo += (parseFloat(grupo.tempoImpressaoGrupo) || 0) * quantity;
              (grupo.filamentos || []).forEach(filamento => {
                totalFilamento += (parseFloat(filamento.quantidade) || 0) * quantity;
              });
            });
          } else {
            // Sum tempoImpressao and insumos for simple parts
            totalTempo += (parseFloat(peca.tempoImpressao) || 0) * quantity;
            (peca.insumos || []).forEach(insumo => {
              if (insumo.tipo === 'filamento') {
                totalFilamento += (parseFloat(insumo.quantidade) || 0) * quantity;
              }
            });
          }
        }
      });

      setCalculatedTempoImpressao(totalTempo);
      setCalculatedQuantidadeFilamento(totalFilamento);
    };

    if (tipoProduto === 'modelo') {
      calculateModelMetrics();
    }
  }, [pecas, tipoProduto]);

  useEffect(() => {
    const calculateKitCost = () => {
      let totalCusto = 0;
      modelos.forEach(modelo => {
        const quantity = parseFloat(modelo.quantity) || 0;
        const custo = parseFloat(modelo.custoCalculado) || 0;
        totalCusto += custo * quantity;
      });
      setCustoCalculado(totalCusto.toFixed(2));
    };

    if (tipoProduto === 'kit') {
      calculateKitCost();
    }
  }, [modelos, tipoProduto]);

  const handleAddGrupoImpressao = () => {
    setGruposImpressao([...gruposImpressao, { filamentos: [], tempoImpressaoGrupo: '', partes: [{ nome: '', quantidade: '' }] }]);
  };

  const handleAddFilamentoToGrupo = (grupoIndex, filamentoId, isAlternative = false, parentFilamentTempId = null) => {
    const selectedFilament = availableFilaments.find(i => i.id === filamentoId);
    if (selectedFilament) {
      const newFilamentEntry = {
        filamentoId: filamentoId,
        nome: selectedFilament.nome,
        quantidade: '',
        isAlternative: isAlternative,
        alternativeFilaments: [], // Initialize alternativeFilaments array
        tempId: Date.now() + Math.random() // Unique ID for React key and removal
      };

      const newGrupos = [...gruposImpressao];
      if (parentFilamentTempId) {
        // Add as an alternative filament to a specific parent filament
        newGrupos[grupoIndex].filamentos = newGrupos[grupoIndex].filamentos.map(filamento => {
          if (filamento.tempId === parentFilamentTempId) {
            return {
              ...filamento,
              alternativeFilaments: [...filamento.alternativeFilaments, newFilamentEntry]
            };
          }
          return filamento;
        });
      } else {
        // Add as a primary filament
        newGrupos[grupoIndex].filamentos.push(newFilamentEntry);
      }
      setGruposImpressao(newGrupos);
    }
  };

  const handleRemoveGrupoImpressao = (index) => {
    const newGrupos = gruposImpressao.filter((_, i) => i !== index);
    setGruposImpressao(newGrupos);
  };

  const handleGrupoImpressaoChange = (index, field, value) => {
    const newGrupos = [...gruposImpressao];
    newGrupos[index][field] = value;
    setGruposImpressao(newGrupos);
  };

  const handleRemoveFilamentoFromGrupo = (grupoIndex, filamentoTempIdToRemove, isAlternative = false, parentFilamentTempId = null) => {
    const newGrupos = [...gruposImpressao];
    if (isAlternative && parentFilamentTempId) {
      newGrupos[grupoIndex].filamentos = newGrupos[grupoIndex].filamentos.map(filamento => {
        if (filamento.tempId === parentFilamentTempId) {
          return {
            ...filamento,
            alternativeFilaments: filamento.alternativeFilaments.filter(f => f.tempId !== filamentoTempIdToRemove)
          };
        }
        return filamento;
      });
    } else {
      newGrupos[grupoIndex].filamentos = newGrupos[grupoIndex].filamentos.filter(f => f.tempId !== filamentoTempIdToRemove);
    }
    setGruposImpressao(newGrupos);
  };

  const handleFilamentoChangeInGrupo = (grupoIndex, filamentoTempIdToUpdate, field, value, isAlternative = false, parentFilamentTempId = null) => {
    const newGrupos = [...gruposImpressao];
    if (isAlternative && parentFilamentTempId) {
      newGrupos[grupoIndex].filamentos = newGrupos[grupoIndex].filamentos.map(filamento => {
        if (filamento.tempId === parentFilamentTempId) {
          return {
            ...filamento,
            alternativeFilaments: filamento.alternativeFilaments.map(altFilament => {
              if (altFilament.tempId === filamentoTempIdToUpdate) {
                if (field === 'filamentoId') {
                  const selectedFilamento = availableFilaments.find(i => i.id === value);
                  return {
                    ...altFilament,
                    filamentoId: value,
                    nome: selectedFilamento ? selectedFilamento.nome : '',
                  };
                } else {
                  return {
                    ...altFilament,
                    [field]: value,
                  };
                }
              }
              return altFilament;
            })
          };
        }
        return filamento;
      });
    } else {
      newGrupos[grupoIndex].filamentos = newGrupos[grupoIndex].filamentos.map(filamento => {
        if (filamento.tempId === filamentoTempIdToUpdate) {
          if (field === 'filamentoId') {
            const selectedFilamento = availableFilaments.find(i => i.id === value);
            return {
              ...filamento,
              filamentoId: value,
              nome: selectedFilamento ? selectedFilamento.nome : '', // Store name for display
            };
          } else {
            return {
              ...filamento,
              [field]: value,
            };
          }
        }
        return filamento;
      });
    }
    setGruposImpressao(newGrupos);
  };

  const handleAddParte = (grupoIndex) => {
    const newGrupos = [...gruposImpressao];
    newGrupos[grupoIndex].partes.push({ nome: '', quantidade: '', skuParte: '', estoque: 0 }); // Add skuParte and estoque
    setGruposImpressao(newGrupos);
  };

  const handleRemoveParte = (grupoIndex, parteIndex) => {
    const newGrupos = [...gruposImpressao];
    newGrupos[grupoIndex].partes = newGrupos[grupoIndex].partes.filter((_, i) => i !== parteIndex);
    setGruposImpressao(newGrupos);
  };

  const handleParteChange = (grupoIndex, parteIndex, field, value) => {
    const newGrupos = [...gruposImpressao];
    if (field === 'skuParte') {
      // When the derivative part of the SKU is changed, construct the full SKU
      newGrupos[grupoIndex].partes[parteIndex][field] = `${sku}-${value}`;
    } else {
      newGrupos[grupoIndex].partes[parteIndex][field] = value;
    }
    setGruposImpressao(newGrupos);
  };

  const handleOpenPecaSelectionModal = () => {
    setIsPecaSelectionModalOpen(true);
  };

  const handleClosePecaSelectionModal = () => {
    setIsPecaSelectionModalOpen(false);
  };

  const handleSelectPecas = async (selectedItems) => {
    const updatedPecas = [...pecas];
    const newPecasToFetch = [];

    selectedItems.forEach(newItem => {
      const existingIndex = updatedPecas.findIndex(p => p.id === newItem.id);
      if (existingIndex > -1) {
        updatedPecas[existingIndex].quantity = parseFloat(newItem.quantity) || 0;
      } else {
        newPecasToFetch.push({ ...newItem, quantity: parseFloat(newItem.quantity) || 0 });
      }
    });

    const fetchedNewPecas = await Promise.all(newPecasToFetch.map(async (p) => {
      const details = await fetchPecaDetails(p.id);
      return details ? { ...p, ...details } : null;
    }));

    setPecas([...updatedPecas, ...fetchedNewPecas.filter(Boolean)]);
  };

  const handleRemovePeca = (pecaIdToRemove) => {
    setPecas(prev => prev.filter(peca => peca.id !== pecaIdToRemove));
  };

  const handlePecaQuantityChange = (pecaId, quantity) => {
    setPecas(prev => prev.map(peca =>
      peca.id === pecaId ? { ...peca, quantity: parseFloat(quantity) || 0 } : peca
    ));
  };

  const handleOpenModeloSelectionModal = () => {
    setIsModeloSelectionModalOpen(true);
  };

  const handleCloseModeloSelectionModal = () => {
    setIsModeloSelectionModalOpen(false);
  };

  const handleSelectModelos = async (selectedItems) => {
    const updatedModelos = [...modelos];
    const newModelosToFetch = [];

    selectedItems.forEach(newItem => {
      const existingIndex = updatedModelos.findIndex(m => m.id === newItem.id);
      if (existingIndex > -1) {
        updatedModelos[existingIndex].quantity = parseFloat(newItem.quantity) || 0;
      } else {
        newModelosToFetch.push({ ...newItem, quantity: parseFloat(newItem.quantity) || 0 });
      }
    });

    const fetchedNewModelos = await Promise.all(newModelosToFetch.map(async (m) => {
      const details = await fetchModeloDetails(m.id);
      return details ? { ...m, ...details } : null;
    }));

    setModelos([...updatedModelos, ...fetchedNewModelos.filter(Boolean)]);
  };

  const handleRemoveModelo = (modeloIdToRemove) => {
    setModelos(prev => prev.filter(modelo => modelo.id !== modeloIdToRemove));
  };

  const handleModeloQuantityChange = (modeloId, quantity) => {
    setModelos(prev => prev.map(modelo =>
      modelo.id === modeloId ? { ...modelo, quantity: parseFloat(quantity) || 0 } : modelo
    ));
  };

  const handleAddInsumo = (type, selectedId = '', isAlternative = false, parentInsumoTempId = null) => {
    if (type === 'filamento' && selectedId) {
      const selectedFilament = availableFilaments.find(f => f.id === selectedId);
      if (selectedFilament) {
        const newInsumoEntry = {
          filamentoId: selectedId, // Use filamentoId for alternative filaments
          insumoId: selectedId,
          nome: selectedFilament.nome,
          quantity: '',
          tipo: type,
          isAlternative: isAlternative,
          alternativeFilaments: [],
          tempId: Date.now() + Math.random()
        };

        if (parentInsumoTempId) {
          setInsumos(prev => prev.map(insumo => {
            if (insumo.tempId === parentInsumoTempId) {
              return {
                ...insumo,
                alternativeFilaments: [...insumo.alternativeFilaments, newInsumoEntry]
              };
            }
            return insumo;
          }));
        } else {
          setInsumos(prev => [...prev, newInsumoEntry]);
        }
      }
    } else if (type !== 'filamento') {
      setInsumos(prev => [...prev, { insumoId: '', nome: '', quantity: '', tipo: type, tempId: Date.now() + Math.random() }]);
    }
  };

  const handleRemoveInsumo = (tempIdToRemove, isAlternative = false, parentInsumoTempId = null) => {
    if (isAlternative && parentInsumoTempId) {
      setInsumos(prev => prev.map(insumo => {
        if (insumo.tempId === parentInsumoTempId) {
          return {
            ...insumo,
            alternativeFilaments: insumo.alternativeFilaments.filter(f => f.tempId !== tempIdToRemove)
          };
        }
        return insumo;
      }));
    } else {
      setInsumos(prev => prev.filter(insumo => insumo.tempId !== tempIdToRemove));
    }
  };

  const handleInsumoChange = (tempIdToUpdate, field, value, insumoType, isAlternative = false, parentInsumoTempId = null) => {
    setInsumos(prev => prev.map(insumo => {
      if (isAlternative && parentInsumoTempId && insumo.tempId === parentInsumoTempId) {
        return {
          ...insumo,
          alternativeFilaments: insumo.alternativeFilaments.map(altFilament => {
            if (altFilament.tempId === tempIdToUpdate) {
              if (field === 'insumoId') {
                const selectedInsumo = availableFilaments.find(i => i.id === value);
                return {
                  ...altFilament,
                  insumoId: value,
                  nome: selectedInsumo ? selectedInsumo.nome : '',
                };
              } else {
                return {
                  ...altFilament,
                  [field]: value,
                };
              }
            }
            return altFilament;
          })
        };
      } else if (insumo.tempId === tempIdToUpdate && !isAlternative) {
        if (field === 'insumoId') {
          const sourceList = insumoType === 'filamento' ? availableFilaments : availableOtherInsumos;
          const selectedInsumo = sourceList.find(i => i.id === value);
          return {
            ...insumo,
            insumoId: value,
            nome: selectedInsumo ? selectedInsumo.nome : '',
            tipo: insumoType,
          };
        } else {
          return {
            ...insumo,
            [field]: value,
          };
        }
      }
      return insumo;
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const produtoData = {
      tipo: tipoProduto,
      nome,
      sku,
      custoCalculado: parseFloat(custoCalculado) || 0,
      precoSugerido: parseFloat(precoSugerido) || 0,
      tempoImpressao: parseFloat(tempoImpressao) || 0,
      tempoMontagem: parseFloat(tempoMontagem) || 0,
      descricaoMontagem: descricaoMontagem, // New field
      isPecaComposta: isPecaComposta, // New field
    };

    if (initialData?.id) {
      produtoData.id = initialData.id;
    }

    if (tipoProduto === 'peca') {
      if (isPecaComposta) {
        produtoData.gruposImpressao = gruposImpressao.map(grupo => ({
          filamentos: grupo.filamentos.filter(f => f.filamentoId && f.quantidade).map(f => ({
            filamentoId: f.filamentoId,
            nome: f.nome,
            quantidade: parseFloat(f.quantidade) || 0,
            isAlternative: f.isAlternative || false,
            alternativeFilaments: (f.alternativeFilaments || []).filter(altF => altF.filamentoId).map(altF => ({
              filamentoId: altF.filamentoId,
              nome: altF.nome,
              isAlternative: true, // Ensure alternative filaments are marked as such
            }))
          })),
          tempoImpressaoGrupo: parseFloat(grupo.tempoImpressaoGrupo) || 0,
          partes: grupo.partes.filter(p => p.nome && p.quantidade).map(p => ({
            nome: p.nome,
            quantidade: parseFloat(p.quantidade) || 0,
            skuParte: p.skuParte || '',
            estoque: parseFloat(p.estoque) || 0
          }))
        }));
      } else {
        produtoData.insumos = insumos.filter(i => i.insumoId && i.quantity).map(i => ({
          insumoId: i.insumoId,
          nome: i.nome,
          quantidade: parseFloat(i.quantity),
          tipo: i.tipo,
          isAlternative: i.isAlternative || false,
          alternativeFilaments: (i.alternativeFilaments || []).filter(altF => altF.filamentoId).map(altF => ({
            filamentoId: altF.filamentoId,
            nome: altF.nome,
            isAlternative: true,
          }))
        }));
      }
    } else if (tipoProduto === 'modelo') {
      produtoData.pecas = pecas.filter(p => p.id && p.quantity).map(p => ({
        id: p.id,
        nome: p.nome,
        sku: p.sku,
        quantidade: parseFloat(p.quantity)
      }));
      produtoData.tempoImpressao = calculatedTempoImpressao;
      produtoData.quantidadeFilamento = calculatedQuantidadeFilamento;
    } else if (tipoProduto === 'kit') {
      produtoData.modelos = modelos.filter(m => m.id && m.quantity).map(m => ({
        id: m.id,
        nome: m.nome,
        quantidade: parseFloat(m.quantity)
      }));
    }

    if (tipoProduto === 'peca') {
      // tempoMontagem and descricaoMontagem should always be saved for 'peca' type
      produtoData.tempoMontagem = parseFloat(tempoMontagem) || 0;
      produtoData.descricaoMontagem = descricaoMontagem;
    }

    onSave(produtoData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 h-full w-full z-50 flex justify-center items-center">
      <div className="relative bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-900">
            {initialData ? 'Editar Produto' : 'Novo Produto'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          <form id="produto-form" onSubmit={handleSubmit} className="mt-6 space-y-6">
            {/* Tipo de Produto */}
            <div>
              <label htmlFor="tipoProduto" className="block text-sm font-medium text-gray-700">
                Tipo de Produto
              </label>
              <select
                id="tipoProduto"
                name="tipoProduto"
                value={tipoProduto}
                onChange={(e) => setTipoProduto(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="peca">Peça</option>
                <option value="modelo">Modelo</option>
                <option value="kit">Kit</option>
              </select>
            </div>

            {/* Campos Comuns */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-2">
                <label htmlFor="sku" className="block text-sm font-medium text-gray-700">
                  SKU
                </label>
                <input
                  type="text"
                  id="sku"
                  name="sku"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  maxLength="12"
                  required
                />
              </div>
              <div className="col-span-10">
                <label htmlFor="nome" className="block text-sm font-medium text-gray-700">
                  Nome
                </label>
                <input
                  type="text"
                  id="nome"
                  name="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="custoCalculado" className="block text-sm font-medium text-gray-700">
                  Custo Calculado (R$)
                </label>
                <input
                  type="number"
                  id="custoCalculado"
                  name="custoCalculado"
                  value={custoCalculado}
                  onChange={(e) => setCustoCalculado(e.target.value)}
                  className={`mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${tipoProduto === 'kit' ? 'bg-gray-50 text-gray-900' : ''}`}
                  step="0.01"
                  readOnly={tipoProduto === 'kit'}
                />
              </div>
              <div>
                <label htmlFor="precoSugerido" className="block text-sm font-medium text-gray-700">
                  Preço Sugerido (R$)
                </label>
                <input
                  type="number"
                  id="precoSugerido"
                  name="precoSugerido"
                  value={precoSugerido}
                  onChange={(e) => setPrecoSugerido(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  step="0.01"
                />
              </div>
            </div>

            {/* Checkbox Peça Composta */}
            {tipoProduto === 'peca' && (
              <div className="flex items-center mt-4">
                <input
                  type="checkbox"
                  id="isPecaComposta"
                  name="isPecaComposta"
                  checked={isPecaComposta}
                  onChange={(e) => setIsPecaComposta(e.target.checked)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="isPecaComposta" className="ml-2 block text-sm font-medium text-gray-700">
                  Peça Composta
                </label>
              </div>
            )}

            {/* Campos Específicos por Tipo de Produto */}
            {tipoProduto === 'peca' && isPecaComposta && (
              <>
                <div className="space-y-6">
                  <h4 className="text-lg font-medium text-gray-900">Grupos de Impressão</h4>
                  {gruposImpressao.map((grupo, grupoIndex) => (
                    <div key={grupoIndex} className="border border-gray-200 p-4 rounded-md space-y-4">
                      <div className="flex justify-between items-center">
                        <h5 className="text-md font-medium text-gray-800">Grupo {grupoIndex + 1}</h5>
                        {gruposImpressao.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveGrupoImpressao(grupoIndex)}
                            className="p-1 text-red-600 hover:text-red-900"
                          >
                            <Minus className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                      {/* Filamentos do Grupo */}
                      <div className="space-y-2">
                        <h6 className="text-md font-medium text-gray-700">Filamentos do Grupo</h6>
                        <div className="flex items-end space-x-2 mb-4">
                          <div className="flex-grow">
                            <label htmlFor={`grupo-${grupoIndex}-select-filamento`} className="block text-sm font-medium text-gray-700">
                              Selecione um Filamento
                            </label>
                            <select
                              id={`grupo-${grupoIndex}-select-filamento`}
                              value="" // This will be reset after selection
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleAddFilamentoToGrupo(grupoIndex, e.target.value);
                                  e.target.value = ""; // Reset the select input
                                }
                              }}
                              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                            >
                              <option value="">Adicionar Filamento ao Grupo</option>
                              {availableFilaments.map(availInsumo => (
                                <option key={availInsumo.id} value={availInsumo.id}>
                                  {availInsumo.nome}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Filamento
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Quantidade (g)
                                </th>
                                                  <th scope="col" className="relative px-6 py-3">
                                                    <span className="sr-only">Remover</span>
                                                  </th>
                                                </tr>
                                              </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {grupo.filamentos.map((filamento) => {
                                const selectedFilament = availableFilaments.find(f => f.id === filamento.filamentoId);
                                return (
                                  <React.Fragment key={filamento.tempId}>
                                    <tr>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        {selectedFilament ? `${selectedFilament.especificacoes?.fabricante} ${selectedFilament.especificacoes?.material} ${selectedFilament.especificacoes?.tipoFilamento}` : 'Filamento não encontrado'}
                                        {selectedFilament && (
                                          <p className="text-xs text-gray-500 mt-1">Cor: {selectedFilament.cor}</p>
                                        )}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <input
                                          type="number"
                                          id={`grupo-${grupoIndex}-filamento-${filamento.tempId}-quantidade`}
                                          value={filamento.quantidade}
                                          onChange={(e) => handleFilamentoChangeInGrupo(grupoIndex, filamento.tempId, 'quantidade', e.target.value)}
                                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                          step="0.01"
                                        />
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <input
                                          type="checkbox"
                                          id={`grupo-${grupoIndex}-filamento-${filamento.tempId}-isAlternative`}
                                          checked={filamento.isAlternative}
                                          onChange={(e) => handleFilamentoChangeInGrupo(grupoIndex, filamento.tempId, 'isAlternative', e.target.checked)}
                                          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                        />
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveFilamentoFromGrupo(grupoIndex, filamento.tempId)}
                                          className="text-red-600 hover:text-red-900"
                                        >
                                          <Trash2 className="h-5 w-5" />
                                        </button>
                                      </td>
                                    </tr>{filamento.isAlternative && (
                                      <tr key={`${filamento.tempId}-alt-section`}>
                                        <td colSpan="5" className="px-6 py-2 bg-gray-100">
                                          <div className="ml-4 space-y-2">
                                            <h6 className="text-sm font-medium text-gray-700">Filamentos Alternativos:</h6> {/* Changed h7 to h6 */}
                                            <div className="flex items-end space-x-2 mb-2">
                                              <div className="flex-grow">
                                                <select
                                                  value=""
                                                  onChange={(e) => {
                                                    if (e.target.value) {
                                                      handleAddFilamentoToGrupo(grupoIndex, e.target.value, true, filamento.tempId);
                                                      e.target.value = "";
                                                    }
                                                  }}
                                                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                                >
                                                  <option value="">Adicionar Filamento Alternativo</option>
                                                  {availableFilaments.map(availInsumo => (
                                                    <option key={availInsumo.id} value={availInsumo.id}>
                                                      {availInsumo.nome}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                            </div>
                                            <table className="min-w-full divide-y divide-gray-200">
                                              <thead className="bg-gray-50">
                                                <tr>
                                                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Filamento Alternativo
                                                  </th>
                                                  <th scope="col" className="relative px-6 py-3">
                                                    <span className="sr-only">Remover</span>
                                                  </th>
                                                </tr>
                                              </thead>
                                              <tbody className="bg-white divide-y divide-gray-200">
                                                {filamento.alternativeFilaments.map(altFilament => {
                                                  const selectedAltFilament = availableFilaments.find(f => f.id === altFilament.filamentoId);
                                                  return (
                                                    <tr key={altFilament.tempId}>
                                                      <td className="px-6 py-4 whitespace-nowrap">
                                                        {selectedAltFilament ? `${selectedAltFilament.especificacoes?.fabricante} ${selectedAltFilament.especificacoes?.material} ${selectedAltFilament.especificacoes?.tipoFilamento}` : 'Filamento não encontrado'}
                                                        {selectedAltFilament && (
                                                          <p className="text-xs text-gray-500 mt-1">Cor: {selectedAltFilament.cor}</p>
                                                        )}
                                                      </td>
                                                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                        <button
                                                          type="button"
                                                          onClick={() => handleRemoveFilamentoFromGrupo(grupoIndex, altFilament.tempId, true, filamento.tempId)}
                                                          className="text-red-600 hover:text-red-900"
                                                        >
                                                          <Trash2 className="h-5 w-5" />
                                                        </button>
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Tempo de Impressão do Grupo */}
                      <div>
                        <label htmlFor={`grupo-${grupoIndex}-tempo-impressao`} className="block text-sm font-medium text-gray-700">
                          Impressão Grupo (minutos)
                        </label>
                        <input
                          type="number"
                          id={`grupo-${grupoIndex}-tempo-impressao`}
                          value={grupo.tempoImpressaoGrupo}
                          onChange={(e) => handleGrupoImpressaoChange(grupoIndex, 'tempoImpressaoGrupo', e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          step="1"
                        />
                      </div>

                      <div className="space-y-2 mt-4">
                        <h6 className="text-md font-medium text-gray-700">Partes do Grupo</h6>
                        {grupo.partes.map((parte, parteIndex) => (
                          <div key={parteIndex} className="flex items-end space-x-2">
                            <div className="flex-grow">
                              <label htmlFor={`grupo-${grupoIndex}-parte-${parteIndex}-nome`} className="block text-sm font-medium text-gray-700">
                                Nome da Parte
                              </label>
                              <input
                                type="text"
                                id={`grupo-${grupoIndex}-parte-${parteIndex}-nome`}
                                value={parte.nome}
                                onChange={(e) => handleParteChange(grupoIndex, parteIndex, 'nome', e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                              />
                            </div>
                            <div className="w-24"> {/* Adjusted width for 4 digits */}
                              <label htmlFor={`grupo-${grupoIndex}-parte-${parteIndex}-quantidade`} className="block text-sm font-medium text-gray-700">
                                Qtd. Necessária
                              </label>
                              <input
                                type="number"
                                id={`grupo-${grupoIndex}-parte-${parteIndex}-quantidade`}
                                value={parte.quantidade}
                                onChange={(e) => handleParteChange(grupoIndex, parteIndex, 'quantidade', e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                step="1"
                              />
                            </div>
                            <div className="w-24"> {/* Adjusted width for 4 digits */}
                              <label htmlFor={`grupo-${grupoIndex}-parte-${parteIndex}-estoque`} className="block text-sm font-medium text-gray-700">
                                Estoque
                              </label>
                              <input
                                type="number"
                                id={`grupo-${grupoIndex}-parte-${parteIndex}-estoque`}
                                value={parte.estoque}
                                onChange={(e) => handleParteChange(grupoIndex, parteIndex, 'estoque', e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                step="1"
                              />
                            </div>
                            <div className="flex-grow"> {/* Allow it to grow, but the input inside will be limited */}
                              <label htmlFor={`grupo-${grupoIndex}-parte-${parteIndex}-sku`} className="block text-sm font-medium text-gray-700">
                                SKU da Parte
                              </label>
                              <div className="flex">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                                  {sku}-
                                </span>
                                <input
                                  type="text"
                                  id={`grupo-${grupoIndex}-parte-${parteIndex}-sku`}
                                  value={parte.skuParte && parte.skuParte.startsWith(`${sku}-`) ? parte.skuParte.substring(sku.length + 1) : parte.skuParte || ''}
                                  onChange={(e) => handleParteChange(grupoIndex, parteIndex, 'skuParte', e.target.value)}
                                  className="block w-20 rounded-none rounded-r-md border border-gray-300 shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                />
                              </div>
                            </div>
                            {grupo.partes.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveParte(grupoIndex, parteIndex)}
                                className="p-2 text-red-600 hover:text-red-900"
                              >
                                <Minus className="h-5 w-5" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleAddParte(grupoIndex)}
                          className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Adicionar Parte
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddGrupoImpressao}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Grupo de Impressão
                  </button>
                </div>

                {/* Tempo de Montagem e Descrição da Montagem para Peça Composta com mais de 1 grupo */}
                {gruposImpressao.length > 1 && (
                  <>
                    <div>
                      <label htmlFor="tempoMontagem" className="block text-sm font-medium text-gray-700">
                        Tempo de Montagem (minutos)
                      </label>
                      <input
                        type="number"
                        id="tempoMontagem"
                        name="tempoMontagem"
                        value={tempoMontagem}
                        onChange={(e) => setTempoMontagem(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        step="1"
                      />
                    </div>
                    <div>
                      <label htmlFor="descricaoMontagem" className="block text-sm font-medium text-gray-700">
                        Descrição da Montagem
                      </label>
                      <textarea
                        id="descricaoMontagem"
                        name="descricaoMontagem"
                        value={descricaoMontagem}
                        onChange={(e) => setDescricaoMontagem(e.target.value)}
                        rows="3"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      ></textarea>
                    </div>
                  </>
                )}
              </>
            )}

            {tipoProduto === 'peca' && !isPecaComposta && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="tempoImpressao" className="block text-sm font-medium text-gray-700">
                  Impressão (minutos)
                </label>
                <input
                  type="number"
                  id="tempoImpressao"
                  name="tempoImpressao"
                  value={tempoImpressao}
                  onChange={(e) => setTempoImpressao(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  step="1"
                />
              </div>
              <div>
                <label htmlFor="tempoMontagem" className="block text-sm font-medium text-gray-700">
                  Montagem (minutos)
                </label>
                <input
                  type="number"
                  id="tempoMontagem"
                  name="tempoMontagem"
                  value={tempoMontagem}
                  onChange={(e) => setTempoMontagem(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  step="1"
                />
              </div>
            </div>
                {/* Filamentos */}
                <div className="space-y-4">
                  <h4 className="text-lg font-medium text-gray-900">Filamentos Necessários</h4>
                  <div className="flex items-end space-x-2 mb-4">
                    <div className="flex-grow">
                      <label htmlFor="select-filamento" className="block text-sm font-medium text-gray-700">
                        Selecione um Filamento
                      </label>
                      <select
                        id="select-filamento"
                        value="" // This will be reset after selection
                        onChange={(e) => handleAddInsumo('filamento', e.target.value)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                      >
                        <option value="">Adicionar Filamento</option>
                        {availableFilaments.map(availInsumo => (
                          <option key={availInsumo.id} value={availInsumo.id}>
                            {availInsumo.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Filamento
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Quantidade (g)
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Filamento Alternativo
                          </th>
                          <th scope="col" className="relative px-6 py-3">
                            <span className="sr-only">Remover</span>
                          </th>
                        </tr>
                      </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {insumos.filter(i => i.tipo === 'filamento').map((insumo) => {
                                const selectedFilament = availableFilaments.find(f => f.id === insumo.insumoId);
                                return (
                                  <React.Fragment key={insumo.tempId}>
                                    <tr>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        {selectedFilament ? `${selectedFilament.especificacoes?.fabricante} ${selectedFilament.especificacoes?.material} ${selectedFilament.especificacoes?.tipoFilamento}` : 'Filamento não encontrado'}
                                        {selectedFilament && (
                                          <p className="text-xs text-gray-500 mt-1">Cor: {selectedFilament.cor}</p>
                                        )}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <input
                                          type="number"
                                          id={`filament-quantity-${insumo.tempId}`}
                                          value={insumo.quantity}
                                          onChange={(e) => handleInsumoChange(insumo.tempId, 'quantity', e.target.value, 'filamento')}
                                          className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                          step="0.01"
                                        />
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <input
                                          type="checkbox"
                                          id={`filament-${insumo.tempId}-isAlternative`}
                                          checked={insumo.isAlternative}
                                          onChange={(e) => handleInsumoChange(insumo.tempId, 'isAlternative', e.target.checked, 'filamento')}
                                          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                        />
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveInsumo(insumo.tempId)}
                                          className="text-red-600 hover:text-red-900"
                                        >
                                          <Trash2 className="h-5 w-5" />
                                        </button>
                                      </td>
                                    </tr>{insumo.isAlternative && (
                                      <tr key={`${insumo.tempId}-alt-section`}>
                                        <td colSpan="5" className="px-6 py-2 bg-gray-100">
                                          <div className="ml-4 space-y-2">
                                            <h6 className="text-sm font-medium text-gray-700">Filamentos Alternativos:</h6> {/* Changed h7 to h6 */}
                                            <div className="flex items-end space-x-2 mb-2">
                                              <div className="flex-grow">
                                                <select
                                                  value=""
                                                  onChange={(e) => {
                                                    if (e.target.value) {
                                                      handleAddInsumo('filamento', e.target.value, true, insumo.tempId);
                                                      e.target.value = "";
                                                    }
                                                  }}
                                                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                                >
                                                  <option value="">Adicionar Filamento Alternativo</option>
                                                  {availableFilaments.map(availInsumo => (
                                                    <option key={availInsumo.id} value={availInsumo.id}>
                                                      {availInsumo.nome}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                            </div>
                                            <table className="min-w-full divide-y divide-gray-200">
                                              <thead className="bg-gray-50">
                                                <tr>
                                                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Filamento Alternativo
                                                  </th>
                                                  <th scope="col" className="relative px-6 py-3">
                                                    <span className="sr-only">Remover</span>
                                                  </th>
                                                </tr>
                                              </thead>
                                              <tbody className="bg-white divide-y divide-gray-200">
                                                {insumo.alternativeFilaments.map(altFilament => {
                                                  const selectedAltFilament = availableFilaments.find(f => f.id === altFilament.filamentoId);
                                                  return (
                                                    <tr key={altFilament.tempId}>
                                                      <td className="px-6 py-4 whitespace-nowrap">
                                                        {selectedAltFilament ? `${selectedAltFilament.especificacoes?.fabricante} ${selectedAltFilament.especificacoes?.material} ${selectedAltFilament.especificacoes?.tipoFilamento}` : 'Filamento não encontrado'}
                                                        {selectedAltFilament && (
                                                          <p className="text-xs text-gray-500 mt-1">Cor: {selectedAltFilament.cor}</p>
                                                        )}
                                                      </td>
                                                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                        <button
                                                          type="button"
                                                          onClick={() => handleRemoveInsumo(altFilament.tempId, true, insumo.tempId)}
                                                          className="text-red-600 hover:text-red-900"
                                                        >
                                                          <Trash2 className="h-5 w-5" />
                                                        </button>
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                {/* Outros Insumos */}
                <div className="space-y-4 mt-6">
                  <h4 className="text-lg font-medium text-gray-900">Outros Insumos Necessários</h4>
                  {insumos.filter(i => i.tipo !== 'filamento').map((insumo) => (
                    <div key={insumo.tempId} className="flex items-end space-x-2">
                      <div className="flex-grow">
                        <label htmlFor={`other-insumo-id-${insumo.tempId}`} className="block text-sm font-medium text-gray-700">
                          Insumo
                        </label>
                        <select
                          id={`other-insumo-id-${insumo.tempId}`}
                          value={insumo.insumoId}
                          onChange={(e) => handleInsumoChange(insumo.tempId, 'insumoId', e.target.value, insumo.tipo)}
                          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                          required
                        >
                          <option value="">Selecione um insumo</option>
                          {availableOtherInsumos.map(availInsumo => (
                            <option key={availInsumo.id} value={availInsumo.id}>
                              {availInsumo.nome} ({availInsumo.unidade})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`other-insumo-quantity-${insumo.tempId}`} className="block text-sm font-medium text-gray-700">
                          Quantidade
                        </label>
                        <input
                          type="number"
                          id={`other-insumo-quantity-${insumo.tempId}`}
                          value={insumo.quantity}
                          onChange={(e) => handleInsumoChange(insumo.tempId, 'quantity', e.target.value, insumo.tipo)}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          step="0.01"
                        />
                      </div>
                      {insumos.filter(i => i.tipo !== 'filamento').length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveInsumo(insumo.tempId)}
                          className="p-2 text-red-600 hover:text-red-900"
                        >
                          <Minus className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleAddInsumo('other')} // A generic type for non-filaments
                    className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Outro Insumo
                  </button>
                </div>
              </>
            )}

            {tipoProduto === 'modelo' && (
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-gray-900">Peças Necessárias</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          SKU
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Nome da Peça
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Quantidade
                        </th>
                        <th scope="col" className="relative px-6 py-3">
                          <span className="sr-only">Remover</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {pecas.map((peca) => (
                        <tr key={peca.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {peca.sku}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {peca.nome}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="number"
                              value={peca.quantity}
                              onChange={(e) => handlePecaQuantityChange(peca.id, e.target.value)}
                              className="mt-1 block w-24 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                              min="1"
                              step="1"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              type="button"
                              onClick={() => handleRemovePeca(peca.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={handleOpenPecaSelectionModal}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Peça
                </button>

                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div>
                    <label htmlFor="calculatedTempoImpressao" className="block text-sm font-medium text-gray-700">
                      Tempo de Impressão Total (minutos)
                    </label>
                    <input
                      type="number"
                      id="calculatedTempoImpressao"
                      value={calculatedTempoImpressao.toFixed(2)}
                      readOnly
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 bg-gray-50 text-gray-900 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="calculatedQuantidadeFilamento" className="block text-sm font-medium text-gray-700">
                      Filamento Total (g)
                    </label>
                    <input
                      type="number"
                      id="calculatedQuantidadeFilamento"
                      value={calculatedQuantidadeFilamento.toFixed(2)}
                      readOnly
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 bg-gray-50 text-gray-900 sm:text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {tipoProduto === 'kit' && (
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-gray-900">Modelos Inclusos</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          SKU
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Nome do Modelo
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Quantidade
                        </th>
                        <th scope="col" className="relative px-6 py-3">
                          <span className="sr-only">Remover</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {modelos.map((modelo) => (
                        <tr key={modelo.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {modelo.sku}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {modelo.nome}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="number"
                              value={modelo.quantity}
                              onChange={(e) => handleModeloQuantityChange(modelo.id, e.target.value)}
                              className="mt-1 block w-24 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                              min="1"
                              step="1"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              type="button"
                              onClick={() => handleRemoveModelo(modelo.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={handleOpenModeloSelectionModal}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Modelo
                </button>
              </div>
            )}
          </form>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="produto-form"
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Salvar Produto
          </button>
        </div>
      </div>
      <PecaSelectionModal
        isOpen={isPecaSelectionModalOpen}
        onClose={handleClosePecaSelectionModal}
        onSelectPecas={handleSelectPecas}
        selectedPecas={pecas}
      />
      <ModeloSelectionModal
        isOpen={isModeloSelectionModalOpen}
        onClose={handleCloseModeloSelectionModal}
        onSelectModelos={handleSelectModelos}
        selectedModelos={modelos}
      />
    </div>
  );
};


export default ProdutoFormModal;
