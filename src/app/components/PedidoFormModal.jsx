"use client";

import { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Search, X, Plus, Minus, Filter, Gift, Box, Puzzle } from 'lucide-react';
import { db } from '../services/firebase';
import { getAuth } from 'firebase/auth';
import { collection, getDocs, query, where, addDoc, Timestamp, doc, getDoc, DocumentReference } from 'firebase/firestore';

// Utility function to replace undefined with null
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const sanitized = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] === undefined) {
      sanitized[key] = null;
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitized[key] = Array.isArray(obj[key]) 
        ? obj[key].map(item => sanitizeObject(item))
        : sanitizeObject(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  });
  
  return sanitized;
};

export default function PedidoFormModal({ isOpen, onClose, onSave, initialData }) {
  const [pedido, setPedido] = useState({
    numero: '',
    comprador: '',
    produtos: [],
  });

  const [produtos, setProdutos] = useState([]);
  const [filteredProdutos, setFilteredProdutos] = useState([]);
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all available produtos
  useEffect(() => {
    const fetchProdutos = async () => {
      try {
        const collections = ['modelos', 'kits', 'pecas'];
        const allProdutos = [];

        for (const collectionName of collections) {
          const q = query(collection(db, collectionName));
          const querySnapshot = await getDocs(q);
          
          const collectionProdutos = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              tipo: collectionName.slice(0, -1), // remove 's' from end
              SKU: data.sku || '', // Ensure SKU is always present, using lowercase 'sku'
              ...data
            };
          });
          
          allProdutos.push(...collectionProdutos);
        }

        setProdutos(allProdutos);
        setFilteredProdutos(allProdutos);
      } catch (error) {
        console.error("Erro ao buscar produtos:", error);
      }
    };

    if (isOpen) {
      fetchProdutos();
    }
  }, [isOpen]);

  // Filter produtos based on tipo and search term
  useEffect(() => {
    let result = produtos;

    // Filter by type
    if (tipoFiltro !== 'todos') {
      result = result.filter(p => p.tipo === tipoFiltro);
    }

    // Filter by search term
    if (searchTerm) {
      const searchTermLower = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.nome.toLowerCase().includes(searchTermLower) || 
        p.SKU.toLowerCase().includes(searchTermLower)
      );
    }

    setFilteredProdutos(result);
  }, [tipoFiltro, produtos, searchTerm]);

  const addProduto = (produto) => {
    const existingProdutoIndex = pedido.produtos.findIndex(p => p.id === produto.id);
    
    if (existingProdutoIndex > -1) {
      // If produto already exists, increment quantity
      const updatedProdutos = [...pedido.produtos];
      updatedProdutos[existingProdutoIndex].quantidade += 1;
      setPedido(prev => ({
        ...prev,
        produtos: updatedProdutos
      }));
    } else {
      // Add new produto with quantity 1
      setPedido(prev => ({
        ...prev,
        produtos: [...prev.produtos, { ...produto, quantidade: 1 }]
      }));
    }
  };

  const updateProdutoQuantidade = (index, quantidade) => {
    const updatedProdutos = [...pedido.produtos];
    updatedProdutos[index].quantidade = quantidade;
    setPedido(prev => ({
      ...prev,
      produtos: updatedProdutos
    }));
  };

  const removeProduto = (index) => {
    const updatedProdutos = pedido.produtos.filter((_, i) => i !== index);
    setPedido(prev => ({
      ...prev,
      produtos: updatedProdutos
    }));
  };

    const handleSubmit = async (e) => {
      e.preventDefault();

      const auth = getAuth();
      const currentUser = auth.currentUser;
      const usuarioId = currentUser ? currentUser.uid : 'fallback_user_id';

      console.log("Iniciando criação de pedido...");

      // Fetch detailed product information for each produto
      const detailedProdutos = await Promise.all(pedido.produtos.map(async (p, index) => {
        console.log(`Processando produto ${index + 1}/${pedido.produtos.length}: ${p.nome} (${p.tipo})`);
        let detailedProduct = {};
        
        // Fetch detailed product information based on tipo
        const collectionName = p.tipo + 's'; // Convert tipo to collection name
        const docRef = doc(db, collectionName, p.id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          detailedProduct = docSnap.data();
          console.log(`Detalhes do produto ${p.nome} obtidos com sucesso`);
        } else {
          console.error(`Produto ${p.nome} (${p.id}) não encontrado na coleção ${collectionName}`);
        }

        const result = {
          produtoId: p.id,
          tipo: p.tipo,
          nomeProduto: p.nome,
          skuProduto: p.SKU,
          quantidade: p.quantidade,
          statusProducaoItem: 'aguardando_producao',
          custoUnitario: detailedProduct.custoUnitario || null,
          tempoImpressaoEstimado: detailedProduct.tempoImpressaoEstimado || null,
          tempoMontagemEstimado: detailedProduct.tempoMontagemEstimado || null,
          sourceType: detailedProduct.sourceType || null,
          
          // Adicionar informações hierárquicas detalhadas
          modelosComponentes: [],
          pecasComponentes: [],
          insumosNecessarios: detailedProduct.insumosNecessarios || [],
        };

        // Process components based on product type
        if (p.tipo === 'kit') {
          // Process components from kit's 'componentes' array
          for (const componentItem of (detailedProduct.componentes || [])) {
            if (componentItem.tipo === 'modelo') {
              // Process modelo component
              const modeloId = componentItem.id;
              const modeloQuantity = componentItem.quantidade || 1;
              const modeloSku = componentItem.sku || '';
              const modeloNome = componentItem.nome || '';

              const modeloDocRef = doc(db, 'modelos', modeloId);
              const modeloDocSnap = await getDoc(modeloDocRef);
              let detailedModelo = {};
              if (modeloDocSnap.exists()) {
                detailedModelo = modeloDocSnap.data();
              } else {
                console.error(`Modelo ${modeloNome} (${modeloId}) não encontrado na coleção 'modelos' para kit ${p.nome}`);
                continue;
              }

                  console.log(`DEBUG: detailedModelo.pecas para modelo ${modeloNome}:`, detailedModelo.pecas);
                  const pecasDoModeloPromises = (detailedModelo.pecas || []).map(async (pecaItem) => {
                    let pecaId;
                    let pecaQuantity = 1;
                    let pecaSku = '';
                    let pecaNome = '';

                    if (pecaItem instanceof DocumentReference) {
                      pecaId = pecaItem.id;
                    } else if (pecaItem && typeof pecaItem === 'object' && 'id' in pecaItem && typeof pecaItem.id === 'string' && pecaItem.id.length > 0) {
                      pecaId = String(pecaItem.id);
                      pecaQuantity = pecaItem.quantidade || 1;
                      pecaSku = pecaItem.SKU || '';
                      pecaNome = pecaItem.nome || '';
                    } else if ('pecaId' in pecaItem && typeof pecaItem.pecaId === 'string' && pecaItem.pecaId.length > 0) {
                      pecaId = String(pecaItem.pecaId);
                      pecaQuantity = pecaItem.quantidade || 1;
                      pecaSku = pecaItem.SKU || '';
                      pecaNome = pecaItem.nome || '';
                    } else if (typeof pecaItem === 'string' && pecaItem.length > 0) {
                      pecaId = pecaItem;
                    } else {
                      console.warn(`Componente de peça inválido encontrado para modelo ${modeloNome} dentro de kit ${p.nome}:`, pecaItem);
                      return null;
                    }

                    const pecaDocRef = doc(db, 'pecas', pecaId);
                    const pecaDocSnap = await getDoc(pecaDocRef);
                    let detailedPeca = {};
                    if (pecaDocSnap.exists()) {
                      detailedPeca = pecaDocSnap.data();
                    } else {
                      console.error(`Peça ${pecaNome} (${pecaId}) não encontrada na coleção 'pecas' para modelo ${modeloNome} dentro de kit ${p.nome}`);
                      return null;
                    }

                    return {
                      id: pecaId,
                      SKU: detailedPeca.sku || pecaSku,
                      nome: detailedPeca.nome || pecaNome,
                      tipo: 'peca',
                      quantidade: pecaQuantity * modeloQuantity * p.quantidade,
                      custoUnitario: detailedPeca.custoUnitario || null,
                      tipoPecaDetalhado: detailedPeca.tipoPeca || null,
                      tempoImpressaoEstimado: detailedPeca.tempoImpressaoEstimado || null,
                      tempoMontagemEstimado: detailedPeca.tempoMontagemEstimado || null,
                      gruposImpressao: Array.isArray(detailedPeca.gruposImpressao) ? detailedPeca.gruposImpressao : [],
                      insumosNecessarios: Array.isArray(detailedPeca.insumosNecessarios) ? detailedPeca.insumosNecessarios : []
                    };
                  });
                  console.log('DEBUG: pecasDoModeloPromises:', pecasDoModeloPromises);
                  const resolvedPecas = await Promise.all(pecasDoModeloPromises);
                  console.log('DEBUG: resolvedPecas before filter:', resolvedPecas);
                  const pecasDoModelo = resolvedPecas.filter(Boolean);

              result.modelosComponentes.push({
                produtoId: modeloId,
                tipo: 'modelo',
                nomeProduto: detailedModelo.nome || modeloNome,
                skuProduto: detailedModelo.SKU || modeloSku,
                quantidade: modeloQuantity * p.quantidade,
                custoUnitario: detailedModelo.custoUnitario || null,
                tempoImpressaoEstimado: detailedModelo.tempoImpressaoEstimado || null,
                tempoMontagemEstimado: detailedModelo.tempoMontagemEstimado || null,
                sourceType: detailedModelo.sourceType || null,
                pecasComponentes: pecasDoModelo
              });

            } else if (componentItem.tipo === 'peca') {
              // Process peca component (direct child of kit)
              const pecaId = componentItem.id;
              const pecaQuantity = componentItem.quantidade || 1;
              const pecaSku = componentItem.sku || '';
              const pecaNome = componentItem.nome || '';

              const pecaDocRef = doc(db, 'pecas', pecaId);
              const pecaDocSnap = await getDoc(pecaDocRef);
              let detailedPeca = {};
              if (pecaDocSnap.exists()) {
                detailedPeca = pecaDocSnap.data();
              } else {
                console.error(`Peça ${pecaNome} (${pecaId}) não encontrada na coleção 'pecas' para kit ${p.nome}`);
                continue;
              }

              result.pecasComponentes.push({
                id: pecaId,
                SKU: detailedPeca.sku || pecaSku,
                nome: detailedPeca.nome || pecaNome,
                tipo: 'peca',
                quantidade: pecaQuantity * p.quantidade,
                custoUnitario: detailedPeca.custoUnitario || null,
                tipoPecaDetalhado: detailedPeca.tipoPeca || null,
                tempoImpressaoEstimado: detailedPeca.tempoImpressaoEstimado || null,
                tempoMontagemEstimado: detailedPeca.tempoMontagemEstimado || null,
                gruposImpressao: Array.isArray(detailedPeca.gruposImpressao) ? detailedPeca.gruposImpressao : [],
                insumosNecessarios: Array.isArray(detailedPeca.insumosNecessarios) ? detailedPeca.insumosNecessarios : []
              });
            } else {
              console.warn(`Tipo de componente desconhecido para kit ${p.nome}:`, componentItem);
            }
          }
        } else if (p.tipo === 'modelo') {
          // Process pecas for a top-level model
          let pecas = detailedProduct.pecas || [];
          if (pecas.length === 0) {
            try {
              const pecasQuery = query(collection(db, 'pecas'), where('modeloId', '==', p.id));
              const pecasSnapshot = await getDocs(pecasQuery);
              if (!pecasSnapshot.empty) {
                pecas = pecasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              }
            } catch (error) {
              console.error(`Erro ao buscar peças relacionadas ao modelo ${p.nome}:`, error);
            }
          }

          for (const pecaItem of pecas) {
            let pecaId;
            let pecaQuantity = 1;
            let pecaSku = '';
            let pecaNome = '';

            if (pecaItem instanceof DocumentReference) {
              pecaId = pecaItem.id;
            } else if (pecaItem && typeof pecaItem === 'object') {
              if ('id' in pecaItem && typeof pecaItem.id === 'string' && pecaItem.id.length > 0) {
                pecaId = String(pecaItem.id);
                pecaQuantity = pecaItem.quantidade || 1;
                pecaSku = pecaItem.SKU || '';
                pecaNome = pecaItem.nome || '';
              } else if ('pecaId' in pecaItem && typeof pecaItem.pecaId === 'string' && pecaItem.pecaId.length > 0) {
                pecaId = String(pecaItem.pecaId);
                pecaQuantity = pecaItem.quantidade || 1;
                pecaSku = pecaItem.SKU || '';
                pecaNome = pecaItem.nome || '';
              } else {
                console.warn(`Componente de peça inválido encontrado para modelo ${p.nome}:`, pecaItem);
                continue;
              }
            } else if (typeof pecaItem === 'string' && pecaItem.length > 0) {
              pecaId = pecaItem;
            } else {
              console.warn(`Componente de peça inválido encontrado para modelo ${p.nome}:`, pecaItem);
              continue;
            }

            const pecaDocRef = doc(db, 'pecas', pecaId);
            const pecaDocSnap = await getDoc(pecaDocRef);
            let detailedPeca = {};
            if (pecaDocSnap.exists()) {
              detailedPeca = pecaDocSnap.data();
            } else {
              console.error(`Peça ${pecaNome} (${pecaId}) não encontrada na coleção 'pecas' para modelo ${p.nome}`);
              continue;
            }

            result.pecasComponentes.push({
              id: pecaId,
              SKU: detailedPeca.sku || pecaSku,
              nome: detailedPeca.nome || pecaNome,
              tipo: 'peca',
              quantidade: pecaQuantity * p.quantidade,
              custoUnitario: detailedPeca.custoUnitario || null,
              tipoPecaDetalhado: detailedPeca.tipoPeca || null,
              tempoImpressaoEstimado: detailedPeca.tempoImpressaoEstimado || null,
              tempoMontagemEstimado: detailedPeca.tempoMontagemEstimado || null,
              gruposImpressao: Array.isArray(detailedPeca.gruposImpressao) ? detailedPeca.gruposImpressao : [],
              insumosNecessarios: Array.isArray(detailedPeca.insumosNecessarios) ? detailedPeca.insumosNecessarios : []
            });
          }
        } else if (p.tipo === 'peca') {
          // Process a top-level piece
          result.pecasComponentes.push({
            id: p.id,
            SKU: detailedProduct.sku || p.SKU || '',
            nome: detailedProduct.nome || p.nome || `Peça ${p.id}`,
            tipo: 'peca',
            quantidade: p.quantidade,
            custoUnitario: detailedProduct.custoUnitario || null,
            tipoPecaDetalhado: detailedProduct.tipoPeca || null,
            tempoImpressaoEstimado: detailedProduct.tempoImpressaoEstimado || null,
            tempoMontagemEstimado: detailedProduct.tempoMontagemEstimado || null,
            gruposImpressao: Array.isArray(detailedProduct.gruposImpressao) ? detailedProduct.gruposImpressao : [],
            insumosNecessarios: Array.isArray(detailedProduct.insumosNecessarios) ? detailedProduct.insumosNecessarios : []
          });
        }

        return result;
      }));

      // Verificar se todos os produtos do tipo 'modelo' têm pecasComponentes
      for (const produto of detailedProdutos) {
        if (produto.tipo === 'modelo') {
          if (!produto.pecasComponentes) {
            console.error(`ERRO CRÍTICO: Produto ${produto.nomeProduto} (${produto.tipo}) tem pecasComponentes undefined!`);
            // Inicializar como array vazio para evitar erros
            produto.pecasComponentes = [];
          } else if (!Array.isArray(produto.pecasComponentes)) {
            console.error(`ERRO CRÍTICO: Produto ${produto.nomeProduto} (${produto.tipo}) tem pecasComponentes que não é um array!`, produto.pecasComponentes);
            // Converter para array vazio para evitar erros
            produto.pecasComponentes = [];
          } else if (produto.pecasComponentes.length === 0) {
            console.warn(`ALERTA: Produto ${produto.nomeProduto} (${produto.tipo}) tem pecasComponentes vazio!`);
          } else {
            console.log(`Produto ${produto.nomeProduto} tem ${produto.pecasComponentes?.length || 0} peças componentes`);
          }
        }
      }

      console.log("Produtos processados com sucesso");

      const simplifiedPedido = sanitizeObject({
        numero: pedido.numero,
        comprador: pedido.comprador,
        produtos: detailedProdutos,
        status: 'aguardando',
        dataCriacao: Timestamp.now(),
        dataPrevisao: Timestamp.now(), // Pode ser ajustado conforme necessário
      });

      try {
        console.log("Salvando pedido no Firestore...");
        const docRef = await addDoc(collection(db, 'pedidos'), simplifiedPedido);
        console.log(`Pedido salvo com ID: ${docRef.id}`);
        
        // Verificar e garantir que todos os produtos do tipo 'modelo' tenham pecasComponentes como array
        const produtosVerificados = await Promise.all(detailedProdutos.map(async produto => {
          if (produto.tipo === 'modelo') {
            // Se pecasComponentes não for um array ou estiver vazio, tente buscar novamente
            if (!Array.isArray(produto.pecasComponentes) || produto.pecasComponentes.length === 0) {
              console.warn(`Corrigindo pecasComponentes para o produto ${produto.nomeProduto}`);
              
              // Tentar buscar peças diretamente do modelo
              const modeloDocRef = doc(db, 'modelos', produto.produtoId);
              const modeloDocSnap = await getDoc(modeloDocRef);
              
              if (modeloDocSnap.exists()) {
                const modeloData = modeloDocSnap.data();
                console.log(`Buscando peças diretamente do modelo ${produto.nomeProduto}`);
                
                if (modeloData.pecas && modeloData.pecas.length > 0) {
                  // Processar peças encontradas
                  const pecasComponentes = await Promise.all(modeloData.pecas.map(async pecaItem => {
                    try {
                      let pecaId;
                      let pecaQuantity = 1;
                      
                      // Determinar o ID da peça com base no formato
                      if (pecaItem instanceof DocumentReference) {
                        pecaId = pecaItem.id;
                      } else if (pecaItem && typeof pecaItem === 'object') {
                        if ('id' in pecaItem && typeof pecaItem.id === 'string') {
                          pecaId = pecaItem.id;
                          pecaQuantity = pecaItem.quantidade || 1;
                        } else if ('pecaId' in pecaItem && typeof pecaItem.pecaId === 'string') {
                          pecaId = pecaItem.pecaId;
                          pecaQuantity = pecaItem.quantidade || 1;
                        } else {
                          return null;
                        }
                      } else if (typeof pecaItem === 'string') {
                        pecaId = pecaItem;
                      } else {
                        return null;
                      }
                      
                      // Buscar detalhes da peça
                      const pecaDocRef = doc(db, 'pecas', pecaId);
                      const pecaDocSnap = await getDoc(pecaDocRef);
                      let detailedPeca = {};
                      
                      if (pecaDocSnap.exists()) {
                        detailedPeca = pecaDocSnap.data();
                      }
                      
                      return {
                        id: pecaId,
                        SKU: detailedPeca.sku || '',
                        nome: detailedPeca.nome || `Peça ${pecaId}`,
                        tipo: 'peca',
                        quantidade: pecaQuantity * produto.quantidade,
                        custoUnitario: detailedPeca.custoUnitario || null,
                        tipoPecaDetalhado: detailedPeca.tipoPeca || null,
                        tempoImpressaoEstimado: detailedPeca.tempoImpressaoEstimado || null,
                        tempoMontagemEstimado: detailedPeca.tempoMontagemEstimado || null,
                        gruposImpressao: Array.isArray(detailedPeca.gruposImpressao) ? detailedPeca.gruposImpressao : [],
                        insumosNecessarios: Array.isArray(detailedPeca.insumosNecessarios) ? detailedPeca.insumosNecessarios : []
                      };
                    } catch (error) {
                      console.error(`Erro ao processar peça:`, error);
                      return null;
                    }
                  }));
                  
                  const filteredPecas = pecasComponentes.filter(Boolean);
                  console.log(`Recuperadas ${filteredPecas.length} peças para o modelo ${produto.nomeProduto}`);
                  
                  if (filteredPecas.length > 0) {
                    return {
                      ...produto,
                      pecasComponentes: filteredPecas
                    };
                  }
                }
              }
              
              // Se não conseguiu recuperar peças, retorna com array vazio
              return {
                ...produto,
                pecasComponentes: []
              };
            }
          }
          return produto;
        }));
        
        // Log final para verificar se todos os produtos do tipo 'modelo' têm pecasComponentes
        for (const produto of produtosVerificados) {
          if (produto.tipo === 'modelo') {
            console.log(`VERIFICAÇÃO FINAL: Produto ${produto.nomeProduto} tem ${produto.pecasComponentes?.length || 0} peças componentes`);
          }
        }
        
        const lancamentoProducaoPayload = sanitizeObject({
          tipoEvento: 'criacao_pedido',
          timestamp: Timestamp.now(),
          usuarioId: usuarioId,
          pedidoId: docRef.id,
          pedidoNumero: pedido.numero,
          payload: {
            pedidoId: docRef.id,
            pedidoNumero: pedido.numero,
            produtos: produtosVerificados
          },
          status: 'aguardando'
        });

        console.log("Criando lançamento de produção...");
        const lancamentoRef = await addDoc(collection(db, 'lancamentosProducao'), lancamentoProducaoPayload);
        console.log(`Lançamento de produção criado com ID: ${lancamentoRef.id}`);

        onSave({ id: docRef.id, ...simplifiedPedido });
        onClose();
      } catch (error) {
        console.error("Erro ao salvar pedido:", error);
        // Optionally, show an error message to the user
      }
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
          <div className="fixed inset-0 bg-black/25" />
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
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 mb-4">
                  Novo Pedido
                </Dialog.Title>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <label htmlFor="numero" className="block text-sm font-medium text-gray-700">
                        Número do Pedido
                      </label>
                      <input
                        type="text"
                        id="numero"
                        value={pedido.numero}
                        onChange={(e) => setPedido(prev => ({ ...prev, numero: e.target.value }))}
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
                        id="comprador"
                        value={pedido.comprador}
                        onChange={(e) => setPedido(prev => ({ ...prev, comprador: e.target.value }))}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Itens do Pedido */}
                    <div>
                      <h4 className="text-md font-semibold mb-2">Itens do Pedido</h4>
                      {pedido.produtos.length === 0 ? (
                        <div className="text-center text-gray-500 py-4 border rounded">
                          Nenhum produto adicionado
                        </div>
                      ) : (
                        <table className="min-w-full divide-y divide-gray-200 border rounded">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU - Nome</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantidade</th>
                              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {pedido.produtos.map((produto, index) => (
                              <tr key={`${produto.id}-${index}`} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-medium text-gray-900">{produto.SKU ? `${produto.SKU} - ` : ''}{produto.nome}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    {produto.tipo === 'kit' && <Gift className="h-5 w-5 text-blue-500" />}
                                    {produto.tipo === 'modelo' && <Box className="h-5 w-5 text-green-500" />}
                                    {produto.tipo === 'peca' && <Puzzle className="h-5 w-5 text-red-500" />}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center space-x-2">
                                    <button 
                                      type="button"
                                      onClick={() => updateProdutoQuantidade(index, Math.max(1, produto.quantidade - 1))}
                                      className="bg-gray-200 rounded-full w-6 h-6 flex items-center justify-center"
                                    >
                                      <Minus size={16} />
                                    </button>
                                    <span className="text-sm">{produto.quantidade}</span>
                                    <button 
                                      type="button"
                                      onClick={() => updateProdutoQuantidade(index, produto.quantidade + 1)}
                                      className="bg-gray-200 rounded-full w-6 h-6 flex items-center justify-center"
                                    >
                                      <Plus size={16} />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <button 
                                    type="button"
                                    onClick={() => removeProduto(index)}
                                    className="text-red-500 hover:bg-red-100 rounded-full p-1"
                                  >
                                    <X size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Selecione os produtos */}
                    <div>
                      <h4 className="text-md font-semibold mb-2">Selecione os produtos:</h4>
                      <div className="mb-4 flex space-x-2">
                        <div className="flex-grow">
                          <input 
                            type="text"
                            placeholder="Buscar produto"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <select 
                          value={tipoFiltro}
                          onChange={(e) => setTipoFiltro(e.target.value)}
                          className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        >
                          <option value="todos">Todos</option>
                          <option value="modelo">Modelos</option>
                          <option value="peca">Peças</option>
                          <option value="kit">Kits</option>
                        </select>
                      </div>

                      <table className="min-w-full divide-y divide-gray-200 border rounded">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU - Nome</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredProdutos.map((produto) => (
                            <tr key={produto.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{produto.SKU ? `${produto.SKU} - ` : ''}{produto.nome}</div>
                              </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    {produto.tipo === 'kit' && <Gift className="h-5 w-5 text-blue-500" />}
                                    {produto.tipo === 'modelo' && <Box className="h-5 w-5 text-green-500" />}
                                    {produto.tipo === 'peca' && <Puzzle className="h-5 w-5 text-red-500" />}
                                  </div>
                                </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <button 
                                  type="button"
                                  onClick={() => addProduto(produto)}
                                  className="text-green-500 hover:bg-green-100 rounded-full p-1"
                                >
                                  <Plus size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex justify-end mt-4 space-x-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={pedido.produtos.length === 0}
                      className={`inline-flex justify-center rounded-md border border-transparent px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 
                        ${pedido.produtos.length === 0 
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                          : 'bg-blue-100 text-blue-900 hover:bg-blue-200 focus-visible:ring-blue-500'}`}
                    >
                      Criar Pedido
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
