import React, { useState, useEffect } from 'react';
import { X, Save, Plus } from 'lucide-react';
import { db as firestore } from '../services/firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import ModeloSelectionModal from './ModeloSelectionModal';
import PecaSelectionModal from './PecaSelectionModal';
import { cleanObject } from '../utils/cleanObject';

const KitFormModal = ({ isOpen, onClose, kit, modelos, pecas, insumos, serviceCosts }) => {
  const [sku, setSku] = useState('');
  const [nome, setNome] = useState('');
  const [componentes, setComponentes] = useState([]);
  const [isModeloSelectionModalOpen, setModeloSelectionModalOpen] = useState(false);
  const [isPecaSelectionModalOpen, setPecaSelectionModalOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [isFormValid, setIsFormValid] = useState(false); // New state for form validity

  const [custoTotal, setCustoTotal] = useState(0);
  const [tempoMontagemTotal, setTempoMontagemTotal] = useState(0);
  const [consumoFilamentoTotal, setConsumoFilamentoTotal] = useState(0);

  // Effect to initialize form data and clear errors
  useEffect(() => {
    if (isOpen) {
      if (kit) {
        setSku(kit.sku);
        setNome(kit.nome);
        setComponentes(kit.componentes || []);
      } else {
        setSku('');
        setNome('');
        setComponentes([]);
      }
      setErrors({});
    }
  }, [kit, isOpen]);

  // Effect to calculate costs
  useEffect(() => {
    let calculatedCost = 0;
    let calculatedAssemblyTime = 0;
    let calculatedFilamentConsumption = 0;

    componentes.forEach(comp => {
      if (comp.tipo === 'modelo') {
        const foundModelo = modelos.find(m => m.id === comp.id);
        if (foundModelo) {
          calculatedAssemblyTime += (foundModelo.tempoMontagem || 0) * comp.quantidade;
          calculatedFilamentConsumption += (foundModelo.consumoFilamento || 0) * comp.quantidade;
          calculatedCost += (foundModelo.custoCalculado || 0) * comp.quantidade;
        }
      } else if (comp.tipo === 'peca') {
        const foundPeca = pecas.find(p => p.id === comp.id);
        if (foundPeca) {
          calculatedAssemblyTime += (foundPeca.tempoMontagem || 0) * comp.quantidade;
          let pecaFilamentConsumption = 0;
          foundPeca.gruposImpressao?.forEach(grupo => {
            grupo.filamentos?.forEach(filamento => {
              const insumoFilamento = insumos.find(i => i.id === filamento.principal);
              if (insumoFilamento) {
                pecaFilamentConsumption += (parseFloat(filamento.quantidade) || 0);
              }
            });
          });
          calculatedFilamentConsumption += pecaFilamentConsumption * comp.quantidade;

          let pecaCalculatedCost = 0;
          if (foundPeca.gruposImpressao) {
            foundPeca.gruposImpressao.forEach(grupo => {
              grupo.filamentos?.forEach(filamento => {
                const insumoFilamento = insumos.find(i => i.id === filamento.principal);
                if (insumoFilamento) {
                  pecaCalculatedCost += (parseFloat(filamento.quantidade) || 0) * (parseFloat(insumoFilamento.custoPorUnidade) || 0);
                }
              });
              pecaCalculatedCost += (parseFloat(grupo.tempoImpressao) || 0) * (serviceCosts.custoPorMinutoImpressao || 0);
            });
          }
          calculatedCost += pecaCalculatedCost * comp.quantidade;
        }
      }
    });

    setCustoTotal(calculatedCost);
    setTempoMontagemTotal(calculatedAssemblyTime);
    setConsumoFilamentoTotal(calculatedFilamentConsumption);
  }, [componentes, modelos, pecas, insumos, serviceCosts]);

  // Function to validate form fields
  const validateForm = () => {
    let newErrors = {};
    if (!sku.trim()) newErrors.sku = 'SKU é obrigatório.';
    if (!nome.trim()) newErrors.nome = 'Nome do Kit é obrigatório.';
    if (componentes.length === 0) newErrors.componentes = 'Um kit deve conter pelo menos um modelo ou peça.';
    return newErrors;
  };

  // Effect for form validation
  useEffect(() => {
    const newErrors = validateForm();
    // Compare newErrors with current errors to avoid unnecessary state updates
    const hasErrorsChanged = Object.keys(newErrors).length !== Object.keys(errors).length ||
                             Object.keys(newErrors).some(key => newErrors[key] !== errors[key]);

    if (hasErrorsChanged) {
      setErrors(newErrors);
    }
    setIsFormValid(Object.keys(newErrors).length === 0);
  }, [sku, nome, componentes]); // Dependencies are only the form fields

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) {
      // Optionally, re-run validation to show latest errors on submit attempt
      setErrors(validateForm());
      return;
    }

    const kitData = cleanObject({
      sku,
      nome,
      componentes: componentes.map(comp => ({
        id: comp.id,
        nome: comp.nome,
        sku: comp.sku,
        quantidade: comp.quantidade,
        tipo: comp.tipo,
      })),
      custoCalculado: custoTotal,
      tempoMontagem: tempoMontagemTotal,
      consumoFilamento: consumoFilamentoTotal,
    });

    try {
      if (kit) {
        await updateDoc(doc(firestore, 'kits', kit.id), { ...kitData, updatedAt: new Date() });
      } else {
        await addDoc(collection(firestore, 'kits'), { ...kitData, createdAt: new Date() });
      }
      onClose();
    } catch (error) {
      console.error("Error saving kit: ", error);
    }
  };

  const handleSelectComponentes = (selectedItems, type) => {
    const newComponents = selectedItems.map(item => {
      if (type === 'peca') {
        // Extract id, nome, sku from the nested 'peca' object
        return {
          id: item.peca.id,
          nome: item.peca.nome,
          sku: item.peca.sku,
          quantidade: item.quantidade || 1,
          tipo: type,
        };
      }
      // For 'modelo' type, properties are directly on the item
      return {
        ...item,
        quantidade: item.quantidade || 1,
        tipo: type,
      };
    });

    setComponentes(prev => {
      const filteredPrev = prev.filter(comp => comp.tipo !== type);
      return [...filteredPrev, ...newComponents];
    });
  };

  const handleComponenteQuantityChange = (componenteId, quantidade) => {
    setComponentes(prev => {
      const updatedComponents = prev.map(comp => {
        if (comp.id === componenteId) {
          return { ...comp, quantidade: parseInt(quantidade, 10) || 0 };
        }
        return comp;
      });
      return updatedComponents;
    });
  };

  const handleRemoveComponente = (componenteId) => {
    setComponentes(prev => prev.filter(comp => comp.id !== componenteId));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm h-full w-full z-50 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="relative bg-white rounded-lg shadow-xl p-8 w-full max-w-4xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-900">
            {kit ? 'Editar Kit' : 'Novo Kit'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form id="kitForm" onSubmit={handleSubmit} className="flex-grow overflow-y-auto pr-2 -mr-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
            <div>
              <label htmlFor="sku" className="block text-sm font-medium text-gray-700">SKU</label>
              <input
                id="sku"
                type="text"
                placeholder="SKU do Kit"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className={`mt-1 block w-full rounded-md border ${errors.sku ? 'border-red-500' : 'border-gray-300'} shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm`}
                required
              />
              {errors.sku && <p className="mt-1 text-sm text-red-600">{errors.sku}</p>}
            </div>
            <div>
              <label htmlFor="nome" className="block text-sm font-medium text-gray-700">Nome do Kit</label>
              <input
                id="nome"
                type="text"
                placeholder="Nome do Kit"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={`mt-1 block w-full rounded-md border ${errors.nome ? 'border-red-500' : 'border-gray-300'} shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm`}
                required
              />
              {errors.nome && <p className="mt-1 text-sm text-red-600">{errors.nome}</p>}
            </div>
          </div>

          <div className="mt-6 mb-4">
            <h3 className="font-semibold text-gray-800 mb-2">Componentes do Kit:</h3>
            <div className="flex space-x-3 mb-4">
              <button
                type="button"
                onClick={() => setModeloSelectionModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Modelos
              </button>
              <button
                type="button"
                onClick={() => setPecaSelectionModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Peças
              </button>
            </div>

            <div className={`mt-2 space-y-2 max-h-48 overflow-y-auto border rounded-md p-2 ${errors.componentes ? 'border-red-500' : 'border-gray-300'}`}>
              {componentes.length > 0 ? componentes.map(comp => (
                <div key={comp.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
                  <div>
                    <span className="font-medium">{comp.nome}</span>
                    <span className="text-sm text-gray-500 ml-2">(SKU: {comp.sku}) - {comp.tipo === 'modelo' ? 'Modelo' : 'Peça'}</span>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="number"
                      min="1"
                      value={comp.quantidade}
                      onChange={(e) => handleComponenteQuantityChange(comp.id, parseInt(e.target.value, 10))}
                      className="w-24 p-1 border-gray-300 rounded-md shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveComponente(comp.id)}
                      className="ml-2 text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100"
                      title="Remover Componente"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )) : (
                <p className="text-gray-500 text-center py-4">Nenhum componente selecionado.</p>
              )}
            </div>
            {errors.componentes && <p className="mt-1 text-sm text-red-600">{errors.componentes}</p>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4 p-4 border rounded-md bg-gray-50">
              <div className="text-center">
                  <label className="block text-sm font-medium text-gray-700">Custo Total</label>
                  <p className="mt-1 text-lg font-semibold text-green-600">R$ {custoTotal.toFixed(2)}</p>
              </div>
              <div className="text-center">
                  <label className="block text-sm font-medium text-gray-700">Tempo Montagem</label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{tempoMontagemTotal} min</p>
              </div>
              <div className="text-center">
                  <label className="block text-sm font-medium text-gray-700">Consumo Filamento</label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{consumoFilamentoTotal.toFixed(2)} g</p>
              </div>
          </div>
        </form>

        <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="kitForm"
            disabled={!validateForm()} // Disable if form is not valid
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4 mr-2" />
            {kit ? 'Salvar Alterações' : 'Cadastrar Kit'}
          </button>
        </div>

        <ModeloSelectionModal
          isOpen={isModeloSelectionModalOpen}
          onClose={() => setModeloSelectionModalOpen(false)}
          onSelect={(selected) => handleSelectComponentes(selected, 'modelo')}
          initialSelectedModelos={componentes.filter(c => c.tipo === 'modelo')}
        />
        <PecaSelectionModal
          isOpen={isPecaSelectionModalOpen}
          onClose={() => setPecaSelectionModalOpen(false)}
          onSelect={(selected) => handleSelectComponentes(selected, 'peca')}
          initialSelectedPecas={componentes.filter(c => c.tipo === 'peca')}
        />
      </div>
    </div>
  );
};

export default KitFormModal;
