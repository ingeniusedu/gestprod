"use client";

import { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Search, X, Plus, Minus } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, getDocs, doc, getDoc, addDoc, Timestamp } from 'firebase/firestore';

export default function PedidoFormModal({ isOpen, onClose, onSave, initialData }) {
  const [pedido, setPedido] = useState({
    numero: '',
    comprador: '',
    dataCriacao: new Date(),
    dataPrevisao: new Date(),
    status: 'aguardando',
    produtos: [], // Embedded product data
    custos: { insumos: 0, tempo: 0, total: 0, filamento: 0 }, // Added filamento cost
    tempos: { impressao: 0, montagem: 0, total: 0, totalConsumoFilamento: 0 },
  });

  // States for service costs
  const [custoPorMinutoImpressao, setCustoPorMinutoImpressao] = useState(0);
  const [custoPorMinutoMontagem, setCustoPorMinutoMontagem] = useState(0);
  const [custoPorGramaFilamento, setCustoPorGramaFilamento] = useState(0);

  // States for product selection directly within this modal
  const [availableProducts, setAvailableProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'kit', 'modelo', 'peca'

  useEffect(() => {
    if (initialData) {
      setPedido({
        ...initialData,
        dataCriacao: initialData.dataCriacao ? initialData.dataCriacao.toDate() : new Date(),
        dataPrevisao: initialData.dataPrevisao ? initialData.dataPrevisao.toDate() : new Date(),
      });
    } else {
      setPedido({
        numero: '',
        comprador: '',
        dataCriacao: new Date(),
        dataPrevisao: new Date(),
        status: 'aguardando',
        produtos: [],
        custos: { insumos: 0, tempo: 0, total: 0, filamento: 0 }, // Added filamento cost
        tempos: { impressao: 0, montagem: 0, total: 0, totalConsumoFilamento: 0 },
      });
    }
    if (isOpen) {
      fetchAvailableProducts(); // Fetch products when the modal opens
      fetchServiceCosts(); // Fetch service costs when the modal opens
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    calculateTotals();
  }, [pedido.produtos, custoPorMinutoImpressao, custoPorMinutoMontagem, custoPorGramaFilamento]);

  const fetchServiceCosts = async () => {
    try {
      const docRef = doc(db, 'settings', 'serviceCosts');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCustoPorMinutoImpressao(parseFloat(data.custoPorMinutoImpressao) || 0);
        setCustoPorMinutoMontagem(parseFloat(data.custoPorMinutoMontagem) || 0);
        setCustoPorGramaFilamento(parseFloat(data.custoPorGramaFilamento) || 0);
      }
    } catch (error) {
      console.error("Error fetching service costs: ", error);
    }
  };

  const fetchAvailableProducts = async () => {
    try {
      const [kitsSnap, modelosSnap, pecasSnap] = await Promise.all([
        getDocs(collection(db, 'kits')),
        getDocs(collection(db, 'modelos')),
        getDocs(collection(db, 'pecas')),
      ]);

      const kits = kitsSnap.docs.map(doc => {
        return { id: doc.id, ...doc.data(), type: 'kit', SKU: doc.data().sku || 'N/A' };
      });
      const modelos = modelosSnap.docs.map(doc => {
        return { id: doc.id, ...doc.data(), type: 'modelo', SKU: doc.data().sku || 'N/A' };
      });
      const pecas = pecasSnap.docs.map(doc => {
        return { id: doc.id, ...doc.data(), type: 'peca', SKU: doc.data().sku || 'N/A' };
      });

      setAvailableProducts([...kits, ...modelos, ...pecas]);
    } catch (error) {
      console.error("Error fetching available products: ", error);
    }
  };

  const filteredAndSortedAvailableProducts = availableProducts
    .filter(product => {
      const matchesSearch = product.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (product.SKU && product.SKU.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesFilter = filterType === 'all' || product.type === filterType;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      const skuA = a.SKU ? a.SKU.toLowerCase() : '';
      const skuB = b.SKU ? b.SKU.toLowerCase() : '';
      return skuA.localeCompare(skuB);
    });

  const getProductDetailsForSnapshot = async (productId, productType) => {
    let productData = null;
    let insumosNecessarios = [];
    let pecasComponentes = [];
    let tempoImpressaoEstimado = 0;
    let tempoMontagemEstimado = 0;
    let custoUnitario = 0;

    try {
      const docRef = doc(db, productType + 's', productId); // 'kits', 'modelos', 'pecas'
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        productData = { id: docSnap.id, ...docSnap.data(), tipo: productType };

        if (productType === 'peca') {
          custoUnitario = parseFloat(productData.custoCalculado) || 0;
          tempoMontagemEstimado = parseFloat(productData.tempoMontagem) || 0;

          let aggregatedTempoImpressao = 0;
          let aggregatedInsumos = [];
          let capturedGruposImpressao = [];

          if (productData.isComposta && productData.gruposImpressao && productData.gruposImpressao.length > 0) {
            capturedGruposImpressao = productData.gruposImpressao.map(grupo => ({
                ...grupo,
                tempoImpressao: parseFloat(grupo.tempoImpressao) || 0,
                quantidadeMaxima: parseFloat(grupo.quantidadeMaxima) || 0,
                filamentos: (grupo.filamentos || []).map(f => ({
                    ...f,
                    quantidade: parseFloat(f.quantidade) || 0
                })),
                partes: (grupo.partes || []).map(p => ({
                    ...p
                }))
            }));

            capturedGruposImpressao.forEach(grupo => {
              aggregatedTempoImpressao += grupo.tempoImpressao;
              (grupo.filamentos || []).forEach(filamento => {
                const existingInsumo = aggregatedInsumos.find(i => i.insumoId === filamento.grupoFilamentoId && i.cor === filamento.cor);
                if (existingInsumo) {
                  existingInsumo.quantidade += filamento.quantidade;
                } else {
                  aggregatedInsumos.push({ ...filamento });
                }
              });
            });
            tempoImpressaoEstimado = aggregatedTempoImpressao;
            insumosNecessarios = aggregatedInsumos;
          } else {
            insumosNecessarios = productData.insumos || [];
            tempoImpressaoEstimado = parseFloat(productData.tempoImpressao) || 0;
          }

          return {
            id: productData.id,
            tipo: productData.tipo,
            nome: productData.nome,
            SKU: productData.sku || 'N/A',
            custoUnitario: custoUnitario,
            tempoImpressaoEstimado: tempoImpressaoEstimado,
            tempoMontagemEstimado: tempoMontagemEstimado,
            insumosNecessarios: insumosNecessarios,
            gruposImpressao: capturedGruposImpressao,
            pecasComponentes: [],
          };
        } else if (productType === 'modelo') {
          pecasComponentes = await Promise.all((productData.pecas || []).filter(p => p.pecaId).map(async (p) => {
            const pecaDetails = await getProductDetailsForSnapshot(p.pecaId, 'peca');
            if (pecaDetails) {
              tempoImpressaoEstimado += (pecaDetails.tempoImpressaoEstimado || 0) * (p.quantidade || 1);
              tempoMontagemEstimado += (pecaDetails.tempoMontagemEstimado || 0) * (p.quantidade || 1);
              custoUnitario += (pecaDetails.custoUnitario || 0) * (p.quantidade || 1);
              pecaDetails.insumosNecessarios.forEach(insumo => {
                const existingInsumo = insumosNecessarios.find(i => i.insumoId === insumo.insumoId && i.cor === insumo.cor);
                if (existingInsumo) {
                  existingInsumo.quantidade += insumo.quantidade * (p.quantidade || 1);
                } else {
                  insumosNecessarios.push({ ...insumo, quantidade: insumo.quantidade * (p.quantidade || 1) });
                }
              });
              return { ...pecaDetails, quantidade: p.quantidade || 1 };
            }
            return null;
          }));
          pecasComponentes = pecasComponentes.filter(Boolean);
        } else if (productType === 'kit') {
          pecasComponentes = await Promise.all((productData.produtos || []).filter(p => p.id && p.tipo).map(async (p) => {
            const componentDetails = await getProductDetailsForSnapshot(p.id, p.tipo);
            if (componentDetails) {
              tempoImpressaoEstimado += (componentDetails.tempoImpressaoEstimado || 0) * (p.quantidade || 1);
              tempoMontagemEstimado += (componentDetails.tempoMontagemEstimado || 0) * (p.quantidade || 1);
              custoUnitario += (componentDetails.custoUnitario || 0) * (p.quantidade || 1);
              componentDetails.insumosNecessarios.forEach(insumo => {
                const existingInsumo = insumosNecessarios.find(i => i.insumoId === insumo.insumoId && i.cor === insumo.cor);
                if (existingInsumo) {
                  existingInsumo.quantidade += insumo.quantidade * (p.quantidade || 1);
                } else {
                  insumosNecessarios.push({ ...insumo, quantidade: insumo.quantidade * (p.quantidade || 1) });
                }
              });
              if (componentDetails.pecasComponentes && componentDetails.pecasComponentes.length > 0) {
                return { ...componentDetails, quantidade: p.quantidade || 1, subComponents: componentDetails.pecasComponentes };
              }
              return { ...componentDetails, quantidade: p.quantidade || 1 };
            }
            return null;
          }));
          pecasComponentes = pecasComponentes.filter(Boolean);
        }

        return {
          id: productData.id,
          tipo: productData.tipo,
          nome: productData.nome,
          SKU: productData.sku || 'N/A',
          custoUnitario: custoUnitario,
          tempoImpressaoEstimado: tempoImpressaoEstimado,
          tempoMontagemEstimado: tempoMontagemEstimado,
          insumosNecessarios: insumosNecessarios,
          pecasComponentes: pecasComponentes,
        };
      }
    } catch (error) {
      console.error(`Error fetching details for ${productType} ${productId}:`, error);
    }
    return null;
  };

  const handleAddProduct = async (product) => {
    const existingProductIndex = pedido.produtos.findIndex(
      (p) => p.id === product.id && p.tipo === product.type
    );

    if (existingProductIndex > -1) {
      setPedido((prevPedido) => {
        const updatedProducts = [...prevPedido.produtos];
        updatedProducts[existingProductIndex].quantidade += 1;
        return { ...prevPedido, produtos: updatedProducts };
      });
    } else {
      const productSnapshot = await getProductDetailsForSnapshot(product.id, product.type);
      if (productSnapshot) {
        setPedido((prevPedido) => ({
          ...prevPedido,
          produtos: [...prevPedido.produtos, {
            produtoId: productSnapshot.id,
            tipo: productSnapshot.tipo,
            nome: productSnapshot.nome,
            SKU: productSnapshot.SKU,
            custoUnitario: productSnapshot.custoUnitario,
            tempoImpressaoEstimado: productSnapshot.tempoImpressaoEstimado,
            tempoMontagemEstimado: productSnapshot.tempoMontagemEstimado,
            insumosNecessarios: productSnapshot.insumosNecessarios,
            pecasComponentes: productSnapshot.pecasComponentes,
            gruposImpressao: productSnapshot.gruposImpressao || [], // Ensure groups are carried over
            quantidade: 1 // Initial quantity
          }],
        }));
      }
    }
  };

  const handleRemoveProduct = (index) => {
    setPedido(prevPedido => {
      const updatedProducts = [...prevPedido.produtos];
      updatedProducts.splice(index, 1);
      return { ...prevPedido, produtos: updatedProducts };
    });
  };

  const handleQuantityChange = (index, newQuantity) => {
    setPedido(prevPedido => {
      const updatedProducts = [...prevPedido.produtos];
      if (newQuantity > 0) {
        updatedProducts[index].quantidade = newQuantity;
      } else {
        updatedProducts.splice(index, 1);
      }
      return { ...prevPedido, produtos: updatedProducts };
    });
  };

  const calculateTotals = () => {
    let totalCustoInsumosProdutos = 0; // Cost from product's custoUnitario
    let totalTempoImpressao = 0;
    let totalTempoMontagem = 0;
    let totalConsumoFilamento = 0;

    pedido.produtos.forEach(product => {
      const quantity = product.quantidade || 0;
      totalCustoInsumosProdutos += (product.custoUnitario || 0) * quantity;
      totalTempoImpressao += (product.tempoImpressaoEstimado || 0) * quantity;
      totalTempoMontagem += (product.tempoMontagemEstimado || 0) * quantity;

      (product.insumosNecessarios || []).forEach(insumo => {
        if (insumo.tipo === 'filamento') {
          totalConsumoFilamento += (insumo.quantidade || 0) * quantity;
        }
      });
    });

    // Calculate monetary costs for time and filament
    const custoMonetarioImpressao = totalTempoImpressao * custoPorMinutoImpressao;
    const custoMonetarioMontagem = totalTempoMontagem * custoPorMinutoMontagem;
    const custoMonetarioFilamento = totalConsumoFilamento * custoPorGramaFilamento;

    const totalCustoTempo = custoMonetarioImpressao + custoMonetarioMontagem;
    const totalCustoGeral = totalCustoInsumosProdutos + totalCustoTempo + custoMonetarioFilamento;

    setPedido(prevPedido => ({
      ...prevPedido,
      custos: {
        insumos: totalCustoInsumosProdutos,
        tempo: totalCustoTempo,
        filamento: custoMonetarioFilamento,
        total: totalCustoGeral,
      },
      tempos: {
        impressao: totalTempoImpressao,
        montagem: totalTempoMontagem,
        total: totalTempoImpressao + totalTempoMontagem,
        totalConsumoFilamento: totalConsumoFilamento,
      },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prepare the simplified Pedido document
    const simplifiedPedido = {
      numero: pedido.numero,
      comprador: pedido.comprador,
      produtos: pedido.produtos.map(p => ({
        produtoId: p.produtoId,
        tipo: p.tipo,
        nomeProduto: p.nome,
        skuProduto: p.SKU,
        quantidade: p.quantidade,
        statusProducaoItem: 'aguardando_producao', // Initial status
      })),
      status: 'aguardando', // Initial overall status
      dataCriacao: Timestamp.fromDate(pedido.dataCriacao),
      dataPrevisao: Timestamp.fromDate(pedido.dataPrevisao),
      custos: pedido.custos, // Include calculated costs
      tempos: pedido.tempos, // Include calculated times
    };

    // Defensive measure: ensure no unexpected properties are included
    const finalSimplifiedPedido = { ...simplifiedPedido };
    delete finalSimplifiedPedido.itensProducao; // Ensure this is not present
    delete finalSimplifiedPedido.etapasProducao; // Ensure this is not present

    try {
      // Save the simplified Pedido document
      const docRef = await addDoc(collection(db, 'pedidos'), finalSimplifiedPedido); // Use finalSimplifiedPedido
      const newPedidoId = docRef.id;
      console.log("Pedido simplificado salvo com ID:", newPedidoId, finalSimplifiedPedido); // Log the actual object saved

      // Prepare the LancamentoProducao document payload
      const lancamentoProducaoPayload = {
        pedidoId: newPedidoId,
        pedidoNumero: pedido.numero,
        produtos: pedido.produtos.map(p => ({
          produtoId: p.produtoId,
          tipo: p.tipo,
          nomeProduto: p.nome,
          skuProduto: p.SKU,
          quantidade: p.quantidade,
          custoUnitario: p.custoUnitario || 0,
          tempoImpressaoEstimado: p.tempoImpressaoEstimado || 0,
          tempoMontagemEstimado: p.tempoMontagemEstimado || 0,
          insumosNecessarios: p.insumosNecessarios || [],
          pecasComponentes: p.pecasComponentes || [],
          gruposImpressao: p.gruposImpressao || [], // Include detailed groups if available
        })),
      };
      console.log("Payload para lancamentosProducao:", lancamentoProducaoPayload); // Log the payload

      // Create and launch the 'criacao_pedido' event in lancamentosProducao
      await addDoc(collection(db, 'lancamentosProducao'), {
        tipoEvento: 'criacao_pedido',
        timestamp: Timestamp.now(),
        usuarioId: 'current_user_id', // TODO: Replace with actual user ID
        pedidoId: newPedidoId,
        pedidoNumero: pedido.numero, // Add pedidoNumero directly
        payload: lancamentoProducaoPayload,
      });
      console.log("Evento 'criacao_pedido' lançado em lancamentosProducao.");

      onSave({ id: newPedidoId, ...simplifiedPedido }); // Pass the new ID back
      onClose();
    } catch (error) {
      console.error("Erro ao salvar pedido ou lançar evento de produção: ", error);
      // Optionally, show an error message to the user
    }
  };

  const handleDateChange = (e, field) => {
    setPedido({ ...pedido, [field]: new Date(e.target.value) });
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 flex justify-between items-center"
                >
                  {initialData ? 'Editar Pedido' : 'Novo Pedido'}
                  <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </Dialog.Title>
                <div className="mt-4">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Pedido Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="numero" className="block text-sm font-medium text-gray-700">
                          Número do Pedido
                        </label>
                        <input
                          type="text"
                          name="numero"
                          id="numero"
                          value={pedido.numero}
                          onChange={(e) => setPedido({ ...pedido, numero: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="comprador" className="block text-sm font-medium text-gray-700">
                          Comprador
                        </label>
                        <input
                          type="text"
                          name="comprador"
                          id="comprador"
                          value={pedido.comprador}
                          onChange={(e) => setPedido({ ...pedido, comprador: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="dataCriacao" className="block text-sm font-medium text-gray-700">
                          Data de Criação
                        </label>
                        <input
                          type="date"
                          name="dataCriacao"
                          id="dataCriacao"
                          value={pedido.dataCriacao.toISOString().split('T')[0]}
                          onChange={(e) => handleDateChange(e, 'dataCriacao')}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="dataPrevisao" className="block text-sm font-medium text-gray-700">
                          Data de Previsão
                        </label>
                        <input
                          type="date"
                          name="dataPrevisao"
                          id="dataPrevisao"
                          value={pedido.dataPrevisao.toISOString().split('T')[0]}
                          onChange={(e) => handleDateChange(e, 'dataPrevisao')}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          required
                        />
                      </div>
                    </div>

                    {/* Product Selection */}
                    <div className="border-t border-gray-200 pt-6">
                      <h4 className="text-lg font-medium text-gray-900 mb-4">Produtos do Pedido</h4>
                      <div className="space-y-4">
                        {pedido.produtos.map((product, index) => (
                          <div key={`${product.id}-${product.tipo}-${index}`} className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                            <div className="flex items-center flex-grow">
                              <p className="text-sm font-medium text-gray-900">
                                {product.SKU && product.SKU !== 'N/A' ? `${product.SKU} - ` : ''}{product.nome}
                              </p>
                              <div className="flex items-center ml-4">
                                <label htmlFor={`quantity-${index}`} className="text-xs text-gray-500 mr-2">Qtd:</label>
                                <input
                                  type="number"
                                  id={`quantity-${index}`}
                                  value={product.quantidade}
                                  onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 0)}
                                  min="0"
                                  className="w-16 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs"
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveProduct(index)}
                              className="text-red-600 hover:text-red-900 ml-4"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Integrated Product Search and Filter */}
                      <div className="mt-6 border-t border-gray-200 pt-6">
                        <h4 className="text-md font-medium leading-6 text-gray-900 mb-2">Adicionar Produtos</h4>
                        <div className="relative mb-4">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                          </div>
                          <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            placeholder="Buscar produto por nome ou SKU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                          />
                        </div>

                        <div className="mb-4 flex space-x-2">
                          <button
                            type="button"
                            className={`px-3 py-1 rounded-md text-sm ${filterType === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                            onClick={() => setFilterType('all')}
                          >
                            Todos
                          </button>
                          <button
                            type="button"
                            className={`px-3 py-1 rounded-md text-sm ${filterType === 'kit' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                            onClick={() => setFilterType('kit')}
                          >
                            Kits
                          </button>
                          <button
                            type="button"
                            className={`px-3 py-1 rounded-md text-sm ${filterType === 'modelo' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                            onClick={() => setFilterType('modelo')}
                          >
                            Modelos
                          </button>
                          <button
                            type="button"
                            className={`px-3 py-1 rounded-md text-sm ${filterType === 'peca' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                            onClick={() => setFilterType('peca')}
                          >
                            Peças
                          </button>
                        </div>

                        <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md">
                          {filteredAndSortedAvailableProducts.length > 0 ? (
                            <ul className="divide-y divide-gray-200">
                              {filteredAndSortedAvailableProducts.map(product => (
                                <li
                                  key={`${product.id}-${product.type}`}
                                  className="p-4 flex justify-between items-center hover:bg-gray-50"
                                >
                                  <div className="flex-grow">
                                    <p className="text-sm font-medium text-gray-900">
                                      {product.SKU && product.SKU !== 'N/A' ? `${product.SKU} - ` : ''}{product.nome}
                                      <span className="text-xs text-gray-500 ml-2">({product.type})</span>
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleAddProduct(product)}
                                    className="text-blue-600 hover:text-blue-800 ml-4"
                                  >
                                    <Plus size={16} />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="p-4 text-center text-gray-500 text-sm">Nenhum produto encontrado.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Totals Summary */}
                    <div className="border-t border-gray-200 pt-6">
                      <h4 className="text-lg font-medium text-gray-900 mb-4">Resumo do Pedido</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Custo Total:</p>
                          <p className="mt-1 text-lg font-bold text-gray-900">R$ {pedido.custos.total.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">Custo de Insumos:</p>
                          <p className="mt-1 text-lg font-bold text-gray-900">R$ {pedido.custos.insumos.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">Custo de Tempo (Impressão + Montagem):</p>
                          <p className="mt-1 text-lg font-bold text-gray-900">R$ {pedido.custos.tempo.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">Custo de Filamento:</p>
                          <p className="mt-1 text-lg font-bold text-gray-900">R$ {pedido.custos.filamento.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">Tempo Total de Impressão:</p>
                          <p className="mt-1 text-lg font-bold text-gray-900">{pedido.tempos.impressao} min</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">Tempo Total de Montagem:</p>
                          <p className="mt-1 text-lg font-bold text-gray-900">{pedido.tempos.montagem} min</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">Consumo Total de Filamento:</p>
                          <p className="mt-1 text-lg font-bold text-gray-900">{pedido.tempos.totalConsumoFilamento} g</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                      <button
                        type="button"
                        className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        onClick={onClose}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        Salvar Pedido
                      </button>
                    </div>
                  </form>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
