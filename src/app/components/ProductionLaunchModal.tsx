import React, { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X } from 'lucide-react';
import { ProductionGroup, Parte, Peca, Modelo, OptimizedGroup } from '../types';
import { db, auth } from '../services/firebase';
import { collection, addDoc, updateDoc, doc, getDoc, getDocs, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { v4 as uuidv4 } from 'uuid';
import ProductionExcessStockModal from './ProductionExcessStockModal'; // Import the new modal

interface ProductionLaunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: OptimizedGroup | null;
  onLaunchSuccess: () => void;
}

export default function ProductionLaunchModal({
  isOpen,
  onClose,
  group,
  onLaunchSuccess,
}: ProductionLaunchModalProps) {
  const [partsToProduce, setPartsToProduce] = useState<
    {
      id: string;
      nome: string;
      quantidadeNecessaria: number;
      quantidadeProduzida: number;
      quantidadePerdida: number;
      hasAssembly: boolean; // Add hasAssembly property
    }[]
  >([]);
  const [isExcessStockModalOpen, setIsExcessStockModalOpen] = useState(false);
  const [excessPartData, setExcessPartData] = useState<{ id: string; nome: string; sku: string; quantidade: number; } | null>(null);
  const [excessLaunchedParts, setExcessLaunchedParts] = useState<string[]>([]);
  const [allPecas, setAllPecas] = useState<Peca[]>([]);
  const [allPartes, setAllPartes] = useState<Parte[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const fetchProductData = async () => {
          try {
            const pecasSnapshot = await getDocs(collection(db, 'pecas'));
            const pecasList = pecasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Peca));
            setAllPecas(pecasList);

            const partesSnapshot = await getDocs(collection(db, 'partes')); // Assuming 'partes' collection exists
            const partesList = partesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Parte));
            setAllPartes(partesList);
          } catch (error) {
            console.error("Error fetching product data: ", error);
          }
        };

        fetchProductData();
      } else {
        // Clear data if user is not authenticated
        setAllPecas([]);
        setAllPartes([]);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (group) {
      const mappedParts = Object.entries(group.partesNoGrupo).map(([id, parteInfo]) => ({
        id: id,
        nome: parteInfo.nome,
        quantidadeNecessaria: parteInfo.quantidade,
        quantidadeProduzida: parteInfo.quantidade, // Default to full production
        quantidadePerdida: 0,
        hasAssembly: allPecas.some(peca => peca.gruposImpressao.some(gi => gi.partes.some(p => p.parteId === id && p.hasAssembly))), // Determine if part has assembly
      }));
      setPartsToProduce(mappedParts);
    }
  }, [group, allPecas]); // Add allPecas to dependency array

  const handleQuantityChange = (
    partId: string,
    field: 'quantidadeProduzida' | 'quantidadePerdida',
    value: number
  ) => {
    setPartsToProduce((prevParts) =>
      prevParts.map((part) =>
        part.id === partId ? { ...part, [field]: value } : part
      )
    );
  };

  const handleLaunchProduction = async () => {
    if (!group) return;

    try {
      let newGroupStatus: ProductionGroup['status'] = 'produzido'; // Default to 'produzido'

      // Determine the new status based on whether any produced part requires assembly
      const anyPartRequiresAssembly = partsToProduce.some(part => part.quantidadeProduzida > 0 && part.hasAssembly);

      if (anyPartRequiresAssembly) {
        newGroupStatus = 'produzido';
      } else {
        newGroupStatus = 'montado'; // If no parts require assembly, they go straight to 'montado'
      }

      const pedidoRef = doc(db, 'pedidos', group.pedidosOrigem[0].pedidoId);
      const pedidoSnap = await getDoc(pedidoRef);

      if (pedidoSnap.exists()) {
        const pedidoData = pedidoSnap.data();
        const updatedGroups = pedidoData.productionGroups.map((g: ProductionGroup) => {
          if (g.id === group.id) {
            const newGroup = { ...g, status: newGroupStatus, completedAt: Timestamp.fromDate(new Date()) };
            // console.log(`[ProductionLaunchModal] handleLaunchProduction: Updating group ${group.id} to status: ${newGroup.status}`); // Removed debug log
            return newGroup;
          }
          return g;
        });
        await updateDoc(pedidoRef, { productionGroups: updatedGroups });
      }

      for (const part of partsToProduce) {
        if (part.quantidadePerdida > 0) {
          if (!part.id) {
            console.error(`Erro: ID da parte indefinido para registro de perda: ${part.nome}. Pulando esta parte.`);
            continue;
          }
      
          const lancamentoPerda = {
            produtoId: part.id,
            tipoProduto: 'parte',
            tipoMovimento: 'saida',
            quantidade: part.quantidadePerdida,
            data: Timestamp.fromDate(new Date()),
            usuario: 'Sistema de Produção',
            observacao: `Perda registrada durante a produção do Pedido #${group.pedidosOrigem[0].pedidoNumero}, Grupo de Impressão ${group.sourceName}`,
            locais: [], // Array vazio para compatibilidade com a função de nuvem
          };
      
          // Corrigido de 'lancamentosEstoque' para 'lancamentosProdutos'
          await addDoc(collection(db, 'lancamentosProdutos'), lancamentoPerda);
        }
      }

      onLaunchSuccess();
      onClose();
    } catch (error) {
      console.error("Error launching production: ", error);
      // Handle error, maybe show a message to the user
    }
  };

  const handleLaunchExcess = async (part: typeof partsToProduce[0]) => {
    if (!group) return;

    const excessQuantity = part.quantidadeProduzida - part.quantidadeNecessaria;
    if (excessQuantity <= 0) return;

    if (!part.id) {
      console.error(`Erro: ID da parte indefinido para lançamento de excedente: ${part.nome}.`);
      return;
    }

    const parteData = allPartes.find(p => p.id === part.id);

    setExcessPartData({
      id: part.id,
      nome: part.nome,
      sku: parteData?.sku || 'N/A',
      quantidade: excessQuantity,
    });
    setIsExcessStockModalOpen(true);
  };

  const handleExcessStockSuccess = () => {
    if (excessPartData) {
      setPartsToProduce(prevParts =>
        prevParts.map(p =>
          p.id === excessPartData.id
            ? { ...p, quantidadeProduzida: p.quantidadeNecessaria }
            : p
        )
      );
      setExcessLaunchedParts(prev => [...prev, excessPartData.id]);
    }
    setIsExcessStockModalOpen(false);
    setExcessPartData(null);
  };

  const handleCloseExcessStockModal = () => {
    setIsExcessStockModalOpen(false);
    setExcessPartData(null);
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
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 flex justify-between items-center"
                >
                  Lançar Produção para Grupo: {group?.sourceName}
                  <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </Dialog.Title>
                <div className="mt-4">
                  {group ? (
                    <form className="space-y-4">
                      <div>
                        <h4 className="text-md font-semibold text-gray-800 mb-2">Itens do Grupo:</h4>
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Item
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Necessário
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Produzido
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Perdido
                                </th>
                                <th className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
                                  Ações
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {partsToProduce.map((part) => (
                                <tr key={part.id || part.nome}><td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {part.nome}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                    {part.quantidadeNecessaria}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                    <input
                                      type="number"
                                      min="0"
                                      value={part.quantidadeProduzida}
                                      onChange={(e) =>
                                        handleQuantityChange(
                                          part.id,
                                          'quantidadeProduzida',
                                          parseInt(e.target.value) || 0
                                        )
                                      }
                                      className="w-20 border-gray-300 rounded-md shadow-sm text-sm"
                                      disabled={excessLaunchedParts.includes(part.id)}
                                    />
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                    <input
                                      type="number"
                                      min="0"
                                      value={part.quantidadePerdida}
                                      onChange={(e) =>
                                        handleQuantityChange(
                                          part.id,
                                          'quantidadePerdida',
                                          parseInt(e.target.value) || 0
                                        )
                                      }
                                      className="w-20 border-gray-300 rounded-md shadow-sm text-sm"
                                    />
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
                                    {part.quantidadeProduzida > part.quantidadeNecessaria && !excessLaunchedParts.includes(part.id) && (
                                      <div className="flex space-x-2">
                                        {part.hasAssembly ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => { /* Logic for assembly not implemented */ }}
                                              className="text-purple-600 hover:text-purple-900"
                                            >
                                              Para Montagem
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleLaunchExcess(part)}
                                              className="text-blue-600 hover:text-blue-900"
                                            >
                                              Para Estoque
                                            </button>
                                          </>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => handleLaunchExcess(part)}
                                            className="text-blue-600 hover:text-blue-900"
                                          >
                                            Lançar Excedente (Estoque)
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
                          type="button"
                          className="inline-flex justify-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                          onClick={handleLaunchProduction}
                        >
                          Concluir Produção
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="text-gray-500">Nenhum grupo de produção selecionado.</p>
                  )}
                </div>
                {isExcessStockModalOpen && excessPartData && (
                  <ProductionExcessStockModal
                    isOpen={isExcessStockModalOpen}
                    onClose={handleCloseExcessStockModal}
                    onLaunchSuccess={handleExcessStockSuccess}
                    partData={excessPartData}
                    onSendToAssembly={() => {}}
                    pecaTipo="simples"
                  />
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
