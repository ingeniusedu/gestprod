import React, { useState, useEffect } from 'react';
import { db as firestore } from '../services/firebase';
import { collection, addDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import PecaSelectionModal from './PecaSelectionModal';
import InsumoSelectionModal from './InsumoSelectionModal';

const ModeloFormModal = ({ isOpen, onClose, modelo, onSave }) => {
  const [sku, setSku] = useState('');
  const [nome, setNome] = useState('');
  const [tempoMontagemAdicional, setTempoMontagemAdicional] = useState(0);
  const [pecas, setPecas] = useState([]);
  const [insumosAdicionais, setInsumosAdicionais] = useState([]);
  const [isPecaSelectionModalOpen, setPecaSelectionModalOpen] = useState(false);
  const [isInsumoSelectionModalOpen, setInsumoSelectionModalOpen] = useState(false);

  const [tempoImpressaoTotal, setTempoImpressaoTotal] = useState(0);
  const [tempoMontagemTotal, setTempoMontagemTotal] = useState(0);
  const [consumoFilamentoTotal, setConsumoFilamentoTotal] = useState(0);
  const [custoTotal, setCustoTotal] = useState(0);
  const [gruposImpressaoOtimizado, setGruposImpressaoOtimizado] = useState(0);
  const [gruposImpressaoTotal, setGruposImpressaoTotal] = useState(0);
  const [serviceCosts, setServiceCosts] = useState({
    custoPorMinutoImpressao: 0,
    custoPorMinutoMontagem: 0,
  });

  useEffect(() => {
    const fetchServiceCosts = async () => {
      const docRef = doc(firestore, 'settings', 'serviceCosts');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setServiceCosts(docSnap.data());
      }
    };
    fetchServiceCosts();
  }, []);

  useEffect(() => {
    const loadModeloData = async () => {
      if (modelo) {
        setSku(modelo.sku);
        setNome(modelo.nome);
        setTempoMontagemAdicional(modelo.tempoMontagemAdicional || 0);

        const fetchedPecas = await Promise.all(
          (modelo.pecas || []).map(async (item) => {
            const pecaDoc = await getDoc(doc(firestore, 'pecas', item.pecaId));
            return pecaDoc.exists() ? { peca: { id: pecaDoc.id, ...pecaDoc.data() }, quantidade: item.quantidade } : null;
          })
        );
        setPecas(fetchedPecas.filter(Boolean));

        const fetchedInsumos = await Promise.all(
          (modelo.insumosAdicionais || []).map(async (item) => {
            const insumoDoc = await getDoc(doc(firestore, 'insumos', item.insumoId));
            return insumoDoc.exists() ? { insumo: { id: insumoDoc.id, ...insumoDoc.data() }, quantidade: item.quantidade } : null;
          })
        );
        setInsumosAdicionais(fetchedInsumos.filter(Boolean));

      } else {
        setSku('');
        setNome('');
        setTempoMontagemAdicional(0);
        setPecas([]);
        setInsumosAdicionais([]);
      }
    };

    loadModeloData();
  }, [modelo]);

  useEffect(() => {
    const totalImpressao = pecas.reduce((acc, item) => {
      const pecaTempoImpressao = item.peca.gruposImpressao?.reduce((sum, grupo) => sum + (Number(grupo.tempoImpressao) || 0), 0) || 0;
      return acc + pecaTempoImpressao * item.quantidade;
    }, 0);

    const totalFilamento = pecas.reduce((acc, item) => {
      const pecaConsumoFilamento = item.peca.gruposImpressao?.reduce((sum, grupo) => {
          const filamentInGroup = grupo.filamentos?.reduce((fSum, f) => fSum + (Number(f.quantidade) || 0), 0) || 0;
          return sum + filamentInGroup;
      }, 0) || 0;
      return acc + pecaConsumoFilamento * item.quantidade;
    }, 0);

    const totalMontagemPecas = pecas.reduce((acc, item) => acc + (item.peca.tempoMontagem || 0) * item.quantidade, 0);
    const custoPecas = pecas.reduce((acc, item) => acc + (item.peca.custoCalculado || 0) * item.quantidade, 0);

    const otimizado = pecas.reduce((acc, item) => {
      const gruposDaPeca = item.peca.gruposImpressao?.reduce((sum, grupo) => {
        const qtdMaxima = grupo.quantidadeMaxima || 1;
        return sum + Math.ceil(item.quantidade / qtdMaxima);
      }, 0) || 0;
      return acc + gruposDaPeca;
    }, 0);
    
    const total = pecas.reduce((acc, item) => acc + (item.peca.gruposImpressao?.length || 0) * item.quantidade, 0);

    setGruposImpressaoOtimizado(otimizado);
    setGruposImpressaoTotal(total);
    setTempoImpressaoTotal(totalImpressao);
    const montagemAdicional = parseFloat(tempoMontagemAdicional) || 0;
    setTempoMontagemTotal(totalMontagemPecas + montagemAdicional);
    setConsumoFilamentoTotal(totalFilamento);

    const custoMontagemAdicional = montagemAdicional * (serviceCosts.custoPorMinutoMontagem || 0);
    const custoInsumosAdicionais = insumosAdicionais.reduce((acc, item) => acc + (item.insumo.custoPorUnidade || 0) * item.quantidade, 0);
    setCustoTotal(custoPecas + custoMontagemAdicional + custoInsumosAdicionais);

  }, [pecas, tempoMontagemAdicional, insumosAdicionais, serviceCosts]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const modeloData = {
      sku,
      nome,
      tempoMontagemAdicional: parseFloat(tempoMontagemAdicional) || 0,
      pecas: pecas.map(item => ({ pecaId: item.peca.id, quantidade: item.quantidade })),
      insumosAdicionais: insumosAdicionais.map(item => ({ insumoId: item.insumo.id, quantidade: item.quantidade })),
      tempoImpressao: tempoImpressaoTotal,
      tempoMontagem: tempoMontagemTotal,
      consumoFilamento: consumoFilamentoTotal,
      custoCalculado: custoTotal,
      gruposImpressaoOtimizado: gruposImpressaoOtimizado,
      gruposImpressaoTotal: gruposImpressaoTotal,
    };
    onSave({ ...modelo, ...modeloData });
  };

  const handleSelectPecas = (selectedPecas) => {
    setPecas(selectedPecas);
  };

  const handleSelectInsumosAdicionais = (selectedInsumos) => {
    setInsumosAdicionais(selectedInsumos);
  };

  const handlePecaQuantityChange = (pecaId, newQuantity) => {
    const updatedPecas = pecas.map(item => {
      if (item.peca.id === pecaId) {
        return { ...item, quantidade: newQuantity >= 1 ? newQuantity : 1 };
      }
      return item;
    });
    setPecas(updatedPecas);
  };

  const handleInsumoQuantityChange = (insumoId, newQuantity) => {
    const updatedInsumos = insumosAdicionais.map(item => {
      if (item.insumo.id === insumoId) {
        return { ...item, quantidade: newQuantity >= 0 ? newQuantity : 0 };
      }
      return item;
    });
    setInsumosAdicionais(updatedInsumos);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex justify-center items-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">{modelo ? 'Editar Modelo' : 'Cadastrar Modelo'}</h2>
        <form id="modeloForm" onSubmit={handleSubmit} className="flex-grow overflow-y-auto pr-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="sku" className="block text-sm font-medium text-gray-700">SKU</label>
              <input
                id="sku"
                type="text"
                placeholder="SKU do Modelo"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="mt-1 p-2 block w-full border-gray-300 rounded-md shadow-sm"
                required
              />
            </div>
            <div>
              <label htmlFor="nome" className="block text-sm font-medium text-gray-700">Nome do Modelo</label>
              <input
                id="nome"
                type="text"
                placeholder="Nome do Modelo"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="mt-1 p-2 block w-full border-gray-300 rounded-md shadow-sm"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="tempoMontagemAdicional" className="block text-sm font-medium text-gray-700">Tempo de Montagem Adicional (min)</label>
              <input
                id="tempoMontagemAdicional"
                type="number"
                placeholder="0"
                value={tempoMontagemAdicional}
                onChange={(e) => setTempoMontagemAdicional(e.target.value)}
                className="mt-1 p-2 block w-full border-gray-300 rounded-md shadow-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <button
                type="button"
                onClick={() => setPecaSelectionModalOpen(true)}
                className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full"
              >
                Selecionar Peças
              </button>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setInsumoSelectionModalOpen(true)}
                className="bg-purple-500 text-white px-4 py-2 rounded-md hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 w-full"
              >
                Selecionar Insumos Adicionais
              </button>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="font-semibold text-gray-800">Peças Selecionadas:</h3>
            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
              {pecas.length > 0 ? pecas.map(item => (
                <div key={item.peca.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
                  <div>
                    <span className="font-medium">{item.peca.nome}</span>
                    <span className="text-sm text-gray-500 ml-2">(SKU: {item.peca.sku})</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={item.quantidade}
                    onChange={(e) => handlePecaQuantityChange(item.peca.id, parseInt(e.target.value, 10))}
                    className="w-24 p-1 border-gray-300 rounded-md shadow-sm"
                  />
                </div>
              )) : (
                <p className="text-gray-500 text-center py-4">Nenhuma peça selecionada.</p>
              )}
            </div>
          </div>

          <div className="mb-4">
            <h3 className="font-semibold text-gray-800">Insumos Adicionais Selecionados:</h3>
            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
              {insumosAdicionais.length > 0 ? insumosAdicionais.map(item => (
                <div key={item.insumo.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
                  <div>
                    <span className="font-medium">{item.insumo.nome}</span>
                    <span className="text-sm text-gray-500 ml-2">(Tipo: {item.insumo.tipo}, Unidade: {item.insumo.unidade})</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.quantidade}
                    onChange={(e) => handleInsumoQuantityChange(item.insumo.id, parseFloat(e.target.value))}
                    className="w-24 p-1 border-gray-300 rounded-md shadow-sm"
                  />
                </div>
              )) : (
                <p className="text-gray-500 text-center py-4">Nenhum insumo adicional selecionado.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4 p-4 border rounded-md bg-gray-50">
              <div className="text-center">
                  <label className="block text-sm font-medium text-gray-700">Impressão Total</label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{tempoImpressaoTotal} min</p>
              </div>
              <div className="text-center">
                  <label className="block text-sm font-medium text-gray-700">Montagem Total</label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{tempoMontagemTotal} min</p>
              </div>
              <div className="text-center">
                  <label className="block text-sm font-medium text-gray-700">Filamento Total</label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{consumoFilamentoTotal.toFixed(2)} g</p>
              </div>
              <div className="text-center">
                  <label className="block text-sm font-medium text-gray-700">Grupos Otimizado</label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{gruposImpressaoOtimizado}</p>
              </div>
              <div className="text-center">
                  <label className="block text-sm font-medium text-gray-700">Grupos Total</label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{gruposImpressaoTotal}</p>
              </div>
              <div className="text-center">
                  <label className="block text-sm font-medium text-gray-700">Custo Total</label>
                  <p className="mt-1 text-lg font-semibold text-green-600">R$ {custoTotal.toFixed(2)}</p>
              </div>
          </div>
        </form>

        <div className="flex justify-end gap-4 pt-4 border-t">
          <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300">
            Cancelar
          </button>
          <button type="submit" form="modeloForm" className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700" onClick={handleSubmit}>
            {modelo ? 'Atualizar' : 'Salvar'}
          </button>
        </div>

        <PecaSelectionModal
          isOpen={isPecaSelectionModalOpen}
          onClose={() => setPecaSelectionModalOpen(false)}
          onSelect={handleSelectPecas}
          initialSelectedPecas={pecas}
        />

        <InsumoSelectionModal
          isOpen={isInsumoSelectionModalOpen}
          onClose={() => setInsumoSelectionModalOpen(false)}
          onSelect={handleSelectInsumosAdicionais}
          initialSelectedInsumos={insumosAdicionais}
        />
      </div>
    </div>
  );
};

export default ModeloFormModal;
